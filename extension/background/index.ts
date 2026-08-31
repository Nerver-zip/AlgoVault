import { fetchUserProfile, fetchSolvedProblems, fetchAllSubmissions, fetchSubmissionDetails, fetchSubmissionDetailsBatch, fetchProblemSubmissionPages, fetchContestHistory, fetchProblemMetadata, fetchUserStatus, fetchContestQuestions, fetchReplayEvents, fetchUpcomingContests, fetchPastContests, LeetCodeApiError, type ProblemSubmissionRequest } from "../lib/api/leetcode"
import { getUserSettings, getUsername, setLastSync, setUsername, storage, getGithubPat, getGithubRepo, getGithubBranch, getGithubBasePath, getGithubAutoSync, setGithubAutoSync, getZerotracData, getZerotracLastFetched, setZerotracData, clearGithubAuth, clearJwtToken } from "../lib/storage"
import { commitToGithub, batchCommitToGithub, getExtensionForLanguage, getGithubTreePaths } from "../lib/api/github"
import { analyzeComplexity } from "../lib/complexity"
import { joinGithubPath } from "../lib/github-path"
import { type LeetCodeRegion } from "../lib/api/entranthub"
import {
  fetchPrediction,
  sendSelfReport,
  sendSubmissionResult,
  fetchContests,
  syncLeetcode,

  fetchZerotracRatingsBackend,
  addToVault
} from "../lib/api/backend"
import { createSession, transitionSession } from "../lib/session-engine/EngineKernel"
import { normalizeZerotracPayload } from "../lib/zerotrac"
import { PROBLEM_SLUG_TO_COMPANIES } from "../lib/company-data"
import { STORAGE_KEYS } from "../lib/constants"
import { partitionGithubArtifacts } from "../lib/github-batching"
import { acceptedProblemCount, requireCompleteSolvedProblemList, SOLVED_PROBLEM_CACHE_SOURCE } from "../lib/leetcode-history"
import { findProblemsMissingFromGithub } from "../lib/github-reconciliation"
import { buildGithubDashboardReadme } from "../lib/github-dashboard"

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error))

function safeBroadcast(message: any) {
  try {
    chrome.runtime.sendMessage(message).catch(() => {})
  } catch {}
}

let isSyncing = false;
let syncAbortController: AbortController | null = null;
let githubWriteQueue: Promise<void> = Promise.resolve()

const ACTIVE_SESSION_KEY = "algovault.session.active"
const LOGS_INDEX_KEY = "algovault.logs.index"

// ─── APSE v2 BACKGROUND COORDINATOR ─────────────────────────────────

/**
 * Archive completed or paused session to monthly log bucket and index
 */
async function archivePracticeLog(sessionInput: any, isSolved: boolean, language?: string) {
  if (!sessionInput) return
  let session: any = sessionInput
  if (typeof sessionInput === "string") {
    try {
      session = JSON.parse(sessionInput)
    } catch {
      return
    }
  }
  if (!session || !session.slug) return

  const now = Date.now()
  const tElapsedStart = typeof session.tElapsedStart === "number" && !isNaN(session.tElapsedStart) ? session.tElapsedStart : now
  const elapsedSecs = Math.floor(Math.max(0, now - tElapsedStart - (session.accPausedMs || 0)) / 1000)

  const accActiveMs = typeof session.accActiveMs === "number" && !isNaN(session.accActiveMs) ? session.accActiveMs : 0
  const activeOrigin = (typeof session.tActiveStart === "number" && !isNaN(session.tActiveStart))
    ? session.tActiveStart
    : tElapsedStart
  const currentSegmentMs = session.st === "RUNNING" ? Math.max(0, now - activeOrigin) : 0
  
  let activeSecs = Math.max(0, Math.floor((accActiveMs + currentSegmentMs) / 1000))
  if (activeSecs <= 0) {
    if (elapsedSecs > 0) {
      activeSecs = Math.max(1, elapsedSecs)
    } else if (isSolved || session.st === "SOLVED") {
      activeSecs = 1
    } else {
      return
    }
  }

  const focusScore = elapsedSecs > 0 ? Math.min(100, Math.round((activeSecs / Math.max(1, elapsedSecs)) * 100)) : 100

  const logId = session.id || String(tElapsedStart)
  const logItem = {
    v: 2,
    logId,
    sessionId: session.id,
    slug: session.slug,
    startedAt: new Date(tElapsedStart).toISOString(),
    completedAt: (isSolved || session.st === "SOLVED") ? new Date(now).toISOString() : undefined,
    activeSeconds: activeSecs,
    elapsedSeconds: Math.max(activeSecs, elapsedSecs),
    focusScore,
    tabSwitches: session.tabs || 0,
    pasteCount: session.pastes || 0,
    isSolved: !!isSolved || session.st === "SOLVED",
    language: language || undefined
  }

  const dateObj = new Date(tElapsedStart)
  const monthKey = `algovault.logs.${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, "0")}`

  try {
    const [existingMonthLogs, existingIndex] = await Promise.all([
      storage.get<any[]>(monthKey).then((res) => (Array.isArray(res) ? res : [])),
      storage.get<string[]>(LOGS_INDEX_KEY).then((res) => (Array.isArray(res) ? res : []))
    ])

    const updatedMonthLogs = existingMonthLogs.filter((item) => item.logId !== logId && item.sessionId !== session.id)
    updatedMonthLogs.push(logItem)
    await storage.set(monthKey, updatedMonthLogs)

    if (!existingIndex.includes(monthKey)) {
      existingIndex.push(monthKey)
      existingIndex.sort().reverse()
      await storage.set(LOGS_INDEX_KEY, existingIndex)
    }
  } catch (err) {
    console.error("[APSE v2] Failed to archive practice log:", err)
  }
}

// ─── APSE v2 SYNC & TELEMETRY LISTENERS ──────────────────────────────

// Storage Event Relay for Multi-Tab Sync
storage.watch({
  [ACTIVE_SESSION_KEY]: (change) => {
    if (change.newValue !== undefined) {
      safeBroadcast({ action: "session_updated_v2", session: change.newValue })
    }
  }
})

// Chrome Tab Activation Listener for 100% Accurate Tab Switch Detection
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const active = await storage.get<any>(ACTIVE_SESSION_KEY)
  if (active && active.st === "RUNNING" && active.ownerTabId && active.ownerTabId !== activeInfo.tabId) {
    const updatedSession = { ...active, tabs: (active.tabs || 0) + 1 }
    const updated = transitionSession(updatedSession, "PAUSED", "TAB", Date.now())
    await storage.set(ACTIVE_SESSION_KEY, updated)
    await archivePracticeLog(updated, updated.st === "SOLVED")
    safeBroadcast({ action: "session_updated_v2", session: updated })
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "open_side_panel" && sender.tab) {
    chrome.sidePanel.open({ windowId: sender.tab.windowId })
  }

  // The company dataset is intentionally held by the service worker rather
  // than injected into every LeetCode problem page.
  if (message.action === "get_companies_for_problem") {
    const slug = typeof message.slug === "string" ? message.slug.trim().toLowerCase() : ""
    if (!slug || slug.length > 200 || !/^[a-z0-9-]+$/.test(slug)) {
      sendResponse({ evidences: [] })
      return false
    }

    const evidences = (PROBLEM_SLUG_TO_COMPANIES.get(slug) || []).map((entry) => ({
      companyName: entry.companyName,
      frequencyScore: entry.frequencyScore,
      timeframeLabel: entry.timeframeLabel
    }))
    sendResponse({ evidences })
    return false
  }

  // APSE v2 State Machine Message Interceptors
  if (message.action === "claim_tab_ownership") {
    const tabId = sender.tab?.id || null
    storage.get<any>(ACTIVE_SESSION_KEY).then(async (session) => {
      if (!session) {
        sendResponse({ ok: false })
        return
      }
      if (tabId && session.ownerTabId === tabId && session.st === "RUNNING") {
        sendResponse({ ok: true, session })
        return
      }
      if ((session.st === "PAUSED" && session.pr === "MANUAL") || session.st === "SOLVED") {
        const updated = { ...session, ownerTabId: tabId || session.ownerTabId }
        await storage.set(ACTIVE_SESSION_KEY, updated)
        sendResponse({ ok: true, session: updated })
        return
      }

      const isTabSwitch = session.pr === "TAB" || (session.ownerTabId !== null && tabId !== null && session.ownerTabId !== tabId)
      const transitioned = transitionSession(session, "RUNNING", null, Date.now())
      const updated = {
        ...transitioned,
        ownerTabId: tabId || session.ownerTabId,
        tabs: isTabSwitch ? (session.tabs || 0) + 1 : (session.tabs || 0)
      }
      await storage.set(ACTIVE_SESSION_KEY, updated)
      safeBroadcast({ action: "session_updated_v2", session: updated })
      sendResponse({ ok: true, session: updated })
    })
    return true
  }

  if (message.action === "session_start_v2") {
    const slug = message.slug
    if (!slug) {
      sendResponse({ ok: false })
      return true
    }
    const tabId = sender.tab?.id || null
    const now = Date.now()
    const storeKey = "algovault.session.store"

    storage.get<any>(ACTIVE_SESSION_KEY).then(async (existingSession) => {
      // 1. If active session is for the exact same slug, preserve it (DO NOT auto-restart if SOLVED or MANUAL PAUSE)!
      if (existingSession && existingSession.slug === slug) {
        if (existingSession.st === "RUNNING" || (existingSession.st === "PAUSED" && existingSession.pr === "MANUAL") || existingSession.st === "SOLVED") {
          const finalSession = { ...existingSession, ownerTabId: tabId || existingSession.ownerTabId }
          await storage.set(ACTIVE_SESSION_KEY, finalSession)
          sendResponse({ ok: true, session: finalSession })
          return
        }
        const updated = transitionSession(existingSession, "RUNNING", null, now)
        const finalSession = { ...updated, ownerTabId: tabId || existingSession.ownerTabId }
        await storage.set(ACTIVE_SESSION_KEY, finalSession)
        safeBroadcast({ action: "session_updated_v2", session: finalSession })
        sendResponse({ ok: true, session: finalSession })
        return
      }

      // 2. Manage multi-problem switching using per-slug store
      const store = (await storage.get<Record<string, any>>(storeKey)) || {}

      if (existingSession && existingSession.slug) {
        let pausedSession: any
        if ((existingSession.st === "PAUSED" && existingSession.pr === "MANUAL") || existingSession.st === "SOLVED") {
          pausedSession = existingSession
        } else {
          pausedSession = transitionSession(existingSession, "PAUSED", "TAB", now)
        }
        store[existingSession.slug] = pausedSession
        await archivePracticeLog(pausedSession, existingSession.st === "SOLVED")
      }

      let sessionForSlug = store[slug]
      if (sessionForSlug) {
        if ((sessionForSlug.st === "PAUSED" && sessionForSlug.pr === "MANUAL") || sessionForSlug.st === "SOLVED") {
          sessionForSlug = { ...sessionForSlug, ownerTabId: tabId }
        } else {
          sessionForSlug = {
            ...transitionSession(sessionForSlug, "RUNNING", null, now),
            ownerTabId: tabId
          }
        }
        delete store[slug]
      } else {
        sessionForSlug = createSession(slug, tabId, now)
      }

      await Promise.all([
        storage.set(ACTIVE_SESSION_KEY, sessionForSlug),
        storage.set(storeKey, store)
      ])
      safeBroadcast({ action: "session_updated_v2", session: sessionForSlug })
      sendResponse({ ok: true, session: sessionForSlug })
    })
    return true
  }

  if (message.action === "session_pause_v2") {
    const reason = message.reason || "MANUAL"
    storage.get<any>(ACTIVE_SESSION_KEY).then(async (session) => {
      if (!session) {
        sendResponse({ ok: false })
        return
      }
      const isTabSwitch = reason === "TAB"
      const sessionWithTabs = isTabSwitch ? { ...session, tabs: (session.tabs || 0) + 1 } : session
      const updated = transitionSession(sessionWithTabs, "PAUSED", reason, Date.now())
      await storage.set(ACTIVE_SESSION_KEY, updated)
      await archivePracticeLog(updated, updated.st === "SOLVED")
      safeBroadcast({ action: "session_updated_v2", session: updated })
      sendResponse({ ok: true, session: updated })
    })
    return true
  }

  if (message.action === "session_resume_v2") {
    const tabId = sender.tab?.id || null
    storage.get<any>(ACTIVE_SESSION_KEY).then(async (session) => {
      if (!session) {
        sendResponse({ ok: false })
        return
      }
      const transitioned = transitionSession(session, "RUNNING", null, Date.now())
      const updated = {
        ...transitioned,
        ownerTabId: tabId || session.ownerTabId
      }
      await storage.set(ACTIVE_SESSION_KEY, updated)
      safeBroadcast({ action: "session_updated_v2", session: updated })
      sendResponse({ ok: true, session: updated })
    })
    return true
  }

  if (message.action === "session_reset_v2") {
    const storeKey = "algovault.session.store"
    storage.get<any>(ACTIVE_SESSION_KEY).then(async (active) => {
      const slug = active?.slug
      await storage.remove(ACTIVE_SESSION_KEY)
      if (slug) {
        const store = (await storage.get<Record<string, any>>(storeKey)) || {}
        delete store[slug]
        await storage.set(storeKey, store)
      }
      safeBroadcast({ action: "session_updated_v2", session: null })
      sendResponse({ ok: true, session: null })
    })
    return true
  }

  if (message.action === "session_finish_v2") {
    storage.get<any>(ACTIVE_SESSION_KEY).then(async (session) => {
      if (!session) {
        sendResponse({ ok: false })
        return
      }
      // If submission_result already transitioned this to SOLVED, skip duplicate work
      if (session.st === "SOLVED") {
        sendResponse({ ok: true, session })
        return
      }
      const updated = transitionSession(session, "SOLVED", null, Date.now())
      await archivePracticeLog(updated, true, message.language)
      await storage.set(ACTIVE_SESSION_KEY, updated)
      
      safeBroadcast({ action: "session_updated_v2", session: updated })
      sendResponse({ ok: true, session: updated })
    })
    return true
  }

  if (message.action === "session_log_time_v2") {
    storage.get<any>(ACTIVE_SESSION_KEY).then(async (session) => {
      if (!session) {
        sendResponse({ ok: false })
        return
      }
      const updated = transitionSession(session, session.st === "SOLVED" ? "SOLVED" : (session.st === "RUNNING" ? "RUNNING" : "PAUSED"), session.pr, Date.now())
      await storage.set(ACTIVE_SESSION_KEY, updated)
      await archivePracticeLog(updated, session.st === "SOLVED", message.language)
      safeBroadcast({ action: "session_updated_v2", session: updated })
      safeBroadcast({ action: "dashboard_refresh" })
      sendResponse({ ok: true, session: updated })
    })
    return true
  }

  if (message.action === "get_prediction") {
    fetchPrediction(message.slug)
      .then((data) => sendResponse(data))
      .catch((err) => sendResponse({ error: err.message }))
    return true
  }

  if (message.action === "get_contests_backend") {
    fetchContests()
      .then((data) => sendResponse(data))
      .catch((err) => sendResponse({ error: err.message }))
    return true
  }


  if (message.action === "get_leetcode_past_contests") {
    fetchPastContests(1, 20)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }


  if (message.action === "get_contest_questions") {
    fetchContestQuestions(message.payload.contestSlug)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  if (message.action === "get_replay_events") {
    const { username, contestSlug, questionSlug } = message.payload;
    fetchReplayEvents(username, contestSlug, questionSlug)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  if (message.action === "get_user_contest_history") {
    const uname = typeof message.payload?.username === "string" ? message.payload.username.trim() : ""
    if (!uname) {
      sendResponse({ ok: false, error: "LeetCode username is not configured in Settings." })
      return true
    }
    fetchContestHistory(uname)
      .then((data) => sendResponse({ ok: true, data: data.data || {} }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  if (message.action === "get_user_profile") {
    const uname = typeof message.payload?.username === "string" ? message.payload.username.trim() : ""
    if (!uname) {
      sendResponse({ ok: false, error: "LeetCode username is not configured in Settings." })
      return true
    }
    fetchUserProfile(uname)
      .then((data) => sendResponse({ ok: true, data: data.data || {} }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  if (message.action === "get_leetcode_contest_ranking") {
    const { contestSlug, username, page = 1 } = message.payload;
    fetch(`https://leetcode.com/contest/api/ranking/${contestSlug}/?pagination=${page}&region=global&username=${username}`)
      .then((res) => res.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  if (message.action === "sync_history") {
    if (isSyncing) {
      sendResponse({ ok: false, error: "A sync operation is already in progress." })
      return true
    }
    isSyncing = true
    syncAbortController = new AbortController()
    runSync(message.username, message.startOffset || 0, syncAbortController.signal, Boolean(message.forceFullSync))
      .then((res) => {
        isSyncing = false
        sendResponse(res)
      })
      .catch((error) => {
        isSyncing = false
        sendResponse({ ok: false, error: error.message })
      })
    return true
  }

  if (message.action === "reset_sync_state") {
    Promise.all([
      storage.remove("algovault.latestSyncedSubmissionTimestamp"),
      storage.remove("algovault.solvedSlugs"),
      storage.remove("algovault.syncHasMore"),
      storage.remove("algovault.lastSync")
    ]).then(() => {
      chrome.storage.local.set({ syncStatus: { status: "INFO", message: "Sync cache reset. Ready for clean full sync.", count: 0, subCount: 0 } })
      sendResponse({ ok: true })
    }).catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  if (message.action === "stop_sync") {
    if (syncAbortController) {
      syncAbortController.abort()
      syncAbortController = null
    }
    isSyncing = false
    chrome.storage.local.set({ syncStatus: { status: "INFO", message: "Sync stopped by user", count: 0, subCount: 0 } })
    sendResponse({ ok: true })
    return true
  }

  if (message.action === "get_zerotrac") {
    getCachedZerotracRatings()
      .then((data) => sendResponse(data))
      .catch((err) => sendResponse({ error: err.message }))
    return true
  }

  if (message.action === "get_problem_rating") {
    getSingleProblemRating(message.slug || "")
      .then((rating) => sendResponse(rating))
      .catch((err) => sendResponse({ error: err.message }))
    return true
  }

  if (message.action === "get_solved_problem_slugs") {
    getSolvedProblemSlugs()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  if (message.action === "get_problem_metadata_batch") {
    const slugs = Array.isArray(message.slugs) ? message.slugs : []
    fetchProblemMetadata(slugs)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  if (message.action === "submission_result") {
    const payload = message.payload || {};
    
    chrome.storage.local.get([
      "algovault.isZenith",
      "algovault.zenithGrade",
      "algovault.zenithReason",
      "algovault.zenithFocusScore",
      "algovault.problemStartTime",
      ACTIVE_SESSION_KEY
    ], async (res) => {
      const isZenith = !!res["algovault.isZenith"];
      let helpType: "NONE" | "PENDING_SELF_REPORT" = "PENDING_SELF_REPORT";

      // 1. Extract APSE v2 Practice Telemetry
      const activeSession = res[ACTIVE_SESSION_KEY];
      if (activeSession && activeSession.slug === payload.titleSlug) {
        const now = Date.now();
        const accActiveMs = typeof activeSession.accActiveMs === "number" ? activeSession.accActiveMs : 0;
        const currentSegmentMs = activeSession.st === "RUNNING" && activeSession.tActiveStart 
          ? Math.max(0, now - activeSession.tActiveStart) 
          : 0;
        const totalActiveSecs = Math.max(1, Math.floor((accActiveMs + currentSegmentMs) / 1000));
        
        payload.focusSeconds = totalActiveSecs;
        payload.tabSwitches = activeSession.tabs || 0;
        payload.pasteCount = activeSession.pastes || 0;
        
        const tElapsedStart = typeof activeSession.tElapsedStart === "number" ? activeSession.tElapsedStart : now;
        const totalElapsedSecs = Math.max(1, Math.floor((now - tElapsedStart) / 1000));
        payload.focusScore = Math.min(100, Math.round((totalActiveSecs / totalElapsedSecs) * 100));
        payload.startedAt = new Date(tElapsedStart).toISOString();
      }

      // 2. Extract Zenith Focus Mode Telemetry if active
      if (isZenith) {
        payload.isZenith = true;
        payload.grade = res["algovault.zenithGrade"] || "S_PLUS";
        payload.reason = res["algovault.zenithReason"] || "Pure Solve";
        payload.focusScore = res["algovault.zenithFocusScore"] ?? 100.0;
        
        const startTime = res["algovault.problemStartTime"];
        payload.timeSpentSeconds = startTime 
          ? Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000))
          : (payload.focusSeconds || 0);
        payload.codeSubmitted = payload.code || "";

        // Reset Zenith state since solve is done
        chrome.storage.local.set({ "algovault.isZenith": false });
        helpType = "NONE";
      }

      // 3. Trigger GitHub sync and archive practice log if Accepted
      if (payload.statusDisplay === "Accepted") {
        if (activeSession && activeSession.slug === payload.titleSlug) {
          const updated = transitionSession(activeSession, "SOLVED", null, Date.now());
          await archivePracticeLog(updated, true, payload.codeLang || payload.language);
          await storage.set(ACTIVE_SESSION_KEY, updated);
        }

        getGithubAutoSync().then((isAutoSync) => {
          if (isAutoSync) {
            syncAcceptedSubmissionToGithub(payload, helpType).catch((gitErr) => {
              console.error("Error during GitHub sync operation:", gitErr);
            });
          } else {
            console.log("[AlgoVault] GitHub Auto-Sync is disabled; skipping automatic solution commit.");
          }
        });
      }

      // 4. Send enriched payload to backend
      sendSubmissionResult(payload)
        .then(async (data) => {
          sendResponse({ ok: true, data });
          // Defer dashboard refresh to avoid competing with celebration overlay
          // rendering and GitHub sync during the critical post-AC moment
          setTimeout(() => {
            safeBroadcast({ action: "dashboard_refresh" });
          }, 2000);
        })
        .catch((err) => {
          console.error("Backend submission report failed:", err);
          sendResponse({ ok: false, error: err.message });
        });
    });
    return true;
  }

  if (message.action === "post_solve_report") {
    // Sync post-solve report to GitHub independently
    updateGithubHelpReport(message.payload).catch((err) => {
      console.warn("GitHub help report update failed", err)
    })

    sendSelfReport(message.payload)
      .then(() => {
        sendResponse({ ok: true })
      })
      .catch((err) => {
        console.error("Backend self report failed:", err)
        sendResponse({ ok: false, error: err.message })
      })
    return true
  }

  if (message.action === "add_to_vault") {
    addToVault(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  if (message.action === "set_github_auto_sync") {
    setGithubAutoSync(message.enabled).then(() => {
      sendResponse({ ok: true, enabled: message.enabled })
    })
    return true
  }

  if (message.action === "get_github_auto_sync") {
    getGithubAutoSync().then((val) => {
      sendResponse({ ok: true, enabled: val })
    })
    return true
  }
})

function stripWrappingQuotes(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed
}

function slugPathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown"
}

function markdownLanguage(language?: string) {
  const raw = (language || "").toLowerCase()
  if (raw.includes("c++") || raw.includes("cpp")) return "cpp"
  if (raw.includes("c#") || raw.includes("csharp")) return "csharp"
  if (raw.includes("javascript")) return "javascript"
  if (raw.includes("typescript")) return "typescript"
  if (raw.includes("python")) return "python"
  if (raw.includes("golang")) return "go"
  return raw.replace(/[^a-z0-9#+-]/g, "") || "text"
}

function formatMb(memoryKb?: number) {
  return memoryKb != null ? `${Math.round(memoryKb / 10.24) / 100} MB` : "N/A"
}

function formatMs(runtimeMs?: number) {
  return runtimeMs != null ? `${runtimeMs} ms` : "N/A"
}

function helpTypeLabel(helpType?: string) {
  switch (helpType) {
    case "NONE":
      return "Solved solo"
    case "HINT":
      return "Needed hint"
    case "EDITORIAL":
      return "Used editorial"
    case "EXTERNAL":
      return "Used external help"
    case "PENDING_SELF_REPORT":
      return "Pending self report"
    default:
      return helpType || "Not recorded"
  }
}

const GITHUB_EXPORT_INDEX_KEY = STORAGE_KEYS.GITHUB_EXPORT_INDEX

interface GithubExportRecord {
  submissionId: string | null
  timestamp: number
  path: string
}

type GithubExportIndex = Record<string, Record<string, GithubExportRecord>>

function withGithubWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const run = githubWriteQueue.then(task, task)
  githubWriteQueue = run.then(() => undefined, () => undefined)
  return run
}

function githubExportTarget(repo: string, branch: string | undefined, basePath: string) {
  return `${repo.trim().toLowerCase()}|${branch || "default"}|${basePath}`
}

function submissionTimestamp(payload: any) {
  const numeric = Number(payload?.timestamp)
  if (Number.isFinite(numeric) && numeric > 0) return numeric
  const parsed = Date.parse(payload?.submittedAt || "")
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0
}

async function markGithubExported(repo: string, branch: string | undefined, basePath: string, artifact: any) {
  const index = (await storage.get<GithubExportIndex>(GITHUB_EXPORT_INDEX_KEY)) || {}
  const target = githubExportTarget(repo, branch, basePath)
  index[target] ||= {}
  index[target][artifact.payload.titleSlug] = {
    submissionId: artifact.payload.submissionId ? String(artifact.payload.submissionId) : null,
    timestamp: submissionTimestamp(artifact.payload),
    path: artifact.folder
  }
  await storage.set(GITHUB_EXPORT_INDEX_KEY, index)
}

function parseRuntimeMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const match = String(value || "").match(/[\d.]+/)
  return match ? Number(match[0]) : undefined
}

function parseMemoryKb(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const text = String(value || "")
  const match = text.match(/[\d.]+/)
  if (!match) return undefined
  const amount = Number(match[0])
  if (/\b(?:mb|mib)\b/i.test(text)) return Math.round(amount * 1024)
  if (/\b(?:gb|gib)\b/i.test(text)) return Math.round(amount * 1024 * 1024)
  return Math.round(amount)
}

async function buildGithubArtifact(payload: any, helpType: string, sessionData?: any, providedMeta?: any) {
  const metaList = providedMeta ? [] : await fetchProblemMetadata([payload.titleSlug]).catch(() => [])
  const meta: any = providedMeta || (metaList && metaList.length ? metaList[0] : null)
  const qId = meta?.frontendQuestionId ? String(meta.frontendQuestionId) : ""
  const qTitle = meta?.title || payload.title || payload.titleSlug
  const difficulty = meta?.difficulty || "Unknown"
  const difficultyFolder = slugPathSegment(difficulty)
  const idPrefix = qId ? `${qId}-` : ""
  const basePath = await getGithubBasePath()
  const folder = joinGithubPath(basePath, difficultyFolder, `${idPrefix}${payload.titleSlug}`)
  const language = payload.codeLang || payload.language || "Unknown"
  const ext = payload.code ? getExtensionForLanguage(language) : "missing.txt"
  const codePath = `${folder}/solution.${ext}`
  const tags = Array.isArray(meta?.topicTags) ? meta.topicTags.map((tag: any) => tag.name).filter(Boolean) : []
  const timeSpentSeconds = typeof sessionData?.focusSeconds === "number"
    ? sessionData.focusSeconds
    : typeof payload.focusSeconds === "number" ? payload.focusSeconds : null
  const complexity = analyzeComplexity(payload.code, language)

  const metadata = {
    title: qTitle,
    titleSlug: payload.titleSlug,
    frontendQuestionId: qId || null,
    leetcodeUrl: `https://leetcode.com/problems/${payload.titleSlug}/`,
    difficulty,
    topics: tags,
    language,
    verdict: payload.statusDisplay,
    submissionId: payload.submissionId || null,
    submittedAt: payload.submittedAt,
    runtimeMs: payload.runtimeMs ?? null,
    memoryKb: payload.memoryKb ?? null,
    complexity,
    totalCorrect: payload.totalCorrect ?? null,
    totalTestcases: payload.totalTestcases ?? null,
    helpType,
    helpLabel: helpTypeLabel(helpType),
    focusSeconds: timeSpentSeconds,
    syncedAt: new Date().toISOString()
  }

  const readme = `<h2><a href="https://leetcode.com/problems/${payload.titleSlug}/">${qId ? `${qId}. ` : ""}${qTitle}</a></h2><h3>${difficulty}</h3><hr>${meta?.content || "Problem description not found."}<hr><h3>Submission metrics</h3><ul><li><strong>Runtime measured by LeetCode:</strong> ${formatMs(payload.runtimeMs)}</li><li><strong>Memory measured by LeetCode:</strong> ${formatMb(payload.memoryKb)}</li></ul><h3>Big-O analysis</h3><ul><li><strong>Time:</strong> ${complexity.time}</li><li><strong>Space:</strong> ${complexity.space}</li><li><strong>Source:</strong> ${complexity.source} (${complexity.confidence} confidence)</li></ul><p><em>${complexity.explanation}</em></p>`;

  const codeContent = payload.code || [
    "AlgoVault could not capture source code for this accepted event.",
    "The problem, telemetry, and self-report metadata are still recorded in README.md and metadata.json."
  ].join("\n");

  return {
    basePath,
    folder,
    codePath,
    readmePath: `${folder}/README.md`,
    metadataPath: `${folder}/metadata.json`,
    codeContent,
    readme,
    metadata,
    payload
  }
}

async function syncAcceptedSubmissionToGithub(payload: any, helpType = "PENDING_SELF_REPORT", sessionData?: any) {
  if (!payload?.titleSlug) return
  const isAutoSyncEnabled = await getGithubAutoSync()
  if (!isAutoSyncEnabled) return

  const artifact = await buildGithubArtifact(payload, helpType, sessionData)
  await storage.set(`algovault.gitSolve.${payload.titleSlug}`, artifact)

  let pat = await getGithubPat()
  let repo = await getGithubRepo()
  if (!pat || !repo) {
    await storage.set("algovault.gitSyncStatus", {
      success: false,
      message: "GitHub credentials are not configured",
      timestamp: Date.now(),
      problem: payload.title || payload.titleSlug
    })
    return
  }

  pat = stripWrappingQuotes(pat)
  repo = stripWrappingQuotes(repo)

  const branch = await getGithubBranch() || undefined
  const commitPrefix = `${artifact.metadata.frontendQuestionId ? `${artifact.metadata.frontendQuestionId}. ` : ""}${artifact.metadata.title}`
  const timeStr = payload.runtimeMs != null ? `${payload.runtimeMs} ms` : "N/A"
  const spaceStr = payload.memoryKb != null ? `${Math.round(payload.memoryKb / 10.24) / 100} MB` : "N/A"
  
  const writes = [
    {
      path: artifact.codePath,
      message: `${commitPrefix}: Time: ${timeStr}, Space: ${spaceStr} - AlgoVault`,
      content: artifact.codeContent
    },
    {
      path: artifact.readmePath,
      message: `Update notes for ${commitPrefix}`,
      content: artifact.readme
    },
    {
      path: artifact.metadataPath,
      message: `Update metadata for ${commitPrefix}`,
      content: JSON.stringify(artifact.metadata, null, 2) + "\n"
    }
  ]

  // Single atomic commit for all 3 files (code + README + metadata)
  const result = await withGithubWriteLock(async () => {
    const commitResult = await batchCommitToGithub(pat, repo, writes, branch)
    if (commitResult.ok) await markGithubExported(repo, branch, artifact.basePath, artifact)
    return commitResult
  })
  if (!result.ok) {
    await storage.set("algovault.gitSyncStatus", {
      success: false,
      message: result.message,
      timestamp: Date.now(),
      problem: payload.title || payload.titleSlug,
      path: artifact.folder
    })
    return
  }

  await storage.set("algovault.gitSyncStatus", {
    success: true,
    message: "Success",
    timestamp: Date.now(),
    problem: payload.title || payload.titleSlug,
    path: artifact.folder
  })
}

async function updateGithubHelpReport(report: any) {
  if (!report?.titleSlug || !report.helpType) return
  const isAutoSyncEnabled = await getGithubAutoSync()
  if (!isAutoSyncEnabled) {
    console.log("[AlgoVault] GitHub Auto-Sync is disabled; skipping updateGithubHelpReport.")
    return
  }
  const artifact = await storage.get<any>(`algovault.gitSolve.${report.titleSlug}`)
  if (!artifact?.payload) return
  await syncAcceptedSubmissionToGithub(artifact.payload, report.helpType, {
    focusSeconds: artifact.metadata?.focusSeconds
  })
}

function githubWritesForArtifact(artifact: any) {
  return [
    { path: artifact.codePath, message: `Export ${artifact.metadata.title}`, content: artifact.codeContent },
    { path: artifact.readmePath, message: `Export notes for ${artifact.metadata.title}`, content: artifact.readme },
    { path: artifact.metadataPath, message: `Export metadata for ${artifact.metadata.title}`, content: JSON.stringify(artifact.metadata, null, 2) + "\n" }
  ]
}

async function exportAcceptedHistoryToGithub(
  rawSubmissions: any[],
  signal: AbortSignal | undefined,
  exportedThisRun: Set<string>,
  updateStatus: (status: string, msg: string, count?: number, subCount?: number) => void,
  problemCount: number,
  submissionCount: number
) {
  if (!(await getGithubAutoSync())) return 0

  let pat = await getGithubPat()
  let repo = await getGithubRepo()
  if (!pat || !repo) {
    await storage.set("algovault.gitSyncStatus", {
      success: false,
      message: "GitHub credentials are not configured; LeetCode history was synced without repository export.",
      timestamp: Date.now()
    })
    return 0
  }

  pat = stripWrappingQuotes(pat)
  repo = stripWrappingQuotes(repo)
  const branch = await getGithubBranch() || undefined
  const basePath = await getGithubBasePath()
  const target = githubExportTarget(repo, branch, basePath)
  const exportIndex = (await storage.get<GithubExportIndex>(GITHUB_EXPORT_INDEX_KEY)) || {}
  exportIndex[target] ||= {}

  const acceptedBySlug = new Map<string, any>()
  for (const submission of rawSubmissions) {
    const slug = submission.title_slug
    const accepted = submission.status_display === "Accepted" || Number(submission.status) === 10
    if (!slug || !accepted || acceptedBySlug.has(slug) || exportedThisRun.has(slug)) continue
    const previous = exportIndex[target][slug]
    const timestamp = Number(submission.timestamp) || 0
    if (previous && previous.timestamp >= timestamp) {
      exportedThisRun.add(slug)
      continue
    }
    acceptedBySlug.set(slug, submission)
  }

  const candidates = Array.from(acceptedBySlug.values())
  if (!candidates.length) return 0

  updateStatus("RUNNING", `Preparing ${candidates.length} accepted solution${candidates.length === 1 ? "" : "s"} for GitHub...`, problemCount, submissionCount)
  const metadataBySlug = new Map<string, any>()
  for (let index = 0; index < candidates.length; index += 30) {
    if (signal?.aborted) throw new Error("Sync stopped by user")
    const metadata = await fetchProblemMetadata(candidates.slice(index, index + 30).map((item) => item.title_slug)).catch(() => [])
    metadata.forEach((item: any) => metadataBySlug.set(item.titleSlug, item))
  }

  const artifacts: any[] = []
  for (let index = 0; index < candidates.length; index += 1) {
    if (signal?.aborted) throw new Error("Sync stopped by user")
    const submission = candidates[index]
    let details: any = null
    if (!submission.code) {
      details = await fetchSubmissionDetails(Number(submission.id)).catch(() => null)
    }
    const timestamp = Number(submission.timestamp || details?.timestamp) || 0
    const payload = {
      submissionId: String(submission.id),
      titleSlug: submission.title_slug,
      title: submission.title || details?.question?.title,
      statusDisplay: submission.status_display || details?.statusDisplay || "Accepted",
      language: submission.lang || details?.lang?.verboseName || details?.lang?.name,
      code: submission.code || details?.code,
      runtimeMs: parseRuntimeMs(submission.runtime || details?.runtime),
      memoryKb: parseMemoryKb(submission.memory || details?.memory),
      timestamp,
      submittedAt: timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString()
    }
    artifacts.push(await buildGithubArtifact(payload, "NOT_RECORDED", undefined, metadataBySlug.get(payload.titleSlug)))
    updateStatus("RUNNING", `Preparing accepted solutions for GitHub (${index + 1}/${candidates.length})...`, problemCount, submissionCount)
  }

  let exported = 0
  const artifactBatches = partitionGithubArtifacts(artifacts, githubWritesForArtifact)

  const commitHistoryBatch = async (batch: any[]): Promise<any[]> => {
    if (signal?.aborted) throw new Error("Sync stopped by user")
    const { result, committed } = await withGithubWriteLock(async () => {
      const latestIndex = (await storage.get<GithubExportIndex>(GITHUB_EXPORT_INDEX_KEY)) || {}
      latestIndex[target] ||= {}
      const eligible = batch.filter((artifact) => {
        const previous = latestIndex[target][artifact.payload.titleSlug]
        return !previous || previous.timestamp < submissionTimestamp(artifact.payload)
      })
      if (!eligible.length) return { result: { ok: true }, committed: [] as any[] }

      const writes = eligible.flatMap(githubWritesForArtifact)
      const commitResult = await batchCommitToGithub(
        pat,
        repo,
        writes,
        branch,
        `Export ${eligible.length} accepted LeetCode solution${eligible.length === 1 ? "" : "s"} - AlgoVault`,
        { allowSequentialFallback: false }
      )
      if (commitResult.ok) {
        for (const artifact of eligible) {
          latestIndex[target][artifact.payload.titleSlug] = {
            submissionId: artifact.payload.submissionId ? String(artifact.payload.submissionId) : null,
            timestamp: submissionTimestamp(artifact.payload),
            path: artifact.folder
          }
        }
        await storage.set(GITHUB_EXPORT_INDEX_KEY, latestIndex)
      }
      return { result: commitResult, committed: commitResult.ok ? eligible : [] }
    })

    if (!result.ok) {
      if (result.retryableWithSmallerBatch && batch.length > 1) {
        const midpoint = Math.ceil(batch.length / 2)
        updateStatus(
          "RUNNING",
          `GitHub rejected a large batch; retrying as ${midpoint} + ${batch.length - midpoint} solutions...`,
          problemCount,
          submissionCount
        )
        const first = await commitHistoryBatch(batch.slice(0, midpoint))
        const second = await commitHistoryBatch(batch.slice(midpoint))
        return [...first, ...second]
      }
      await storage.set("algovault.gitSyncStatus", { success: false, message: result.message, timestamp: Date.now() })
      throw new Error(`GitHub history export failed: ${result.message}`)
    }

    return committed
  }

  for (const batch of artifactBatches) {
    const committed = await commitHistoryBatch(batch)
    for (const artifact of committed) {
      exportedThisRun.add(artifact.payload.titleSlug)
    }
    exported += committed.length
    updateStatus("RUNNING", `Exported ${exported}/${artifacts.length} accepted solutions to GitHub...`, problemCount, submissionCount)
  }

  await storage.set("algovault.gitSyncStatus", {
    success: true,
    message: `Exported ${exported} accepted solution${exported === 1 ? "" : "s"} from LeetCode history.`,
    timestamp: Date.now(),
    path: basePath
  })
  return exported
}

async function recoverMissingSolvedSolutions(
  problems: any[],
  signal: AbortSignal | undefined,
  exportedThisRun: Set<string>,
  updateStatus: (status: string, msg: string, count?: number, subCount?: number) => void,
  submissionCount: number
) {
  if (!(await getGithubAutoSync())) return { exported: 0, unresolved: 0 }

  let pat = await getGithubPat()
  let repo = await getGithubRepo()
  if (!pat || !repo) return { exported: 0, unresolved: 0 }
  pat = stripWrappingQuotes(pat)
  repo = stripWrappingQuotes(repo)
  const branch = await getGithubBranch() || undefined
  const basePath = await getGithubBasePath()
  const target = githubExportTarget(repo, branch, basePath)
  const exportIndex = (await storage.get<GithubExportIndex>(GITHUB_EXPORT_INDEX_KEY)) || {}
  const exportedForTarget = exportIndex[target] || {}
  const remoteTree = await getGithubTreePaths(pat, repo, branch)
  if (!remoteTree.ok) {
    throw new Error(`GitHub history reconciliation failed: ${remoteTree.message}`)
  }
  if (remoteTree.truncated) {
    throw new Error("GitHub history reconciliation failed: the repository tree was truncated.")
  }
  const missingProblems = findProblemsMissingFromGithub(
    problems,
    exportedForTarget,
    remoteTree.paths || []
  ) as any[]

  if (!missingProblems.length) return { exported: 0, unresolved: 0 }
  // The remote branch is authoritative. Remove stale local records before
  // exporting so entries left behind by an interrupted or superseded branch
  // update cannot suppress files that are absent from GitHub.
  for (const problem of missingProblems) delete exportedForTarget[problem.titleSlug]
  exportIndex[target] = exportedForTarget
  await storage.set(GITHUB_EXPORT_INDEX_KEY, exportIndex)
  // A previous global-history run may have been marked complete even though
  // LeetCode omitted older accepted submissions. Do not keep advertising that
  // checkpoint as valid while the per-problem recovery is in progress.
  await storage.remove(STORAGE_KEYS.LAST_SYNC)

  let exported = 0
  let unresolved = 0
  const problemBatchSize = 8
  const submissionPageSize = 20
  const recoveredCommitSize = 100
  let pendingGithubExport: any[] = []

  for (let batchStart = 0; batchStart < missingProblems.length; batchStart += problemBatchSize) {
    if (signal?.aborted) throw new Error("Sync stopped by user")
    const problemBatch = missingProblems.slice(batchStart, batchStart + problemBatchSize)
    let pending: ProblemSubmissionRequest[] = problemBatch.map((problem: any) => ({
      titleSlug: problem.titleSlug,
      offset: 0,
      lastKey: null
    }))
    const acceptedBySlug = new Map<string, any>()
    let pageRounds = 0

    while (pending.length && pageRounds < 50) {
      if (signal?.aborted) throw new Error("Sync stopped by user")
      updateStatus(
        "RUNNING",
        `Recovering accepted solutions missing from the global history (${Math.min(batchStart + acceptedBySlug.size, missingProblems.length)}/${missingProblems.length})...`,
        problems.length,
        submissionCount
      )
      const pages = await fetchProblemSubmissionPages(pending, submissionPageSize)
      const nextPending: ProblemSubmissionRequest[] = []
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index]
        const accepted = page.submissions.find((submission: any) =>
          submission.statusDisplay === "Accepted" || Number(submission.status) === 10
        )
        if (accepted) {
          acceptedBySlug.set(page.titleSlug, accepted)
          continue
        }
        if (page.hasNext && page.submissions.length > 0) {
          nextPending.push({
            titleSlug: page.titleSlug,
            offset: (pending[index].offset || 0) + page.submissions.length,
            lastKey: page.lastKey
          })
        } else {
          unresolved += 1
        }
      }
      pending = nextPending
      pageRounds += 1
      if (pending.length) await new Promise((resolve) => setTimeout(resolve, 700))
    }
    unresolved += pending.length

    const accepted = Array.from(acceptedBySlug.entries())
    const detailsById = new Map<string, any>()
    for (let detailStart = 0; detailStart < accepted.length; detailStart += 8) {
      if (signal?.aborted) throw new Error("Sync stopped by user")
      const ids = accepted
        .slice(detailStart, detailStart + 8)
        .map(([, submission]: any) => Number(submission.id))
        .filter((id: number) => Number.isSafeInteger(id) && id > 0)
      const details = await fetchSubmissionDetailsBatch(ids)
      details.forEach((detail: any) => detailsById.set(String(detail.id), detail))
      if (detailStart + 8 < accepted.length) await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const recoveredSubmissions = accepted.map(([titleSlug, submission]: any) => {
      const details = detailsById.get(String(submission.id))
      const detailLanguage = details?.lang?.verboseName || details?.lang?.name
      return {
        id: String(submission.id),
        title: submission.title || details?.question?.title,
        title_slug: titleSlug,
        status_display: "Accepted",
        status: 10,
        lang: submission.lang || detailLanguage,
        timestamp: submission.timestamp || details?.timestamp,
        runtime: submission.runtime || details?.runtime,
        memory: submission.memory || details?.memory,
        code: details?.code
      }
    })

    pendingGithubExport.push(...recoveredSubmissions)
    const isLastProblemBatch = batchStart + problemBatchSize >= missingProblems.length
    if (pendingGithubExport.length >= recoveredCommitSize || (isLastProblemBatch && pendingGithubExport.length)) {
      exported += await exportAcceptedHistoryToGithub(
        pendingGithubExport,
        signal,
        exportedThisRun,
        updateStatus,
        problems.length,
        submissionCount
      )
      pendingGithubExport = []
    }
    updateStatus(
      "RUNNING",
      `Recovered ${Math.min(batchStart + problemBatch.length, missingProblems.length)}/${missingProblems.length} missing solved problems...`,
      problems.length,
      submissionCount
    )
    if (batchStart + problemBatchSize < missingProblems.length) {
      await new Promise((resolve) => setTimeout(resolve, 900))
    }
  }

  return { exported, unresolved }
}

async function syncGithubRepositoryDashboard(
  problems: any[],
  archivedCount: number,
  username: string
) {
  if (!(await getGithubAutoSync())) return
  let pat = await getGithubPat()
  let repo = await getGithubRepo()
  if (!pat || !repo) return
  pat = stripWrappingQuotes(pat)
  repo = stripWrappingQuotes(repo)
  const branch = await getGithubBranch() || undefined
  const basePath = await getGithubBasePath()
  const content = buildGithubDashboardReadme(problems, { basePath, archivedCount, username })
  const result = await withGithubWriteLock(() => commitToGithub(
    pat,
    repo,
    "README.md",
    "docs: update AlgoVault solution dashboard",
    content,
    branch
  ))
  if (!result.ok) {
    throw new Error(`GitHub dashboard update failed: ${result.message}`)
  }
}

async function runSync(username: string, startOffset = 0, signal?: AbortSignal, forceFullSync = false, exportedThisRun = new Set<string>()) {
  if (!username || !username.trim()) {
    throw new Error("LeetCode username is required")
  }
  const normalizedUsername = username.trim()
  await setUsername(normalizedUsername)

  if (forceFullSync) {
    await storage.remove("algovault.latestSyncedSubmissionTimestamp")
    await storage.remove("algovault.solvedSlugs")
    await storage.remove("algovault.syncHasMore")
    await storage.remove(STORAGE_KEYS.LAST_SYNC)
    startOffset = 0
  }

  const updateStatus = (status: string, msg: string, count = 0, subCount = 0) => {
    chrome.storage.local.set({ syncStatus: { status, message: msg, count, subCount } })
  }

  try {
    if (signal?.aborted) throw new Error("Sync stopped by user");
    const isHistoryBackfill = startOffset > 0 && !forceFullSync
    updateStatus("RUNNING", isHistoryBackfill ? `Syncing older history from submission ${startOffset + 1}...` : "Verifying LeetCode session...")
    const statusRes = await fetchUserStatus()
    const sessionUser = statusRes.data?.userStatus?.username
    if (!sessionUser || sessionUser.toLowerCase() !== normalizedUsername.toLowerCase()) {
      throw new Error(`You can only sync the account currently logged into LeetCode.com (Logged in as: ${sessionUser || 'Guest'})`)
    }

    updateStatus("RUNNING", "Fetching user profile...")
    const profileRes = await fetchUserProfile(normalizedUsername)
    if (!profileRes.data?.matchedUser) throw new Error("User not found on LeetCode")
    const profile = profileRes.data.matchedUser
    const expectedSolvedCount = acceptedProblemCount(profile)

    const problems: any[] = []
    const cachedSolved = forceFullSync ? null : await storage.get<any>("algovault.solvedSlugs")
    const isCurrentSolvedCache = cachedSolved?.source === SOLVED_PROBLEM_CACHE_SOURCE
    const isCacheValid = isCurrentSolvedCache && cachedSolved.fetchedAt && (Date.now() - cachedSolved.fetchedAt < 15 * 60 * 1000) && Array.isArray(cachedSolved.rawProblems)

    if (isCacheValid) {
      problems.push(...cachedSolved.rawProblems)
    } else if (startOffset === 0) {
      updateStatus("RUNNING", "Fetching solved problems...", 0, 0)
      let problemOffset = 0
      const problemPageSize = 50
      let totalSolved = Number.POSITIVE_INFINITY
      while (problems.length < totalSolved) {
        if (signal?.aborted) throw new Error("Sync stopped by user");
        const problemsRes = await fetchSolvedProblems(problemOffset, problemPageSize)
        const page = problemsRes.data?.problemsetQuestionList
        if (!page) throw new Error("LeetCode did not return solved-problem data")
        totalSolved = page.totalNum || 0
        const questions = page.questions || []
        if (questions.length === 0) break
        problems.push(...questions)
        problemOffset += questions.length
        updateStatus("RUNNING", "Fetching solved problems...", problems.length, 0)
        await new Promise((resolve) => setTimeout(resolve, 600))
      }
      await storage.set("algovault.solvedSlugs", {
        source: SOLVED_PROBLEM_CACHE_SOURCE,
        fetchedAt: Date.now(),
        slugs: problems.map((problem: any) => problem.titleSlug).filter(Boolean),
        rawProblems: problems
      })
    } else {
      if (isCurrentSolvedCache && Array.isArray(cachedSolved.rawProblems)) {
        problems.push(...cachedSolved.rawProblems)
      } else {
        updateStatus("RUNNING", "Fetching solved problems...", 0, 0)
        let problemOffset = 0
        const problemPageSize = 50
        let totalSolved = Number.POSITIVE_INFINITY
        while (problems.length < totalSolved) {
          if (signal?.aborted) throw new Error("Sync stopped by user");
          const problemsRes = await fetchSolvedProblems(problemOffset, problemPageSize)
          const page = problemsRes.data?.problemsetQuestionList
          if (!page) throw new Error("LeetCode did not return solved-problem data")
          totalSolved = page.totalNum || 0
          const questions = page.questions || []
          if (questions.length === 0) break
          problems.push(...questions)
          problemOffset += questions.length
          updateStatus("RUNNING", "Fetching solved problems...", problems.length, 0)
          await new Promise((resolve) => setTimeout(resolve, 600))
        }
        await storage.set("algovault.solvedSlugs", {
          source: SOLVED_PROBLEM_CACHE_SOURCE,
          fetchedAt: Date.now(),
          slugs: problems.map((problem: any) => problem.titleSlug).filter(Boolean),
          rawProblems: problems
        })
      }
    }

    const completeProblems = requireCompleteSolvedProblemList(problems, expectedSolvedCount)
    problems.length = 0
    problems.push(...completeProblems)

    updateStatus("RUNNING", "Fetching submissions...", problems.length, 0)

    const rawSubs: any[] = []
    let offset = startOffset
    const limit = 20
    let hasNext = true
    // LeetCode exposes submission pages in small chunks. We deliberately
    // collect at most 400 records before one backend upload so history syncs
    // are rate-friendly and resumable without losing the pagination cursor.
    const maxSubmissionsToSync = 400

    // Read the timestamp of the last successfully synced submission
    const latestSyncedTs = forceFullSync ? 0 : ((await storage.get<number>("algovault.latestSyncedSubmissionTimestamp")) || 0)
    let foundAlreadySynced = false

    while (hasNext && rawSubs.length < maxSubmissionsToSync && !foundAlreadySynced) {
      if (signal?.aborted) throw new Error("Sync stopped by user");
      const subsRes = await fetchSubmissionPage(offset, limit)
      const pageSubs = subsRes.submissions_dump || []
      if (pageSubs.length === 0) {
        if (subsRes.has_next) throw new Error("LeetCode returned an empty submission page before history ended")
        break
      }
      
      for (const sub of pageSubs) {
        const subTs = Number(sub.timestamp) || 0
        // The timestamp checkpoint belongs only to a normal incremental
        // refresh. Applying it when resuming older pages makes every older
        // submission look "already synced" and stops a full history backfill
        // after its first 400-record batch.
        if (!isHistoryBackfill && latestSyncedTs > 0 && subTs <= latestSyncedTs) {
          foundAlreadySynced = true
          break
        }
        rawSubs.push(sub)
      }

      if (foundAlreadySynced) {
        hasNext = false
        break
      }

      hasNext = Boolean(subsRes.has_next)
      offset += pageSubs.length
      
      updateStatus("RUNNING", "Fetching submissions...", problems.length, startOffset + rawSubs.length)
      
      await new Promise((resolve) => setTimeout(resolve, 750))
    }

    const hasMoreHistory = hasNext && !foundAlreadySynced

    const uniqueRawSubs = Array.from(new Map(rawSubs.map(s => [s.id, s])).values())

    const submissions = uniqueRawSubs.map((s: any) => ({
      id: String(s.id),
      title: s.title,
      titleSlug: s.title_slug,
      statusDisplay: s.status_display,
      lang: s.lang,
      timestamp: String(s.timestamp),
      runtime: s.runtime,
      memory: s.memory
    }))

    const knownSlugs = new Set(problems.map((problem) => problem.titleSlug))
    const attemptedOnlySlugs = Array.from(new Set(
      submissions
        .map((submission) => submission.titleSlug)
        .filter((slug) => slug && !knownSlugs.has(slug))
    ))
    for (let index = 0; index < attemptedOnlySlugs.length; index += 40) {
      if (signal?.aborted) throw new Error("Sync stopped by user");
      const metadata = await fetchProblemMetadata(attemptedOnlySlugs.slice(index, index + 40))
      problems.push(...metadata)
      updateStatus("RUNNING", "Enriching attempted problems...", problems.length, startOffset + submissions.length)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    updateStatus("RUNNING", "Fetching contest history...", problems.length, startOffset + submissions.length)
    const contestRes = await fetchContestHistory(normalizedUsername)
    const contestHistory = contestRes.data?.userContestRankingHistory || []
    const contestRanking = contestRes.data?.userContestRanking || null

    updateStatus("RUNNING", "Pushing to AlgoVault backend...", problems.length, startOffset + submissions.length)

    await syncLeetcode({
      username: normalizedUsername,
      profile: profile.profile,
      solvedProblems: problems,
      submissions,
      contestHistory,
      contestRanking
    })

    await exportAcceptedHistoryToGithub(
      uniqueRawSubs,
      signal,
      exportedThisRun,
      updateStatus,
      problems.length,
      startOffset + submissions.length
    )

    const recovered = hasMoreHistory
      ? { exported: 0, unresolved: 0 }
      : await recoverMissingSolvedSolutions(
        problems,
        signal,
        exportedThisRun,
        updateStatus,
        startOffset + submissions.length
      )

    if (!hasMoreHistory) {
      await syncGithubRepositoryDashboard(
        problems,
        Math.max(0, problems.length - recovered.unresolved),
        normalizedUsername
      )
    }

    // Advance the resumable cursor only after both the backend upload and the
    // optional GitHub export succeed. A failed export must retry this page.
    await storage.set("algovault.syncHasMore", {
      hasMore: hasMoreHistory,
      nextOffset: offset,
      username: normalizedUsername
    })

    // Save the timestamp of the newest submission in this sync
    if (!isHistoryBackfill && submissions.length > 0) {
      let maxTimestamp = 0
      submissions.forEach((s: any) => {
        const ts = Number(s.timestamp) || 0
        if (ts > maxTimestamp) {
          maxTimestamp = ts
        }
      })
      if (maxTimestamp > 0) {
        await storage.set("algovault.latestSyncedSubmissionTimestamp", maxTimestamp)
      }
    }

    const exportSuffix = exportedThisRun.size > 0
      ? ` Exported ${exportedThisRun.size} accepted solution${exportedThisRun.size === 1 ? "" : "s"} to GitHub.`
      : ""
    const recoverySuffix = recovered.exported > 0
      ? ` Recovered ${recovered.exported} additional accepted solution${recovered.exported === 1 ? "" : "s"} omitted by the global history endpoint.`
      : ""
    const completionMessage = hasMoreHistory
      ? `Synced ${submissions.length} submissions. Older history is ready for the next 400-record batch.${exportSuffix}`
      : `Sync completed successfully. Your history is up to date.${exportSuffix}${recoverySuffix}`
    if (hasMoreHistory) {
      updateStatus("RUNNING", `${completionMessage} Continuing automatically…`, problems.length, startOffset + submissions.length)
      // Keep a deliberate pause between 400-record uploads. The cursor is
      // persisted above, so an interrupted extension can still resume safely.
      await new Promise((resolve) => setTimeout(resolve, 1500))
      if (signal?.aborted) throw new Error("Sync stopped by user");
      return runSync(normalizedUsername, offset, signal, false, exportedThisRun)
    }
    if (recovered.unresolved > 0) {
      const partialMessage = `History export is incomplete: ${recovered.unresolved} solved problem${recovered.unresolved === 1 ? "" : "s"} did not expose an accepted submission. Run Quick Sync to retry.${recoverySuffix}`
      updateStatus("PARTIAL", partialMessage, problems.length, startOffset + submissions.length)
      return { ok: true, partial: true, unresolved: recovered.unresolved, nextOffset: offset }
    }
    await setLastSync(Date.now())
    updateStatus("SUCCESS", completionMessage, problems.length, startOffset + submissions.length)
    return { ok: true, hasMore: hasMoreHistory, nextOffset: offset }
  } catch (e: any) {
    console.error("Sync Error:", e)
    updateStatus("ERROR", e.message || "An unknown error occurred during sync")
    return { ok: false, error: e.message }
  }
}

async function getSolvedProblemSlugs(): Promise<string[]> {
  const cached = await storage.get<any>("algovault.solvedSlugs")
  if (cached?.fetchedAt && Date.now() - cached.fetchedAt < 5 * 60 * 1000 && Array.isArray(cached.slugs)) {
    return cached.slugs
  }

  const slugs: string[] = []
  let offset = 0
  const limit = 100
  let total = Number.POSITIVE_INFINITY
  while (slugs.length < total) {
    const response = await fetchSolvedProblems(offset, limit)
    const page = response.data?.problemsetQuestionList
    if (!page) throw new Error("LeetCode did not return accepted problems. Sign in and try again.")
    total = page.totalNum || 0
    const questions = page.questions || []
    if (!questions.length) break
    slugs.push(...questions.map((question: any) => question.titleSlug).filter(Boolean))
    offset += questions.length
  }

  const unique = Array.from(new Set(slugs))
  await storage.set("algovault.solvedSlugs", { ...cached, fetchedAt: Date.now(), slugs: unique })
  return unique
}

async function fetchSubmissionPage(offset: number, limit: number) {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await fetchAllSubmissions(offset, limit)
    } catch (error) {
      lastError = error
      if (attempt < 3) {
        const apiError = error instanceof LeetCodeApiError ? error : null
        const rateLimited = apiError?.status === 403 || apiError?.status === 429
        const delay = apiError?.retryAfterMs || (rateLimited
          ? 5000 * 2 ** attempt + Math.floor(Math.random() * 750)
          : 1000 * 2 ** attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}

async function getCachedZerotracRatings() {
  const [cached, fetchedAt] = await Promise.all([
    getZerotracData(),
    getZerotracLastFetched()
  ])
  if (cached && fetchedAt && Date.now() - fetchedAt < 24 * 60 * 60 * 1000) {
    if (cached.length === 0 || (cached[0].Title && cached[0].Title !== cached[0].TitleSlug)) {
      return cached
    }
  }

  let data: any[] = []

  try {
    const mapData = await fetchZerotracRatingsBackend()
    if (mapData && typeof mapData === "object" && !Array.isArray(mapData)) {
      data = Object.entries(mapData).map(([slug, details]: [string, any]) => {
        const isObject = details && typeof details === "object";
        const rating = isObject ? (details.rating ?? 1500) : (typeof details === "number" ? details : 1500);
        const title = isObject ? (details.title ?? slug) : slug;
        const contestId = isObject ? (details.contestId ?? "") : "";
        
        return {
          TitleSlug: slug,
          Rating: rating,
          Title: title,
          ContestID_en: contestId,
          ContestSlug: contestId ? contestId.toLowerCase().replace(/\s+/g, '-') : "",
          ProblemIndex: isObject ? (details.problemIndex ?? "?") : "?"
        };
      })
    }
  } catch (err) {
    console.warn("Backend zerotrac fetch failed, falling back to GitHub raw data.json", err)
  }

  if (data.length === 0) {
    try {
      const res = await fetch("https://raw.githubusercontent.com/zerotrac/leetcode_problem_rating/main/data.json")
      if (res.ok) {
        const rawJson = await res.json()
        data = normalizeZerotracPayload(rawJson)
      }
    } catch (ghErr) {
      console.error("Direct GitHub ZeroTrac fetch also failed:", ghErr)
    }
  }

  if (data.length > 0) {
    await setZerotracData(data)
    
    // Re-build memory cache map on fetch
    const tempMap = new Map()
    for (const item of data) {
      if (item && item.TitleSlug) {
        tempMap.set(item.TitleSlug.toLowerCase(), item)
      }
    }
    zerotracInMemoryMap = tempMap
  }

  return data
}

let zerotracInMemoryMap: Map<string, any> | null = null

async function getSingleProblemRating(slug: string) {
  if (!slug) return null
  if (!zerotracInMemoryMap) {
    try {
      const cached = await getCachedZerotracRatings()
      if (cached && Array.isArray(cached)) {
        const tempMap = new Map()
        for (const item of cached) {
          if (item && item.TitleSlug) {
            tempMap.set(item.TitleSlug.toLowerCase(), item)
          }
        }
        zerotracInMemoryMap = tempMap
      }
    } catch (e) {
      console.error("AlgoVault: Error loading ZeroTrac cache into memory Map", e)
    }
  }
  return zerotracInMemoryMap ? zerotracInMemoryMap.get(slug.toLowerCase()) || null : null
}

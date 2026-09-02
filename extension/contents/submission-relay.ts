import type { PlasmoCSConfig } from "plasmo"
import { getLeetCodeProblemSlug } from "../lib/leetcode-url"

export const config: PlasmoCSConfig = {
  matches: ["https://leetcode.com/problems/*", "https://leetcode.com/contest/*/problems/*"],
  run_at: "document_idle"
}

type SubmissionPayload = {
  submissionId?: string
  titleSlug: string
  title?: string
  statusDisplay?: string
  statusCode?: number
  language?: string
  runtimeMs?: number
  memoryKb?: number
  totalCorrect?: number
  totalTestcases?: number
  submittedAt: string
  code?: string
  codeLang?: string
}

const relayedSubmissionIds = new Set<string>()

function currentSlug() {
  return getLeetCodeProblemSlug()
}

function currentTitle() {
  const heading = document.querySelector("a[href*='/problems/']")?.textContent
  return heading?.replace(/^\d+\.\s*/, "").trim() || currentSlug() || "Problem"
}

function editorCodeFallback() {
  const textarea = document.querySelector<HTMLTextAreaElement>("textarea.inputarea")
  if (textarea?.value?.trim()) return textarea.value
  const lines = Array.from(document.querySelectorAll<HTMLElement>(".view-lines .view-line"))
    .map((line) => line.innerText)
    .filter(Boolean)
  return lines.length ? lines.join("\n") : undefined
}

function languageFallback() {
  const selected = document.querySelector<HTMLElement>("[data-cy='lang-select'], button[id*='headlessui-listbox-button']")
  return selected?.innerText?.trim() || undefined
}

function parseRuntimeMs(runtime?: string) {
  if (!runtime) return undefined
  const match = runtime.match(/\d+/)
  const val = match ? Number(match[0]) : undefined
  if (val !== undefined && (val < 0 || val > 1_000_000)) return undefined
  return val
}

function parseMemoryKb(memory?: string) {
  if (!memory) return undefined
  const value = Number(memory.replace(/[^0-9.]/g, ""))
  if (!Number.isFinite(value)) return undefined
  const val = memory.toLowerCase().includes("mb") ? Math.round(value * 1024) : Math.round(value)
  if (val < 0 || val > 10_000_000) return undefined
  return val
}

function verdictFromCode(statusCode?: any, fallback?: string) {
  if (fallback && ["Accepted", "Wrong Answer", "Time Limit Exceeded", "Runtime Error", "Compile Error"].includes(fallback)) {
    return fallback
  }
  const codeVal = statusCode != null ? Number(statusCode) : null
  switch (codeVal) {
    case 10:
      return "Accepted"
    case 11:
      return "Wrong Answer"
    case 14:
      return "Time Limit Exceeded"
    case 15:
      return "Runtime Error"
    case 20:
      return "Compile Error"
    default:
      return fallback
  }
}

// Listen for postMessage from MAIN world (CustomEvents do NOT cross MAIN→ISOLATED boundary)
window.addEventListener("message", ((event: MessageEvent) => {
  if (event.origin !== window.location.origin || event.source !== window) return
  if (event.data?.type !== "AV_SUBMISSION_RESULT") return
  
  console.log("AlgoVault: submission-relay received AV_SUBMISSION_RESULT", {
    nonce: event.data?.nonce,
    windowNonce: (window as any).__ALGOVAULT_ISOLATED_NONCE__
  })

  const expectedNonce = (window as any).__ALGOVAULT_ISOLATED_NONCE__ || document.documentElement.getAttribute("data-algovault-nonce")
  if (expectedNonce && event.data?.nonce && event.data.nonce !== expectedNonce) {
    console.warn("AlgoVault: submission-relay nonce mismatch!", {
      received: event.data?.nonce,
      expected: expectedNonce
    })
    return
  }

  const detail = event.data.detail || {}

  // 1. submission id is numeric string when present
  if (detail.submissionId && !/^\d+$/.test(String(detail.submissionId))) {
    return
  }

  // 2. status code is known/expected
  const statusCode = detail.statusCode != null ? Number(detail.statusCode) : null
  const validStatusCodes = [10, 11, 14, 15, 20]
  if (statusCode !== null && !validStatusCodes.includes(statusCode)) {
    return
  }

  // 3. title slug comes from current URL, not trusted page payload
  const slug = currentSlug()
  if (!slug) return

  if (detail.submissionId) {
    const submissionId = String(detail.submissionId)
    if (relayedSubmissionIds.has(submissionId)) return
    relayedSubmissionIds.add(submissionId)
    if (relayedSubmissionIds.size > 100) relayedSubmissionIds.delete(relayedSubmissionIds.values().next().value!)
  }

  const runtimeMs = parseRuntimeMs(detail.runtime)
  const memoryKb = parseMemoryKb(detail.memory)

  // Use code from the interceptor's captured payload; skip expensive DOM fallback
  // editorCodeFallback() scans every .view-line with innerText which forces reflow
  const code = detail.code || undefined

  const payload: SubmissionPayload = {
    submissionId: detail.submissionId ? String(detail.submissionId) : undefined,
    titleSlug: slug,
    title: currentTitle(),
    statusCode: detail.statusCode,
    statusDisplay: verdictFromCode(detail.statusCode, detail.statusDisplay),
    language: detail.lang,
    runtimeMs: runtimeMs,
    memoryKb: memoryKb,
    totalCorrect: detail.totalCorrect,
    totalTestcases: detail.totalTestcases,
    submittedAt: new Date().toISOString(),
    code: code || editorCodeFallback(),
    codeLang: detail.codeLang || detail.lang || languageFallback()
  }

  // Fire the background message immediately (non-blocking)
  chrome.runtime.sendMessage({ action: "submission_result", payload })

  const isAccepted = statusCode === 10 || payload.statusDisplay === "Accepted"

  if (isAccepted) {
    // Yield to the browser before finishing the session and updating the
    // solved cache, so LeetCode can complete its own AC rendering first.
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "session_finish_v2", language: payload.language })
      const confirmedNonce = expectedNonce || (window as any).__ALGOVAULT_ISOLATED_NONCE__
      window.postMessage({ type: "AV_SUBMISSION_RESULT_CONFIRMED", nonce: confirmedNonce, detail: payload }, window.location.origin || "*")
      chrome.storage.local.get("algovault.solvedSlugs", (result) => {
        const cached = result["algovault.solvedSlugs"] || {}
        const slugs = new Set<string>(Array.isArray(cached?.slugs) ? cached.slugs : [])
        slugs.add(slug)
        chrome.storage.local.set({ "algovault.solvedSlugs": { ...cached, fetchedAt: Date.now(), slugs: Array.from(slugs) } })
      })
    }, 150)
  }
}))

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Activity,
  ArrowUpRight,
  Brain,
  Check,
  ChevronRight,
  Clock3,
  Flame,
  Pause,
  Play,
  RefreshCw,
  Square,
  Target,
  TrendingUp,
  WifiOff,
} from "lucide-react"
import { Card } from "../ui/Card"
import { Skeleton } from "../ui/Skeleton"
import {
  fetchAllSessions,
  fetchDashboard,
  fetchRevisionQueue,
  fetchWeakness,
  reviewRevisionCard
} from "../../lib/api/backend"
import {
  clearCurrentSession,
  getCurrentSession,
  getLastSync,
  getLiveTimer,
  getTodaySnapshot,
  getUsername,
  setCachedDashboard,
  setCachedWeakness,
  setTodaySnapshot
} from "../../lib/storage"
import { normalizeZerotracPayload } from "../../lib/zerotrac"
import { STUDY_LISTS } from "../../lib/study-lists"
import type {
  ActiveSession,
  DashboardData,
  EvidenceBadge,
  LiveTimerState,
  PrimaryAction,
  QuestStep,
  RevisionQueueItem,
  SessionData,
  TodaySnapshot,
  UserContestRanking,
  WeaknessRecommendation,
  WeaknessSnapshot,
  ZerotracProblem
} from "../../lib/types"

const TODAY_SNAPSHOT_VERSION = 2
const STALE_AFTER_MS = 15 * 60 * 1000
const MIN_SOLVES_FOR_STRETCH = 25

type BackgroundResponse<T> = {
  ok?: boolean
  data?: T
  error?: string
}

type QuestId = QuestStep["id"]

interface DayActivity {
  key: string
  label: string
  dateLabel: string
  focusSeconds: number
  solves: number
  sessions: number
}

function message<T>(payload: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve(response)
    })
  })
}

function parseDate(value: unknown): Date | null {
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? null : parsed
  }
  if (Array.isArray(value) && value.every((part) => typeof part === "number")) {
    const [year, month, day, hour = 0, minute = 0, second = 0] = value
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day, hour, minute, second)
  }
  return null
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

function formatLiveTimer(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(safeSeconds / 60)
  const secs = safeSeconds % 60
  const hours = Math.floor(mins / 60)
  const displayMins = mins % 60

  if (hours > 0) {
    return `${hours}:${String(displayMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
}

function formatCompactDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60))
  if (minutes >= 60) return `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)}h`
  return `${minutes}m`
}

function relativeTime(timestamp: number | null) {
  if (!timestamp) return "Not synced yet"
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return "Synced just now"
  if (minutes < 60) return `Synced ${minutes}m ago`
  if (minutes < 24 * 60) return `Synced ${Math.floor(minutes / 60)}h ago`
  return `Synced ${Math.floor(minutes / (24 * 60))}d ago`
}

function isStale(timestamp: number | null) {
  return !timestamp || Date.now() - timestamp > STALE_AFTER_MS
}

function normalizeTimer(timer: LiveTimerState | null, session: ActiveSession | null): LiveTimerState | null {
  if (timer) {
    return {
      ...timer,
      activeFocusSeconds: Math.max(0, timer.activeFocusSeconds ?? timer.focusSeconds ?? 0),
      status: timer.status ?? (timer.isPaused ? "paused" : "running"),
      isPaused: timer.isPaused ?? timer.status === "paused",
      updatedAt: timer.updatedAt ?? Date.now()
    }
  }
  if (!session?.id || session.endedAt) return null
  return {
    activeFocusSeconds: Math.max(0, session.focusSeconds ?? 0),
    focusSeconds: Math.max(0, session.focusSeconds ?? 0),
    status: "running",
    isPaused: false,
    sessionId: session.id,
    mode: session.mode,
    updatedAt: Date.now()
  }
}

function selectStudyProblem(solved: Set<string>) {
  for (const list of STUDY_LISTS) {
    const problem = list.problems.find((candidate) => !solved.has(candidate.slug))
    if (problem) return { list, problem }
  }
  return null
}

function evidenceTone(level?: string): EvidenceBadge["tone"] {
  if (level === "STRONG") return "emerald"
  if (level === "MODERATE") return "blue"
  return "zinc"
}

function evidenceLabel(level?: string) {
  if (level === "STRONG") return "Evidence: strong"
  if (level === "MODERATE") return "Evidence: moderate"
  if (level === "PRELIMINARY") return "Evidence: preliminary"
  return "Evidence: building"
}

function ActionButton({
  href,
  onClick,
  children,
  tone = "zinc",
  disabled = false,
  className: extraClassName = ""
}: {
  href?: string
  onClick?: () => void
  children: ReactNode
  tone?: "zinc" | "amber" | "blue"
  disabled?: boolean
  className?: string
}) {
  const tones = {
    zinc: "border-zinc-700 bg-zinc-100 text-zinc-950 hover:bg-white",
    amber: "border-amber-400/50 bg-amber-400 text-zinc-950 hover:bg-amber-300",
    blue: "border-sky-400/50 bg-sky-400 text-zinc-950 hover:bg-sky-300"
  }
  const className = `inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-[11px] font-bold transition-colors ${tones[tone]} ${disabled ? "cursor-not-allowed opacity-45" : ""} ${extraClassName}`

  if (href) {
    return <a href={href} target="_blank" rel="noreferrer" className={className}>{children} <ArrowUpRight size={13} /></a>
  }
  return <button type="button" onClick={onClick} disabled={disabled} className={className}>{children}</button>
}

function Badge({ badge }: { badge: EvidenceBadge }) {
  const tone = {
    amber: "border-amber-400/25 bg-amber-400/[0.08] text-amber-300",
    blue: "border-sky-400/25 bg-sky-400/[0.08] text-sky-300",
    emerald: "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300",
    zinc: "border-zinc-700/80 bg-zinc-900/70 text-zinc-400"
  }[badge.tone]
  return <span className={`rounded-full border px-2 py-0.5 text-[8px] font-mono font-semibold ${tone}`}>{badge.label}</span>
}

function QuestIcon({ id, status }: { id: QuestId; status: QuestStep["status"] }) {
  const className = status === "complete" ? "text-emerald-400" : id === "review" ? "text-amber-400" : id === "practice" ? "text-sky-400" : "text-violet-400"
  const shell = status === "complete" ? "bg-emerald-400/10" : id === "review" ? "bg-amber-400/10" : id === "practice" ? "bg-sky-400/10" : "bg-violet-400/10"
  const icon = status === "complete" ? <Check size={14} /> : id === "review" ? <Brain size={14} /> : id === "practice" ? <Target size={14} /> : <TrendingUp size={14} />
  return <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${shell} ${className}`}>{icon}</div>
}

export const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null)
  const [queue, setQueue] = useState<RevisionQueueItem[]>([])
  const [weakness, setWeakness] = useState<WeaknessSnapshot | null>(null)
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [solved, setSolved] = useState<Set<string>>(new Set())
  const [zerotrac, setZerotrac] = useState<ZerotracProblem[]>([])
  const [ranking, setRanking] = useState<UserContestRanking | null>(null)
  const [currentSession, setCurrentSessionState] = useState<ActiveSession | null>(null)
  const [liveTimer, setLiveTimerState] = useState<LiveTimerState | null>(null)
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [snapshotSavedAt, setSnapshotSavedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewedToday, setReviewedToday] = useState(false)
  const [sessionActionPending, setSessionActionPending] = useState(false)

  const applySnapshot = useCallback((snapshot: TodaySnapshot) => {
    setData(snapshot.data)
    setQueue(snapshot.queue)
    setWeakness(snapshot.weakness)
    setSessions(snapshot.sessions)
    setSolved(new Set(snapshot.solved))
    setZerotrac(snapshot.zerotrac)
    setRanking(snapshot.ranking)
    setSnapshotSavedAt(snapshot.savedAt)
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const username = await getUsername()
      const [dashboard, reviews, weak, allSessions, solvedResponse, zerotracResponse, rankingResponse] = await Promise.all([
        fetchDashboard(),
        fetchRevisionQueue().catch((): RevisionQueueItem[] => []),
        fetchWeakness().catch((): WeaknessSnapshot | null => null),
        fetchAllSessions().catch((): SessionData[] => []),
        message<BackgroundResponse<string[]>>({ action: "get_solved_problem_slugs" }).catch((): BackgroundResponse<string[]> => ({})),
        message<unknown>({ action: "get_zerotrac" }).catch((): unknown => null),
        username
          ? message<BackgroundResponse<{ userContestRanking?: UserContestRanking }>>({ action: "get_user_contest_history", payload: { username } }).catch((): BackgroundResponse<{ userContestRanking?: UserContestRanking }> => ({}))
          : Promise.resolve<BackgroundResponse<{ userContestRanking?: UserContestRanking }>>({})
      ])

      const snapshot: TodaySnapshot = {
        schemaVersion: TODAY_SNAPSHOT_VERSION,
        data: dashboard,
        queue: reviews,
        weakness: weak,
        sessions: allSessions,
        solved: solvedResponse.ok && Array.isArray(solvedResponse.data) ? solvedResponse.data : [],
        zerotrac: normalizeZerotracPayload(zerotracResponse),
        ranking: rankingResponse.ok ? rankingResponse.data?.userContestRanking ?? null : null,
        savedAt: Date.now()
      }
      applySnapshot(snapshot)
      await setTodaySnapshot(snapshot)
      await setCachedDashboard(dashboard)
      if (weak) await setCachedWeakness(weak)
      setError(null)
    } catch (refreshError: unknown) {
      const message = refreshError instanceof Error ? refreshError.message : "Could not refresh your command center."
      setError(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [applySnapshot])

  const readSessionState = useCallback(async () => {
    const [session, timer] = await Promise.all([getCurrentSession(), getLiveTimer()])
    setCurrentSessionState(session)
    setLiveTimerState(normalizeTimer(timer, session))
  }, [])

  useEffect(() => {
    let mounted = true
    void Promise.all([getTodaySnapshot(), getLastSync()]).then(([snapshot, syncedAt]) => {
      if (!mounted) return
      if (snapshot?.data) {
        applySnapshot(snapshot)
        setLoading(false)
      }
      setLastSync(syncedAt)
    }).finally(() => {
      if (mounted) void refresh()
    })

    void readSessionState()
    const messageListener = (event: { action?: string }) => {
      if (event.action === "dashboard_refresh") void refresh()
    }
    const storageListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return
      if (changes["algovault.currentSession"] || changes["algovault.liveTimer"]) void readSessionState()
    }
    chrome.runtime.onMessage.addListener(messageListener)
    chrome.storage.onChanged.addListener(storageListener)
    return () => {
      mounted = false
      chrome.runtime.onMessage.removeListener(messageListener)
      chrome.storage.onChanged.removeListener(storageListener)
    }
  }, [applySnapshot, readSessionState, refresh])

  const activeSeconds = liveTimer?.activeFocusSeconds ?? 0
  const sessionStatus = liveTimer?.status ?? (currentSession ? "running" : "idle")
  const sessionIsRunning = sessionStatus === "running" && !liveTimer?.isPaused
  const sessionIsPaused = sessionStatus === "paused" || Boolean(liveTimer?.isPaused)
  const today = dateKey(new Date())

  // Live 1-second ticking interval for active running session
  useEffect(() => {
    if (!sessionIsRunning) return
    const interval = setInterval(() => {
      setLiveTimerState((prev) => {
        if (!prev || prev.status !== "running") return prev
        const nextSecs = (prev.activeFocusSeconds ?? 0) + 1
        return {
          ...prev,
          activeFocusSeconds: nextSecs,
          focusSeconds: nextSecs,
          updatedAt: Date.now()
        }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [sessionIsRunning])

  const activeReview = queue[0] ?? null
  const selectedRecommendation = useMemo<WeaknessRecommendation | null>(() => {
    return weakness?.recommendations?.find((problem) => !solved.has(problem.titleSlug)) ?? null
  }, [solved, weakness])
  const selectedWeakTag = useMemo(() => {
    if (!selectedRecommendation?.tag) return null
    return weakness?.weakTags?.find((tag) => tag.tag === selectedRecommendation.tag) ?? null
  }, [selectedRecommendation?.tag, weakness?.weakTags])
  const studyContinuation = useMemo(() => selectStudyProblem(solved), [solved])

  const primaryAction = useMemo<PrimaryAction>(() => {
    if (activeReview) {
      const interval = Math.max(1, Math.round(activeReview.intervalDays ?? 1))
      return {
        kind: "review",
        eyebrow: "Memory recall",
        title: activeReview.title,
        titleSlug: activeReview.titleSlug,
        explanation: `Due after ${interval} day${interval === 1 ? "" : "s"}. Recall the pattern and invariant before opening the problem.`,
        expectedMinutes: 5,
        actionLabel: "Start recall",
        badges: [
          { label: "Review due", tone: "amber" },
          { label: activeReview.reviewCount ? `${activeReview.reviewCount} prior reviews` : "First review", tone: "zinc" }
        ]
      }
    }
    if (selectedRecommendation) {
      const level = selectedWeakTag?.evidenceLevel
      return {
        kind: "practice",
        eyebrow: "Target practice",
        title: selectedRecommendation.title,
        titleSlug: selectedRecommendation.titleSlug,
        explanation: selectedRecommendation.tag
          ? `A focused practice opportunity in ${selectedRecommendation.tag}. Use this as evidence-building, not a verdict about your ability.`
          : "A recommended problem from your available practice history.",
        expectedMinutes: 30,
        actionLabel: "Open problem",
        badges: [
          { label: selectedRecommendation.tag ?? "Targeted practice", tone: "blue" },
          { label: evidenceLabel(level), tone: evidenceTone(level) },
          ...(selectedWeakTag?.totalAttempted ? [{ label: `${selectedWeakTag.totalAttempted} tagged attempts`, tone: "zinc" as const }] : []),
          ...(selectedRecommendation.actualRating ? [{ label: `Rating ${Math.round(selectedRecommendation.actualRating)}`, tone: "zinc" as const }] : [])
        ]
      }
    }
    if (studyContinuation) {
      return {
        kind: "track",
        eyebrow: "Continue your track",
        title: studyContinuation.problem.title,
        titleSlug: studyContinuation.problem.slug,
        explanation: `Continue ${studyContinuation.list.name} with one focused problem. Consistency beats finding the perfect metric.`,
        expectedMinutes: 25,
        actionLabel: "Continue track",
        badges: [
          { label: studyContinuation.list.name, tone: "blue" },
          { label: studyContinuation.problem.topic, tone: "zinc" }
        ]
      }
    }
    return {
      kind: "baseline",
      eyebrow: "Build your baseline",
      title: "Choose a practice track",
      explanation: "Sync a little history or choose a study track. AlgoVault will earn the right to personalise recommendations from your evidence.",
      actionLabel: "Choose a track",
      badges: [{ label: "No personalised data yet", tone: "zinc" }]
    }
  }, [activeReview, selectedRecommendation, selectedWeakTag?.evidenceLevel, studyContinuation])

  const stretchProblem = useMemo(() => {
    const baseRating = ranking?.rating ?? data?.virtualRating ?? null
    const hasEvidence = (data?.totalSolved ?? 0) >= MIN_SOLVES_FOR_STRETCH
    if (!baseRating || !hasEvidence) return null
    const low = Math.round(baseRating + 150)
    const high = Math.round(baseRating + 250)
    const candidate = zerotrac.find((problem) => !solved.has(problem.TitleSlug) && problem.Rating >= low && problem.Rating <= high)
    return candidate ? { problem: candidate, low, high } : null
  }, [data?.totalSolved, data?.virtualRating, ranking?.rating, solved, zerotrac])

  const targetPracticeSlug = selectedRecommendation?.titleSlug ?? studyContinuation?.problem.slug
  const targetSolved = Boolean(targetPracticeSlug && solved.has(targetPracticeSlug))
  const coreComplete = Number(Boolean(activeReview) && reviewedToday) + Number(Boolean(targetPracticeSlug) && targetSolved)
  const coreAvailable = Number(Boolean(activeReview)) + Number(Boolean(targetPracticeSlug))

  const questSteps = useMemo<QuestStep[]>(() => [
    {
      id: "review",
      status: reviewedToday ? "complete" : activeReview ? "available" : "unavailable",
      title: activeReview?.title ?? "No review due",
      description: activeReview
        ? "Recall the pattern and invariant before checking your old solution."
        : "Your due review queue is clear.",
      titleSlug: activeReview?.titleSlug,
      actionLabel: activeReview ? "Recall" : undefined,
      badges: activeReview ? [{ label: "Review due", tone: "amber" }] : undefined
    },
    {
      id: "practice",
      status: targetSolved ? "complete" : selectedRecommendation || studyContinuation ? "available" : "unavailable",
      title: selectedRecommendation?.title ?? studyContinuation?.problem.title ?? "Choose a practice path",
      description: targetSolved
        ? "Your selected practice problem is solved. Capture what changed your approach."
        : selectedRecommendation?.tag
          ? `${selectedRecommendation.tag} · ${evidenceLabel(selectedWeakTag?.evidenceLevel).replace("Evidence: ", "")}`
          : studyContinuation
            ? `Continue ${studyContinuation.list.name} in ${studyContinuation.problem.topic}.`
            : "Sync history or choose a study list to get a next action.",
      titleSlug: selectedRecommendation?.titleSlug ?? studyContinuation?.problem.slug,
      actionLabel: selectedRecommendation || studyContinuation ? "Practice" : undefined,
      badges: selectedRecommendation?.actualRating
        ? [{ label: `Rating ${Math.round(selectedRecommendation.actualRating)}`, tone: "zinc" }]
        : undefined
    },
    {
      id: "stretch",
      status: stretchProblem ? "available" : "unavailable",
      title: stretchProblem?.problem.Title ?? "Stretch is optional",
      description: stretchProblem
        ? `Optional challenge in your ${stretchProblem.low}–${stretchProblem.high} range. Attempting is success; solving is not required.`
        : (data?.totalSolved ?? 0) < MIN_SOLVES_FOR_STRETCH
          ? `Stretch unlocks after ${MIN_SOLVES_FOR_STRETCH} solved problems with rating evidence.`
          : "No calibrated stretch candidate is available today.",
      titleSlug: stretchProblem?.problem.TitleSlug,
      actionLabel: stretchProblem ? "Attempt" : undefined,
      badges: stretchProblem ? [{ label: `Rating ${Math.round(stretchProblem.problem.Rating)}`, tone: "zinc" }] : undefined
    }
  ], [activeReview, data?.totalSolved, reviewedToday, selectedRecommendation, selectedWeakTag?.evidenceLevel, stretchProblem, studyContinuation, targetSolved])

  const activity = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index): DayActivity => {
      const date = new Date()
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - (6 - index))
      return {
        key: dateKey(date),
        label: date.toLocaleDateString(undefined, { weekday: "narrow" }),
        dateLabel: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        focusSeconds: 0,
        solves: 0,
        sessions: 0
      }
    })
    const byDay = new Map(days.map((day) => [day.key, day]))
    const activeSessionId = currentSession?.id
    for (const session of sessions) {
      if (activeSessionId && session.id === activeSessionId) continue
      const started = parseDate(session.startedAt)
      if (!started) continue
      const bucket = byDay.get(dateKey(started))
      if (!bucket) continue
      bucket.focusSeconds += Math.max(0, session.focusSeconds ?? 0)
      bucket.sessions += 1
    }
    if (currentSession) {
      const started = parseDate(currentSession.startedAt)
      const bucket = started ? byDay.get(dateKey(started)) : byDay.get(today)
      if (bucket) {
        bucket.focusSeconds += activeSeconds
        bucket.sessions += 1
      }
    }
    for (const solve of data?.recentSolves ?? []) {
      const solvedAt = parseDate(solve.solvedAt)
      if (!solvedAt) continue
      const bucket = byDay.get(dateKey(solvedAt))
      if (bucket) bucket.solves += 1
    }
    const todayActivity = byDay.get(today)
    if (todayActivity && data?.todaySolves) todayActivity.solves = Math.max(todayActivity.solves, data.todaySolves)
    const weekFocusSeconds = days.reduce((sum, day) => sum + day.focusSeconds, 0)
    const weekSolves = days.reduce((sum, day) => sum + day.solves, 0)
    const weekSessions = days.reduce((sum, day) => sum + day.sessions, 0)
    const strongestDay = [...days].sort((a, b) => b.focusSeconds - a.focusSeconds)[0]
    return { days, todayActivity, weekFocusSeconds, weekSolves, weekSessions, strongestDay }
  }, [activeSeconds, currentSession, data?.recentSolves, data?.todaySolves, sessions, today])

  const primaryActionHref = primaryAction.titleSlug ? `https://leetcode.com/problems/${primaryAction.titleSlug}/` : undefined
  const maxFocus = Math.max(1, ...activity.days.map((day) => day.focusSeconds))

  const startSession = async () => {
    setSessionActionPending(true)
    try {
      const result = await message<BackgroundResponse<ActiveSession>>({ action: "session_start", mode: "PRACTICE" })
      if (!result.ok || !result.data) throw new Error(result.error || "Unable to start a focus session.")
      setCurrentSessionState(result.data)
      await readSessionState()
      setError(null)
    } catch (sessionError: unknown) {
      setError(sessionError instanceof Error ? sessionError.message : "Unable to start a focus session.")
    } finally {
      setSessionActionPending(false)
    }
  }

  const togglePause = async () => {
    setSessionActionPending(true)
    try {
      const action = sessionIsPaused ? "session_resume" : "session_pause"
      const result = await message<BackgroundResponse<LiveTimerState>>({ action })
      if (!result.ok) throw new Error(result.error || "Unable to update the focus session.")
      await readSessionState()
      setError(null)
    } catch (sessionError: unknown) {
      setError(sessionError instanceof Error ? sessionError.message : "Unable to update the focus session.")
    } finally {
      setSessionActionPending(false)
    }
  }

  const endSession = async () => {
    setSessionActionPending(true)
    try {
      const result = await message<BackgroundResponse<ActiveSession>>({ action: "session_end" })
      if (!result.ok) throw new Error(result.error || "Unable to end the focus session.")
      await clearCurrentSession()
      setCurrentSessionState(null)
      setLiveTimerState(null)
      await refresh()
      setError(null)
    } catch (sessionError: unknown) {
      setError(sessionError instanceof Error ? sessionError.message : "Unable to end the focus session.")
    } finally {
      setSessionActionPending(false)
    }
  }

  const openTrackPicker = () => {
    chrome.storage.local.set({ "algovault.requestedTab": "Lists" })
  }

  const submitReview = async (quality: number) => {
    if (!activeReview) return
    setReviewSubmitting(true)
    try {
      await reviewRevisionCard(activeReview.id, quality)
      setReviewedToday(true)
      setReviewOpen(false)
      await refresh()
    } catch (reviewError: unknown) {
      setError(reviewError instanceof Error ? reviewError.message : "Your review was not saved. Please try again.")
    } finally {
      setReviewSubmitting(false)
    }
  }

  if (loading && !data) {
    return <div className="space-y-3 px-1 pt-1"><Skeleton className="h-52 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div>
  }

  if (!data) {
    return (
      <Card className="mx-1 border-zinc-800/80 p-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800/70 text-zinc-300"><WifiOff size={17} /></div>
        <h2 className="mt-3 text-sm font-semibold text-zinc-100">Your command center is waiting for data.</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">Connect LeetCode and run your first sync. We’ll keep the next action simple once there is evidence to use.</p>
        <button type="button" onClick={() => void refresh()} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-700"><RefreshCw size={12} /> Retry</button>
        {error && <p className="mt-3 text-[10px] text-rose-400">{error}</p>}
      </Card>
    )
  }

  return (
    <main className="mx-auto max-w-2xl space-y-3.5 px-1 pb-7 pt-1 font-sans">
      <section className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#0d0d0f]">
        <div className="pointer-events-none absolute inset-0 opacity-80" style={{ background: "radial-gradient(ellipse 72% 60% at 95% 0%, rgba(251,191,36,0.11), transparent), radial-gradient(ellipse 50% 60% at 0% 100%, rgba(14,165,233,0.06), transparent)" }} />
        <div className="relative px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[9px] font-bold font-mono uppercase tracking-[0.18em] text-amber-400/80">Today · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</p>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 text-[8px] font-mono ${refreshing ? "text-sky-400" : isStale(lastSync ?? snapshotSavedAt) ? "text-amber-400" : "text-zinc-500"}`}>
                {refreshing && <RefreshCw size={10} className="animate-spin" />}
                {isStale(lastSync ?? snapshotSavedAt) && !refreshing && <Clock3 size={10} />}
                {refreshing ? "Refreshing" : relativeTime(lastSync ?? snapshotSavedAt)}
              </span>
              <button type="button" onClick={() => void refresh()} className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200" aria-label="Refresh Today"><RefreshCw size={13} /></button>
            </div>
          </div>

          <div className="mt-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold font-mono uppercase tracking-[0.18em] text-amber-400/80">{primaryAction.eyebrow}</p>
              <h1 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-tight text-zinc-50 sm:text-[24px]">{primaryAction.title}</h1>
              <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-zinc-400">{primaryAction.explanation}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {primaryAction.badges.map((badge) => <Badge key={badge.label} badge={badge} />)}
                {primaryAction.expectedMinutes && <Badge badge={{ label: `~${primaryAction.expectedMinutes} min`, tone: "zinc" }} />}
              </div>
            </div>
            {primaryAction.kind === "review" ? (
              <ActionButton onClick={() => setReviewOpen(true)} tone="amber">{primaryAction.actionLabel}</ActionButton>
            ) : primaryActionHref ? (
              <ActionButton href={primaryActionHref} tone="blue">{primaryAction.actionLabel}</ActionButton>
            ) : (
              <ActionButton onClick={openTrackPicker}>{primaryAction.actionLabel}</ActionButton>
            )}
          </div>

          <div className="mt-5 grid grid-cols-3 divide-x divide-zinc-800/60 border-t border-zinc-800/60 pt-3">
            <div className="pr-3"><span className="block text-[18px] font-bold font-mono tabular-nums text-zinc-100">{data.todaySolves}</span><span className="text-[8px] font-bold font-mono uppercase tracking-[0.14em] text-zinc-600">solved today</span></div>
            <div className="px-3"><span className="block text-[18px] font-bold font-mono tabular-nums text-zinc-100">{formatCompactDuration(activity.todayActivity?.focusSeconds ?? 0)}</span><span className="text-[8px] font-bold font-mono uppercase tracking-[0.14em] text-zinc-600">active time</span></div>
            <div className="pl-3"><span className="block text-[18px] font-bold font-mono tabular-nums text-zinc-100">{data.currentStreak}d</span><span className="text-[8px] font-bold font-mono uppercase tracking-[0.14em] text-zinc-600">solve streak</span></div>
          </div>
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/60 bg-black/25 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sessionIsRunning ? "bg-emerald-400 animate-pulse" : sessionIsPaused ? "bg-amber-400" : "bg-zinc-700"}`} />
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-zinc-300">{sessionIsRunning ? "Focus session active" : sessionIsPaused ? "Focus session paused" : "Focus session"}</p>
              <p className="text-[9px] text-zinc-600">{sessionIsRunning ? "Observed active time only" : sessionIsPaused ? "Timer is not accumulating" : "Start when you want time recorded"}</p>
            </div>
          </div>
          {liveTimer || currentSession ? (
            <div className="flex items-center gap-2">
              <span className={`mr-1 font-mono text-sm font-bold tabular-nums ${sessionIsPaused ? "text-amber-300" : "text-emerald-400"}`}>{formatLiveTimer(activeSeconds)}</span>
              <button type="button" disabled={sessionActionPending} onClick={() => void togglePause()} className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-700/80 px-2 text-[9px] font-bold font-mono uppercase tracking-wide text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-50" aria-label={sessionIsPaused ? "Resume focus session" : "Pause focus session"}>{sessionIsPaused ? <Play size={10} fill="currentColor" /> : <Pause size={10} fill="currentColor" />}{sessionIsPaused ? "Resume" : "Pause"}</button>
              <button type="button" disabled={sessionActionPending} onClick={() => void endSession()} className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-900/60 px-2 text-[9px] font-bold font-mono uppercase tracking-wide text-rose-300 transition hover:border-rose-700 hover:text-rose-200 disabled:opacity-50" aria-label="End focus session"><Square size={9} fill="currentColor" /> End</button>
            </div>
          ) : (
            <button type="button" disabled={sessionActionPending} onClick={() => void startSession()} className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/70 px-2.5 text-[9px] font-bold font-mono uppercase tracking-wide text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-700 hover:text-white disabled:opacity-50"><Play size={9} fill="currentColor" /> Start</button>
          )}
        </div>
      </section>

      {reviewOpen && activeReview && (
        <section className="rounded-2xl border border-amber-400/25 bg-[#15120b] p-4 sm:p-5" aria-live="polite">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold font-mono uppercase tracking-[0.16em] text-amber-300">Active recall</p><h2 className="mt-1 text-[15px] font-semibold text-zinc-100">Before opening {activeReview.title}</h2></div><button type="button" onClick={() => setReviewOpen(false)} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" aria-label="Close recall prompt">×</button></div>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">Name the pattern, state its invariant, and identify one boundary case. Then open the problem only to check your recall.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2"><ActionButton href={`https://leetcode.com/problems/${activeReview.titleSlug}/`} tone="amber">Open for recall</ActionButton><span className="text-[9px] text-zinc-500">When you are ready, log the quality of your recall below.</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[[1, "Forgot"], [2, "Hard"], [4, "Good"], [5, "Easy"]].map(([quality, label]) => <button key={label as string} type="button" disabled={reviewSubmitting} onClick={() => void submitReview(quality as number)} className="rounded-lg border border-zinc-800 bg-black/30 px-2 py-2 text-[10px] font-mono font-semibold text-zinc-300 transition hover:border-amber-400/45 hover:text-amber-200 disabled:opacity-40">{label as string}</button>)}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-zinc-800/70 bg-[#0d0d0f]">
        <div className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-3 sm:px-5"><div><p className="text-[9px] font-bold font-mono uppercase tracking-[0.18em] text-zinc-500">Today’s practice sequence</p><p className="mt-0.5 text-[10px] text-zinc-600">Two core actions, then an optional stretch.</p></div><span className="text-[10px] font-mono font-bold tabular-nums text-zinc-400">{coreAvailable ? `${coreComplete}/${coreAvailable}` : "Ready"}</span></div>
        <div className="divide-y divide-zinc-800/50">
          {questSteps.map((step, index) => {
            const href = step.titleSlug ? `https://leetcode.com/problems/${step.titleSlug}/` : undefined
            return <article key={step.id} className={`flex gap-3 p-4 sm:p-5 ${step.status === "complete" ? "bg-emerald-500/[0.025]" : ""}`}>
              <div className="flex flex-col items-center"><QuestIcon id={step.id} status={step.status} />{index < questSteps.length - 1 && <div className="mt-2 h-full min-h-5 w-px bg-zinc-800/70" />}</div>
              <div className="min-w-0 flex-1 pb-1"><div className="flex flex-wrap items-center gap-2"><p className="text-[8px] font-bold font-mono uppercase tracking-[0.16em] text-zinc-500">{index + 1}. {step.id === "review" ? "Memory recall" : step.id === "practice" ? "Target practice" : "Optional stretch"}</p>{step.status === "complete" && <span className="text-[8px] font-mono font-bold uppercase text-emerald-400">complete</span>}</div><h2 className={`mt-1 text-[13px] font-semibold ${step.status === "unavailable" ? "text-zinc-500" : "text-zinc-100"}`}>{step.title}</h2><p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{step.description}</p>{step.badges && <div className="mt-2 flex flex-wrap gap-1.5">{step.badges.map((badge) => <Badge key={badge.label} badge={badge} />)}</div>}</div>
              {step.status === "available" && (step.id === "review" ? <button type="button" onClick={() => setReviewOpen(true)} className="inline-flex h-8 shrink-0 items-center gap-1 self-center rounded-md border border-amber-400/40 bg-amber-400 px-2.5 text-[9px] font-bold text-zinc-950 hover:bg-amber-300">Recall <ChevronRight size={11} /></button> : href ? <ActionButton href={href} tone={step.id === "practice" ? "blue" : "zinc"} className="self-center">{step.actionLabel ?? "Open"}</ActionButton> : null)}
            </article>
          })}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-zinc-800/70 bg-[#0d0d0f] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold font-mono uppercase tracking-[0.18em] text-zinc-500">Your practice time</p><p className="mt-1 text-[11px] text-zinc-400">{formatDuration(activity.weekFocusSeconds)} active this week · {activity.weekSolves} solved</p></div><Activity size={16} className="text-amber-400/80" /></div>
          <div className="mt-5 flex h-[106px] items-end justify-between gap-1.5">
            {activity.days.map((day) => {
              const isToday = day.key === today
              const height = day.focusSeconds ? Math.max(8, (day.focusSeconds / maxFocus) * 70) : 3
              const label = `${day.dateLabel}: ${formatDuration(day.focusSeconds)} active, ${day.solves} solve${day.solves === 1 ? "" : "s"}, ${day.sessions} session${day.sessions === 1 ? "" : "s"}`
              return <div key={day.key} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={label} aria-label={label}>
                <span className={`text-[8px] font-mono tabular-nums transition-opacity ${day.focusSeconds ? "text-zinc-400" : "text-transparent"}`}>{formatCompactDuration(day.focusSeconds)}</span>
                <div className={`w-full rounded-sm transition-all duration-300 group-hover:brightness-125 ${isToday ? "bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.22)]" : day.focusSeconds ? "bg-zinc-600" : "bg-zinc-800/60"}`} style={{ height: `${height}px`, maxWidth: 32 }} />
                <span className={`text-[8px] font-mono ${isToday ? "font-bold text-amber-300" : "text-zinc-600"}`}>{day.label}</span>
              </div>
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800/50 pt-3 text-[9px] font-mono text-zinc-500"><span>{activity.weekSessions} focused sessions</span><span>Best day: {activity.strongestDay?.focusSeconds ? `${activity.strongestDay.dateLabel} · ${formatCompactDuration(activity.strongestDay.focusSeconds)}` : "start your first"}</span></div>
        </div>

        <div className="rounded-2xl border border-zinc-800/70 bg-[#0d0d0f] p-4 sm:p-5">
          <p className="text-[9px] font-bold font-mono uppercase tracking-[0.18em] text-zinc-500">What you did</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400"><Check size={13} /></div><div><p className="text-[11px] font-medium text-zinc-200">{data.todaySolves} problem{data.todaySolves === 1 ? "" : "s"} solved today</p><p className="text-[9px] text-zinc-600">{data.todaySubmissions} submission{data.todaySubmissions === 1 ? "" : "s"} recorded</p></div></div>
            <div className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400"><Clock3 size={13} /></div><div><p className="text-[11px] font-medium text-zinc-200">{formatDuration(activity.todayActivity?.focusSeconds ?? 0)} active practice</p><p className="text-[9px] text-zinc-600">Only explicit focus sessions are counted</p></div></div>
            <div className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-400/10 text-sky-400"><Flame size={13} /></div><div><p className="text-[11px] font-medium text-zinc-200">{data.currentStreak}-day solve streak</p><p className="text-[9px] text-zinc-600">Progress is a record, not a requirement</p></div></div>
          </div>
        </div>
      </section>

      {error && <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-900/40 bg-rose-950/20 px-3 py-2 text-[10px] text-rose-300"><span>{error}</span><button type="button" onClick={() => void refresh()} className="shrink-0 font-semibold underline underline-offset-2">Retry</button></div>}
    </main>
  )
}

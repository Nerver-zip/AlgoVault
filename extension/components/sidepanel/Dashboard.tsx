import { useEffect, useMemo, useState } from "react"
import { ArrowUpRight, Check, Circle, Clock3, Flame, Play, RotateCcw, Sparkles, Square, Target } from "lucide-react"
import { Card } from "../ui/Card"
import { Skeleton } from "../ui/Skeleton"
import { fetchAllSessions, fetchDashboard, fetchRevisionQueue, fetchWeakness, reviewRevisionCard } from "../../lib/api/backend"
import { getLastSync, getUsername, setCachedDashboard, setCachedWeakness } from "../../lib/storage"
import { normalizeZerotracPayload } from "../../lib/zerotrac"
import { STUDY_LISTS } from "../../lib/study-lists"
import type { DashboardData, SessionData } from "../../lib/types"

type RevisionCard = {
  id: number
  title: string
  titleSlug: string
  confidence?: number
  intervalDays?: number
}

type Recommendation = {
  title: string
  titleSlug: string
  tag?: string
  difficulty?: string
  actualRating?: number
}

type WeaknessData = {
  weakTags?: Array<{ tag: string; masteryScore?: number }>
  recommendations?: Recommendation[]
}

type RatedProblem = {
  title: string
  slug: string
  rating: number
  contest?: string
}

type TodaySnapshot = {
  data: DashboardData
  queue: RevisionCard[]
  weakness: WeaknessData | null
  sessions: SessionData[]
  solved: string[]
  zerotrac: any[] | null
  ranking: any
  savedAt: number
}

function message<T>(payload: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError)
      else resolve(response as T)
    })
  })
}

function parseDate(value: unknown): Date | null {
  if (!value) return null
  if (Array.isArray(value)) {
    const [year, month, day, hour = 0, minute = 0, second = 0] = value as number[]
    return new Date(year, month - 1, day, hour, minute, second)
  }
  const date = new Date(value as string)
  return Number.isNaN(date.valueOf()) ? null : date
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

function relativeSync(timestamp: number | null) {
  if (!timestamp) return "Sync status unavailable"
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return "Synced just now"
  if (minutes < 60) return `Synced ${minutes}m ago`
  return `Synced ${Math.floor(minutes / 60)}h ago`
}

const ActionButton = ({ href, children, tone = "zinc" }: { href: string; children: React.ReactNode; tone?: "zinc" | "amber" | "blue" }) => {
  const tones = {
    zinc: "border-zinc-700 bg-zinc-100 text-zinc-950 hover:bg-white",
    amber: "border-amber-400/50 bg-amber-400 text-zinc-950 hover:bg-amber-300",
    blue: "border-blue-400/50 bg-blue-400 text-zinc-950 hover:bg-blue-300"
  }
  return <a href={href} target="_blank" rel="noreferrer" className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-bold transition-colors ${tones[tone]}`}>{children} <ArrowUpRight size={13} /></a>
}

interface UserContestRanking { rating?: number; attendedContestsCount?: number; globalRanking?: number; topPercentage?: number; }
interface LiveSession { isActive?: boolean; startTime?: number; titleSlug?: string; }
interface ZerotracRecord { titleSlug?: string; TitleSlug?: string; rating?: number; Rating?: number; Title?: string; title?: string; title_slug?: string; ContestSlug?: string; contestSlug?: string; }

export const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null)
  const [queue, setQueue] = useState<RevisionCard[]>([])
  const [weakness, setWeakness] = useState<WeaknessData | null>(null)
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [solved, setSolved] = useState<Set<string>>(new Set())
  const [zerotrac, setZerotrac] = useState<ZerotracRecord[] | null>(null)
  const [ranking, setRanking] = useState<UserContestRanking | null>(null)
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null)
  const [sessionSeconds, setSessionSeconds] = useState(0)
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)

  const applySnapshot = (snapshot: TodaySnapshot) => {
    setData(snapshot.data)
    setQueue(snapshot.queue)
    setWeakness(snapshot.weakness)
    setSessions(snapshot.sessions)
    setSolved(new Set(snapshot.solved))
    setZerotrac(snapshot.zerotrac)
    setRanking(snapshot.ranking)
  }

  const refresh = async () => {
    const username = await getUsername()
    setRefreshing(true)
    try {
      const [dashboard, reviews, weak, allSessions, solvedResponse, zerotracResponse, rankingResponse] = await Promise.all([
        fetchDashboard(),
        fetchRevisionQueue().catch(() => []),
        fetchWeakness().catch(() => null),
        fetchAllSessions().catch(() => []),
        message<any>({ action: "get_solved_problem_slugs" }).catch(() => null),
        message<any>({ action: "get_zerotrac" }).catch(() => null),
        message<any>({ action: "get_user_contest_history", payload: { username } }).catch(() => null)
      ])
      const snapshot: TodaySnapshot = {
        data: dashboard,
        queue: Array.isArray(reviews) ? reviews : [],
        weakness: weak,
        sessions: Array.isArray(allSessions) ? allSessions : [],
        solved: solvedResponse?.ok ? solvedResponse.data : [],
        zerotrac: normalizeZerotracPayload(zerotracResponse),
        ranking: rankingResponse?.ok ? rankingResponse.data?.userContestRanking : null,
        savedAt: Date.now()
      }
      applySnapshot(snapshot)
      chrome.storage.local.set({ "algovault.todaySnapshot": snapshot })
      setCachedDashboard(dashboard)
      if (weak) setCachedWeakness(weak)
      setError(null)
    } catch (refreshError: any) {
      console.error("Dashboard refresh failed", refreshError)
      if (!data) setError(refreshError?.message || "Could not load your dashboard")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    Promise.all([
      new Promise<TodaySnapshot | null>((resolve) => chrome.storage.local.get("algovault.todaySnapshot", (stored) => resolve(stored?.["algovault.todaySnapshot"] || null))),
      getLastSync()
    ]).then(([snapshot, cachedSync]) => {
      if (snapshot?.data) {
        applySnapshot(snapshot)
        setLoading(false)
      }
      setLastSync(cachedSync)
    }).finally(refresh)

    const listener = (event: any) => event.action === "dashboard_refresh" && refresh()
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  // ── Live-ticking session timer ──
  // Instead of reading stale focusSeconds from chrome.storage every second,
  // we read the session start time once and compute elapsed locally.
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null)

  useEffect(() => {
    // Read initial session state from storage
    const readSession = () => chrome.storage.local.get(
      ["algovault.currentSession", "algovault.sessionState", "algovault.liveTimer"],
      (stored) => {
        const current = stored?.["algovault.currentSession"]
        const state = stored?.["algovault.sessionState"]
        const live = stored?.["algovault.liveTimer"]
        const session = current || live || null
        setLiveSession(session)

        if (state?.isSolved) {
          // Problem was solved — freeze the timer at final time
          setSessionSeconds(state.finalSeconds || 0)
          setSessionStartTime(null)
        } else if (session) {
          // Active session — compute start time for live ticking
          // Use the session's startedAt if available, otherwise approximate from focusSeconds
          if (current?.startedAt) {
            const started = Array.isArray(current.startedAt)
              ? new Date(current.startedAt[0], current.startedAt[1] - 1, current.startedAt[2], current.startedAt[3] || 0, current.startedAt[4] || 0, current.startedAt[5] || 0).getTime()
              : new Date(current.startedAt).getTime()
            if (!isNaN(started)) {
              setSessionStartTime(started)
              setSessionSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)))
              return
            }
          }
          // Fallback: use liveTimer's elapsedSeconds or focusSeconds snapshot
          const snap = live?.elapsedSeconds ?? live?.focusSeconds ?? current?.focusSeconds ?? 0
          // Reconstruct start time from snapshot so the counter continues live
          setSessionStartTime(Date.now() - snap * 1000)
          setSessionSeconds(snap)
        } else {
          setSessionStartTime(null)
          setSessionSeconds(0)
        }
      }
    )
    readSession()

    // Listen for storage changes to pick up session start/end from content script
    const storageListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && (changes["algovault.currentSession"] || changes["algovault.sessionState"] || changes["algovault.liveTimer"])) {
        readSession()
      }
    }
    chrome.storage.onChanged.addListener(storageListener)
    return () => chrome.storage.onChanged.removeListener(storageListener)
  }, [])

  // Live tick — updates every second when a session is active
  useEffect(() => {
    if (!sessionStartTime || !liveSession) return
    const tick = () => setSessionSeconds(Math.max(0, Math.floor((Date.now() - sessionStartTime) / 1000)))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [sessionStartTime, liveSession])

  const today = dateKey(new Date())
  const activity = useMemo(() => {
    const minutesByDay: Record<string, number> = {}
    for (const session of sessions) {
      const started = parseDate(session.startedAt)
      if (!started) continue
      const key = dateKey(started)
      minutesByDay[key] = (minutesByDay[key] || 0) + Math.round((session.focusSeconds || 0) / 60)
    }

    const liveMinutes = Math.round(sessionSeconds / 60)
    if (liveMinutes > 0) {
      minutesByDay[today] = Math.max(minutesByDay[today] || 0, liveMinutes)
    }

    const days = Array.from({ length: 7 }, (_, index) => {
      const day = new Date()
      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - (6 - index))
      const key = dateKey(day)
      return { key, label: day.toLocaleDateString(undefined, { weekday: "narrow" }), minutes: minutesByDay[key] || 0 }
    })
    return { days, todayMinutes: minutesByDay[today] || 0 }
  }, [sessions, today, sessionSeconds])

  const planningRange = useMemo(() => {
    if (ranking?.rating && ranking.attendedContestsCount && ranking.attendedContestsCount > 0) {
      const rating = Math.round(ranking.rating)
      return { low: rating + 150, high: rating + 250, source: "official contest rating" }
    }
    if (data?.virtualRating) {
      return { low: data.virtualRating + 150, high: data.virtualRating + 250, source: "planning estimate" }
    }
    return null
  }, [data?.virtualRating, ranking])

  const recommendedPractice = useMemo(() => {
    const backendRecommendation = weakness?.recommendations?.find((problem) => !solved.has(problem.titleSlug))
    if (backendRecommendation) return backendRecommendation
    return null
  }, [solved, weakness])

  const stretchProblem = useMemo<RatedProblem | null>(() => {
    if (!planningRange || !zerotrac) return null
    const candidate = zerotrac.find((problem) => {
      const rating = Number(problem.Rating ?? problem.rating ?? 0)
      const slug = problem.TitleSlug ?? problem.title_slug ?? problem.titleSlug
      return slug && !solved.has(slug) && rating >= planningRange.low && rating <= planningRange.high
    })
    if (!candidate) return null
    return {
      title: candidate.Title ?? candidate.title ?? candidate.TitleSlug ?? candidate.titleSlug ?? "Stretch Problem",
      slug: (candidate.TitleSlug ?? candidate.title_slug ?? candidate.titleSlug)!,
      rating: Number(candidate.Rating ?? candidate.rating ?? 0),
      contest: candidate.ContestSlug ?? candidate.contestSlug
    }
  }, [planningRange, solved, zerotrac])

  const curatedReview = useMemo(() => {
    for (const list of STUDY_LISTS) {
      const listSlugs = new Set(list.problems.map((problem) => problem.slug))
      const card = queue.find((review) => listSlugs.has(review.titleSlug))
      if (card) return { card, listName: list.name }
    }
    if (queue.length > 0) {
      return { card: queue[0], listName: "Spaced Revision" }
    }
    return null
  }, [queue])
  
  const activeReview = curatedReview?.card
  const hasPracticeSignal = (data?.todaySolves || 0) > 0
  const actions = [Boolean(activeReview), Boolean(recommendedPractice), Boolean(stretchProblem)]
  const completedActions = actions.filter((available, index) => available && (index === 1 ? hasPracticeSignal : false)).length
  const openActions = actions.filter(Boolean).length - completedActions
  const maxMinutes = Math.max(1, ...activity.days.map((day) => day.minutes))

  const startSession = () => message<any>({ action: "session_start", mode: "PRACTICE" }).then((result) => {
    if (result?.ok) {
      setLiveSession(result.data)
      // Start live timer immediately — don't wait for storage
      setSessionStartTime(Date.now())
      setSessionSeconds(0)
    }
  })
  const endSession = () => message<any>({ action: "session_end" }).then((result) => {
    if (result?.ok) {
      // Clear session state instantly — no refresh flicker
      setLiveSession(null)
      setSessionStartTime(null)
      chrome.storage.local.remove(["algovault.sessionState", "algovault.liveTimer"])
      // Quiet background refresh to update today's tracked minutes
      refresh()
    }
  })
  const resetSession = () => message<any>({ action: "session_end" }).then(() => startSession())

  const submitReview = async (quality: number) => {
    if (!activeReview) return
    setReviewSubmitting(true)
    try {
      await reviewRevisionCard(activeReview.id, quality)
      setReviewing(false)
      await refresh()
    } catch (submitError) {
      console.error("Review submit failed", submitError)
      setError("Your review was not saved. Please try again.")
    } finally {
      setReviewSubmitting(false)
    }
  }

  const productivityInsight = useMemo(() => {
    if (liveSession) {
      return {
        badge: "SESSION RUNNING",
        badgeColor: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
        headline: "You're in the zone. Work one problem at a time.",
        subtext: "Focus timer is actively recording — stay deliberate and present."
      }
    }

    const solves = data?.todaySolves || 0
    const minutes = activity.todayMinutes || 0
    const dueReviews = queue.length

    if (solves >= 3) {
      return {
        badge: "INSANE PRODUCTIVITY",
        badgeColor: "text-amber-400 border-amber-400/30 bg-amber-400/10",
        headline: `Crushing it today — ${solves} problems solved!`,
        subtext: `${formatDuration(minutes * 60)} of focused practice recorded. Your momentum is building.`
      }
    }

    if (solves >= 1) {
      return {
        badge: "PRODUCTIVE DAY",
        badgeColor: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
        headline: `Solid work — ${solves} solve${solves > 1 ? "s" : ""} logged today.`,
        subtext: dueReviews > 0 
          ? `${dueReviews} review card${dueReviews > 1 ? "s" : ""} waiting in queue to keep memory sharp.` 
          : "Your daily practice target is complete. Keep pushing or rest up."
      }
    }

    if (dueReviews > 0) {
      return {
        badge: "CARDS OVERDUE",
        badgeColor: "text-rose-400 border-rose-400/30 bg-rose-400/10",
        headline: `${dueReviews} review card${dueReviews > 1 ? "s" : ""} due for recall today.`,
        subtext: "Clear your overdue cards first to prevent memory decay on key patterns."
      }
    }

    return {
      badge: "READY TO TRAIN",
      badgeColor: "text-sky-400 border-sky-400/30 bg-sky-400/10",
      headline: "Your training queue is clear and ready.",
      subtext: "Sequential plan: recall existing patterns, practice target gaps, then stretch."
    }
  }, [liveSession, data?.todaySolves, activity.todayMinutes, queue.length])

  if (loading && !data) {
    return <div className="space-y-3 p-3"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>
  }

  if (!data) {
    return <div className="p-4"><Card className="border-red-500/30"><p className="text-sm font-semibold text-red-300">Dashboard unavailable</p><p className="mt-1 text-xs text-zinc-400">{error || "Connect your account and sync a submission to start."}</p></Card></div>
  }

  return <main className="mx-auto max-w-2xl space-y-3.5 px-1 pb-6 pt-1 font-sans">

    {/* ═══════════ HERO — TODAY'S OVERVIEW ═══════════ */}
    <section className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#0d0d0f]">
      {/* Warm ambient gradient overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-60" 
        style={{
          background: 'radial-gradient(ellipse 70% 50% at 85% 10%, rgba(251,191,36,0.09), transparent), radial-gradient(ellipse 60% 60% at 10% 90%, rgba(168,85,247,0.06), transparent)'
        }} 
      />

      <div className="relative px-5 pt-5 pb-4">
        {/* Date + Productivity Badge Row */}
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold font-mono uppercase tracking-[0.2em] text-amber-400/80">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase border ${productivityInsight.badgeColor}`}>
              {productivityInsight.badge}
            </span>
            <span className="text-[8px] font-mono text-zinc-600">{refreshing ? "syncing…" : relativeSync(lastSync)}</span>
          </div>
        </div>

        {/* Main Content Row */}
        <div className="mt-3.5 flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-semibold tracking-tight text-zinc-100 leading-snug">
              {productivityInsight.headline}
            </h1>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 max-w-[320px]">
              {productivityInsight.subtext}
            </p>
          </div>

          {/* Today's Counter — Hero Number */}
          <div className="shrink-0 text-right">
            <span className="block text-[38px] font-bold font-mono tabular-nums tracking-tighter text-zinc-100 leading-none">
              {data.todaySolves || 0}
            </span>
            <span className="block mt-1 text-[8px] font-bold font-mono uppercase tracking-[0.2em] text-zinc-600">
              solved today
            </span>
          </div>
        </div>

        {/* Stat Strip */}
        <div className="mt-4 flex items-center gap-4 border-t border-zinc-800/50 pt-3">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
            <Clock3 size={11} className="text-amber-400/80" />
            <span className="tabular-nums text-zinc-300 font-semibold">{formatDuration(activity.todayMinutes * 60)}</span> tracked
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
            <Flame size={11} className="text-orange-400/80" />
            <span className="tabular-nums text-zinc-300 font-semibold">{data.currentStreak || 0}</span>-day streak
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
            <Target size={11} className="text-purple-400/70" />
            <span className="tabular-nums text-zinc-300 font-semibold">{data.todaySubmissions || 0}</span> submissions
          </span>
        </div>
      </div>

      {/* Focus Session Strip */}
      <div className="border-t border-zinc-800/50 px-5 py-2.5 flex items-center justify-between gap-3 bg-black/30">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${liveSession ? "bg-emerald-400 animate-pulse" : "bg-zinc-700"}`} />
          <span className="text-[10px] font-mono text-zinc-400 truncate">
            {liveSession ? "Session running" : "Focus timer"}
          </span>
        </div>
        {liveSession ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold tabular-nums text-emerald-400">{formatDuration(sessionSeconds)}</span>
            <button onClick={resetSession} className="rounded-md border border-zinc-700/60 p-1.5 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition" title="Restart Session"><RotateCcw size={10} /></button>
            <button onClick={endSession} className="rounded-md border border-red-900/40 p-1.5 text-red-400/80 hover:text-red-300 hover:border-red-800/60 transition" title="End Session"><Square size={9} fill="currentColor" /></button>
          </div>
        ) : (
          <button onClick={startSession} className="inline-flex items-center gap-1 rounded-md border border-zinc-700/60 bg-zinc-800/40 px-2.5 py-1 text-[9px] font-bold font-mono uppercase tracking-wider text-zinc-300 hover:text-white hover:border-zinc-500 transition">
            <Play size={9} fill="currentColor" /> Start
          </button>
        )}
      </div>
    </section>

    {/* ═══════════ TODAY'S QUEST ═══════════ */}
    <section className="overflow-hidden rounded-2xl border border-zinc-800/60 bg-[#0d0d0f]">
      <div className="flex items-center justify-between border-b border-zinc-800/40 px-4 py-3">
        <p className="text-[9px] font-bold font-mono uppercase tracking-[0.2em] text-zinc-500">Today's quest</p>
        <span className="text-[9px] font-mono font-bold tabular-nums text-zinc-600">{completedActions}/{actions.filter(Boolean).length || 0} complete</span>
      </div>

      <div className="divide-y divide-zinc-800/30">
        {/* Step 1: Review */}
        <article className="p-4 flex items-start gap-3.5">
          <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/10 shrink-0">
            <Sparkles size={13} className="text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-bold font-mono uppercase tracking-[0.2em] text-amber-400/70">Review{activeReview ? ` · ${curatedReview?.listName}` : ""}</p>
            <h2 className="mt-1 truncate text-[13px] font-semibold text-zinc-100">{activeReview?.title || "No curated review is due"}</h2>
            <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">{activeReview ? `Due for recall after ${Math.round(activeReview.intervalDays || 1)}d. Curated sheets take priority.` : "All due cards are complete."}</p>
          </div>
          {activeReview && <ActionButton href={`https://leetcode.com/problems/${activeReview.titleSlug}/`} tone="amber">Review</ActionButton>}
        </article>
        {activeReview && <div className="px-4 pb-3 border-t border-amber-400/10">{reviewing ? <><p className="mb-2 pt-3 text-[10px] text-zinc-500">How well did you recall it?</p><div className="grid grid-cols-4 gap-1.5">{[[1, "Forgot"], [3, "Hard"], [4, "Good"], [5, "Easy"]].map(([q, l]) => <button key={l as string} disabled={reviewSubmitting} onClick={() => submitReview(q as number)} className="rounded-md border border-zinc-800 bg-black/30 py-1.5 text-[10px] font-mono font-medium text-zinc-400 hover:border-amber-400/40 hover:text-amber-300 disabled:opacity-40 transition">{l as string}</button>)}</div></> : <button onClick={() => setReviewing(true)} className="pt-3 text-[10px] font-semibold text-amber-400/70 hover:text-amber-300 transition">Log recall quality <ArrowUpRight className="inline" size={10} /></button>}</div>}

        {/* Step 2: Practice */}
        <article className={`p-4 flex items-start gap-3.5 ${hasPracticeSignal ? "bg-emerald-500/[0.02]" : ""}`}>
          <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${hasPracticeSignal ? "bg-emerald-400/10" : "bg-sky-400/10"}`}>
            {hasPracticeSignal ? <Check size={13} className="text-emerald-400" /> : <Target size={13} className="text-sky-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-bold font-mono uppercase tracking-[0.2em] text-zinc-500">{hasPracticeSignal ? "Practice done" : "Recommended practice"}</p>
            <h2 className={`mt-1 truncate text-[13px] font-semibold ${hasPracticeSignal ? "text-emerald-300" : "text-zinc-100"}`}>{hasPracticeSignal ? "Solved today" : recommendedPractice?.title || "Pick any problem you can explain after"}</h2>
            <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">{hasPracticeSignal ? "At least one accepted submission today." : recommendedPractice ? `${recommendedPractice.tag || "Target"}${recommendedPractice.difficulty ? ` · ${recommendedPractice.difficulty}` : ""}` : "Sync history for tailored picks."}</p>
          </div>
          {!hasPracticeSignal && recommendedPractice && <ActionButton href={`https://leetcode.com/problems/${recommendedPractice.titleSlug}/`} tone="blue">Solve</ActionButton>}
        </article>

        {/* Step 3: Stretch */}
        <article className="p-4 flex items-start gap-3.5">
          <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-purple-400/10 shrink-0">
            <Circle size={13} className="text-purple-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-bold font-mono uppercase tracking-[0.2em] text-zinc-500">Stretch</p>
            <h2 className="mt-1 truncate text-[13px] font-semibold text-zinc-100">{stretchProblem?.title || "Set when ready"}</h2>
            <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">{stretchProblem && planningRange ? `${Math.round(stretchProblem.rating)} rating · ${planningRange.source}` : planningRange ? `Band: ${planningRange.low}–${planningRange.high}` : "Add contest data for a matched problem."}</p>
          </div>
          {stretchProblem && <ActionButton href={`https://leetcode.com/problems/${stretchProblem.slug}/`}>Attempt</ActionButton>}
        </article>
      </div>
    </section>

    {/* ═══════════ ACTIVITY + STATS ═══════════ */}
    <section className="grid gap-3 sm:grid-cols-[1.35fr_1fr]">
      <div className="rounded-2xl border border-zinc-800/60 bg-[#0d0d0f] p-4">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold font-mono uppercase tracking-[0.2em] text-zinc-500">Last 7 days</p>
          <span className="text-[10px] font-mono font-bold tabular-nums text-zinc-400">{formatDuration(activity.days.reduce((t, d) => t + d.minutes, 0) * 60)}</span>
        </div>
        <div className="mt-4 flex h-[72px] items-end justify-between gap-1.5">
          {activity.days.map((day) => {
            const isToday = day.key === today
            const barH = day.minutes ? Math.max(8, (day.minutes / maxMinutes) * 100) : 2
            return (
              <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                {day.minutes > 0 && (
                  <span className="text-[8px] font-mono font-bold tabular-nums text-zinc-400">
                    {day.minutes >= 60 ? `${(day.minutes / 60).toFixed(1)}h` : `${day.minutes}m`}
                  </span>
                )}
                <div
                  className={`w-full rounded-sm transition-all ${isToday ? "bg-amber-400" : day.minutes > 0 ? "bg-zinc-700" : "bg-zinc-800/40"}`}
                  style={{ height: `${barH}%`, maxWidth: 28 }}
                  title={`${formatDuration(day.minutes * 60)}`}
                />
                <span className={`text-[8px] font-mono ${isToday ? "text-amber-400 font-bold" : "text-zinc-600"}`}>{day.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800/60 bg-[#0d0d0f] p-4 flex flex-col justify-between">
        <p className="text-[9px] font-bold font-mono uppercase tracking-[0.2em] text-zinc-500">At a glance</p>
        <div className="mt-3 space-y-2.5">
          {[
            { label: "Total solved", value: data.totalSolved || 0 },
            { label: "Submissions today", value: data.todaySubmissions || 0 },
            { label: "Streak", value: data.currentStreak || 0, suffix: "d" },
          ].map((stat, i, arr) => (
            <div key={stat.label} className={`flex items-baseline justify-between ${i < arr.length - 1 ? "border-b border-zinc-800/30 pb-2" : ""}`}>
              <span className="text-[10px] text-zinc-500">{stat.label}</span>
              <span className="text-[15px] font-bold font-mono tabular-nums text-zinc-100">
                {stat.value}{stat.suffix && <span className="text-[9px] font-medium text-zinc-500 ml-0.5">{stat.suffix}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {error && <p className="px-1 text-[10px] text-red-400/80 font-mono">{error}</p>}
  </main>
}

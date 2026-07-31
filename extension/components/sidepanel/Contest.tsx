import { useEffect, useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  BarChart3, 
  History, 
  Calendar, 
  RefreshCw, 
  ExternalLink, 
  Trophy, 
  Award, 
  Shield, 
  Search, 
  TrendingUp, 
  Clock, 
  Sparkles, 
  Star, 
  Flame, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  X,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react"
import { Card } from "../ui/Card"
import { fetchContests } from "../../lib/api/backend"
import { getUsername, setCachedContests, getContestSnapshot, setContestSnapshot } from "../../lib/storage"
import { loadContestLifecycle, type ContestLifecycleItem } from "../../lib/contest-lifecycle"
import { UpcomingContests } from "./UpcomingContests"
import { AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer } from "recharts"

/* ═══════════ TYPE DEFINITIONS ═══════════ */
interface UserProfile { 
  realName?: string 
  userAvatar?: string 
  reputation?: number 
  ranking?: number 
  countryCode?: string 
}

interface RankingInfo { 
  rating?: number 
  attendedContestsCount?: number 
  topPercentage?: number 
  globalRanking?: number 
}

interface RankingHistory { 
  attended?: boolean
  rating?: number
  ranking?: number
  problemsSolved?: number
  totalProblems?: number
  finishTimeInSeconds?: number
  contest?: { 
    title?: string
    titleSlug?: string
    startTime?: number 
  } 
}

interface ContestAnalytics { 
  contestSlug?: string
  contest?: { 
    title?: string 
  } 
  rating?: number
  panicIndex?: string
  chokingIndex?: string
  staminaDropoff?: string
}

/* ═══════════ HELPER FUNCTIONS ═══════════ */
function deltaText(contest: ContestLifecycleItem) {
  if (contest.attended === false) return "Unchanged"
  const delta = contest.ratingDelta
  const rating = contest.ratingAfter
  if (delta == null) {
    if (contest.status === "FINALIZED" && rating != null) return `${Math.round(rating)} official`
    return "Pending"
  }
  return `${rating == null ? "" : `${Math.round(rating)} `}(${delta >= 0 ? "+" : ""}${Math.round(delta)})`
}

function statusText(contest: ContestLifecycleItem) {
  if (contest.attended === false) return "DID NOT ATTEND"
  if (contest.status === "FINALIZED") return "OFFICIAL"
  return "UNOFFICIAL"
}

function getMetricBadgeColor(val?: string) {
  if (!val) return "bg-zinc-900 border-zinc-800 text-zinc-500"
  const upper = val.toUpperCase()
  if (upper === "HIGH") return "bg-red-500/10 border-red-500/20 text-red-400"
  if (upper === "MEDIUM") return "bg-amber-500/10 border-amber-500/20 text-amber-400"
  if (upper === "LOW") return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
  return "bg-zinc-900 border-zinc-800 text-zinc-500"
}

export const Contest = () => {
  const [activeTab, setActiveTab] = useState<"stats" | "history" | "upcoming">("stats")
  const [data, setData] = useState<ContestLifecycleItem[]>([])

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [rankingInfo, setRankingInfo] = useState<RankingInfo | null>(null)
  const [rankingHistory, setRankingHistory] = useState<RankingHistory[]>([])
  const [analytics, setAnalytics] = useState<ContestAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [username, setUsernameState] = useState("")

  // History Tab Filter & Search State
  const [searchQuery, setSearchQuery] = useState("")
  const [filterMode, setFilterMode] = useState<"all" | "gains" | "sweeps" | "milestones" | "weekly" | "biweekly">("all")
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "highest_delta" | "highest_rank">("newest")
  const [expandedCard, setExpandedCard] = useState<string | null>(null)

  // Chart range state: "all" | "20" | "10"
  const [chartRange, setChartRange] = useState<"all" | "20" | "10">("all")

  // Badge guide accordion state
  const [showBadgeInfo, setShowBadgeInfo] = useState(false)

  const refresh = async (_forcePredictRefresh = false) => {
    setLoading(true)
    setError("")
    try {
      const uname = await getUsername()
      if (!uname) throw new Error("Set your LeetCode username in Settings")
      setUsernameState(uname)

      const [lifecycle, profileRes, rankingRes, localAnalytics] = await Promise.all([
        loadContestLifecycle(uname),
        new Promise<any>((resolve) => chrome.runtime.sendMessage({ action: "get_user_profile", payload: { username: uname } }, (res) => {
          if (chrome.runtime.lastError) console.error(chrome.runtime.lastError)
          resolve(res)
        })),
        new Promise<any>((resolve) => chrome.runtime.sendMessage({ action: "get_user_contest_history", payload: { username: uname } }, (res) => {
          if (chrome.runtime.lastError) console.error(chrome.runtime.lastError)
          resolve(res)
        })),
        fetchContests().catch(() => [])
      ])

      setData(lifecycle)
      let resolvedProfile = null
      if (profileRes?.ok) {
        resolvedProfile = profileRes.data?.matchedUser?.profile || null
        setProfile(resolvedProfile)
      }
      let resolvedRankingInfo = null
      let resolvedRankingHistory: RankingHistory[] = []
      if (rankingRes?.ok) {
        resolvedRankingInfo = rankingRes.data?.userContestRanking || null
        resolvedRankingHistory = rankingRes.data?.userContestRankingHistory || []
        setRankingInfo(resolvedRankingInfo)
        setRankingHistory(resolvedRankingHistory)
      }
      setAnalytics(localAnalytics)
      await setCachedContests(lifecycle as any)

      await setContestSnapshot({
        data: lifecycle,
        profile: resolvedProfile,
        rankingInfo: resolvedRankingInfo,
        rankingHistory: resolvedRankingHistory,
        analytics: localAnalytics
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load contest history")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getContestSnapshot().then((snapshot) => {
      if (snapshot) {
        if (snapshot.data) setData(snapshot.data)
        if (snapshot.profile) setProfile(snapshot.profile)
        if (snapshot.rankingInfo) setRankingInfo(snapshot.rankingInfo)
        if (snapshot.rankingHistory) setRankingHistory(snapshot.rankingHistory)
        if (snapshot.analytics) setAnalytics(snapshot.analytics)
        setLoading(false)
      }
    })

    void refresh(false)
    const interval = window.setInterval(() => void refresh(false), 2 * 60 * 1000)
    return () => window.clearInterval(interval)
  }, [])

  // Memoized Statistics
  const peakRating = useMemo(() => {
    if (!data.length) return 1500
    const ratings = data.map((c) => c.ratingAfter || 0).filter(Boolean)
    return ratings.length ? Math.max(...ratings) : 1500
  }, [data])

  const avgDelta = useMemo(() => {
    if (!rankingInfo || !rankingInfo.rating || !rankingInfo.attendedContestsCount) return 0
    return (rankingInfo.rating - 1500) / rankingInfo.attendedContestsCount
  }, [rankingInfo])

  const contestStats = useMemo(() => {
    const attended = rankingHistory.filter(c => c.attended === true)
    if (!attended.length) {
      return {
        avgSolved: 0,
        maxRating: 1500,
        highestRank: "n/a",
        lowestRank: "n/a",
        mostActiveMonth: "n/a",
        allKilled: 0,
        threeSolved: 0,
        twoSolved: 0,
        oneSolved: 0,
        noneSolved: 0
      }
    }

    let totalSolved = 0
    let maxRating = 1500
    let highestRank = Infinity
    let lowestRank = -Infinity
    let allKilled = 0
    let threeSolved = 0
    let twoSolved = 0
    let oneSolved = 0
    let noneSolved = 0

    const monthCounts: Record<string, number> = {}

    attended.forEach(c => {
      totalSolved += c.problemsSolved || 0
      if (c.rating && c.rating > maxRating) maxRating = c.rating
      if (c.ranking && c.ranking > 0) {
        if (c.ranking < highestRank) highestRank = c.ranking
        if (c.ranking > lowestRank) lowestRank = c.ranking
      }
      
      const solved = c.problemsSolved || 0
      const total = c.totalProblems || 4
      if (solved === total && total > 0) allKilled++
      else if (solved === 3) threeSolved++
      else if (solved === 2) twoSolved++
      else if (solved === 1) oneSolved++
      else if (solved === 0) noneSolved++

      if (c.contest?.startTime) {
        const date = new Date(c.contest.startTime * 1000)
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        const monthLabel = `${months[date.getMonth()]}, ${String(date.getFullYear()).substring(2)}`
        monthCounts[monthLabel] = (monthCounts[monthLabel] || 0) + 1
      }
    })

    let mostActiveMonth = "n/a"
    let maxMonthCount = 0
    Object.entries(monthCounts).forEach(([month, count]) => {
      if (count > maxMonthCount) {
        maxMonthCount = count
        mostActiveMonth = month
      }
    })

    return {
      avgSolved: attended.length ? (totalSolved / attended.length) : 0,
      maxRating: Math.round(maxRating),
      highestRank: highestRank === Infinity ? "n/a" : highestRank,
      lowestRank: lowestRank === -Infinity ? "n/a" : lowestRank,
      mostActiveMonth,
      allKilled,
      threeSolved,
      twoSolved,
      oneSolved,
      noneSolved
    }
  }, [rankingHistory])

  const medianDisplay = useMemo(() => {
    const times = data
      .map((c) => c.finishTimeMinutes)
      .filter((t): t is number => typeof t === "number")
      .sort((a, b) => a - b)
    if (!times.length) return "n/a"
    const mid = Math.floor(times.length / 2)
    const medianMinutes = times.length % 2 !== 0 ? times[mid] : (times[mid - 1] + times[mid]) / 2
    const totalSecs = Math.round(medianMinutes * 60)
    return `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s`
  }, [data])

  // Chart data calculation
  const chartData = useMemo(() => {
    let list = data
      .filter((c) => c.status === "FINALIZED" && c.ratingAfter != null && c.attended === true)
      .map((c) => ({
        name: c.contestTitle.replace("Weekly Contest ", "W").replace("Biweekly Contest ", "B"),
        fullName: c.contestTitle,
        rating: Math.round(c.ratingAfter!),
        rank: c.rank,
        delta: c.ratingDelta,
        solved: `${c.problemsSolved ?? "?"}/${c.totalProblems ?? 4}`,
        date: c.contestDate ? new Date(c.contestDate).toLocaleDateString([], { month: "short", day: "numeric" }) : ""
      }))
      .reverse()

    if (chartRange === "10") list = list.slice(-10)
    else if (chartRange === "20") list = list.slice(-20)

    return list
  }, [data, chartRange])

  // Compute contest milestones (chronological order)
  const milestoneMap = useMemo(() => {
    const map: Record<string, { type: "knight" | "guardian" | "first" | "peak" | "sweep"; label: string }> = {}
    const finalized = data.filter((c) => c.status === "FINALIZED" && c.attended === true && c.ratingAfter != null)
    if (!finalized.length) return map

    const chron = [...finalized].reverse()
    
    let passedKnight = false
    let passedGuardian = false
    let maxRatingSoFar = 0

    chron.forEach((c, idx) => {
      const slug = c.contestSlug
      const rating = Math.round(c.ratingAfter || 0)

      if (idx === 0) {
        map[slug] = { type: "first", label: "First Contest Attended" }
      }

      if (!passedKnight && rating >= 1850) {
        passedKnight = true
        map[slug] = { type: "knight", label: "Knight Title Unlocked (1850+)" }
      }

      if (!passedGuardian && rating >= 2180) {
        passedGuardian = true
        map[slug] = { type: "guardian", label: "Guardian Title Unlocked (2180+)" }
      }

      if (rating > maxRatingSoFar && idx > 0) {
        maxRatingSoFar = rating
        if (!map[slug]) {
          map[slug] = { type: "peak", label: `Personal Best (${rating})` }
        }
      }

      if (c.problemsSolved === (c.totalProblems || 4) && c.problemsSolved > 0) {
        if (!map[slug]) {
          map[slug] = { type: "sweep", label: "Full Sweep (4/4 Solved)" }
        }
      }
    })

    return map
  }, [data])

  // Attended contests list
  const attendedContests = useMemo(() => {
    return data.filter((contest) => contest.status === "FINALIZED" && contest.attended === true)
  }, [data])

  // Filtered & sorted contests for History tab
  const filteredContests = useMemo(() => {
    let list = [...attendedContests]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((c) => 
        c.contestTitle.toLowerCase().includes(q) || 
        c.contestSlug.toLowerCase().includes(q) ||
        (c.rank && String(c.rank).includes(q))
      )
    }

    if (filterMode === "gains") {
      list = list.filter((c) => (c.ratingDelta || 0) > 0)
    } else if (filterMode === "sweeps") {
      list = list.filter((c) => c.problemsSolved === (c.totalProblems || 4) && (c.problemsSolved || 0) > 0)
    } else if (filterMode === "milestones") {
      list = list.filter((c) => !!milestoneMap[c.contestSlug])
    } else if (filterMode === "weekly") {
      list = list.filter((c) => c.contestTitle.toLowerCase().includes("weekly") && !c.contestTitle.toLowerCase().includes("biweekly"))
    } else if (filterMode === "biweekly") {
      list = list.filter((c) => c.contestTitle.toLowerCase().includes("biweekly"))
    }

    if (sortBy === "oldest") {
      list.reverse()
    } else if (sortBy === "highest_delta") {
      list.sort((a, b) => (b.ratingDelta || -999) - (a.ratingDelta || -999))
    } else if (sortBy === "highest_rank") {
      list.sort((a, b) => (a.rank || 999999) - (b.rank || 999999))
    }

    return list
  }, [attendedContests, searchQuery, filterMode, sortBy, milestoneMap])

  const netRatingGain = useMemo(() => {
    return attendedContests.reduce((sum, c) => sum + (c.ratingDelta || 0), 0)
  }, [attendedContests])

  return (
    <div className="grid gap-3.5">
      {/* Tab Switcher */}
      <div className="flex bg-zinc-900/60 p-1 rounded-lg border border-zinc-800">
        <button 
          onClick={() => setActiveTab("stats")} 
          className={`flex-1 text-[11px] font-bold py-1.5 rounded-md transition-all ${
            activeTab === "stats" ? "bg-zinc-800 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Stats
        </button>

        <button 
          onClick={() => setActiveTab("history")} 
          className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-bold py-1.5 rounded-md transition-all ${
            activeTab === "history" ? "bg-zinc-800 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <span>History</span>
          {attendedContests.length > 0 && (
            <span className="text-[9px] font-mono text-zinc-400">({attendedContests.length})</span>
          )}
        </button>

        <button 
          onClick={() => setActiveTab("upcoming")} 
          className={`flex-1 text-[11px] font-bold py-1.5 rounded-md transition-all ${
            activeTab === "upcoming" ? "bg-zinc-800 text-emerald-400 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Upcoming
        </button>
      </div>

      {activeTab === "upcoming" ? <UpcomingContests /> : <>
        <div className="flex justify-between items-center px-1 -mb-2 text-[10px] font-mono text-zinc-500">
          <span>{data[0]?.refreshedAt ? `Synced ${new Date(data[0].refreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : "Contest Data"}</span>
          <button 
            onClick={() => void refresh(true)} 
            disabled={loading} 
            title="Refresh contest data" 
            className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-amber-400" : ""} />
          </button>
        </div>

        {error && <div className="text-xs text-red-400 border border-red-900/50 bg-red-950/20 p-2.5 rounded-md">{error}</div>}

        {/* ═══════════ STATS TAB (Clean & Aligned UI) ═══════════ */}
        {activeTab === "stats" && (
          <div className="grid gap-3.5 animate-fadeIn">
            {/* HERO PROFILE CARD */}
            {(() => {
              const currentRating = Math.round(rankingInfo?.rating || 1500)
              
              const badge = currentRating >= 2180
                ? { name: "Guardian", color: "#f43f5e", bg: "rgba(244,63,94,0.1)", border: "rgba(244,63,94,0.25)" }
                : currentRating >= 1850 
                  ? { name: "Knight", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" }
                  : { name: "Contender", color: "#38bdf8", bg: "rgba(56,189,248,0.1)", border: "rgba(56,189,248,0.25)" }

              return (
                <section className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 shadow-sm">
                  <div className="flex items-center gap-3.5">
                    <img 
                      src={profile?.userAvatar || "https://assets.leetcode.com/users/default_avatar.jpg"} 
                      className="w-12 h-12 rounded-xl border border-zinc-800 bg-zinc-950 object-cover shrink-0" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://assets.leetcode.com/users/default_avatar.jpg"
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-zinc-100 truncate">{profile?.realName || username || "LeetCode Coder"}</span>
                        <span className="text-[8px] bg-zinc-900 text-zinc-400 border border-zinc-800 px-1.5 py-0.5 rounded font-mono font-bold uppercase">{profile?.countryCode || "US"}</span>
                        {username && (
                          <a href={`https://leetcode.com/${username}/`} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-200 transition">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-zinc-400 font-mono">@{username || "username"}</span>
                        <span className="rounded px-2 py-0.5 text-[9px] font-mono font-bold uppercase" style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                          {badge.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              )
            })()}

            {/* PRIMARY METRICS GRID */}
            <div className="grid grid-cols-2 gap-2.5">
              <Card className="p-3.5 bg-zinc-950/50 border-zinc-800/80">
                <div className="text-[9px] uppercase font-bold text-zinc-500 font-mono tracking-wider">Rating</div>
                <div className="text-2xl font-bold text-sky-400 font-mono mt-1 tabular-nums">
                  {Math.round(rankingInfo?.rating || 1500)}
                </div>
                <div className="mt-1 text-[9px] font-mono text-zinc-400">
                  {rankingInfo?.topPercentage != null ? `Top ${rankingInfo.topPercentage.toFixed(2)}% globally` : "Unrated"}
                </div>
              </Card>

              <Card className="p-3.5 bg-zinc-950/50 border-zinc-800/80">
                <div className="text-[9px] uppercase font-bold text-zinc-500 font-mono tracking-wider">Global Rank</div>
                <div className="text-2xl font-bold text-zinc-100 font-mono mt-1 tabular-nums">
                  {rankingInfo?.globalRanking ? `#${rankingInfo.globalRanking.toLocaleString()}` : "n/a"}
                </div>
                <div className="mt-1 text-[9px] font-mono text-zinc-400">
                  Across {rankingInfo?.attendedContestsCount || 0} contests
                </div>
              </Card>

              <Card className="p-3.5 bg-zinc-950/50 border-zinc-800/80">
                <div className="text-[9px] uppercase font-bold text-zinc-500 font-mono tracking-wider">Peak Rating</div>
                <div className="text-2xl font-bold text-amber-400 font-mono mt-1 tabular-nums">
                  {Math.round(peakRating)}
                </div>
                <div className="mt-1 text-[9px] font-mono text-zinc-400">
                  Max rating achieved
                </div>
              </Card>

              <Card className="p-3.5 bg-zinc-950/50 border-zinc-800/80">
                <div className="text-[9px] uppercase font-bold text-zinc-500 font-mono tracking-wider">Avg Rating Delta</div>
                <div className={`text-2xl font-bold font-mono mt-1 tabular-nums ${avgDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {avgDelta >= 0 ? "+" : ""}{avgDelta.toFixed(1)}
                </div>
                <div className="mt-1 text-[9px] font-mono text-zinc-400">
                  Per attended contest
                </div>
              </Card>
            </div>

            {/* SOLVE BREAKDOWN */}
            <section className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-zinc-400 font-mono tracking-wider">Solve Breakdown</span>
                <span className="text-[9px] font-mono text-zinc-500">{rankingInfo?.attendedContestsCount || 0} Contests</span>
              </div>

              {(() => {
                const total = rankingHistory.filter(c => c.attended === true).length || 1
                const pAll = Math.round((contestStats.allKilled / total) * 100)
                const p3 = Math.round((contestStats.threeSolved / total) * 100)
                const p2 = Math.round((contestStats.twoSolved / total) * 100)
                const p1 = Math.round((contestStats.oneSolved / total) * 100)
                const p0 = Math.max(0, 100 - (pAll + p3 + p2 + p1))

                return (
                  <div className="space-y-2.5">
                    <div className="h-2 w-full flex overflow-hidden rounded-full bg-zinc-900 border border-zinc-800">
                      {pAll > 0 && <div style={{ width: `${pAll}%` }} className="bg-emerald-400" title={`4/4 Solved: ${contestStats.allKilled}`} />}
                      {p3 > 0 && <div style={{ width: `${p3}%` }} className="bg-sky-400" title={`3/4 Solved: ${contestStats.threeSolved}`} />}
                      {p2 > 0 && <div style={{ width: `${p2}%` }} className="bg-amber-400" title={`2/4 Solved: ${contestStats.twoSolved}`} />}
                      {p1 > 0 && <div style={{ width: `${p1}%` }} className="bg-zinc-400" title={`1/4 Solved: ${contestStats.oneSolved}`} />}
                      {p0 > 0 && <div style={{ width: `${p0}%` }} className="bg-rose-500/80" title={`0 Solved: ${contestStats.noneSolved}`} />}
                    </div>

                    <div className="grid grid-cols-5 gap-1 pt-1 text-center font-mono">
                      <button onClick={() => { setFilterMode("sweeps"); setActiveTab("history"); }} className="rounded bg-zinc-900/60 border border-zinc-800 p-1 hover:border-emerald-500/40 transition">
                        <div className="text-[7.5px] uppercase font-bold text-emerald-400">4 Solved</div>
                        <div className="text-xs font-bold text-zinc-100">{contestStats.allKilled}x</div>
                      </button>

                      <button onClick={() => { setFilterMode("all"); setActiveTab("history"); }} className="rounded bg-zinc-900/60 border border-zinc-800 p-1 hover:border-sky-500/40 transition">
                        <div className="text-[7.5px] uppercase font-bold text-sky-400">3 Solved</div>
                        <div className="text-xs font-bold text-zinc-100">{contestStats.threeSolved}x</div>
                      </button>

                      <button onClick={() => { setFilterMode("all"); setActiveTab("history"); }} className="rounded bg-zinc-900/60 border border-zinc-800 p-1 hover:border-amber-500/40 transition">
                        <div className="text-[7.5px] uppercase font-bold text-amber-400">2 Solved</div>
                        <div className="text-xs font-bold text-zinc-100">{contestStats.twoSolved}x</div>
                      </button>

                      <button onClick={() => { setFilterMode("all"); setActiveTab("history"); }} className="rounded bg-zinc-900/60 border border-zinc-800 p-1 hover:border-zinc-500/40 transition">
                        <div className="text-[7.5px] uppercase font-bold text-zinc-400">1 Solved</div>
                        <div className="text-xs font-bold text-zinc-100">{contestStats.oneSolved}x</div>
                      </button>

                      <button onClick={() => { setFilterMode("all"); setActiveTab("history"); }} className="rounded bg-zinc-900/60 border border-zinc-800 p-1 hover:border-rose-500/40 transition">
                        <div className="text-[7.5px] uppercase font-bold text-rose-400">0 Solved</div>
                        <div className="text-xs font-bold text-zinc-100">{contestStats.noneSolved}x</div>
                      </button>
                    </div>
                  </div>
                )
              })()}

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800/60 font-mono">
                <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/60 p-2 text-center">
                  <div className="text-[8px] uppercase text-zinc-500 font-bold">Highest Rank</div>
                  <div className="text-xs font-bold text-amber-400 mt-0.5">{contestStats.highestRank !== "n/a" ? `#${contestStats.highestRank.toLocaleString()}` : "n/a"}</div>
                </div>

                <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/60 p-2 text-center">
                  <div className="text-[8px] uppercase text-zinc-500 font-bold">Median Time</div>
                  <div className="text-xs font-bold text-zinc-200 mt-0.5">{medianDisplay}</div>
                </div>

                <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/60 p-2 text-center">
                  <div className="text-[8px] uppercase text-zinc-500 font-bold">Active Month</div>
                  <div className="text-xs font-bold text-zinc-200 mt-0.5">{contestStats.mostActiveMonth}</div>
                </div>
              </div>
            </section>

            {/* AREA CHART */}
            <Card className="p-4 bg-zinc-950/40 border-zinc-800/80">
              <div className="flex items-center justify-between mb-1 font-mono text-[9px]">
                <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Rating Trajectory</span>
                
                <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded border border-zinc-800">
                  <button onClick={() => setChartRange("all")} className={`px-1.5 py-0.5 rounded ${chartRange === "all" ? "bg-zinc-800 text-zinc-100 font-bold" : "text-zinc-500 hover:text-zinc-300"}`}>All</button>
                  <button onClick={() => setChartRange("20")} className={`px-1.5 py-0.5 rounded ${chartRange === "20" ? "bg-zinc-800 text-zinc-100 font-bold" : "text-zinc-500 hover:text-zinc-300"}`}>20</button>
                  <button onClick={() => setChartRange("10")} className={`px-1.5 py-0.5 rounded ${chartRange === "10" ? "bg-zinc-800 text-zinc-100 font-bold" : "text-zinc-500 hover:text-zinc-300"}`}>10</button>
                </div>
              </div>
              
              <div className="h-[145px] w-full mt-2">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRating" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" stroke="#3f3f46" fontSize={8} tickLine={false} />
                      <YAxis domain={['dataMin - 40', 'dataMax + 40']} stroke="#3f3f46" fontSize={8} tickLine={false} />
                      <ChartTooltip 
                        cursor={{ stroke: "#38bdf8", strokeWidth: 1, strokeDasharray: "3 3" }}
                        content={({ active, payload }: any) => {
                          if (active && payload && payload.length) {
                            const point = payload[0].payload
                            return (
                              <div className="rounded-lg border border-zinc-700/90 bg-zinc-950/95 p-2.5 text-left shadow-xl backdrop-blur-md font-mono min-w-[150px]">
                                <p className="text-[10px] font-bold text-zinc-100">{point.fullName || point.name}</p>
                                <div className="mt-1.5 pt-1 border-t border-zinc-800 space-y-0.5">
                                  <div className="flex items-center justify-between gap-3 text-[10px]">
                                    <span className="text-zinc-400">Rating</span>
                                    <span className="font-bold text-sky-400">{point.rating}</span>
                                  </div>
                                  {point.delta != null && (
                                    <div className="flex items-center justify-between gap-3 text-[9px]">
                                      <span className="text-zinc-400">Delta</span>
                                      <span className={`font-bold ${point.delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                        {point.delta >= 0 ? "+" : ""}{Math.round(point.delta)}
                                      </span>
                                    </div>
                                  )}
                                  {point.rank && (
                                    <div className="flex items-center justify-between gap-3 text-[9px]">
                                      <span className="text-zinc-400">Rank</span>
                                      <span className="font-bold text-zinc-300">#{point.rank.toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="rating" 
                        stroke="#38bdf8" 
                        strokeWidth={2} 
                        fillOpacity={1} 
                        fill="url(#colorRating)"
                        activeDot={{ r: 5, stroke: "#38bdf8", strokeWidth: 2, fill: "#09090b" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-zinc-500 font-mono">No historical contest rating data available.</div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ═══════════ HISTORY TAB ═══════════ */}
        {activeTab === "history" && (
          <div className="grid gap-3 animate-fadeIn">
            {/* LEETCODE BADGE GUIDE */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 shadow-sm">
              <div 
                className="flex items-center justify-between cursor-pointer select-none" 
                onClick={() => setShowBadgeInfo(!showBadgeInfo)}
              >
                <div className="text-xs font-semibold text-zinc-200">How are LeetCode Contest Badges awarded?</div>
                <button type="button" className="text-[10px] font-mono text-zinc-400 hover:text-zinc-200">
                  {showBadgeInfo ? "Hide ▲" : "Details ▼"}
                </button>
              </div>

              {showBadgeInfo && (
                <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-2 text-[11px] text-zinc-400 leading-relaxed font-sans">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400 font-mono font-bold shrink-0">Knight:</span>
                    <span>Top <strong>25%</strong> of active contest participants (~<strong>1850+ rating</strong>).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-rose-400 font-mono font-bold shrink-0">Guardian:</span>
                    <span>Top <strong>5%</strong> of active contest participants (~<strong>2180+ rating</strong>).</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 pt-1 font-mono">LeetCode updates official badge records 3–4 days after rating calculation.</p>
                </div>
              )}
            </div>

            {/* SEARCH & FILTER CONTROLS */}
            <div className="grid gap-2 bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search contest name or rank..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono transition"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                      <X size={12} />
                    </button>
                  )}
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-[10px] font-mono text-zinc-300 focus:outline-none focus:border-zinc-700 cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="highest_delta">Highest Rating Gain</option>
                  <option value="highest_rank">Best Rank</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap pt-1 font-mono text-[9.5px]">
                <button
                  onClick={() => setFilterMode("all")}
                  className={`px-2 py-0.8 rounded-md border transition ${
                    filterMode === "all" 
                      ? "bg-zinc-800 text-zinc-100 border-zinc-700 font-bold" 
                      : "bg-zinc-900/60 text-zinc-400 border-zinc-800/80 hover:text-zinc-200"
                  }`}
                >
                  All ({attendedContests.length})
                </button>

                <button
                  onClick={() => setFilterMode("gains")}
                  className={`px-2 py-0.8 rounded-md border transition ${
                    filterMode === "gains" 
                      ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40 font-bold" 
                      : "bg-zinc-900/60 text-zinc-400 border-zinc-800/80 hover:text-emerald-400"
                  }`}
                >
                  Rating Gains (+)
                </button>

                <button
                  onClick={() => setFilterMode("sweeps")}
                  className={`px-2 py-0.8 rounded-md border transition ${
                    filterMode === "sweeps" 
                      ? "bg-amber-950/60 text-amber-300 border-amber-500/40 font-bold" 
                      : "bg-zinc-900/60 text-zinc-400 border-zinc-800/80 hover:text-amber-400"
                  }`}
                >
                  Sweeps (4/4)
                </button>

                <button
                  onClick={() => setFilterMode("milestones")}
                  className={`px-2 py-0.8 rounded-md border transition ${
                    filterMode === "milestones" 
                      ? "bg-purple-950/60 text-purple-300 border-purple-500/40 font-bold" 
                      : "bg-zinc-900/60 text-zinc-400 border-zinc-800/80 hover:text-purple-400"
                  }`}
                >
                  Milestones
                </button>

                <button
                  onClick={() => setFilterMode("weekly")}
                  className={`px-2 py-0.8 rounded-md border transition ${
                    filterMode === "weekly" 
                      ? "bg-sky-950/60 text-sky-300 border-sky-500/40 font-bold" 
                      : "bg-zinc-900/60 text-zinc-400 border-zinc-800/80 hover:text-sky-400"
                  }`}
                >
                  Weekly
                </button>

                <button
                  onClick={() => setFilterMode("biweekly")}
                  className={`px-2 py-0.8 rounded-md border transition ${
                    filterMode === "biweekly" 
                      ? "bg-indigo-950/60 text-indigo-300 border-indigo-500/40 font-bold" 
                      : "bg-zinc-900/60 text-zinc-400 border-zinc-800/80 hover:text-indigo-400"
                  }`}
                >
                  Biweekly
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 px-1">
              <span>Showing {filteredContests.length} of {attendedContests.length} Contests</span>
              <span className={`font-semibold ${netRatingGain >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                Net Rating: {netRatingGain >= 0 ? "+" : ""}{Math.round(netRatingGain)}
              </span>
            </div>

            {/* CONTEST TIMELINE CARDS */}
            <div className="flex flex-col gap-2">
              {filteredContests.length === 0 ? (
                <div className="text-xs text-zinc-500 py-8 text-center border border-dashed border-zinc-800 rounded-xl">
                  No contest history found matching criteria.
                </div>
              ) : (
                filteredContests.map((contest) => {
                  const delta = contest.ratingDelta
                  const attended = contest.attended !== false
                  const milestone = milestoneMap[contest.contestSlug]
                  const localAnalysis = analytics.find(
                    (a) => a.contestSlug?.toLowerCase() === contest.contestSlug?.toLowerCase()
                  )

                  const validPanic = localAnalysis?.panicIndex && localAnalysis.panicIndex.toLowerCase() !== "unknown"
                  const validChoke = localAnalysis?.chokingIndex && localAnalysis.chokingIndex.toLowerCase() !== "unknown"
                  const validStamina = localAnalysis?.staminaDropoff && localAnalysis.staminaDropoff.toLowerCase() !== "unknown"
                  const hasValidSignals = validPanic || validChoke || validStamina

                  const isExpanded = expandedCard === contest.contestSlug
                  const isSweep = contest.problemsSolved === (contest.totalProblems || 4) && (contest.problemsSolved || 0) > 0

                  return (
                    <Card 
                      key={contest.contestSlug} 
                      className={`py-3 px-3.5 border transition-all duration-200 ${
                        milestone 
                          ? "border-amber-500/30 bg-zinc-950" 
                          : "border-zinc-800/80 bg-zinc-950/40 hover:border-zinc-700/80"
                      }`}
                    >
                      {milestone && (
                        <div className="mb-2 flex items-center gap-1.5 text-[9px] font-mono font-bold text-amber-300 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded w-fit">
                          <span>{milestone.label}</span>
                        </div>
                      )}

                      <div className="flex justify-between gap-3 items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <a 
                              href={`https://leetcode.com/contest/${contest.contestSlug}/`} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="font-bold text-xs text-zinc-100 hover:text-amber-400 transition truncate flex items-center gap-1"
                            >
                              <span>{contest.contestTitle}</span>
                              <ExternalLink size={10} className="text-zinc-500 opacity-60" />
                            </a>

                            {isSweep && (
                              <span className="text-[8px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded">
                                Sweep
                              </span>
                            )}
                          </div>
                          
                          <div className="text-[10px] text-zinc-400 font-mono mt-1 flex items-center gap-2 flex-wrap">
                            {attended ? (
                              <>
                                <span className="text-zinc-300">Rank #{contest.rank?.toLocaleString() ?? "n/a"}</span>
                                <span className="text-zinc-600">•</span>
                                <span className={isSweep ? "text-emerald-400 font-semibold" : "text-zinc-300"}>
                                  {contest.problemsSolved ?? "?"}/{contest.totalProblems ?? 4} Solved
                                </span>
                                {contest.finishTimeMinutes != null && (
                                  <>
                                    <span className="text-zinc-600">•</span>
                                    <span className="text-zinc-400">
                                      {Math.floor(contest.finishTimeMinutes)}m
                                    </span>
                                  </>
                                )}
                              </>
                            ) : (
                              <span className="text-zinc-500">Did Not Attend</span>
                            )}
                          </div>

                          {hasValidSignals && (
                            <div className="flex gap-1.5 mt-2 flex-wrap font-mono text-[8px] font-bold">
                              {validPanic && (
                                <span className={`px-1.5 py-0.5 rounded border ${getMetricBadgeColor(localAnalysis.panicIndex)}`}>
                                  PANIC: {localAnalysis.panicIndex!.toUpperCase()}
                                </span>
                              )}
                              {validChoke && (
                                <span className={`px-1.5 py-0.5 rounded border ${getMetricBadgeColor(localAnalysis.chokingIndex)}`}>
                                  CHOKE: {localAnalysis.chokingIndex!.toUpperCase()}
                                </span>
                              )}
                              {validStamina && (
                                <span className={`px-1.5 py-0.5 rounded border ${getMetricBadgeColor(localAnalysis.staminaDropoff)}`}>
                                  STAMINA: {localAnalysis.staminaDropoff!.toUpperCase()}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <div className={`font-bold text-xs font-mono tabular-nums ${
                            !attended ? "text-zinc-500" : delta == null ? "text-zinc-500" : delta >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}>
                            {attended ? deltaText(contest) : "0 (Unchanged)"}
                          </div>
                          
                          <div className={`text-[9px] mt-1 font-semibold font-mono ${
                            !attended ? "text-zinc-500" : contest.status === "FINALIZED" ? "text-emerald-500/90" : "text-zinc-500"
                          }`}>
                            {statusText(contest)}
                          </div>

                          <button
                            onClick={() => setExpandedCard(isExpanded ? null : contest.contestSlug)}
                            className="mt-1 text-[9px] font-mono text-zinc-500 hover:text-zinc-300 transition flex items-center justify-end gap-0.5"
                          >
                            <span>{isExpanded ? "Less ▲" : "Details ▼"}</span>
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-zinc-800/80 grid gap-2 text-[10px] font-mono text-zinc-400">
                          <div className="grid grid-cols-2 gap-2 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800">
                            <div>
                              <span className="text-zinc-500 block text-[8px] uppercase">Rating Before</span>
                              <span className="text-zinc-200 font-bold">{contest.ratingBefore ? Math.round(contest.ratingBefore) : "1500"}</span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block text-[8px] uppercase">Rating After</span>
                              <span className="text-zinc-200 font-bold">{contest.ratingAfter ? Math.round(contest.ratingAfter) : "n/a"}</span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block text-[8px] uppercase">Contest Date</span>
                              <span className="text-zinc-300">
                                {contest.contestDate ? new Date(contest.contestDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "n/a"}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block text-[8px] uppercase">Finish Time</span>
                              <span className="text-zinc-300">
                                {contest.finishTimeMinutes != null ? `${Math.round(contest.finishTimeMinutes)} mins` : "n/a"}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </Card>
                  )
                })
              )}
            </div>
          </div>
        )}

        {data[0]?.refreshedAt && (
          <div className="text-[9px] text-zinc-600 text-right mt-1 font-mono">
            Refreshed {new Date(data[0].refreshedAt).toLocaleString()}
          </div>
        )}
      </>}
    </div>
  )
}

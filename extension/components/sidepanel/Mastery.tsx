import React, { useEffect, useState, useMemo } from "react"
import { Card } from "../ui/Card"
import { fetchMastery } from "../../lib/api/backend"
import { getCachedMastery, setCachedMastery } from "../../lib/storage"
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { 
  Target, Shield, Zap, TrendingUp, Trophy, Activity, RefreshCw, 
  ChevronDown, Clock, Crosshair, Flame, ArrowUpRight, Brain, Sigma, 
  Info, Sparkles, Award, BarChart3, Swords, Lock, Gauge, Search, 
  Filter, Layers, Crown, ExternalLink, CheckCircle2, Compass, Radio
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { TagMastery } from "../../lib/types"

/* ═══════════════════════════════════════════════════════════
   TIER DESIGN SYSTEM & COLOR PALETTE
   Codeforces Competitive Tiers with Custom Neon Glows
   ═══════════════════════════════════════════════════════════ */
const TIERS = [
  { name: "Grandmaster", floor: 2200, color: "#ef4444", bg: "rgba(239,68,68,0.14)", border: "rgba(239,68,68,0.40)", ring: "#ef4444", icon: Crown },
  { name: "Master",      floor: 1900, color: "#f59e0b", bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.40)", ring: "#f59e0b", icon: Crown },
  { name: "Expert",      floor: 1600, color: "#a855f7", bg: "rgba(168,85,247,0.14)", border: "rgba(168,85,247,0.40)", ring: "#a855f7", icon: Shield },
  { name: "Specialist",  floor: 1400, color: "#38bdf8", bg: "rgba(56,189,248,0.14)", border: "rgba(56,189,248,0.40)", ring: "#38bdf8", icon: Shield },
  { name: "Pupil",       floor: 1200, color: "#34d399", bg: "rgba(52,211,153,0.14)", border: "rgba(52,211,153,0.40)", ring: "#34d399", icon: Trophy },
  { name: "Newbie",      floor: 0,    color: "#a1a1aa", bg: "rgba(161,161,170,0.10)", border: "rgba(161,161,170,0.25)", ring: "#71717a", icon: Award },
] as const

const getTier = (score: number) => {
  return TIERS.find(t => score >= t.floor) || TIERS[TIERS.length - 1]
}

const nextTier = (score: number) => {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (score < TIERS[i].floor) return TIERS[i]
  }
  return null
}

const rdToConfidence = (rd: number) => Math.max(0, Math.min(100, Math.round(100 - (rd / 3.5))))

const getStability = (vol: number) => {
  if (vol <= 0.04) return { label: "Rock Solid", color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-500/30", icon: Shield }
  if (vol <= 0.06) return { label: "Stable",     color: "text-sky-400",     bg: "bg-sky-400/10",     border: "border-sky-500/30",     icon: Shield }
  if (vol <= 0.08) return { label: "Moderate",   color: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-500/30",   icon: Activity }
  return                   { label: "Volatile",   color: "text-rose-400",    bg: "bg-rose-400/10",    border: "border-rose-500/30",    icon: Zap }
}

const timeSince = (dateStr?: string) => {
  if (!dateStr) return { text: "—", isDecaying: true }
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (days === 0) return { text: "today", isDecaying: false }
  if (days === 1) return { text: "yesterday", isDecaying: false }
  if (days < 7) return { text: `${days}d ago`, isDecaying: false }
  if (days < 30) return { text: `${Math.floor(days / 7)}w ago`, isDecaying: false }
  return { text: `${Math.floor(days / 30)}mo ago`, isDecaying: true }
}

/* ═══════════════════════════════════════════════════════════
   CYBERNETIC DUAL-RING SKILL GAUGE (UNIQUE TO MASTERY)
   ═══════════════════════════════════════════════════════════ */
const DualRingCore = ({ score, rd, size = 110 }: { score: number; rd: number; size?: number }) => {
  const tier = getTier(score)
  const scorePct = Math.max(5, Math.min(100, (score / 2500) * 100))
  const confPct = rdToConfidence(rd)

  const sw1 = 5, sw2 = 3.5
  const r1 = (size - 12) / 2
  const r2 = r1 - 8
  const c1 = 2 * Math.PI * r1
  const c2 = 2 * Math.PI * r2

  return (
    <div className="relative flex items-center justify-center shrink-0 select-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track Rings */}
        <circle cx={size / 2} cy={size / 2} r={r1} stroke="#18181b" strokeWidth={sw1} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r2} stroke="#18181b" strokeWidth={sw2} fill="none" />

        {/* Outer Ring: ELO Mastery Progress */}
        <motion.circle
          cx={size / 2} cy={size / 2} r={r1} stroke={tier.color} strokeWidth={sw1} fill="none"
          strokeLinecap="round" strokeDasharray={c1}
          initial={{ strokeDashoffset: c1 }}
          animate={{ strokeDashoffset: c1 - (scorePct / 100) * c1 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
        />

        {/* Inner Ring: Statistical Confidence (RD) */}
        <motion.circle
          cx={size / 2} cy={size / 2} r={r2} stroke="#38bdf8" strokeWidth={sw2} fill="none"
          strokeLinecap="round" strokeDasharray={c2}
          initial={{ strokeDashoffset: c2 }}
          animate={{ strokeDashoffset: c2 - (confPct / 100) * c2 }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.2 }}
        />
      </svg>

      {/* Core Center Display */}
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-bold font-mono tracking-tight text-white tabular-nums leading-none">
          {Math.round(score)}
        </span>
        <span className="text-[8px] font-mono font-bold uppercase tracking-widest text-zinc-400 mt-1">
          {tier.name}
        </span>
      </div>
    </div>
  )
}

export const Mastery = () => {
  const [data, setData] = useState<TagMastery[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showMath, setShowMath] = useState(false)
  const [expandedTag, setExpandedTag] = useState<string | null>(null)

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [tierFilter, setTierFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<"score" | "weakest" | "solved" | "volatility">("score")

  const loadData = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      if (!forceRefresh) {
        const cached = await getCachedMastery()
        if (cached?.length) {
          setData(cached)
          setLoading(false)
        }
      }
      const fetched = await fetchMastery()
      setData(fetched)
      setCachedMastery(fetched)
    } catch (err) {
      console.error("Failed to fetch tag mastery:", err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  /* ═══════════════════════════════════════════════════════════
     STATISTICALLY SOUND GLICKO-2 COMPOSITE CALCULATIONS
     ═══════════════════════════════════════════════════════════ */
  const analytics = useMemo(() => {
    if (!data.length) return null
    const sorted = [...data].sort((a, b) => (b.masteryScore || 0) - (a.masteryScore || 0))

    let wSum = 0, wTotal = 0, solved = 0, attempted = 0, firstAc = 0
    sorted.forEach(m => {
      const rd = Math.max(m.rd || 350, 30)
      const n = Math.sqrt(m.totalAttempted || 1)
      const w = n / (rd * rd)

      wSum += w * (m.masteryScore || 800)
      wTotal += w
      solved += m.totalSolved || 0
      attempted += m.totalAttempted || 0
      firstAc += m.firstAcCount || 0
    })

    let rdW = 0, volW = 0, rdN = 0
    sorted.forEach(m => {
      const n = m.totalAttempted || 1
      rdW += n * (m.rd || 350)
      volW += n * (m.volatility || 0.06)
      rdN += n
    })

    const tierDist: Record<string, number> = {}
    TIERS.forEach(t => { tierDist[t.name] = 0 })
    sorted.forEach(m => { 
      const t = getTier(m.masteryScore || 800)
      tierDist[t.name] = (tierDist[t.name] || 0) + 1 
    })

    const compositePowerIndex = Math.max(800, wTotal > 0 ? wSum / wTotal : 800)

    return {
      sorted,
      powerIndex: compositePowerIndex,
      avgRd: rdN > 0 ? rdW / rdN : 350,
      avgVol: rdN > 0 ? volW / rdN : 0.06,
      solved, attempted, firstAc, tierDist,
      top3: sorted.slice(0, 3),
      weakest: sorted[sorted.length - 1],
      closestPromo: sorted.reduce<{ tag: string; needed: number; tier: string; color: string } | null>((b, m) => {
        const nx = nextTier(m.masteryScore || 0)
        if (!nx) return b
        const gap = nx.floor - (m.masteryScore || 0)
        return !b || gap < b.needed ? { tag: m.tag, needed: gap, tier: nx.name, color: nx.color } : b
      }, null),
      mostVolatile: sorted.reduce<TagMastery | null>((b, m) => !b || (m.volatility || 0) > (b.volatility || 0) ? m : b, null),
      mostPracticed: sorted.reduce<TagMastery | null>((b, m) => !b || (m.totalAttempted || 0) > (b.totalAttempted || 0) ? m : b, null),
    }
  }, [data])

  const filteredTopics = useMemo(() => {
    if (!analytics) return []
    let list = [...analytics.sorted]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(m => m.tag.toLowerCase().includes(q))
    }

    if (tierFilter !== "all") {
      list = list.filter(m => getTier(m.masteryScore || 800).name.toLowerCase() === tierFilter.toLowerCase())
    }

    list.sort((a, b) => {
      if (sortBy === "weakest") return (a.masteryScore || 0) - (b.masteryScore || 0)
      if (sortBy === "solved") return (b.totalSolved || 0) - (a.totalSolved || 0)
      if (sortBy === "volatility") return (b.volatility || 0) - (a.volatility || 0)
      return (b.masteryScore || 0) - (a.masteryScore || 0)
    })

    return list
  }, [analytics, searchQuery, tierFilter, sortBy])

  if (loading) return (
    <div className="grid h-64 place-items-center font-sans">
      <div className="flex flex-col items-center gap-2">
        <RefreshCw size={22} className="animate-spin text-[#dfa054]" />
        <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">Loading Skill Telemetry...</span>
      </div>
    </div>
  )

  if (!data.length || !analytics) return (
    <Card className="grid min-h-64 place-items-center border-dashed border-zinc-800 bg-[#09090b] p-8 text-center font-sans">
      <div>
        <Trophy className="mx-auto h-9 w-9 text-zinc-600 mb-2.5" />
        <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">No Mastery Telemetry Logged</h2>
        <p className="mx-auto mt-1 max-w-[260px] text-xs leading-relaxed text-zinc-500 font-mono">
          Run a sync in Settings to compute your Glicko-2 topic ratings and weakness targets.
        </p>
      </div>
    </Card>
  )

  const { sorted, powerIndex, avgRd, avgVol, solved, attempted, firstAc, tierDist, top3, weakest, closestPromo, mostVolatile, mostPracticed } = analytics
  const pi = getTier(powerIndex)
  const conf = rdToConfidence(avgRd)
  const stability = getStability(avgVol)
  const nextTr = nextTier(powerIndex)
  const TierIcon = pi.icon

  return (
    <div className="space-y-4 pb-6 font-sans select-none animate-fadeIn">

      {/* ══════════ 1. HEADER TITLE BAR ══════════ */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-[#dfa054] animate-pulse" />
          <div>
            <h1 className="text-sm font-bold text-zinc-100 uppercase tracking-wider font-mono">Glicko-2 Mastery Core</h1>
            <p className="text-[10px] text-zinc-400 font-mono">Algorithmic Competence Telemetry • {sorted.length} Active Tags</p>
          </div>
        </div>

        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-[#121214] text-[10px] font-mono text-zinc-300 hover:text-white hover:border-zinc-700 transition cursor-pointer"
        >
          <RefreshCw size={11} className={refreshing ? "animate-spin text-[#dfa054]" : ""} />
          <span>{refreshing ? "Recalculating..." : "Sync Ratings"}</span>
        </button>
      </div>

      {/* ══════════ 2. CYBERNETIC HERO COMMAND CORE (SIGNATURE MASTERY WIDGET) ══════════ */}
      <section className="relative overflow-hidden rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-[#141418] via-[#0d0d10] to-[#09090b] p-5 shadow-2xl">
        {/* Glow Aura */}
        <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full blur-3xl pointer-events-none opacity-20" style={{ backgroundColor: pi.color }} />

        <div className="relative flex items-center justify-between gap-4">
          <div className="space-y-3 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-[#dfa054]">
                Competence Rating
              </span>
              <span className="rounded-full px-2 py-0.5 text-[8.5px] font-mono font-bold uppercase border"
                style={{ color: pi.color, backgroundColor: pi.bg, borderColor: pi.border }}>
                {pi.name} Tier
              </span>
            </div>

            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono tracking-tight text-white leading-none tabular-nums">
                  {Math.round(powerIndex)}
                </span>
                <span className="text-xs font-mono text-zinc-400 font-bold">ELO</span>
              </div>
              <p className="text-[10px] font-mono text-zinc-400 mt-1">
                {nextTr ? `+${Math.max(0, nextTr.floor - Math.round(powerIndex))} ELO to reach ${nextTr.name}` : "Highest Tier Floor Reached"}
              </p>
            </div>

            {/* Micro KPI Bar */}
            <div className="flex items-center gap-3 pt-1 border-t border-zinc-800/80 font-mono text-[9.5px]">
              <span className="text-zinc-400">Confidence: <strong className="text-emerald-400">{conf}%</strong></span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">Precision: <strong className="text-sky-400">{attempted > 0 ? Math.round((firstAc / attempted) * 100) : 0}%</strong></span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">Stability: <strong className={stability.color}>{stability.label}</strong></span>
            </div>
          </div>

          <DualRingCore score={powerIndex} rd={avgRd} size={105} />
        </div>
      </section>

      {/* ══════════ 3. TACTICAL TARGET MATRIX (WEAKNESS, PROMOTION, VOLATILITY) ══════════ */}
      <section className="grid grid-cols-3 gap-2.5 font-mono">
        {/* Card 1: Weakest Drill Target */}
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/15 p-3 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] font-bold uppercase tracking-wider text-rose-400">Weakest Target</span>
            <Target size={14} className="text-rose-400 shrink-0" />
          </div>
          <div>
            <span className="text-xs font-bold text-rose-200 truncate block" title={weakest?.tag}>{weakest?.tag || "—"}</span>
            <a
              href={`https://leetcode.com/tag/${weakest?.tag.toLowerCase().replace(/\s+/g, '-')}/`}
              target="_blank"
              rel="noreferrer"
              className="text-[8.5px] font-bold text-rose-400 hover:underline inline-flex items-center gap-0.5 mt-0.5"
            >
              <span>Drill Tag</span>
              <ArrowUpRight size={9} />
            </a>
          </div>
        </div>

        {/* Card 2: Promotion Target */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/15 p-3 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] font-bold uppercase tracking-wider text-amber-400">Near Promotion</span>
            <TrendingUp size={14} className="text-amber-400 shrink-0" />
          </div>
          <div>
            <span className="text-xs font-bold text-amber-200 truncate block" title={closestPromo?.tag}>{closestPromo?.tag || "—"}</span>
            <span className="text-[8.5px] text-zinc-400 block mt-0.5">
              +{Math.round(closestPromo?.needed || 0)} to {closestPromo?.tier || "Max"}
            </span>
          </div>
        </div>

        {/* Card 3: Most Volatile */}
        <div className="rounded-xl border border-sky-500/30 bg-sky-950/15 p-3 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] font-bold uppercase tracking-wider text-sky-400">Highest Volatility</span>
            <Zap size={14} className="text-sky-400 shrink-0" />
          </div>
          <div>
            <span className="text-xs font-bold text-sky-200 truncate block" title={mostVolatile?.tag}>{mostVolatile?.tag || "—"}</span>
            <span className="text-[8.5px] text-zinc-400 block mt-0.5">
              σ = {(mostVolatile?.volatility || 0.06).toFixed(3)}
            </span>
          </div>
        </div>
      </section>

      {/* ══════════ 4. SKILL CONSTELLATION RADAR CHART ══════════ */}
      {(() => {
        const items = sorted.filter(d => d.totalAttempted >= 2).slice(0, 8)
        if (items.length < 3) return null
        const rd = items.map(d => ({
          subject: d.tag.length > 10 ? d.tag.slice(0, 9) + '…' : d.tag,
          score: Math.round(d.masteryScore || 800),
          raw: Math.round((d.rawRating || d.masteryScore || 800) + (d.rd ? d.rd * 1.8 : 0)),
        }))
        return (
          <Card className="p-4 bg-gradient-to-b from-[#121215] to-[#0a0a0c] border-zinc-800/80 space-y-2.5 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider text-sky-400 font-mono">
                <Brain size={13} /> Skill Constellation Radar
              </span>
              <div className="flex items-center gap-2.5 text-[8px] font-mono text-zinc-400">
                <span className="flex items-center gap-1"><span className="w-2 h-[2px] rounded bg-sky-400" /> Raw Elo</span>
                <span className="flex items-center gap-1"><span className="w-2 h-[2px] rounded" style={{ backgroundColor: pi.color }} /> Glicko-2</span>
              </div>
            </div>
            <div className="h-[195px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="68%" data={rd}>
                  <PolarGrid stroke="#27272a" strokeDasharray="3 3" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 8.5, fontFamily: 'monospace', fontWeight: 600 }} />
                  <Radar name="Raw" dataKey="raw" stroke="rgba(56,189,248,0.4)" strokeWidth={1} fill="rgba(56,189,248,0.06)" fillOpacity={1} />
                  <Radar name="Score" dataKey="score" stroke={pi.color} strokeWidth={1.5} fill={pi.color} fillOpacity={0.15} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px', fontSize: 10, fontFamily: 'monospace', boxShadow: '0 8px 24px rgba(0,0,0,0.8)', padding: '6px 10px' }}
                    formatter={(v: number, n: string) => [`${v} ELO`, n]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )
      })()}

      {/* ══════════ 5. SEARCH, TIER FILTERS & SORT MATRIX ══════════ */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between px-1 font-mono">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
            <Layers size={13} className="text-[#dfa054]" /> Topic Mastery Matrix ({filteredTopics.length})
          </span>
          <span className="text-[9px] text-zinc-500">Click any card to expand</span>
        </div>

        {/* Filter Controls Bar */}
        <div className="grid grid-cols-2 gap-2 font-mono">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter topics..."
              className="w-full bg-[#121214] border border-zinc-800 rounded-xl pl-8 pr-2.5 py-1.5 text-[10px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#dfa054] transition"
            />
          </div>

          <div className="flex gap-1.5">
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="flex-1 bg-[#121214] border border-zinc-800 rounded-xl px-2 py-1.5 text-[10px] text-zinc-300 focus:outline-none focus:border-[#dfa054] transition"
            >
              <option value="all">All Tiers</option>
              <option value="grandmaster">Grandmaster</option>
              <option value="master">Master</option>
              <option value="expert">Expert</option>
              <option value="specialist">Specialist</option>
              <option value="pupil">Pupil</option>
              <option value="newbie">Newbie</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="flex-1 bg-[#121214] border border-zinc-800 rounded-xl px-2 py-1.5 text-[10px] text-zinc-300 focus:outline-none focus:border-[#dfa054] transition"
            >
              <option value="score">Highest ELO</option>
              <option value="weakest">Weakest First</option>
              <option value="solved">Most Solved</option>
              <option value="volatility">Highest Volatility</option>
            </select>
          </div>
        </div>
      </div>

      {/* ══════════ 6. EXPANDABLE TOPIC CARDS MATRIX ══════════ */}
      <div className="space-y-2">
        {filteredTopics.length === 0 ? (
          <Card className="p-4 text-center text-xs font-mono text-zinc-500 border-zinc-800/80 bg-[#121214]">
            No topic tags match your active search filter.
          </Card>
        ) : (
          filteredTopics.map((m, i) => {
            const score = m.masteryScore || 800
            const rd = m.rd || 350
            const vol = m.volatility || 0.06
            const winRate = m.totalAttempted > 0 ? Math.round((m.totalSolved / m.totalAttempted) * 100) : 0
            const stab = getStability(vol)
            const open = expandedTag === m.tag
            const tierStyle = getTier(score)

            return (
              <motion.div 
                key={m.tag}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="rounded-2xl border bg-[#121214] overflow-hidden transition-all hover:border-zinc-700/80 shadow-md"
                style={{ borderColor: open ? tierStyle.color : "rgba(39,39,42,0.8)" }}
              >
                <button 
                  onClick={() => setExpandedTag(open ? null : m.tag)} 
                  className="w-full flex items-center gap-3.5 p-3.5 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span 
                      className="w-1.5 h-8 rounded-full shrink-0" 
                      style={{ backgroundColor: tierStyle.color }} 
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold text-zinc-100" title={m.tag}>{m.tag}</span>
                        <span className="text-[11px] font-mono font-bold tabular-nums text-zinc-100">
                          {Math.round(score)} <span className="text-[9px] font-normal text-zinc-500">ELO</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-mono font-bold px-2 py-0.5 rounded-full border" style={{ color: tierStyle.color, backgroundColor: tierStyle.bg, borderColor: tierStyle.border }}>
                          {tierStyle.name}
                        </span>
                        <span className="text-[9px] font-mono text-zinc-400">RD {Math.round(rd)}</span>
                        <span className="text-[9px] font-mono text-emerald-400 font-bold">{winRate}% WR</span>
                      </div>
                    </div>
                  </div>

                  <ChevronDown size={14} className={`text-zinc-500 transition-transform shrink-0 ${open ? 'rotate-180 text-zinc-200' : ''}`} />
                </button>
                
                {/* Expanded Detailed Breakdown */}
                <AnimatePresence>
                  {open && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }} 
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} 
                      transition={{ duration: 0.2 }} 
                      className="overflow-hidden border-t border-zinc-800/80 bg-zinc-950/60"
                    >
                      <div className="p-3.5 space-y-3">
                        {/* 4 Detail Badges */}
                        <div className="grid grid-cols-4 gap-2 font-mono text-center">
                          <div className="rounded-xl bg-[#121214] p-2 border border-zinc-800/60">
                            <div className="text-[7.5px] uppercase font-bold text-zinc-500">Solved</div>
                            <div className="text-xs font-bold text-zinc-200 mt-0.5">{m.totalSolved} / {m.totalAttempted}</div>
                          </div>

                          <div className="rounded-xl bg-[#121214] p-2 border border-zinc-800/60">
                            <div className="text-[7.5px] uppercase font-bold text-zinc-500">1st AC</div>
                            <div className="text-xs font-bold text-emerald-400 mt-0.5">{m.totalAttempted > 0 ? Math.round((m.firstAcCount / m.totalAttempted) * 100) : 0}%</div>
                          </div>

                          <div className="rounded-xl bg-[#121214] p-2 border border-zinc-800/60">
                            <div className="text-[7.5px] uppercase font-bold text-zinc-500">Volatility</div>
                            <div className="text-xs font-bold text-rose-400 mt-0.5">{vol.toFixed(3)}</div>
                          </div>

                          <div className="rounded-xl bg-[#121214] p-2 border border-zinc-800/60">
                            <div className="text-[7.5px] uppercase font-bold text-zinc-500">Last Solved</div>
                            <div className="text-xs font-bold text-sky-400 mt-0.5">{timeSince(m.lastSolvedAt).text}</div>
                          </div>
                        </div>

                        {/* Direct Practice Button */}
                        <a
                          href={`https://leetcode.com/tag/${m.tag.toLowerCase().replace(/\s+/g, '-')}/`}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-[#dfa054]/40 bg-[#dfa054]/10 hover:bg-[#dfa054]/20 py-2.5 text-[11px] font-mono font-bold text-[#dfa054] transition cursor-pointer shadow-md"
                        >
                          <span>Practice {m.tag} Problems on LeetCode</span>
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })
        )}
      </div>

      {/* ══════════ 7. HOW GLICKO-2 MATH SPECIFICATION WORKS ══════════ */}
      <Card className="p-0 bg-[#121214] border-zinc-800/80 overflow-hidden shadow-md">
        <button 
          onClick={() => setShowMath(!showMath)}
          className="w-full flex items-center justify-between p-3.5 text-left cursor-pointer font-mono"
        >
          <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider text-purple-400">
            <Info size={13} /> Glicko-2 Mathematical Telemetry Specification
          </span>
          <ChevronDown size={13} className={`text-zinc-500 transition-transform ${showMath ? 'rotate-180 text-zinc-200' : ''}`} />
        </button>
        
        <AnimatePresence>
          {showMath && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} 
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} 
              transition={{ duration: 0.2 }}
              className="border-t border-zinc-800/80 p-4 space-y-2.5 text-[10px] text-zinc-400 font-sans leading-relaxed bg-zinc-950/60"
            >
              <div className="flex items-center gap-1.5 font-bold text-zinc-200 font-mono">
                <Sparkles size={13} className="text-purple-400" />
                <span>Glicko-2 Mathematical Specification</span>
              </div>
              <p>
                AlgoVault models your algorithmic competence per topic tag using Mark Glickman's Glicko-2 algorithm (the mathematical engine used in competitive chess and gaming leaderboards).
              </p>

              <div className="space-y-1.5 font-mono text-[9px] pt-1">
                <div className="p-2.5 rounded-xl bg-[#121214] border border-zinc-800">
                  <strong className="text-purple-300">1. Problem Difficulty Opponent:</strong> Each LeetCode problem acts as an opponent with ZeroTrac rating ELO R_p.
                </div>
                <div className="p-2.5 rounded-xl bg-[#121214] border border-zinc-800">
                  <strong className="text-emerald-300">2. Performance Score:</strong> 1st AC = 1.0, Retry AC = 0.7, Hint = 0.5, Failure = 0.0.
                </div>
                <div className="p-2.5 rounded-xl bg-[#121214] border border-zinc-800">
                  <strong className="text-sky-300">3. Rating Deviation (RD):</strong> Tracks certainty. More solves reduce RD (increasing confidence).
                </div>
                <div className="p-2.5 rounded-xl bg-[#121214] border border-zinc-800">
                  <strong className="text-amber-300">4. Conservative Lower Bound:</strong> Rating - 2 * RD. Rewards consistency and prevents inflation.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  )
}

import React, { useEffect, useState, useMemo } from "react"
import { Card } from "../ui/Card"
import { fetchMastery } from "../../lib/api/backend"
import { getCachedMastery, setCachedMastery } from "../../lib/storage"
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Target, Shield, Zap, TrendingUp, Trophy, Activity, RefreshCw, ChevronDown, Clock, Crosshair, Flame, ArrowUpRight, Brain, Sigma, Info, Sparkles, Award, BarChart3, Swords, Lock, Gauge, Search, Filter, Layers, CheckCircle2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { TagMastery } from "../../lib/types"

/* ═══════════════════════════════════════════════════════════
   STATISTICALLY RIGOROUS Glicko-2 TIER SYSTEM
   Codeforces & Chess Elo aligned rating tiers
   ═══════════════════════════════════════════════════════════ */
const TIERS = [
  { name: "Grandmaster", floor: 2200, color: "#ef4444", label: "Top 1% Mastery" },
  { name: "Master",      floor: 1900, color: "#f59e0b", label: "Top 5% Mastery" },
  { name: "Expert",      floor: 1600, color: "#a855f7", label: "Top 15% Mastery" },
  { name: "Specialist",  floor: 1400, color: "#38bdf8", label: "Top 35% Mastery" },
  { name: "Pupil",       floor: 1200, color: "#34d399", label: "Top 60% Mastery" },
  { name: "Newbie",      floor: 0,    color: "#71717a", label: "Developing Practice" },
] as const

const hexRgb = (h: string) => `${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)}`

const getTier = (score: number) => {
  const t = TIERS.find(t => score >= t.floor) || TIERS[TIERS.length - 1]
  return { ...t, bg: `rgba(${hexRgb(t.color)},0.10)`, border: `rgba(${hexRgb(t.color)},0.28)` }
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

const RingGauge = ({ score, size = 52, sw = 3 }: { score: number; size?: number; sw?: number }) => {
  const pct = Math.max(3, Math.min(100, (score / 2500) * 100))
  const tier = getTier(score)
  const r = (size - sw * 2) / 2
  const c = 2 * Math.PI * r

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#18181b" strokeWidth={sw} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} stroke={tier.color} strokeWidth={sw} fill="none"
          strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (pct / 100) * c }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute font-mono font-bold text-zinc-100 tabular-nums leading-none" style={{ fontSize: size * 0.26 }}>
        {Math.round(score)}
      </span>
    </div>
  )
}

const ConfArc = ({ rd, size = 24 }: { rd: number; size?: number }) => {
  const conf = rdToConfidence(rd)
  const fill = conf >= 70 ? "#34d399" : conf >= 40 ? "#fbbf24" : "#71717a"
  const r = (size - 4) / 2, c = 2 * Math.PI * r

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#18181b" strokeWidth={2} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={fill} strokeWidth={2} fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (conf / 100) * c}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }} />
      </svg>
      <span className="absolute text-[7px] font-mono font-bold tabular-nums" style={{ color: fill }}>{conf}</span>
    </div>
  )
}

export const Mastery = () => {
  const [data, setData] = useState<TagMastery[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showMath, setShowMath] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

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
    <div className="grid h-56 place-items-center font-sans">
      <div className="flex flex-col items-center gap-2">
        <RefreshCw size={20} className="animate-spin text-[#dfa054]" />
        <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">Evaluating Glicko-2 Telemetry...</span>
      </div>
    </div>
  )

  if (!data.length || !analytics) return (
    <Card className="grid min-h-56 place-items-center border-dashed border-zinc-800 bg-[#09090b] p-8 text-center font-sans">
      <div>
        <Trophy className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
        <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">No Mastery Data Logged</h2>
        <p className="mx-auto mt-1 max-w-[260px] text-xs leading-relaxed text-zinc-500 font-mono">
          Run a sync in Settings to compute your Glicko-2 tag ratings and weakness analytics.
        </p>
      </div>
    </Card>
  )

  const { sorted, powerIndex, avgRd, avgVol, solved, attempted, firstAc, tierDist, top3, weakest, closestPromo, mostVolatile, mostPracticed } = analytics
  const pi = getTier(powerIndex)
  const conf = rdToConfidence(avgRd)
  const stability = getStability(avgVol)
  const nextTr = nextTier(powerIndex)

  return (
    <div className="space-y-4 pb-6 font-sans select-none animate-fadeIn">

      {/* ══════════ TOP HEADER & REFRESH ══════════ */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-[#dfa054]" />
          <div>
            <h2 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">Glicko-2 Mastery System</h2>
            <p className="text-[10px] text-zinc-400 font-mono">Statistically Rigorous ELO • Rating Deviation (RD) • Volatility</p>
          </div>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-800 bg-zinc-900/60 text-[10px] font-mono text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition cursor-pointer"
        >
          <RefreshCw size={11} className={refreshing ? "animate-spin text-[#dfa054]" : ""} />
          <span>{refreshing ? "Computing..." : "Recalculate"}</span>
        </button>
      </div>

      {/* ══════════ HERO COMPOSITE POWER INDEX CARD ══════════ */}
      <motion.section
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-xl border bg-zinc-950/60 p-4.5 shadow-sm"
        style={{ borderColor: pi.border }}
      >
        {/* Glow backdrop */}
        <div className="absolute -top-16 -right-16 h-36 w-36 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: pi.color, opacity: 0.15 }} />

        <div className="relative space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.2em] text-zinc-400 font-mono">
              <Sigma size={12} style={{ color: pi.color }} /> Composite Power ELO Index
            </span>
            <span className="rounded px-2 py-0.5 text-[9px] font-mono font-bold uppercase border"
              style={{ color: pi.color, backgroundColor: pi.bg, borderColor: pi.border }}>
              {pi.name} Tier
            </span>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <motion.span
                className="text-4xl font-bold font-mono tracking-tight text-zinc-100 leading-none tabular-nums"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 180 }}
              >
                {Math.round(powerIndex)}
              </motion.span>
              <span className="text-xs font-mono text-zinc-500 ml-1.5">ELO</span>
            </div>

            <RingGauge score={powerIndex} size={50} sw={3} />
          </div>

          {/* Progress to next tier */}
          {nextTr && (
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[9px] font-mono text-zinc-400">
                <span>Next Tier: <strong style={{ color: nextTr.color }}>{nextTr.name}</strong> ({nextTr.floor} ELO)</span>
                <span className="font-bold text-zinc-200">{Math.max(0, nextTr.floor - Math.round(powerIndex))} ELO needed</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-900 border border-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ 
                    width: `${Math.min(100, Math.max(5, (powerIndex / nextTr.floor) * 100))}%`,
                    backgroundColor: pi.color
                  }}
                />
              </div>
            </div>
          )}

          {/* 3 Metric Cards */}
          <div className="grid grid-cols-3 gap-2 pt-1 font-mono">
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2 text-center">
              <div className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">Confidence</div>
              <div className={`mt-0.5 text-xs font-bold tabular-nums ${conf >= 60 ? "text-emerald-400" : conf >= 35 ? "text-amber-400" : "text-zinc-400"}`}>{conf}%</div>
            </div>

            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2 text-center">
              <div className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">Volatility</div>
              <div className={`mt-0.5 text-xs font-bold ${stability.color}`}>{stability.label}</div>
            </div>

            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2 text-center">
              <div className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">1st Try AC</div>
              <div className="mt-0.5 text-xs font-bold text-emerald-400 tabular-nums">{attempted > 0 ? Math.round((firstAc / attempted) * 100) : 0}%</div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ══════════ PODIUM: TOP 3 MASTERED TOPICS ══════════ */}
      {top3.length >= 3 && (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">
            <Trophy size={13} /> Top 3 Mastered Topics
          </div>
          <div className="grid grid-cols-3 gap-2">
            {top3.map((m, idx) => {
              const score = Math.round(m.masteryScore || 800)
              const tier = getTier(score)
              const medalColors = ["#dfa054", "#94a3b8", "#b45309"]
              const medalLabels = ["#1 GOLD", "#2 SILVER", "#3 BRONZE"]
              return (
                <div 
                  key={m.tag}
                  className="rounded-xl border p-2.5 bg-zinc-950/60 flex flex-col justify-between space-y-2 relative overflow-hidden"
                  style={{ borderColor: tier.border }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[7.5px] font-mono font-bold px-1.5 py-0.2 rounded border" style={{ backgroundColor: `${medalColors[idx]}20`, color: medalColors[idx], borderColor: `${medalColors[idx]}40` }}>
                      {medalLabels[idx]}
                    </span>
                    <RingGauge score={score} size={30} sw={2} />
                  </div>

                  <div>
                    <p className="text-[11px] font-bold text-zinc-100 truncate" title={m.tag}>{m.tag}</p>
                    <p className="text-[8.5px] font-mono text-zinc-400 mt-0.5">{m.totalSolved} solved ({m.totalAttempted > 0 ? Math.round((m.totalSolved / m.totalAttempted) * 100) : 0}% WR)</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ══════════ SKILL CONSTELLATION RADAR CHART ══════════ */}
      {(() => {
        const items = sorted.filter(d => d.totalAttempted >= 2).slice(0, 8)
        if (items.length < 3) return null
        const rd = items.map(d => ({
          subject: d.tag.length > 10 ? d.tag.slice(0, 9) + '…' : d.tag,
          score: Math.round(d.masteryScore || 800),
          raw: Math.round((d.rawRating || d.masteryScore || 800) + (d.rd ? d.rd * 1.8 : 0)),
        }))
        return (
          <Card className="p-3.5 bg-zinc-950/60 border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider text-sky-400 font-mono">
                <Brain size={12} /> Skill Constellation
              </span>
              <div className="flex items-center gap-2.5 text-[8px] font-mono text-zinc-400">
                <span className="flex items-center gap-1"><span className="w-2 h-[2px] rounded bg-sky-400" /> Raw Rating</span>
                <span className="flex items-center gap-1"><span className="w-2 h-[2px] rounded" style={{ backgroundColor: pi.color }} /> Glicko-2</span>
              </div>
            </div>
            <div className="h-[190px] w-full">
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

      {/* ══════════ TIER DISTRIBUTION BAR ══════════ */}
      <Card className="p-3 bg-zinc-950/60 border-zinc-800/80 space-y-2">
        <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
          <BarChart3 size={12} /> Tier Distribution ({sorted.length} Topics)
        </span>

        <div className="flex h-4.5 rounded-md overflow-hidden border border-zinc-800">
          {TIERS.filter(t => (tierDist[t.name] || 0) > 0).map(t => {
            const n = tierDist[t.name] || 0
            const w = (n / sorted.length) * 100
            const tierStyle = getTier(t.floor)
            return (
              <div 
                key={t.name} 
                className="flex items-center justify-center text-[8px] font-bold font-mono transition-all"
                style={{ width: `${w}%`, backgroundColor: tierStyle.bg, color: t.color }}
                title={`${t.name}: ${n} topics`}
              >
                {w >= 12 ? n : ''}
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
          {TIERS.filter(t => (tierDist[t.name] || 0) > 0).map(t => (
            <div key={t.name} className="flex items-center gap-1 text-[8.5px] font-mono text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.color }} />
              <span style={{ color: t.color }}>{t.name}:</span>
              <span className="font-bold text-zinc-200">{tierDist[t.name]}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ══════════ TOPIC SEARCH & FILTERS ══════════ */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-200 font-mono flex items-center gap-1.5">
            <Layers size={13} className="text-[#dfa054]" /> Topic Breakdown ({filteredTopics.length})
          </span>
          <span className="text-[9px] font-mono text-zinc-500">Click any topic card to expand</span>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-2 gap-2 font-mono">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topic tags..."
              className="w-full bg-zinc-950/60 border border-zinc-800 rounded-lg pl-8 pr-2.5 py-1.5 text-[10px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#dfa054]"
            />
          </div>

          <div className="flex gap-1.5">
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="flex-1 bg-zinc-950/60 border border-zinc-800 rounded-lg px-2 py-1.5 text-[10px] text-zinc-300 focus:outline-none focus:border-[#dfa054]"
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
              className="flex-1 bg-zinc-950/60 border border-zinc-800 rounded-lg px-2 py-1.5 text-[10px] text-zinc-300 focus:outline-none focus:border-[#dfa054]"
            >
              <option value="score">Highest ELO</option>
              <option value="weakest">Weakest First</option>
              <option value="solved">Most Solved</option>
              <option value="volatility">Highest Volatility</option>
            </select>
          </div>
        </div>
      </div>

      {/* ══════════ EXPANDABLE TOPIC CARDS LIST ══════════ */}
      <div className="space-y-2">
        {filteredTopics.length === 0 ? (
          <Card className="p-4 text-center text-xs font-mono text-zinc-500 border-zinc-800/80 bg-zinc-950/40">
            No topic tags match your active search filter.
          </Card>
        ) : (
          filteredTopics.map((m, i) => {
            const score = m.masteryScore || 800
            const rd = m.rd || 350
            const vol = m.volatility || 0.06
            const winRate = m.totalAttempted > 0 ? Math.round((m.totalSolved / m.totalAttempted) * 100) : 0
            const stab = getStability(vol)
            const open = expanded === m.tag
            const tierStyle = getTier(score)

            return (
              <motion.div 
                key={m.tag}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="rounded-xl border bg-zinc-950/60 overflow-hidden transition-all hover:border-zinc-700/80"
                style={{ borderColor: open ? tierStyle.color : "rgba(39,39,42,0.8)" }}
              >
                <button 
                  onClick={() => setExpanded(open ? null : m.tag)} 
                  className="w-full flex items-center gap-3 p-3 text-left cursor-pointer"
                >
                  <RingGauge score={score} size={44} sw={2.5} />
                  
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-bold text-zinc-100" title={m.tag}>{m.tag}</span>
                      <span className="text-[9px] font-mono font-bold text-zinc-300 bg-zinc-900 border border-zinc-800 px-1.5 py-0.2 rounded">
                        {winRate}% WR
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-mono font-bold px-1.5 py-0.2 rounded border" style={{ color: tierStyle.color, backgroundColor: tierStyle.bg, borderColor: tierStyle.border }}>
                        {tierStyle.name}
                      </span>

                      <div className="flex items-center gap-1 text-[9px] font-mono text-zinc-400">
                        <ConfArc rd={rd} size={13} />
                        <span>RD {Math.round(rd)}</span>
                      </div>

                      <div className={`flex items-center gap-1 px-1.5 py-0.2 rounded text-[8px] font-mono font-semibold border ${stab.bg} ${stab.color} ${stab.border}`}>
                        <stab.icon size={9} />
                        <span>{stab.label}</span>
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
                      className="overflow-hidden border-t border-zinc-800/80 bg-zinc-900/30"
                    >
                      <div className="p-3 space-y-3">
                        {/* 4 Detail Badges */}
                        <div className="grid grid-cols-4 gap-1.5 font-mono text-center">
                          <div className="rounded-lg bg-zinc-950 p-1.5 border border-zinc-800/60">
                            <div className="text-[7.5px] uppercase font-bold text-zinc-500">Solved</div>
                            <div className="text-xs font-bold text-zinc-200 mt-0.5">{m.totalSolved} / {m.totalAttempted}</div>
                          </div>

                          <div className="rounded-lg bg-zinc-950 p-1.5 border border-zinc-800/60">
                            <div className="text-[7.5px] uppercase font-bold text-zinc-500">1st AC</div>
                            <div className="text-xs font-bold text-emerald-400 mt-0.5">{m.totalAttempted > 0 ? Math.round((m.firstAcCount / m.totalAttempted) * 100) : 0}%</div>
                          </div>

                          <div className="rounded-lg bg-zinc-950 p-1.5 border border-zinc-800/60">
                            <div className="text-[7.5px] uppercase font-bold text-zinc-500">Volatility</div>
                            <div className="text-xs font-bold text-rose-400 mt-0.5">{vol.toFixed(3)}</div>
                          </div>

                          <div className="rounded-lg bg-zinc-950 p-1.5 border border-zinc-800/60">
                            <div className="text-[7.5px] uppercase font-bold text-zinc-500">Last Solved</div>
                            <div className="text-xs font-bold text-sky-400 mt-0.5">{timeSince(m.lastSolvedAt).text}</div>
                          </div>
                        </div>

                        {/* Direct Practice Button */}
                        <a
                          href={`https://leetcode.com/tag/${m.tag.toLowerCase().replace(/\s+/g, '-')}/`}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[#dfa054]/30 bg-[#dfa054]/10 hover:bg-[#dfa054]/20 py-2 text-[10.5px] font-mono font-bold text-[#dfa054] transition cursor-pointer"
                        >
                          <span>Practice {m.tag} Problems on LeetCode</span>
                          <ArrowUpRight size={12} />
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

      {/* ══════════ MILESTONES & QUICK DRILLS ══════════ */}
      <Card className="p-3.5 bg-zinc-950/60 border-zinc-800/80 space-y-2.5">
        <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider text-amber-400 font-mono">
          <Award size={12} /> Mastery Milestones & Drills
        </span>

        <div className="space-y-2 font-mono text-[10px]">
          {weakest && (
            <a 
              href={`https://leetcode.com/tag/${weakest.tag.toLowerCase().replace(/\s+/g, '-')}/`}
              target="_blank" 
              rel="noreferrer"
              className="flex items-center justify-between p-2.5 rounded-lg border border-rose-500/30 bg-rose-950/10 hover:bg-rose-950/20 transition group"
            >
              <div className="flex items-center gap-2">
                <Target size={13} className="text-rose-400 shrink-0" />
                <div>
                  <span className="font-bold text-rose-300">Drill Weakest Tag: {weakest.tag}</span>
                  <span className="text-[9px] text-zinc-500 block">Rating: {Math.round(weakest.masteryScore || 800)} ELO</span>
                </div>
              </div>
              <ArrowUpRight size={13} className="text-rose-400 group-hover:translate-x-0.5 transition-transform" />
            </a>
          )}

          {closestPromo && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg border border-amber-500/30 bg-amber-950/10 text-amber-300">
              <TrendingUp size={13} className="text-amber-400 shrink-0" />
              <div>
                <span className="font-bold">Closest to Promotion: {closestPromo.tag}</span>
                <span className="text-[9px] text-zinc-400 block">Need +{Math.round(closestPromo.needed)} ELO to reach <strong style={{ color: closestPromo.color }}>{closestPromo.tier}</strong></span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ══════════ HOW GLICKO-2 WORKS DRAWER ══════════ */}
      <Card className="p-0 bg-zinc-950/60 border-zinc-800/80 overflow-hidden">
        <button 
          onClick={() => setShowMath(!showMath)}
          className="w-full flex items-center justify-between p-3 text-left cursor-pointer font-mono"
        >
          <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider text-purple-400">
            <Info size={12} /> How Glicko-2 Rating Telemetry Works
          </span>
          <ChevronDown size={12} className={`text-zinc-500 transition-transform ${showMath ? 'rotate-180 text-zinc-200' : ''}`} />
        </button>
        
        <AnimatePresence>
          {showMath && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} 
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} 
              transition={{ duration: 0.2 }}
              className="border-t border-zinc-800/80 p-3.5 space-y-2 text-[10px] text-zinc-400 font-sans leading-relaxed"
            >
              <div className="flex items-center gap-1.5 font-bold text-zinc-200 font-mono">
                <Sparkles size={12} className="text-purple-400" />
                <span>Glicko-2 Mathematical Specification</span>
              </div>
              <p>
                AlgoVault models your algorithmic competence per topic tag using Mark Glickman's Glicko-2 algorithm (the mathematical engine used in competitive chess and gaming leaderboards).
              </p>

              <div className="space-y-1.5 font-mono text-[9px] pt-1">
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                  <strong className="text-purple-300">1. Problem Difficulty Opponent:</strong> Each LeetCode problem acts as an opponent with ZeroTrac rating ELO R_p.
                </div>
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                  <strong className="text-emerald-300">2. Performance Score:</strong> 1st AC = 1.0, Retry AC = 0.7, Hint = 0.5, Failure = 0.0.
                </div>
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                  <strong className="text-sky-300">3. Rating Deviation (RD):</strong> Tracks certainty. More solves reduce RD (increasing confidence).
                </div>
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
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

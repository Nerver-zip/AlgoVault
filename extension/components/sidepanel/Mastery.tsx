import React, { useEffect, useState, useMemo } from "react"
import { Card } from "../ui/Card"
import { fetchMastery } from "../../lib/api/backend"
import { getCachedMastery, setCachedMastery } from "../../lib/storage"
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Target, Shield, Zap, TrendingUp, Trophy, Activity, RefreshCw, ChevronDown, ChevronUp, Clock, Crosshair, Flame, ArrowUpRight, Brain, Sigma, Info, Sparkles, Award, BarChart3, Swords, Lock, Gauge } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { TagMastery } from "../../lib/types"

/* ══════════════════════════════════════════════════════════
   TIER SYSTEM — Competitive Programming Style
   Mathematically defined thresholds inspired by Codeforces
   ══════════════════════════════════════════════════════════ */
const TIERS = [
  { name: "Grandmaster", floor: 2200, color: "#ef4444", gradient: "from-red-500/20 to-red-900/10", glow: "shadow-[0_0_30px_rgba(239,68,68,0.15)]" },
  { name: "Master",      floor: 1900, color: "#f59e0b", gradient: "from-amber-500/20 to-amber-900/10", glow: "shadow-[0_0_30px_rgba(245,158,11,0.15)]" },
  { name: "Expert",      floor: 1600, color: "#a855f7", gradient: "from-purple-500/20 to-purple-900/10", glow: "shadow-[0_0_30px_rgba(168,85,247,0.15)]" },
  { name: "Specialist",  floor: 1400, color: "#38bdf8", gradient: "from-sky-500/20 to-sky-900/10", glow: "shadow-[0_0_30px_rgba(56,189,248,0.15)]" },
  { name: "Pupil",       floor: 1200, color: "#34d399", gradient: "from-emerald-500/20 to-emerald-900/10", glow: "shadow-[0_0_30px_rgba(52,211,153,0.15)]" },
  { name: "Newbie",      floor: 0,    color: "#a1a1aa", gradient: "from-zinc-500/10 to-zinc-900/5", glow: "" },
] as const

type TierInfo = typeof TIERS[number] & { bg: string; border: string }

const getTier = (score: number): TierInfo => {
  const tier = TIERS.find(t => score >= t.floor) || TIERS[TIERS.length - 1]
  return {
    ...tier,
    bg: `rgba(${hexToRgb(tier.color)},0.12)`,
    border: `rgba(${hexToRgb(tier.color)},0.3)`,
  }
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

const nextTier = (score: number) => {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (score < TIERS[i].floor) return TIERS[i]
  }
  return null
}

/* ══════════════════════════════════════════════════════════
   DERIVED METRICS — Pure functions backed by Glicko-2 math
   ══════════════════════════════════════════════════════════ */

/** Confidence percentage from Rating Deviation: 100% at RD=0, 0% at RD≥350 */
const rdToConfidence = (rd: number) => Math.max(0, Math.round(100 - (rd / 3.5)))

/** Stability label from Glicko-2 volatility σ */
const getStability = (vol: number) => {
  if (vol <= 0.04) return { label: "Rock Solid", color: "text-emerald-400", bg: "bg-emerald-400/10", icon: Shield }
  if (vol <= 0.06) return { label: "Stable", color: "text-sky-400", bg: "bg-sky-400/10", icon: Shield }
  if (vol <= 0.08) return { label: "Moderate", color: "text-amber-400", bg: "bg-amber-400/10", icon: Activity }
  return { label: "Volatile", color: "text-rose-400", bg: "bg-rose-400/10", icon: Zap }
}

/** Time since last solved, human readable */
const timeSince = (dateStr?: string) => {
  if (!dateStr) return { text: "Never", isDecaying: true }
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return { text: "Today", isDecaying: false }
  if (days === 1) return { text: "Yesterday", isDecaying: false }
  if (days < 7) return { text: `${days}d ago`, isDecaying: false }
  if (days < 30) return { text: `${Math.floor(days / 7)}w ago`, isDecaying: false }
  if (days < 60) return { text: `1mo ago`, isDecaying: true }
  return { text: `${Math.floor(days / 30)}mo ago`, isDecaying: true }
}

/** Format solve time in minutes. Caps at 120m to filter out inflated
 *  wall-clock fallbacks from the backend (e.g. problem opened Mon, solved Tue). */
const formatTime = (minutes?: number | null) => {
  if (!minutes || minutes <= 0) return null
  const capped = Math.min(minutes, 120)
  if (capped < 60) return `${Math.round(capped)}m`
  return `${Math.floor(capped / 60)}h ${Math.round(capped % 60)}m`
}

/* ══════════════════════════════════════════════════════════
   RING GAUGE — Animated SVG circular progress indicator
   ══════════════════════════════════════════════════════════ */
const RingGauge = ({ score, size = 56, strokeWidth = 3.5, showTier = false }: { score: number; size?: number; strokeWidth?: number; showTier?: boolean }) => {
  const percent = Math.max(3, Math.min(100, Math.round((score / 2500) * 100)))
  const tier = getTier(score)
  const r = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * r
  const dashOffset = circumference - (percent / 100) * circumference

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1c1c1f" strokeWidth={strokeWidth} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={tier.color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-bold text-zinc-100 tabular-nums leading-none" style={{ fontSize: size * 0.26 }}>
          {Math.round(score)}
        </span>
        {showTier && (
          <span className="text-[7px] font-bold uppercase tracking-wider mt-0.5" style={{ color: tier.color }}>
            {tier.name}
          </span>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   CONFIDENCE ARC — Visual representation of Rating Deviation
   Shows how "certain" we are about a rating
   ══════════════════════════════════════════════════════════ */
const ConfidenceArc = ({ rd, size = 32 }: { rd: number; size?: number }) => {
  const conf = rdToConfidence(rd)
  const color = conf >= 70 ? "#34d399" : conf >= 40 ? "#fbbf24" : "#71717a"
  const r = (size - 4) / 2
  const circumference = 2 * Math.PI * r
  const dashOffset = circumference - (conf / 100) * circumference

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1c1c1f" strokeWidth={2.5} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={2.5} fill="none"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <span className="absolute text-[8px] font-mono font-bold tabular-nums" style={{ color }}>{conf}%</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   MAIN MASTERY COMPONENT
   ══════════════════════════════════════════════════════════ */
export const Mastery = () => {
  const [data, setData] = useState<TagMastery[]>([])
  const [loading, setLoading] = useState(true)
  const [showMathExplainer, setShowMathExplainer] = useState(false)
  const [expandedTag, setExpandedTag] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getCachedMastery().then((cached) => {
      if (live && cached && cached.length > 0) {
        setData(cached)
        setLoading(false)
      }
    })
    fetchMastery()
      .then((fresh) => {
        if (!live) return
        setData(fresh)
        setCachedMastery(fresh)
      })
      .catch(console.error)
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])

  /* ── Computed Analytics ── */
  const analytics = useMemo(() => {
    if (data.length === 0) return null
    const sorted = [...data].sort((a, b) => (b.masteryScore || 0) - (a.masteryScore || 0))

    // Composite Power Index: weighted average where w_i = n_i / RD_i
    let weightedSum = 0, totalWeight = 0
    let totalSolved = 0, totalAttempted = 0, totalFirstAc = 0
    let solveTimeSum = 0, solveTimeCount = 0

    sorted.forEach(m => {
      const rd = m.rd || 350
      const n = m.totalAttempted || 1
      const w = n / Math.max(rd, 30)
      weightedSum += w * (m.masteryScore || 800)
      totalWeight += w
      totalSolved += m.totalSolved || 0
      totalAttempted += m.totalAttempted || 0
      totalFirstAc += m.firstAcCount || 0
      if (m.avgSolveTime && m.avgSolveTime > 0) {
        solveTimeSum += m.avgSolveTime
        solveTimeCount++
      }
    })

    const powerIndex = totalWeight > 0 ? weightedSum / totalWeight : 800

    // Weighted average RD & volatility
    let rdWeightedSum = 0, volWeightedSum = 0, rdTotalW = 0
    sorted.forEach(m => {
      const w = m.totalAttempted || 1
      rdWeightedSum += w * (m.rd || 350)
      volWeightedSum += w * (m.volatility || 0.06)
      rdTotalW += w
    })
    const avgRd = rdTotalW > 0 ? rdWeightedSum / rdTotalW : 350
    const avgVol = rdTotalW > 0 ? volWeightedSum / rdTotalW : 0.06

    // Tier distribution
    const tierDist: Record<string, number> = {}
    TIERS.forEach(t => { tierDist[t.name] = 0 })
    sorted.forEach(m => { tierDist[getTier(m.masteryScore || 800).name]++ })

    // Milestones — computed with reduce to avoid TypeScript closure narrowing issues
    const closestPromotionResult = sorted.reduce<{ tag: string; score: number; needed: number; targetTier: string; targetColor: string } | null>((best, m) => {
      const next = nextTier(m.masteryScore || 0)
      if (!next) return best
      const gap = next.floor - (m.masteryScore || 0)
      if (!best || gap < best.needed) {
        return { tag: m.tag, score: m.masteryScore || 0, needed: gap, targetTier: next.name, targetColor: next.color }
      }
      return best
    }, null)

    const mostVolatileResult = sorted.reduce<TagMastery | null>((best, m) => {
      if (!best || (m.volatility || 0) > (best.volatility || 0)) return m
      return best
    }, null)

    const mostPracticedResult = sorted.reduce<TagMastery | null>((best, m) => {
      if (!best || (m.totalAttempted || 0) > (best.totalAttempted || 0)) return m
      return best
    }, null)

    return {
      sorted,
      powerIndex,
      avgRd,
      avgVol,
      totalSolved,
      totalAttempted,
      totalFirstAc,
      avgSolveTime: solveTimeCount > 0 ? solveTimeSum / solveTimeCount : null,
      tierDist,
      topTags: sorted.slice(0, 3),
      weakestTag: sorted[sorted.length - 1],
      closestPromotion: closestPromotionResult,
      mostVolatile: mostVolatileResult,
      mostPracticed: mostPracticedResult,
    }
  }, [data])

  /* ── Loading State ── */
  if (loading) return (
    <div className="grid h-48 place-items-center">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500">
        <RefreshCw size={14} className="animate-spin" /> Computing Glicko-2 ratings
      </div>
    </div>
  )

  /* ── Empty State ── */
  if (data.length === 0 || !analytics) return (
    <Card className="grid min-h-56 place-items-center border-dashed border-zinc-800 bg-zinc-950/40 p-7 text-center">
      <div>
        <Trophy className="mx-auto h-7 w-7 text-zinc-600" />
        <h2 className="mt-3 text-sm font-semibold text-zinc-200">No mastery data yet.</h2>
        <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-zinc-500">
          Solve problems to generate your Glicko-2 skill ratings and unlock detailed mastery analytics.
        </p>
      </div>
    </Card>
  )

  const { sorted, powerIndex, avgRd, avgVol, totalSolved, totalAttempted, totalFirstAc, avgSolveTime, tierDist, topTags, weakestTag, closestPromotion, mostVolatile, mostPracticed } = analytics
  const piTier = getTier(powerIndex)
  const overallConf = rdToConfidence(avgRd)
  const overallStability = getStability(avgVol)

  return (
    <div className="grid gap-4 pb-6">

      {/* ═══════════════════════════════════════════════════════
          SECTION 1 — COMPOSITE POWER INDEX (HERO CARD)
          Weighted average: w_i = n_i / RD_i
          ═══════════════════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${piTier.gradient} px-5 py-5 ${piTier.glow}`}
        style={{ borderColor: piTier.border }}
      >
        {/* Ambient Glow Orbs */}
        <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full blur-[80px]" style={{ backgroundColor: piTier.color, opacity: 0.18 }} />
        <div className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full blur-[80px]" style={{ backgroundColor: piTier.color, opacity: 0.12 }} />

        <div className="relative">
          {/* Title Row */}
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            <Sigma size={12} style={{ color: piTier.color }} /> Composite Power Index
          </div>

          {/* Score + Tier Badge */}
          <div className="mt-2 flex items-end justify-between">
            <div className="flex items-baseline gap-3">
              <motion.h2
                className="text-[42px] font-bold font-mono tracking-tighter text-white leading-none"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              >
                {Math.round(powerIndex)}
              </motion.h2>
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: piTier.bg, color: piTier.color, border: `1px solid ${piTier.border}` }}
              >
                {piTier.name}
              </span>
            </div>
            <RingGauge score={powerIndex} size={52} strokeWidth={3} />
          </div>

          {/* Overall Metrics Row */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-zinc-800/60 bg-black/30 px-2.5 py-2 text-center">
              <div className="text-[8px] font-semibold uppercase tracking-widest text-zinc-500">Confidence</div>
              <div className={`mt-1 text-xs font-bold tabular-nums ${overallConf >= 60 ? 'text-emerald-400' : overallConf >= 35 ? 'text-amber-400' : 'text-zinc-500'}`}>
                {overallConf}%
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800/60 bg-black/30 px-2.5 py-2 text-center">
              <div className="text-[8px] font-semibold uppercase tracking-widest text-zinc-500">Stability</div>
              <div className={`mt-1 text-xs font-bold ${overallStability.color}`}>
                {overallStability.label}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800/60 bg-black/30 px-2.5 py-2 text-center">
              <div className="text-[8px] font-semibold uppercase tracking-widest text-zinc-500">1st AC%</div>
              <div className="mt-1 text-xs font-bold tabular-nums text-zinc-100">
                {totalAttempted > 0 ? Math.round((totalFirstAc / totalAttempted) * 100) : 0}%
              </div>
            </div>
          </div>

          {/* Mini Stats Strip */}
          <div className="mt-3 flex items-center justify-between text-[9px] font-mono text-zinc-500 border-t border-zinc-800/40 pt-3">
            <span>{sorted.length} topics tracked</span>
            <span>{totalSolved} / {totalAttempted} solved</span>
            {avgSolveTime && <span>{formatTime(avgSolveTime)} avg</span>}
          </div>
        </div>
      </motion.section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 2 — SKILL CONSTELLATION (DUAL-LAYER RADAR)
          Outer = Raw Rating, Inner = Conservative Score
          ═══════════════════════════════════════════════════════ */}
      {(() => {
        const radarItems = sorted.filter(d => d.totalAttempted >= 2).slice(0, 8)
        if (radarItems.length < 3) return null
        const radarData = radarItems.map(d => ({
          subject: d.tag.length > 12 ? d.tag.slice(0, 11) + '…' : d.tag,
          conservative: Math.round(d.masteryScore || 800),
          raw: Math.round((d.rawRating || d.masteryScore || 800) + (d.rd ? d.rd * 2 : 0)),
          fullMark: 2500,
        }))

        return (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-950/50 p-4 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-400/80">
                <Brain size={13} /> Skill Constellation
              </div>
              <div className="flex items-center gap-3 text-[8px] font-mono text-zinc-500">
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-0.5 rounded bg-sky-400/60" /> Raw</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-0.5 rounded" style={{ backgroundColor: piTier.color }} /> Score</span>
              </div>
            </div>
            <div className="h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
                  <PolarGrid stroke="#27272a" strokeDasharray="3 3" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 8, fontFamily: 'ui-monospace, monospace', fontWeight: 600 }} />
                  <Radar name="Raw Rating" dataKey="raw" stroke="rgba(56,189,248,0.4)" strokeWidth={1} fill="rgba(56,189,248,0.06)" fillOpacity={1} />
                  <Radar name="Score" dataKey="conservative" stroke={piTier.color} strokeWidth={2} fill={piTier.color} fillOpacity={0.15} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(9,9,11,0.97)', border: '1px solid #27272a', borderRadius: '10px', fontSize: 10, fontFamily: 'ui-monospace, monospace', boxShadow: '0 12px 30px -5px rgba(0,0,0,0.6)', padding: '8px 12px' }}
                    itemStyle={{ fontWeight: 'bold' }}
                    formatter={(value: number, name: string) => [`${value}`, name]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </motion.section>
        )
      })()}

      {/* ═══════════════════════════════════════════════════════
          SECTION 3 — RATING DISTRIBUTION (TIER HISTOGRAM)
          Visual breakdown of how many tags fall into each tier
          ═══════════════════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl border border-zinc-800/60 bg-zinc-950/50 p-4"
      >
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-3">
          <BarChart3 size={13} /> Tier Distribution
        </div>

        {/* Segmented bar */}
        <div className="flex h-6 rounded-lg overflow-hidden border border-zinc-800/40">
          {TIERS.filter(t => (tierDist[t.name] || 0) > 0).map(tier => {
            const count = tierDist[tier.name] || 0
            const pct = (count / sorted.length) * 100
            return (
              <div
                key={tier.name}
                className="flex items-center justify-center text-[9px] font-bold font-mono transition-all relative group"
                style={{ width: `${pct}%`, backgroundColor: `rgba(${hexToRgb(tier.color)},0.25)`, color: tier.color, minWidth: count > 0 ? '28px' : '0' }}
                title={`${tier.name}: ${count} topic${count !== 1 ? 's' : ''}`}
              >
                {pct >= 12 ? count : ''}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
          {TIERS.filter(t => (tierDist[t.name] || 0) > 0).map(tier => (
            <div key={tier.name} className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-400">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: tier.color }} />
              <span style={{ color: tier.color }}>{tier.name}</span>
              <span className="text-zinc-600">{tierDist[tier.name]}</span>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 4 — TOPIC DEEP-DIVE CARDS
          Expanded view with confidence bands, solve stats,
          decay warnings, and interactive expansion
          ═══════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
            <TrendingUp size={13} /> All Topics · {sorted.length}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {sorted.map((m, i) => {
            const score = m.masteryScore || 800
            const rd = m.rd || 350
            const vol = m.volatility || 0.06
            const rawRating = m.rawRating || (score + rd * 2)
            const tier = getTier(score)
            const conf = rdToConfidence(rd)
            const stability = getStability(vol)
            const winRate = m.totalAttempted > 0 ? Math.round((m.totalSolved / m.totalAttempted) * 100) : 0
            const firstAcRate = m.totalAttempted > 0 ? Math.round((m.firstAcCount / m.totalAttempted) * 100) : 0
            const lastActive = timeSince(m.lastSolvedAt)
            const isExpanded = expandedTag === m.tag

            return (
              <motion.div
                key={m.tag}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.5) }}
                className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 overflow-hidden transition-colors hover:border-zinc-700/60"
              >
                {/* Main Row */}
                <button
                  onClick={() => setExpandedTag(isExpanded ? null : m.tag)}
                  className="w-full flex items-center gap-3.5 p-3.5 text-left cursor-pointer"
                >
                  <RingGauge score={score} size={46} strokeWidth={2.5} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-bold text-zinc-100">{m.tag}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {lastActive.isDecaying && (
                          <span className="text-[8px] font-bold uppercase tracking-wider text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            Decaying
                          </span>
                        )}
                        <span className="text-[9px] font-mono text-zinc-500 tabular-nums bg-black/30 px-1.5 py-0.5 rounded border border-zinc-800/50">
                          {winRate}% WR
                        </span>
                      </div>
                    </div>

                    <div className="mt-1.5 flex items-center gap-2">
                      <ConfidenceArc rd={rd} size={24} />
                      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${stability.bg}`}>
                        <stability.icon size={9} className={stability.color} />
                        <span className={`text-[8px] font-semibold tracking-wide ${stability.color}`}>{stability.label}</span>
                      </div>
                      <span className="text-[8px] font-mono text-zinc-600">{lastActive.text}</span>
                    </div>
                  </div>

                  <ChevronDown size={14} className={`text-zinc-600 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded Detail Panel */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3.5 pb-3.5 pt-0 border-t border-zinc-800/40">
                        {/* Rating Confidence Band */}
                        <div className="mt-3 rounded-lg border border-zinc-800/40 bg-black/20 p-3">
                          <div className="text-[8px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Rating Confidence Band</div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="relative h-2 rounded-full bg-zinc-800/50 overflow-hidden">
                                {/* Full band (raw rating extent) */}
                                <div
                                  className="absolute h-full rounded-full opacity-30"
                                  style={{
                                    backgroundColor: tier.color,
                                    left: `${Math.max(0, (score / 2500) * 100)}%`,
                                    width: `${Math.min(100 - (score / 2500) * 100, ((rawRating - score) / 2500) * 100)}%`
                                  }}
                                />
                                {/* Conservative score bar */}
                                <motion.div
                                  className="absolute h-full rounded-full"
                                  style={{ backgroundColor: tier.color }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.max(3, (score / 2500) * 100)}%` }}
                                  transition={{ duration: 0.8, ease: "easeOut" }}
                                />
                              </div>
                              <div className="mt-1.5 flex items-center justify-between text-[8px] font-mono">
                                <span className="text-zinc-500">Conservative: <span className="font-bold" style={{ color: tier.color }}>{Math.round(score)}</span></span>
                                <span className="text-zinc-600">Raw: <span className="font-bold text-zinc-400">{Math.round(rawRating)}</span></span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="mt-3 grid grid-cols-4 gap-1.5">
                          <div className="rounded-md border border-zinc-800/40 bg-black/20 p-2 text-center">
                            <div className="text-[7px] font-semibold uppercase tracking-widest text-zinc-600">Solved</div>
                            <div className="mt-0.5 text-[11px] font-bold font-mono tabular-nums text-zinc-200">{m.totalSolved}/{m.totalAttempted}</div>
                          </div>
                          <div className="rounded-md border border-zinc-800/40 bg-black/20 p-2 text-center">
                            <div className="text-[7px] font-semibold uppercase tracking-widest text-zinc-600">1st AC</div>
                            <div className="mt-0.5 text-[11px] font-bold font-mono tabular-nums text-emerald-400">{firstAcRate}%</div>
                          </div>
                          <div className="rounded-md border border-zinc-800/40 bg-black/20 p-2 text-center">
                            <div className="text-[7px] font-semibold uppercase tracking-widest text-zinc-600">RD</div>
                            <div className="mt-0.5 text-[11px] font-bold font-mono tabular-nums text-zinc-300">{Math.round(rd)}</div>
                          </div>
                          <div className="rounded-md border border-zinc-800/40 bg-black/20 p-2 text-center">
                            <div className="text-[7px] font-semibold uppercase tracking-widest text-zinc-600">σ</div>
                            <div className="mt-0.5 text-[11px] font-bold font-mono tabular-nums text-zinc-300">{vol.toFixed(3)}</div>
                          </div>
                        </div>

                        {m.avgSolveTime && m.avgSolveTime > 0 && (
                          <div className="mt-2 flex items-center gap-1.5 text-[9px] font-mono text-zinc-500">
                            <Clock size={10} /> Avg solve time: <span className="text-zinc-300 font-bold">{formatTime(m.avgSolveTime)}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 5 — THE MATH BEHIND YOUR RATING
          Plain-language Glicko-2 explainer
          ═══════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border border-zinc-800/60 bg-zinc-950/50 overflow-hidden">
        <button
          onClick={() => setShowMathExplainer(!showMathExplainer)}
          className="w-full flex items-center justify-between p-4 text-left cursor-pointer"
        >
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-400/80">
            <Info size={13} /> How Your Rating Works
          </div>
          <ChevronDown size={14} className={`text-zinc-600 transition-transform ${showMathExplainer ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {showMathExplainer && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3 text-[11px] leading-relaxed text-zinc-400 border-t border-zinc-800/40 pt-3">
                <div className="flex gap-2">
                  <Sparkles size={14} className="text-violet-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-zinc-200">Glicko-2 Rating System</span> — the same math used by chess.com, Lichess, and competitive gaming platforms.
                  </div>
                </div>

                <div className="grid gap-2 text-[10px]">
                  <div className="flex gap-2.5 rounded-lg border border-zinc-800/40 bg-black/20 p-2.5">
                    <Crosshair size={12} className="text-violet-400 shrink-0 mt-0.5" />
                    <div><span className="font-bold text-zinc-300">Starting Point</span> — your rating begins at <span className="font-mono text-violet-400">80% × contest_rating + 20% × 1500</span></div>
                  </div>
                  <div className="flex gap-2.5 rounded-lg border border-zinc-800/40 bg-black/20 p-2.5">
                    <Swords size={12} className="text-violet-400 shrink-0 mt-0.5" />
                    <div><span className="font-bold text-zinc-300">Each Problem = A Match</span> — the problem's Elo rating is your opponent. Harder opponents yield bigger gains.</div>
                  </div>
                  <div className="flex gap-2.5 rounded-lg border border-zinc-800/40 bg-black/20 p-2.5">
                    <BarChart3 size={12} className="text-violet-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-zinc-300">Score Weights</span>{' — '}
                      <span className="font-mono text-emerald-400">1st-try AC = 1.0</span>{' · '}
                      <span className="font-mono text-amber-400">Retry AC = 0.7</span>{' · '}
                      <span className="font-mono text-sky-400">Hint = 0.5</span>{' · '}
                      <span className="font-mono text-rose-400">Editorial = 0.0</span>
                    </div>
                  </div>
                  <div className="flex gap-2.5 rounded-lg border border-zinc-800/40 bg-black/20 p-2.5">
                    <Gauge size={12} className="text-violet-400 shrink-0 mt-0.5" />
                    <div><span className="font-bold text-zinc-300">RD (Rating Deviation)</span> — measures uncertainty. More solves → RD drops → rating stabilizes. Inactivity → RD rises → rating decays.</div>
                  </div>
                  <div className="flex gap-2.5 rounded-lg border border-zinc-800/40 bg-black/20 p-2.5">
                    <Lock size={12} className="text-violet-400 shrink-0 mt-0.5" />
                    <div><span className="font-bold text-zinc-300">Displayed Score</span> — <span className="font-mono text-violet-400">Rating − 2 × RD</span> (conservative lower bound). Prove consistency to climb.</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 6 — MILESTONES & ACHIEVEMENTS
          Closest promotion, most volatile, most practiced
          ═══════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border border-zinc-800/60 bg-zinc-950/50 p-4">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-400/80 mb-3">
          <Award size={13} /> Milestones
        </div>

        <div className="grid gap-2">
          {/* Closest to Promotion */}
          {closestPromotion && (
            <div className="flex items-center gap-3 rounded-lg border border-zinc-800/40 bg-black/20 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `rgba(${hexToRgb(closestPromotion.targetColor)},0.15)` }}>
                <TrendingUp size={14} style={{ color: closestPromotion.targetColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-zinc-200">Closest to Promotion</div>
                <div className="text-[9px] font-mono text-zinc-500 mt-0.5">
                  <span className="text-zinc-300">{closestPromotion.tag}</span> needs{' '}
                  <span className="font-bold" style={{ color: closestPromotion.targetColor }}>+{Math.round(closestPromotion.needed)}</span>{' '}
                  to reach <span style={{ color: closestPromotion.targetColor }}>{closestPromotion.targetTier}</span>
                </div>
              </div>
            </div>
          )}

          {/* Most Practiced */}
          {mostPracticed && (
            <div className="flex items-center gap-3 rounded-lg border border-zinc-800/40 bg-black/20 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10">
                <Flame size={14} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-zinc-200">Most Practiced</div>
                <div className="text-[9px] font-mono text-zinc-500 mt-0.5">
                  <span className="text-zinc-300">{mostPracticed.tag}</span> ·{' '}
                  <span className="text-emerald-400 font-bold">{mostPracticed.totalAttempted}</span> problems attempted
                </div>
              </div>
            </div>
          )}

          {/* Most Volatile */}
          {mostVolatile && (mostVolatile.volatility || 0) > 0.06 && (
            <div className="flex items-center gap-3 rounded-lg border border-zinc-800/40 bg-black/20 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-400/10">
                <Zap size={14} className="text-rose-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-zinc-200">Most Volatile</div>
                <div className="text-[9px] font-mono text-zinc-500 mt-0.5">
                  <span className="text-zinc-300">{mostVolatile.tag}</span> ·{' '}
                  σ = <span className="text-rose-400 font-bold">{(mostVolatile.volatility || 0).toFixed(3)}</span> — practice more for stability
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 7 — QUICK ACTIONS
          Drill weakest tag, continue best streak
          ═══════════════════════════════════════════════════════ */}
      {weakestTag && (
        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-950/50 p-4">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-3">
            <Crosshair size={13} /> Quick Actions
          </div>

          <div className="grid gap-2">
            <a
              href={`https://leetcode.com/tag/${weakestTag.tag.toLowerCase().replace(/\s+/g, '-')}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-zinc-800/40 bg-black/20 p-3 transition-colors hover:border-zinc-700/60 hover:bg-zinc-900/40 group"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-400/10">
                <Target size={14} className="text-rose-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-zinc-200">Drill Weakest Tag</div>
                <div className="text-[9px] font-mono text-zinc-500 mt-0.5">
                  <span className="text-zinc-300">{weakestTag.tag}</span> ·{' '}
                  <span className="font-bold" style={{ color: getTier(weakestTag.masteryScore || 800).color }}>{Math.round(weakestTag.masteryScore || 800)}</span> rating
                </div>
              </div>
              <ArrowUpRight size={14} className="text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
            </a>

            {topTags[0] && (
              <a
                href={`https://leetcode.com/tag/${topTags[0].tag.toLowerCase().replace(/\s+/g, '-')}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border border-zinc-800/40 bg-black/20 p-3 transition-colors hover:border-zinc-700/60 hover:bg-zinc-900/40 group"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `rgba(${hexToRgb(getTier(topTags[0].masteryScore || 800).color)},0.1)` }}>
                  <Trophy size={14} style={{ color: getTier(topTags[0].masteryScore || 800).color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-zinc-200">Push Your Strongest</div>
                  <div className="text-[9px] font-mono text-zinc-500 mt-0.5">
                    <span className="text-zinc-300">{topTags[0].tag}</span> ·{' '}
                    <span className="font-bold" style={{ color: getTier(topTags[0].masteryScore || 800).color }}>{Math.round(topTags[0].masteryScore || 800)}</span> rating
                  </div>
                </div>
                <ArrowUpRight size={14} className="text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

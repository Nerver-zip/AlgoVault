import React, { useEffect, useState, useMemo } from "react"
import { Card } from "../ui/Card"
import { fetchMastery } from "../../lib/api/backend"
import { getCachedMastery, setCachedMastery } from "../../lib/storage"
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Target, Shield, Zap, TrendingUp, Trophy, Activity, RefreshCw, ChevronDown, Clock, Crosshair, Flame, ArrowUpRight, Brain, Sigma, Info, Sparkles, Award, BarChart3, Swords, Lock, Gauge } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { TagMastery } from "../../lib/types"

/* ═══════════════════════════════════════════════════════════
   TIER SYSTEM
   Codeforces-inspired competitive programming tiers
   ═══════════════════════════════════════════════════════════ */
const TIERS = [
  { name: "Grandmaster", floor: 2200, color: "#ef4444" },
  { name: "Master",      floor: 1900, color: "#f59e0b" },
  { name: "Expert",      floor: 1600, color: "#a855f7" },
  { name: "Specialist",  floor: 1400, color: "#38bdf8" },
  { name: "Pupil",       floor: 1200, color: "#34d399" },
  { name: "Newbie",      floor: 0,    color: "#71717a" },
] as const

const hexRgb = (h: string) => `${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)}`

const getTier = (score: number) => {
  const t = TIERS.find(t => score >= t.floor) || TIERS[TIERS.length - 1]
  return { ...t, bg: `rgba(${hexRgb(t.color)},0.10)`, border: `rgba(${hexRgb(t.color)},0.25)` }
}

const nextTier = (score: number) => {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (score < TIERS[i].floor) return TIERS[i]
  }
  return null
}

/* ═══════════════════════════════════════════════════════════
   DERIVED METRICS — Pure functions from Glicko-2 parameters
   ═══════════════════════════════════════════════════════════ */
const rdToConfidence = (rd: number) => Math.max(0, Math.round(100 - (rd / 3.5)))

const getStability = (vol: number) => {
  if (vol <= 0.04) return { label: "Rock Solid", color: "text-emerald-400", bg: "bg-emerald-400/8", icon: Shield }
  if (vol <= 0.06) return { label: "Stable",     color: "text-sky-400",     bg: "bg-sky-400/8",     icon: Shield }
  if (vol <= 0.08) return { label: "Moderate",   color: "text-amber-400",   bg: "bg-amber-400/8",   icon: Activity }
  return                   { label: "Volatile",   color: "text-rose-400",    bg: "bg-rose-400/8",    icon: Zap }
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
   RING GAUGE — Animated SVG
   ═══════════════════════════════════════════════════════════ */
const RingGauge = ({ score, size = 52, sw = 3 }: { score: number; size?: number; sw?: number }) => {
  const pct = Math.max(3, Math.min(100, (score / 2500) * 100))
  const tier = getTier(score)
  const r = (size - sw * 2) / 2
  const c = 2 * Math.PI * r

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1a1a1e" strokeWidth={sw} fill="none" />
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

/* ═══════════════════════════════════════════════════════════
   CONFIDENCE ARC — Visual RD indicator
   ═══════════════════════════════════════════════════════════ */
const ConfArc = ({ rd, size = 26 }: { rd: number; size?: number }) => {
  const conf = rdToConfidence(rd)
  const fill = conf >= 70 ? "#34d399" : conf >= 40 ? "#fbbf24" : "#52525b"
  const r = (size - 4) / 2, c = 2 * Math.PI * r

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1a1a1e" strokeWidth={2} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={fill} strokeWidth={2} fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (conf / 100) * c}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }} />
      </svg>
      <span className="absolute text-[7px] font-mono font-bold tabular-nums" style={{ color: fill }}>{conf}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   MASTERY COMPONENT
   ═══════════════════════════════════════════════════════════ */
export const Mastery = () => {
  const [data, setData] = useState<TagMastery[]>([])
  const [loading, setLoading] = useState(true)
  const [showMath, setShowMath] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getCachedMastery().then(c => { if (live && c?.length) { setData(c); setLoading(false) } })
    fetchMastery()
      .then(f => { if (live) { setData(f); setCachedMastery(f) } })
      .catch(console.error)
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])

  const analytics = useMemo(() => {
    if (!data.length) return null
    const sorted = [...data].sort((a, b) => (b.masteryScore || 0) - (a.masteryScore || 0))

    // Power Index: weighted avg where w = attempts / RD (more data + more certainty = more weight)
    let wSum = 0, wTotal = 0, solved = 0, attempted = 0, firstAc = 0
    sorted.forEach(m => {
      const w = (m.totalAttempted || 1) / Math.max(m.rd || 350, 30)
      wSum += w * (m.masteryScore || 800); wTotal += w
      solved += m.totalSolved || 0; attempted += m.totalAttempted || 0; firstAc += m.firstAcCount || 0
    })

    let rdW = 0, volW = 0, rdN = 0
    sorted.forEach(m => {
      const n = m.totalAttempted || 1
      rdW += n * (m.rd || 350); volW += n * (m.volatility || 0.06); rdN += n
    })

    const tierDist: Record<string, number> = {}
    TIERS.forEach(t => { tierDist[t.name] = 0 })
    sorted.forEach(m => { tierDist[getTier(m.masteryScore || 800).name]++ })

    return {
      sorted,
      powerIndex: wTotal > 0 ? wSum / wTotal : 800,
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

  if (loading) return (
    <div className="grid h-48 place-items-center">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
        <RefreshCw size={13} className="animate-spin" /> Computing ratings
      </div>
    </div>
  )

  if (!data.length || !analytics) return (
    <Card className="grid min-h-56 place-items-center border-dashed border-zinc-800 bg-[#0e0e10] p-7 text-center">
      <div>
        <Trophy className="mx-auto h-6 w-6 text-zinc-700" />
        <h2 className="mt-3 text-[13px] font-semibold text-zinc-300">No mastery data yet</h2>
        <p className="mx-auto mt-1.5 max-w-[240px] text-[11px] leading-relaxed text-zinc-600">
          Solve problems to generate your Glicko-2 skill ratings.
        </p>
      </div>
    </Card>
  )

  const { sorted, powerIndex, avgRd, avgVol, solved, attempted, firstAc, tierDist, top3, weakest, closestPromo, mostVolatile, mostPracticed } = analytics
  const pi = getTier(powerIndex)
  const conf = rdToConfidence(avgRd)
  const stability = getStability(avgVol)

  return (
    <div className="space-y-3 pb-6 font-sans">

      {/* ══════════ S1 — COMPOSITE POWER INDEX ══════════ */}
      <motion.section
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl border bg-[#121214] p-5"
        style={{ borderColor: pi.border }}
      >
        <div className="absolute -top-20 -right-20 h-44 w-44 rounded-full blur-[80px] pointer-events-none" style={{ backgroundColor: pi.color, opacity: 0.12 }} />

        <div className="relative">
          <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            <Sigma size={11} style={{ color: pi.color }} /> Composite Power Index
          </p>

          <div className="mt-3 flex items-end justify-between">
            <div className="flex items-baseline gap-3">
              <motion.span
                className="text-[40px] font-bold font-mono tracking-tighter text-white leading-none"
                initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 180 }}
              >
                {Math.round(powerIndex)}
              </motion.span>
              <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border"
                style={{ color: pi.color, backgroundColor: pi.bg, borderColor: pi.border }}>
                {pi.name}
              </span>
            </div>
            <RingGauge score={powerIndex} size={48} sw={2.5} />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-1.5">
            {[
              { label: "Confidence", value: `${conf}%`, accent: conf >= 60 ? "text-emerald-400" : conf >= 35 ? "text-amber-400" : "text-zinc-500" },
              { label: "Stability", value: stability.label, accent: stability.color },
              { label: "1st Try AC", value: `${attempted > 0 ? Math.round((firstAc / attempted) * 100) : 0}%`, accent: "text-zinc-200" },
            ].map(s => (
              <div key={s.label} className="rounded-lg border border-zinc-800/50 bg-black/20 px-2 py-1.5 text-center">
                <div className="text-[7px] font-bold uppercase tracking-[0.15em] text-zinc-600">{s.label}</div>
                <div className={`mt-0.5 text-[11px] font-bold font-mono tabular-nums ${s.accent}`}>{s.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-[8px] font-mono text-zinc-600 border-t border-zinc-800/40 pt-2.5">
            <span>{sorted.length} topics</span>
            <span>{solved}/{attempted} solved</span>
          </div>
        </div>
      </motion.section>

      {/* ══════════ S2 — SKILL CONSTELLATION ══════════ */}
      {(() => {
        const items = sorted.filter(d => d.totalAttempted >= 2).slice(0, 8)
        if (items.length < 3) return null
        const rd = items.map(d => ({
          subject: d.tag.length > 11 ? d.tag.slice(0, 10) + '…' : d.tag,
          score: Math.round(d.masteryScore || 800),
          raw: Math.round((d.rawRating || d.masteryScore || 800) + (d.rd ? d.rd * 2 : 0)),
          fullMark: 2500,
        }))
        return (
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="rounded-2xl border border-zinc-800/50 bg-[#121214] p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                <Brain size={11} className="text-sky-400" /> Skill Constellation
              </p>
              <div className="flex items-center gap-3 text-[7px] font-mono text-zinc-600">
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-[3px] rounded bg-sky-400/40" /> Raw</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-[3px] rounded" style={{ backgroundColor: pi.color }} /> Score</span>
              </div>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={rd}>
                  <PolarGrid stroke="#1e1e22" strokeDasharray="3 3" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 8, fontFamily: 'ui-monospace, monospace', fontWeight: 600 }} />
                  <Radar name="Raw" dataKey="raw" stroke="rgba(56,189,248,0.3)" strokeWidth={1} fill="rgba(56,189,248,0.04)" fillOpacity={1} />
                  <Radar name="Score" dataKey="score" stroke={pi.color} strokeWidth={1.5} fill={pi.color} fillOpacity={0.12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0e0e10', border: '1px solid #27272a', borderRadius: '10px', fontSize: 10, fontFamily: 'ui-monospace, monospace', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: '6px 10px' }}
                    formatter={(v: number, n: string) => [`${v}`, n]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </motion.section>
        )
      })()}

      {/* ══════════ S3 — TIER DISTRIBUTION ══════════ */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
        className="rounded-2xl border border-zinc-800/50 bg-[#121214] p-4">
        <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-3">
          <BarChart3 size={11} /> Tier Distribution
        </p>
        <div className="flex h-5 rounded-md overflow-hidden border border-zinc-800/30">
          {TIERS.filter(t => (tierDist[t.name] || 0) > 0).map(t => {
            const n = tierDist[t.name] || 0
            const w = (n / sorted.length) * 100
            return (
              <div key={t.name} className="flex items-center justify-center text-[8px] font-bold font-mono transition-all"
                style={{ width: `${w}%`, backgroundColor: `rgba(${hexRgb(t.color)},0.2)`, color: t.color, minWidth: n > 0 ? 24 : 0 }}
                title={`${t.name}: ${n}`}>
                {w >= 14 ? n : ''}
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
          {TIERS.filter(t => (tierDist[t.name] || 0) > 0).map(t => (
            <div key={t.name} className="flex items-center gap-1 text-[8px] font-mono text-zinc-600">
              <span className="inline-block w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: t.color }} />
              <span style={{ color: t.color }}>{t.name}</span>
              <span>{tierDist[t.name]}</span>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ══════════ S4 — ALL TOPICS ══════════ */}
      <section>
        <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-2.5 px-0.5">
          <TrendingUp size={11} /> All Topics · {sorted.length}
        </p>

        <div className="space-y-1.5">
          {sorted.map((m, i) => {
            const score = m.masteryScore || 800
            const rd = m.rd || 350
            const vol = m.volatility || 0.06
            const rawRating = m.rawRating || (score + rd * 2)
            const tier = getTier(score)
            const stab = getStability(vol)
            const wr = m.totalAttempted > 0 ? Math.round((m.totalSolved / m.totalAttempted) * 100) : 0
            const fa = m.totalAttempted > 0 ? Math.round((m.firstAcCount / m.totalAttempted) * 100) : 0
            const last = timeSince(m.lastSolvedAt)
            const open = expanded === m.tag

            return (
              <motion.div key={m.tag}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.025, 0.4) }}
                className="rounded-xl border border-zinc-800/50 bg-[#121214] overflow-hidden transition-colors hover:border-zinc-700/60"
              >
                <button onClick={() => setExpanded(open ? null : m.tag)}
                  className="w-full flex items-center gap-3 p-3 text-left cursor-pointer">
                  <RingGauge score={score} size={42} sw={2.5} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-semibold text-zinc-200">{m.tag}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {last.isDecaying && (
                          <span className="text-[7px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/8 px-1 py-px rounded">decay</span>
                        )}
                        <span className="text-[8px] font-mono text-zinc-600 tabular-nums">{wr}% wr</span>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <ConfArc rd={rd} size={20} />
                      <div className={`flex items-center gap-1 px-1 py-px rounded ${stab.bg}`}>
                        <stab.icon size={8} className={stab.color} />
                        <span className={`text-[7px] font-semibold tracking-wide ${stab.color}`}>{stab.label}</span>
                      </div>
                      <span className="text-[7px] font-mono text-zinc-700">{last.text}</span>
                    </div>
                  </div>
                  <ChevronDown size={12} className={`text-zinc-700 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="px-3 pb-3 border-t border-zinc-800/30">

                        {/* Confidence Band */}
                        <div className="mt-2.5 rounded-lg border border-zinc-800/30 bg-black/15 p-2.5">
                          <p className="text-[7px] font-bold uppercase tracking-[0.15em] text-zinc-600 mb-1.5">Rating Confidence Band</p>
                          <div className="relative h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                            <div className="absolute h-full rounded-full opacity-20"
                              style={{ backgroundColor: tier.color, left: `${(score / 2500) * 100}%`, width: `${Math.min(100 - (score / 2500) * 100, ((rawRating - score) / 2500) * 100)}%` }} />
                            <motion.div className="absolute h-full rounded-full" style={{ backgroundColor: tier.color }}
                              initial={{ width: 0 }} animate={{ width: `${Math.max(2, (score / 2500) * 100)}%` }}
                              transition={{ duration: 0.7, ease: "easeOut" }} />
                          </div>
                          <div className="mt-1.5 flex justify-between text-[7px] font-mono">
                            <span className="text-zinc-600">Score <span className="font-bold" style={{ color: tier.color }}>{Math.round(score)}</span></span>
                            <span className="text-zinc-700">Raw <span className="font-bold text-zinc-500">{Math.round(rawRating)}</span></span>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="mt-2 grid grid-cols-4 gap-1">
                          {[
                            { k: "Solved", v: `${m.totalSolved}/${m.totalAttempted}`, c: "text-zinc-300" },
                            { k: "1st AC", v: `${fa}%`, c: "text-emerald-400" },
                            { k: "RD", v: `${Math.round(rd)}`, c: "text-zinc-400" },
                            { k: "σ", v: vol.toFixed(3), c: "text-zinc-400" },
                          ].map(s => (
                            <div key={s.k} className="rounded-md border border-zinc-800/30 bg-black/15 py-1.5 text-center">
                              <div className="text-[6px] font-bold uppercase tracking-[0.15em] text-zinc-700">{s.k}</div>
                              <div className={`mt-px text-[10px] font-bold font-mono tabular-nums ${s.c}`}>{s.v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ══════════ S5 — HOW YOUR RATING WORKS ══════════ */}
      <section className="rounded-2xl border border-zinc-800/50 bg-[#121214] overflow-hidden">
        <button onClick={() => setShowMath(!showMath)}
          className="w-full flex items-center justify-between p-3.5 text-left cursor-pointer">
          <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-violet-400/70">
            <Info size={11} /> How Your Rating Works
          </p>
          <ChevronDown size={12} className={`text-zinc-700 transition-transform ${showMath ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence>
          {showMath && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
              <div className="px-3.5 pb-3.5 border-t border-zinc-800/30 pt-3 space-y-1.5">
                <div className="flex gap-2 text-[11px] text-zinc-400 mb-2">
                  <Sparkles size={13} className="text-violet-400 shrink-0 mt-0.5" />
                  <span><span className="font-semibold text-zinc-300">Glicko-2 Rating System</span> — the same math used by chess.com and Lichess.</span>
                </div>
                {[
                  { icon: Crosshair, title: "Starting Point", desc: <>Rating begins at <code className="text-violet-400 text-[9px]">80% × contest_rating + 20% × 1500</code></> },
                  { icon: Swords, title: "Each Problem = A Match", desc: "The problem's Elo is your opponent. Harder opponents yield bigger gains." },
                  { icon: BarChart3, title: "Score Weights", desc: <><code className="text-emerald-400">1st AC = 1.0</code> · <code className="text-amber-400">Retry = 0.7</code> · <code className="text-sky-400">Hint = 0.5</code> · <code className="text-rose-400">Editorial = 0.0</code></> },
                  { icon: Gauge, title: "RD (Deviation)", desc: "Uncertainty measure. More solves → RD drops → rating stabilizes. Inactivity → RD rises." },
                  { icon: Lock, title: "Displayed Score", desc: <><code className="text-violet-400">Rating − 2×RD</code> (conservative lower bound). Consistency is rewarded.</> },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex gap-2 rounded-lg border border-zinc-800/30 bg-black/15 p-2">
                    <Icon size={10} className="text-violet-400/60 shrink-0 mt-0.5" />
                    <div className="text-[9px] leading-relaxed text-zinc-500">
                      <span className="font-semibold text-zinc-400">{title}</span> — {desc}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ══════════ S6 — MILESTONES ══════════ */}
      <section className="rounded-2xl border border-zinc-800/50 bg-[#121214] p-3.5">
        <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-2.5">
          <Award size={11} /> Milestones
        </p>
        <div className="space-y-1.5">
          {closestPromo && (
            <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800/30 bg-black/15 p-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ backgroundColor: `rgba(${hexRgb(closestPromo.color)},0.12)` }}>
                <TrendingUp size={12} style={{ color: closestPromo.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold text-zinc-300">Closest to Promotion</p>
                <p className="text-[8px] font-mono text-zinc-600 mt-px">
                  {closestPromo.tag} — <span className="font-bold" style={{ color: closestPromo.color }}>+{Math.round(closestPromo.needed)}</span> to <span style={{ color: closestPromo.color }}>{closestPromo.tier}</span>
                </p>
              </div>
            </div>
          )}
          {mostPracticed && (
            <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800/30 bg-black/15 p-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-400/8">
                <Flame size={12} className="text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold text-zinc-300">Most Practiced</p>
                <p className="text-[8px] font-mono text-zinc-600 mt-px">
                  {mostPracticed.tag} · <span className="text-emerald-400 font-bold">{mostPracticed.totalAttempted}</span> problems
                </p>
              </div>
            </div>
          )}
          {mostVolatile && (mostVolatile.volatility || 0) > 0.06 && (
            <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800/30 bg-black/15 p-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-400/8">
                <Zap size={12} className="text-rose-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold text-zinc-300">Most Volatile</p>
                <p className="text-[8px] font-mono text-zinc-600 mt-px">
                  {mostVolatile.tag} · σ = <span className="text-rose-400 font-bold">{(mostVolatile.volatility || 0).toFixed(3)}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ══════════ S7 — QUICK ACTIONS ══════════ */}
      {weakest && (
        <section className="rounded-2xl border border-zinc-800/50 bg-[#121214] p-3.5">
          <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-2.5">
            <Crosshair size={11} /> Quick Actions
          </p>
          <div className="space-y-1.5">
            <a href={`https://leetcode.com/tag/${weakest.tag.toLowerCase().replace(/\s+/g, '-')}/`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-lg border border-zinc-800/30 bg-black/15 p-2.5 transition-colors hover:border-zinc-700/50 group">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-400/8">
                <Target size={12} className="text-rose-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-semibold text-zinc-300">Drill Weakest Tag</p>
                <p className="text-[8px] font-mono text-zinc-600 mt-px">
                  {weakest.tag} · <span className="font-bold" style={{ color: getTier(weakest.masteryScore || 800).color }}>{Math.round(weakest.masteryScore || 800)}</span>
                </p>
              </div>
              <ArrowUpRight size={12} className="text-zinc-700 group-hover:text-zinc-500 transition-colors shrink-0" />
            </a>
            {top3[0] && (
              <a href={`https://leetcode.com/tag/${top3[0].tag.toLowerCase().replace(/\s+/g, '-')}/`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-lg border border-zinc-800/30 bg-black/15 p-2.5 transition-colors hover:border-zinc-700/50 group">
                <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ backgroundColor: `rgba(${hexRgb(getTier(top3[0].masteryScore || 800).color)},0.08)` }}>
                  <Trophy size={12} style={{ color: getTier(top3[0].masteryScore || 800).color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-semibold text-zinc-300">Push Your Strongest</p>
                  <p className="text-[8px] font-mono text-zinc-600 mt-px">
                    {top3[0].tag} · <span className="font-bold" style={{ color: getTier(top3[0].masteryScore || 800).color }}>{Math.round(top3[0].masteryScore || 800)}</span>
                  </p>
                </div>
                <ArrowUpRight size={12} className="text-zinc-700 group-hover:text-zinc-500 transition-colors shrink-0" />
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

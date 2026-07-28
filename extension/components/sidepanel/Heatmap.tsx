import React, { useEffect, useMemo, useState } from "react"
import { Card } from "../ui/Card"
import { BarChart3, CheckCircle2, Crosshair, Sparkles } from "lucide-react"
import { fetchDashboard, fetchHeatmap } from "../../lib/api/backend"
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { getCachedDashboard, getCachedHeatmap, setCachedDashboard, setCachedHeatmap } from "../../lib/storage"
import { AchievementShowcase } from "./AchievementShowcase"
import { buildAchievementStats, getAchievements } from "../../lib/achievements"

const getRatingTier = (rating: number) => {
  if (rating >= 2300) return { name: "Master", color: "#c084fc", bg: "rgba(192,132,252,0.12)", border: "rgba(192,132,252,0.3)" }
  if (rating >= 2000) return { name: "Expert", color: "#f43f5e", bg: "rgba(244,63,94,0.12)", border: "rgba(244,63,94,0.3)" }
  if (rating >= 1700) return { name: "Hard", color: "#fb923c", bg: "rgba(251,146,60,0.12)", border: "rgba(251,146,60,0.3)" }
  if (rating >= 1400) return { name: "Medium", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" }
  return { name: "Easy", color: "#34d399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.3)" }
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const tier = getRatingTier(data.bucketRating)
    const solveRate = data.attempted > 0 ? ((data.solved / data.attempted) * 100).toFixed(1) : "0.0";
    const firstAcRate = data.solved > 0 ? ((data.firstAcCount / data.solved) * 100).toFixed(1) : "0.0";

    return (
      <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/95 p-3 text-xs text-zinc-300 shadow-2xl backdrop-blur-md flex flex-col gap-2 min-w-[210px] font-mono">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-zinc-100">{data.bucketRating}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border" style={{ backgroundColor: tier.bg, color: tier.color, borderColor: tier.border }}>
              {tier.name}
            </span>
          </div>
          <span className="text-zinc-500 text-[10px]">Rating Band</span>
        </div>

        <div className="space-y-1 pt-0.5">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-zinc-400">Solved:</span>
            <span className="font-bold text-emerald-400 tabular-nums">{data.solved} / {data.attempted}</span>
          </div>
          
          {/* Mini Progress Bar */}
          <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
            <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${solveRate}%` }} />
          </div>

          <div className="flex justify-between items-center text-[10px] text-zinc-400 pt-1">
            <span>Solve Conversion Rate:</span>
            <span className="font-bold text-zinc-200">{solveRate}%</span>
          </div>
        </div>

        <div className="border-t border-zinc-800/80 pt-1.5 space-y-1 text-[10px]">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">First-Try AC:</span>
            <span className="font-semibold text-zinc-200 tabular-nums">{data.firstAcCount || 0} <span className="text-zinc-500 font-normal">({firstAcRate}%)</span></span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Avg Attempts / Problem:</span>
            <span className="font-semibold text-zinc-200 tabular-nums">{(data.avgAttempts || 1.0).toFixed(1)}</span>
          </div>
          {data.avgSolveTime > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Avg Solve Time:</span>
              <span className="font-semibold text-zinc-200 tabular-nums">{Math.round(data.avgSolveTime)} min</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const CustomLegend = () => {
  return (
    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pb-3 px-1 select-none">
      <span className="text-zinc-400">ZeroTrac Rating Bands</span>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-zinc-700"></span>
          <span>Attempted</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Solved</span>
        </div>
      </div>
    </div>
  );
};

const NestedBarShape = (props: any) => {
  const { x, y, width, height, payload } = props;
  if (width === 0) return null;

  const attempted = payload.attempted || 0;
  const solved = payload.solved || 0;
  const solvedWidth = attempted > 0 ? (solved / attempted) * width : 0;
  const tier = getRatingTier(payload.bucketRating)
  
  const barHeight = 12;
  const offset = (height - barHeight) / 2;
  const barY = y + offset;

  return (
    <g>
      {/* Attempted backdrop */}
      <rect
        x={x}
        y={barY}
        width={width}
        height={barHeight}
        rx={6}
        ry={6}
        fill="#18181b"
        stroke="#27272a"
        strokeWidth={1}
      />
      {/* Solved overlay with tier color */}
      {solvedWidth > 0 && (
        <rect
          x={x}
          y={barY + 2}
          width={Math.max(4, solvedWidth)}
          height={8}
          rx={4}
          ry={4}
          fill={tier.color}
          opacity={0.9}
        />
      )}
    </g>
  );
};

interface HeatmapDataPoint { date: string; count: number; }
interface DashboardDataSummary { totalSolved?: number; streak?: number; lastActive?: string; }

export const Heatmap = () => {
  const [data, setData] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<DashboardDataSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRating, setSelectedRating] = useState<number | null>(null)

  useEffect(() => {
    // 1. Try to load from cache
    Promise.all([
      getCachedHeatmap().catch(() => null),
      getCachedDashboard().catch(() => null)
    ]).then(([cachedHeatmap, cachedDashboard]) => {
      if (cachedHeatmap) setData(cachedHeatmap);
      if (cachedDashboard) setDashboard(cachedDashboard);
      if (cachedHeatmap || cachedDashboard) setLoading(false);
    });

    // 2. Fetch in background
    Promise.all([
      fetchHeatmap(),
      fetchDashboard().catch(() => null)
    ])
      .then(([freshHeatmap, freshDashboard]) => {
        setData(freshHeatmap);
        setCachedHeatmap(freshHeatmap);
        if (freshDashboard) {
          setDashboard(freshDashboard);
          setCachedDashboard(freshDashboard);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Sort by rating bucket ascending and filter out empty buckets to avoid bloat
  const sortedData = useMemo(() => {
    return [...data]
      .filter((d) => d.attempted > 0)
      .sort((a, b) => a.bucketRating - b.bucketRating);
  }, [data]);

  const achievements = useMemo(() => {
    return getAchievements(buildAchievementStats(dashboard || {}, sortedData))
  }, [dashboard, sortedData])

  // Dynamically calculate height to keep vertical rows perfectly spaced
  const chartHeight = useMemo(() => {
    if (sortedData.length === 0) return 200;
    return Math.max(200, sortedData.length * 32 + 20);
  }, [sortedData]);

  const summary = useMemo(() => {
    const attempted = sortedData.reduce((total, bucket) => total + Number(bucket.attempted || 0), 0)
    const solved = sortedData.reduce((total, bucket) => total + Number(bucket.solved || 0), 0)
    const best = [...sortedData].filter((bucket) => bucket.solved > 0).sort((left, right) => right.bucketRating - left.bucketRating)[0]
    return {
      attempted,
      solved,
      conversion: attempted ? Math.round((solved / attempted) * 100) : 0,
      best: best?.bucketRating ?? null
    }
  }, [sortedData])

  const selectedBucket = selectedRating == null
    ? null
    : sortedData.find((bucket) => bucket.bucketRating === selectedRating) ?? null

  if (loading) return <div className="p-4 text-center text-zinc-500 text-sm font-mono animate-pulse">Loading rating map...</div>;
  if (!data || data.length === 0 || sortedData.length === 0) {
    return (
      <div className="grid gap-4 font-sans">
        <Card className="text-center py-10">
          <h3 className="font-bold text-zinc-200 mb-2">No Submissions Logged</h3>
          <p className="text-sm text-zinc-500 px-4">
            Please run a sync in the Settings tab to populate your historical problem rating metrics.
          </p>
        </Card>
        <AchievementShowcase achievements={achievements} variant="gallery" />
      </div>
    );
  }

  return (
    <div className="grid gap-3.5 font-sans animate-fadeIn">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-xl border border-[#dfa054]/25 bg-gradient-to-r from-[#1c140c] via-zinc-950/80 to-zinc-950 p-4 shadow-lg">
        <div className="flex items-center justify-between gap-3 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="panel-label text-[#dfa054]">Rating Map Matrix</span>
              <span className="text-[9px] bg-[#dfa054]/10 text-[#dfa054] border border-[#dfa054]/25 px-1.5 py-0.5 rounded font-mono font-bold">ZeroTrac</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400 font-sans">
              Visualizes your solve conversion rate and attempt volume across official contest rating bands.
            </p>
          </div>
          <span className="shrink-0 text-xs font-mono font-bold text-[#dfa054] bg-[#dfa054]/10 border border-[#dfa054]/20 px-2.5 py-1 rounded-lg">
            {sortedData.length} Bands
          </span>
        </div>
      </div>

      {/* 4 Primary Summary Metric Cards */}
      <div className="grid grid-cols-4 divide-x divide-zinc-800/80 overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/50 shadow-md">
        <div className="px-3 py-3 text-center">
          <div className="panel-label text-[9px]">Solved</div>
          <div className="metric-value mt-1 text-lg font-bold text-emerald-400 font-mono tabular-nums">{summary.solved}</div>
        </div>
        <div className="px-3 py-3 text-center">
          <div className="panel-label text-[9px]">Attempted</div>
          <div className="metric-value mt-1 text-lg font-bold text-zinc-200 font-mono tabular-nums">{summary.attempted}</div>
        </div>
        <div className="px-3 py-3 text-center">
          <div className="panel-label text-[9px]">Conversion</div>
          <div className="metric-value mt-1 text-lg font-bold text-sky-400 font-mono tabular-nums">{summary.conversion}%</div>
        </div>
        <div className="px-3 py-3 text-center">
          <div className="panel-label text-[9px]">Best Rating</div>
          <div className="metric-value mt-1 text-lg font-bold text-[#dfa054] font-mono tabular-nums">{summary.best ?? "—"}</div>
        </div>
      </div>

      {/* Solve Distribution Bar Chart */}
      <Card className="p-4 bg-zinc-950/60 border border-zinc-800/80 shadow-lg">
        <CustomLegend />
        <div style={{ height: chartHeight }} className="w-full transition-all duration-300">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={sortedData} 
              layout="vertical" 
              margin={{ top: 0, right: 15, left: -20, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis 
                dataKey="bucketRating" 
                type="category" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#a1a1aa', fontSize: 10, fontFamily: 'monospace' }} 
              />
              <Tooltip 
                cursor={{ fill: 'rgba(255,255,255,0.03)' }} 
                content={<CustomTooltip />} 
              />
              <Bar 
                dataKey="attempted" 
                shape={<NestedBarShape />} 
                name="Progress"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Interactive Band Inspector */}
      <Card className="p-4 bg-zinc-950/50 border border-zinc-800/80">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Crosshair size={13} className="text-sky-400" />
            <span className="text-xs font-bold text-zinc-200">Explore Rating Bands</span>
          </div>
          {selectedBucket && <span className="text-[10px] font-mono text-sky-400 font-semibold">{selectedBucket.bucketRating} Band Selected</span>}
        </div>
        
        <p className="text-[10px] text-zinc-500 mb-3">Click any rating band to inspect detailed performance & attempt statistics.</p>

        {/* Rating Band Buttons */}
        <div className="flex flex-wrap gap-1.5">
          {sortedData.map((bucket) => {
            const active = selectedRating === bucket.bucketRating
            const tier = getRatingTier(bucket.bucketRating)
            const rate = bucket.attempted > 0 ? Math.round((bucket.solved / bucket.attempted) * 100) : 0

            return (
              <button
                key={bucket.bucketRating}
                onClick={() => setSelectedRating(active ? null : bucket.bucketRating)}
                className={`rounded-lg border px-2.5 py-1.5 text-[10.5px] font-mono transition-all flex items-center gap-1.5 ${
                  active 
                    ? "border-sky-400 bg-sky-500/15 text-sky-300 shadow-md font-bold" 
                    : "border-zinc-800/80 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/60"
                }`}
              >
                <span>{bucket.bucketRating}</span>
                <span className="text-[9px] opacity-75 font-semibold" style={{ color: tier.color }}>
                  ({rate}%)
                </span>
              </button>
            )
          })}
        </div>

        {/* Selected Band Detailed Breakdown Card */}
        {selectedBucket && (
          <div className="mt-3.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-zinc-100">{selectedBucket.bucketRating} Band Breakdown</span>
                {(() => {
                  const tier = getRatingTier(selectedBucket.bucketRating)
                  return (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded border" style={{ backgroundColor: tier.bg, color: tier.color, borderColor: tier.border }}>
                      {tier.name}
                    </span>
                  )
                })()}
              </div>
              <span className="text-[10px] text-zinc-400">{selectedBucket.solved} / {selectedBucket.attempted} Solved</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-zinc-950 p-2 border border-zinc-800/60">
                <div className="text-[8px] uppercase text-zinc-500 font-bold">Solve Rate</div>
                <div className="text-xs font-bold text-emerald-400 mt-0.5">
                  {selectedBucket.attempted > 0 ? Math.round((selectedBucket.solved / selectedBucket.attempted) * 100) : 0}%
                </div>
              </div>

              <div className="rounded-lg bg-zinc-950 p-2 border border-zinc-800/60">
                <div className="text-[8px] uppercase text-zinc-500 font-bold">First AC</div>
                <div className="text-xs font-bold text-sky-400 mt-0.5">
                  {selectedBucket.firstAcCount || 0}
                </div>
              </div>

              <div className="rounded-lg bg-zinc-950 p-2 border border-zinc-800/60">
                <div className="text-[8px] uppercase text-zinc-500 font-bold">Avg Attempts</div>
                <div className="text-xs font-bold text-zinc-200 mt-0.5">
                  {(selectedBucket.avgAttempts || 1.0).toFixed(1)}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      <AchievementShowcase achievements={achievements} variant="gallery" />
    </div>
  )
}

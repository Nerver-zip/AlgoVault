import React, { useMemo, useState } from "react"
import {
  BookOpen,
  Code2,
  ExternalLink,
  PlayCircle,
  SearchCode
} from "lucide-react"
import { Card } from "../ui/Card"
import { motion, AnimatePresence } from "framer-motion"
import { CurriculumBoard } from "./CurriculumBoard"
import { TemplateVault } from "./TemplateVault"


type ResourceKind = "video" | "reference" | "practice"

const RESOURCES: Array<{ name: string; description: string; url: string; kind: ResourceKind; focus: string }> = [
  {
    name: "NeetCode 150",
    description: "Pattern-first problem track with a solution library for the exact list you are practicing.",
    url: "https://neetcode.io/practice",
    kind: "practice",
    focus: "Interview patterns"
  },
  {
    name: "NeetCode videos",
    description: "Clear problem walk-throughs when you have already made a serious attempt and need a second explanation.",
    url: "https://www.youtube.com/@NeetCode/playlists",
    kind: "video",
    focus: "Problem explanations"
  },
  {
    name: "Striver A2Z DSA",
    description: "A broad DSA route with topic ordering, sheet progress, and linked lessons.",
    url: "https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-course-sheet-2/",
    kind: "practice",
    focus: "Structured curriculum"
  },
  {
    name: "takeUforward videos",
    description: "Long-form explanations and implementation-oriented playlists for core interview topics.",
    url: "https://www.youtube.com/@takeUforward/playlists",
    kind: "video",
    focus: "DSA deep dives"
  },
  {
    name: "William Fiset",
    description: "Especially strong for graph algorithms, data structures, and understanding why an approach works.",
    url: "https://www.youtube.com/@WilliamFiset-videos/playlists",
    kind: "video",
    focus: "Algorithms fundamentals"
  },
  {
    name: "CP-Algorithms",
    description: "Precise reference material for algorithms, proofs, and implementation details after you understand the pattern.",
    url: "https://cp-algorithms.com/",
    kind: "reference",
    focus: "Reference"
  },
  {
    name: "USACO Guide",
    description: "A curated progression of concepts and practice problems with strong topic coverage.",
    url: "https://usaco.guide/",
    kind: "practice",
    focus: "Guided practice"
  },
  {
    name: "CSES Problem Set",
    description: "Focused canonical practice once a pattern has clicked and you want to prove the idea transfers.",
    url: "https://cses.fi/problemset/",
    kind: "practice",
    focus: "Pattern transfer"
  }
]

const KIND_META: Record<ResourceKind, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  video: { label: "Watch Video", icon: PlayCircle, color: "#f43f5e", bg: "rgba(244,63,94,0.12)", border: "rgba(244,63,94,0.25)" },
  reference: { label: "Reference", icon: BookOpen, color: "#38bdf8", bg: "rgba(56,189,248,0.12)", border: "rgba(56,189,248,0.25)" },
  practice: { label: "Practice Track", icon: SearchCode, color: "#34d399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)" }
}

export const Resources = () => {
  const [activeTab, setActiveTab] = useState<"roadmap" | "resources" | "templates">("roadmap")
  const [filter, setFilter] = useState<"all" | ResourceKind>("all")
  const visible = useMemo(() => filter === "all" ? RESOURCES : RESOURCES.filter((resource) => resource.kind === filter), [filter])

  return (
    <div className="grid gap-3.5 pb-6 font-sans animate-fadeIn">
      {/* Top Level Segmented Navigation Tab */}
      <div className="flex bg-zinc-950/80 p-1.5 rounded-xl border border-zinc-800/80 shadow-inner">
        <button
          onClick={() => setActiveTab("roadmap")}
          className={`flex-1 flex items-center justify-center gap-1.5 text-[10px] font-bold py-2 rounded-lg transition-all font-mono uppercase tracking-wider ${
            activeTab === "roadmap"
              ? "bg-zinc-900 text-[#dfa054] border border-[#dfa054]/30 shadow-md"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
          }`}
        >
          <SearchCode size={13} /> Curriculum
        </button>
        <button
          onClick={() => setActiveTab("templates")}
          className={`flex-1 flex items-center justify-center gap-1.5 text-[10px] font-bold py-2 rounded-lg transition-all font-mono uppercase tracking-wider ${
            activeTab === "templates"
              ? "bg-zinc-900 text-[#dfa054] border border-[#dfa054]/30 shadow-md"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
          }`}
        >
          <Code2 size={13} /> Templates
        </button>
        <button
          onClick={() => setActiveTab("resources")}
          className={`flex-1 flex items-center justify-center gap-1.5 text-[10px] font-bold py-2 rounded-lg transition-all font-mono uppercase tracking-wider ${
            activeTab === "resources"
              ? "bg-zinc-900 text-[#dfa054] border border-[#dfa054]/30 shadow-md"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
          }`}
        >
          <BookOpen size={13} /> Resources
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "roadmap" ? (
          <motion.div
            key="roadmap"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <CurriculumBoard />
          </motion.div>
        ) : activeTab === "templates" ? (
          <motion.div
            key="templates"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <TemplateVault />
          </motion.div>
        ) : (
          <motion.div
            key="resources"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="grid gap-3.5"
          >
            {/* Learn with Intent Hero Header */}
            <Card className="relative overflow-hidden border border-[#dfa054]/25 bg-gradient-to-br from-[#1a130b] via-zinc-950/90 to-zinc-950 p-0 shadow-lg">
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <span className="panel-label text-[#dfa054]">Curated Knowledge Base</span>
                  <span className="text-[9px] bg-[#dfa054]/10 text-[#dfa054] border border-[#dfa054]/25 px-1.5 py-0.2 rounded font-mono font-bold">Intent-Driven</span>
                </div>
                <h2 className="mt-2 text-sm font-bold text-zinc-100">A useful explanation, at the right moment.</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                  Attempt first on LeetCode. Then select a structured roadmap, video explanation, or reference sheet below.
                </p>
              </div>

              {/* Filter Pills */}
              <div className="flex gap-1.5 border-t border-zinc-800/80 bg-zinc-950/60 p-2 overflow-x-auto">
                {(["all", "practice", "video", "reference"] as const).map((kind) => {
                  const isActive = filter === kind
                  return (
                    <button
                      key={kind}
                      onClick={() => setFilter(kind)}
                      className={`rounded-md px-3 py-1 text-[10.5px] font-mono font-bold transition-all shrink-0 ${
                        isActive 
                          ? "bg-[#dfa054]/15 text-[#dfa054] border border-[#dfa054]/40 shadow-sm" 
                          : "text-zinc-400 border border-transparent hover:bg-zinc-900 hover:text-zinc-200"
                      }`}
                    >
                      {kind === "all" ? "All Resources" : KIND_META[kind].label}
                    </button>
                  )
                })}
              </div>
            </Card>

            {/* Resource Grid Cards */}
            <div className="grid gap-2.5">
              {visible.map((resource) => {
                const meta = KIND_META[resource.kind]
                const Icon = meta.icon
                return (
                  <a 
                    key={resource.name} 
                    href={resource.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="group block"
                  >
                    <Card className="p-3.5 transition-all duration-200 border border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/50 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border"
                              style={{ backgroundColor: meta.bg, borderColor: meta.border, color: meta.color }}
                            >
                              <Icon size={13} />
                            </div>
                            <span className="truncate text-xs font-bold text-zinc-100 group-hover:text-[#dfa054] transition-colors">
                              {resource.name}
                            </span>
                          </div>
                          <p className="mt-2 text-[10.5px] leading-relaxed text-zinc-400 font-sans">
                            {resource.description}
                          </p>
                        </div>
                        <ExternalLink size={13} className="mt-1 shrink-0 text-zinc-500 transition-transform group-hover:text-zinc-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </div>
                      
                      <div className="mt-3 flex items-center justify-between border-t border-zinc-900/80 pt-2 text-[10px] font-mono">
                        <span className="text-zinc-500 truncate max-w-[200px]">{resource.focus}</span>
                        <span 
                          className="rounded-full px-2 py-0.5 text-[9px] font-bold border shrink-0"
                          style={{ backgroundColor: meta.bg, borderColor: meta.border, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                      </div>
                    </Card>
                  </a>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

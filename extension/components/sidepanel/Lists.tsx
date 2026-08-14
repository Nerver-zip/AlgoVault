import React, { useEffect, useState, useMemo } from "react"
import { Lightbulb } from "lucide-react"
import { Card } from "../ui/Card"
import { ProgressBar } from "../ui/ProgressBar"
import { STUDY_LISTS } from "../../lib/study-lists"
import { buildZerotracRatingMap, normalizeZerotracPayload } from "../../lib/zerotrac"
import { CompanyPrepView } from "./CompanyPrepView"
import { motion, AnimatePresence } from "framer-motion"

// Module-level in-memory cache for instant 0ms tab switching
let memorySolvedSlugs: Set<string> = new Set()
let memoryZerotracData: any[] = []

export const Lists = () => {
  const [activeList, setActiveList] = useState<"neetcode" | "striver" | "zerotrac" | "companies">("neetcode")
  const [solvedSlugs, setSolvedSlugs] = useState<Set<string>>(memorySolvedSlugs)
  const [zerotracData, setZerotracData] = useState<any[]>(memoryZerotracData)
  const [isSyncing, setIsSyncing] = useState(memoryZerotracData.length === 0)

  // ZeroTrac Filters state
  const [keyword, setKeyword] = useState("")
  const [contestNumber, setContestNumber] = useState("")
  const [ratingMin, setRatingMin] = useState<number>(1600)
  const [ratingMax, setRatingMax] = useState<number>(1700)
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "done">("all")
  const [questionIndexFilter, setQuestionIndexFilter] = useState("all")
  const [sortBy, setSortBy] = useState<"rating" | "index" | "contest" | "title" | "id">("rating")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [currentPage, setCurrentPage] = useState(1)

  // Topic expansion state for study lists
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({})

  // 1. Restore cached ZeroTrac & List state on mount
  useEffect(() => {
    chrome.storage.local.get(["algovault.zerotracState", "algovault.solvedSlugs", "zerotracData"], (res) => {
      const state = res?.["algovault.zerotracState"]
      if (state) {
        if (state.activeList) setActiveList(state.activeList)
        if (state.keyword !== undefined) setKeyword(state.keyword)
        if (state.contestNumber !== undefined) setContestNumber(state.contestNumber)
        if (typeof state.ratingMin === "number") setRatingMin(state.ratingMin)
        if (typeof state.ratingMax === "number") setRatingMax(state.ratingMax)
        if (state.statusFilter) setStatusFilter(state.statusFilter)
        if (state.questionIndexFilter) setQuestionIndexFilter(state.questionIndexFilter)
        if (state.sortBy) setSortBy(state.sortBy)
        if (state.sortOrder) setSortOrder(state.sortOrder)
        if (typeof state.currentPage === "number") setCurrentPage(state.currentPage)
      }

      if (memorySolvedSlugs.size === 0 && res?.["algovault.solvedSlugs"] && Array.isArray(res["algovault.solvedSlugs"])) {
        const s = new Set<string>(res["algovault.solvedSlugs"])
        memorySolvedSlugs = s
        setSolvedSlugs(s)
      }
      if (memoryZerotracData.length === 0 && res?.["zerotracData"] && Array.isArray(res["zerotracData"])) {
        memoryZerotracData = res["zerotracData"]
        setZerotracData(res["zerotracData"])
      }
    })
  }, [])

  // 2. Persist state on every change
  useEffect(() => {
    chrome.storage.local.set({
      "algovault.zerotracState": {
        activeList,
        keyword,
        contestNumber,
        ratingMin,
        ratingMax,
        statusFilter,
        questionIndexFilter,
        sortBy,
        sortOrder,
        currentPage
      }
    })
  }, [activeList, keyword, contestNumber, ratingMin, ratingMax, statusFilter, questionIndexFilter, sortBy, sortOrder, currentPage])

  // 3. Fetch fresh background updates without blocking the UI
  useEffect(() => {
    Promise.all([
      new Promise<string[]>((resolve) => {
        chrome.runtime.sendMessage({ action: "get_solved_problem_slugs" }, (res) => {
          resolve(res?.ok && Array.isArray(res.data) ? res.data : [])
        })
      }),
      new Promise<any[]>((resolve) => {
        chrome.runtime.sendMessage({ action: "get_zerotrac" }, (res) => {
          resolve(normalizeZerotracPayload(res))
        })
      })
    ]).then(([slugs, zerotrac]) => {
      const s = new Set(slugs)
      memorySolvedSlugs = s
      memoryZerotracData = zerotrac
      setSolvedSlugs(s)
      setZerotracData(zerotrac)
      setIsSyncing(false)
    }).catch((err) => {
      console.error("Failed to load list details:", err)
      setIsSyncing(false)
    })
  }, [])

  // Pre-index ZeroTrac ratings by slug for instant company statistics calculation
  const zerotracRatingMap = useMemo(() => buildZerotracRatingMap(zerotracData), [zerotracData])

  // Find NeetCode and Striver list objects
  const neetcodeList = STUDY_LISTS.find(l => l.id === "neetcode-150")
  const striverList = STUDY_LISTS.find(l => l.id === "striver-sde")

  const currentStudyList = activeList === "neetcode" ? neetcodeList : striverList
  const nextStudyProblem = currentStudyList?.problems.find((problem) => !solvedSlugs.has(problem.slug))

  // Calculate solved stats for current study list
  const listStats = useMemo(() => {
    if (!currentStudyList) return { total: 0, solved: 0, percent: 0 }
    const total = currentStudyList.problems.length
    const solved = currentStudyList.problems.filter(p => solvedSlugs.has(p.slug)).length
    const percent = total > 0 ? Math.round((solved / total) * 100) : 0
    return { total, solved, percent }
  }, [currentStudyList, solvedSlugs])

  // Group study list problems by topic
  const groupedProblems = useMemo(() => {
    if (!currentStudyList) return {}
    const groups: Record<string, typeof currentStudyList.problems> = {}
    currentStudyList.problems.forEach(p => {
      groups[p.topic] = groups[p.topic] || []
      groups[p.topic].push(p)
    })
    return groups
  }, [currentStudyList])

  // Initialize expanded topics to true
  useEffect(() => {
    if (currentStudyList) {
      const initial: Record<string, boolean> = {}
      currentStudyList.problems.forEach(p => {
        initial[p.topic] = true
      })
      setExpandedTopics(initial)
    }
  }, [activeList])

  // Filter and sort ZeroTrac problems
  const filteredZerotrac = useMemo(() => {
    if (!zerotracData.length) return []
    
    const filtered = zerotracData.filter((p) => {
      // 1. Rating Interval
      const rating = p.Rating || 0
      if (rating < ratingMin || rating > ratingMax) return false

      // 2. Keyword Match (Title or Slug)
      if (keyword) {
        const query = keyword.toLowerCase()
        const titleMatch = p.Title && typeof p.Title === "string" && p.Title.toLowerCase().includes(query)
        const slugMatch = p.TitleSlug && typeof p.TitleSlug === "string" && p.TitleSlug.toLowerCase().includes(query)
        if (!titleMatch && !slugMatch) return false
      }

      // 3. Contest ID/Number Match
      if (contestNumber) {
        const query = contestNumber.toLowerCase()
        const contestMatch = p.ContestID_en && p.ContestID_en.toLowerCase().includes(query)
        const contestSlugMatch = p.ContestSlug && p.ContestSlug.toLowerCase().includes(query)
        if (!contestMatch && !contestSlugMatch) return false
      }

      // 4. Status Check
      const isSolved = solvedSlugs.has(p.TitleSlug)
      if (statusFilter === "open" && isSolved) return false
      if (statusFilter === "done" && !isSolved) return false

      // 5. Question Index Match (Q1-Q4)
      if (questionIndexFilter !== "all") {
        const indexStr = p.ProblemIndex ? String(p.ProblemIndex).trim() : ""
        const targetDigit = questionIndexFilter.replace("Q", "")
        const normalizedIndex = indexStr.replace("Q", "").replace(/^0+/, "")
        if (normalizedIndex !== targetDigit) return false
      }

      return true
    })

    // Sort dynamically
    return filtered.sort((a, b) => {
      let comparison = 0
      if (sortBy === "rating") {
        comparison = (a.Rating || 0) - (b.Rating || 0)
      } else if (sortBy === "index") {
        const indexA = String(a.ProblemIndex || "").replace("Q", "").replace(/^0+/, "")
        const indexB = String(b.ProblemIndex || "").replace("Q", "").replace(/^0+/, "")
        comparison = indexA.localeCompare(indexB, undefined, { numeric: true })
      } else if (sortBy === "contest") {
        comparison = (a.ContestID_en || "").localeCompare(b.ContestID_en || "")
      } else if (sortBy === "title") {
        comparison = (a.Title || "").localeCompare(b.Title || "")
      } else if (sortBy === "id") {
        const idA = Number(a.ID || a.QuestionID || 0)
        const idB = Number(b.ID || b.QuestionID || 0)
        comparison = idA - idB
      }
      return sortOrder === "asc" ? comparison : -comparison
    })
  }, [zerotracData, keyword, contestNumber, ratingMin, ratingMax, statusFilter, questionIndexFilter, solvedSlugs, sortBy, sortOrder])

  // Pagination bounds
  const totalItems = filteredZerotrac.length
  const totalPages = Math.max(1, Math.ceil(totalItems / 15))
  
  // Constrain currentPage to boundaries
  const activePage = Math.min(totalPages, Math.max(1, currentPage))

  const paginatedItems = useMemo(() => {
    return filteredZerotrac.slice((activePage - 1) * 15, activePage * 15)
  }, [filteredZerotrac, activePage])

  // Generate page numbers
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const pages: (number | string)[] = [1]
    
    if (activePage > 3) {
      pages.push("...")
    }
    
    const start = Math.max(2, activePage - 1)
    const end = Math.min(totalPages - 1, activePage + 1)
    
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }
    
    if (activePage < totalPages - 2) {
      pages.push("...")
    }
    
    pages.push(totalPages)
    return pages
  }, [activePage, totalPages])

  const toggleTopic = (topic: string) => {
    setExpandedTopics(prev => ({ ...prev, [topic]: !prev[topic] }))
  }

  const handleResetFilters = () => {
    setKeyword("")
    setContestNumber("")
    setRatingMin(1600)
    setRatingMax(1700)
    setStatusFilter("all")
    setQuestionIndexFilter("all")
    setSortBy("rating")
    setSortOrder("desc")
    setCurrentPage(1)
  }

  const handleSort = (field: "rating" | "index" | "contest" | "title" | "id") => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortBy(field)
      setSortOrder("desc")
    }
    setCurrentPage(1)
  }

  const renderSortIndicator = (field: "rating" | "index" | "contest" | "title" | "id") => {
    if (sortBy !== field) return null
    return <span className="ml-1 text-[8px] text-[#dfa054]">{sortOrder === "asc" ? "▲" : "▼"}</span>
  }

  return (
    <div className="grid gap-3.5 font-sans select-none">
      <div className="flex items-end justify-between px-1">
        <div>
          <div className="panel-label">Practice tracks</div>
          <p className="mt-1 text-[11px] text-zinc-500">Structured paths when you want the next right problem without the noise.</p>
        </div>
        <span className="text-[10px] font-mono text-zinc-600">{solvedSlugs.size} solved</span>
      </div>
      {/* List Type Switcher */}
      <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 shadow-inner">
        {(["neetcode", "striver", "zerotrac", "companies"] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => {
              setActiveList(opt)
              setCurrentPage(1)
            }}
            className={`flex-1 text-[10px] font-semibold py-2 rounded-md transition-all font-mono cursor-pointer ${
              activeList === opt 
                ? "bg-zinc-900 text-[#dfa054] border border-zinc-800/80 shadow" 
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {opt === "neetcode" ? "NeetCode 150" : opt === "striver" ? "Striver SDE" : opt === "zerotrac" ? "ZeroTrac" : "Companies"}
          </button>
        ))}
      </div>

      {activeList === "companies" ? (
        <CompanyPrepView solvedSlugs={solvedSlugs} zerotracRatingMap={zerotracRatingMap} />
      ) : activeList !== "zerotrac" ? (
        // NeetCode & Striver Lists Rendering
        <div className="grid gap-3.5">
          {nextStudyProblem && (
            <Card className="relative overflow-hidden border-[#dfa054]/30 bg-gradient-to-br from-[#1c140c] to-[#0a0a0a] p-0 shadow-[0_8px_30px_rgba(223,160,84,0.15)] group">
              <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#dfa054] to-[#f6ce8e] shadow-[0_0_12px_rgba(223,160,84,0.8)]" />
              <div className="absolute top-0 right-0 p-8 opacity-5 transition-opacity group-hover:opacity-20 pointer-events-none">
                <Lightbulb size={120} className="text-[#dfa054] -rotate-12 transform translate-x-1/4 -translate-y-1/4" />
              </div>
              <div className="flex items-center justify-between gap-4 p-5 pl-6 relative z-10">
                <div className="min-w-0">
                  <div className="panel-label tracking-widest text-[#dfa054]/80">Continue {currentStudyList?.name}</div>
                  <div className="mt-1.5 truncate text-lg font-bold text-zinc-50 drop-shadow-md">{nextStudyProblem.title}</div>
                  <div className="mt-1.5 text-[10px] text-zinc-400 font-medium uppercase tracking-wider">{nextStudyProblem.topic} <span className="mx-1.5 text-zinc-600">•</span> {listStats.solved}/{listStats.total} complete</div>
                </div>
                <a
                  href={`https://leetcode.com/problems/${nextStudyProblem.slug}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-lg bg-gradient-to-r from-[#dfa054] to-[#c78b40] px-4 py-2.5 text-[11px] font-extrabold text-[#111] transition-all hover:scale-105 hover:shadow-[0_0_15px_rgba(223,160,84,0.4)] tracking-wide shadow-md"
                >
                  Open Problem
                </a>
              </div>
            </Card>
          )}
          {/* Progress Header */}
          <Card className="p-4 bg-[#111] border border-zinc-900/80 shadow-inner">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold tracking-widest text-zinc-300 uppercase">{currentStudyList?.name} Progress</span>
              <span className="font-mono text-[#dfa054] font-bold tabular-nums text-sm drop-shadow-[0_0_8px_rgba(223,160,84,0.3)]">
                {listStats.solved} / {listStats.total} <span className="text-zinc-500 font-normal ml-1">({listStats.percent}%)</span>
              </span>
            </div>
            <ProgressBar progress={listStats.percent} />
          </Card>

          {/* Grouped Topics list */}
          <div className="flex flex-col gap-2.5">
            {Object.entries(groupedProblems).map(([topic, problems]) => {
              const isExpanded = !!expandedTopics[topic]
              const topicSolved = problems.filter(p => solvedSlugs.has(p.slug)).length
              const topicTotal = problems.length
              const isTopicComplete = topicSolved === topicTotal

              return (
                <Card 
                  key={topic} 
                  className={`overflow-hidden transition-all duration-300 relative border shadow-[0_4px_12px_rgba(0,0,0,0.2)] ${
                    isTopicComplete 
                      ? 'border-[#ffffff0a] bg-[#161616] opacity-90 shadow-[inset_0_1px_0_rgba(16,185,129,0.2)]' 
                      : isExpanded 
                      ? 'border-[#ffffff0a] bg-[#161616]'
                      : 'border-[#ffffff05] bg-[#121212] hover:border-[#ffffff0a] hover:bg-[#161616]'
                  }`}
                >
                  {/* Topic Header Toggle */}
                  <button
                    onClick={() => toggleTopic(topic)}
                    className="w-full px-4 py-4 flex justify-between items-center hover:bg-white/5 transition-colors outline-none focus-visible:bg-white/5"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] transition-transform duration-300 cubic-bezier(0.2, 0.8, 0.2, 1) ${isExpanded ? "rotate-90 text-[#dfa054]" : "rotate-0 text-zinc-500"}`}>▶</span>
                      <span className={`text-[13px] font-semibold tracking-wide ${isTopicComplete ? "text-zinc-400" : "text-zinc-200"}`}>{topic}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] font-medium text-zinc-500 font-mono tabular-nums">
                        {topicSolved}/{topicTotal} solved
                      </span>
                      {isTopicComplete && (
                        <span className="text-[9px] text-emerald-500/80 bg-emerald-500/10 border border-emerald-500/10 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Complete</span>
                      )}
                    </div>
                  </button>

                  {/* Topic Problems List */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="px-4 pb-4 pt-1 flex flex-col gap-1.5 bg-gradient-to-b from-[#161616] to-[#0f0f0f] overflow-hidden"
                      >
                        {problems.map((p, idx) => {
                          const isSolved = solvedSlugs.has(p.slug)
                          const difficulty = (p.difficulty || "medium").toLowerCase()
                          
                          let diffColor = "text-amber-400 bg-amber-500/10 border-amber-500/20"
                          if (difficulty === "easy") {
                            diffColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                          } else if (difficulty === "hard") {
                            diffColor = "text-red-400 bg-red-500/10 border-red-500/20"
                          }
                          
                          if (isSolved) {
                            diffColor = "text-zinc-600 border-zinc-800 bg-transparent"
                          }

                          return (
                            <motion.div 
                              key={idx} 
                              whileHover={{ scale: 1.01, x: 2 }}
                              transition={{ type: "spring", stiffness: 400, damping: 25 }}
                              className="flex items-center justify-between py-3 px-3.5 hover:bg-zinc-800/40 hover:shadow-lg rounded-lg border border-transparent hover:border-zinc-700/50 group transition-all duration-200 cursor-pointer"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {/* Sleek Checkbox */}
                                <span 
                                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300 ${
                                    isSolved 
                                      ? "bg-emerald-500 border-emerald-500 text-zinc-950 shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                                      : "border-zinc-700 bg-zinc-900 text-transparent group-hover:border-zinc-500"
                                  }`}
                                >
                                  {isSolved && (
                                    <svg className="w-2.5 h-2.5 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                  )}
                                </span>
                                <a
                                  href={`https://leetcode.com/problems/${p.slug}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`truncate font-sans text-[14px] leading-snug tracking-wide ${
                                    isSolved ? "text-zinc-500 font-medium" : "text-zinc-200 font-semibold group-hover:text-white"
                                  }`}
                                >
                                  {p.title}
                                </a>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {!isSolved && (
                                  <a
                                    href={`https://leetcode.com/problems/${p.slug}/solutions/`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={`Open solution discussions for ${p.title}`}
                                    className="rounded-full bg-zinc-900 p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-[#dfa054] shadow-sm"
                                  >
                                    <Lightbulb size={12} />
                                  </a>
                                )}
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest ${diffColor}`}>
                                  {difficulty}
                                </span>
                              </div>
                            </motion.div>
                          )
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              )
            })}
          </div>
        </div>
      ) : (
        // ZeroTrac Interactive List Rendering
        <div className="grid gap-3.5 animate-fadeIn">
          {/* Header Banner */}
          <div className="relative overflow-hidden rounded-xl border border-sky-500/20 bg-gradient-to-r from-sky-950/40 via-zinc-950/80 to-zinc-950 p-4 shadow-lg">
            <div className="flex items-center justify-between gap-3 relative z-10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="panel-label text-sky-400">ZeroTrac Explorer</span>
                  <span className="text-[9px] bg-sky-400/10 text-sky-300 border border-sky-400/20 px-1.5 py-0.5 rounded font-mono font-bold">Elo Ratings</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400 font-sans">
                  Browse <strong className="text-zinc-200">{zerotracData.length.toLocaleString()}</strong> contest-rated problems. Filter by difficulty range, contest number, or Q1–Q4 index.
                </p>
              </div>
              <div className="shrink-0 text-right font-mono">
                <div className="text-xs font-bold text-sky-400 tabular-nums">{filteredZerotrac.length}</div>
                <div className="text-[9px] text-zinc-500 uppercase tracking-wider">Filtered</div>
              </div>
            </div>
          </div>

          {/* Quick Rating Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none font-mono text-[9.5px]">
            <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider shrink-0 mr-1">Bands:</span>
            {[
              { label: "All", min: 800, max: 3500 },
              { label: "1200–1500 (Easy)", min: 1200, max: 1500 },
              { label: "1500–1800 (Med)", min: 1500, max: 1800 },
              { label: "1800–2100 (Hard)", min: 1800, max: 2100 },
              { label: "2100+ (Master)", min: 2100, max: 3500 },
            ].map((preset) => {
              const isActive = ratingMin === preset.min && ratingMax === preset.max
              return (
                <button
                  key={preset.label}
                  onClick={() => {
                    setRatingMin(preset.min)
                    setRatingMax(preset.max)
                    setCurrentPage(1)
                  }}
                  className={`shrink-0 px-2.5 py-1 rounded-md font-semibold transition-all border ${
                    isActive
                      ? "bg-sky-500/15 border-sky-500/40 text-sky-300 shadow-sm"
                      : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          {/* ZeroTrac Advanced Filters Form */}
          <Card className="p-3.5 flex flex-col gap-3 font-sans border-zinc-800/80 bg-zinc-950/50 shadow-md">
            {/* Search & Contest Inputs */}
            <div className="grid grid-cols-12 gap-2.5">
              <div className="col-span-5">
                <label className="text-[9px] font-bold text-zinc-400 block mb-1 font-mono uppercase tracking-wider">Search Problem</label>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Title or slug..." 
                    className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg pl-3 pr-6 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all font-mono"
                    value={keyword}
                    onChange={(e) => {
                      setKeyword(e.target.value)
                      setCurrentPage(1)
                    }}
                  />
                  {keyword && (
                    <button 
                      onClick={() => setKeyword("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <div className="col-span-4">
                <label className="text-[9px] font-bold text-zinc-400 block mb-1 font-mono uppercase tracking-wider">Contest</label>
                <input 
                  type="text" 
                  placeholder="e.g. 408" 
                  className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all font-mono"
                  value={contestNumber}
                  onChange={(e) => {
                    setContestNumber(e.target.value)
                    setCurrentPage(1)
                  }}
                />
              </div>

              <div className="col-span-3">
                <label className="text-[9px] font-bold text-zinc-400 block mb-1 font-mono uppercase tracking-wider">Index</label>
                <select
                  value={questionIndexFilter}
                  onChange={(e) => {
                    setQuestionIndexFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-sky-500/50 transition-all font-mono cursor-pointer"
                >
                  <option value="all">Q1–Q4</option>
                  <option value="Q1">Q1 (Easy)</option>
                  <option value="Q2">Q2 (Med 1)</option>
                  <option value="Q3">Q3 (Med 2)</option>
                  <option value="Q4">Q4 (Hard)</option>
                </select>
              </div>
            </div>

            {/* Rating Interval Range & Status Filter */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-zinc-800/60 pt-2.5">
              <div className="flex items-center gap-2 font-mono">
                <span className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider">Rating:</span>
                <input 
                  type="number"
                  value={ratingMin}
                  onChange={(e) => {
                    setRatingMin(parseInt(e.target.value) || 0)
                    setCurrentPage(1)
                  }}
                  className="w-16 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs text-center text-zinc-200 focus:outline-none focus:border-sky-500 font-mono"
                />
                <span className="text-zinc-600 font-bold">–</span>
                <input 
                  type="number"
                  value={ratingMax}
                  onChange={(e) => {
                    setRatingMax(parseInt(e.target.value) || 0)
                    setCurrentPage(1)
                  }}
                  className="w-16 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs text-center text-zinc-200 focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              {/* Status Segmented Control */}
              <div className="flex items-center gap-2">
                <div className="flex bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
                  {(["all", "open", "done"] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => {
                        setStatusFilter(filter)
                        setCurrentPage(1)
                      }}
                      className={`text-[9px] font-bold px-2.5 py-1 rounded-md uppercase font-mono transition-all ${
                        statusFilter === filter ? "bg-zinc-800 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {filter === "all" ? "All" : filter === "open" ? "Unsolved" : "Solved"}
                    </button>
                  ))}
                </div>

                <button 
                  onClick={handleResetFilters}
                  className="text-[9px] font-bold font-mono text-zinc-400 hover:text-rose-400 bg-zinc-900 hover:bg-rose-500/10 border border-zinc-800 hover:border-rose-500/30 rounded-lg px-2.5 py-1 transition-all"
                  title="Reset all filters"
                >
                  Reset
                </button>
              </div>
            </div>
          </Card>

          {/* ZeroTrac Matching Results List */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-[10px] text-zinc-400 font-mono px-1">
              <span>Matching Problems ({filteredZerotrac.length})</span>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => handleSort(e.target.value as any)}
                  className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-[9.5px] text-zinc-300 focus:outline-none font-mono cursor-pointer"
                >
                  <option value="rating">Rating {sortBy === "rating" ? (sortOrder === "asc" ? "↑" : "↓") : ""}</option>
                  <option value="index">Index {sortBy === "index" ? (sortOrder === "asc" ? "↑" : "↓") : ""}</option>
                  <option value="contest">Contest {sortBy === "contest" ? (sortOrder === "asc" ? "↑" : "↓") : ""}</option>
                  <option value="title">Title {sortBy === "title" ? (sortOrder === "asc" ? "↑" : "↓") : ""}</option>
                  <option value="id">ID {sortBy === "id" ? (sortOrder === "asc" ? "↑" : "↓") : ""}</option>
                </select>
                <button
                  onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
                  className="text-xs text-zinc-400 hover:text-zinc-200 px-1 py-0.5 rounded border border-zinc-800 bg-zinc-950 font-mono"
                  title="Toggle sort direction"
                >
                  {sortOrder === "asc" ? "▲" : "▼"}
                </button>
              </div>
            </div>

            {filteredZerotrac.length === 0 ? (
              <div className="text-center py-10 text-xs text-zinc-500 font-mono bg-zinc-950/40 rounded-xl border border-dashed border-zinc-800 space-y-1">
                <p className="font-semibold text-zinc-400">No matching ZeroTrac problems found</p>
                <p className="text-[10px] text-zinc-600">Try adjusting your rating range or search query.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {/* Modern Card List for Problems */}
                <div className="flex flex-col gap-1.5">
                  {paginatedItems.map((p, idx) => {
                    const isSolved = solvedSlugs.has(p.TitleSlug)
                    const ratingVal = Math.round(p.Rating || 0)
                    const problemId = p.ID || p.QuestionID || (p as any).id || (p as any).questionId

                    // Color code ZeroTrac rating badges:
                    let ratingBg = "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                    if (ratingVal >= 2300) ratingBg = "bg-purple-500/15 text-purple-300 border-purple-500/30"
                    else if (ratingVal >= 2000) ratingBg = "bg-rose-500/12 text-rose-400 border-rose-500/25"
                    else if (ratingVal >= 1700) ratingBg = "bg-orange-500/12 text-orange-400 border-orange-500/25"
                    else if (ratingVal >= 1400) ratingBg = "bg-amber-500/12 text-amber-400 border-amber-500/25"

                    const indexStr = p.ProblemIndex ? String(p.ProblemIndex).trim() : ""
                    const normalizedIndex = indexStr.replace("Q", "").replace(/^0+/, "")
                    let indexBadge = "bg-zinc-800/80 text-zinc-400 border-zinc-700/50"
                    if (normalizedIndex === "1") indexBadge = "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                    else if (normalizedIndex === "2") indexBadge = "bg-amber-950/40 text-amber-400 border-amber-500/30"
                    else if (normalizedIndex === "3") indexBadge = "bg-orange-950/40 text-orange-400 border-orange-500/30"
                    else if (normalizedIndex === "4") indexBadge = "bg-rose-950/40 text-rose-400 border-rose-500/30"

                    return (
                      <Card 
                        key={p.TitleSlug || idx}
                        className={`p-2.5 transition-all duration-200 border group ${
                          isSolved 
                            ? "bg-zinc-950/40 border-zinc-900 opacity-75 hover:opacity-100" 
                            : "bg-zinc-950/70 border-zinc-800/70 hover:border-zinc-700 hover:bg-zinc-900/40 shadow-sm"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2.5">
                          {/* Left: Question Number + Checkbox + Title + Meta */}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {/* Question ID / Number on far left (only rendered when ID exists) */}
                            {problemId ? (
                              <span 
                                className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded text-center shrink-0 min-w-[36px] tabular-nums bg-zinc-900 text-[#dfa054] border border-[#dfa054]/30"
                                title={`Problem #${problemId}`}
                              >
                                #{problemId}
                              </span>
                            ) : null}

                            {/* Solved Checkbox */}
                            <span 
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                                isSolved 
                                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" 
                                  : "border-zinc-800 bg-zinc-950 text-transparent group-hover:border-zinc-700"
                              }`}
                              title={isSolved ? "Solved" : "Unsolved"}
                            >
                              {isSolved && <span className="text-[9px] font-bold">✓</span>}
                            </span>

                            <div className="min-w-0 flex-1">
                              <a
                                href={`https://leetcode.com/problems/${p.TitleSlug}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`truncate text-xs font-semibold hover:text-[#dfa054] transition-colors block ${
                                  isSolved ? "text-zinc-500 line-through" : "text-zinc-100"
                                }`}
                                title={`Open ${p.Title} on LeetCode`}
                              >
                                {p.Title}
                              </a>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[9.5px] font-mono text-zinc-500">
                                <span className="truncate max-w-[150px]" title={p.ContestID_en}>
                                  {p.ContestID_en || p.ContestSlug || "Contest"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Right: Index + Rating Pill */}
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Question Index (Q1-Q4) */}
                            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${indexBadge}`}>
                              {p.ProblemIndex || "Q?"}
                            </span>

                            {/* Elo Rating Badge */}
                            <span className={`text-[10.5px] font-mono font-bold px-2 py-0.5 rounded-md border tabular-nums ${ratingBg}`}>
                              {ratingVal}
                            </span>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>

                {/* Compact Pagination Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-950/60 border border-zinc-800/80 p-2 px-3 rounded-xl font-mono text-[10px] text-zinc-400">
                  <div className="flex items-center gap-1 shrink-0 select-none">
                    <span>Showing <strong className="text-zinc-200">{Math.min(totalItems, (activePage - 1) * 15 + 1)}–{Math.min(totalItems, activePage * 15)}</strong> of {totalItems}</span>
                  </div>
                  
                  {/* Page Navigation */}
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={activePage === 1}
                      className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-300"
                    >
                      ‹
                    </button>
                    
                    {pageNumbers.map((page, idx) => {
                      if (page === "...") {
                        return <span key={idx} className="px-1 text-zinc-600 select-none">...</span>
                      }
                      const isCurrent = activePage === page
                      return (
                        <button
                          key={idx}
                          onClick={() => setCurrentPage(Number(page))}
                          className={`px-2 py-0.5 rounded font-bold transition-all ${
                            isCurrent 
                              ? "bg-sky-500/20 border border-sky-500/40 text-sky-300" 
                              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                          }`}
                        >
                          {page}
                        </button>
                      )
                    })}

                    <button 
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={activePage === totalPages}
                      className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-300"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

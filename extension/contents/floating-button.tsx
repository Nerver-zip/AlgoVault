import cssText from "data-text:~style.css"
import type { PlasmoCSConfig, PlasmoGetStyle } from "plasmo"
import { useEffect, useState } from "react"
import { Storage } from "@plasmohq/storage"

interface ActiveSession { isActive?: boolean; startTime?: number; titleSlug?: string; mode?: string; focusScore?: number; tabSwitches?: number; pasteCount?: number; }
interface SessionState { isSolved?: boolean; finalSeconds?: number; focusScore?: number; tabSwitches?: number; copyPastes?: number; }
interface LiveTimerState { focusSeconds?: number; elapsedSeconds?: number; isPaused?: boolean; isSolved?: boolean; }

const storage = new Storage()

export const config: PlasmoCSConfig = {
  matches: ["https://leetcode.com/problems/*", "https://leetcode.com/contest/*/problems/*"]
}

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText.replaceAll(':root', ':host(plasmo-csui)')
  return style
}

const FloatingButton = () => {
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [sessionState, setSessionState] = useState<SessionState | null>(null)
  const [liveTimer, setLiveTimer] = useState<LiveTimerState | null>(null)
  const [problemStartTime, setProblemStartTime] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  // Zenith properties
  const [isZenith, setIsZenith] = useState(false)
  const [zenithGrade, setZenithGrade] = useState("S_PLUS")
  const [zenithFocusScore, setZenithFocusScore] = useState(100)

  useEffect(() => {
    const load = () => {
      chrome.storage.local.get([
        "algovault.currentSession",
        "algovault.sessionState",
        "algovault.liveTimer",
        "algovault.timerPaused",
        "algovault.problemStartTime",
        "algovault.isZenith",
        "algovault.zenithGrade",
        "algovault.zenithFocusScore"
      ], (result) => {
        let sess = result["algovault.currentSession"]
        if (typeof sess === "string") {
          try { sess = JSON.parse(sess) } catch (e) {}
        }
        let state = result["algovault.sessionState"]
        if (typeof state === "string") {
          try { state = JSON.parse(state) } catch (e) {}
        }
        setSession(sess || null)
        setSessionState(state || null)
        setLiveTimer(result["algovault.liveTimer"] || null)
        setIsPaused(!!result["algovault.timerPaused"])
        setProblemStartTime(result["algovault.problemStartTime"] || null)
        setIsZenith(!!result["algovault.isZenith"])
        setZenithGrade(result["algovault.zenithGrade"] || "S_PLUS")
        setZenithFocusScore(result["algovault.zenithFocusScore"] ?? 100)
      })
    }
    load()
    const listener = (changes: any, areaName: string) => {
      if (areaName === "local" && (
        changes["algovault.currentSession"] ||
        changes["algovault.sessionState"] ||
        changes["algovault.liveTimer"] ||
        changes["algovault.timerPaused"] ||
        changes["algovault.problemStartTime"] ||
        changes["algovault.isZenith"] ||
        changes["algovault.zenithGrade"] ||
        changes["algovault.zenithFocusScore"]
      )) {
        load();
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  const handleOpenPanel = (e: React.MouseEvent) => {
    e.stopPropagation()
    chrome.runtime.sendMessage({ action: "open_side_panel" })
  }

  const togglePauseTimer = (e: React.MouseEvent) => {
    e.stopPropagation()
    const nextState = !isPaused
    setIsPaused(nextState)
    chrome.storage.local.set({ "algovault.timerPaused": nextState })
  }

  const handleAbandonZenith = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm("Are you sure you want to abandon this Zenith session? Your quest progress will be lost.")) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
      chrome.storage.local.set({
        "algovault.isZenith": false,
        "algovault.zenithGrade": "S_PLUS"
      }, () => {
        location.reload()
      })
    }
  }

  // Calculate high-precision active focus seconds
  let activeSecs = 0
  if (sessionState?.isSolved) {
    activeSecs = sessionState.finalSeconds ?? 0
  } else if (liveTimer?.focusSeconds != null) {
    activeSecs = liveTimer.focusSeconds
  } else if (problemStartTime) {
    activeSecs = Math.max(0, Math.floor((Date.now() - new Date(problemStartTime).getTime()) / 1000))
  }

  let totalElapsedSecs = liveTimer?.elapsedSeconds ?? (problemStartTime ? Math.max(0, Math.floor((Date.now() - new Date(problemStartTime).getTime()) / 1000)) : activeSecs)

  const minutes = Math.floor(activeSecs / 60)
  const rem = String(activeSecs % 60).padStart(2, "0")

  const elapsedMins = Math.floor(totalElapsedSecs / 60)
  const elapsedRem = String(totalElapsedSecs % 60).padStart(2, "0")

  const formattedGrade = zenithGrade.replace("_PLUS", "+")

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="fixed bottom-6 right-6 z-[9999] transition-all duration-200 ease-in-out font-sans"
    >
      {!expanded ? (
        // Collapsed Pill Button
        <button
          onClick={handleOpenPanel}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full elevated-card text-xs text-zinc-300 font-mono font-medium hover:border-zinc-700 transition-all border ${
            isPaused
              ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
              : isZenith 
                ? (minutes >= 25 ? 'border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.6)] animate-pulse' : 'border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.35)]') 
                : 'border-zinc-805'
          } shadow-lg cursor-pointer`}
          title={`Active Practice: ${minutes}m ${rem}s | Total Elapsed: ${elapsedMins}m ${elapsedRem}s`}
        >
          <span className={`${isPaused ? 'text-amber-400' : isZenith ? (minutes >= 25 ? 'text-amber-400' : 'text-cyan-400') : 'text-[#dfa054]'} text-xs`}>
            {isPaused ? '⏸️' : isZenith ? `⚔️ ${formattedGrade}` : '⚡'}
          </span>
          <span className="tabular-nums">{minutes}:{rem}</span>
        </button>
      ) : (
        // Expanded Command Surface Layout
        <div className={`w-[200px] rounded-xl border bg-zinc-950/95 backdrop-blur-xl p-3 shadow-2xl transition-all duration-200 ${
          isZenith ? 'border-cyan-500/35 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'border-zinc-800/80'
        }`}>
          <div className="flex items-center justify-between border-b border-zinc-900 pb-2 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isPaused ? 'bg-amber-400' : isZenith ? 'bg-cyan-400' : session ? 'bg-[#dfa054]' : 'bg-zinc-600'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isPaused ? 'bg-amber-500' : isZenith ? 'bg-cyan-500' : session ? 'bg-[#dfa054]' : 'bg-zinc-700'}`}></span>
              </span>
              <span className="font-bold text-[10px] text-zinc-300 tracking-wider font-mono">
                {isPaused ? "AV:PAUSED" : isZenith ? "AV:ZENITH" : `AV:${session?.mode || "SOLVING"}`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className={`text-xs font-mono font-semibold tabular-nums ${isPaused ? 'text-amber-400' : isZenith ? 'text-cyan-400' : 'text-[#dfa054]'}`}>
                {minutes}:{rem}
              </span>
              <button
                onClick={togglePauseTimer}
                className="ml-1 px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-[9px] font-mono font-bold text-zinc-300 hover:text-white"
                title={isPaused ? "Resume Timer" : "Pause Timer"}
              >
                {isPaused ? "▶️" : "⏸️"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-zinc-400 mb-2">
            <div className="flex flex-col items-center bg-zinc-900/40 border border-zinc-900 py-1.5 rounded">
              <span className="text-zinc-500 text-[8px] uppercase tracking-wider font-semibold">
                Active Focus
              </span>
              <span className="font-bold text-emerald-400 mt-0.5 tabular-nums">
                {minutes}m {rem}s
              </span>
            </div>
            <div className="flex flex-col items-center bg-zinc-900/40 border border-zinc-900 py-1.5 rounded">
              <span className="text-zinc-500 text-[8px] uppercase tracking-wider font-semibold">
                Total Elapsed
              </span>
              <span className="font-bold text-zinc-300 mt-0.5 tabular-nums">
                {elapsedMins}m {elapsedRem}s
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono text-zinc-400 mb-2.5">
            <div className="flex flex-col items-center bg-zinc-900/30 border border-zinc-900 py-1 rounded">
              <span className="text-zinc-500 text-[8px] uppercase tracking-wider font-semibold">
                {isZenith ? "Grade" : "Focus"}
              </span>
              <span className={`font-bold mt-0.5 ${isZenith ? 'text-cyan-400' : 'text-zinc-200'}`}>
                {isZenith ? formattedGrade : (session?.focusScore ?? 100)}
              </span>
            </div>
            <div className="flex flex-col items-center bg-zinc-900/30 border border-zinc-900 py-1 rounded">
              <span className="text-zinc-500 text-[8px] uppercase tracking-wider font-semibold">
                {isZenith ? "Focus" : "Tabs"}
              </span>
              <span className="font-bold text-zinc-200 mt-0.5 tabular-nums">
                {isZenith ? `${zenithFocusScore}%` : (session?.tabSwitches ?? 0)}
              </span>
            </div>
            <div className="flex flex-col items-center bg-zinc-900/30 border border-zinc-900 py-1 rounded">
              <span className="text-zinc-500 text-[8px] uppercase tracking-wider font-semibold">
                {isZenith ? "Obey" : "Paste"}
              </span>
              <span className="font-bold text-zinc-200 mt-0.5 tabular-nums">
                {isZenith ? (zenithGrade === "INVALID" ? "No" : "Yes") : (session?.pasteCount ?? 0)}
              </span>
            </div>
          </div>

          {isZenith ? (
            <button
              onClick={handleAbandonZenith}
              className="w-full bg-red-950/80 hover:bg-red-900/80 text-red-400 border border-red-800/40 font-bold text-[10px] py-1.5 rounded transition-all text-center tracking-wider uppercase shadow-sm cursor-pointer"
            >
              Abandon Quest
            </button>
          ) : (
            <button
              onClick={handleOpenPanel}
              className="w-full bg-[#dfa054] hover:bg-[#eab308] text-zinc-950 font-bold text-[10px] py-1.5 rounded transition-all text-center tracking-wider uppercase shadow-sm cursor-pointer"
            >
              Open Dashboard
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default FloatingButton

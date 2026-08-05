import { useEffect, useState, useCallback } from "react"
import { Storage } from "@plasmohq/storage"
import type { PracticeSession } from "../lib/session-engine/types"
import { deriveClocks } from "../lib/session-engine/EngineKernel"

const storage = new Storage({ area: "local" })
const ACTIVE_SESSION_KEY = "algovault.session.active"

export function usePracticeSession() {
  const [session, setSession] = useState<PracticeSession | null>(null)
  const [now, setNow] = useState<number>(Date.now())

  // 1. Initial storage load & Reactive Subscriptions
  useEffect(() => {
    let mounted = true

    storage.get<PracticeSession>(ACTIVE_SESSION_KEY).then((data) => {
      if (mounted) {
        setSession(data || null)
      }
    })

    const storageListener = (changes: Record<string, any>, areaName: string) => {
      if (areaName === "local" && changes[ACTIVE_SESSION_KEY]) {
        const nextSession = changes[ACTIVE_SESSION_KEY].newValue as PracticeSession | null
        if (mounted) {
          setSession(nextSession || null)
        }
      }
    }

    const messageListener = (msg: any) => {
      if (msg && msg.action === "session_updated_v2") {
        if (mounted) {
          setSession(msg.session || null)
        }
      }
    }

    chrome.storage.onChanged.addListener(storageListener)
    chrome.runtime.onMessage.addListener(messageListener)

    return () => {
      mounted = false
      chrome.storage.onChanged.removeListener(storageListener)
      chrome.runtime.onMessage.removeListener(messageListener)
    }
  }, [])

  // 2. Centralized 1-second Local Tick (Zero Storage Writes)
  useEffect(() => {
    if (!session || session.st !== "RUNNING") return

    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [session?.st, session?.tActiveStart])

  // 3. Derived Clocks (Pure math calculations)
  const clocks = deriveClocks(session, now)

  // 4. Action Handlers (State Transitions with Optimistic UI updates)
  const pauseSession = useCallback((reason: "MANUAL" | "IDLE" = "MANUAL") => {
    chrome.runtime.sendMessage({ action: "session_pause_v2", reason }, (res) => {
      if (res?.ok && res.session) {
        setSession(res.session)
      }
    })
  }, [])

  const resumeSession = useCallback(() => {
    chrome.runtime.sendMessage({ action: "session_resume_v2" }, (res) => {
      if (res?.ok && res.session) {
        setSession(res.session)
      }
    })
  }, [])

  const resetSession = useCallback(() => {
    chrome.runtime.sendMessage({ action: "session_reset_v2" }, (res) => {
      if (res?.ok) {
        setSession(null)
      }
    })
  }, [])

  const finishSession = useCallback((language?: string) => {
    chrome.runtime.sendMessage({ action: "session_finish_v2", language }, (res) => {
      if (res?.ok && res.session) {
        setSession(res.session)
      }
    })
  }, [])

  return {
    session,
    clocks,
    pauseSession,
    resumeSession,
    resetSession,
    finishSession
  }
}


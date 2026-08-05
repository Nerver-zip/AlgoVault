import type { PracticeSession, PracticeLog } from "./types"

export type PracticeEvent =
  | { type: "SESSION_STATE_CHANGED"; session: PracticeSession }
  | { type: "SESSION_CHECKPOINT"; session: PracticeSession }
  | { type: "SESSION_SOLVED"; session: PracticeSession; log: PracticeLog }
  | { type: "SESSION_RESET"; slug: string }

type EventListener = (event: PracticeEvent) => void

/**
 * Lightweight, zero-dependency EventBus for APSE v2.
 * Allows Zenith, Mastery, and Analytics plugins to react to session events without mutating engine state.
 */
export class PracticeEventBus {
  private static listeners: Set<EventListener> = new Set()

  static subscribe(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  static emit(event: PracticeEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (err) {
        console.error("[APSE EventBus Error]:", err)
      }
    })
  }
}

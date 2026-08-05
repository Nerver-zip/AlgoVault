import { BACKEND_URL } from "../constants"
import { getJwtToken, getUsername, clearJwtToken } from "../storage"
import type { ActiveSession, DashboardData, PredictionResult, RevisionQueueItem, SessionData, WeaknessSnapshot } from "../types"

export const exchangeGithubCode = async (code: string) => {
  const res = await fetch(`${BACKEND_URL}/api/auth/github-exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  if (!res.ok) {
    const errorMsg = await res.text().catch(() => "");
    throw new Error(`GitHub token exchange failed: ${res.status} ${errorMsg}`);
  }
  return res.json();
}

// Older callers still consume a few untyped backend endpoints. Typed endpoint
// wrappers should opt in explicitly while this preserves their compatibility.
async function backendFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const jwt = await getJwtToken()
  const username = await getUsername()
  const headers = new Headers(init.headers)
  headers.set("Content-Type", headers.get("Content-Type") || "application/json")

  if (jwt) {
    headers.set("Authorization", `Bearer ${jwt}`)
  } else if (username) {
    headers.set("Authorization", `Bearer ${await getLocalToken(username)}`)
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers,
    signal: controller.signal
  })
  clearTimeout(timeoutId);

  if (res.status === 401) {
    await clearJwtToken()
    localToken = null
    localTokenUsername = null
    if (username) {
      return backendFetch(path, init)
    }
    throw new Error("Open LeetCode and choose the account you want to sync first.")
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(body || `Backend request failed: ${res.status}`)
  }
  if (res.status === 204) return null as T
  const text = await res.text().catch(() => "")
  if (!text.trim()) return null as T
  return JSON.parse(text) as T
}

export const fetchPrediction = async (titleSlug: string): Promise<PredictionResult> => {
  return backendFetch<PredictionResult>(`/api/predict/${titleSlug}`)
}

export const fetchDashboard = async (): Promise<DashboardData> => backendFetch<DashboardData>("/api/dashboard")
export const fetchHeatmap = async () => backendFetch("/api/heatmap")
export const fetchMastery = async () => backendFetch("/api/mastery")
export const fetchWeakness = async (refresh = false): Promise<WeaknessSnapshot> => backendFetch<WeaknessSnapshot>(refresh ? "/api/weakness?refresh=true" : "/api/weakness")
export const fetchPotd = async () => backendFetch("/api/potd")
export const fetchRevisionQueue = async (): Promise<RevisionQueueItem[]> => backendFetch<RevisionQueueItem[]>("/api/revision")
export const reviewRevisionCard = async (cardId: number, quality: number) => {
  return backendFetch(`/api/revision/${cardId}`, {
    method: "POST",
    body: JSON.stringify({ quality })
  })
}
export const fetchContests = async () => backendFetch("/api/contests")
export const syncLeetcode = async (payload: Record<string, any>) => {
  return backendFetch("/api/sync/leetcode", {
    method: "POST",
    body: JSON.stringify(payload)
  })
}

export const fetchVault = async (query?: string) => {
  const path = query ? `/api/vault?query=${encodeURIComponent(query)}` : "/api/vault"
  return backendFetch(path)
}

export const addToVault = async (payload: Record<string, any>) => {
  return backendFetch("/api/vault", {
    method: "POST",
    body: JSON.stringify(payload)
  })
}

export const startSession = async (mode = "PRACTICE"): Promise<ActiveSession> => {
  return backendFetch<ActiveSession>("/api/sessions/start", {
    method: "POST",
    body: JSON.stringify({ mode })
  })
}

export const fetchCurrentSession = async (): Promise<ActiveSession | null> => backendFetch<ActiveSession | null>("/api/sessions/current")

export const fetchAllSessions = async (): Promise<SessionData[]> => backendFetch<SessionData[]>("/api/sessions/all")

export const sendSessionEvent = async (payload: Record<string, unknown>): Promise<ActiveSession | null> => {
  return backendFetch<ActiveSession | null>("/api/sessions/event", {
    method: "POST",
    body: JSON.stringify(payload)
  })
}

export const sendSessionHeartbeat = async (payload: Record<string, unknown>): Promise<ActiveSession | null> => {
  return backendFetch<ActiveSession | null>("/api/sessions/heartbeat", {
    method: "POST",
    body: JSON.stringify(payload)
  })
}

export const sendSubmissionResult = async (payload: Record<string, unknown>): Promise<ActiveSession | null> => {
  return backendFetch<ActiveSession | null>("/api/sessions/submission", {
    method: "POST",
    body: JSON.stringify(payload)
  })
}

export const sendSelfReport = async (payload: Record<string, any>) => {
  return backendFetch("/api/sessions/self-report", {
    method: "POST",
    body: JSON.stringify(payload)
  })
}

export const endSession = async (): Promise<ActiveSession | null> => {
  return backendFetch<ActiveSession | null>("/api/sessions/end", {
    method: "POST"
  })
}

export const fetchEntrantHubHistoryBackend = async (username: string, region: string): Promise<any> => {
  return backendFetch(`/api/entranthub/history?username=${encodeURIComponent(username)}&region=${encodeURIComponent(region)}`)
}



export const fetchEntrantHubUpcomingBackend = async (): Promise<any> => {
  return backendFetch("/api/entranthub/upcoming")
}

export const fetchZerotracRatingsBackend = async (): Promise<any> => {
  return backendFetch("/api/metadata/zerotrac-ratings")
}

export const getSettings = async () => {
  return backendFetch("/api/settings", {
    method: "GET"
  })
}

export const updateSettings = async (preferences: Record<string, any>) => {
  return backendFetch("/api/settings", {
    method: "POST",
    body: JSON.stringify(preferences)
  })
}

export const exportUserData = async (): Promise<Blob> => {
  const data = await backendFetch("/api/export/json")
  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
}
let localToken: string | null = null
let localTokenUsername: string | null = null

async function getLocalToken(username: string) {
  if (localToken && localTokenUsername === username) return localToken
  const response = await fetch(`${BACKEND_URL}/api/auth/extension-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username })
  })
  if (!response.ok) throw new Error(await response.text().catch(() => "Unable to connect your local profile."))
  const payload = await response.json()
  localToken = payload.token
  localTokenUsername = username
  return payload.token as string
}

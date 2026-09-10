import { BACKEND_URL } from "../constants"
import {
  getJwtToken,
  setJwtToken,
  clearJwtToken,
  getGithubPat,
  setGithubPat,
  getGithubRefreshToken,
  setGithubRefreshToken,
  clearGithubRefreshToken,
  setGithubTokenExpiresAt,
  clearGithubTokenExpiresAt,
  setGithubRefreshTokenExpiresAt,
  clearGithubRefreshTokenExpiresAt
} from "../storage"
import type { ActiveSession, DashboardData, PredictionResult, RevisionQueueItem, SessionData, WeaknessSnapshot } from "../types"
import { BackendAuthError, backendAuthMessage, type BackendAuthFailureKind } from "../backend-auth"
import { normalizeGithubCredential } from "../github-status"
import { isJwtExpired, shouldRefreshJwt } from "../jwt"

const JWT_REFRESH_SKEW_MS = 10 * 60 * 1000

type SilentRefreshResult = { token: string | null; failure?: BackendAuthFailureKind }
let refreshInFlight: Promise<SilentRefreshResult> | null = null

export type GithubSessionResponse = {
  token: string
  githubToken: string
  username: string
  refreshToken?: string
  expiresIn?: number
  refreshTokenExpiresIn?: number
}

export const getGithubOAuthState = async (): Promise<string> => {
  const res = await fetch(`${BACKEND_URL}/api/auth/github-state`)
  if (!res.ok) throw new Error("Could not start secure GitHub authorization")
  const payload = await res.json()
  if (!payload?.state || typeof payload.state !== "string") throw new Error("Invalid OAuth state response")
  return payload.state
}

export const exchangeGithubCode = async (code: string, state: string, codeVerifier: string, redirectUri: string) => {
  const res = await fetch(`${BACKEND_URL}/api/auth/github-exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state, codeVerifier, redirectUri })
  });
  if (!res.ok) {
    const errorMsg = await res.text().catch(() => "");
    throw new Error(`GitHub token exchange failed: ${res.status} ${errorMsg}`);
  }
  return res.json();
}

export const authenticateGithubToken = async (token: string) => {
  token = normalizeGithubCredential(token)
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/github-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    })
    if (!res.ok) {
      if (res.status === 401) {
        const directStatus = await validateSavedGithubCredential(token)
        throw new BackendAuthError(
          directStatus === "invalid" ? "GITHUB_TOKEN_REJECTED" : "CLOUD_SESSION_UNAVAILABLE",
          backendAuthMessage(directStatus === "invalid" ? "GITHUB_TOKEN_REJECTED" : "CLOUD_SESSION_UNAVAILABLE")
        )
      }
      throw new BackendAuthError("CLOUD_SESSION_UNAVAILABLE", backendAuthMessage("CLOUD_SESSION_UNAVAILABLE"))
    }
    return res.json() as Promise<GithubSessionResponse>
  } catch (error) {
    if (error instanceof BackendAuthError) throw error
    throw new BackendAuthError("CLOUD_SESSION_UNAVAILABLE", backendAuthMessage("CLOUD_SESSION_UNAVAILABLE"))
  }
}

/**
 * Rotates an expiring GitHub OAuth access token through the backend. The
 * client secret never enters the extension bundle; GitHub's response may
 * contain a new refresh token, which must replace the old one atomically.
 */
export const refreshGithubOAuthSession = async (refreshToken: string): Promise<GithubSessionResponse> => {
  const res = await fetch(`${BACKEND_URL}/api/auth/github-refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    if (res.status === 401) {
      throw new BackendAuthError("GITHUB_REAUTH_REQUIRED", backendAuthMessage("GITHUB_REAUTH_REQUIRED"))
    }
    throw new BackendAuthError("CLOUD_SESSION_UNAVAILABLE", body || backendAuthMessage("CLOUD_SESSION_UNAVAILABLE"))
  }
  return res.json() as Promise<GithubSessionResponse>
}

export async function persistGithubSession(
  authRes: GithubSessionResponse,
  options: { preserveExistingRefreshToken?: boolean } = {}
): Promise<void> {
  const preserveExistingRefreshToken = options.preserveExistingRefreshToken === true
  if (authRes.githubToken) {
    await setGithubPat(authRes.githubToken)
  }
  if (authRes.refreshToken) {
    await setGithubRefreshToken(authRes.refreshToken)
  } else if (!preserveExistingRefreshToken) {
    await clearGithubRefreshToken()
  }
  if (typeof authRes.expiresIn === "number" && authRes.expiresIn > 0) {
    await setGithubTokenExpiresAt(Date.now() + authRes.expiresIn * 1000)
  } else if (!preserveExistingRefreshToken) {
    await clearGithubTokenExpiresAt()
  }
  if (typeof authRes.refreshTokenExpiresIn === "number" && authRes.refreshTokenExpiresIn > 0) {
    await setGithubRefreshTokenExpiresAt(Date.now() + authRes.refreshTokenExpiresIn * 1000)
  } else if (!preserveExistingRefreshToken) {
    await clearGithubRefreshTokenExpiresAt()
  }
  await setJwtToken(authRes.token)
}

async function validateSavedGithubCredential(token: string): Promise<"valid" | "invalid" | "unknown"> {
  try {
    token = normalizeGithubCredential(token)
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    })
    if (res.status === 401) return "invalid"
    if (res.ok) return "valid"
    return "unknown"
  } catch {
    return "unknown"
  }
}

async function trySilentRefresh(force = false): Promise<SilentRefreshResult> {
  const currentJwt = await getJwtToken()
  if (!force && currentJwt && !shouldRefreshJwt(currentJwt, Date.now(), JWT_REFRESH_SKEW_MS)) {
    return { token: currentJwt }
  }

  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
  const pat = await getGithubPat()
  if (!pat) return { token: null, failure: "GITHUB_NOT_CONNECTED" }

  const renewFromSavedCredential = async (): Promise<SilentRefreshResult> => {
    try {
      const authRes = await authenticateGithubToken(pat)
      if (authRes?.token) {
        // This path intentionally replaces a broken refresh credential with
        // the still-valid saved access token. If that token is expiring, the
        // next GitHub validation will correctly require a new OAuth grant.
        await persistGithubSession(authRes)
        return { token: authRes.token }
      }
    } catch (error) {
      if (error instanceof BackendAuthError) return { token: null, failure: error.kind }
    }
    return { token: null, failure: "CLOUD_SESSION_UNAVAILABLE" }
  }

  const savedRefreshToken = await getGithubRefreshToken()
  if (savedRefreshToken) {
    try {
      const authRes = await refreshGithubOAuthSession(savedRefreshToken)
      if (authRes?.token && authRes.githubToken) {
        // GitHub may omit a rotated value in a successful response. Keep the
        // previous refresh metadata in that case instead of breaking the next
        // automatic renewal cycle.
        await persistGithubSession(authRes, { preserveExistingRefreshToken: true })
        return { token: authRes.token }
      }
      return await renewFromSavedCredential()
    } catch (error) {
      if (error instanceof BackendAuthError && error.kind === "GITHUB_REAUTH_REQUIRED") {
        // A stale refresh token does not prove that the access token itself
        // was revoked. Validate and reuse it before asking the user to grant
        // OAuth again, which is the setup-once behavior we want.
        const directStatus = await validateSavedGithubCredential(pat)
        if (directStatus === "invalid") {
          return { token: null, failure: "GITHUB_TOKEN_REJECTED" }
        }
        if (directStatus === "valid") return await renewFromSavedCredential()
        return { token: null, failure: "CLOUD_SESSION_UNAVAILABLE" }
      }
      if (error instanceof BackendAuthError && error.kind === "CLOUD_SESSION_UNAVAILABLE") {
        // A backend/network outage must not discard a still-valid JWT or the
        // refresh credential. The next request/alarm will retry silently.
        return { token: null, failure: error.kind }
      }
    }
  }

  try {
    const authRes = await authenticateGithubToken(pat)
    if (authRes?.token) {
      await persistGithubSession(authRes)
      return { token: authRes.token }
    }
  } catch (error) {
    if (error instanceof BackendAuthError && error.kind === "GITHUB_TOKEN_REJECTED") {
      // The backend can return 401 because it is unable to verify GitHub at
      // that moment. Ask GitHub directly before presenting this as revocation.
      const directStatus = await validateSavedGithubCredential(pat)
      return {
        token: null,
        failure: directStatus === "invalid" ? "GITHUB_TOKEN_REJECTED" : "CLOUD_SESSION_UNAVAILABLE"
      }
    }
    if (error instanceof BackendAuthError) return { token: null, failure: error.kind }
  }
  return { token: null, failure: "CLOUD_SESSION_UNAVAILABLE" }
  })()

  try {
    return await refreshInFlight
  } finally {
    refreshInFlight = null
  }
}

/**
 * Refresh the AlgoVault session before it expires. GitHub remains the saved
 * credential; the backend mints a new short-lived JWT from it.
 */
export const refreshBackendSessionIfNeeded = async (): Promise<SilentRefreshResult> => {
  return trySilentRefresh(false)
}

// Every API request requires the JWT issued after server-verified GitHub OAuth.
async function backendFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  let jwt = await getJwtToken()
  let refreshFailure: BackendAuthFailureKind | undefined
  if (!jwt || shouldRefreshJwt(jwt, Date.now(), JWT_REFRESH_SKEW_MS)) {
    const previousJwt = jwt
    const refreshed = await trySilentRefresh(Boolean(previousJwt))
    jwt = refreshed.token
    refreshFailure = refreshed.failure
    // A transient refresh outage should not interrupt a JWT that is still
    // valid. The next request/401 path will retry the refresh automatically.
    if (!jwt && previousJwt && !isJwtExpired(previousJwt)) jwt = previousJwt
  }

  const headers = new Headers(init.headers)
  headers.set("Content-Type", headers.get("Content-Type") || "application/json")

  if (!jwt) {
    const kind = refreshFailure || "CLOUD_SESSION_UNAVAILABLE"
    throw new BackendAuthError(kind, backendAuthMessage(kind))
  }
  headers.set("Authorization", `Bearer ${jwt}`)

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let res: Response
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeoutId)
  }

  if (res.status === 401) {
    // Attempt one automatic token refresh and retry
    const refreshed = await trySilentRefresh(true)
    const freshJwt = refreshed.token
    if (freshJwt) {
      const retryHeaders = new Headers(init.headers)
      retryHeaders.set("Content-Type", retryHeaders.get("Content-Type") || "application/json")
      retryHeaders.set("Authorization", `Bearer ${freshJwt}`)
      
      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), 15000);
      try {
        const retryRes = await fetch(`${BACKEND_URL}${path}`, {
          ...init,
          headers: retryHeaders,
          signal: retryController.signal
        })
        if (retryRes.ok) {
          if (retryRes.status === 204) return null as T
          const text = await retryRes.text().catch(() => "")
          if (!text.trim()) return null as T
          return JSON.parse(text) as T
        }
      } finally {
        clearTimeout(retryTimeoutId)
      }
    }

    await clearJwtToken()
    const kind: BackendAuthFailureKind = refreshed.failure === "GITHUB_TOKEN_REJECTED"
      ? "GITHUB_TOKEN_REJECTED"
      : refreshed.failure === "GITHUB_REAUTH_REQUIRED"
        ? "GITHUB_REAUTH_REQUIRED"
        : "CLOUD_SESSION_EXPIRED"
    throw new BackendAuthError(kind, backendAuthMessage(kind))
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
export const fetchHeatmap = async (limit?: number) => {
  const query = limit && limit > 0 ? `?limit=${limit}` : ""
  return backendFetch<any[]>(`/api/heatmap${query}`)
}
export const fetchMastery = async () => backendFetch("/api/mastery")
export const recomputeMastery = async () => backendFetch("/api/mastery/recompute", { method: "POST" })
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

export const fetchAllSessions = async (): Promise<SessionData[]> => backendFetch<SessionData[]>("/api/sessions/all")

export const sendSubmissionResult = async (payload: Record<string, unknown>): Promise<ActiveSession | null> => {
  return backendFetch<ActiveSession | null>("/api/sessions/submission", {
    method: "POST",
    body: JSON.stringify(payload)
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

export const logout = async (): Promise<void> => {
  try {
    await backendFetch("/api/auth/logout", { method: "POST" })
  } finally {
    await clearJwtToken()
  }
}

export const exportUserData = async (): Promise<Blob> => {
  const data = await backendFetch("/api/export/json")
  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
}

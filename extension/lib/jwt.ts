/**
 * Read the standard `exp` claim without trusting the token for authorization.
 * The backend remains the only authority; this is only used to renew early.
 */
export function getJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1]
    if (!payload) return null

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    const claims = JSON.parse(atob(padded)) as { exp?: unknown }
    const exp = typeof claims.exp === "number" ? claims.exp : Number(claims.exp)
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null
  } catch {
    return null
  }
}

export function isJwtExpired(token: string, nowMs = Date.now()): boolean {
  const expiryMs = getJwtExpiryMs(token)
  return expiryMs === null || expiryMs <= nowMs
}

export function shouldRefreshJwt(
  token: string,
  nowMs = Date.now(),
  refreshSkewMs = 10 * 60 * 1000
): boolean {
  const expiryMs = getJwtExpiryMs(token)
  return expiryMs === null || expiryMs - nowMs <= refreshSkewMs
}

import test from "node:test"
import assert from "node:assert/strict"
import { BackendAuthError, backendAuthMessage } from "../lib/backend-auth.ts"
import { getJwtExpiryMs, isJwtExpired, shouldRefreshJwt } from "../lib/jwt.ts"

test("backend auth messages do not conflate a saved GitHub credential with a missing cloud session", () => {
  const error = new BackendAuthError("CLOUD_SESSION_UNAVAILABLE", backendAuthMessage("CLOUD_SESSION_UNAVAILABLE"))
  assert.equal(error.kind, "CLOUD_SESSION_UNAVAILABLE")
  assert.match(error.message, /GitHub is connected/i)
  assert.doesNotMatch(error.message, /Connect GitHub in Settings before using cloud features/i)
  assert.match(backendAuthMessage("GITHUB_NOT_CONNECTED"), /not connected/i)
  assert.match(backendAuthMessage("GITHUB_TOKEN_REJECTED"), /rejected/i)
})

function tokenWithExpiry(exp) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ exp })}.signature`
}

test("JWT renewal helper refreshes before expiry and rejects malformed tokens", () => {
  const now = 1_700_000_000_000
  const expiringSoon = tokenWithExpiry((now + 9 * 60 * 1000) / 1000)
  const healthy = tokenWithExpiry((now + 2 * 60 * 60 * 1000) / 1000)

  assert.equal(getJwtExpiryMs(expiringSoon), now + 9 * 60 * 1000)
  assert.equal(shouldRefreshJwt(expiringSoon, now), true)
  assert.equal(shouldRefreshJwt(healthy, now), false)
  assert.equal(isJwtExpired(healthy, now), false)
  assert.equal(isJwtExpired("not-a-jwt", now), true)
  assert.equal(shouldRefreshJwt("not-a-jwt", now), true)
})

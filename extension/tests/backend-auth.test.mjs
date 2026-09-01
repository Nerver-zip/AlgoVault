import test from "node:test"
import assert from "node:assert/strict"
import { BackendAuthError, backendAuthMessage } from "../lib/backend-auth.ts"

test("backend auth messages do not conflate a saved GitHub credential with a missing cloud session", () => {
  const error = new BackendAuthError("CLOUD_SESSION_UNAVAILABLE", backendAuthMessage("CLOUD_SESSION_UNAVAILABLE"))
  assert.equal(error.kind, "CLOUD_SESSION_UNAVAILABLE")
  assert.match(error.message, /GitHub is connected/i)
  assert.doesNotMatch(error.message, /Connect GitHub in Settings before using cloud features/i)
  assert.match(backendAuthMessage("GITHUB_NOT_CONNECTED"), /not connected/i)
  assert.match(backendAuthMessage("GITHUB_TOKEN_REJECTED"), /rejected/i)
})

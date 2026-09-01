import test from "node:test"
import assert from "node:assert/strict"
import { classifyGithubHttpFailure, githubNetworkFailure, normalizeGithubCredential } from "../lib/github-status.ts"

test("GitHub credentials are normalized before API validation", () => {
  assert.equal(normalizeGithubCredential('  "gho_example"  '), "gho_example")
  assert.equal(normalizeGithubCredential("ghp_example"), "ghp_example")
})

test("GitHub classifies invalid credentials separately from permissions and rate limits", () => {
  const invalid = classifyGithubHttpFailure(401, "profile")
  assert.equal(invalid.kind, "TOKEN_INVALID")
  assert.equal(invalid.revoked, true)

  const rateLimited = classifyGithubHttpFailure(403, "repositories", {
    "x-ratelimit-remaining": "0"
  })
  assert.equal(rateLimited.kind, "RATE_LIMITED")
  assert.equal(rateLimited.revoked, false)
  assert.equal(rateLimited.retryable, true)

  const forbidden = classifyGithubHttpFailure(403, "repository")
  assert.equal(forbidden.kind, "PERMISSION_DENIED")
  assert.equal(forbidden.revoked, false)
  assert.match(forbidden.message, /permission|branch/i)
})
test("GitHub keeps repository and branch failures distinct from token failures", () => {
  assert.equal(classifyGithubHttpFailure(404, "branch").kind, "RESOURCE_NOT_FOUND")
  assert.equal(classifyGithubHttpFailure(409, "merge").kind, "CONFLICT")
  assert.equal(classifyGithubHttpFailure(422, "tree").kind, "INVALID_REQUEST")
  assert.equal(classifyGithubHttpFailure(503, "commit").retryable, true)
  assert.equal(githubNetworkFailure("reading a branch").revoked, false)
})

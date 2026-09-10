import test from "node:test"
import assert from "node:assert/strict"
import { normalizeGithubBasePath } from "../lib/github-path.ts"

test("base folder accepts a path while normalizing only when it is saved", () => {
  assert.deepEqual(normalizeGithubBasePath("/Solutions/medium/"), {
    value: "Solutions/medium",
    error: null
  })
  assert.deepEqual(normalizeGithubBasePath("//Solutions//medium//"), {
    value: "Solutions/medium",
    error: null
  })
})

test("base folder rejects traversal segments", () => {
  assert.match(normalizeGithubBasePath("Solutions/../private").error, /cannot contain/i)
  assert.match(normalizeGithubBasePath("Solutions/./private").error, /cannot contain/i)
})

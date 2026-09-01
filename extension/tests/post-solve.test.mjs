import test from "node:test"
import assert from "node:assert/strict"
import {
  POST_SOLVE_HELP_TYPES,
  matchesPostSolveSubmission,
  normalizePostSolveHelpType,
  postSolveReportStorageKey
} from "../lib/post-solve.ts"

test("post-solve accepts every supported help method and rejects unknown values", () => {
  assert.deepEqual([...POST_SOLVE_HELP_TYPES], ["NONE", "HINT", "EDITORIAL", "EXTERNAL"])
  for (const helpType of POST_SOLVE_HELP_TYPES) {
    assert.equal(normalizePostSolveHelpType(helpType), helpType)
  }
  assert.equal(normalizePostSolveHelpType("PENDING_SELF_REPORT"), null)
  assert.equal(normalizePostSolveHelpType(undefined), null)
})

test("post-solve report keys are stable across service-worker restarts", () => {
  assert.equal(
    postSolveReportStorageKey("minimum-moves-to-clean-the-classroom"),
    "algovault.postSolveReport.minimum-moves-to-clean-the-classroom"
  )
})

test("a later accepted submission cannot inherit an earlier report for the same problem", () => {
  const report = { titleSlug: "two-sum", helpType: "HINT", selectedAt: 1, submissionId: "100" }
  assert.equal(matchesPostSolveSubmission(report, "100"), true)
  assert.equal(matchesPostSolveSubmission(report, "101"), false)
})

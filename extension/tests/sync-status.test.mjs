import test from "node:test"
import assert from "node:assert/strict"
import { normalizeSyncStatusForDisplay } from "../lib/sync-status.ts"

test("legacy disconnected sync status is not shown as disconnected when GitHub is saved", () => {
  const result = normalizeSyncStatusForDisplay(
    { status: "ERROR", message: "Connect GitHub in Settings before using cloud features." },
    true
  )
  assert.match(result.message, /GitHub is connected/i)
  assert.match(result.message, /retry sync/i)
})

test("legacy sync status remains actionable when no GitHub credential is saved", () => {
  const result = normalizeSyncStatusForDisplay(
    { status: "ERROR", message: "Connect GitHub in Settings before using cloud features." },
    false
  )
  assert.equal(result.message, "Connect GitHub in Settings before using cloud features.")
})

test("malformed stored sync status is ignored", () => {
  assert.equal(normalizeSyncStatusForDisplay("not json", true), null)
})

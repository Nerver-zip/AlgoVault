export interface StoredSyncStatus {
  status?: string
  message?: string
  [key: string]: unknown
}

const LEGACY_GITHUB_MESSAGES = [
  /connect github in settings/i,
  /github token was revoked or expired/i
]

export function normalizeSyncStatusForDisplay(
  raw: unknown,
  hasSavedGithubCredential: boolean
): StoredSyncStatus | null {
  let status = raw
  if (typeof status === "string") {
    try {
      status = JSON.parse(status)
    } catch {
      return null
    }
  }
  if (!status || typeof status !== "object") return null

  const parsed = status as StoredSyncStatus
  if (
    hasSavedGithubCredential &&
    parsed.status === "ERROR" &&
    typeof parsed.message === "string" &&
    LEGACY_GITHUB_MESSAGES.some((pattern) => pattern.test(parsed.message!))
  ) {
    return {
      ...parsed,
      message: "GitHub is connected; retry sync to refresh this older error with the current diagnosis."
    }
  }
  return parsed
}

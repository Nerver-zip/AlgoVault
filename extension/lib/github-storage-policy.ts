// Authentication state is disposable. The repository destination is not.
export const GITHUB_AUTH_KEYS_TO_CLEAR = [
  "algovault.github.pat",
  "algovault.github.user",
  "algovault.gitSyncStatus"
] as const

export const GITHUB_DESTINATION_KEYS_TO_PRESERVE = [
  "algovault.github.repo",
  "algovault.github.branch",
  "algovault.github.basePath"
] as const

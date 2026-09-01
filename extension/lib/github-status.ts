export type GithubFailureKind =
  | "TOKEN_INVALID"
  | "RATE_LIMITED"
  | "PERMISSION_DENIED"
  | "RESOURCE_NOT_FOUND"
  | "CONFLICT"
  | "INVALID_REQUEST"
  | "SERVICE_UNAVAILABLE"
  | "API_ERROR"
  | "NETWORK_ERROR"

export interface GithubFailure {
  kind: GithubFailureKind
  status?: number
  revoked: boolean
  retryable: boolean
  message: string
}

export function normalizeGithubCredential(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).trim()
    : trimmed
}

function headerValue(headers: Headers | Record<string, string> | undefined, name: string): string {
  if (!headers) return ""
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name) || ""
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return entry?.[1] || ""
}

function responseMessage(body: unknown): string {
  if (typeof body !== "string" || !body.trim()) return ""
  try {
    const parsed = JSON.parse(body)
    return typeof parsed?.message === "string" ? parsed.message.slice(0, 160) : ""
  } catch {
    return ""
  }
}

export function classifyGithubHttpFailure(
  status: number,
  context: "profile" | "repositories" | "repository" | "branch" | "file" | "commit" | "tree" | "merge",
  headers?: Headers | Record<string, string>,
  body?: unknown
): GithubFailure {
  const apiMessage = responseMessage(body).toLowerCase()
  const rateLimited = status === 429
    || headerValue(headers, "x-ratelimit-remaining") === "0"
    || /rate limit|secondary rate limit|abuse detection/.test(apiMessage)

  if (status === 401) {
    return {
      kind: "TOKEN_INVALID",
      status,
      revoked: true,
      retryable: false,
      message: "GitHub rejected the saved credential (HTTP 401). Reconnect GitHub only if validation in Settings also fails."
    }
  }
  if (rateLimited) {
    return {
      kind: "RATE_LIMITED",
      status,
      revoked: false,
      retryable: true,
      message: "GitHub rate limit reached. Wait and retry; the saved connection was not cleared."
    }
  }
  if (status === 403) {
    return {
      kind: "PERMISSION_DENIED",
      status,
      revoked: false,
      retryable: false,
      message: context === "profile" || context === "repositories"
        ? "GitHub denied this API request. The connection remains saved; check token scopes or organization policy."
        : "GitHub denied access to the configured repository or branch. Check Contents write permission and branch protection."
    }
  }
  if (status === 404) {
    return {
      kind: "RESOURCE_NOT_FOUND",
      status,
      revoked: false,
      retryable: false,
      message: context === "profile" || context === "repositories"
        ? "GitHub did not find the requested API resource. The saved connection was not cleared."
        : "GitHub could not find the configured repository, branch, or file. Check the target settings."
    }
  }
  if (status === 409) {
    return {
      kind: "CONFLICT",
      status,
      revoked: false,
      retryable: true,
      message: "GitHub reported a repository conflict. The export can be retried safely."
    }
  }
  if (status === 422) {
    return {
      kind: "INVALID_REQUEST",
      status,
      revoked: false,
      retryable: false,
      message: "GitHub rejected the export data or branch update (HTTP 422). Check the repository and branch settings."
    }
  }
  if (status >= 500) {
    return {
      kind: "SERVICE_UNAVAILABLE",
      status,
      revoked: false,
      retryable: true,
      message: "GitHub is temporarily unavailable. The saved connection was not cleared; retry later."
    }
  }
  return {
    kind: "API_ERROR",
    status,
    revoked: false,
    retryable: false,
    message: `GitHub API request failed (HTTP ${status}). The saved connection was not cleared.`
  }
}

export function githubNetworkFailure(context: string): GithubFailure {
  return {
    kind: "NETWORK_ERROR",
    revoked: false,
    retryable: true,
    message: `Could not reach GitHub while ${context}. The saved connection was not cleared; retry when the network is available.`
  }
}

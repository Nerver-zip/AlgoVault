export type BackendAuthFailureKind =
  | "GITHUB_NOT_CONNECTED"
  | "GITHUB_TOKEN_REJECTED"
  | "CLOUD_SESSION_UNAVAILABLE"
  | "CLOUD_SESSION_EXPIRED"

export class BackendAuthError extends Error {
  public readonly kind: BackendAuthFailureKind

  constructor(
    kind: BackendAuthFailureKind,
    message: string
  ) {
    super(message)
    this.kind = kind
    this.name = "BackendAuthError"
  }
}

export function backendAuthMessage(kind: BackendAuthFailureKind): string {
  switch (kind) {
    case "GITHUB_NOT_CONNECTED":
      return "GitHub is not connected. Connect your account in Settings before using cloud features."
    case "GITHUB_TOKEN_REJECTED":
      return "GitHub rejected the saved credential. Validate GitHub in Settings before reconnecting."
    case "CLOUD_SESSION_EXPIRED":
      return "The AlgoVault cloud session expired, but the GitHub connection is still saved. Reconnect the cloud session in Settings."
    case "CLOUD_SESSION_UNAVAILABLE":
      return "GitHub is connected, but the AlgoVault cloud session could not be refreshed. Check that the backend is reachable and retry."
  }
}

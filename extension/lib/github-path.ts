export const DEFAULT_GITHUB_BASE_PATH = "leetcode"

export interface GithubBasePathResult {
  value: string
  error: string | null
}

export function normalizeGithubBasePath(input?: string | null): GithubBasePathResult {
  const normalized = (input ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "")

  const value = normalized || DEFAULT_GITHUB_BASE_PATH
  if (value.length > 240) {
    return { value, error: "Base folder must be 240 characters or fewer." }
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return { value, error: "Base folder cannot contain control characters." }
  }

  const segments = value.split("/")
  if (segments.some((segment) => segment.trim() === "." || segment.trim() === "..")) {
    return { value, error: "Base folder cannot contain '.' or '..' path segments." }
  }
  if (segments.some((segment) => !segment.trim())) {
    return { value, error: "Base folder contains an empty path segment." }
  }

  return { value, error: null }
}

export function requireGithubBasePath(input?: string | null): string {
  const result = normalizeGithubBasePath(input)
  if (result.error) throw new Error(result.error)
  return result.value
}

export function joinGithubPath(basePath: string, ...segments: string[]): string {
  const base = requireGithubBasePath(basePath)
  return [base, ...segments.map((segment) => segment.replace(/^\/+|\/+$/g, ""))]
    .filter(Boolean)
    .join("/")
}

export function encodeGithubContentPath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/")
}

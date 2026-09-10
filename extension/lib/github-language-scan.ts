import { compareSubmissionVersion, githubSolutionKey, resolveGithubLanguage } from "./github-language"

export const GITHUB_LANGUAGE_SCAN_SCHEMA_VERSION = 1 as const

export interface LanguageScanCandidate {
  id: string
  title?: string
  titleSlug: string
  statusDisplay: "Accepted"
  lang: string
  timestamp: number
  runtime?: string
  memory?: string
}

export interface ProblemLanguageScanCheckpoint {
  offset: number
  lastKey: string | null
  complete: boolean
  candidates: Record<string, LanguageScanCandidate>
  pendingUnknown: Record<string, any>
}

export interface GithubLanguageScanState {
  schemaVersion: typeof GITHUB_LANGUAGE_SCAN_SCHEMA_VERSION
  targets: Record<string, Record<string, ProblemLanguageScanCheckpoint>>
}

export function emptyGithubLanguageScanState(): GithubLanguageScanState {
  return { schemaVersion: GITHUB_LANGUAGE_SCAN_SCHEMA_VERSION, targets: {} }
}

export function normalizeGithubLanguageScanState(value: unknown): GithubLanguageScanState {
  const candidate = value as Partial<GithubLanguageScanState> | null
  if (candidate?.schemaVersion !== GITHUB_LANGUAGE_SCAN_SCHEMA_VERSION || !candidate.targets) {
    return emptyGithubLanguageScanState()
  }
  return candidate as GithubLanguageScanState
}

export function newProblemLanguageScanCheckpoint(): ProblemLanguageScanCheckpoint {
  return { offset: 0, lastKey: null, complete: false, candidates: {}, pendingUnknown: {} }
}

export function mergeAcceptedScanPage(
  checkpoint: ProblemLanguageScanCheckpoint,
  titleSlug: string,
  submissions: any[],
  hasNext: boolean,
  lastKey: string | null
) {
  const next: ProblemLanguageScanCheckpoint = {
    offset: checkpoint.offset + submissions.length,
    lastKey,
    complete: !hasNext,
    candidates: { ...checkpoint.candidates },
    pendingUnknown: { ...(checkpoint.pendingUnknown || {}) }
  }
  for (const submission of submissions) {
    const accepted = submission?.statusDisplay === "Accepted" || Number(submission?.status) === 10
    const language = resolveGithubLanguage(submission?.lang)
    if (!accepted) continue
    const submissionId = String(submission.id || submission.submissionId || "")
    if (!language) {
      if (submissionId) next.pendingUnknown[submissionId] = { ...submission, titleSlug }
      continue
    }
    delete next.pendingUnknown[submissionId]
    const key = githubSolutionKey(titleSlug, language.id)
    const candidate: LanguageScanCandidate = {
      id: submissionId,
      title: submission.title,
      titleSlug,
      statusDisplay: "Accepted",
      lang: String(submission.lang),
      timestamp: Number(submission.timestamp) || 0,
      runtime: submission.runtime,
      memory: submission.memory
    }
    const previous = next.candidates[key]
    if (!previous || compareSubmissionVersion(
      { timestamp: previous.timestamp, submissionId: previous.id },
      { timestamp: candidate.timestamp, submissionId: candidate.id }
    ) < 0) next.candidates[key] = candidate
  }
  return next
}

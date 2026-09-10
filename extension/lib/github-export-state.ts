import { compareSubmissionVersion, githubSolutionKey } from "./github-language"

export const GITHUB_EXPORT_SCHEMA_VERSION = 2 as const

export interface GithubExportRecordV2 {
  titleSlug: string
  languageId: string
  originalLanguage: string
  submissionId: string | null
  timestamp: number
  path: string
  schemaVersion: typeof GITHUB_EXPORT_SCHEMA_VERSION
}

export interface GithubExportIndexV2 {
  schemaVersion: typeof GITHUB_EXPORT_SCHEMA_VERSION
  targets: Record<string, Record<string, GithubExportRecordV2>>
}

export function emptyGithubExportIndex(): GithubExportIndexV2 {
  return { schemaVersion: GITHUB_EXPORT_SCHEMA_VERSION, targets: {} }
}

export function githubExportTarget(repo: string, branch: string | undefined, basePath: string) {
  return `${repo.trim().toLowerCase()}|${branch || "default"}|${basePath}`
}

export function normalizeGithubExportIndex(value: unknown): GithubExportIndexV2 {
  const candidate = value as Partial<GithubExportIndexV2> | null
  if (candidate?.schemaVersion !== GITHUB_EXPORT_SCHEMA_VERSION || !candidate.targets) {
    return emptyGithubExportIndex()
  }
  return candidate as GithubExportIndexV2
}

export function exportRecordKey(record: Pick<GithubExportRecordV2, "titleSlug" | "languageId">) {
  return githubSolutionKey(record.titleSlug, record.languageId)
}

export function shouldExportRecord(previous: GithubExportRecordV2 | undefined, candidate: GithubExportRecordV2) {
  return !previous || compareSubmissionVersion(previous, candidate) < 0
}

export function applyCommittedRecords(
  current: Record<string, GithubExportRecordV2>,
  candidates: GithubExportRecordV2[],
  commitSucceeded: boolean
) {
  if (!commitSucceeded) return current
  const next = { ...current }
  for (const candidate of candidates) {
    const key = exportRecordKey(candidate)
    if (shouldExportRecord(next[key], candidate)) next[key] = candidate
  }
  return next
}

export function summarizeGithubExports(records: Record<string, GithubExportRecordV2>) {
  const problems = new Set<string>()
  const byLanguage: Record<string, number> = {}
  for (const record of Object.values(records)) {
    problems.add(record.titleSlug)
    byLanguage[record.languageId] = (byLanguage[record.languageId] || 0) + 1
  }
  return {
    problemCount: problems.size,
    solutionCount: Object.keys(records).length,
    byLanguage
  }
}

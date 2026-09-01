export const POST_SOLVE_HELP_TYPES = ["NONE", "HINT", "EDITORIAL", "EXTERNAL"] as const

export type PostSolveHelpType = typeof POST_SOLVE_HELP_TYPES[number]

export interface PostSolveReport {
  titleSlug: string
  helpType: PostSolveHelpType
  selectedAt: number
  submissionId?: string
}

export function normalizePostSolveHelpType(value: unknown): PostSolveHelpType | null {
  return typeof value === "string" && (POST_SOLVE_HELP_TYPES as readonly string[]).includes(value)
    ? value as PostSolveHelpType
    : null
}

export function postSolveReportStorageKey(titleSlug: string): string {
  return `algovault.postSolveReport.${titleSlug}`
}

export function matchesPostSolveSubmission(report: PostSolveReport, submissionId?: string): boolean {
  return !submissionId || report.submissionId === submissionId
}

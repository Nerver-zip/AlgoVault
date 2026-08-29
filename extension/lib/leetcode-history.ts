export const SOLVED_PROBLEM_CACHE_SOURCE = "userProgressQuestionList-v1"

export function acceptedProblemCount(matchedUser: any): number | null {
  const entries = matchedUser?.submitStatsGlobal?.acSubmissionNum
    || matchedUser?.submitStats?.acSubmissionNum
  if (!Array.isArray(entries)) return null
  const all = entries.find((entry: any) => entry?.difficulty === "All")
  const count = Number(all?.count)
  return Number.isFinite(count) && count >= 0 ? count : null
}

export function requireCompleteSolvedProblemList(problems: any[], expectedCount: number | null) {
  const uniqueProblems = Array.from(new Map(
    problems
      .filter((problem: any) => problem?.titleSlug)
      .map((problem: any) => [problem.titleSlug, problem])
  ).values())
  if (expectedCount != null && uniqueProblems.length < expectedCount) {
    throw new Error(
      `LeetCode returned only ${uniqueProblems.length} of ${expectedCount} solved problems. The sync was not marked complete; retry after refreshing LeetCode.com.`
    )
  }
  return uniqueProblems
}

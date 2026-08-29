export interface GithubExportRecordLike {
  path?: string
}

export function findProblemsMissingFromGithub(
  problems: any[],
  exportedForTarget: Record<string, GithubExportRecordLike>,
  remoteTreePaths: string[]
) {
  const remotePaths = new Set(remoteTreePaths)
  const remoteSolutionFolders = new Set(
    remoteTreePaths
      .filter((path) => /\/solution\.[^/]+$/.test(path))
      .map((path) => path.replace(/\/solution\.[^/]+$/, ""))
  )
  return Array.from(new Map(
    problems
      .filter((problem: any) => {
        if (!problem?.titleSlug) return false
        const record = exportedForTarget[problem.titleSlug]
        if (!record?.path) return true
        return !remotePaths.has(`${record.path}/metadata.json`) || !remoteSolutionFolders.has(record.path)
      })
      .map((problem: any) => [problem.titleSlug, problem])
  ).values())
}

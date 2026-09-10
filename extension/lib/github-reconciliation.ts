export interface GithubExportRecordLike {
  path?: string
}

export function hasCompleteGithubArtifactSet(record: GithubExportRecordLike, remoteTreePaths: string[]) {
  if (!record.path) return false
  const remotePaths = new Set(remoteTreePaths)
  return remotePaths.has(`${record.path}/README.md`)
    && remotePaths.has(`${record.path}/metadata.json`)
    && remoteTreePaths.some((path) => path.startsWith(`${record.path}/solution.`))
}

export function findGithubOnlySolutionFolders(
  basePath: string,
  remoteTreePaths: string[],
  indexedRecords: Record<string, GithubExportRecordLike>
) {
  const indexedFolders = new Set(Object.values(indexedRecords).map((record) => record.path).filter(Boolean))
  const prefix = `${basePath}/`
  return Array.from(new Set(
    remoteTreePaths
      .filter((path) => path.startsWith(prefix) && /\/solution\.[^/]+$/.test(path))
      .map((path) => path.replace(/\/solution\.[^/]+$/, ""))
      .filter((folder) => !indexedFolders.has(folder))
  )).sort()
}

export const DEFAULT_GITHUB_BATCH_MAX_SOLUTIONS = 100
export const DEFAULT_GITHUB_BATCH_MAX_BYTES = 4 * 1024 * 1024

interface GithubBatchWrite {
  path: string
  content: string
}

export function estimateGithubTreeBytes(writes: GithubBatchWrite[]): number {
  const tree = writes.map((write) => ({
    path: write.path,
    mode: "100644",
    type: "blob",
    content: write.content
  }))
  return new TextEncoder().encode(JSON.stringify({
    base_tree: "0".repeat(40),
    tree
  })).byteLength
}

export function partitionGithubArtifacts<T>(
  artifacts: T[],
  getWrites: (artifact: T) => GithubBatchWrite[],
  maxSolutions = DEFAULT_GITHUB_BATCH_MAX_SOLUTIONS,
  maxBytes = DEFAULT_GITHUB_BATCH_MAX_BYTES
): T[][] {
  if (maxSolutions < 1 || maxBytes < 1) throw new Error("GitHub batch limits must be positive")

  const batches: T[][] = []
  let current: T[] = []
  let currentBytes = 0

  for (const artifact of artifacts) {
    const artifactBytes = estimateGithubTreeBytes(getWrites(artifact))
    const exceedsCount = current.length >= maxSolutions
    const exceedsBytes = current.length > 0 && currentBytes + artifactBytes > maxBytes
    if (exceedsCount || exceedsBytes) {
      batches.push(current)
      current = []
      currentBytes = 0
    }
    current.push(artifact)
    currentBytes += artifactBytes
  }

  if (current.length) batches.push(current)
  return batches
}

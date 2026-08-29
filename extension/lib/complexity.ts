export type ComplexitySource = "declared" | "heuristic" | "unavailable"
export type ComplexityConfidence = "declared" | "low" | "unknown"

export interface ComplexityAnalysis {
  time: string
  space: string
  source: ComplexitySource
  confidence: ComplexityConfidence
  explanation: string
}

function declaredComplexity(code: string, kind: "time" | "space") {
  const labels = kind === "time"
    ? "(?:time|tempo)(?:\\s+(?:complexity|complexidade))?"
    : "(?:space|memory|espa[cç]o)(?:\\s+(?:complexity|complexidade))?"
  const match = code.match(new RegExp(`${labels}\\s*[:=\\-]\\s*(O\\s*\\([^\\r\\n]+?\\))`, "i"))
  return match?.[1]?.replace(/\s+/g, " ") ?? null
}

function stripStringsAndComments(code: string) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/#.*$/gm, " ")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "")
}

function estimateLoopDepth(code: string) {
  const lines = code.split(/\r?\n/)
  let braceDepth = 0
  let maxDepth = 0
  const activeBraceLoops: number[] = []
  const pythonIndents: number[] = []
  let sawLoop = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const leadingClosers = trimmed.match(/^}+/)?.[0].length ?? 0
    braceDepth = Math.max(0, braceDepth - leadingClosers)
    while (activeBraceLoops.length && activeBraceLoops[activeBraceLoops.length - 1] > braceDepth) {
      activeBraceLoops.pop()
    }

    const indent = line.match(/^\s*/)?.[0].replace(/\t/g, "    ").length ?? 0
    while (pythonIndents.length && indent <= pythonIndents[pythonIndents.length - 1]) pythonIndents.pop()

    const isLoop = /\b(?:for|while)\s*(?:\(|\b)/.test(trimmed)
    if (isLoop) {
      sawLoop = true
      if (/^(?:for|while)\b.*:\s*$/.test(trimmed)) pythonIndents.push(indent)
      if (trimmed.includes("{")) activeBraceLoops.push(braceDepth + 1)
      maxDepth = Math.max(maxDepth, activeBraceLoops.length, pythonIndents.length)
    }

    const opens = (trimmed.match(/{/g) || []).length
    const closes = (trimmed.slice(leadingClosers).match(/}/g) || []).length
    braceDepth = Math.max(0, braceDepth + opens - closes)
  }

  return sawLoop ? Math.max(1, maxDepth) : 0
}

function polynomialComplexity(depth: number) {
  if (depth <= 0) return "O(1)"
  if (depth === 1) return "O(n)"
  if (depth === 2) return "O(n²)"
  if (depth === 3) return "O(n³)"
  return `O(n^${depth})`
}

export function analyzeComplexity(code?: string, language?: string): ComplexityAnalysis {
  if (!code?.trim()) {
    return {
      time: "Unknown",
      space: "Unknown",
      source: "unavailable",
      confidence: "unknown",
      explanation: "Source code was not available for complexity analysis."
    }
  }

  const declaredTime = declaredComplexity(code, "time")
  const declaredSpace = declaredComplexity(code, "space")
  if (declaredTime || declaredSpace) {
    return {
      time: declaredTime || "Not declared",
      space: declaredSpace || "Not declared",
      source: "declared",
      confidence: "declared",
      explanation: "Read from complexity annotations in the submitted source; not independently verified."
    }
  }

  const source = stripStringsAndComments(code)
  const loopDepth = estimateLoopDepth(source)
  const hasSort = /\b(?:sort|sorted)\s*\(|\.sort\s*\(/.test(source)
  const hasLogLoop = /(?:\*|\/)\s*=\s*2\b|(?:<<|>>)\s*=\s*1\b|\bmid\s*=/.test(source)
  const hasLinearAllocation = /\b(?:new\s+Array|Array|vector|Vec|list|dict|set|Map|Set|HashMap|HashSet)\b/.test(source)

  let time = polynomialComplexity(loopDepth)
  if (hasSort && loopDepth <= 1) time = "O(n log n)"
  else if (hasLogLoop && loopDepth === 1) time = "O(log n)"

  return {
    time,
    space: hasLinearAllocation ? "O(n)" : "O(1)",
    source: "heuristic",
    confidence: "low",
    explanation: `Conservative static estimate from ${language || "source"} control flow and allocations; review before relying on it.`
  }
}

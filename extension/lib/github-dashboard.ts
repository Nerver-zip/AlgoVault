import { requireGithubBasePath } from "./github-path"

export const ALGOVAULT_FORK_URL = "https://github.com/Nerver-zip/AlgoVault"
export const ALGOVAULT_UPSTREAM_URL = "https://github.com/Somnath0707/AlgoVault"

interface DashboardOptions {
  basePath: string
  archivedProblemCount: number
  archivedSolutionCount: number
  languageCounts?: Record<string, number>
  username?: string
}

function countDifficulty(problems: any[], difficulty: string) {
  return problems.filter((problem) => String(problem?.difficulty || "").toUpperCase() === difficulty).length
}

function progressBar(count: number, total: number, width = 20) {
  const filled = total > 0 ? Math.round((count / total) * width) : 0
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`
}

function latestAcceptedDate(problems: any[]) {
  const timestamps = problems
    .map((problem) => Date.parse(problem?.lastSubmittedAt || ""))
    .filter((timestamp) => Number.isFinite(timestamp))
  if (!timestamps.length) return "Not available"
  return new Date(Math.max(...timestamps)).toISOString().slice(0, 10)
}

function badge(label: string, value: string | number, color: string) {
  return `![${label}](https://img.shields.io/badge/${encodeURIComponent(label)}-${encodeURIComponent(String(value))}-${color}?style=for-the-badge)`
}

export function buildGithubDashboardReadme(problems: any[], options: DashboardOptions) {
  const uniqueProblems = Array.from(new Map(
    problems
      .filter((problem) => problem?.titleSlug)
      .map((problem) => [problem.titleSlug, problem])
  ).values()) as any[]
  const total = uniqueProblems.length
  const easy = countDifficulty(uniqueProblems, "EASY")
  const medium = countDifficulty(uniqueProblems, "MEDIUM")
  const hard = countDifficulty(uniqueProblems, "HARD")
  const archivedProblems = Math.min(Math.max(0, options.archivedProblemCount), total)
  const archivedSolutions = Math.max(0, options.archivedSolutionCount)
  const basePath = requireGithubBasePath(options.basePath)
  const browsePath = basePath.split("/").map(encodeURIComponent).join("/")
  const profileUrl = options.username
    ? `https://leetcode.com/u/${encodeURIComponent(options.username)}/`
    : "https://leetcode.com/"
  const latest = latestAcceptedDate(uniqueProblems)
  const languageRows = Object.entries(options.languageCounts || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([language, count]) => {
      const encodedLanguage = encodeURIComponent(language)
      const links = ["easy", "medium", "hard"]
        .map((difficulty) => `[${difficulty}](./${browsePath}/${difficulty}/${encodedLanguage}/)`)
        .join(" · ")
      return `| ${language} | **${count}** | ${links} |`
    })
    .join("\n") || "| No exported languages yet | **0** | — |"

  return `<div align="center">

# AlgoVault LeetCode Archive

### A living, searchable record of accepted solutions

${badge("Solved on LeetCode", total, "22c55e")}
${badge("Archived problems", archivedProblems, "3b82f6")}
${badge("Language solutions", archivedSolutions, "8b5cf6")}
${badge("Auto Sync", "AlgoVault", "d97706")}

_Source code, problem notes, measured runtime and memory, and estimated Big-O — organized automatically._

[Browse solutions](./${browsePath}/) · [LeetCode profile](${profileUrl}) · [AlgoVault fork](${ALGOVAULT_FORK_URL})

</div>

---

## Progress dashboard

| Difficulty | Solved | Distribution |
|:--|--:|:--|
| 🟢 Easy | **${easy}** | \`${progressBar(easy, total)}\` |
| 🟡 Medium | **${medium}** | \`${progressBar(medium, total)}\` |
| 🔴 Hard | **${hard}** | \`${progressBar(hard, total)}\` |
| **Total** | **${total}** | Last accepted activity: **${latest}** |

## Archive coverage

| Language | Accepted solutions | Browse by difficulty |
|:--|--:|:--|
${languageRows}

**${archivedProblems} unique problem${archivedProblems === 1 ? "" : "s"}** and **${archivedSolutions} language-specific solution${archivedSolutions === 1 ? "" : "s"}** are archived. A problem solved in two languages counts once as a problem and twice as a solution.

## What is inside

Every archived problem has its own directory under [\`${basePath}/\`](./${browsePath}/):

\`\`\`text
${basePath}/
├── easy/
├── medium/
└── hard/
    └── <language>/
        └── <problem-id>-<problem-slug>/
            ├── solution.<extension>
            ├── README.md
            └── metadata.json
\`\`\`

Each entry includes:

- the newest accepted source code for that problem and language;
- the problem statement and direct LeetCode link;
- runtime and memory measured by LeetCode;
- an estimated time and space complexity summary;
- structured metadata for tooling and future analysis.

## Powered by AlgoVault

This repository is maintained automatically by [**Nerver-zip/AlgoVault**](${ALGOVAULT_FORK_URL}), a fork of the [original AlgoVault project](${ALGOVAULT_UPSTREAM_URL}).

AlgoVault turns competitive-programming activity into a personal knowledge vault: it synchronizes history, stores accepted solutions, tracks learning signals, and keeps this archive current in safe GitHub batches.

> This dashboard is generated by AlgoVault. Manual edits to this file may be replaced during a future synchronization.
`
}

export interface GithubLanguageIdentity {
  id: string
  extension: string
  displayName: string
}

const LANGUAGES: GithubLanguageIdentity[] = [
  { id: "cpp", extension: "cpp", displayName: "C++" },
  { id: "java", extension: "java", displayName: "Java" },
  { id: "javascript", extension: "js", displayName: "JavaScript" },
  { id: "typescript", extension: "ts", displayName: "TypeScript" },
  { id: "python", extension: "py", displayName: "Python" },
  { id: "python3", extension: "py", displayName: "Python3" },
  { id: "c", extension: "c", displayName: "C" },
  { id: "csharp", extension: "cs", displayName: "C#" },
  { id: "go", extension: "go", displayName: "Go" },
  { id: "kotlin", extension: "kt", displayName: "Kotlin" },
  { id: "rust", extension: "rs", displayName: "Rust" },
  { id: "ruby", extension: "rb", displayName: "Ruby" },
  { id: "scala", extension: "scala", displayName: "Scala" },
  { id: "swift", extension: "swift", displayName: "Swift" },
  { id: "php", extension: "php", displayName: "PHP" },
  { id: "bash", extension: "sh", displayName: "Bash" },
  { id: "sql", extension: "sql", displayName: "SQL" },
  { id: "mysql", extension: "sql", displayName: "MySQL" },
  { id: "mssql", extension: "sql", displayName: "Microsoft SQL Server" },
  { id: "oraclesql", extension: "sql", displayName: "Oracle SQL" },
  { id: "postgresql", extension: "sql", displayName: "PostgreSQL" },
  { id: "pandas", extension: "py", displayName: "Pandas" },
  { id: "dart", extension: "dart", displayName: "Dart" },
  { id: "racket", extension: "rkt", displayName: "Racket" },
  { id: "erlang", extension: "erl", displayName: "Erlang" },
  { id: "elixir", extension: "ex", displayName: "Elixir" }
]

const aliases = new Map<string, string>([
  ["cpp", "cpp"], ["c++", "cpp"], ["cplusplus", "cpp"], ["gnu c++", "cpp"], ["gnu++", "cpp"],
  ["java", "java"],
  ["javascript", "javascript"], ["java script", "javascript"], ["js", "javascript"], ["node", "javascript"], ["nodejs", "javascript"], ["node js", "javascript"],
  ["typescript", "typescript"], ["type script", "typescript"], ["ts", "typescript"],
  ["python", "python"], ["python2", "python"], ["python 2", "python"], ["py", "python"],
  ["python3", "python3"], ["python 3", "python3"], ["py3", "python3"],
  ["c", "c"],
  ["c#", "csharp"], ["csharp", "csharp"], ["c sharp", "csharp"],
  ["go", "go"], ["golang", "go"],
  ["kotlin", "kotlin"], ["rust", "rust"], ["ruby", "ruby"], ["scala", "scala"], ["swift", "swift"],
  ["php", "php"], ["bash", "bash"], ["shell", "bash"], ["sh", "bash"],
  ["sql", "sql"], ["mysql", "mysql"], ["mssql", "mssql"], ["microsoft sql server", "mssql"],
  ["oracle", "oraclesql"], ["oraclesql", "oraclesql"], ["oracle sql", "oraclesql"], ["postgresql", "postgresql"], ["postgres sql", "postgresql"],
  ["pandas", "pandas"], ["pythondata", "pandas"], ["python data", "pandas"],
  ["dart", "dart"], ["racket", "racket"], ["erlang", "erlang"], ["elixir", "elixir"]
])

const byId = new Map(LANGUAGES.map((language) => [language.id, language]))

function canonicalLanguageName(value: string) {
  return value.trim().toLowerCase().replace(/[_.-]+/g, " ").replace(/\s+/g, " ")
}

export function resolveGithubLanguage(language?: string | null): GithubLanguageIdentity | null {
  if (!language) return null
  const canonical = canonicalLanguageName(language)
  const direct = aliases.get(canonical)
  if (direct) return byId.get(direct) || null

  // LeetCode occasionally appends a runtime/version label. Match only a known
  // leading token so Java can never be mistaken for JavaScript.
  for (const [alias, id] of Array.from(aliases).sort(([left], [right]) => right.length - left.length)) {
    const suffix = canonical.slice(alias.length)
    if (canonical.startsWith(alias) && (/^\s/.test(suffix) || /^\d/.test(suffix))) return byId.get(id) || null
  }
  return null
}

export function githubSolutionKey(titleSlug: string, languageId: string) {
  return `${titleSlug}::${languageId}`
}

export function compareSubmissionVersion(
  left: { timestamp?: number | string | null; submissionId?: string | number | null },
  right: { timestamp?: number | string | null; submissionId?: string | number | null }
) {
  const leftTimestamp = Number(left.timestamp) || 0
  const rightTimestamp = Number(right.timestamp) || 0
  if (leftTimestamp !== rightTimestamp) return leftTimestamp < rightTimestamp ? -1 : 1

  const normalizeId = (value: string | number | null | undefined) => String(value ?? "0").replace(/^0+/, "") || "0"
  const leftId = normalizeId(left.submissionId)
  const rightId = normalizeId(right.submissionId)
  if (leftId.length !== rightId.length) return leftId.length < rightId.length ? -1 : 1
  return leftId === rightId ? 0 : leftId < rightId ? -1 : 1
}

export function selectLatestAcceptedByLanguage(submissions: any[]) {
  const selected = new Map<string, any>()
  for (const submission of submissions) {
    const accepted = submission?.statusDisplay === "Accepted"
      || submission?.status_display === "Accepted"
      || Number(submission?.status) === 10
    const titleSlug = submission?.titleSlug || submission?.title_slug
    const language = resolveGithubLanguage(submission?.lang || submission?.language || submission?.codeLang)
    if (!accepted || !titleSlug || !language) continue
    const key = githubSolutionKey(titleSlug, language.id)
    const candidate = {
      ...submission,
      titleSlug,
      languageId: language.id,
      originalLanguage: submission?.lang || submission?.language || submission?.codeLang,
      timestamp: Number(submission?.timestamp) || 0,
      submissionId: String(submission?.id || submission?.submissionId || "")
    }
    const previous = selected.get(key)
    if (!previous || compareSubmissionVersion(previous, candidate) < 0) selected.set(key, candidate)
  }
  return selected
}

export const SUPPORTED_GITHUB_LANGUAGES = LANGUAGES

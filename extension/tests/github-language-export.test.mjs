import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"

const bundle = await build({
  stdin: {
    contents: `
      export * from "./lib/github-language.ts";
      export * from "./lib/github-export-state.ts";
      export * from "./lib/github-language-scan.ts";
      export * from "./lib/github-dashboard.ts";
      export * from "./lib/github-reconciliation.ts";
      export * from "./lib/github-artifact-path.ts";
    `,
    resolveDir: new URL("..", import.meta.url).pathname,
    sourcefile: "github-language-test-entry.ts"
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false
})
const bundledModule = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(bundle.outputFiles[0].text)}`)

const {
  compareSubmissionVersion,
  githubSolutionKey,
  resolveGithubLanguage,
  selectLatestAcceptedByLanguage,
  applyCommittedRecords,
  emptyGithubExportIndex,
  normalizeGithubExportIndex,
  shouldExportRecord,
  summarizeGithubExports,
  githubExportTarget,
  mergeAcceptedScanPage,
  newProblemLanguageScanCheckpoint,
  normalizeGithubLanguageScanState,
  buildGithubDashboardReadme,
  findGithubOnlySolutionFolders,
  hasCompleteGithubArtifactSet,
  githubProblemFolder
} = bundledModule

function accepted(id, lang, timestamp, slug = "two-sum") {
  return { id: String(id), titleSlug: slug, title_slug: slug, statusDisplay: "Accepted", status_display: "Accepted", lang, timestamp }
}

function record(slug, languageId, timestamp, submissionId = String(timestamp)) {
  return {
    schemaVersion: 2,
    titleSlug: slug,
    languageId,
    originalLanguage: languageId,
    submissionId,
    timestamp,
    path: `Solutions/easy/${languageId}/1-${slug}`
  }
}

test("central language aliases collapse safely without conflating Java and JavaScript", () => {
  assert.equal(resolveGithubLanguage("C++")?.id, "cpp")
  assert.equal(resolveGithubLanguage("GNU C++17")?.id, "cpp")
  assert.equal(resolveGithubLanguage("Java")?.id, "java")
  assert.equal(resolveGithubLanguage("JavaScript")?.id, "javascript")
  assert.equal(resolveGithubLanguage("Node.js")?.id, "javascript")
  assert.equal(resolveGithubLanguage("Python3.11")?.id, "python3")
  assert.equal(resolveGithubLanguage("MySQL")?.id, "mysql")
  assert.equal(resolveGithubLanguage("PostgreSQL")?.id, "postgresql")
})

test("Python and Python3 coexist as independent solution identities", () => {
  const selected = selectLatestAcceptedByLanguage([
    accepted(10, "Python", 10),
    accepted(11, "Python3", 11)
  ])
  assert.deepEqual([...selected.keys()].sort(), ["two-sum::python", "two-sum::python3"])
})

test("same problem in two languages is selected independently", () => {
  const selected = selectLatestAcceptedByLanguage([
    accepted(20, "C++", 20),
    accepted(21, "Java", 21)
  ])
  assert.equal(selected.size, 2)
  assert.equal(selected.get("two-sum::cpp").submissionId, "20")
  assert.equal(selected.get("two-sum::java").submissionId, "21")
  assert.equal(selectLatestAcceptedByLanguage([{ ...accepted(22, "Java", 22), statusDisplay: "Wrong Answer", status_display: "Wrong Answer" }]).size, 0)
})

test("artifact hierarchy is difficulty then language then problem", () => {
  assert.equal(githubProblemFolder("Solutions", "Medium", "python3", "two-sum", "1"), "Solutions/medium/python3/1-two-sum")
  assert.notEqual(
    githubProblemFolder("Solutions", "Medium", "cpp", "two-sum", "1"),
    githubProblemFolder("Solutions", "Medium", "python3", "two-sum", "1")
  )
})

test("two accepted browser events for one problem produce two collision-free three-file artifacts", () => {
  const selected = selectLatestAcceptedByLanguage([
    accepted(101, "C++", 101),
    accepted(102, "Python3", 102)
  ])
  const paths = []
  for (const submission of selected.values()) {
    const language = resolveGithubLanguage(submission.originalLanguage)
    const folder = githubProblemFolder("Solutions", "Medium", language.id, submission.titleSlug, "1")
    paths.push(`${folder}/solution.${language.extension}`, `${folder}/README.md`, `${folder}/metadata.json`)
  }
  assert.equal(paths.length, 6)
  assert.equal(new Set(paths).size, 6)
  assert.equal(paths.some((path) => path.includes("/cpp/1-two-sum/")), true)
  assert.equal(paths.some((path) => path.includes("/python3/1-two-sum/")), true)
})

test("newest accepted submission wins only within the same language", () => {
  const selected = selectLatestAcceptedByLanguage([
    accepted(30, "Python3", 30),
    accepted(10, "Python 3", 10),
    accepted(25, "Java", 25)
  ])
  assert.equal(selected.get("two-sum::python3").submissionId, "30")
  assert.equal(selected.get("two-sum::java").submissionId, "25")
  assert.equal(compareSubmissionVersion({ timestamp: 30, submissionId: "30" }, { timestamp: 30, submissionId: "31" }), -1)
})

test("older history never replaces a newer language record and repeated sync is idempotent", () => {
  const newer = record("two-sum", "cpp", 100, "1000")
  const older = record("two-sum", "cpp", 99, "999")
  assert.equal(shouldExportRecord(newer, older), false)
  assert.equal(shouldExportRecord(newer, newer), false)
  const afterOlder = applyCommittedRecords({}, [older], true)
  const afterNewerDiscovery = applyCommittedRecords(afterOlder, [newer], true)
  assert.equal(afterNewerDiscovery["two-sum::cpp"].timestamp, 100)
})

test("language discovery continues across pages and keeps one newest AC per language", () => {
  let checkpoint = newProblemLanguageScanCheckpoint()
  checkpoint = mergeAcceptedScanPage(checkpoint, "two-sum", [accepted(50, "C++", 50)], true, "page-2")
  assert.equal(checkpoint.complete, false)
  checkpoint = mergeAcceptedScanPage(checkpoint, "two-sum", [accepted(40, "Python3", 40), accepted(30, "C++", 30)], false, null)
  assert.equal(checkpoint.complete, true)
  assert.deepEqual(Object.keys(checkpoint.candidates).sort(), ["two-sum::cpp", "two-sum::python3"])
  assert.equal(checkpoint.candidates["two-sum::cpp"].id, "50")
})

test("serialized scan checkpoint resumes from the persisted cursor", () => {
  const state = normalizeGithubLanguageScanState(null)
  state.targets.target = {
    "two-sum": mergeAcceptedScanPage(newProblemLanguageScanCheckpoint(), "two-sum", [accepted(1, "Java", 1)], true, "cursor")
  }
  const restored = normalizeGithubLanguageScanState(JSON.parse(JSON.stringify(state)))
  assert.equal(restored.targets.target["two-sum"].offset, 1)
  assert.equal(restored.targets.target["two-sum"].lastKey, "cursor")
  assert.equal(restored.targets.target["two-sum"].complete, false)
})

test("unknown accepted languages remain pending instead of using a generic folder", () => {
  const checkpoint = mergeAcceptedScanPage(newProblemLanguageScanCheckpoint(), "two-sum", [accepted(1, "UnknownLang", 1)], false, null)
  assert.equal(Object.keys(checkpoint.candidates).length, 0)
  assert.deepEqual(Object.keys(checkpoint.pendingUnknown), ["1"])
})

test("legacy problem-only index cannot block the versioned language index", () => {
  const legacy = { target: { "two-sum": { timestamp: 999, path: "Solutions/easy/1-two-sum" } } }
  assert.deepEqual(normalizeGithubExportIndex(legacy), emptyGithubExportIndex())
})

test("export indices are isolated by repository, branch, and base folder", () => {
  const targets = new Set([
    githubExportTarget("Owner/Repo", "main", "Solutions"),
    githubExportTarget("Owner/Repo", "dev", "Solutions"),
    githubExportTarget("Owner/Repo", "main", "Archive"),
    githubExportTarget("Owner/Other", "main", "Solutions")
  ])
  assert.equal(targets.size, 4)
})

test("failed commit leaves the export checkpoint unchanged", () => {
  const current = { [githubSolutionKey("two-sum", "cpp")]: record("two-sum", "cpp", 10) }
  const candidate = record("two-sum", "cpp", 20)
  assert.equal(applyCommittedRecords(current, [candidate], false), current)
  assert.equal(current["two-sum::cpp"].timestamp, 10)
})

test("legacy solution paths are reported and never rewritten as guessed language paths", () => {
  const paths = [
    "Solutions/easy/1-two-sum/solution.cpp",
    "Solutions/easy/cpp/1-two-sum/solution.cpp"
  ]
  assert.deepEqual(findGithubOnlySolutionFolders("Solutions", paths, {
    "two-sum::cpp": { path: "Solutions/easy/cpp/1-two-sum" }
  }), ["Solutions/easy/1-two-sum"])
})

test("migration verification requires code, README, and metadata", () => {
  const indexed = { path: "Solutions/easy/cpp/1-two-sum" }
  const incompleteTree = [
    "Solutions/easy/cpp/1-two-sum/solution.cpp",
    "Solutions/easy/cpp/1-two-sum/metadata.json"
  ]
  assert.equal(hasCompleteGithubArtifactSet(indexed, incompleteTree), false)
  assert.equal(hasCompleteGithubArtifactSet(indexed, [...incompleteTree, "Solutions/easy/cpp/1-two-sum/README.md"]), true)
})

test("README reports unique problems separately from language solutions", () => {
  const records = {
    "two-sum::cpp": record("two-sum", "cpp", 10),
    "two-sum::python3": record("two-sum", "python3", 11)
  }
  const summary = summarizeGithubExports(records)
  assert.deepEqual(summary, { problemCount: 1, solutionCount: 2, byLanguage: { cpp: 1, python3: 1 } })
  const readme = buildGithubDashboardReadme(
    [{ titleSlug: "two-sum", difficulty: "Easy" }],
    {
      basePath: "Solutions",
      archivedProblemCount: summary.problemCount,
      archivedSolutionCount: summary.solutionCount,
      languageCounts: summary.byLanguage
    }
  )
  assert.match(readme, /1 unique problem/)
  assert.match(readme, /2 language-specific solutions/)
  assert.match(readme, /<language>\/\n        └── <problem-id>/)
})

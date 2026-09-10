import { joinGithubPath } from "./github-path"

function slugPathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown"
}

export function githubProblemFolder(
  basePath: string,
  difficulty: string,
  languageId: string,
  titleSlug: string,
  frontendQuestionId?: string | null
) {
  const idPrefix = frontendQuestionId ? `${frontendQuestionId}-` : ""
  return joinGithubPath(
    basePath,
    slugPathSegment(difficulty),
    languageId,
    `${idPrefix}${titleSlug}`
  )
}

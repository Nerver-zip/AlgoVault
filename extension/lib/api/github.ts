import { exchangeGithubCode, getGithubOAuthState } from "./backend";
import { getGithubAutoSync } from "../storage";
import { encodeGithubContentPath } from "../github-path";
import { classifyGithubHttpFailure, githubNetworkFailure } from "../github-status";

// Client IDs identify an OAuth app and are public by design. The client
// secret is deliberately backend-only and must never be bundled here.
export const GITHUB_CLIENT_ID = process.env.PLASMO_PUBLIC_GITHUB_CLIENT_ID || '';

export interface GithubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export interface GithubRepoItem {
  full_name: string;
  name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  html_url: string;
}

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64Utf8 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const createPkcePair = async (): Promise<{ verifier: string; challenge: string }> => {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
};

export interface GithubProfileResult {
  ok: boolean;
  user?: GithubUser;
  revoked?: boolean;
  error?: string;
}

export interface GithubReposResult {
  ok: boolean;
  repos: GithubRepoItem[];
  revoked?: boolean;
  error?: string;
}

/**
 * Fetches authenticated user's profile from GitHub API.
 * Only HTTP 401 proves that the saved credential was rejected. Other failures
 * must not make the UI look disconnected.
 */
export async function fetchUserGithubProfile(token: string): Promise<GithubProfileResult> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const failure = classifyGithubHttpFailure(res.status, "profile", res.headers, errText);
      return { ok: false, revoked: failure.revoked, error: failure.message };
    }
    const user = await res.json();
    return { ok: true, user };
  } catch (e: any) {
    console.warn("Failed to fetch GitHub profile:", e?.message || "network error");
    return { ok: false, ...githubNetworkFailure("fetching the GitHub profile") };
  }
}

/**
 * Fetches accessible repositories for the authenticated GitHub user.
 */
export async function fetchUserGithubRepos(token: string): Promise<GithubReposResult> {
  try {
    const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated&type=all", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const failure = classifyGithubHttpFailure(res.status, "repositories", res.headers, errText);
      return { ok: false, repos: [], revoked: failure.revoked, error: failure.message };
    }
    const repos = await res.json();
    if (!Array.isArray(repos)) return { ok: true, repos: [] };
    const mapped = repos.map((r: any) => ({
      full_name: r.full_name,
      name: r.name,
      owner: { login: r.owner?.login || "" },
      default_branch: r.default_branch || "main",
      private: !!r.private,
      html_url: r.html_url
    }));
    return { ok: true, repos: mapped };
  } catch (e: any) {
    console.warn("Failed to fetch GitHub repositories:", e?.message || "network error");
    return { ok: false, repos: [], ...githubNetworkFailure("fetching GitHub repositories") };
  }
}

/**
 * Commits a solution code file to the user's GitHub repository.
 * Handles existing file SHA check and branch target.
 */
export async function commitToGithub(
  pat: string,
  repoPath: string,
  filePath: string,
  commitMessage: string,
  fileContent: string,
  branch?: string
): Promise<{ ok: boolean; message?: string; alreadySynced?: boolean; revoked?: boolean }> {
  try {
    const isAutoSync = await getGithubAutoSync();
    if (!isAutoSync) {
      console.log("[AlgoVault] commitToGithub aborted: Auto-sync is disabled.");
      return { ok: true, alreadySynced: true, message: "Auto-sync disabled by user" };
    }

    const cleanRepo = repoPath.trim()
      .replace(/^https:\/\/github\.com\//, "")
      .replace(/\.git$/, "");
    const [owner, repo] = cleanRepo.split("/");
    if (!owner || !repo) {
      return { ok: false, message: "Invalid repository path. Format must be 'owner/repo'." };
    }

    const headers: Record<string, string> = {
      Authorization: `token ${pat}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    };

    const branchQuery = branch ? `?ref=${encodeURIComponent(branch)}` : "";
    const encodedFilePath = encodeGithubContentPath(filePath)
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedFilePath}${branchQuery}`;

    // 1. Get file SHA if it already exists
    let sha: string | undefined = undefined;
    let existingContent: string | undefined = undefined;
    try {
      const getRes = await fetch(apiUrl, {
        headers: {
          ...headers,
          "Cache-Control": "no-cache"
        }
      });
      if (getRes.ok) {
        const getJson = await getRes.json();
        sha = getJson.sha;
        if (getJson.content) {
          existingContent = getJson.content.replace(/\n/g, "");
        }
      } else if (getRes.status !== 404) {
        const errText = await getRes.text().catch(() => "");
        const failure = classifyGithubHttpFailure(getRes.status, "file", getRes.headers, errText);
        return { ok: false, revoked: failure.revoked, message: failure.message };
      }
    } catch (e: any) {
      const failure = githubNetworkFailure("checking the target file on GitHub");
      return { ok: false, revoked: failure.revoked, message: failure.message };
    }

    // 2. Base64 encode file contents
    const base64Content = base64Utf8(fileContent);

    // Duplicate protection check: if existing base64 content matches exactly, skip commit
    if (sha && existingContent && existingContent === base64Content) {
      return { ok: true, alreadySynced: true, message: "File is already up to date on GitHub" };
    }

    // 3. Commit the file
    const body: Record<string, any> = {
      message: commitMessage,
      content: base64Content
    };
    if (sha) {
      body.sha = sha;
    }
    if (branch) {
      body.branch = branch;
    }

    let putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedFilePath}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body)
    });

    // If failed due to missing or mismatched SHA (409 Conflict or 422 Unprocessable Entity), re-fetch latest SHA with no-cache and retry once
    if (!putRes.ok && (putRes.status === 409 || putRes.status === 422)) {
      try {
        const retryGetRes = await fetch(apiUrl, {
          headers: {
            ...headers,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache"
          }
        });
        if (retryGetRes.ok) {
          const retryJson = await retryGetRes.json();
          if (retryJson.sha) {
            body.sha = retryJson.sha;
            putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedFilePath}`, {
              method: "PUT",
              headers,
              body: JSON.stringify(body)
            });
          }
        }
      } catch (retryErr) {
        console.warn("Retry SHA fetch failed:", retryErr);
      }
    }

    if (!putRes.ok) {
      const errorMsg = await putRes.text().catch(() => "");
      const failure = classifyGithubHttpFailure(putRes.status, "file", putRes.headers, errorMsg);
      return {
        ok: false,
        revoked: failure.revoked,
        message: failure.message
      };
    }

    return { ok: true };
  } catch (error: any) {
    const failure = githubNetworkFailure("committing a file");
    return { ok: false, revoked: failure.revoked, message: failure.message };
  }
}

export interface BatchFileWrite {
  path: string
  message: string
  content: string
}

export interface BatchCommitOptions {
  allowSequentialFallback?: boolean
  refUpdateRetriesRemaining?: number
}

export interface BatchCommitResult {
  ok: boolean
  message?: string
  revoked?: boolean
  retryableWithSmallerBatch?: boolean
}

export interface GithubTreePathsResult {
  ok: boolean
  paths?: string[]
  truncated?: boolean
  message?: string
  revoked?: boolean
}

export async function getGithubTreePaths(
  pat: string,
  repoPath: string,
  branch?: string
): Promise<GithubTreePathsResult> {
  try {
    const cleanRepo = repoPath.trim()
      .replace(/^https:\/\/github\.com\//, "")
      .replace(/\.git$/, "")
    const [owner, repo] = cleanRepo.split("/")
    if (!owner || !repo) return { ok: false, message: "Invalid repository path. Format must be 'owner/repo'." }

    const headers: Record<string, string> = {
      Authorization: `token ${pat}`,
      Accept: "application/vnd.github.v3+json",
      "Cache-Control": "no-cache"
    }
    const targetBranch = branch || "main"
    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
      { headers }
    )
    if (refRes.status === 409) return { ok: true, paths: [], truncated: false }
    if (!refRes.ok) {
      const body = await refRes.text().catch(() => "")
      const failure = classifyGithubHttpFailure(refRes.status, "branch", refRes.headers, body)
      return {
        ok: false,
        revoked: failure.revoked,
        message: failure.message
      }
    }
    const refData = await refRes.json()
    const commitSha: string | undefined = refData.object?.sha
    if (!commitSha) return { ok: false, message: `GitHub branch '${targetBranch}' did not return a commit SHA.` }

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`,
      { headers }
    )
    if (!treeRes.ok) {
      const body = await treeRes.text().catch(() => "")
      const failure = classifyGithubHttpFailure(treeRes.status, "tree", treeRes.headers, body)
      return {
        ok: false,
        revoked: failure.revoked,
        message: failure.message
      }
    }
    const treeData = await treeRes.json()
    return {
      ok: true,
      truncated: Boolean(treeData.truncated),
      paths: Array.isArray(treeData.tree)
        ? treeData.tree.map((entry: any) => entry?.path).filter((path: unknown): path is string => typeof path === "string")
        : []
    }
  } catch (error: any) {
    const failure = githubNetworkFailure("reading the GitHub repository tree")
    return { ok: false, revoked: failure.revoked, message: failure.message }
  }
}

async function initializeEmptyGithubRepository(
  headers: Record<string, string>,
  owner: string,
  repo: string,
  targetBranch: string,
  firstWrite: BatchFileWrite
): Promise<BatchCommitResult> {
  const initRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGithubContentPath(firstWrite.path)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: "Initialize AlgoVault solution repository",
        content: base64Utf8(firstWrite.content)
      })
    }
  );

  if (!initRes.ok) {
    const body = await initRes.text().catch(() => "");
    const failure = classifyGithubHttpFailure(initRes.status, "repository", initRes.headers, body);
    return {
      ok: false,
      revoked: failure.revoked,
      message: failure.message
    };
  }

  const initData = await initRes.json();
  const initialCommitSha: string | undefined = initData.commit?.sha;
  if (!initialCommitSha) {
    return { ok: false, message: "GitHub initialized the repository without returning a commit SHA." };
  }

  const targetRefRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
    { headers }
  );
  if (targetRefRes.ok) return { ok: true };
  if (targetRefRes.status === 401) {
    const failure = classifyGithubHttpFailure(targetRefRes.status, "branch", targetRefRes.headers);
    return { ok: false, revoked: failure.revoked, message: failure.message };
  }
  if (targetRefRes.status !== 404) {
    const body = await targetRefRes.text().catch(() => "");
    const failure = classifyGithubHttpFailure(targetRefRes.status, "branch", targetRefRes.headers, body);
    return { ok: false, revoked: failure.revoked, message: failure.message };
  }

  const createRefRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: `refs/heads/${targetBranch}`, sha: initialCommitSha })
    }
  );
  if (!createRefRes.ok) {
    const body = await createRefRes.text().catch(() => "");
    const failure = classifyGithubHttpFailure(createRefRes.status, "branch", createRefRes.headers, body);
    return {
      ok: false,
      revoked: failure.revoked,
      message: failure.message
    };
  }
  return { ok: true };
}

/**
 * Commits multiple files in a single atomic Git commit using the Git Trees API.
 * This reduces N sequential API roundtrips down to ~4 total requests regardless
 * of file count: (1) get branch ref, (2) create tree, (3) create commit, (4) update ref.
 *
 * Falls back to sequential single-file commits by default. Bulk history
 * exports disable that fallback so a rejected batch can be split safely.
 */
export async function batchCommitToGithub(
  pat: string,
  repoPath: string,
  writes: BatchFileWrite[],
  branch?: string,
  commitMessageOverride?: string,
  options: BatchCommitOptions = {}
): Promise<BatchCommitResult> {
  if (!writes.length) return { ok: true }

  const cleanRepo = repoPath.trim()
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
  const [owner, repo] = cleanRepo.split("/");
  if (!owner || !repo) {
    return { ok: false, message: "Invalid repository path. Format must be 'owner/repo'." };
  }

  const headers: Record<string, string> = {
    Authorization: `token ${pat}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json"
  };

  const targetBranch = branch || "main";
  const fallbackOrFail = async (message: string, retryableWithSmallerBatch = false): Promise<BatchCommitResult> => {
    if (options.allowSequentialFallback === false) {
      return { ok: false, message, retryableWithSmallerBatch };
    }
    return sequentialFallback(pat, repoPath, writes, branch);
  };

  try {
    // Step 1: Get the latest commit SHA for the branch
    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
      { headers }
    );

    if (refRes.status === 401) {
      const failure = classifyGithubHttpFailure(refRes.status, "branch", refRes.headers);
      return { ok: false, revoked: failure.revoked, message: failure.message };
    }

    if (refRes.status === 409) {
      const initialization = await initializeEmptyGithubRepository(headers, owner, repo, targetBranch, writes[0]);
      if (!initialization.ok) return initialization;
      return batchCommitToGithub(pat, repoPath, writes, branch, commitMessageOverride, options);
    }

    if (!refRes.ok) {
      const body = await refRes.text().catch(() => "");
      const failure = classifyGithubHttpFailure(refRes.status, "branch", refRes.headers, body);
      return failure.retryable
        ? fallbackOrFail(failure.message)
        : { ok: false, revoked: failure.revoked, message: failure.message };
    }

    const refData = await refRes.json();
    const latestCommitSha: string = refData.object?.sha;
    if (!latestCommitSha) {
      return fallbackOrFail(`GitHub branch '${targetBranch}' did not return a commit SHA.`);
    }

    // Step 2: Fetch the latest commit object to obtain its true tree SHA
    const commitObjRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits/${latestCommitSha}`,
      { headers }
    );
    if (!commitObjRes.ok) {
      const body = await commitObjRes.text().catch(() => "");
      const failure = classifyGithubHttpFailure(commitObjRes.status, "commit", commitObjRes.headers, body);
      return failure.retryable
        ? fallbackOrFail(failure.message)
        : { ok: false, revoked: failure.revoked, message: failure.message };
    }
    const commitObjData = await commitObjRes.json();
    const baseTreeSha: string = commitObjData.tree?.sha;
    if (!baseTreeSha) {
      return fallbackOrFail("The latest GitHub commit did not return a tree SHA.");
    }

    // Step 3: Create blobs for each file and build the tree entries
    const treeEntries: Array<{ path: string; mode: string; type: string; content: string }> = [];
    for (const write of writes) {
      treeEntries.push({
        path: write.path,
        mode: "100644",
        type: "blob",
        content: write.content
      });
    }

    // Step 4: Create a new tree based on the latest commit's tree SHA
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeEntries
        })
      }
    );

    if (!treeRes.ok) {
      const retryableWithSmallerBatch = treeRes.status === 413 || treeRes.status === 422
      const body = await treeRes.text().catch(() => "");
      const failure = classifyGithubHttpFailure(treeRes.status, "tree", treeRes.headers, body);
      return fallbackOrFail(
        failure.message,
        retryableWithSmallerBatch
      );
    }

    const treeData = await treeRes.json();
    const newTreeSha: string = treeData.sha;

    // Step 5: Create a new commit pointing to the new tree
    const commitMessage = commitMessageOverride || (writes.length === 1
      ? writes[0].message
      : `${writes[0].message} (+${writes.length - 1} files) - AlgoVault`);

    const commitRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: commitMessage,
          tree: newTreeSha,
          parents: [latestCommitSha]
        })
      }
    );

    if (!commitRes.ok) {
      const body = await commitRes.text().catch(() => "");
      const failure = classifyGithubHttpFailure(commitRes.status, "commit", commitRes.headers, body);
      return failure.retryable
        ? fallbackOrFail(failure.message)
        : { ok: false, revoked: failure.revoked, message: failure.message };
    }

    const commitData = await commitRes.json();
    const newCommitSha: string = commitData.sha;

    // Step 6: Update the branch ref to point to the new commit
    const updateRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(targetBranch)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ sha: newCommitSha, force: false })
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => "");
      const failure = classifyGithubHttpFailure(updateRes.status, "branch", updateRes.headers, errText);
      const isRevoked = failure.revoked;
      const refMoved = updateRes.status === 409 || (updateRes.status === 422 && /not a fast forward/i.test(errText));
      if (refMoved) {
        // Never force a branch ref. If another writer advanced the branch,
        // ask GitHub to integrate the prepared commit into the current branch.
        // The merges endpoint preserves both histories atomically.
        const mergeRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/merges`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              base: targetBranch,
              head: newCommitSha,
              commit_message: `Merge concurrent AlgoVault export into ${targetBranch}`
            })
          }
        );
        if (mergeRes.ok) return { ok: true };
        if (mergeRes.status === 401) {
          const mergeFailure = classifyGithubHttpFailure(mergeRes.status, "merge", mergeRes.headers);
          return { ok: false, revoked: mergeFailure.revoked, message: mergeFailure.message };
        }
        if (mergeRes.status !== 409 && mergeRes.status !== 422) {
          const mergeError = await mergeRes.text().catch(() => "");
          const mergeFailure = classifyGithubHttpFailure(mergeRes.status, "merge", mergeRes.headers, mergeError);
          return { ok: false, revoked: mergeFailure.revoked, message: mergeFailure.message };
        }
      }
      const maxRefUpdateRetries = 6;
      const retriesRemaining = options.refUpdateRetriesRemaining ?? maxRefUpdateRetries;
      if (refMoved && retriesRemaining > 0) {
        const attempt = maxRefUpdateRetries - retriesRemaining;
        const exponentialDelay = Math.min(4000, 250 * (2 ** attempt));
        const jitter = Math.floor(Math.random() * 250);
        await new Promise((resolve) => setTimeout(resolve, exponentialDelay + jitter));
        return batchCommitToGithub(pat, repoPath, writes, branch, commitMessageOverride, {
          ...options,
          refUpdateRetriesRemaining: retriesRemaining - 1
        });
      }
      if (!isRevoked && options.allowSequentialFallback !== false) {
        const fallback = await sequentialFallback(pat, repoPath, writes, branch);
        if (fallback.ok) return fallback;
      }
      return {
        ok: false,
        revoked: isRevoked,
        message: refMoved
            ? `GitHub branch '${targetBranch}' could not be advanced after ${maxRefUpdateRetries} conflict retries.`
            : failure.message
      };
    }

    return { ok: true };
  } catch (error: any) {
    if (options.allowSequentialFallback === false) {
      const failure = githubNetworkFailure("committing a GitHub batch");
      return { ok: false, revoked: failure.revoked, message: failure.message };
    }
    try {
      return await sequentialFallback(pat, repoPath, writes, branch);
    } catch (fallbackErr: any) {
      const failure = githubNetworkFailure("committing a GitHub batch");
      return { ok: false, revoked: failure.revoked, message: failure.message };
    }
  }
}

async function sequentialFallback(
  pat: string,
  repoPath: string,
  writes: BatchFileWrite[],
  branch?: string
): Promise<{ ok: boolean; message?: string; revoked?: boolean }> {
  for (const write of writes) {
    const result = await commitToGithub(pat, repoPath, write.path, write.message, write.content, branch);
    if (!result.ok) return result;
  }
  return { ok: true };
}

/**
 * Maps LeetCode language string to standard file extension.
 */
export function getExtensionForLanguage(lang?: string): string {
  if (!lang) return "txt";
  const l = lang.toLowerCase();
  if (l.includes("cpp") || l === "c++") return "cpp";
  if (l.includes("java")) return "java";
  if (l.includes("python") || l === "py") return "py";
  if (l.includes("javascript") || l === "js") return "js";
  if (l.includes("typescript") || l === "ts") return "ts";
  if (l === "c") return "c";
  if (l.includes("csharp") || l === "c#") return "cs";
  if (l.includes("golang") || l === "go") return "go";
  if (l.includes("kotlin")) return "kt";
  if (l.includes("rust")) return "rs";
  if (l.includes("ruby")) return "rb";
  if (l.includes("scala")) return "scala";
  if (l.includes("swift")) return "swift";
  if (l.includes("php")) return "php";
  if (l.includes("bash") || l === "sh") return "sh";
  if (l.includes("sql")) return "sql";
  return "txt";
}

/**
 * Initiates the GitHub OAuth flow using the Chrome Identity API,
 * retrieves the authorization code, and exchanges it via the backend.
 */
export async function authenticateGithub(): Promise<{ ok: boolean; token?: string; jwt?: string; message?: string }> {
  try {
    if (!GITHUB_CLIENT_ID) return { ok: false, message: "GitHub OAuth client ID is not configured." };
    const redirectUri = chrome.identity.getRedirectURL();
    const state = await getGithubOAuthState();
    const pkce = await createPkcePair();
    // `public_repo` is intentionally narrower than GitHub's broad `repo`
    // scope. A private repository requires a user-created fine-grained token
    // restricted to that specific repository.
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=public_repo&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(pkce.challenge)}&code_challenge_method=S256`;
    
    return new Promise((resolve) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          return resolve({ ok: false, message: chrome.runtime.lastError?.message || "OAuth flow was canceled or failed" });
        }
        
        try {
          const urlParams = new URLSearchParams(new URL(responseUrl).search);
          const code = urlParams.get('code');
          const returnedState = urlParams.get('state');
          if (!code) {
            return resolve({ ok: false, message: "No authorization code returned from GitHub" });
          }
          if (returnedState !== state) {
            return resolve({ ok: false, message: "OAuth state validation failed. Please try again." });
          }

          // The backend validates both the authorization code and GitHub identity.
          const res = await exchangeGithubCode(code, state, pkce.verifier, redirectUri);
          if (res.token && res.githubToken) {
            resolve({ ok: true, token: res.githubToken, jwt: res.token });
          } else {
            resolve({ ok: false, message: res.error || "Backend did not return a valid token" });
          }
        } catch (err: any) {
          resolve({ ok: false, message: err.message || "Failed to exchange authorization code" });
        }
      });
    });
  } catch (e: any) {
    return { ok: false, message: e.message || "Failed to start OAuth flow" };
  }
}

import { exchangeGithubCode, getGithubOAuthState } from "./backend";
import { getGithubAutoSync } from "../storage";

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
 * Detects 401/403 indicating a revoked or expired token.
 */
export async function fetchUserGithubProfile(token: string): Promise<GithubProfileResult> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, revoked: true, error: "GitHub token was revoked or expired" };
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `GitHub error ${res.status}: ${errText}` };
    }
    const user = await res.json();
    return { ok: true, user };
  } catch (e: any) {
    console.error("Failed to fetch GitHub profile:", e);
    return { ok: false, error: e.message || "Network error fetching GitHub profile" };
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
    if (res.status === 401 || res.status === 403) {
      return { ok: false, repos: [], revoked: true, error: "GitHub token was revoked or expired" };
    }
    if (!res.ok) {
      return { ok: false, repos: [], error: `GitHub error ${res.status}` };
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
    console.error("Failed to fetch GitHub repositories:", e);
    return { ok: false, repos: [], error: e.message || "Network error" };
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
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}${branchQuery}`;

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
      if (getRes.status === 401 || getRes.status === 403) {
        return { ok: false, revoked: true, message: "GitHub token was revoked or expired. Please reconnect in Settings." };
      }
      if (getRes.ok) {
        const getJson = await getRes.json();
        sha = getJson.sha;
        if (getJson.content) {
          existingContent = getJson.content.replace(/\n/g, "");
        }
      }
    } catch (e) {
      console.warn("Failed to check if file exists on GitHub", e);
    }

    // 2. Base64 encode file contents
    const utf8Bytes = new TextEncoder().encode(fileContent);
    let binary = "";
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    const base64Content = btoa(binary);

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

    let putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
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
            putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
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
      const errorMsg = await putRes.text();
      const isRevoked = putRes.status === 401 || putRes.status === 403;
      return {
        ok: false,
        revoked: isRevoked,
        message: isRevoked
          ? "GitHub token was revoked or expired. Please reconnect in Settings."
          : `GitHub API error (${putRes.status}): ${errorMsg}`
      };
    }

    return { ok: true };
  } catch (error: any) {
    return { ok: false, message: error.message || "Failed to commit to GitHub" };
  }
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

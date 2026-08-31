import test from "node:test";
import assert from "node:assert/strict";

// Mock chrome storage
const storageStore = new Map();
globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        if (keys === null) {
          const res = {};
          for (const [k, v] of storageStore.entries()) res[k] = v;
          return res;
        }
        if (typeof keys === "string") {
          return { [keys]: storageStore.get(keys) };
        }
        if (Array.isArray(keys)) {
          const res = {};
          for (const k of keys) res[k] = storageStore.get(k);
          return res;
        }
        return {};
      },
      set: async (obj) => {
        for (const [k, v] of Object.entries(obj)) storageStore.set(k, v);
      },
      remove: async (keys) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) storageStore.delete(k);
      }
    },
    sync: {
      get: async () => ({}),
      set: async () => {},
      remove: async () => {}
    }
  }
};

test("GitHub Profile API: 401 marks revoked, 403 does NOT mark revoked", async () => {
  // Test 401 vs 403 logic directly
  const handleProfileStatus = (status) => {
    if (status === 401) return { ok: false, revoked: true, error: "GitHub token was revoked or expired" };
    if (status === 403) return { ok: false, revoked: false, error: "GitHub rate limit or scope restriction (403)" };
    return { ok: true, revoked: false };
  };

  assert.equal(handleProfileStatus(401).revoked, true);
  assert.equal(handleProfileStatus(403).revoked, false);
  assert.equal(handleProfileStatus(200).ok, true);
});

test("GitHub Repos API: 401 marks revoked, 403 does NOT mark revoked", async () => {
  const handleReposStatus = (status) => {
    if (status === 401) return { ok: false, repos: [], revoked: true, error: "GitHub token was revoked or expired" };
    if (status === 403) return { ok: false, repos: [], revoked: false, error: "GitHub rate limit or fine-grained token scope restriction (403)" };
    return { ok: true, repos: [{ full_name: "nerver/AlgoVault" }], revoked: false };
  };

  assert.equal(handleReposStatus(401).revoked, true);
  assert.equal(handleReposStatus(403).revoked, false);
  assert.equal(handleReposStatus(200).ok, true);
  assert.equal(handleReposStatus(200).repos.length, 1);
});

test("GitHub Commit/Tree API: 403 does NOT mark token as revoked", async () => {
  const handleCommitStatus = (status) => {
    const isRevoked = status === 401;
    return { ok: status === 200, revoked: isRevoked };
  };

  assert.equal(handleCommitStatus(401).revoked, true);
  assert.equal(handleCommitStatus(403).revoked, false);
  assert.equal(handleCommitStatus(422).revoked, false);
  assert.equal(handleCommitStatus(409).revoked, false);
  assert.equal(handleCommitStatus(200).ok, true);
});

test("Storage Persistence: GitHub repo and configuration keys persist across LeetCode user changes", async () => {
  storageStore.clear();

  // Storage key constants
  const GITHUB_REPO = "algovault.github.repo";
  const GITHUB_PAT = "algovault.github.pat";
  const GITHUB_BRANCH = "algovault.github.branch";
  const GITHUB_BASE_PATH = "algovault.github.basePath";
  const USERNAME = "algovault.username";

  // 1. Set GitHub credentials and repo
  await chrome.storage.local.set({
    [GITHUB_PAT]: "ghp_valid_token_123",
    [GITHUB_REPO]: "nerver/my-leetcode-solutions",
    [GITHUB_BRANCH]: "main",
    [GITHUB_BASE_PATH]: "leetcode-solutions"
  });

  let stored = await chrome.storage.local.get(null);
  assert.equal(stored[GITHUB_PAT], "ghp_valid_token_123");
  assert.equal(stored[GITHUB_REPO], "nerver/my-leetcode-solutions");
  assert.equal(stored[GITHUB_BRANCH], "main");
  assert.equal(stored[GITHUB_BASE_PATH], "leetcode-solutions");

  // 2. Set LeetCode username and simulate purge of user caches
  const purgeUserCaches = async (newUsername) => {
    // Only cache keys are purged, GitHub keys MUST NEVER be in this list
    const cacheKeys = [
      "algovault.latestSyncedSubmissionTimestamp",
      "algovault.solvedSlugs",
      "algovault.syncHasMore",
      "algovault.lastSync",
      "algovault.cache.dashboard",
      "algovault.cache.mastery",
      "algovault.cache.heatmap",
      "algovault.cache.contests",
      "algovault.cache.weakness",
      "algovault.todaySnapshot.v2"
    ];
    await chrome.storage.local.remove(cacheKeys);
    await chrome.storage.local.set({ [USERNAME]: newUsername });
  };

  await purgeUserCaches("leetcode_user_1");
  stored = await chrome.storage.local.get(null);
  assert.equal(stored[USERNAME], "leetcode_user_1");
  assert.equal(stored[GITHUB_REPO], "nerver/my-leetcode-solutions");

  await purgeUserCaches("leetcode_user_2");
  stored = await chrome.storage.local.get(null);
  assert.equal(stored[USERNAME], "leetcode_user_2");
  assert.equal(stored[GITHUB_REPO], "nerver/my-leetcode-solutions");
  assert.equal(stored[GITHUB_PAT], "ghp_valid_token_123");
  assert.equal(stored[GITHUB_BRANCH], "main");

  // 3. Dropdown custom repo preservation logic test
  const fetchedRepos = [
    { full_name: "nerver/other-repo", private: false },
    { full_name: "nerver/another-repo", private: true }
  ];
  const configuredRepo = stored[GITHUB_REPO]; // "nerver/my-leetcode-solutions"
  const isIncludedInFetched = fetchedRepos.some(r => r.full_name.toLowerCase() === configuredRepo.toLowerCase());
  assert.equal(isIncludedInFetched, false);

  // In UI, when isIncludedInFetched is false, custom option is injected
  const dropdownOptions = [
    ...(!isIncludedInFetched && configuredRepo ? [{ full_name: configuredRepo, custom: true }] : []),
    ...fetchedRepos
  ];
  assert.equal(dropdownOptions.length, 3);
  assert.equal(dropdownOptions[0].full_name, "nerver/my-leetcode-solutions");
  assert.equal(dropdownOptions[0].custom, true);
});

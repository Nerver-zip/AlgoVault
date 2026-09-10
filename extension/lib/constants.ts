export const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql/';
export const ZEROTRAC_URL = 'https://raw.githubusercontent.com/zerotrac/leetcode_problem_rating/main/data.json';
export const BACKEND_URL = process.env.PLASMO_PUBLIC_BACKEND_URL || 'http://localhost:8080';

export const STORAGE_KEYS = {
  USERNAME: "algovault.username",
  JWT_TOKEN: "algovault.jwt",
  ZEROTRAC_DATA: "algovault.zerotrac.data.v2",
  ZEROTRAC_LAST_FETCHED: "algovault.zerotrac.last_fetched.v2",
  LAST_SYNC: "algovault.lastSync",
  USER_SETTINGS: "algovault.userSettings",
  CACHED_DASHBOARD: "algovault.cache.dashboard",
  CACHED_MASTERY: "algovault.cache.mastery",
  CACHED_HEATMAP: "algovault.cache.heatmap",
  CACHED_CONTESTS: "algovault.cache.contests",
  CACHED_WEAKNESS: "algovault.cache.weakness",
  CURRENT_SESSION: "algovault.session.active",
  TODAY_SNAPSHOT: "algovault.todaySnapshot.v2",
  TODAY_RECOMMENDATIONS: "algovault.today.recommendations.v1",
  LIVE_TIMER: "algovault.session.active",
  GITHUB_PAT: "algovault.github.pat",
  GITHUB_REFRESH_TOKEN: "algovault.github.refreshToken",
  GITHUB_TOKEN_EXPIRES_AT: "algovault.github.tokenExpiresAt",
  GITHUB_REFRESH_TOKEN_EXPIRES_AT: "algovault.github.refreshTokenExpiresAt",
  GITHUB_REPO: "algovault.github.repo",
  GITHUB_USER: "algovault.github.user",
  GITHUB_BRANCH: "algovault.github.branch",
  GITHUB_BASE_PATH: "algovault.github.basePath",
  GITHUB_EXPORT_INDEX: "algovault.github.exportIndex.v1",
  GITHUB_EXPORT_INDEX_V2: "algovault.github.exportIndex.v2",
  GITHUB_LANGUAGE_SCAN: "algovault.github.languageScan.v1",
  GITHUB_LANGUAGE_MIGRATION: "algovault.github.languageMigration.v2",
  GITHUB_AUTO_SYNC: "algovault.github.autoSync"
} as const;

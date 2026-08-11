import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS } from "./constants"
import type {
  ContestResult,
  DashboardData,
  HeatmapBucket,
  LiveTimerState,
  TagMastery,
  TodaySnapshot,
  ActiveSession,
  UserSettings,
  ZerotracProblem,
} from "./types"

const storage = new Storage({ area: "local" })

// ─── Generic Helpers ──────────────────────────────────────────────

async function getTyped<T>(key: string): Promise<T | null> {
  try {
    const data = await storage.get<T>(key)
    return data ?? null
  } catch {
    return null
  }
}

async function setTyped<T>(key: string, value: T): Promise<void> {
  await storage.set(key, value)
}

// ─── Username ─────────────────────────────────────────────────────

export async function getUsername(): Promise<string | null> {
  return getTyped<string>(STORAGE_KEYS.USERNAME)
}

export async function setUsername(username: string): Promise<void> {
  const current = await getUsername()
  if (current && current.toLowerCase() !== username.toLowerCase()) {
    await storage.remove("algovault.latestSyncedSubmissionTimestamp")
    await storage.remove("algovault.solvedSlugs")
    await storage.remove("algovault.cache.contest_snapshot")
  }
  await setTyped(STORAGE_KEYS.USERNAME, username)
}

// ─── JWT Token ────────────────────────────────────────────────────

export async function getJwtToken(): Promise<string | null> {
  return getTyped<string>(STORAGE_KEYS.JWT_TOKEN)
}

export async function setJwtToken(token: string): Promise<void> {
  await setTyped(STORAGE_KEYS.JWT_TOKEN, token)
}

export async function clearJwtToken(): Promise<void> {
  await storage.remove(STORAGE_KEYS.JWT_TOKEN)
}

// ─── Zerotrac Data ────────────────────────────────────────────────

export async function getZerotracData(): Promise<ZerotracProblem[] | null> {
  return getTyped<ZerotracProblem[]>(STORAGE_KEYS.ZEROTRAC_DATA)
}

export async function setZerotracData(
  data: ZerotracProblem[]
): Promise<void> {
  await setTyped(STORAGE_KEYS.ZEROTRAC_DATA, data)
  await setTyped(STORAGE_KEYS.ZEROTRAC_LAST_FETCHED, Date.now())
}

export async function getZerotracLastFetched(): Promise<number | null> {
  return getTyped<number>(STORAGE_KEYS.ZEROTRAC_LAST_FETCHED)
}

// ─── Last Sync ────────────────────────────────────────────────────

export async function getLastSync(): Promise<number | null> {
  return getTyped<number>(STORAGE_KEYS.LAST_SYNC)
}

export async function setLastSync(timestamp: number): Promise<void> {
  await setTyped(STORAGE_KEYS.LAST_SYNC, timestamp)
}

// ─── User Settings ────────────────────────────────────────────────

const DEFAULT_SETTINGS: UserSettings = {
  hideAcceptanceRate: false,
  darkMode: true,
  dailyPotdEnabled: true,
  enableSessionTracking: true,
  enableFocusAnalytics: true,
  enablePasteDetection: true,
  reviewNotifications: true,
  sessionMode: "PRACTICE",
}

export async function getUserSettings(): Promise<UserSettings> {
  const settings = await getTyped<UserSettings>(STORAGE_KEYS.USER_SETTINGS)
  return settings ?? DEFAULT_SETTINGS
}

export async function updateUserSettings(
  partial: Partial<UserSettings>
): Promise<UserSettings> {
  const current = await getUserSettings()
  const updated = { ...current, ...partial }
  await setTyped(STORAGE_KEYS.USER_SETTINGS, updated)
  return updated
}

// ─── Cached Dashboard ─────────────────────────────────────────────

export async function getCachedDashboard(): Promise<DashboardData | null> {
  return getTyped<DashboardData>(STORAGE_KEYS.CACHED_DASHBOARD)
}

export async function setCachedDashboard(data: DashboardData): Promise<void> {
  await setTyped(STORAGE_KEYS.CACHED_DASHBOARD, data)
}

// ─── Today command center ─────────────────────────────────────────

export async function getTodaySnapshot(): Promise<TodaySnapshot | null> {
  const current = await getTyped<TodaySnapshot>(STORAGE_KEYS.TODAY_SNAPSHOT)
  if (current) return current

  // Preserve the instant-load benefit for people upgrading from the original
  // Today cache. The next successful refresh writes the versioned record.
  const legacy = await getTyped<Partial<TodaySnapshot>>("algovault.todaySnapshot")
  if (!legacy?.data) return null
  return {
    schemaVersion: 2,
    data: legacy.data,
    queue: legacy.queue ?? [],
    weakness: legacy.weakness ?? null,
    sessions: legacy.sessions ?? [],
    solved: legacy.solved ?? [],
    zerotrac: legacy.zerotrac ?? [],
    ranking: legacy.ranking ?? null,
    savedAt: legacy.savedAt ?? 0,
    isPartial: legacy.isPartial
  }
}

export async function setTodaySnapshot(snapshot: TodaySnapshot): Promise<void> {
  await setTyped(STORAGE_KEYS.TODAY_SNAPSHOT, snapshot)
}

export interface TodayRecommendationSelection {
  practiceSlug?: string
  stretchSlug?: string
}

/** Keeps a manually shuffled Today recommendation stable across panel reloads. */
export async function getTodayRecommendationSelection(): Promise<TodayRecommendationSelection> {
  return (await getTyped<TodayRecommendationSelection>(STORAGE_KEYS.TODAY_RECOMMENDATIONS)) ?? {}
}

export async function setTodayRecommendationSelection(selection: TodayRecommendationSelection): Promise<void> {
  await setTyped(STORAGE_KEYS.TODAY_RECOMMENDATIONS, selection)
}

export async function getLiveTimer(): Promise<any | null> {
  return getTyped<any>("algovault.session.active")
}

export async function setLiveTimer(timer: any): Promise<void> {
  await setTyped("algovault.session.active", timer)
}

export async function getCurrentSession(): Promise<any | null> {
  return getTyped<any>("algovault.session.active")
}

export async function setCurrentSession(session: any): Promise<void> {
  await setTyped("algovault.session.active", session)
}

export async function clearCurrentSession(): Promise<void> {
  await storage.remove("algovault.session.active")
}

// ─── Cached Mastery ───────────────────────────────────────────────

export async function getCachedMastery(): Promise<TagMastery[] | null> {
  return getTyped<TagMastery[]>(STORAGE_KEYS.CACHED_MASTERY)
}

export async function setCachedMastery(data: TagMastery[]): Promise<void> {
  await setTyped(STORAGE_KEYS.CACHED_MASTERY, data)
}

// ─── Cached Heatmap ───────────────────────────────────────────────

export async function getCachedHeatmap(): Promise<HeatmapBucket[] | null> {
  return getTyped<HeatmapBucket[]>(STORAGE_KEYS.CACHED_HEATMAP)
}

export async function setCachedHeatmap(data: HeatmapBucket[]): Promise<void> {
  await setTyped(STORAGE_KEYS.CACHED_HEATMAP, data)
}

// ─── Cached Contests ──────────────────────────────────────────────

export async function getCachedContests(): Promise<ContestResult[] | null> {
  return getTyped<ContestResult[]>(STORAGE_KEYS.CACHED_CONTESTS)
}

export async function setCachedContests(data: ContestResult[]): Promise<void> {
  await setTyped(STORAGE_KEYS.CACHED_CONTESTS, data)
}

export async function getContestSnapshot(): Promise<any | null> {
  return getTyped<any>("algovault.cache.contest_snapshot")
}

export async function setContestSnapshot(snapshot: any): Promise<void> {
  await setTyped("algovault.cache.contest_snapshot", snapshot)
}

// ─── Cached Weakness ──────────────────────────────────────────────

export async function getCachedWeakness(): Promise<any | null> {
  return getTyped<any>(STORAGE_KEYS.CACHED_WEAKNESS)
}

export async function setCachedWeakness(data: any): Promise<void> {
  await setTyped(STORAGE_KEYS.CACHED_WEAKNESS, data)
}

// ─── GitHub Credentials ───────────────────────────────────────────

export async function getGithubPat(): Promise<string | null> {
  return getTyped<string>(STORAGE_KEYS.GITHUB_PAT)
}

export async function setGithubPat(pat: string): Promise<void> {
  await setTyped(STORAGE_KEYS.GITHUB_PAT, pat)
}

export async function getGithubRepo(): Promise<string | null> {
  return getTyped<string>(STORAGE_KEYS.GITHUB_REPO)
}

export async function setGithubRepo(repo: string): Promise<void> {
  await setTyped(STORAGE_KEYS.GITHUB_REPO, repo)
}

export async function getGithubUser(): Promise<any | null> {
  return getTyped<any>(STORAGE_KEYS.GITHUB_USER)
}

export async function setGithubUser(user: any): Promise<void> {
  await setTyped(STORAGE_KEYS.GITHUB_USER, user)
}

export async function getGithubBranch(): Promise<string | null> {
  return getTyped<string>(STORAGE_KEYS.GITHUB_BRANCH)
}

export async function setGithubBranch(branch: string): Promise<void> {
  await setTyped(STORAGE_KEYS.GITHUB_BRANCH, branch)
}

export async function clearGithubAuth(): Promise<void> {
  await storage.remove(STORAGE_KEYS.GITHUB_PAT)
  await storage.remove(STORAGE_KEYS.GITHUB_USER)
  await storage.remove(STORAGE_KEYS.GITHUB_REPO)
  await storage.remove(STORAGE_KEYS.GITHUB_BRANCH)
  await storage.remove("algovault.gitSyncStatus")
}

// ─── Export the raw storage instance ──────────────────────────────

export { storage }

import type {
  GistTombstone,
  Manga,
  SkillTreeState,
  StatisticsEvent,
  StatisticsTagCache
} from '../types/index'
import { normalizeMangaList, normalizeTagCache } from './manga'
import { getMaxFocusSlots } from './skill-tree'

export const GIST_FILE_NAME = 'mangatracker-sync.json'
export const GIST_VERSION = 4

export interface GistStatisticsPayload {
  events: StatisticsEvent[]
  tagCache: StatisticsTagCache | null
}

export interface GistProfile {
  name: string
  avatar: string
  updatedAt: number
}

export interface GistPayload {
  version: number
  syncedAt: number
  manga: Manga[]
  deleted: GistTombstone[]
  stats: GistStatisticsPayload
  profile?: GistProfile
  skillTree?: SkillTreeState
}

export function parseSyncPayload(json: string): GistPayload {
  const raw = JSON.parse(json) as Partial<GistPayload> & {
    stats?: Partial<GistStatisticsPayload> & { genreCache?: unknown }
  }

  const rawProfile = raw.profile as Partial<GistProfile> | undefined

  return {
    version: Number.isFinite(raw.version) ? Number(raw.version) : 1,
    syncedAt: Number.isFinite(raw.syncedAt) ? Number(raw.syncedAt) : 0,
    manga: normalizeMangaList(raw.manga),
    deleted: Array.isArray(raw.deleted) ? raw.deleted : [],
    stats: {
      events: Array.isArray(raw.stats?.events) ? raw.stats.events : [],
      tagCache: normalizeTagCache(raw.stats?.tagCache ?? raw.stats?.genreCache ?? null)
    },
    profile: rawProfile
      ? {
          name: rawProfile.name ?? '',
          avatar: rawProfile.avatar ?? '',
          updatedAt: Number.isFinite(rawProfile.updatedAt) ? Number(rawProfile.updatedAt) : 0
        }
      : undefined,
    skillTree: (() => {
      const rawSkillTree = raw.skillTree as Partial<SkillTreeState> | undefined
      if (!rawSkillTree) return undefined
      return {
        unlockedSkills: Array.isArray(rawSkillTree.unlockedSkills) ? rawSkillTree.unlockedSkills.filter((s) => typeof s === 'string') : [],
        version: Number.isFinite(rawSkillTree.version) ? Number(rawSkillTree.version) : 1
      }
    })()
  }
}

export function buildSyncPayload(
  manga: Manga[],
  deleted: GistTombstone[],
  stats: GistStatisticsPayload,
  profile?: GistProfile,
  skillTree?: SkillTreeState
): string {
  const payload: GistPayload = {
    version: GIST_VERSION,
    syncedAt: Date.now(),
    manga,
    deleted,
    stats,
    ...(profile ? { profile } : {}),
    ...(skillTree ? { skillTree } : {})
  }

  return JSON.stringify(payload, null, 2)
}

export function mergeSkillTree(
  local: SkillTreeState | undefined,
  remote: SkillTreeState | undefined
): SkillTreeState {
  const localSkills = local?.unlockedSkills ?? []
  const remoteSkills = remote?.unlockedSkills ?? []
  return {
    unlockedSkills: [...new Set([...localSkills, ...remoteSkills])],
    version: Math.max(local?.version ?? 1, remote?.version ?? 1)
  }
}

export function mergeProfile(
  local: GistProfile | undefined,
  remote: GistProfile | undefined
): GistProfile | undefined {
  if (!local && !remote) return undefined
  if (!local) return remote
  if (!remote) return local
  return remote.updatedAt > local.updatedAt ? remote : local
}

export function mergeLists(
  local: Manga[],
  remote: Manga[],
  localDeleted: GistTombstone[],
  remoteDeleted: GistTombstone[],
  mergedSkillTree?: SkillTreeState
): { manga: Manga[]; deleted: GistTombstone[] } {
  const map = new Map<string, Manga>()
  for (const manga of local) map.set(manga.id, manga)
  for (const manga of remote) {
    const existing = map.get(manga.id)
    if (!existing || manga.updatedAt > existing.updatedAt) {
      map.set(manga.id, manga)
    }
  }

  const tombstoneMap = new Map<string, GistTombstone>()
  for (const tombstone of localDeleted) tombstoneMap.set(tombstone.id, tombstone)
  for (const tombstone of remoteDeleted) {
    const existing = tombstoneMap.get(tombstone.id)
    if (!existing || tombstone.deletedAt > existing.deletedAt) {
      tombstoneMap.set(tombstone.id, tombstone)
    }
  }

  for (const [id, tombstone] of tombstoneMap) {
    const manga = map.get(id)
    if (manga && tombstone.deletedAt >= manga.updatedAt) map.delete(id)
  }

  let merged = Array.from(map.values())
  const maxSlots = getMaxFocusSlots(mergedSkillTree?.unlockedSkills ?? [])
  const focused = merged.filter((manga) => manga.isFocused).sort((left, right) => right.updatedAt - left.updatedAt)
  if (focused.length > maxSlots) {
    const toUnfocus = new Set(focused.slice(maxSlots).map((manga) => manga.id))
    merged = merged.map((manga) => (toUnfocus.has(manga.id) ? { ...manga, isFocused: false } : manga))
  }

  return {
    manga: merged,
    deleted: Array.from(tombstoneMap.values())
  }
}

export function mergeStatisticsPayload(
  local: GistStatisticsPayload,
  remote: GistStatisticsPayload
): GistStatisticsPayload {
  const events = new Map<string, StatisticsEvent>()

  for (const event of local.events) events.set(event.id, event)
  for (const event of remote.events) {
    if (!events.has(event.id)) events.set(event.id, event)
  }

  const localCache = local.tagCache
  const remoteCache = remote.tagCache
  const tagCache = !localCache
    ? remoteCache
    : !remoteCache
      ? localCache
      : remoteCache.fetchedAt >= localCache.fetchedAt
        ? remoteCache
        : localCache

  return {
    events: Array.from(events.values()).sort((left, right) => {
      if (left.at !== right.at) return left.at - right.at
      return left.id.localeCompare(right.id)
    }),
    tagCache
  }
}
import type {
  GistTombstone,
  Manga,
  StatisticsEvent,
  StatisticsTagCache
} from '../types/index'
import { normalizeMangaList, normalizeTagCache } from './manga'

export const GIST_FILE_NAME = 'mangatracker-sync.json'
export const GIST_VERSION = 3

export interface GistStatisticsPayload {
  events: StatisticsEvent[]
  tagCache: StatisticsTagCache | null
}

export interface GistPayload {
  version: number
  syncedAt: number
  manga: Manga[]
  deleted: GistTombstone[]
  stats: GistStatisticsPayload
}

export function parseSyncPayload(json: string): GistPayload {
  const raw = JSON.parse(json) as Partial<GistPayload> & {
    stats?: Partial<GistStatisticsPayload> & { genreCache?: unknown }
  }

  return {
    version: Number.isFinite(raw.version) ? Number(raw.version) : 1,
    syncedAt: Number.isFinite(raw.syncedAt) ? Number(raw.syncedAt) : 0,
    manga: normalizeMangaList(raw.manga),
    deleted: Array.isArray(raw.deleted) ? raw.deleted : [],
    stats: {
      events: Array.isArray(raw.stats?.events) ? raw.stats.events : [],
      tagCache: normalizeTagCache(raw.stats?.tagCache ?? raw.stats?.genreCache ?? null)
    }
  }
}

export function buildSyncPayload(
  manga: Manga[],
  deleted: GistTombstone[],
  stats: GistStatisticsPayload
): string {
  const payload: GistPayload = {
    version: GIST_VERSION,
    syncedAt: Date.now(),
    manga,
    deleted,
    stats
  }

  return JSON.stringify(payload, null, 2)
}

export function mergeLists(
  local: Manga[],
  remote: Manga[],
  localDeleted: GistTombstone[],
  remoteDeleted: GistTombstone[]
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
  const focused = merged.filter((manga) => manga.isFocused).sort((left, right) => right.updatedAt - left.updatedAt)
  if (focused.length > 3) {
    const toUnfocus = new Set(focused.slice(3).map((manga) => manga.id))
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
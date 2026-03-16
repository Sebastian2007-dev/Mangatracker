import type { Manga, StatisticsTagCache, TrashedManga } from '../types/index'
import { normalizeTagList, mergeTagMaps } from './statistics'

type LegacyMangaShape = Partial<Manga> & {
  id: string
  title: string
  genres?: string[] | null
}

type LegacyTagCacheShape = Partial<StatisticsTagCache> & {
  genres?: Record<string, number> | null
}

function cloneWithoutLegacyGenres<T extends { genres?: unknown }>(entry: T): Omit<T, 'genres'> {
  const { genres: _legacyGenres, ...rest } = entry
  return rest
}

function hasArrayContent(value: string[] | null | undefined): boolean {
  return Array.isArray(value) && value.length > 0
}

export function normalizeMangaEntry<T extends LegacyMangaShape>(entry: T): Manga {
  const rawTags = hasArrayContent(entry.tags)
    ? entry.tags
    : hasArrayContent(entry.genres)
      ? entry.genres
      : undefined

  const tags = normalizeTagList(rawTags)
  const normalized = cloneWithoutLegacyGenres(entry)

  return {
    ...(normalized as Omit<Manga, 'tags'>),
    tags: tags.length > 0 ? tags : undefined
  }
}

export function normalizeMangaList(entries: unknown): Manga[] {
  if (!Array.isArray(entries)) return []
  return entries
    .filter((entry): entry is LegacyMangaShape => typeof entry === 'object' && entry !== null)
    .map((entry) => normalizeMangaEntry(entry))
}

export function normalizeTrashedMangaList(entries: unknown): TrashedManga[] {
  if (!Array.isArray(entries)) return []
  return entries
    .filter((entry): entry is LegacyMangaShape & { deletedAt: number } => typeof entry === 'object' && entry !== null)
    .map((entry) => normalizeMangaEntry(entry) as TrashedManga)
}

export function normalizeTagCache(value: unknown): StatisticsTagCache | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const raw = value as LegacyTagCacheShape
  const tags = mergeTagMaps(raw.tags ?? raw.genres ?? {})

  return {
    fetchedAt: Number.isFinite(raw.fetchedAt) ? Number(raw.fetchedAt) : 0,
    sourceKey: typeof raw.sourceKey === 'string' ? raw.sourceKey : '',
    tags
  }
}

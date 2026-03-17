import { BrowserWindow, session as electronSession } from 'electron'
import store from './store'
import type {
  AppSettings,
  Manga,
  StatisticsEvent,
  StatisticsOverview,
  StatisticsTagCache,
  TrashedManga
} from '../types/index'
import {
  appendStatisticsEvents,
  buildCreateStatisticsEvents,
  buildDeleteStatisticsEvents,
  buildRestoreStatisticsEvents,
  buildStatisticsOverview,
  buildStoredTagMap,
  buildUpdateStatisticsEvents,
  createSyntheticChapterSeedEvent,
  getStatisticsSourceKey,
  hasChapterHistory,
  normalizeTagList,
  normalizeTagName,
  shouldRefreshTagCache
} from '../shared/statistics'

let tagRefreshPromise: Promise<StatisticsTagCache | null> | null = null

export interface MetadataRefreshResult {
  items: Manga[]
  updatedCount: number
  scannedCount: number
}

function broadcastStatsUpdated(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('stats:updated')
  }
}

export function notifyStatsUpdated(): void {
  broadcastStatsUpdated()
}

export function getStatisticsEvents(): StatisticsEvent[] {
  return store.get('statsEvents') ?? []
}

function setStatisticsEvents(events: StatisticsEvent[]): void {
  store.set('statsEvents', events)
}

export function getStatisticsTagCache(): StatisticsTagCache | null {
  return store.get('statsTagCache') ?? null
}

function setStatisticsTagCache(cache: StatisticsTagCache | null): void {
  store.set('statsTagCache', cache)
}

function appendStoredEvents(incoming: StatisticsEvent[]): boolean {
  if (incoming.length === 0) return false
  const current = getStatisticsEvents()
  const next = appendStatisticsEvents(current, incoming)
  if (next.length === current.length) return false
  setStatisticsEvents(next)
  return true
}

function buildSeedTimestamp(manga: Manga | TrashedManga): number {
  if ('deletedAt' in manga && manga.deletedAt) return manga.deletedAt
  return manga.updatedAt || manga.createdAt || Date.now()
}

function ensureChapterSeedForManga(manga: Manga | TrashedManga): boolean {
  const events = getStatisticsEvents()
  if (hasChapterHistory(events, manga.id)) return false
  const seedEvent = createSyntheticChapterSeedEvent(manga, buildSeedTimestamp(manga))
  if (!seedEvent) return false
  setStatisticsEvents(appendStatisticsEvents(events, [seedEvent]))
  return true
}

function ensureSnapshotSeeds(mangaList: Manga[], mangaTrash: TrashedManga[]): boolean {
  const events = getStatisticsEvents()
  const existingChapterHistory = new Set(
    events
      .filter((event) => event.type === 'chapter_progress')
      .map((event) => event.mangaId)
  )
  const additions: StatisticsEvent[] = []

  for (const manga of [...mangaList, ...mangaTrash]) {
    if (existingChapterHistory.has(manga.id)) continue
    const seedEvent = createSyntheticChapterSeedEvent(manga, buildSeedTimestamp(manga))
    if (!seedEvent) continue
    additions.push(seedEvent)
    existingChapterHistory.add(manga.id)
  }

  if (additions.length === 0) return false
  setStatisticsEvents(appendStatisticsEvents(events, additions))
  return true
}

export function recordStatisticsForCreate(manga: Manga, at: number): void {
  appendStoredEvents(buildCreateStatisticsEvents(manga, at))
}

export function recordStatisticsForRestore(manga: Manga, at: number): void {
  appendStoredEvents(buildRestoreStatisticsEvents(manga, at))
}

export function recordStatisticsForDelete(manga: Manga, at: number): void {
  ensureChapterSeedForManga(manga)
  appendStoredEvents(buildDeleteStatisticsEvents(manga, at))
}

export function recordStatisticsForUpdate(before: Manga, after: Manga, at: number): void {
  const additions: StatisticsEvent[] = []

  if (!hasChapterHistory(getStatisticsEvents(), before.id)) {
    const seedEvent = createSyntheticChapterSeedEvent(before, buildSeedTimestamp(before))
    if (seedEvent) additions.push(seedEvent)
  }

  additions.push(...buildUpdateStatisticsEvents(before, after, at))
  appendStoredEvents(additions)
}

export function recordStatisticsForImportedManga(manga: Manga, at: number): void {
  appendStoredEvents(buildCreateStatisticsEvents(manga, at))
}

async function fetchMangaDexTags(mangaDexId: string): Promise<string[]> {
  const response = await electronSession.defaultSession.fetch(
    `https://api.mangadex.org/manga/${mangaDexId}?includes[]=cover_art&includes[]=author&includes[]=artist`,
    { headers: { 'User-Agent': 'MangaTracker/1.0' } }
  )
  if (!response.ok) throw new Error(`MangaDex HTTP ${response.status}`)

  const json = (await response.json()) as {
    data?: {
      attributes?: {
        tags?: Array<{
          attributes?: {
            name?: Record<string, string>
          }
        }>
      }
    }
  }

  return (json.data?.attributes?.tags ?? [])
    .map((tag) => tag.attributes?.name?.en ?? Object.values(tag.attributes?.name ?? {})[0] ?? '')
    .filter(Boolean)
}

async function fetchComickTags(comickHid: string): Promise<string[]> {
  const response = await electronSession.defaultSession.fetch(
    `https://api.comick.dev/comic/${comickHid}?tachiyomi=true`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://comick.dev/'
      }
    }
  )
  if (!response.ok) throw new Error(`ComicK HTTP ${response.status}`)

  const json = (await response.json()) as Record<string, unknown>
  const comic = (json.comic ?? json) as { genres?: Array<{ name?: string }> }
  return Array.isArray(comic.genres)
    ? comic.genres.map((tag) => tag.name ?? '').filter(Boolean)
    : []
}

function areTagListsEqual(left: string[] | null | undefined, right: string[] | null | undefined): boolean {
  const normalizedLeft = normalizeTagList(left)
  const normalizedRight = normalizeTagList(right)
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((tag, index) => tag === normalizedRight[index])
}

async function collectTagsForLibrary(mangaList: Manga[]): Promise<Record<string, number>> {
  const tagCounts: Record<string, number> = {}

  for (const manga of mangaList) {
    const storedTags = normalizeTagList(manga.tags)
    try {
      const primaryTags = storedTags.length > 0
        ? storedTags
        : manga.mangaDexId
          ? await fetchMangaDexTags(manga.mangaDexId)
          : manga.comickHid
            ? await fetchComickTags(manga.comickHid)
            : []

      const tags = primaryTags.length === 0 && manga.mangaDexId && manga.comickHid
        ? await fetchComickTags(manga.comickHid)
        : primaryTags

      for (const rawTag of tags) {
        const tag = normalizeTagName(rawTag)
        if (!tag) continue
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
      }
    } catch {
      for (const rawTag of storedTags) {
        const tag = normalizeTagName(rawTag)
        if (!tag) continue
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
      }
    }
  }

  return tagCounts
}

export async function refreshLibraryMetadata(): Promise<MetadataRefreshResult> {
  const mangaList = (store.get('mangaList') ?? []) as Manga[]
  const nextList: Manga[] = []
  let updatedCount = 0
  let scannedCount = 0

  for (const manga of mangaList) {
    if (!manga.mangaDexId && !manga.comickHid) {
      nextList.push(manga)
      continue
    }

    scannedCount += 1

    const requests: Promise<string[]>[] = []
    if (manga.mangaDexId) requests.push(fetchMangaDexTags(manga.mangaDexId))
    if (manga.comickHid) requests.push(fetchComickTags(manga.comickHid))

    const settled = await Promise.allSettled(requests)
    const fetchedTags = normalizeTagList(
      settled
        .filter((result): result is PromiseFulfilledResult<string[]> => result.status === 'fulfilled')
        .flatMap((result) => result.value)
    )

    if (settled.every((result) => result.status === 'rejected')) {
      nextList.push(manga)
      continue
    }

    if (areTagListsEqual(manga.tags, fetchedTags)) {
      nextList.push(manga)
      continue
    }

    updatedCount += 1
    nextList.push({
      ...manga,
      tags: fetchedTags.length > 0 ? fetchedTags : undefined,
      updatedAt: Date.now()
    })
  }

  const sourceKey = getStatisticsSourceKey(nextList)
  const cache: StatisticsTagCache = {
    fetchedAt: Date.now(),
    sourceKey,
    tags: sourceKey ? await collectTagsForLibrary(nextList) : buildStoredTagMap(nextList)
  }

  store.set('mangaList', nextList)
  setStatisticsTagCache(cache)
  broadcastStatsUpdated()

  return {
    items: nextList,
    updatedCount,
    scannedCount
  }
}

export async function refreshStatisticsTags(): Promise<StatisticsTagCache | null> {
  if (tagRefreshPromise) return tagRefreshPromise

  tagRefreshPromise = (async () => {
    const mangaList = (store.get('mangaList') ?? []) as Manga[]
    const sourceKey = getStatisticsSourceKey(mangaList)
    const cache: StatisticsTagCache = {
      fetchedAt: Date.now(),
      sourceKey,
      tags: sourceKey ? await collectTagsForLibrary(mangaList) : buildStoredTagMap(mangaList)
    }

    setStatisticsTagCache(cache)
    return cache
  })()

  try {
    return await tagRefreshPromise
  } finally {
    tagRefreshPromise = null
    broadcastStatsUpdated()
  }
}

export async function getStatisticsOverview(): Promise<StatisticsOverview> {
  const mangaList = (store.get('mangaList') ?? []) as Manga[]
  const mangaTrash = (store.get('mangaTrash') ?? []) as TrashedManga[]
  const seedsAdded = ensureSnapshotSeeds(mangaList, mangaTrash)
  const events = getStatisticsEvents()
  const tagCache = getStatisticsTagCache()

  if ((seedsAdded || shouldRefreshTagCache(mangaList, tagCache)) && !tagRefreshPromise) {
    void refreshStatisticsTags()
  }

  const settings = store.get('settings') as AppSettings | undefined
  const gistSynced = Boolean(settings?.lastGistSync && settings.lastGistSync > 0)

  const overview = buildStatisticsOverview(
    mangaList,
    mangaTrash,
    events,
    tagCache,
    tagRefreshPromise !== null,
    gistSynced
  )

  // Achievements are permanent — once earned, never lost
  const earned = new Set<string>(store.get('earnedAchievements') ?? [])
  let changed = false
  overview.achievements = overview.achievements.map((a) => {
    if (a.unlocked && !earned.has(a.id)) {
      earned.add(a.id)
      changed = true
    }
    return { ...a, unlocked: a.unlocked || earned.has(a.id) }
  })
  if (changed) store.set('earnedAchievements', [...earned])

  return overview
}

// ── Debug helpers ─────────────────────────────────────────────────────────────

export function debugResetStats(): void {
  setStatisticsEvents([])
  store.set('earnedAchievements', [])
  setStatisticsTagCache(null)
  broadcastStatsUpdated()
}

export function debugResetAchievements(): void {
  store.set('earnedAchievements', [])
  broadcastStatsUpdated()
}

export function debugSetChapters(chapters: number): void {
  const amount = Math.max(0, Math.round(chapters))
  const event: StatisticsEvent = {
    id: 'debug:chapter-inject',
    type: 'chapter_progress',
    mangaId: '__debug__',
    at: Date.now(),
    synthetic: true,
    amount,
    fromChapter: 0,
    toChapter: amount
  }
  setStatisticsEvents([event])
  store.set('earnedAchievements', [])
  setStatisticsTagCache(null)
  broadcastStatsUpdated()
}
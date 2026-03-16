/**
 * Mobile Storage Service - nutzt @capacitor/preferences fuer einfache Key-Value Daten
 * und @capacitor/filesystem fuer groessere JSON-Dateien (Manga-Liste).
 */
import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import type { AppSettings, Manga, StatisticsEvent, StatisticsTagCache, TrashedManga } from '../../../../types/index'
import { normalizeMangaList, normalizeTagCache, normalizeTrashedMangaList } from '../../../../shared/manga'

const MANGA_FILE = 'manga-list.json'
const MANGA_TRASH_FILE = 'manga-trash.json'
const STATS_EVENTS_FILE = 'stats-events.json'
const STATS_TAG_CACHE_FILE = 'stats-tag-cache.json'
const LEGACY_STATS_TAG_CACHE_FILE = 'stats-genre-cache.json'
const SETTINGS_KEY = 'app-settings'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'de',
  readBehavior: 'ask',
  domainWhitelist: [],
  domainBlocklist: [],
  notificationIntervalMs: 3_600_000,
  notificationsEnabled: true,
  backgroundNotificationsEnabled: false,
  autoLinkEnabled: false,
  desktopNotificationsEnabled: true,
  readerInSeparateWindow: false,
  elementPickerEnabled: false,
  blockNewWindows: true,
  titleExpand: true,
  gistSyncEnabled: false,
  gistAutoSync: false,
  githubToken: '',
  gistId: '',
  lastGistSync: 0
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Data,
      encoding: Encoding.UTF8
    })
    return JSON.parse(result.data as string) as T
  } catch {
    return fallback
  }
}

async function writeJsonFile<T>(path: string, data: T): Promise<void> {
  await Filesystem.writeFile({
    path,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    data: JSON.stringify(data),
    recursive: true
  })
}

const MANGA_BG_KEY = 'manga-list'

export async function getMangaList(): Promise<Manga[]> {
  const { value } = await Preferences.get({ key: MANGA_BG_KEY })
  if (value) {
    try {
      const raw = JSON.parse(value) as unknown
      const normalized = normalizeMangaList(raw)
      if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
        await Preferences.set({ key: MANGA_BG_KEY, value: JSON.stringify(normalized) })
        await writeJsonFile(MANGA_FILE, normalized)
      }
      return normalized
    } catch {
      // fall through
    }
  }

  const fromFileRaw = await readJsonFile<unknown>(MANGA_FILE, [])
  const fromFile = normalizeMangaList(fromFileRaw)
  if (JSON.stringify(fromFileRaw) !== JSON.stringify(fromFile)) {
    await writeJsonFile(MANGA_FILE, fromFile)
  }
  if (fromFile.length > 0) {
    await Preferences.set({ key: MANGA_BG_KEY, value: JSON.stringify(fromFile) })
  }
  return fromFile
}

export async function setMangaList(list: Manga[]): Promise<void> {
  await Preferences.set({ key: MANGA_BG_KEY, value: JSON.stringify(list) })
  await writeJsonFile(MANGA_FILE, list)
}

export async function getMangaTrash(): Promise<TrashedManga[]> {
  const raw = await readJsonFile<unknown>(MANGA_TRASH_FILE, [])
  const trash = normalizeTrashedMangaList(raw)
  if (JSON.stringify(raw) !== JSON.stringify(trash)) {
    await writeJsonFile(MANGA_TRASH_FILE, trash)
  }
  return trash
}

export async function setMangaTrash(trash: TrashedManga[]): Promise<void> {
  await writeJsonFile(MANGA_TRASH_FILE, trash)
}

export async function getStatsEvents(): Promise<StatisticsEvent[]> {
  return readJsonFile<StatisticsEvent[]>(STATS_EVENTS_FILE, [])
}

export async function setStatsEvents(events: StatisticsEvent[]): Promise<void> {
  await writeJsonFile(STATS_EVENTS_FILE, events)
}

export async function getStatsTagCache(): Promise<StatisticsTagCache | null> {
  const raw = await readJsonFile<unknown>(STATS_TAG_CACHE_FILE, null)
  if (raw !== null) {
    const cache = normalizeTagCache(raw)
    if (JSON.stringify(raw) !== JSON.stringify(cache)) {
      await writeJsonFile(STATS_TAG_CACHE_FILE, cache)
    }
    return cache
  }

  const legacyRaw = await readJsonFile<unknown>(LEGACY_STATS_TAG_CACHE_FILE, null)
  const legacyCache = normalizeTagCache(legacyRaw)
  if (legacyCache) {
    await writeJsonFile(STATS_TAG_CACHE_FILE, legacyCache)
  }
  return legacyCache
}

export async function setStatsTagCache(cache: StatisticsTagCache | null): Promise<void> {
  await writeJsonFile(STATS_TAG_CACHE_FILE, cache)
}

export async function getSettings(): Promise<AppSettings> {
  const { value } = await Preferences.get({ key: SETTINGS_KEY })
  if (!value) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...(JSON.parse(value) as Partial<AppSettings>) }
}

export async function setSettings(updates: Partial<AppSettings>): Promise<void> {
  const current = await getSettings()
  await Preferences.set({ key: SETTINGS_KEY, value: JSON.stringify({ ...current, ...updates }) })
}

export async function exportMangaListJson(): Promise<string> {
  const list = await getMangaList()
  return JSON.stringify(list, null, 2)
}

export async function writeMangaExportFile(): Promise<string> {
  const json = await exportMangaListJson()
  const result = await Filesystem.writeFile({
    path: 'manga-export.json',
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    data: json
  })
  return result.uri
}
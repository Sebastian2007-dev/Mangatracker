/**
 * Mobile Storage Service — nutzt @capacitor/preferences für einfache Key-Value Daten
 * und @capacitor/filesystem für größere JSON-Dateien (Manga-Liste).
 */
import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import type { Manga, AppSettings } from '../../../../types/index'

const MANGA_FILE = 'manga-list.json'
const MANGA_TRASH_FILE = 'manga-trash.json'
const SETTINGS_KEY = 'app-settings'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'de',
  readBehavior: 'ask',
  domainWhitelist: [],
  domainBlocklist: [],
  notificationIntervalMs: 3_600_000,
  notificationsEnabled: true,
  desktopNotificationsEnabled: true,
  readerInSeparateWindow: false,
  elementPickerEnabled: false,
  blockNewWindows: true,
  titleExpand: true
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

// Key used by background runner (CapacitorKV = same as Preferences)
const MANGA_BG_KEY = 'manga-list'

export async function getMangaList(): Promise<Manga[]> {
  // Try Preferences first so background runner updates are picked up on resume
  const { value } = await Preferences.get({ key: MANGA_BG_KEY })
  if (value) {
    try { return JSON.parse(value) as Manga[] } catch { /* fall through */ }
  }
  // Fall back to filesystem (first launch or migration)
  const fromFile = await readJsonFile<Manga[]>(MANGA_FILE, [])
  if (fromFile.length > 0) {
    await Preferences.set({ key: MANGA_BG_KEY, value: JSON.stringify(fromFile) })
  }
  return fromFile
}

export async function setMangaList(list: Manga[]): Promise<void> {
  // Write to both: Preferences (accessible by background runner) + filesystem (backup)
  await Preferences.set({ key: MANGA_BG_KEY, value: JSON.stringify(list) })
  await writeJsonFile(MANGA_FILE, list)
}

export async function getMangaTrash(): Promise<Manga[]> {
  return readJsonFile<Manga[]>(MANGA_TRASH_FILE, [])
}

export async function setMangaTrash(trash: Manga[]): Promise<void> {
  await writeJsonFile(MANGA_TRASH_FILE, trash)
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

/** Gibt den absoluten Dateipfad der Exportdatei zurück (für @capacitor/share). */
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

import type { Manga, MangaStatus, TrashedManga } from '../../../../types/index'
import { getMangaList, getMangaTrash, setMangaList, setMangaTrash } from './storage.service'
import { normalizeTagList } from '../../../../shared/statistics'
import {
  notifyStatsUpdated,
  refreshLibraryMetadata,
  recordStatisticsForCreate,
  recordStatisticsForDelete,
  recordStatisticsForImportedManga,
  recordStatisticsForRestore,
  recordStatisticsForUpdate
} from './stats.service'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickFirst(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key]
  }
  return undefined
}

function toStringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function toNumberValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toBooleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false
  }
  return fallback
}

function toStringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return normalizeTagList(value.filter((entry): entry is string => typeof entry === 'string'))
}

function normalizeStatus(value: unknown): MangaStatus {
  const normalized = toStringValue(value, 'reading')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (normalized === 'reading' || normalized === 'read') return 'reading'
  if (normalized === 'plan_to_read' || normalized === 'plan_read' || normalized === 'planned') return 'plan_to_read'
  if (normalized === 'hiatus' || normalized === 'on_hold') return 'hiatus'
  if (normalized === 'completed' || normalized === 'complete' || normalized === 'finished') return 'completed'
  if (normalized === 'rereading' || normalized === 're_reading' || normalized === 'reread') return 'rereading'
  return 'reading'
}

function normalizeImportedEntry(entry: unknown): Manga | null {
  if (!isObject(entry)) return null

  const now = Date.now()
  const title = toStringValue(pickFirst(entry, ['title', 'Title']))
  if (!title) return null

  const currentChapter = toNumberValue(pickFirst(entry, ['currentChapter', 'CurrentChapter', 'chapter', 'Chapter']), 0)
  const chapterUrlTemplate = toStringValue(pickFirst(entry, ['chapterUrlTemplate', 'ChapterUrlTemplate']), '')
  const hasNewChapter = toBooleanValue(pickFirst(entry, ['hasNewChapter', 'HasNewChapter']), false)
  const isFocused = toBooleanValue(pickFirst(entry, ['isFocused', 'IsFocused']), false)
  const lastCheckedChapter = toNumberValue(
    pickFirst(entry, ['lastCheckedChapter', 'LastCheckedChapter']),
    currentChapter
  )

  const importedId = toStringValue(pickFirst(entry, ['id', 'Id']), '')
  return {
    id: importedId || crypto.randomUUID(),
    title,
    mainUrl: toStringValue(pickFirst(entry, ['mainUrl', 'MainUrl', 'url', 'Url']), ''),
    chapterUrlTemplate,
    status: normalizeStatus(pickFirst(entry, ['status', 'Status'])),
    isFocused,
    currentChapter,
    hasNewChapter,
    lastCheckedChapter,
    createdAt: toNumberValue(pickFirst(entry, ['createdAt', 'CreatedAt']), now),
    updatedAt: toNumberValue(pickFirst(entry, ['updatedAt', 'UpdatedAt']), now),
    mangaDexId: toStringValue(pickFirst(entry, ['mangaDexId']), '') || undefined,
    mangaDexTitle: toStringValue(pickFirst(entry, ['mangaDexTitle']), '') || undefined,
    mangaDexCoverUrl: toStringValue(pickFirst(entry, ['mangaDexCoverUrl']), '') || undefined,
    comickHid: toStringValue(pickFirst(entry, ['comickHid']), '') || undefined,
    comickTitle: toStringValue(pickFirst(entry, ['comickTitle']), '') || undefined,
    comickCoverUrl: toStringValue(pickFirst(entry, ['comickCoverUrl']), '') || undefined,
    tags: toStringArrayValue(pickFirst(entry, ['tags', 'Tags', 'genres', 'Genres']))
  }
}

function normalizeImportData(parsed: unknown): Manga[] {
  let rawEntries: unknown[] = []

  if (Array.isArray(parsed)) {
    rawEntries = parsed
  } else if (isObject(parsed)) {
    if (Array.isArray(parsed.mangaList)) rawEntries = parsed.mangaList
    else if (Array.isArray(parsed.items)) rawEntries = parsed.items
  }

  return rawEntries
    .map((entry) => normalizeImportedEntry(entry))
    .filter((entry): entry is Manga => entry !== null)
}

export async function getAll(): Promise<{ success: boolean; data: Manga[] }> {
  return { success: true, data: await getMangaList() }
}

export async function create(
  payload: Omit<Manga, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; data: Manga }> {
  const now = Date.now()
  const manga: Manga = {
    ...payload,
    isFocused: payload.isFocused ?? false,
    tags: normalizeTagList(payload.tags),
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now
  }
  const list = await getMangaList()
  await setMangaList([...list, manga])
  await recordStatisticsForCreate(manga, now)
  notifyStatsUpdated()
  return { success: true, data: manga }
}

export async function createWithId(payload: Manga): Promise<{ success: boolean; data: Manga }> {
  const list = await getMangaList()
  const normalizedPayload: Manga = { ...payload, tags: normalizeTagList(payload.tags) }
  const trash = (await getMangaTrash()).filter((manga) => manga.id !== normalizedPayload.id)
  await setMangaTrash(trash)
  await setMangaList([...list, normalizedPayload])
  await recordStatisticsForRestore(normalizedPayload, Date.now())
  notifyStatsUpdated()
  return { success: true, data: normalizedPayload }
}

export async function update(
  payload: { id: string } & Partial<Manga>
): Promise<{ success: boolean; data?: Manga; error?: string }> {
  const { id, ...updates } = payload
  const list = await getMangaList()
  const index = list.findIndex((manga) => manga.id === id)
  if (index === -1) return { success: false, error: 'Not found' }

  const before = list[index]
  const updated: Manga = {
    ...before,
    ...updates,
    tags: updates.tags === undefined ? before.tags : normalizeTagList(updates.tags),
    id,
    updatedAt: Date.now()
  }
  list[index] = updated
  await setMangaList(list)
  await recordStatisticsForUpdate(before, updated, updated.updatedAt)
  notifyStatsUpdated()
  return { success: true, data: updated }
}

export async function deleteManga({ id }: { id: string }): Promise<{ success: boolean; error?: string }> {
  const list = await getMangaList()
  const manga = list.find((entry) => entry.id === id)
  if (!manga) return { success: false, error: 'Not found' }

  const trash = await getMangaTrash()
  const trashedManga: TrashedManga = { ...manga, deletedAt: Date.now() }
  await setMangaTrash([...trash, trashedManga])
  await setMangaList(list.filter((entry) => entry.id !== id))
  await recordStatisticsForDelete(manga, trashedManga.deletedAt)
  notifyStatsUpdated()
  return { success: true }
}

export async function emptyTrash({ id }: { id: string }): Promise<{ success: boolean }> {
  const trash = (await getMangaTrash()).filter((manga) => manga.id !== id)
  await setMangaTrash(trash)
  notifyStatsUpdated()
  return { success: true }
}

export async function moveItem(
  { fromId, toId }: { fromId: string; toId: string }
): Promise<{ success: boolean }> {
  const list = [...(await getMangaList())]
  const fromIndex = list.findIndex((manga) => manga.id === fromId)
  if (fromIndex === -1) return { success: false }
  const [item] = list.splice(fromIndex, 1)
  const toIndex = list.findIndex((manga) => manga.id === toId)
  list.splice(toIndex === -1 ? list.length : toIndex, 0, item)
  await setMangaList(list)
  return { success: true }
}

export async function refreshMetadata(): Promise<{
  success: boolean
  data?: Awaited<ReturnType<typeof refreshLibraryMetadata>>
  error?: string
}> {
  try {
    return { success: true, data: await refreshLibraryMetadata() }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function exportList(): Promise<{ success: boolean; data: string }> {
  const list = await getMangaList()
  return { success: true, data: JSON.stringify(list, null, 2) }
}

export async function importList(
  { json }: { json: string }
): Promise<{ success: boolean; data?: Manga[]; error?: string }> {
  try {
    const parsed = JSON.parse(json) as unknown
    const imported = normalizeImportData(parsed)
    if (imported.length === 0) {
      return { success: false, error: 'No valid manga entries found in import file' }
    }

    const existing = await getMangaList()
    const existingMap = new Map(existing.map((manga) => [manga.id, manga]))
    const newlyAdded: Manga[] = []

    for (const manga of imported) {
      if (!existingMap.has(manga.id)) newlyAdded.push(manga)
      existingMap.set(manga.id, manga)
    }

    const merged = Array.from(existingMap.values())
    await setMangaList(merged)

    const importedAt = Date.now()
    for (const manga of newlyAdded) {
      await recordStatisticsForImportedManga(manga, importedAt)
    }
    notifyStatsUpdated()

    return { success: true, data: merged }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

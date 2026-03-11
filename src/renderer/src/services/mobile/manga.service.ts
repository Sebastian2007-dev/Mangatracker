/**
 * Mobile Manga Service — Port von src/main/ipc/manga.ipc.ts
 * Kein Electron/Node.js — reines TypeScript mit Capacitor Storage.
 */
import type { Manga, MangaStatus } from '../../../../types/index'
import { getMangaList, setMangaList, getMangaTrash, setMangaTrash } from './storage.service'

// ─── Hilfsfunktionen (identisch zu manga.ipc.ts) ───────────────────────────

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
    updatedAt: toNumberValue(pickFirst(entry, ['updatedAt', 'UpdatedAt']), now)
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

// ─── Service-Operationen ───────────────────────────────────────────────────

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
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now
  }
  const list = await getMangaList()
  await setMangaList([...list, manga])
  return { success: true, data: manga }
}

export async function createWithId(payload: Manga): Promise<{ success: boolean; data: Manga }> {
  const list = await getMangaList()
  const trash = (await getMangaTrash()).filter((m) => m.id !== payload.id)
  await setMangaTrash(trash)
  await setMangaList([...list, payload])
  return { success: true, data: payload }
}

export async function update(
  payload: { id: string } & Partial<Manga>
): Promise<{ success: boolean; data?: Manga; error?: string }> {
  const { id, ...updates } = payload
  const list = await getMangaList()
  const idx = list.findIndex((m) => m.id === id)
  if (idx === -1) return { success: false, error: 'Not found' }
  const updated: Manga = { ...list[idx], ...updates, id, updatedAt: Date.now() }
  list[idx] = updated
  await setMangaList(list)
  return { success: true, data: updated }
}

export async function deleteManga({ id }: { id: string }): Promise<{ success: boolean; error?: string }> {
  const list = await getMangaList()
  const manga = list.find((m) => m.id === id)
  if (!manga) return { success: false, error: 'Not found' }
  const trash = await getMangaTrash()
  await setMangaTrash([...trash, manga])
  await setMangaList(list.filter((m) => m.id !== id))
  return { success: true }
}

export async function emptyTrash({ id }: { id: string }): Promise<{ success: boolean }> {
  const trash = (await getMangaTrash()).filter((m) => m.id !== id)
  await setMangaTrash(trash)
  return { success: true }
}

export async function moveItem(
  { fromId, toId }: { fromId: string; toId: string }
): Promise<{ success: boolean }> {
  const list = [...(await getMangaList())]
  const fromIdx = list.findIndex((m) => m.id === fromId)
  if (fromIdx === -1) return { success: false }
  const [item] = list.splice(fromIdx, 1)
  const toIdx = list.findIndex((m) => m.id === toId)
  list.splice(toIdx === -1 ? list.length : toIdx, 0, item)
  await setMangaList(list)
  return { success: true }
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
    const existingMap = new Map(existing.map((m) => [m.id, m]))
    for (const m of imported) {
      existingMap.set(m.id, m)
    }
    const merged = Array.from(existingMap.values())
    await setMangaList(merged)
    return { success: true, data: merged }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

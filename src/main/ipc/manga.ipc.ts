import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import store from '../store'
import type { Manga, MangaStatus } from '../../types/index'

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
    id: importedId || randomUUID(),
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

export function registerMangaIpc(): void {
  ipcMain.handle('manga:getAll', () => {
    return { success: true, data: store.get('mangaList') }
  })

  ipcMain.handle('manga:create', (_event, payload: Omit<Manga, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = Date.now()
    const manga: Manga = {
      ...payload,
      isFocused: payload.isFocused ?? false,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    }
    const list = store.get('mangaList')
    store.set('mangaList', [...list, manga])
    return { success: true, data: manga }
  })

  ipcMain.handle('manga:createWithId', (_event, payload: Manga) => {
    const list = store.get('mangaList')
    // Remove from trash if restoring
    const trash = store.get('mangaTrash').filter((m) => m.id !== payload.id)
    store.set('mangaTrash', trash)
    store.set('mangaList', [...list, payload])
    return { success: true, data: payload }
  })

  ipcMain.handle('manga:update', (_event, payload: { id: string } & Partial<Manga>) => {
    const { id, ...updates } = payload
    const list = store.get('mangaList')
    const idx = list.findIndex((m) => m.id === id)
    if (idx === -1) return { success: false, error: 'Not found' }
    const updated = { ...list[idx], ...updates, id, updatedAt: Date.now() }
    list[idx] = updated
    store.set('mangaList', list)
    return { success: true, data: updated }
  })

  ipcMain.handle('manga:delete', (_event, { id }: { id: string }) => {
    const list = store.get('mangaList')
    const manga = list.find((m) => m.id === id)
    if (!manga) return { success: false, error: 'Not found' }
    // Move to trash
    const trash = store.get('mangaTrash')
    store.set('mangaTrash', [...trash, manga])
    store.set('mangaList', list.filter((m) => m.id !== id))
    return { success: true }
  })

  ipcMain.handle('manga:emptyTrash', (_event, { id }: { id: string }) => {
    const trash = store.get('mangaTrash').filter((m) => m.id !== id)
    store.set('mangaTrash', trash)
    return { success: true }
  })

  ipcMain.handle('manga:moveItem', (_event, { fromId, toId }: { fromId: string; toId: string }) => {
    const list = [...store.get('mangaList')]
    const fromIdx = list.findIndex((m) => m.id === fromId)
    if (fromIdx === -1) return { success: false }
    const [item] = list.splice(fromIdx, 1)
    const toIdx = list.findIndex((m) => m.id === toId)
    list.splice(toIdx === -1 ? list.length : toIdx, 0, item)
    store.set('mangaList', list)
    return { success: true }
  })

  ipcMain.handle('manga:export', () => {
    const list = store.get('mangaList')
    return { success: true, data: JSON.stringify(list, null, 2) }
  })

  ipcMain.handle('manga:import', (_event, { json }: { json: string }) => {
    try {
      const parsed = JSON.parse(json) as unknown
      const imported = normalizeImportData(parsed)
      if (imported.length === 0) {
        return { success: false, error: 'No valid manga entries found in import file' }
      }

      // Merge: replace existing by id, append new
      const existing = store.get('mangaList')
      const existingMap = new Map(existing.map((m) => [m.id, m]))
      for (const m of imported) {
        existingMap.set(m.id, m)
      }
      const merged = Array.from(existingMap.values())
      store.set('mangaList', merged)
      return { success: true, data: merged }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })
}

import { ipcMain, session as electronSession } from 'electron'
import { randomUUID } from 'crypto'
import store from '../store'
import type { Manga, MangaStatus, TrashedManga } from '../../types/index'
import { emitModEvent } from '../mods/mod-loader'
import { normalizeTagList } from '../../shared/statistics'
import {
  notifyStatsUpdated,
  refreshLibraryMetadata,
  recordStatisticsForCreate,
  recordStatisticsForDelete,
  recordStatisticsForImportedManga,
  recordStatisticsForRestore,
  recordStatisticsForUpdate
} from '../stats.service'

function registerHandler(
  channel: string,
  listener: Parameters<typeof ipcMain.handle>[1]
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, listener)
}

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

export function registerMangaIpc(): void {
  registerHandler('manga:getAll', () => {
    return { success: true, data: store.get('mangaList') }
  })

  registerHandler('manga:create', (_event, payload: Omit<Manga, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = Date.now()
    const manga: Manga = {
      ...payload,
      isFocused: payload.isFocused ?? false,
      tags: normalizeTagList(payload.tags),
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    }
    const list = store.get('mangaList')
    store.set('mangaList', [...list, manga])
    emitModEvent('manga:created', manga)
    recordStatisticsForCreate(manga, now)
    notifyStatsUpdated()
    return { success: true, data: manga }
  })

  registerHandler('manga:createWithId', (_event, payload: Manga) => {
    const list = store.get('mangaList')
    const normalizedPayload: Manga = { ...payload, tags: normalizeTagList(payload.tags) }
    // Remove from trash if restoring
    const trash = store.get('mangaTrash').filter((m) => m.id !== normalizedPayload.id)
    store.set('mangaTrash', trash)
    store.set('mangaList', [...list, normalizedPayload])
    recordStatisticsForRestore(normalizedPayload, Date.now())
    notifyStatsUpdated()
    return { success: true, data: normalizedPayload }
  })

  registerHandler('manga:update', (_event, payload: { id: string } & Partial<Manga>) => {
    const { id, ...updates } = payload
    const list = store.get('mangaList')
    const idx = list.findIndex((m) => m.id === id)
    if (idx === -1) return { success: false, error: 'Not found' }
    const before = list[idx]
    const updated = {
      ...before,
      ...updates,
      tags: updates.tags === undefined ? before.tags : normalizeTagList(updates.tags),
      id,
      updatedAt: Date.now()
    }
    list[idx] = updated
    store.set('mangaList', list)
    emitModEvent('manga:updated', updated)
    recordStatisticsForUpdate(before, updated, updated.updatedAt)
    notifyStatsUpdated()
    return { success: true, data: updated }
  })

  registerHandler('manga:delete', (_event, { id }: { id: string }) => {
    const list = store.get('mangaList')
    const manga = list.find((m) => m.id === id)
    if (!manga) return { success: false, error: 'Not found' }
    // Move to trash with a deletion timestamp so tombstone comparison works correctly
    const trash = store.get('mangaTrash') as TrashedManga[]
    const trashEntry: TrashedManga = { ...manga, deletedAt: Date.now() }
    store.set('mangaTrash', [...trash, trashEntry])
    store.set('mangaList', list.filter((m) => m.id !== id))
    emitModEvent('manga:deleted', { id })
    recordStatisticsForDelete(manga, trashEntry.deletedAt)
    notifyStatsUpdated()
    return { success: true }
  })

  registerHandler('manga:emptyTrash', (_event, { id }: { id: string }) => {
    const trash = store.get('mangaTrash').filter((m) => m.id !== id)
    store.set('mangaTrash', trash)
    notifyStatsUpdated()
    return { success: true }
  })

  registerHandler('manga:moveItem', (_event, { fromId, toId }: { fromId: string; toId: string }) => {
    const list = [...store.get('mangaList')]
    const fromIdx = list.findIndex((m) => m.id === fromId)
    if (fromIdx === -1) return { success: false }
    const [item] = list.splice(fromIdx, 1)
    const toIdx = list.findIndex((m) => m.id === toId)
    list.splice(toIdx === -1 ? list.length : toIdx, 0, item)
    store.set('mangaList', list)
    return { success: true }
  })

  registerHandler('manga:refreshMetadata', async () => {
    try {
      return { success: true, data: await refreshLibraryMetadata() }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  registerHandler('manga:export', () => {
    const list = store.get('mangaList')
    return { success: true, data: JSON.stringify(list, null, 2) }
  })

  registerHandler('mangadex:search', async (_event, { title }: { title: string }) => {
    try {
      const url =
        `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=10&includes[]=cover_art`
      const res = await electronSession.defaultSession.fetch(url, {
        headers: { 'User-Agent': 'MangaTracker/1.0 (personal hobby app)' }
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const json = (await res.json()) as {
        data: {
          id: string
          attributes: { title: Record<string, string> }
          relationships: { type: string; attributes?: { fileName?: string } }[]
        }[]
      }
      const results = (json.data ?? []).map((item) => {
        const coverRel = item.relationships.find((r) => r.type === 'cover_art')
        const coverFile = coverRel?.attributes?.fileName
        return {
          id: item.id,
          title: item.attributes.title?.en ?? Object.values(item.attributes.title ?? {})[0] ?? item.id,
          coverUrl: coverFile
            ? `https://uploads.mangadex.org/covers/${item.id}/${coverFile}.256.jpg`
            : null
        }
      })
      return { success: true, data: results }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  registerHandler('comick:search', async (_event, { title }: { title: string }) => {
    try {
      const url = `https://api.comick.dev/v1.0/search?q=${encodeURIComponent(title)}&limit=10&tachiyomi=true`
      const res = await electronSession.defaultSession.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://comick.dev/'
        }
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const json = (await res.json()) as unknown
      const items: { hid: string; title: string; md_covers?: { b2key: string }[] }[] =
        Array.isArray(json) ? json : Array.isArray((json as { data?: unknown[] }).data) ? (json as { data: { hid: string; title: string; md_covers?: { b2key: string }[] }[] }).data : []
      const results = items.map((item) => ({
        id: item.hid,
        title: item.title,
        coverUrl: item.md_covers?.[0]?.b2key
          ? `https://meo.comick.pictures/${item.md_covers[0].b2key}`
          : null
      }))
      return { success: true, data: results }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  registerHandler('mangadex:details', async (_event, { id }: { id: string }) => {
    try {
      const url = `https://api.mangadex.org/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`
      const res = await electronSession.defaultSession.fetch(url, {
        headers: { 'User-Agent': 'MangaTracker/1.0' }
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const json = (await res.json()) as {
        data: {
          attributes: {
            description: Record<string, string>
            status: string
            originalLanguage: string
            year: number | null
            publicationDemographic: string | null
            tags: { attributes: { name: Record<string, string>; group: { name: string } } }[]
          }
          relationships: { type: string; attributes?: { name?: string } }[]
        }
      }
      const attr = json.data?.attributes
      if (!attr) return { success: false, error: 'No data' }
      const desc = attr.description?.en ?? Object.values(attr.description ?? {})[0] ?? ''
      const langToType = (lang: string) => {
        if (lang === 'ko') return 'manhwa'
        if (lang === 'zh' || lang === 'zh-hk') return 'manhua'
        return 'manga'
      }
      const tags = (attr.tags ?? [])
        .map((t) => t.attributes?.name?.en ?? Object.values(t.attributes?.name ?? {})[0])
        .filter(Boolean) as string[]
      const authors = [...new Set(
        (json.data?.relationships ?? [])
          .filter((r) => r.type === 'author' || r.type === 'artist')
          .map((r) => r.attributes?.name)
          .filter(Boolean) as string[]
      )]
      return {
        success: true,
        data: {
          description: desc,
          status: attr.status ?? null,
          type: langToType(attr.originalLanguage ?? ''),
          latestChapter: null as number | null,
          tags,
          authors,
          year: attr.year ?? null,
          demographic: attr.publicationDemographic ?? null
        }
      }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  registerHandler('comick:details', async (_event, { hid }: { hid: string }) => {
    try {
      const url = `https://api.comick.dev/comic/${hid}?tachiyomi=true`
      const res = await electronSession.defaultSession.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://comick.dev/'
        }
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const json = (await res.json()) as Record<string, unknown>
      const comic = (json.comic ?? json) as Record<string, unknown>
      const statusMap: Record<number, string> = { 1: 'ongoing', 2: 'completed', 3: 'cancelled', 4: 'hiatus' }
      const countryMap: Record<string, string> = { kr: 'manhwa', jp: 'manga', zh: 'manhua', cn: 'manhua' }
      const tags = Array.isArray(comic.genres) ? (comic.genres as { name?: string }[]).map((g) => g.name ?? '').filter(Boolean) : []
      const authors: string[] = []
      if (typeof comic.author === 'string' && comic.author) authors.push(comic.author)
      if (typeof comic.artist === 'string' && comic.artist && comic.artist !== comic.author) authors.push(comic.artist)
      if (Array.isArray(comic.md_authors)) {
        for (const a of comic.md_authors as { name?: string }[]) {
          if (a.name && !authors.includes(a.name)) authors.push(a.name)
        }
      }
      return {
        success: true,
        data: {
          description: (comic.desc as string) ?? (comic.description as string) ?? '',
          status: statusMap[(comic.status as number)] ?? null,
          type: countryMap[(comic.country as string)] ?? null,
          latestChapter: (comic.last_chapter as number) ?? null,
          tags,
          authors,
          year: (comic.year as number) ?? null,
          demographic: null as string | null
        }
      }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  registerHandler('manga:import', (_event, { json }: { json: string }) => {
    try {
      const parsed = JSON.parse(json) as unknown
      const imported = normalizeImportData(parsed)
      if (imported.length === 0) {
        return { success: false, error: 'No valid manga entries found in import file' }
      }

      // Merge: replace existing by id, append new
      const existing = store.get('mangaList')
      const existingMap = new Map(existing.map((m) => [m.id, m]))
      const newlyAdded: Manga[] = []
      for (const m of imported) {
        if (!existingMap.has(m.id)) newlyAdded.push(m)
        existingMap.set(m.id, m)
      }
      const merged = Array.from(existingMap.values())
      store.set('mangaList', merged)
      const importedAt = Date.now()
      for (const manga of newlyAdded) {
        recordStatisticsForImportedManga(manga, importedAt)
      }
      notifyStatsUpdated()
      return { success: true, data: merged }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })
}

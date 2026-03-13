/**
 * Capacitor Adapter — implementiert PlatformBridge für Android/iOS.
 * Mappt alle IPC-Channel-Namen direkt auf die Mobile Services.
 *
 * Wird in src/renderer/src/main.mobile.ts per setBridge() registriert.
 */
import type { PlatformBridge } from './platform'
import * as mangaService from './mobile/manga.service'
import * as settingsService from './mobile/settings.service'
import * as gistService from './mobile/gist.service'
import { runPoll } from './mobile/poller.service'
import { writeMangaExportFile } from './mobile/storage.service'
import { Share } from '@capacitor/share'

// ─── Event-Bus für interne Ereignisse (ersetzt Electron IPC events) ────────

type EventHandler = (...args: unknown[]) => void
const eventBus = new Map<string, Set<EventHandler>>()

function emit(channel: string, ...args: unknown[]): void {
  const handlers = eventBus.get(channel)
  if (handlers) {
    for (const handler of handlers) handler(...args)
  }
}

function busOn(channel: string, handler: EventHandler): () => void {
  if (!eventBus.has(channel)) eventBus.set(channel, new Set())
  eventBus.get(channel)!.add(handler)
  return () => eventBus.get(channel)?.delete(handler)
}

// ─── Settings listener weiterleiten ───────────────────────────────────────

settingsService.onSettingsChanged((settings) => {
  emit('settings:changed', settings)
})

// ─── Invoke-Handler Map ───────────────────────────────────────────────────

type Handler = (payload?: unknown) => Promise<unknown>

const handlers: Record<string, Handler> = {
  'manga:getAll': () => mangaService.getAll(),
  'manga:create': (p) => mangaService.create(p as Parameters<typeof mangaService.create>[0]),
  'manga:createWithId': (p) => mangaService.createWithId(p as Parameters<typeof mangaService.createWithId>[0]),
  'manga:update': (p) => mangaService.update(p as Parameters<typeof mangaService.update>[0]),
  'manga:delete': (p) => mangaService.deleteManga(p as { id: string }),
  'manga:emptyTrash': (p) => mangaService.emptyTrash(p as { id: string }),
  'manga:moveItem': (p) => mangaService.moveItem(p as { fromId: string; toId: string }),
  'manga:export': async () => {
    // Auf Mobile: Datei schreiben und Share-Dialog öffnen, dann JSON zurückgeben
    try {
      const uri = await writeMangaExportFile()
      await Share.share({ url: uri, title: 'Manga Liste exportieren' })
    } catch {
      // Share abgebrochen oder nicht verfügbar — ignorieren
    }
    return mangaService.exportList()
  },
  'manga:import': (p) => mangaService.importList(p as { json: string }),
  'manga:scanNow': () => runPoll(true).then(() => ({ success: true })),

  'mangadex:search': async (p) => {
    const { title } = p as { title: string }
    const url =
      `https://api.mangadex.org/manga` +
      `?title=${encodeURIComponent(title)}&limit=10&includes[]=cover_art`
    try {
      const res = await fetch(url, {
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
        const coverUrl = coverFile
          ? `https://uploads.mangadex.org/covers/${item.id}/${coverFile}.256.jpg`
          : null
        const titleEn = item.attributes.title?.en ?? Object.values(item.attributes.title)[0] ?? item.id
        return { id: item.id, title: titleEn, coverUrl }
      })
      return { success: true, data: results }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  'comick:search': async (p) => {
    const { title } = p as { title: string }
    try {
      const url = `https://api.comick.dev/v1.0/search?q=${encodeURIComponent(title)}&limit=10&tachiyomi=true`
      const res = await fetch(url, { headers: { 'Accept': 'application/json, text/plain, */*' } })
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
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  'mangadex:details': async (p) => {
    const { id } = p as { id: string }
    try {
      const url = `https://api.mangadex.org/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`
      const res = await fetch(url, { headers: { 'User-Agent': 'MangaTracker/1.0' } })
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
        .filter((t) => t.attributes?.group?.name === 'genre')
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
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  'comick:details': async (p) => {
    const { hid } = p as { hid: string }
    try {
      const url = `https://api.comick.dev/comic/${hid}?tachiyomi=true`
      const res = await fetch(url, { headers: { 'Accept': 'application/json, text/plain, */*' } })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const json = (await res.json()) as Record<string, unknown>
      const comic = (json.comic ?? json) as Record<string, unknown>
      const statusMap: Record<number, string> = { 1: 'ongoing', 2: 'completed', 3: 'cancelled', 4: 'hiatus' }
      const countryMap: Record<string, string> = { kr: 'manhwa', jp: 'manga', zh: 'manhua', cn: 'manhua' }
      const genres = Array.isArray(comic.genres) ? (comic.genres as { name?: string }[]).map((g) => g.name ?? '').filter(Boolean) : []
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
          tags: genres,
          authors,
          year: (comic.year as number) ?? null,
          demographic: null as string | null
        }
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  'settings:get': () => settingsService.settingsGet(),
  'settings:set': (p) => settingsService.settingsSet(p as Parameters<typeof settingsService.settingsSet>[0]),

  'gist:testAuth': (p) => gistService.testAuth(p),
  'gist:sync': (p) => gistService.sync(p),
  'gist:disconnect': () => gistService.disconnect(),

  // Reader-Channels: auf Mobile werden diese über @capacitor/browser abgehandelt.
  // Der reader.store ruft diese nicht auf Mobile auf, daher Stubs:
  'reader:open': async () => ({ success: true, separateWindow: true }),
  'reader:close': async () => ({ success: true }),
  'reader:navigate': async () => ({ success: true }),
  'reader:goBack': async () => ({ success: true }),
  'reader:goForward': async () => ({ success: true }),
  'reader:reload': async () => ({ success: true }),
  'reader:domainGuardReply': async () => ({ success: true })
}

// ─── Bridge-Instanz ───────────────────────────────────────────────────────

export const capacitorAdapter: PlatformBridge = {
  async invoke<T>(channel: string, payload?: unknown): Promise<T> {
    const handler = handlers[channel]
    if (!handler) {
      console.warn(`[CapacitorAdapter] Unbekannter Channel: ${channel}`)
      return { success: false, error: `Unknown channel: ${channel}` } as T
    }
    return handler(payload) as Promise<T>
  },

  on(channel: string, handler: EventHandler): () => void {
    return busOn(channel, handler)
  },

  off(channel: string): void {
    eventBus.delete(channel)
  }
}

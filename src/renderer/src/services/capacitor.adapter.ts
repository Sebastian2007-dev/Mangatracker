/**
 * Capacitor Adapter — implementiert PlatformBridge für Android/iOS.
 * Mappt alle IPC-Channel-Namen direkt auf die Mobile Services.
 *
 * Wird in src/renderer/src/main.mobile.ts per setBridge() registriert.
 */
import type { PlatformBridge } from './platform'
import * as mangaService from './mobile/manga.service'
import * as settingsService from './mobile/settings.service'
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

  'settings:get': () => settingsService.settingsGet(),
  'settings:set': (p) => settingsService.settingsSet(p as Parameters<typeof settingsService.settingsSet>[0]),

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

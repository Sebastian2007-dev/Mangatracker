/**
 * Mobile Poller Service — Port von src/main/notifications/chapterPoller.ts
 * Nutzt fetch() statt ses.fetch() und @capacitor/local-notifications statt Electron Notification.
 * Läuft nur im Vordergrund (pausiert bei App-Backgrounding via @capacitor/app).
 */
import { LocalNotifications } from '@capacitor/local-notifications'
import { App as CapApp } from '@capacitor/app'
import type { LogEntry, LogEntryType } from '../../../../types/index'
import { getMangaList, setMangaList, getSettings } from './storage.service'

type LogCallback = (entry: LogEntry) => void
type NewChapterCallback = (data: { mangaId: string; title: string; newChapter: number }) => void

let pollerTimer: ReturnType<typeof setTimeout> | null = null
let appIsActive = true

const logListeners: Set<LogCallback> = new Set()
const chapterListeners: Set<NewChapterCallback> = new Set()

export function onLogEntry(cb: LogCallback): () => void {
  logListeners.add(cb)
  return () => logListeners.delete(cb)
}

export function onNewChapter(cb: NewChapterCallback): () => void {
  chapterListeners.add(cb)
  return () => chapterListeners.delete(cb)
}

function pushLog(type: LogEntryType, message: string): void {
  const entry: LogEntry = { id: crypto.randomUUID(), type, message, timestamp: Date.now() }
  for (const cb of logListeners) cb(entry)
}

function buildChapterUrl(template: string, chapter: number): string {
  return template.replace('$chapter', String(chapter))
}

async function checkManga(manga: {
  id: string
  title: string
  chapterUrlTemplate: string
  currentChapter: number
}): Promise<{ mangaId: string; title: string; newChapter: number; statusCode: number } | null> {
  const nextChapter = Math.floor(manga.currentChapter) + 1
  const url = buildChapterUrl(manga.chapterUrlTemplate, nextChapter)

  if (!url || !url.startsWith('http')) return null

  const origin = new URL(url).origin

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      Referer: origin + '/'
    }
  })

  if (res.status >= 400) return null

  const body = await res.text()
  if (body.length < 2000) return null

  const chapterStr = String(nextChapter)
  if (res.redirected && url.includes(chapterStr) && !res.url.includes(chapterStr)) return null

  return { mangaId: manga.id, title: manga.title, newChapter: nextChapter, statusCode: res.status }
}

export async function runPoll(force = false): Promise<void> {
  const settings = await getSettings()
  if (!force && !settings.notificationsEnabled) return

  const list = await getMangaList()
  const candidates = list.filter((m) => m.status === 'reading' || m.status === 'rereading')

  if (candidates.length === 0) {
    pushLog('info', 'Scan: keine Manga im Status "Am Lesen" oder "Nochmal lesen"')
    return
  }

  pushLog('info', `Scan gestartet – ${candidates.length} Manga werden geprüft`)

  let newCount = 0
  let errorCount = 0

  for (const manga of candidates) {
    const nextChapter = Math.floor(manga.currentChapter) + 1
    pushLog('info', `Prüfe: ${manga.title} (Kap. ${nextChapter})`)

    try {
      const result = await checkManga(manga)
      if (result) {
        newCount++
        pushLog('success', `${manga.title} – Kapitel ${result.newChapter} verfügbar! (HTTP ${result.statusCode})`)

        const updatedList = (await getMangaList()).map((m) =>
          m.id === manga.id ? { ...m, hasNewChapter: true, lastCheckedChapter: result.newChapter } : m
        )
        await setMangaList(updatedList)

        if (settings.notificationsEnabled) {
          await LocalNotifications.schedule({
            notifications: [
              {
                id: Math.abs(result.mangaId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 2_147_483_647,
                title: 'Neues Kapitel verfügbar!',
                body: `${result.title} – Kapitel ${result.newChapter} ist da`
              }
            ]
          })
        }

        for (const cb of chapterListeners) cb(result)
      } else {
        pushLog('info', `${manga.title} – kein neues Kapitel`)
      }
    } catch (e) {
      errorCount++
      const msg = e instanceof Error ? e.message : String(e)
      pushLog('error', `${manga.title} – Fehler: ${msg}`)
    }
  }

  if (newCount > 0) {
    pushLog('success', `Scan abgeschlossen: ${newCount} neue${newCount === 1 ? 's' : ''} Kapitel gefunden`)
  } else {
    pushLog('info', `Scan abgeschlossen: keine neuen Kapitel${errorCount > 0 ? ` (${errorCount} Fehler)` : ''}`)
  }
}

function stopPoller(): void {
  if (pollerTimer !== null) {
    clearTimeout(pollerTimer)
    pollerTimer = null
  }
}

async function scheduleNext(): Promise<void> {
  if (!appIsActive) return
  const settings = await getSettings()
  pollerTimer = setTimeout(async () => {
    await runPoll()
    scheduleNext()
  }, settings.notificationIntervalMs)
}

export function startPoller(): void {
  stopPoller()
  scheduleNext()
}

/** App-Lifecycle Listener registrieren — einmalig beim App-Start aufrufen. */
export function initPollerLifecycle(): void {
  CapApp.addListener('appStateChange', ({ isActive }) => {
    appIsActive = isActive
    if (isActive) {
      startPoller()
    } else {
      stopPoller()
    }
  })
}

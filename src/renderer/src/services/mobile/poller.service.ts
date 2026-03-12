/**
 * Mobile Poller Service — Port von src/main/notifications/chapterPoller.ts
 * Nutzt fetch() statt ses.fetch() und @capacitor/local-notifications statt Electron Notification.
 * Läuft nur im Vordergrund (pausiert bei App-Backgrounding via @capacitor/app).
 */
import { LocalNotifications } from '@capacitor/local-notifications'
import { App as CapApp } from '@capacitor/app'
import { CapacitorHttp } from '@capacitor/core'
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type CheckOk = { ok: true; mangaId: string; title: string; newChapter: number; statusCode: number; source?: string }
type CheckReject = { ok: false; reason: string }
type CheckResult = CheckOk | CheckReject

async function checkMangaDex(manga: {
  id: string
  title: string
  currentChapter: number
  mangaDexId: string
}): Promise<CheckResult> {
  const feedUrl =
    `https://api.mangadex.org/manga/${manga.mangaDexId}/feed` +
    `?translatedLanguage[]=en&order[chapter]=desc&limit=1` +
    `&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`

  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'MangaTracker/1.0 (personal hobby app)' }
  })

  if (!res.ok) return { ok: false, reason: `MDX_ERR(HTTP_${res.status})` }

  const json = (await res.json()) as {
    data: { attributes: { chapter: string | null } }[]
  }
  const data = json.data ?? []

  if (data.length === 0) return { ok: false, reason: 'MDX_NO_DATA' }

  const latest = parseFloat(data[0].attributes.chapter ?? 'NaN')
  if (isNaN(latest)) return { ok: false, reason: 'MDX_ERR(PARSE)' }
  if (latest <= manga.currentChapter) return { ok: false, reason: 'MDX_SAME' }

  return { ok: true, mangaId: manga.id, title: manga.title, newChapter: latest, statusCode: res.status, source: 'MDX' }
}

async function checkComicK(manga: {
  id: string
  title: string
  currentChapter: number
  comickHid: string
}): Promise<CheckResult> {
  const url =
    `https://api.comick.dev/comic/${manga.comickHid}/chapters?lang=en&limit=1&tachiyomi=true`

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json, text/plain, */*' }
  })

  if (!res.ok) return { ok: false, reason: `CK_ERR(HTTP_${res.status})` }

  const json = (await res.json()) as { chapters?: { chap: string | null }[] }
  const chapters = json.chapters ?? []

  if (chapters.length === 0) return { ok: false, reason: 'CK_NO_DATA' }

  const latest = parseFloat(chapters[0].chap ?? 'NaN')
  if (isNaN(latest)) return { ok: false, reason: 'CK_ERR(PARSE)' }
  if (latest <= manga.currentChapter) return { ok: false, reason: 'CK_SAME' }

  return { ok: true, mangaId: manga.id, title: manga.title, newChapter: latest, statusCode: res.status, source: 'CK' }
}

async function checkManga(manga: {
  id: string
  title: string
  chapterUrlTemplate: string
  currentChapter: number
  mangaDexId?: string
  comickHid?: string
}): Promise<CheckResult> {
  if (manga.mangaDexId) {
    const mdxResult = await checkMangaDex({ id: manga.id, title: manga.title, currentChapter: manga.currentChapter, mangaDexId: manga.mangaDexId })
    if (mdxResult.ok) return mdxResult
    if (mdxResult.reason === 'MDX_SAME' && !manga.comickHid) return mdxResult
    // MDX_NO_DATA, MDX_ERR oder MDX_SAME+comickHid → weiter zu ComicK
  }

  if (manga.comickHid) {
    const ckResult = await checkComicK({ id: manga.id, title: manga.title, currentChapter: manga.currentChapter, comickHid: manga.comickHid })
    if (ckResult.ok || ckResult.reason === 'CK_SAME') return ckResult
    // CK_NO_DATA oder CK_ERR → weiter zu HTTP
  }

  const nextChapter = Math.floor(manga.currentChapter) + 1
  const url = buildChapterUrl(manga.chapterUrlTemplate, nextChapter)

  if (!url || !url.startsWith('http')) return { ok: false, reason: 'NO_URL' }

  const origin = new URL(url).origin

  const res = await CapacitorHttp.request({
    method: 'GET',
    url,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'Referer': origin + '/'
    }
  })

  if (res.status >= 400) return { ok: false, reason: `HTTP_${res.status}` }

  const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
  if (body.length < 2000) return { ok: false, reason: 'SHORT' }

  const chapterStr = String(nextChapter)
  if (url.includes(chapterStr) && !res.url.includes(chapterStr))
    return { ok: false, reason: `URL_MISMATCH(→${res.url})` }

  const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/i)
  const pageTitle = titleMatch ? titleMatch[1].toLowerCase() : ''
  const notFoundTitles = ['not found', 'page not found', 'chapter not found', '404 not found', 'error 404']
  if (pageTitle && notFoundTitles.some((p) => pageTitle.includes(p)))
    return { ok: false, reason: 'TITLE_404' }

  return { ok: true, mangaId: manga.id, title: manga.title, newChapter: nextChapter, statusCode: res.status }
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
      if (result.ok) {
        newCount++
        const source = result.source ?? `HTTP ${result.statusCode}`
        pushLog('success', `${manga.title} – Kapitel ${result.newChapter} verfügbar! (${source})`)

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
        pushLog('info', `${manga.title} – kein neues Kapitel [${result.reason}]`)
      }
      if (manga.mangaDexId || manga.comickHid) await sleep(300)
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

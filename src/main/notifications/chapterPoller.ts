import { Notification, BrowserWindow, session as electronSession } from 'electron'
import { randomUUID } from 'crypto'
import store from '../store'
import type { LogEntryType } from '../../types/index'
import { getRegisteredScanners } from '../mods/mod-loader'
import { notifyStatsUpdated } from '../stats.service'

let pollerTimer: ReturnType<typeof setTimeout> | null = null

function buildChapterUrl(template: string, chapter: number): string {
  return template.replace('$chapter', String(chapter))
}

function pushLog(mainWindow: BrowserWindow, type: LogEntryType, message: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('logs:entry', {
      id: randomUUID(),
      type,
      message,
      timestamp: Date.now()
    })
  }
}

type CheckOk = { ok: true; mangaId: string; title: string; newChapter: number; statusCode: number; source?: string }
type CheckReject = { ok: false; reason: string }
type CheckResult = CheckOk | CheckReject

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function checkMangaDex(
  manga: { id: string; title: string; currentChapter: number; mangaDexId: string },
  ses: Electron.Session
): Promise<CheckResult> {
  const feedUrl =
    `https://api.mangadex.org/manga/${manga.mangaDexId}/feed` +
    `?translatedLanguage[]=en&order[chapter]=desc&limit=1` +
    `&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`

  const res = await ses.fetch(feedUrl, {
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

async function checkComicK(
  manga: { id: string; title: string; currentChapter: number; comickHid: string },
  ses: Electron.Session
): Promise<CheckResult> {
  const url =
    `https://api.comick.dev/comic/${manga.comickHid}/chapters?lang=en&limit=1&tachiyomi=true`

  const res = await ses.fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://comick.dev/'
    }
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

async function checkManga(
  manga: {
    id: string
    title: string
    chapterUrlTemplate: string
    currentChapter: number
    lastCheckedChapter: number
    mangaDexId?: string
    comickHid?: string
  },
  ses: Electron.Session
): Promise<CheckResult> {
  // Custom mod scanners run first (sorted by priority desc)
  const customScanners = getRegisteredScanners().filter((s) => s.canHandle(manga as any))
  for (const scanner of customScanners) {
    try {
      const result = await scanner.check(manga as any)
      if (result.latestChapter !== null && result.latestChapter > manga.currentChapter) {
        return { ok: true, mangaId: manga.id, title: manga.title, newChapter: result.latestChapter, statusCode: 200, source: scanner.name }
      }
    } catch { /* fallthrough to built-in scanners */ }
  }

  if (manga.mangaDexId) {
    const mdxResult = await checkMangaDex(
      { id: manga.id, title: manga.title, currentChapter: manga.currentChapter, mangaDexId: manga.mangaDexId },
      ses
    )
    // Neues Kapitel gefunden → sofort zurück
    if (mdxResult.ok) return mdxResult
    // MDX_SAME: kein neues Kapitel laut MDX — aber ComicK könnte weiter sein
    if (mdxResult.reason === 'MDX_SAME' && !manga.comickHid) return mdxResult
    // MDX_NO_DATA, MDX_ERR oder MDX_SAME+comickHid → weiter zu ComicK
  }

  if (manga.comickHid) {
    const ckResult = await checkComicK(
      { id: manga.id, title: manga.title, currentChapter: manga.currentChapter, comickHid: manga.comickHid },
      ses
    )
    if (ckResult.ok || ckResult.reason === 'CK_SAME') return ckResult
    // CK_NO_DATA oder CK_ERR → weiter zu HTTP
  }
  const nextChapter = Math.floor(manga.currentChapter) + 1
  const url = buildChapterUrl(manga.chapterUrlTemplate, nextChapter)

  if (!url || !url.startsWith('http')) return { ok: false, reason: 'NO_URL' }

  const origin = new URL(url).origin

  const res = await ses.fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      Referer: origin + '/',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      Range: 'bytes=0-16383'
    }
  })

  // Anything other than 2xx/3xx → chapter doesn't exist or blocked
  if (res.status >= 400) return { ok: false, reason: `HTTP_${res.status}` }

  // Read up to 16KB to validate it's a real chapter page
  const body = await res.text()

  // If the response is tiny it's likely an error page returned with 200
  if (body.length < 2000) return { ok: false, reason: 'SHORT' }

  const chapterStr = String(nextChapter)

  // If the chapter number was in the requested URL but is no longer in the final URL,
  // the site served a different page (redirect or rewrite). Don't require res.redirected —
  // some sites rewrite internally without an HTTP redirect.
  if (url.includes(chapterStr) && !res.url.includes(chapterStr))
    return { ok: false, reason: `URL_MISMATCH(→${res.url})` }

  // Check the page <title> for common "not found" indicators.
  // Sites often return 200 with a full error page — the title is the most reliable signal.
  const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/i)
  const pageTitle = titleMatch ? titleMatch[1].toLowerCase() : ''
  const notFoundTitles = ['not found', 'page not found', 'chapter not found', '404 not found', 'error 404']
  if (pageTitle && notFoundTitles.some((p) => pageTitle.includes(p)))
    return { ok: false, reason: 'TITLE_404' }

  return { ok: true, mangaId: manga.id, title: manga.title, newChapter: nextChapter, statusCode: res.status }
}

export async function runPoll(mainWindow: BrowserWindow, force = false): Promise<void> {
  const settings = store.get('settings')
  if (!force && !settings.notificationsEnabled) return
  const desktopNotificationsEnabled = settings.desktopNotificationsEnabled ?? true

  // Use the main window's session so Cloudflare/cookie state is shared with the reader
  const ses = mainWindow.isDestroyed()
    ? electronSession.defaultSession
    : mainWindow.webContents.session

  const list = store.get('mangaList')
  const candidates = list.filter((m) => m.status === 'reading' || m.status === 'rereading')

  if (candidates.length === 0) {
    pushLog(mainWindow, 'info', 'Scan: keine Manga im Status "Am Lesen" oder "Nochmal lesen"')
    return
  }

  pushLog(mainWindow, 'info', `Scan gestartet – ${candidates.length} Manga werden geprüft`)

  let newCount = 0
  let errorCount = 0

  for (const manga of candidates) {
    const nextChapter = Math.floor(manga.currentChapter) + 1
    pushLog(mainWindow, 'info', `Prüfe: ${manga.title} (Kap. ${nextChapter})`)

    try {
      const result = await checkManga(manga, ses)
      if (result.ok) {
        newCount++
        const source = result.source ?? `HTTP ${result.statusCode}`
        pushLog(
          mainWindow,
          'success',
          `${manga.title} – Kapitel ${result.newChapter} verfügbar! (${source})`
        )

        const updatedList = store.get('mangaList').map((m) =>
          m.id === manga.id ? { ...m, hasNewChapter: true, lastCheckedChapter: result.newChapter } : m
        )
        store.set('mangaList', updatedList)
        notifyStatsUpdated()

        if (desktopNotificationsEnabled && Notification.isSupported()) {
          new Notification({
            title: 'Neues Kapitel verfügbar!',
            body: `${result.title} – Kapitel ${result.newChapter} ist da`
          }).show()
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('notifications:newChapter', result)
        }
      } else {
        pushLog(mainWindow, 'info', `${manga.title} – kein neues Kapitel [${result.reason}]`)
      }
      if (manga.mangaDexId || manga.comickHid) await sleep(300)
    } catch (e) {
      errorCount++
      const msg = e instanceof Error ? e.message : String(e)
      pushLog(mainWindow, 'error', `${manga.title} – Fehler: ${msg}`)
    }
  }

  if (newCount > 0) {
    pushLog(
      mainWindow,
      'success',
      `Scan abgeschlossen: ${newCount} neue${newCount === 1 ? 's' : ''} Kapitel gefunden`
    )
  } else {
    pushLog(
      mainWindow,
      'info',
      `Scan abgeschlossen: keine neuen Kapitel${errorCount > 0 ? ` (${errorCount} Fehler)` : ''}`
    )
  }
}

export function startPoller(mainWindow: BrowserWindow): void {
  stopPoller()

  const settings = store.get('settings')
  const interval = settings.notificationIntervalMs

  const schedule = (): void => {
    pollerTimer = setTimeout(async () => {
      await runPoll(mainWindow)
      schedule()
    }, interval)
  }

  schedule()
}

export function stopPoller(): void {
  if (pollerTimer !== null) {
    clearTimeout(pollerTimer)
    pollerTimer = null
  }
}

export function restartPoller(mainWindow: BrowserWindow): void {
  startPoller(mainWindow)
}

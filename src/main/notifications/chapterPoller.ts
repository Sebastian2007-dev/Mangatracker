import { Notification, BrowserWindow, session as electronSession } from 'electron'
import { randomUUID } from 'crypto'
import store from '../store'
import type { LogEntryType } from '../../types/index'

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

async function checkManga(
  manga: {
    id: string
    title: string
    chapterUrlTemplate: string
    currentChapter: number
    lastCheckedChapter: number
  },
  ses: Electron.Session
): Promise<{ mangaId: string; title: string; newChapter: number; statusCode: number } | null> {
  const nextChapter = Math.floor(manga.currentChapter) + 1
  const url = buildChapterUrl(manga.chapterUrlTemplate, nextChapter)

  if (!url || !url.startsWith('http')) return null

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
  if (res.status >= 400) return null

  // Read up to 16KB to validate it's a real chapter page
  const body = await res.text()

  // If the response is tiny it's likely an error page returned with 200
  if (body.length < 2000) return null

  // If the chapter number was in the requested URL but is no longer in the final URL
  // after redirects, the site likely redirected us to a different (existing) chapter.
  // Note: only apply this when the chapter number appears in the URL template at all.
  const chapterStr = String(nextChapter)
  if (res.redirected && url.includes(chapterStr) && !res.url.includes(chapterStr)) return null

  return { mangaId: manga.id, title: manga.title, newChapter: nextChapter, statusCode: res.status }
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
      if (result) {
        newCount++
        pushLog(
          mainWindow,
          'success',
          `${manga.title} – Kapitel ${result.newChapter} verfügbar! (HTTP ${result.statusCode})`
        )

        const updatedList = store.get('mangaList').map((m) =>
          m.id === manga.id ? { ...m, hasNewChapter: true, lastCheckedChapter: result.newChapter } : m
        )
        store.set('mangaList', updatedList)

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
        pushLog(mainWindow, 'info', `${manga.title} – kein neues Kapitel`)
      }
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

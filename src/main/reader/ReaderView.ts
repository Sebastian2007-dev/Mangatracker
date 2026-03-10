import { BrowserView, BrowserWindow, WebContents, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { setupDomainGuard } from './domainGuard'
import store from '../store'

const TOOLBAR_HEIGHT = 48

let readerView: BrowserView | null = null
let separateWindow: BrowserWindow | null = null
let currentMangaId: string | null = null
let originDomain = ''
const winIconPath = (() => {
  if (process.platform !== 'win32') return undefined
  const devIcon = join(process.cwd(), 'resources', 'app.ico')
  if (existsSync(devIcon)) return devIcon
  const packagedIcon = join(process.resourcesPath, 'app.ico')
  if (existsSync(packagedIcon)) return packagedIcon
  return undefined
})()

export function getReaderView(): BrowserView | null {
  return readerView
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function buildChapterRegex(template: string): RegExp | null {
  try {
    const parts = template.split('$chapter')
    if (parts.length < 2) return null
    const escapedParts = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return new RegExp(escapedParts.join('(\\d+(?:\\.\\d+)?)'))
  } catch {
    return null
  }
}

function pushReaderLog(
  mainWindow: BrowserWindow,
  type: 'info' | 'success' | 'warning' | 'error',
  message: string
): void {
  if (mainWindow.isDestroyed()) return
  const { randomUUID } = require('crypto') as typeof import('crypto')
  mainWindow.webContents.send('logs:entry', { id: randomUUID(), type, message, timestamp: Date.now() })
}

function emitUrlChanged(mainWindow: BrowserWindow, webContents: WebContents, url: string): void {
  if (mainWindow.isDestroyed()) return
  mainWindow.webContents.send('reader:urlChanged', {
    url,
    canGoBack: webContents.canGoBack(),
    canGoForward: webContents.canGoForward()
  })
}

function tryDetectChapter(navUrl: string, mainWindow: BrowserWindow): void {
  if (!currentMangaId) return

  const manga = store.get('mangaList').find((item) => item.id === currentMangaId)
  if (!manga?.chapterUrlTemplate) return

  const regex = buildChapterRegex(manga.chapterUrlTemplate)
  if (!regex) {
    pushReaderLog(mainWindow, 'warning', `Reader: kein $chapter im Template - ${manga.chapterUrlTemplate}`)
    return
  }

  const match = regex.exec(navUrl)
  if (!match) {
    pushReaderLog(mainWindow, 'warning', `Reader: kein Match - URL: ${navUrl} | Regex: ${regex}`)
    return
  }

  const chapter = parseFloat(match[1])
  if (Number.isNaN(chapter)) return
  if (chapter === manga.currentChapter) return

  pushReaderLog(mainWindow, 'info', `Reader: Kapitel ${manga.currentChapter} -> ${chapter} erkannt`)
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('reader:chapterDetected', { mangaId: currentMangaId, chapter })
  }
}

function attachReaderEvents(webContents: WebContents, mainWindow: BrowserWindow): void {
  webContents.on('did-navigate', (_event, navUrl) => {
    emitUrlChanged(mainWindow, webContents, navUrl)
    tryDetectChapter(navUrl, mainWindow)
  })

  webContents.on('did-navigate-in-page', (_event, navUrl) => {
    emitUrlChanged(mainWindow, webContents, navUrl)
    tryDetectChapter(navUrl, mainWindow)
  })

  webContents.on('did-start-loading', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('reader:loadingChanged', { loading: true })
    }
  })

  webContents.on('did-stop-loading', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('reader:loadingChanged', { loading: false })
    }
  })
}

function updateBoundsFor(mainWindow: BrowserWindow): void {
  if (!readerView) return
  const { width, height } = mainWindow.getContentBounds()
  readerView.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: height - TOOLBAR_HEIGHT })
}

function getActiveReaderContents(): WebContents | null {
  if (separateWindow && !separateWindow.isDestroyed()) return separateWindow.webContents
  if (readerView) return readerView.webContents
  return null
}

export function registerReaderIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('reader:open', (_event, { mangaId, url }: { mangaId: string; url: string }) => {
    const settings = store.get('settings')
    currentMangaId = mangaId

    if (settings.readerInSeparateWindow) {
      if (separateWindow && !separateWindow.isDestroyed()) {
        separateWindow.loadURL(url)
        separateWindow.focus()
      } else {
        separateWindow = new BrowserWindow({
          width: 1280,
          height: 800,
          autoHideMenuBar: true,
          icon: winIconPath,
          webPreferences: { session: mainWindow.webContents.session }
        })
        attachReaderEvents(separateWindow.webContents, mainWindow)
        separateWindow.loadURL(url)
        separateWindow.on('closed', () => {
          separateWindow = null
          currentMangaId = null
        })
      }
      return { success: true, separateWindow: true }
    }

    if (readerView) {
      readerView.webContents.loadURL(url)
    } else {
      readerView = new BrowserView()
      mainWindow.addBrowserView(readerView)
      originDomain = extractDomain(url)

      updateBoundsFor(mainWindow)
      mainWindow.on('resize', () => updateBoundsFor(mainWindow))

      setupDomainGuard(readerView, originDomain, mainWindow)
      attachReaderEvents(readerView.webContents, mainWindow)

      readerView.webContents.loadURL(url)
    }

    return { success: true, separateWindow: false }
  })

  ipcMain.handle('reader:close', () => {
    if (readerView) {
      mainWindow.removeBrowserView(readerView)
      ;(readerView.webContents as any).destroy()
      readerView = null
    }

    if (separateWindow && !separateWindow.isDestroyed()) {
      separateWindow.close()
      separateWindow = null
    }

    currentMangaId = null
    return { success: true }
  })

  ipcMain.handle('reader:navigate', (_event, { url }: { url: string }) => {
    getActiveReaderContents()?.loadURL(url)
    return { success: true }
  })

  ipcMain.handle('reader:goBack', () => {
    const contents = getActiveReaderContents()
    if (contents?.canGoBack()) contents.goBack()
    return { success: true }
  })

  ipcMain.handle('reader:goForward', () => {
    const contents = getActiveReaderContents()
    if (contents?.canGoForward()) contents.goForward()
    return { success: true }
  })

  ipcMain.handle('reader:reload', () => {
    getActiveReaderContents()?.reload()
    return { success: true }
  })

  ipcMain.handle('reader:getCurrentMangaId', () => {
    return { success: true, data: currentMangaId }
  })
}

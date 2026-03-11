import { BrowserView, BrowserWindow, WebContents, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { setDomainGuardContext, setupDomainGuard } from './domainGuard'
import store from '../store'

const ELEMENT_PICKER_SCRIPT = `
(function() {
  if (window.__mangaPickerActive__) return;
  window.__mangaPickerActive__ = true;

  const overlay = document.createElement('div');
  overlay.id = '__manga_picker_overlay__';
  overlay.style.cssText = [
    'position:fixed', 'pointer-events:none',
    'border:2px solid #f59e0b', 'background:rgba(245,158,11,0.15)',
    'z-index:2147483647', 'border-radius:2px',
    'transition:top 0.06s,left 0.06s,width 0.06s,height 0.06s',
    'box-sizing:border-box'
  ].join(';');
  document.documentElement.appendChild(overlay);

  const label = document.createElement('div');
  label.id = '__manga_picker_label__';
  label.style.cssText = [
    'position:fixed', 'bottom:12px', 'left:50%', 'transform:translateX(-50%)',
    'background:rgba(0,0,0,0.85)', 'color:#fff',
    'padding:6px 14px', 'border-radius:6px',
    'font:12px/1.4 monospace', 'pointer-events:none',
    'z-index:2147483647', 'white-space:nowrap', 'max-width:90vw', 'overflow:hidden'
  ].join(';');
  label.textContent = 'Element auswählen – Klick zum Ausblenden | Esc zum Abbrechen';
  document.documentElement.appendChild(label);

  document.documentElement.style.cursor = 'crosshair';

  let currentEl = null;

  function generateSelector(el) {
    if (el.id && /^[a-zA-Z]/.test(el.id)) return '#' + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.tagName && cur !== document.documentElement) {
      if (cur.id && /^[a-zA-Z]/.test(cur.id)) { parts.unshift('#' + CSS.escape(cur.id)); break; }
      let sel = cur.tagName.toLowerCase();
      const cls = Array.from(cur.classList)
        .filter(c => !/^(hover|active|focus|selected|open|closed|js-)/.test(c))
        .slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
      if (cls) sel += cls;
      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter(s => s.tagName === cur.tagName);
        if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
      }
      parts.unshift(sel);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function deactivate() {
    window.__mangaPickerActive__ = false;
    overlay.remove(); label.remove();
    document.documentElement.style.cursor = '';
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
  }

  function onMove(e) {
    currentEl = e.target;
    if (currentEl === overlay || currentEl === label) return;
    const r = currentEl.getBoundingClientRect();
    overlay.style.cssText += ';top:' + r.top + 'px;left:' + r.left + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    label.textContent = generateSelector(currentEl).slice(0, 100);
  }

  function onClick(e) {
    if (!currentEl || currentEl === overlay || currentEl === label) return;
    e.preventDefault(); e.stopPropagation();
    const sel = generateSelector(currentEl);
    let styleEl = document.getElementById('__manga_picker_styles__');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = '__manga_picker_styles__';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent += '\\n' + sel + ' { display: none !important; }';
    deactivate();
  }

  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'F2') { e.preventDefault(); deactivate(); }
  }

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
})();
`

const TOOLBAR_HEIGHT = 48

let readerView: BrowserView | null = null
let separateWindow: BrowserWindow | null = null
let currentMangaId: string | null = null
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

  // F2: Element-Picker aktivieren
  webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F2') {
      const settings = store.get('settings')
      if (settings.elementPickerEnabled ?? true) {
        webContents.executeJavaScript(ELEMENT_PICKER_SCRIPT).catch(() => {})
      }
    }
  })

  // Neue Fenster blockieren (Popup-Ads)
  webContents.setWindowOpenHandler(() => {
    const settings = store.get('settings')
    if (settings.blockNewWindows ?? true) {
      return { action: 'deny' }
    }
    return { action: 'allow' }
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
        setupDomainGuard(separateWindow.webContents, extractDomain(url), mainWindow)
        setDomainGuardContext(separateWindow.webContents, url)
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
        setupDomainGuard(separateWindow.webContents, extractDomain(url), mainWindow)
        setDomainGuardContext(separateWindow.webContents, url)
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
      setupDomainGuard(readerView.webContents, extractDomain(url), mainWindow)
      setDomainGuardContext(readerView.webContents, url)
      readerView.webContents.loadURL(url)
    } else {
      readerView = new BrowserView()
      mainWindow.addBrowserView(readerView)

      updateBoundsFor(mainWindow)
      mainWindow.on('resize', () => updateBoundsFor(mainWindow))

      setupDomainGuard(readerView.webContents, extractDomain(url), mainWindow)
      setDomainGuardContext(readerView.webContents, url)
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

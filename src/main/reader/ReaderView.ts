import { BrowserView, BrowserWindow, WebContents, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { setDomainGuardContext, setupDomainGuard } from './domainGuard'
import store from '../store'
import { broadcastSettingsChanged } from '../ipc/settings.ipc'
import {
  SCROLL_REPORT_PREFIX,
  SCROLL_TRACK_SCRIPT,
  buildScrollRestoreScript,
  scrollUrlKey
} from '../../shared/reader-scripts'
import {
  buildChapterRegex,
  parseChapter,
  tryFixTemplate
} from '../../shared/chapter-template'

// Marker, mit dem der Picker-Script gewählte Selektoren an den Main-Prozess meldet
// (BrowserView hat kein Preload — console-message ist der einfachste Rückkanal)
const PICKER_HIDE_PREFIX = '__MANGA_PICKER_HIDE__'

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
    console.log('__MANGA_PICKER_HIDE__' + sel);
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

// Letzte vom Tracking-Skript gemeldete Position. Beim Schliessen die Seite noch
// auszulesen ist nicht zuverlaessig — ueber das Fenster-X geschlossen ist sie schon
// zerstoert. Deshalb wird der jeweils letzte Stand hier vorgehalten.
let lastScrollReport: { mangaId: string; url: string; scrollY: number; scrollPercent: number } | null = null

/**
 * Schreibt den letzten gemeldeten Stand an den Manga.
 * Muss auf jedem Schliessweg laufen: reader:close aus der App-UI *und* beim
 * Schliessen des separaten Reader-Fensters.
 */
function persistScrollPosition(mangaId: string | null): void {
  if (!mangaId) return
  const report = lastScrollReport
  const mangaList = store.get('mangaList')
  const idx = mangaList.findIndex((m) => m.id === mangaId)
  if (idx === -1) return

  const keep = report !== null && report.mangaId === mangaId && report.scrollY > 100
  const next = keep
    ? { url: report!.url, scrollY: report!.scrollY, scrollPercent: report!.scrollPercent }
    : undefined

  // Unnoetige Schreibvorgaenge vermeiden — jeder store.set schreibt die ganze Datei
  const current = mangaList[idx].scrollPosition
  const unchanged =
    (!current && !next) ||
    (current &&
      next &&
      current.url === next.url &&
      current.scrollY === next.scrollY)
  if (unchanged) return

  mangaList[idx] = { ...mangaList[idx], scrollPosition: next }
  store.set('mangaList', mangaList)
}

let readerView: BrowserView | null = null
let separateWindow: BrowserWindow | null = null
let currentMangaId: string | null = null
const notifiedMismatches = new Set<string>()
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

  let match = regex.exec(navUrl)

  // Fallback: chapterDetectionTemplate versuchen (gesetzt wenn Nutzer "Nicht mehr anzeigen" gewählt hat)
  if (!match && manga.chapterDetectionTemplate) {
    const detectionRegex = buildChapterRegex(manga.chapterDetectionTemplate)
    const detectionMatch = detectionRegex?.exec(navUrl)
    if (detectionMatch) {
      const chapter = parseChapter(detectionMatch[1])
      if (!Number.isNaN(chapter) && chapter > manga.currentChapter) {
        pushReaderLog(mainWindow, 'info', `Reader: Kapitel ${manga.currentChapter} -> ${chapter} erkannt (Detection-Template)`)
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('reader:chapterDetected', { mangaId: currentMangaId, chapter })
        }
      }
      return
    }

    // Detection-Template passt auch nicht mehr → versuche es zu reparieren
    const detectionFix = tryFixTemplate(navUrl, manga.chapterDetectionTemplate)
    if (detectionFix) {
      const detectionMismatchKey = `detection:${currentMangaId}:${navUrl}`
      if (detectionFix.confidence >= 0.6) {
        // Automatisch aktualisieren
        const mangaList = store.get('mangaList')
        const idx = mangaList.findIndex((m) => m.id === currentMangaId)
        if (idx !== -1) {
          mangaList[idx] = { ...mangaList[idx], chapterDetectionTemplate: detectionFix.newTemplate }
          store.set('mangaList', mangaList)
          pushReaderLog(
            mainWindow,
            'success',
            `Reader: Detection-Template automatisch aktualisiert (${Math.round(detectionFix.confidence * 100)}%) → ${detectionFix.newTemplate}`
          )
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('manga:templateFixed', { mangaId: currentMangaId })
          }
          const newRegex = buildChapterRegex(detectionFix.newTemplate)
          const newMatch = newRegex?.exec(navUrl)
          if (newMatch) {
            const chapter = parseChapter(newMatch[1])
            if (!Number.isNaN(chapter) && chapter > mangaList[idx].currentChapter) {
              pushReaderLog(mainWindow, 'info', `Reader: Kapitel ${mangaList[idx].currentChapter} -> ${chapter} erkannt (Detection-Template aktualisiert)`)
              if (!mainWindow.isDestroyed()) {
                mainWindow.webContents.send('reader:chapterDetected', { mangaId: currentMangaId, chapter })
              }
            }
          }
          return
        }
      } else if (detectionFix.confidence > 0 && !notifiedMismatches.has(detectionMismatchKey)) {
        notifiedMismatches.add(detectionMismatchKey)
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('reader:templateMismatch', {
            mangaId: currentMangaId,
            mangaTitle: manga.title,
            oldTemplate: manga.chapterDetectionTemplate,
            suggestedTemplate: detectionFix.newTemplate,
            currentUrl: navUrl,
            confidence: detectionFix.confidence,
            updateDetectionTemplate: true
          })
        }
      }
    }
  }

  if (!match) {
    const fix = tryFixTemplate(navUrl, manga.chapterUrlTemplate)
    if (fix) {
      const mismatchKey = `${currentMangaId}:${navUrl}`
      if (fix.confidence >= 0.6) {
        // Auto-Korrektur
        const mangaList = store.get('mangaList')
        const idx = mangaList.findIndex((m) => m.id === currentMangaId)
        if (idx !== -1) {
          mangaList[idx] = { ...mangaList[idx], chapterUrlTemplate: fix.newTemplate }
          store.set('mangaList', mangaList)
          pushReaderLog(
            mainWindow,
            'success',
            `Reader: Template automatisch korrigiert (${Math.round(fix.confidence * 100)}%) → ${fix.newTemplate}`
          )
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('manga:templateFixed', { mangaId: currentMangaId })
          }
          // Erneut versuchen mit neuem Template
          const newRegex = buildChapterRegex(fix.newTemplate)
          const newMatch = newRegex?.exec(navUrl)
          if (newMatch) {
            const chapter = parseChapter(newMatch[1])
            if (!Number.isNaN(chapter) && chapter !== mangaList[idx].currentChapter) {
              pushReaderLog(mainWindow, 'info', `Reader: Kapitel ${mangaList[idx].currentChapter} -> ${chapter} erkannt`)
              if (!mainWindow.isDestroyed()) {
                mainWindow.webContents.send('reader:chapterDetected', { mangaId: currentMangaId, chapter })
              }
            }
          }
          return
        }
      } else if (fix.confidence > 0 && !manga.ignoreTemplateMismatch && !notifiedMismatches.has(mismatchKey)) {
        notifiedMismatches.add(mismatchKey)
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('reader:templateMismatch', {
            mangaId: currentMangaId,
            mangaTitle: manga.title,
            oldTemplate: manga.chapterUrlTemplate,
            suggestedTemplate: fix.newTemplate,
            currentUrl: navUrl,
            confidence: fix.confidence
          })
        }
      }
    }
    pushReaderLog(mainWindow, 'warning', `Reader: kein Match - URL: ${navUrl} | Regex: ${regex}`)
    return
  }

  const chapter = parseChapter(match[1])
  if (Number.isNaN(chapter)) return
  if (chapter <= manga.currentChapter) return

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

  webContents.on('did-finish-load', () => {
    // Gilt fuer beide Modi: die Leiste sitzt im Hauptfenster, das separate
    // Reader-Fenster ist davon unabhaengig sichtbar.
    if (!currentMangaId || mainWindow.isDestroyed()) return
    if (readerView?.webContents !== webContents && separateWindow?.webContents !== webContents) return
    const manga = store.get('mangaList').find((m) => m.id === currentMangaId)
    if (!manga?.scrollPosition) return
    // Normalisiert vergleichen — Fragmente und Trailing Slashes haben den Treffer
    // bisher verhindert.
    if (scrollUrlKey(webContents.getURL()) !== scrollUrlKey(manga.scrollPosition.url)) return
    if (manga.scrollPosition.scrollY <= 100) return
    mainWindow.webContents.send('reader:scrollPositionAvailable', {
      scrollY: manga.scrollPosition.scrollY,
      scrollPercent: manga.scrollPosition.scrollPercent
    })
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

  // Scroll-Meldungen des Tracking-Skripts aufnehmen
  webContents.on('console-message', (_event, _level, message) => {
    if (!message.startsWith(SCROLL_REPORT_PREFIX)) return
    if (!currentMangaId) return
    try {
      const state = JSON.parse(message.slice(SCROLL_REPORT_PREFIX.length)) as {
        y: number
        pct: number
        url: string
      }
      if (!Number.isFinite(state.y) || !state.url) return
      lastScrollReport = {
        mangaId: currentMangaId,
        url: state.url,
        scrollY: Math.max(0, Math.round(state.y)),
        scrollPercent: Math.min(1, Math.max(0, Number(state.pct) || 0))
      }
    } catch {
      // Unvollstaendige Meldung ignorieren
    }
  })

  // Vom Picker gewählte Selektoren pro Domain persistieren
  webContents.on('console-message', (_event, _level, message) => {
    if (!message.startsWith(PICKER_HIDE_PREFIX)) return
    const selector = message.slice(PICKER_HIDE_PREFIX.length).trim()
    if (!selector) return
    const domain = extractDomain(webContents.getURL())
    if (!domain) return

    const settings = store.get('settings')
    const hidden = { ...(settings.hiddenElements ?? {}) }
    const existing = hidden[domain] ?? []
    if (existing.includes(selector)) return

    hidden[domain] = [...existing, selector]
    store.set('settings', { ...settings, hiddenElements: hidden })
    broadcastSettingsChanged()
  })

  // Scroll-Tracking nach jedem Laden neu injizieren (die Seite ist danach frisch)
  webContents.on('did-finish-load', () => {
    webContents.executeJavaScript(SCROLL_TRACK_SCRIPT, true).catch(() => {})
  })

  // Persistierte Selektoren nach jedem Laden wieder ausblenden
  webContents.on('did-finish-load', () => {
    const domain = extractDomain(webContents.getURL())
    if (!domain) return
    const selectors = store.get('settings').hiddenElements?.[domain]
    if (selectors && selectors.length > 0) {
      const css = selectors.map((sel) => `${sel} { display: none !important; }`).join('\n')
      webContents.insertCSS(css).catch(() => {})
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

  // Erlaubte Child-Windows (blockNewWindows=false) bekommen ebenfalls
  // Domain Guard + window-open-Handler (rekursiv für deren Popups).
  webContents.on('did-create-window', (childWindow, details) => {
    setupDomainGuard(childWindow.webContents, extractDomain(details.url), mainWindow)
    setDomainGuardContext(childWindow.webContents, details.url)
    attachReaderEvents(childWindow.webContents, mainWindow)
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

const READER_IPC_CHANNELS = [
  'reader:open',
  'reader:close',
  'reader:restoreScrollPosition',
  'reader:clearScrollPosition',
  'reader:navigate',
  'reader:goBack',
  'reader:goForward',
  'reader:reload',
  'reader:getCurrentMangaId'
] as const

export function registerReaderIpc(mainWindow: BrowserWindow): void {
  // Re-Registrierung (macOS 'activate' → neues Fenster) darf nicht werfen
  for (const channel of READER_IPC_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  // Ein Listener pro Fenster reicht — vorher wurde bei jedem reader:open
  // ein weiterer 'resize'-Listener registriert (Leak).
  mainWindow.on('resize', () => updateBoundsFor(mainWindow))

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
        // Der eigentliche Defekt: hier wurde bisher nur die Referenz genullt.
        // Wer das Reader-Fenster ueber das X schliesst, hat nie eine Position
        // gespeichert bekommen — reader:close feuert dabei nicht.
        separateWindow.on('closed', () => {
          // Vor dem Nullen von currentMangaId speichern
          persistScrollPosition(currentMangaId)
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

      setupDomainGuard(readerView.webContents, extractDomain(url), mainWindow)
      setDomainGuardContext(readerView.webContents, url)
      attachReaderEvents(readerView.webContents, mainWindow)

      readerView.webContents.loadURL(url)
    }

    return { success: true, separateWindow: false }
  })

  ipcMain.handle('reader:close', async () => {
    const savedMangaId = currentMangaId
    const contents = getActiveReaderContents()

    // Letzten gemeldeten Stand nachziehen, falls seit der letzten Meldung noch
    // gescrollt wurde; scheitert das, bleibt der Stand aus dem Tracking gueltig.
    if (savedMangaId && contents && !contents.isDestroyed()) {
      try {
        const raw = (await contents.executeJavaScript(
          'JSON.stringify(window.__mangaScrollRead__ ? window.__mangaScrollRead__() : null)',
          true
        )) as string
        const state = JSON.parse(raw) as { y: number; pct: number; url: string } | null
        if (state && Number.isFinite(state.y) && state.url) {
          lastScrollReport = {
            mangaId: savedMangaId,
            url: state.url,
            scrollY: Math.max(0, Math.round(state.y)),
            scrollPercent: Math.min(1, Math.max(0, Number(state.pct) || 0))
          }
        }
      } catch {
        // Seite weg oder abgestuerzt — Tracking-Stand genuegt
      }
    }

    persistScrollPosition(savedMangaId)

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

  ipcMain.handle('reader:restoreScrollPosition', async (_event, { scrollY }: { scrollY: number }) => {
    const contents = getActiveReaderContents()
    const safeScrollY = Math.max(0, Number(scrollY) || 0)
    if (contents && !contents.isDestroyed()) {
      await contents.executeJavaScript(buildScrollRestoreScript(safeScrollY), true)
      if (currentMangaId) {
        const mangaList = store.get('mangaList')
        const idx = mangaList.findIndex((m) => m.id === currentMangaId)
        if (idx !== -1) {
          mangaList[idx] = { ...mangaList[idx], scrollPosition: undefined }
          store.set('mangaList', mangaList)
        }
      }
    }
    return { success: true }
  })

  ipcMain.handle('reader:clearScrollPosition', () => {
    if (currentMangaId) {
      const mangaList = store.get('mangaList')
      const idx = mangaList.findIndex((m) => m.id === currentMangaId)
      if (idx !== -1 && mangaList[idx].scrollPosition) {
        mangaList[idx] = { ...mangaList[idx], scrollPosition: undefined }
        store.set('mangaList', mangaList)
      }
    }
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

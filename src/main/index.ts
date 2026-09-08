import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import store from './store'
import { registerMangaIpc, purgeExpiredTrash } from './ipc/manga.ipc'
import { registerSettingsIpc, applyProxy } from './ipc/settings.ipc'
import { registerGistIpc, syncGistDirect } from './ipc/gist.ipc'
import { registerStatsIpc } from './ipc/stats.ipc'
import { registerReaderIpc } from './reader/ReaderView'
import { registerDomainGuardReplyHandler } from './reader/domainGuard'
import { initAdBlocker } from './reader/adBlocker'
import { startPoller, runPoll } from './notifications/chapterPoller'
import { loadMods, applyThemeCSS, emitModEvent, startModsWatcher, stopModsWatcher } from './mods/mod-loader'
import { registerModIpc } from './ipc/mod.ipc'
import { runBackupRotation } from './backup'

const isDev = process.env['NODE_ENV'] === 'development' || !!process.env['ELECTRON_RENDERER_URL']
const winIconPath = (() => {
  if (process.platform !== 'win32') return undefined
  const devIcon = join(process.cwd(), 'resources', 'app.ico')
  if (existsSync(devIcon)) return devIcon
  const packagedIcon = join(process.resourcesPath, 'app.ico')
  if (existsSync(packagedIcon)) return packagedIcon
  return undefined
})()

// Obergrenze fuer den Sync beim Fensterschliessen — danach wird trotzdem geschlossen
const CLOSE_SYNC_DEADLINE_MS = 8_000

let staticIpcRegistered = false

function createWindow(): BrowserWindow {
  // ipcMain.handle wirft bei doppelter Registrierung (z. B. macOS 'activate')
  if (!staticIpcRegistered) {
    registerMangaIpc()
    registerSettingsIpc()
    registerStatsIpc()
    registerGistIpc()
    staticIpcRegistered = true
  }

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: winIconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Preload nutzt nur contextBridge + ipcRenderer — beides ist im Sandbox-Preload erlaubt
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) {
      shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  registerReaderIpc(mainWindow)
  registerDomainGuardReplyHandler(mainWindow)

  // Sync vor dem Schließen des Fensters
  mainWindow.on('close', async (event) => {
    const settings = store.get('settings')
    if (settings.gistSyncEnabled && settings.githubToken) {
      event.preventDefault()
      try {
        // Gist-Operationen laufen serialisiert (sonst 409 Conflict). Der Sync beim
        // Schließen kann daher hinter einem laufenden warten — plus 20 s Timeout pro
        // Request und einem Retry bei 409. Ohne Deadline haengt das Fenster minutenlang.
        // Wird der Sync abgeschnitten, holt ihn der naechste Start nach.
        await Promise.race([
          syncGistDirect(settings.githubToken, settings.gistId ?? ''),
          new Promise((resolve) => setTimeout(resolve, CLOSE_SYNC_DEADLINE_MS))
        ])
      } catch { /* Sync-Fehler beim Schließen ignorieren */ }
      mainWindow.destroy()
    }
  })

  ipcMain.removeHandler('manga:scanNow')
  ipcMain.handle('manga:scanNow', async () => {
    await runPoll(mainWindow, true)
    return { success: true }
  })

  return mainWindow
}

// Nur eine Instanz zulassen.
//
// productName steht in package.json nur unter "build", weshalb app.getName() in
// der Dev- *und* der installierten App "manga-tracker" liefert — beide arbeiten
// damit auf %APPDATA%/manga-tracker/config.json. electron-store haelt diese Datei
// vollstaendig im Speicher und schreibt sie bei jedem set komplett zurueck: laufen
// zwei Instanzen parallel, gewinnt der letzte Schreibvorgang und verwirft still,
// was die andere seither geaendert hat. Mit aktivem Gist-Sync landet der Verlust
// zusaetzlich in der Cloud.
//
// Die Sperre laesst den Fehler laut scheitern (die zweite Instanz startet nicht)
// statt leise Daten zu kosten. Wer Dev und Installation wirklich gleichzeitig
// braucht, muss der Dev-Variante ein eigenes userData geben — das setzt aber ein
// app.setPath('userData', ...) *vor* dem Import von ./store voraus.
if (!app.requestSingleInstanceLock()) {
  app.exit(0)
}

// Startversuch einer zweiten Instanz: bestehendes Fenster nach vorn holen
app.on('second-instance', () => {
  const [existing] = BrowserWindow.getAllWindows()
  if (!existing) return
  if (existing.isMinimized()) existing.restore()
  existing.focus()
})

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.mangaTracker.app')
  }

  purgeExpiredTrash()
  // Lokale Backup-Rotation: läuft asynchron neben dem Fensteraufbau
  void runBackupRotation()

  const mainWindow = createWindow()

  const savedSettings = store.get('settings')
  await applyProxy(savedSettings.proxyUrl)

  await initAdBlocker(mainWindow.webContents.session)

  // Load mods before starting the poller so custom scanners are registered
  await loadMods(mainWindow)
  await applyThemeCSS()
  registerModIpc()
  startModsWatcher()

  // Re-apply theme CSS from mods after each page load
  mainWindow.webContents.on('did-finish-load', () => {
    void applyThemeCSS()
  })

  startPoller(mainWindow)

  // Notify mods that the app is fully ready
  emitModEvent('app:ready', {})

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  stopModsWatcher()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

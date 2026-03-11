import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { registerMangaIpc } from './ipc/manga.ipc'
import { registerSettingsIpc } from './ipc/settings.ipc'
import { registerReaderIpc } from './reader/ReaderView'
import { registerDomainGuardReplyHandler } from './reader/domainGuard'
import { initAdBlocker } from './reader/adBlocker'
import { startPoller, runPoll } from './notifications/chapterPoller'

const isDev = process.env['NODE_ENV'] === 'development' || !!process.env['ELECTRON_RENDERER_URL']
const winIconPath = (() => {
  if (process.platform !== 'win32') return undefined
  const devIcon = join(process.cwd(), 'resources', 'app.ico')
  if (existsSync(devIcon)) return devIcon
  const packagedIcon = join(process.resourcesPath, 'app.ico')
  if (existsSync(packagedIcon)) return packagedIcon
  return undefined
})()

function createWindow(): BrowserWindow {
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
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  registerMangaIpc()
  registerSettingsIpc()
  registerReaderIpc(mainWindow)
  registerDomainGuardReplyHandler(mainWindow)

  ipcMain.handle('manga:scanNow', async () => {
    await runPoll(mainWindow, true)
    return { success: true }
  })

  return mainWindow
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.mangaTracker.app')
  }

  const mainWindow = createWindow()

  await initAdBlocker(mainWindow.webContents.session)
  startPoller(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

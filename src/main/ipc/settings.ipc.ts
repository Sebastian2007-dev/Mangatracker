import { BrowserWindow, ipcMain, session } from 'electron'
import store from '../store'
import type { AppSettings } from '../../types/index'

export async function applyProxy(proxyUrl: string | undefined): Promise<void> {
  const url = proxyUrl?.trim() ?? ''
  if (!url) {
    await session.defaultSession.setProxy({})
    return
  }

  let pacEntry: string
  if (url.startsWith('socks5://')) {
    pacEntry = `SOCKS5 ${url.slice('socks5://'.length)}`
  } else if (url.startsWith('socks4://')) {
    pacEntry = `SOCKS4 ${url.slice('socks4://'.length)}`
  } else {
    pacEntry = `PROXY ${url.replace(/^https?:\/\//, '')}`
  }

  const pac = `data:application/x-ns-proxy-autoconfig,${encodeURIComponent(
    `function FindProxyForURL(url, host) { return "${pacEntry}; DIRECT"; }`
  )}`
  await session.defaultSession.setProxy({ pacScript: pac })
}

export function broadcastSettingsChanged(): void {
  const settings = store.get('settings')
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('settings:changed', settings)
    }
  }
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => {
    return { success: true, data: store.get('settings') }
  })

  ipcMain.handle('settings:set', async (_event, updates: Partial<AppSettings>) => {
    const current = store.get('settings')
    store.set('settings', { ...current, ...updates })
    broadcastSettingsChanged()
    if ('proxyUrl' in updates) {
      await applyProxy(updates.proxyUrl)
    }
    return { success: true }
  })
}

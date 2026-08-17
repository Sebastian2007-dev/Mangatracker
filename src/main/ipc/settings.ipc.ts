import { BrowserWindow, ipcMain, session } from 'electron'
import store from '../store'
import { restartPoller } from '../notifications/chapterPoller'
import type { AppSettings } from '../../types/index'

// Untergrenze fürs Poll-Intervall — verhindert Tight-Loops (z. B. 0 ms)
const MIN_NOTIFICATION_INTERVAL_MS = 60_000

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

function sanitizeUpdates(updates: Partial<AppSettings>): Partial<AppSettings> {
  const clean: Partial<AppSettings> = { ...updates }

  if ('notificationIntervalMs' in clean) {
    const raw = Number(clean.notificationIntervalMs)
    clean.notificationIntervalMs = Number.isFinite(raw)
      ? Math.max(MIN_NOTIFICATION_INTERVAL_MS, Math.floor(raw))
      : MIN_NOTIFICATION_INTERVAL_MS
  }

  return clean
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => {
    return { success: true, data: store.get('settings') }
  })

  ipcMain.handle('settings:set', async (_event, updates: Partial<AppSettings>) => {
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return { success: false, error: 'Invalid settings payload' }
    }

    const clean = sanitizeUpdates(updates)
    const current = store.get('settings')
    store.set('settings', { ...current, ...clean })
    broadcastSettingsChanged()

    // Intervall-/Aktivierungs-Änderungen sofort wirksam machen
    if ('notificationIntervalMs' in clean || 'notificationsEnabled' in clean) {
      restartPoller()
    }

    if ('proxyUrl' in clean) {
      await applyProxy(clean.proxyUrl)
    }

    return { success: true }
  })
}

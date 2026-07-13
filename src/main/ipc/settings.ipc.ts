import { BrowserWindow, ipcMain } from 'electron'
import store from '../store'
import { restartPoller } from '../notifications/chapterPoller'
import type { AppSettings } from '../../types/index'

// Untergrenze fürs Poll-Intervall — verhindert Tight-Loops (z. B. 0 ms)
const MIN_NOTIFICATION_INTERVAL_MS = 60_000

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

  ipcMain.handle('settings:set', (_event, updates: Partial<AppSettings>) => {
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

    return { success: true }
  })
}

import { BrowserWindow, ipcMain } from 'electron'
import store from '../store'
import type { AppSettings } from '../../types/index'

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

  ipcMain.handle('settings:set', (_event, updates: Partial<AppSettings>) => {
    const current = store.get('settings')
    store.set('settings', { ...current, ...updates })
    broadcastSettingsChanged()
    return { success: true }
  })
}

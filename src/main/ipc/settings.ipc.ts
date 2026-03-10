import { ipcMain } from 'electron'
import store from '../store'
import type { AppSettings } from '../../types/index'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => {
    return { success: true, data: store.get('settings') }
  })

  ipcMain.handle('settings:set', (_event, updates: Partial<AppSettings>) => {
    const current = store.get('settings')
    store.set('settings', { ...current, ...updates })
    return { success: true }
  })
}

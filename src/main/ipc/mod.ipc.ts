import { ipcMain, shell } from 'electron'
import {
  getLoadedMods,
  setModEnabled,
  getModSetting,
  setModSetting,
  getModSettings,
  getModsDirPath,
  scanMods
} from '../mods/mod-loader'
import { mkdirSync } from 'fs'

export function registerModIpc(): void {
  /** Returns all loaded mods with their enabled state and any load errors */
  ipcMain.handle('mods:getAll', () => {
    return { success: true, data: getLoadedMods() }
  })

  /** Reload/scan mods from disk without restarting the app */
  ipcMain.handle('mods:scan', async () => {
    try {
      const mods = await scanMods()
      return { success: true, data: mods }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  /** Enable or disable a mod (persisted; takes effect on next restart) */
  ipcMain.handle('mods:setEnabled', (_event, { id, enabled }: { id: string; enabled: boolean }) => {
    try {
      setModEnabled(id, enabled)
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  /** Get a single setting value for a mod */
  ipcMain.handle('mods:getSetting', (_event, { id, key }: { id: string; key: string }) => {
    return { success: true, data: getModSetting(id, key) }
  })

  /** Get all setting values for a mod */
  ipcMain.handle('mods:getSettings', (_event, { id }: { id: string }) => {
    return { success: true, data: getModSettings(id) }
  })

  /** Set a single setting value for a mod */
  ipcMain.handle('mods:setSetting', (_event, { id, key, value }: { id: string; key: string; value: unknown }) => {
    try {
      setModSetting(id, key, value)
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  /** Open the mods folder in the system file explorer */
  ipcMain.handle('mods:openFolder', async () => {
    try {
      const dir = getModsDirPath()
      // Create the folder if it doesn't exist so the user can start placing mods
      mkdirSync(dir, { recursive: true })
      await shell.openPath(dir)
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

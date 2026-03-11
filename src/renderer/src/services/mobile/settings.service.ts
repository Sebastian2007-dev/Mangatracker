/**
 * Mobile Settings Service — Port von src/main/ipc/settings.ipc.ts
 */
import type { AppSettings } from '../../../../types/index'
import { getSettings, setSettings } from './storage.service'

// Listener-Callbacks für settings:changed Events (auf Mobile intern getriggert)
const listeners: Set<(settings: AppSettings) => void> = new Set()

export function onSettingsChanged(cb: (settings: AppSettings) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function notifyListeners(settings: AppSettings): void {
  for (const cb of listeners) cb(settings)
}

export async function settingsGet(): Promise<{ success: boolean; data: AppSettings }> {
  return { success: true, data: await getSettings() }
}

export async function settingsSet(
  updates: Partial<AppSettings>
): Promise<{ success: boolean }> {
  await setSettings(updates)
  const updated = await getSettings()
  notifyListeners(updated)
  return { success: true }
}

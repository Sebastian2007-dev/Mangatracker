import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppSettings, Theme, Language, ReadBehavior } from '../types/index'
import { getBridge } from '../services/platform'

export const useSettingsStore = defineStore('settings', () => {
  const api = getBridge()
  const theme = ref<Theme>('system')
  const language = ref<Language>('de')
  const readBehavior = ref<ReadBehavior>('ask')
  const domainWhitelist = ref<string[]>([])
  const domainBlocklist = ref<string[]>([])
  const notificationIntervalMs = ref<number>(3_600_000)
  const notificationsEnabled = ref<boolean>(true)
  const desktopNotificationsEnabled = ref<boolean>(true)
  const readerInSeparateWindow = ref<boolean>(false)
  const elementPickerEnabled = ref<boolean>(true)
  const blockNewWindows = ref<boolean>(true)

  function applySettings(s: AppSettings): void {
    theme.value = s.theme
    language.value = s.language
    readBehavior.value = s.readBehavior
    domainWhitelist.value = s.domainWhitelist
    domainBlocklist.value = s.domainBlocklist
    notificationIntervalMs.value = s.notificationIntervalMs
    notificationsEnabled.value = s.notificationsEnabled
    desktopNotificationsEnabled.value = s.desktopNotificationsEnabled ?? true
    readerInSeparateWindow.value = s.readerInSeparateWindow ?? false
    elementPickerEnabled.value = s.elementPickerEnabled ?? true
    blockNewWindows.value = s.blockNewWindows ?? true
  }

  async function load(): Promise<void> {
    const result = await api.invoke<{ success: boolean; data: AppSettings }>('settings:get')
    if (result.success && result.data) {
      applySettings(result.data)
    }
  }

  async function save(updates: Partial<AppSettings>): Promise<void> {
    await api.invoke('settings:set', updates)
    if (updates.theme !== undefined) theme.value = updates.theme
    if (updates.language !== undefined) language.value = updates.language
    if (updates.readBehavior !== undefined) readBehavior.value = updates.readBehavior
    if (updates.domainWhitelist !== undefined) domainWhitelist.value = updates.domainWhitelist
    if (updates.domainBlocklist !== undefined) domainBlocklist.value = updates.domainBlocklist
    if (updates.notificationIntervalMs !== undefined) notificationIntervalMs.value = updates.notificationIntervalMs
    if (updates.notificationsEnabled !== undefined) notificationsEnabled.value = updates.notificationsEnabled
    if (updates.desktopNotificationsEnabled !== undefined) {
      desktopNotificationsEnabled.value = updates.desktopNotificationsEnabled
    }
    if (updates.readerInSeparateWindow !== undefined) readerInSeparateWindow.value = updates.readerInSeparateWindow
    if (updates.elementPickerEnabled !== undefined) elementPickerEnabled.value = updates.elementPickerEnabled
    if (updates.blockNewWindows !== undefined) blockNewWindows.value = updates.blockNewWindows
  }

  function setupListeners(): () => void {
    const cleanup = api.on('settings:changed', (data: any) => {
      if (!data) return
      applySettings(data as AppSettings)
    })
    return () => cleanup()
  }

  return {
    theme, language, readBehavior,
    domainWhitelist, domainBlocklist,
    notificationIntervalMs, notificationsEnabled, desktopNotificationsEnabled, readerInSeparateWindow,
    elementPickerEnabled, blockNewWindows,
    load, save, setupListeners
  }
})

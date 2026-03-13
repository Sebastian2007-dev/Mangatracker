import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppSettings, Theme, Language, ReadBehavior, Manga } from '../types/index'
import type { LoadedMod } from '../../../types/mod'
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
  const backgroundNotificationsEnabled = ref<boolean>(false)
  const autoLinkEnabled = ref<boolean>(false)
  const desktopNotificationsEnabled = ref<boolean>(true)
  const readerInSeparateWindow = ref<boolean>(false)
  const elementPickerEnabled = ref<boolean>(true)
  const blockNewWindows = ref<boolean>(true)
  const titleExpand = ref<boolean>(true)
  const gistSyncEnabled = ref<boolean>(false)
  const gistAutoSync = ref<boolean>(false)
  const githubToken = ref<string>('')
  const gistId = ref<string>('')
  const lastGistSync = ref<number>(0)
  const loadedMods = ref<LoadedMod[]>([])

  function applySettings(s: AppSettings): void {
    theme.value = s.theme
    language.value = s.language
    readBehavior.value = s.readBehavior
    domainWhitelist.value = s.domainWhitelist
    domainBlocklist.value = s.domainBlocklist
    notificationIntervalMs.value = s.notificationIntervalMs
    notificationsEnabled.value = s.notificationsEnabled
    backgroundNotificationsEnabled.value = s.backgroundNotificationsEnabled ?? false
    autoLinkEnabled.value = s.autoLinkEnabled ?? false
    desktopNotificationsEnabled.value = s.desktopNotificationsEnabled ?? true
    readerInSeparateWindow.value = s.readerInSeparateWindow ?? false
    elementPickerEnabled.value = s.elementPickerEnabled ?? true
    blockNewWindows.value = s.blockNewWindows ?? true
    titleExpand.value = s.titleExpand ?? true
    gistSyncEnabled.value = s.gistSyncEnabled ?? false
    gistAutoSync.value = s.gistAutoSync ?? false
    githubToken.value = s.githubToken ?? ''
    gistId.value = s.gistId ?? ''
    lastGistSync.value = s.lastGistSync ?? 0
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
    if (updates.backgroundNotificationsEnabled !== undefined) backgroundNotificationsEnabled.value = updates.backgroundNotificationsEnabled
    if (updates.autoLinkEnabled !== undefined) autoLinkEnabled.value = updates.autoLinkEnabled
    if (updates.desktopNotificationsEnabled !== undefined) {
      desktopNotificationsEnabled.value = updates.desktopNotificationsEnabled
    }
    if (updates.readerInSeparateWindow !== undefined) readerInSeparateWindow.value = updates.readerInSeparateWindow
    if (updates.elementPickerEnabled !== undefined) elementPickerEnabled.value = updates.elementPickerEnabled
    if (updates.blockNewWindows !== undefined) blockNewWindows.value = updates.blockNewWindows
    if (updates.titleExpand !== undefined) titleExpand.value = updates.titleExpand
    if (updates.gistSyncEnabled !== undefined) gistSyncEnabled.value = updates.gistSyncEnabled
    if (updates.gistAutoSync !== undefined) gistAutoSync.value = updates.gistAutoSync
    if (updates.githubToken !== undefined) githubToken.value = updates.githubToken
    if (updates.gistId !== undefined) gistId.value = updates.gistId
    if (updates.lastGistSync !== undefined) lastGistSync.value = updates.lastGistSync
  }

  async function syncGist(): Promise<{ success: boolean; data?: Manga[]; error?: string }> {
    const result = await api.invoke<{ success: boolean; data?: Manga[]; gistId?: string; error?: string }>(
      'gist:sync',
      { token: githubToken.value, gistId: gistId.value }
    )
    if (result.success && result.gistId) {
      gistId.value = result.gistId
      lastGistSync.value = Date.now()
    }
    return result
  }

  async function testGistAuth(token: string): Promise<{ success: boolean; username?: string; error?: string }> {
    const result = await api.invoke<{ success: boolean; data?: { username: string }; error?: string }>(
      'gist:testAuth',
      { token }
    )
    return { success: result.success, username: result.data?.username, error: result.error }
  }

  async function disconnectGist(): Promise<void> {
    await api.invoke('gist:disconnect')
    githubToken.value = ''
    gistId.value = ''
    gistSyncEnabled.value = false
    lastGistSync.value = 0
  }

  function setupListeners(): () => void {
    const cleanup = api.on('settings:changed', (data: any) => {
      if (!data) return
      applySettings(data as AppSettings)
    })
    return () => cleanup()
  }

  async function fetchMods(): Promise<void> {
    const result = await api.invoke<{ success: boolean; data: LoadedMod[] }>('mods:getAll')
    if (result.success && result.data) {
      loadedMods.value = result.data
    }
  }

  async function scanMods(): Promise<void> {
    const result = await api.invoke<{ success: boolean; data: LoadedMod[] }>('mods:scan')
    if (result.success && result.data) {
      loadedMods.value = result.data
    }
  }

  async function setModEnabled(id: string, enabled: boolean): Promise<void> {
    await api.invoke('mods:setEnabled', { id, enabled })
    const mod = loadedMods.value.find((m) => m.manifest.id === id)
    if (mod) mod.enabled = enabled
  }

  async function openModsFolder(): Promise<void> {
    await api.invoke('mods:openFolder')
  }

  return {
    theme, language, readBehavior,
    domainWhitelist, domainBlocklist,
    notificationIntervalMs, notificationsEnabled, backgroundNotificationsEnabled, autoLinkEnabled, desktopNotificationsEnabled, readerInSeparateWindow,
    elementPickerEnabled, blockNewWindows, titleExpand,
    gistSyncEnabled, gistAutoSync, githubToken, gistId, lastGistSync,
    loadedMods,
    load, save, setupListeners, syncGist, testGistAuth, disconnectGist,
    fetchMods, scanMods, setModEnabled, openModsFolder
  }
})

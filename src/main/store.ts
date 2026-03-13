import Store from 'electron-store'
import type { Manga, AppSettings } from '../types/index'

interface StoreSchema {
  mangaList: Manga[]
  mangaTrash: Manga[]
  settings: AppSettings
  modDisabled: string[]
  modSettings: Record<string, Record<string, unknown>>
}

const store = new Store<StoreSchema>({
  defaults: {
    mangaList: [],
    mangaTrash: [],
    modDisabled: [],
    modSettings: {},
    settings: {
      theme: 'system',
      language: 'de',
      readBehavior: 'ask',
      domainWhitelist: [],
      domainBlocklist: [],
      notificationIntervalMs: 3_600_000,
      notificationsEnabled: true,
      backgroundNotificationsEnabled: false,
      autoLinkEnabled: false,
      desktopNotificationsEnabled: true,
      readerInSeparateWindow: false,
      elementPickerEnabled: true,
      blockNewWindows: true,
      titleExpand: true,
      gistSyncEnabled: false,
      gistAutoSync: false,
      githubToken: '',
      gistId: '',
      lastGistSync: 0
    }
  }
})

export default store

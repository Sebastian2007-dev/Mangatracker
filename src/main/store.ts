import Store from 'electron-store'
import type { Manga, AppSettings } from '../types/index'

interface StoreSchema {
  mangaList: Manga[]
  mangaTrash: Manga[]
  settings: AppSettings
}

const store = new Store<StoreSchema>({
  defaults: {
    mangaList: [],
    mangaTrash: [],
    settings: {
      theme: 'system',
      language: 'de',
      readBehavior: 'ask',
      domainWhitelist: [],
      domainBlocklist: [],
      notificationIntervalMs: 3_600_000,
      notificationsEnabled: true,
      backgroundNotificationsEnabled: false,
      desktopNotificationsEnabled: true,
      readerInSeparateWindow: false,
      elementPickerEnabled: true,
      blockNewWindows: true,
      titleExpand: true
    }
  }
})

export default store

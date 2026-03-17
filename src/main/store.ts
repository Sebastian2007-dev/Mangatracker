import Store from 'electron-store'
import type { AppSettings, Manga, StatisticsEvent, StatisticsTagCache, TrashedManga } from '../types/index'
import { normalizeMangaList, normalizeTagCache, normalizeTrashedMangaList } from '../shared/manga'

interface StoreSchema {
  mangaList: Manga[]
  mangaTrash: TrashedManga[]
  statsEvents: StatisticsEvent[]
  statsTagCache: StatisticsTagCache | null
  earnedAchievements: string[]
  settings: AppSettings
  modDisabled: string[]
  modSettings: Record<string, Record<string, unknown>>
}

const store = new Store<StoreSchema>({
  defaults: {
    mangaList: [],
    mangaTrash: [],
    statsEvents: [],
    statsTagCache: null,
    earnedAchievements: [],
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

function migrateLegacyStoredData(): void {
  const rawStore = store as unknown as Store<Record<string, unknown>>

  const rawMangaList = rawStore.get('mangaList')
  const mangaList = normalizeMangaList(rawMangaList)
  if (JSON.stringify(rawMangaList ?? []) !== JSON.stringify(mangaList)) {
    store.set('mangaList', mangaList)
  }

  const rawMangaTrash = rawStore.get('mangaTrash')
  const mangaTrash = normalizeTrashedMangaList(rawMangaTrash)
  if (JSON.stringify(rawMangaTrash ?? []) !== JSON.stringify(mangaTrash)) {
    store.set('mangaTrash', mangaTrash)
  }

  const rawTagCache = rawStore.get('statsTagCache') ?? rawStore.get('statsGenreCache')
  const tagCache = normalizeTagCache(rawTagCache)
  if (JSON.stringify(rawStore.get('statsTagCache') ?? null) !== JSON.stringify(tagCache)) {
    store.set('statsTagCache', tagCache)
  }

  if (rawStore.has('statsGenreCache')) {
    rawStore.delete('statsGenreCache')
  }
}

migrateLegacyStoredData()

export default store
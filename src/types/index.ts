export type MangaStatus =
  | 'reading'
  | 'plan_to_read'
  | 'hiatus'
  | 'completed'
  | 'rereading'

export type TabId = MangaStatus | 'focus' | 'all' | 'new'

export interface Manga {
  id: string
  title: string
  mainUrl: string
  chapterUrlTemplate: string
  status: MangaStatus
  isFocused: boolean
  currentChapter: number
  hasNewChapter: boolean
  lastCheckedChapter: number
  mangaDexId?: string
  mangaDexTitle?: string
  mangaDexCoverUrl?: string
  comickHid?: string
  comickTitle?: string
  comickCoverUrl?: string
  tags?: string[]
  createdAt: number
  updatedAt: number
}

export interface TrashedManga extends Manga {
  deletedAt: number
}

export interface DeletedMangaEntry {
  manga: Manga
  deletedAt: number
}

export type StatisticsEventType =
  | 'manga_added'
  | 'manga_deleted'
  | 'manga_restored'
  | 'chapter_progress'
  | 'status_changed'

export interface StatisticsEvent {
  id: string
  type: StatisticsEventType
  mangaId: string
  at: number
  synthetic?: boolean
  amount?: number
  fromChapter?: number
  toChapter?: number
  fromStatus?: MangaStatus
  toStatus?: MangaStatus
}

export interface StatisticsTagCache {
  fetchedAt: number
  sourceKey: string
  tags: Record<string, number>
}

export interface StatisticsAchievement {
  id: string
  icon: string
  name: string
  hint: string
  unlocked: boolean
}

export interface StatisticsAttributeScores {
  pwr: number
  spd: number
  wis: number
  stm: number
  end: number
  arc: number
}

export interface StatisticsFavoriteTag {
  name: string
  count: number
}

export interface StatisticsBusiestDay {
  date: string
  count: number
}

export interface StatisticsLongestManga {
  id: string | null
  title: string
  chapters: number
}

export interface StatisticsOverview {
  generatedAt: number
  historyEventCount: number
  counts: {
    current: number
    deleted: number
    allTime: number
  }
  chapters: {
    current: number
    allTime: number
    tracked: number
    unread: number
    averagePerManga: number
  }
  linked: {
    mangaDex: number
    comick: number
  }
  focusCount: number
  statusCounts: Record<MangaStatus, number>
  firstTrackedAt: number | null
  longestManga: StatisticsLongestManga
  activityByDay: Record<string, number>
  activityByMonth: Record<string, number>
  activeDays: number
  currentStreak: number
  bestStreak: number
  busiestDay: StatisticsBusiestDay | null
  tags: Record<string, number>
  favoriteTag: StatisticsFavoriteTag | null
  uniqueTags: number
  level: number
  xpCurrent: number
  xpRequired: number
  xpPercent: number
  jobClass: string
  jobIcon: string
  secondaryClass: string | null
  stats: StatisticsAttributeScores
  achievements: StatisticsAchievement[]
  tagCache: {
    fetchedAt: number | null
    ageMinutes: number | null
    stale: boolean
    refreshing: boolean
    sourceKey: string
    sourceCount: number
  }
}

export type Theme = 'light' | 'dark' | 'system'
export type Language = 'en' | 'de'
export type ReadBehavior = 'main' | 'chapter' | 'ask'

export interface GistTombstone {
  id: string
  deletedAt: number
}

export interface AppSettings {
  theme: Theme
  language: Language
  readBehavior: ReadBehavior
  domainWhitelist: string[]
  domainBlocklist: string[]
  notificationIntervalMs: number
  notificationsEnabled: boolean
  backgroundNotificationsEnabled: boolean
  autoLinkEnabled: boolean
  desktopNotificationsEnabled: boolean
  readerInSeparateWindow: boolean
  elementPickerEnabled: boolean
  blockNewWindows: boolean
  titleExpand: boolean
  gistSyncEnabled: boolean
  gistAutoSync: boolean
  githubToken?: string
  gistId?: string
  lastGistSync?: number
}

export interface ReaderOpenPayload {
  mangaId: string
  url: string
}

export type DomainGuardChoice = 'yes' | 'yes_always' | 'no' | 'no_block'

export interface DomainGuardRequest {
  requestId: string
  targetDomain: string
  originDomain: string
}

export interface NewChapterNotification {
  mangaId: string
  title: string
  newChapter: number
}

export interface IpcResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

export type LogEntryType = 'info' | 'success' | 'error' | 'warning'

export interface LogEntry {
  id: string
  type: LogEntryType
  message: string
  timestamp: number
}

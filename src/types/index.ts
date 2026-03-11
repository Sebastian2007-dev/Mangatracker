export type MangaStatus =
  | 'reading'
  | 'plan_to_read'
  | 'hiatus'
  | 'completed'
  | 'rereading'

export type TabId = MangaStatus | 'focus'

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
  createdAt: number
  updatedAt: number
}

export interface DeletedMangaEntry {
  manga: Manga
  deletedAt: number
}

export type Theme = 'light' | 'dark' | 'system'
export type Language = 'en' | 'de'
export type ReadBehavior = 'main' | 'chapter' | 'ask'

export interface AppSettings {
  theme: Theme
  language: Language
  readBehavior: ReadBehavior
  domainWhitelist: string[]
  domainBlocklist: string[]
  notificationIntervalMs: number
  notificationsEnabled: boolean
  desktopNotificationsEnabled: boolean
  readerInSeparateWindow: boolean
  elementPickerEnabled: boolean
  blockNewWindows: boolean
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

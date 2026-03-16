import type { Manga } from './index'

export interface ModManifest {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  type: ('theme' | 'scanner' | 'plugin')[]
  /** Optional desktop sidebar tab for this mod */
  sidebarTab?: ModSidebarTab
  /** JS entry file, default: 'index.js' */
  main?: string
  /** CSS file for theme mods, default: 'theme.css' */
  theme?: string
  /** Optional i18n folder path, default: 'i18n' */
  i18nDir?: string
  /** Optional settings schema shown in the UI */
  settings?: ModSettingsField[]
}

export interface ModSidebarTab {
  /** Label shown as tooltip and heading (defaults to mod.name) */
  label?: string
  /** HTML file path (relative to mod dir) to render as the tab content */
  html?: string
}

export interface ModSettingsField {
  key: string
  type: 'text' | 'boolean' | 'number' | 'select'
  label: string
  default?: unknown
  /** Only for type 'select' */
  options?: string[]
}

export interface ChapterScanner {
  name: string
  /** Higher priority = checked first. Built-in scanners use -1. Default: 0 */
  priority?: number
  canHandle(manga: Manga): boolean
  check(manga: Manga): Promise<{ latestChapter: number | null; error?: string }>
}

export interface ModStorage {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export type ModEventName = 'manga:created' | 'manga:updated' | 'manga:deleted' | 'app:ready'

export interface ModApi {
  /** Register a custom chapter scanner */
  addChapterScanner(scanner: ChapterScanner): void
  /** Register an IPC handler accessible from the renderer via getBridge().invoke('mod:channel') */
  registerHandler(channel: string, handler: (payload: unknown) => Promise<unknown>): void
  /** Subscribe to app-level events */
  on(event: ModEventName, cb: (data: unknown) => void): void
  /** Log a message to the app's log view */
  log(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void
  /** Get namespaced persistent storage for this mod */
  getStorage(): ModStorage
  /** Returns the absolute path to this mod's folder — useful for reading local files */
  getDir(): string
  /** Read-only snapshot of the active manga list */
  getMangaList(): Manga[]
  /** Read-only snapshot of soft-deleted manga (each entry has a deletedAt timestamp) */
  getMangaTrash(): Manga[]
}

export interface LoadedMod {
  manifest: ModManifest
  dir: string
  enabled: boolean
  translations?: Record<string, Record<string, string>>
  /** HTML string for the sidebar tab view (read from sidebarTab.html) */
  tabHtml?: string
  error?: string
}

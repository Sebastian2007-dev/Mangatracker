import type { Manga } from './index'

export interface ModManifest {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  type: ('theme' | 'scanner' | 'plugin')[]
  /** JS entry file, default: 'index.js' */
  main?: string
  /** CSS file for theme mods, default: 'theme.css' */
  theme?: string
  /** Optional settings schema shown in the UI */
  settings?: ModSettingsField[]
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
}

export interface LoadedMod {
  manifest: ModManifest
  dir: string
  enabled: boolean
  error?: string
}

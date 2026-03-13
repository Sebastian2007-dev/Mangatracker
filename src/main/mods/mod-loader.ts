import { app, ipcMain, BrowserWindow } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import store from '../store'
import type { Manga, LogEntryType } from '../../types/index'
import type { ModManifest, ChapterScanner, ModApi, LoadedMod, ModEventName } from '../../types/mod'

let loadedMods: LoadedMod[] = []
let registeredScanners: ChapterScanner[] = []
let combinedThemeCSS = ''
let mainWin: BrowserWindow | null = null
let themeCssKey: string | null = null

const modListeners = new Map<ModEventName, Array<(data: unknown) => void>>()
const modIpcChannels = new Set<string>()

function getModsDir(): string {
  return join(app.getPath('userData'), 'mods')
}

function pushLog(type: LogEntryType, message: string): void {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('logs:entry', {
      id: randomUUID(),
      type,
      message,
      timestamp: Date.now()
    })
  }
}

function isDisabled(id: string): boolean {
  const disabled: string[] = (store as any).get('modDisabled') ?? []
  return disabled.includes(id)
}

function clearModRuntimeState(): void {
  loadedMods = []
  registeredScanners = []
  combinedThemeCSS = ''
  modListeners.clear()

  for (const channel of modIpcChannels) {
    ipcMain.removeHandler(channel)
  }
  modIpcChannels.clear()
}

function clearRequireCache(modulePath: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const resolved = require.resolve(modulePath)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    delete require.cache[resolved]
  } catch {
    // ignore cache miss
  }
}

function buildModApi(modId: string): ModApi {
  return {
    addChapterScanner(scanner: ChapterScanner): void {
      registeredScanners.push(scanner)
      registeredScanners.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    },

    registerHandler(channel: string, handler: (payload: unknown) => Promise<unknown>): void {
      const ipcChannel = `mod:${channel}`
      ipcMain.removeHandler(ipcChannel)
      modIpcChannels.add(ipcChannel)

      ipcMain.handle(ipcChannel, async (_event, payload) => {
        try {
          return { success: true, data: await handler(payload) }
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : String(e) }
        }
      })
    },

    on(event: ModEventName, cb: (data: unknown) => void): void {
      if (!modListeners.has(event)) modListeners.set(event, [])
      modListeners.get(event)!.push(cb)
    },

    log(message: string, type: LogEntryType = 'info'): void {
      pushLog(type, `[${modId}] ${message}`)
    },

    getStorage() {
      return {
        get(key: string): unknown {
          const all = ((store as any).get('modSettings') ?? {}) as Record<string, Record<string, unknown>>
          return all[modId]?.[key]
        },
        set(key: string, value: unknown): void {
          const all = ((store as any).get('modSettings') ?? {}) as Record<string, Record<string, unknown>>
          const modData = all[modId] ?? {}
          modData[key] = value
          all[modId] = modData
          ;(store as any).set('modSettings', all)
        }
      }
    }
  }
}

export async function loadMods(mainWindow: BrowserWindow): Promise<LoadedMod[]> {
  mainWin = mainWindow
  clearModRuntimeState()

  const modsDir = getModsDir()
  if (!existsSync(modsDir)) return []

  let entries: string[]
  try {
    entries = readdirSync(modsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }

  for (const dirName of entries) {
    const modDir = join(modsDir, dirName)
    const manifestPath = join(modDir, 'mod.json')
    if (!existsSync(manifestPath)) continue

    let manifest: ModManifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ModManifest
      if (!manifest.id || !manifest.name || !manifest.version || !Array.isArray(manifest.type)) {
        throw new Error('Invalid manifest (required fields: id, name, version, type)')
      }
    } catch (e) {
      loadedMods.push({
        manifest: { id: dirName, name: dirName, version: '?', type: [] },
        dir: modDir,
        enabled: false,
        error: `mod.json error: ${e instanceof Error ? e.message : String(e)}`
      })
      continue
    }

    const enabled = !isDisabled(manifest.id)
    const entry: LoadedMod = { manifest, dir: modDir, enabled }

    if (enabled) {
      if (manifest.type.includes('theme')) {
        const cssFile = join(modDir, manifest.theme ?? 'theme.css')
        if (existsSync(cssFile)) {
          try {
            combinedThemeCSS += `\n${readFileSync(cssFile, 'utf-8')}`
          } catch (e) {
            entry.error = `CSS error: ${e instanceof Error ? e.message : String(e)}`
          }
        }
      }

      if (manifest.type.includes('scanner') || manifest.type.includes('plugin')) {
        const jsFile = join(modDir, manifest.main ?? 'index.js')
        if (existsSync(jsFile)) {
          try {
            clearRequireCache(jsFile)
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const mod = require(jsFile) as { register?: (api: ModApi) => void }
            if (typeof mod.register === 'function') {
              mod.register(buildModApi(manifest.id))
            } else {
              entry.error = 'index.js does not export a register() function'
            }
          } catch (e) {
            entry.error = `Load error: ${e instanceof Error ? e.message : String(e)}`
          }
        } else {
          entry.error = `JS file not found: ${manifest.main ?? 'index.js'}`
        }
      }
    }

    loadedMods.push(entry)
    pushLog('info', `Mod loaded: ${manifest.name} v${manifest.version}${enabled ? '' : ' (disabled)'}`)
  }

  return loadedMods
}

export async function applyThemeCSS(): Promise<void> {
  if (!mainWin || mainWin.isDestroyed()) return

  if (themeCssKey) {
    try {
      await mainWin.webContents.removeInsertedCSS(themeCssKey)
    } catch {
      // ignore stale keys
    }
    themeCssKey = null
  }

  const css = getThemeCSS()
  if (!css) return

  try {
    themeCssKey = await mainWin.webContents.insertCSS(css)
  } catch {
    themeCssKey = null
  }
}

export async function scanMods(): Promise<LoadedMod[]> {
  if (!mainWin || mainWin.isDestroyed()) return loadedMods
  const mods = await loadMods(mainWin)
  await applyThemeCSS()
  return mods
}

export function getLoadedMods(): LoadedMod[] {
  return loadedMods
}

export function getRegisteredScanners(): ChapterScanner[] {
  return registeredScanners
}

export function getThemeCSS(): string {
  return combinedThemeCSS.trim()
}

export function getModsDirPath(): string {
  return getModsDir()
}

export function emitModEvent(event: ModEventName, data: unknown): void {
  const listeners = modListeners.get(event)
  if (!listeners) return
  for (const cb of listeners) {
    try {
      cb(data)
    } catch {
      // mod errors should never crash the app
    }
  }
}

export function setModEnabled(id: string, enabled: boolean): void {
  const disabled: string[] = (store as any).get('modDisabled') ?? []
  const next = enabled ? disabled.filter((x) => x !== id) : [...new Set([...disabled, id])]
  ;(store as any).set('modDisabled', next)

  const mod = loadedMods.find((m) => m.manifest.id === id)
  if (mod) mod.enabled = enabled
}

export function getModSetting(modId: string, key: string): unknown {
  const all = ((store as any).get('modSettings') ?? {}) as Record<string, Record<string, unknown>>
  return all[modId]?.[key]
}

export function setModSetting(modId: string, key: string, value: unknown): void {
  const all = ((store as any).get('modSettings') ?? {}) as Record<string, Record<string, unknown>>
  const modData = all[modId] ?? {}
  modData[key] = value
  all[modId] = modData
  ;(store as any).set('modSettings', all)
}

export function getModSettings(modId: string): Record<string, unknown> {
  const all = ((store as any).get('modSettings') ?? {}) as Record<string, Record<string, unknown>>
  return all[modId] ?? {}
}

export type { Manga }

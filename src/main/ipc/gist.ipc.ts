import { ipcMain, session as electronSession } from 'electron'
import store from '../store'
import type {
  GistTombstone,
  Manga,
  SkillTreeState,
  StatisticsEvent,
  StatisticsTagCache,
  TrashedManga
} from '../../types/index'
import {
  buildSyncPayload,
  GIST_FILE_NAME,
  mergeLists,
  mergeProfile,
  mergeSkillTree,
  mergeStatisticsPayload,
  parseSyncPayload
} from '../../shared/gist.sync'
import { notifyStatsUpdated } from '../stats.service'
import { broadcastSettingsChanged } from './settings.ipc'

const GITHUB_API = 'https://api.github.com'
const FETCH_TIMEOUT_MS = 20_000

// Timeout auf allen GitHub-Requests — ein hängender Host darf den Sync nicht stallen
function ghFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return electronSession.defaultSession.fetch(url, {
    ...init,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })
}

// GitHub beantwortet gleichzeitige PATCHes desselben Gists mit 409 Conflict.
// Auto-Sync beim Start, der debounced Mutations-Sync und der Button in den
// Einstellungen liefen bisher ungebremst parallel — deshalb laufen ab hier alle
// Gist-Operationen serialisiert durch diese Queue.
let gistQueue: Promise<unknown> = Promise.resolve()

function serializeGistOp<T>(task: () => Promise<T>): Promise<T> {
  const run = gistQueue.then(task, task)
  // Fehler nicht weiterreichen, sonst reisst ein Fehlschlag die Queue ab
  gistQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function isConflict(error: string | undefined): boolean {
  return typeof error === 'string' && error.includes('HTTP 409')
}

/** Haengt GitHubs eigene Fehlermeldung an, damit ein Status allein nicht raetselhaft bleibt. */
async function ghError(label: string, res: Response): Promise<Error> {
  let detail = ''
  try {
    const body = (await res.json()) as { message?: string }
    if (body.message) detail = ` — ${body.message}`
  } catch {
    // Kein JSON-Body — dann bleibt es beim Status
  }
  return new Error(`${label}: HTTP ${res.status}${detail}`)
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'MangaTracker/1.0'
  }
}

async function findOrCreateGist(token: string, existingGistId: string): Promise<string> {
  if (existingGistId) {
    const check = await ghFetch(`${GITHUB_API}/gists/${existingGistId}`, {
      headers: githubHeaders(token)
    })
    if (check.ok) return existingGistId
  }

  const listRes = await ghFetch(`${GITHUB_API}/gists?per_page=100`, {
    headers: githubHeaders(token)
  })
  if (listRes.ok) {
    const gists = (await listRes.json()) as Array<{ id: string; files: Record<string, unknown> }>
    const found = gists.find((gist) => gist.files[GIST_FILE_NAME])
    if (found) return found.id
  }

  const createRes = await ghFetch(`${GITHUB_API}/gists`, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify({
      description: 'MangaTracker Sync',
      public: false,
      files: {
        [GIST_FILE_NAME]: {
          content: buildSyncPayload([], [], { events: [], tagCache: null })
        }
      }
    })
  })
  if (!createRes.ok) throw await ghError('Gist konnte nicht erstellt werden', createRes)

  const created = (await createRes.json()) as { id: string }
  return created.id
}

async function syncGistInner(
  token: string,
  storedGistId: string
): Promise<{ success: boolean; gistId?: string; error?: string }> {
  try {
    const settings = store.get('settings')
    const gistId = await findOrCreateGist(token, storedGistId)

    const gistRes = await ghFetch(`${GITHUB_API}/gists/${gistId}`, {
      headers: githubHeaders(token)
    })
    if (!gistRes.ok) throw await ghError('Gist konnte nicht geladen werden', gistRes)

    const gistData = (await gistRes.json()) as { files: Record<string, { content: string }> }
    const remoteContent = gistData.files[GIST_FILE_NAME]?.content ?? '{}'

    const remotePayload = (() => {
      try {
        return parseSyncPayload(remoteContent)
      } catch {
        return {
          version: 1,
          syncedAt: 0,
          manga: [] as Manga[],
          deleted: [] as GistTombstone[],
          stats: { events: [] as StatisticsEvent[], tagCache: null as StatisticsTagCache | null }
        }
      }
    })()

    const localManga = (store.get('mangaList') ?? []) as Manga[]
    const localTrash = (store.get('mangaTrash') ?? []) as TrashedManga[]
    const localDeleted: GistTombstone[] = localTrash.map((manga) => ({
      id: manga.id,
      deletedAt: manga.deletedAt ?? manga.updatedAt
    }))
    const localStats = {
      events: (store.get('statsEvents') ?? []) as StatisticsEvent[],
      tagCache: (store.get('statsTagCache') ?? null) as StatisticsTagCache | null
    }
    const localProfile = (settings.profileName || settings.profileAvatar)
      ? {
          name: settings.profileName ?? '',
          avatar: settings.profileAvatar ?? '',
          updatedAt: settings.profileUpdatedAt ?? 0
        }
      : undefined

    const localSkillTree = store.get('skillTree') as SkillTreeState | undefined

    // Skill-Tree zuerst mergen: mergeLists braucht ihn, um die Focus-Slot-Obergrenze
    // zu kennen — ohne ihn faellt es auf FOCUS_BASE (3) zurueck und entfokussiert alles
    // darueber hinaus.
    const mergedSkillTree = mergeSkillTree(localSkillTree, remotePayload.skillTree)

    const { manga: mergedManga, deleted: mergedDeleted } = mergeLists(
      localManga,
      remotePayload.manga,
      localDeleted,
      remotePayload.deleted,
      mergedSkillTree
    )
    const mergedStats = mergeStatisticsPayload(localStats, remotePayload.stats)
    const mergedProfile = mergeProfile(localProfile, remotePayload.profile)

    const patchRes = await ghFetch(`${GITHUB_API}/gists/${gistId}`, {
      method: 'PATCH',
      headers: githubHeaders(token),
      body: JSON.stringify({
        files: {
          [GIST_FILE_NAME]: {
            content: buildSyncPayload(mergedManga, mergedDeleted, mergedStats, mergedProfile, mergedSkillTree)
          }
        }
      })
    })
    if (!patchRes.ok) throw await ghError('Gist konnte nicht aktualisiert werden', patchRes)

    // Während der Netzwerk-Roundtrips kann der Store lokal weiterbearbeitet worden
    // sein (User-Edit, Poller) — deshalb vor dem Zurückschreiben frisch lesen und
    // gegen den gepushten Merge-Stand erneut mergen, statt die Snapshots von oben
    // blind zurückzuschreiben.
    const freshManga = (store.get('mangaList') ?? []) as Manga[]
    const freshTrash = (store.get('mangaTrash') ?? []) as TrashedManga[]
    const freshDeleted: GistTombstone[] = freshTrash.map((manga) => ({
      id: manga.id,
      deletedAt: manga.deletedAt ?? manga.updatedAt
    }))
    const freshStats = {
      events: (store.get('statsEvents') ?? []) as StatisticsEvent[],
      tagCache: (store.get('statsTagCache') ?? null) as StatisticsTagCache | null
    }
    const freshSkillTree = mergeSkillTree(store.get('skillTree') as SkillTreeState | undefined, mergedSkillTree)
    const { manga: finalManga } = mergeLists(freshManga, mergedManga, freshDeleted, mergedDeleted, freshSkillTree)
    const finalStats = mergeStatisticsPayload(freshStats, mergedStats)
    const freshSettings = store.get('settings')

    const profileUpdated = mergedProfile && mergedProfile.updatedAt > (freshSettings.profileUpdatedAt ?? 0)
    store.set('mangaList', finalManga)
    store.set('skillTree', freshSkillTree)
    store.set('statsEvents', finalStats.events)
    store.set('statsTagCache', finalStats.tagCache)
    store.set('settings', {
      ...freshSettings,
      gistId,
      lastGistSync: Date.now(),
      ...(profileUpdated ? {
        profileName: mergedProfile!.name,
        profileAvatar: mergedProfile!.avatar,
        profileUpdatedAt: mergedProfile!.updatedAt
      } : {})
    })
    notifyStatsUpdated()
    if (profileUpdated) broadcastSettingsChanged()

    return { success: true, gistId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function uploadGistInner(
  token: string,
  storedGistId: string
): Promise<{ success: boolean; gistId?: string; error?: string }> {
  try {
    const settings = store.get('settings')
    const gistId = await findOrCreateGist(token, storedGistId)

    const localManga = (store.get('mangaList') ?? []) as Manga[]
    const localTrash = (store.get('mangaTrash') ?? []) as TrashedManga[]
    const localDeleted: GistTombstone[] = localTrash.map((manga) => ({
      id: manga.id,
      deletedAt: manga.deletedAt ?? manga.updatedAt
    }))
    const localStats = {
      events: (store.get('statsEvents') ?? []) as StatisticsEvent[],
      tagCache: (store.get('statsTagCache') ?? null) as StatisticsTagCache | null
    }
    const localProfile = (settings.profileName || settings.profileAvatar)
      ? { name: settings.profileName ?? '', avatar: settings.profileAvatar ?? '', updatedAt: settings.profileUpdatedAt ?? 0 }
      : undefined

    const patchRes = await electronSession.defaultSession.fetch(`${GITHUB_API}/gists/${gistId}`, {
      method: 'PATCH',
      headers: githubHeaders(token),
      body: JSON.stringify({
        files: {
          [GIST_FILE_NAME]: {
            content: buildSyncPayload(
              localManga,
              localDeleted,
              localStats,
              localProfile,
              store.get('skillTree') as SkillTreeState | undefined
            )
          }
        }
      })
    })
    if (!patchRes.ok) throw await ghError('Gist konnte nicht hochgeladen werden', patchRes)

    store.set('settings', { ...settings, gistId, lastGistSync: Date.now() })
    return { success: true, gistId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function downloadGistInner(
  token: string,
  storedGistId: string
): Promise<{ success: boolean; gistId?: string; error?: string }> {
  try {
    const settings = store.get('settings')
    const gistId = await findOrCreateGist(token, storedGistId)

    const gistRes = await electronSession.defaultSession.fetch(`${GITHUB_API}/gists/${gistId}`, {
      headers: githubHeaders(token)
    })
    if (!gistRes.ok) throw await ghError('Gist konnte nicht geladen werden', gistRes)

    const gistData = (await gistRes.json()) as { files: Record<string, { content: string }> }
    const remoteContent = gistData.files[GIST_FILE_NAME]?.content ?? '{}'
    const remotePayload = parseSyncPayload(remoteContent)

    if (remotePayload.skillTree) {
      store.set('skillTree', remotePayload.skillTree)
    }
    store.set('mangaList', remotePayload.manga)
    store.set('statsEvents', remotePayload.stats.events)
    store.set('statsTagCache', remotePayload.stats.tagCache)

    const profileUpdated = remotePayload.profile && remotePayload.profile.updatedAt > (settings.profileUpdatedAt ?? 0)
    store.set('settings', {
      ...settings,
      gistId,
      lastGistSync: Date.now(),
      ...(profileUpdated ? {
        profileName: remotePayload.profile!.name,
        profileAvatar: remotePayload.profile!.avatar,
        profileUpdatedAt: remotePayload.profile!.updatedAt
      } : {})
    })
    notifyStatsUpdated()
    if (profileUpdated) broadcastSettingsChanged()

    return { success: true, gistId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// ─── Serialisierte, oeffentliche Einstiegspunkte ──────────────────────────
// Ein 409 heisst: ein anderes Geraet hat parallel in denselben Gist geschrieben.
// Der Inner-Aufruf beginnt mit einem GET, ein zweiter Versuch mergt also gegen
// den frischen Remote-Stand statt ihn zu ueberschreiben.

export function syncGistDirect(
  token: string,
  storedGistId: string
): Promise<{ success: boolean; gistId?: string; error?: string }> {
  return serializeGistOp(async () => {
    const first = await syncGistInner(token, storedGistId)
    if (first.success || !isConflict(first.error)) return first
    return syncGistInner(token, storedGistId)
  })
}

export function uploadGistDirect(
  token: string,
  storedGistId: string
): Promise<{ success: boolean; gistId?: string; error?: string }> {
  return serializeGistOp(async () => {
    const first = await uploadGistInner(token, storedGistId)
    if (first.success || !isConflict(first.error)) return first
    return uploadGistInner(token, storedGistId)
  })
}

export function downloadGistDirect(
  token: string,
  storedGistId: string
): Promise<{ success: boolean; gistId?: string; error?: string }> {
  return serializeGistOp(() => downloadGistInner(token, storedGistId))
}

export function registerGistIpc(): void {
  ipcMain.handle('gist:testAuth', async (_event, { token }: { token: string }) => {
    try {
      const response = await ghFetch(`${GITHUB_API}/user`, {
        headers: githubHeaders(token)
      })
      if (!response.ok) return { success: false, error: `HTTP ${response.status}` }
      const data = (await response.json()) as { login: string }
      return { success: true, data: { username: data.login } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('gist:sync', async (_event, { token, gistId: providedGistId }: { token: string; gistId?: string }) => {
    try {
      const settings = store.get('settings')
      const storedGistId = providedGistId ?? settings.gistId ?? ''
      const result = await syncGistDirect(token, storedGistId)
      if (!result.success) return result
      const mergedManga = store.get('mangaList')
      return { success: true, data: mergedManga, gistId: result.gistId }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('gist:upload', async (_event, { token, gistId: providedGistId }: { token: string; gistId?: string }) => {
    try {
      const settings = store.get('settings')
      const storedGistId = providedGistId ?? settings.gistId ?? ''
      const result = await uploadGistDirect(token, storedGistId)
      return result
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('gist:download', async (_event, { token, gistId: providedGistId }: { token: string; gistId?: string }) => {
    try {
      const settings = store.get('settings')
      const storedGistId = providedGistId ?? settings.gistId ?? ''
      const result = await downloadGistDirect(token, storedGistId)
      if (!result.success) return result
      const mangaList = store.get('mangaList')
      return { success: true, data: mangaList, gistId: result.gistId }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('gist:disconnect', async () => {
    try {
      const settings = store.get('settings')
      store.set('settings', { ...settings, githubToken: '', gistId: '', gistSyncEnabled: false, lastGistSync: 0 })
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
import { ipcMain, session as electronSession } from 'electron'
import store from '../store'
import type {
  GistTombstone,
  Manga,
  StatisticsEvent,
  StatisticsTagCache,
  TrashedManga
} from '../../types/index'
import {
  buildSyncPayload,
  GIST_FILE_NAME,
  mergeLists,
  mergeStatisticsPayload,
  parseSyncPayload
} from '../../shared/gist.sync'
import { notifyStatsUpdated } from '../stats.service'

const GITHUB_API = 'https://api.github.com'

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
    const check = await electronSession.defaultSession.fetch(`${GITHUB_API}/gists/${existingGistId}`, {
      headers: githubHeaders(token)
    })
    if (check.ok) return existingGistId
  }

  const listRes = await electronSession.defaultSession.fetch(`${GITHUB_API}/gists?per_page=100`, {
    headers: githubHeaders(token)
  })
  if (listRes.ok) {
    const gists = (await listRes.json()) as Array<{ id: string; files: Record<string, unknown> }>
    const found = gists.find((gist) => gist.files[GIST_FILE_NAME])
    if (found) return found.id
  }

  const createRes = await electronSession.defaultSession.fetch(`${GITHUB_API}/gists`, {
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
  if (!createRes.ok) throw new Error(`Gist konnte nicht erstellt werden: HTTP ${createRes.status}`)

  const created = (await createRes.json()) as { id: string }
  return created.id
}

export async function syncGistDirect(
  token: string,
  storedGistId: string
): Promise<{ success: boolean; gistId?: string; error?: string }> {
  try {
    const settings = store.get('settings')
    const gistId = await findOrCreateGist(token, storedGistId)

    const gistRes = await electronSession.defaultSession.fetch(`${GITHUB_API}/gists/${gistId}`, {
      headers: githubHeaders(token)
    })
    if (!gistRes.ok) throw new Error(`Gist konnte nicht geladen werden: HTTP ${gistRes.status}`)

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

    const { manga: mergedManga, deleted: mergedDeleted } = mergeLists(
      localManga,
      remotePayload.manga,
      localDeleted,
      remotePayload.deleted
    )
    const mergedStats = mergeStatisticsPayload(localStats, remotePayload.stats)

    const patchRes = await electronSession.defaultSession.fetch(`${GITHUB_API}/gists/${gistId}`, {
      method: 'PATCH',
      headers: githubHeaders(token),
      body: JSON.stringify({
        files: {
          [GIST_FILE_NAME]: {
            content: buildSyncPayload(mergedManga, mergedDeleted, mergedStats)
          }
        }
      })
    })
    if (!patchRes.ok) throw new Error(`Gist konnte nicht aktualisiert werden: HTTP ${patchRes.status}`)

    store.set('mangaList', mergedManga)
    store.set('statsEvents', mergedStats.events)
    store.set('statsTagCache', mergedStats.tagCache)
    store.set('settings', { ...settings, gistId, lastGistSync: Date.now() })
    notifyStatsUpdated()

    return { success: true, gistId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function registerGistIpc(): void {
  ipcMain.handle('gist:testAuth', async (_event, { token }: { token: string }) => {
    try {
      const response = await electronSession.defaultSession.fetch(`${GITHUB_API}/user`, {
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
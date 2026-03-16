import type {
  GistTombstone,
  Manga,
  StatisticsEvent,
  StatisticsTagCache,
  TrashedManga
} from '../../../../types/index'
import {
  buildSyncPayload,
  GIST_FILE_NAME,
  mergeLists,
  mergeStatisticsPayload,
  parseSyncPayload
} from '../../../../shared/gist.sync'
import {
  getMangaList,
  getMangaTrash,
  getSettings,
  getStatsEvents,
  getStatsTagCache,
  setMangaList,
  setSettings,
  setStatsEvents,
  setStatsTagCache
} from './storage.service'
import { notifyStatsUpdated } from './stats.service'

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
    const check = await fetch(`${GITHUB_API}/gists/${existingGistId}`, {
      headers: githubHeaders(token)
    })
    if (check.ok) return existingGistId
  }

  const listRes = await fetch(`${GITHUB_API}/gists?per_page=100`, {
    headers: githubHeaders(token)
  })
  if (listRes.ok) {
    const gists = (await listRes.json()) as Array<{ id: string; files: Record<string, unknown> }>
    const found = gists.find((gist) => gist.files[GIST_FILE_NAME])
    if (found) return found.id
  }

  const createRes = await fetch(`${GITHUB_API}/gists`, {
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

export async function testAuth(payload: unknown): Promise<{ success: boolean; data?: { username: string }; error?: string }> {
  const { token } = payload as { token: string }
  try {
    const response = await fetch(`${GITHUB_API}/user`, { headers: githubHeaders(token) })
    if (!response.ok) return { success: false, error: `HTTP ${response.status}` }
    const data = (await response.json()) as { login: string }
    return { success: true, data: { username: data.login } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function sync(payload: unknown): Promise<{ success: boolean; data?: Manga[]; gistId?: string; error?: string }> {
  const { token, gistId: providedGistId } = payload as { token: string; gistId?: string }

  try {
    const settings = await getSettings()
    const storedGistId = providedGistId ?? settings.gistId ?? ''
    const gistId = await findOrCreateGist(token, storedGistId)

    const gistRes = await fetch(`${GITHUB_API}/gists/${gistId}`, { headers: githubHeaders(token) })
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

    const localManga = await getMangaList()
    const localTrash = await getMangaTrash()
    const localDeleted: GistTombstone[] = (localTrash as TrashedManga[]).map((manga) => ({
      id: manga.id,
      deletedAt: manga.deletedAt ?? manga.updatedAt
    }))
    const localStats = {
      events: await getStatsEvents(),
      tagCache: await getStatsTagCache()
    }

    const { manga: mergedManga, deleted: mergedDeleted } = mergeLists(
      localManga,
      remotePayload.manga,
      localDeleted,
      remotePayload.deleted
    )
    const mergedStats = mergeStatisticsPayload(localStats, remotePayload.stats)

    const patchRes = await fetch(`${GITHUB_API}/gists/${gistId}`, {
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

    await setMangaList(mergedManga)
    await setStatsEvents(mergedStats.events)
    await setStatsTagCache(mergedStats.tagCache)
    await setSettings({ gistId, lastGistSync: Date.now() })
    notifyStatsUpdated()

    return { success: true, data: mergedManga, gistId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function disconnect(): Promise<{ success: boolean }> {
  try {
    await setSettings({ githubToken: '', gistId: '', gistSyncEnabled: false, lastGistSync: 0 })
    return { success: true }
  } catch {
    return { success: false }
  }
}
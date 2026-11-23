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
  mergeProfile,
  mergeSkillTree,
  mergeStatisticsPayload,
  parseSyncPayload
} from '../../../../shared/gist.sync'
import {
  getMangaList,
  getMangaTrash,
  getSettings,
  getSkillTree,
  getStatsEvents,
  getStatsTagCache,
  setMangaList,
  setSettings,
  setSkillTree,
  setStatsEvents,
  setStatsTagCache
} from './storage.service'
import { notifyStatsUpdated } from './stats.service'

const GITHUB_API = 'https://api.github.com'

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
  if (!createRes.ok) throw await ghError('Gist konnte nicht erstellt werden', createRes)

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

async function syncInner(payload: unknown): Promise<{ success: boolean; data?: Manga[]; gistId?: string; error?: string }> {
  const { token, gistId: providedGistId } = payload as { token: string; gistId?: string }

  try {
    const settings = await getSettings()
    const storedGistId = providedGistId ?? settings.gistId ?? ''
    const gistId = await findOrCreateGist(token, storedGistId)

    const gistRes = await fetch(`${GITHUB_API}/gists/${gistId}`, { headers: githubHeaders(token) })
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
    const localProfile = (settings.profileName || settings.profileAvatar)
      ? { name: settings.profileName ?? '', avatar: settings.profileAvatar ?? '', updatedAt: settings.profileUpdatedAt ?? 0 }
      : undefined

    const localSkillTree = await getSkillTree()

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

    const patchRes = await fetch(`${GITHUB_API}/gists/${gistId}`, {
      method: 'PATCH',
      headers: githubHeaders(token),
      body: JSON.stringify({
        files: {
          [GIST_FILE_NAME]: {
            content: buildSyncPayload(
              mergedManga,
              mergedDeleted,
              mergedStats,
              mergedProfile,
              mergedSkillTree
            )
          }
        }
      })
    })
    if (!patchRes.ok) throw await ghError('Gist konnte nicht aktualisiert werden', patchRes)

    await setSkillTree(mergedSkillTree)
    await setMangaList(mergedManga)
    await setStatsEvents(mergedStats.events)
    await setStatsTagCache(mergedStats.tagCache)

    const profileUpdated = mergedProfile && mergedProfile.updatedAt > (settings.profileUpdatedAt ?? 0)
    await setSettings({
      gistId,
      lastGistSync: Date.now(),
      ...(profileUpdated ? {
        profileName: mergedProfile!.name,
        profileAvatar: mergedProfile!.avatar,
        profileUpdatedAt: mergedProfile!.updatedAt
      } : {})
    })
    notifyStatsUpdated()

    return { success: true, data: mergedManga, gistId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}



// ─── Serialisierte, oeffentliche Einstiegspunkte ──────────────────────────
// Ein 409 heisst: ein anderes Geraet hat parallel in denselben Gist geschrieben.
// syncInner/uploadInner beginnen mit einem GET, ein zweiter Versuch mergt also
// gegen den frischen Remote-Stand statt ihn zu ueberschreiben.

export function sync(
  payload: unknown
): Promise<{ success: boolean; data?: Manga[]; gistId?: string; error?: string }> {
  return serializeGistOp(async () => {
    const first = await syncInner(payload)
    if (first.success || !isConflict(first.error)) return first
    return syncInner(payload)
  })
}



export async function disconnect(): Promise<{ success: boolean }> {
  try {
    await setSettings({ githubToken: '', gistId: '', gistSyncEnabled: false, lastGistSync: 0 })
    return { success: true }
  } catch {
    return { success: false }
  }
}
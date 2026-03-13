import { ipcMain, session as electronSession } from 'electron'
import store from '../store'
import type { Manga, GistTombstone } from '../../types/index'

const GIST_FILE_NAME = 'mangatracker-sync.json'
const GITHUB_API = 'https://api.github.com'

interface GistPayload {
  version: number
  syncedAt: number
  manga: Manga[]
  deleted: GistTombstone[]
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'MangaTracker/1.0'
  }
}

function mergeLists(
  local: Manga[],
  remote: Manga[],
  localDeleted: GistTombstone[],
  remoteDeleted: GistTombstone[]
): { manga: Manga[]; deleted: GistTombstone[] } {
  // Union per ID — neueres updatedAt gewinnt
  const map = new Map<string, Manga>()
  for (const m of local) map.set(m.id, m)
  for (const m of remote) {
    const existing = map.get(m.id)
    if (!existing || m.updatedAt > existing.updatedAt) map.set(m.id, m)
  }

  // Tombstones zusammenführen — neueres deletedAt gewinnt
  const tombstoneMap = new Map<string, GistTombstone>()
  for (const t of localDeleted) tombstoneMap.set(t.id, t)
  for (const t of remoteDeleted) {
    const existing = tombstoneMap.get(t.id)
    if (!existing || t.deletedAt > existing.deletedAt) tombstoneMap.set(t.id, t)
  }

  // Tombstones anwenden: deletedAt > updatedAt → löschen
  for (const [id, tombstone] of tombstoneMap) {
    const manga = map.get(id)
    if (manga && tombstone.deletedAt >= manga.updatedAt) map.delete(id)
  }

  // Focus-Limit: maximal 3 — älteste un-fokussieren
  let merged = Array.from(map.values())
  const focused = merged.filter((m) => m.isFocused).sort((a, b) => b.updatedAt - a.updatedAt)
  if (focused.length > 3) {
    const toUnfocus = new Set(focused.slice(3).map((m) => m.id))
    merged = merged.map((m) => (toUnfocus.has(m.id) ? { ...m, isFocused: false } : m))
  }

  return { manga: merged, deleted: Array.from(tombstoneMap.values()) }
}

async function findOrCreateGist(token: string, existingGistId: string): Promise<string> {
  // Falls eine Gist-ID gespeichert ist, erst prüfen ob sie noch existiert
  if (existingGistId) {
    const check = await electronSession.defaultSession.fetch(`${GITHUB_API}/gists/${existingGistId}`, {
      headers: githubHeaders(token)
    })
    if (check.ok) return existingGistId
  }

  // In der Liste der Gists nach einer vorhandenen mangatracker-sync.json suchen
  const listRes = await electronSession.defaultSession.fetch(`${GITHUB_API}/gists?per_page=100`, {
    headers: githubHeaders(token)
  })
  if (listRes.ok) {
    const gists = (await listRes.json()) as { id: string; files: Record<string, unknown> }[]
    const found = gists.find((g) => g.files[GIST_FILE_NAME])
    if (found) return found.id
  }

  // Neuen privaten Gist anlegen
  const createRes = await electronSession.defaultSession.fetch(`${GITHUB_API}/gists`, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify({
      description: 'MangaTracker Sync',
      public: false,
      files: {
        [GIST_FILE_NAME]: {
          content: JSON.stringify({ version: 1, syncedAt: Date.now(), manga: [], deleted: [] }, null, 2)
        }
      }
    })
  })
  if (!createRes.ok) throw new Error(`Gist konnte nicht erstellt werden: HTTP ${createRes.status}`)
  const created = (await createRes.json()) as { id: string }
  return created.id
}

/** Direkter Sync-Aufruf (ohne IPC) — kann vom Main-Prozess direkt aufgerufen werden, z.B. vor App-Close */
export async function syncGistDirect(token: string, storedGistId: string): Promise<{ success: boolean; gistId?: string; error?: string }> {
  try {
    const settings = store.get('settings')
    const gistId = await findOrCreateGist(token, storedGistId)

    const gistRes = await electronSession.defaultSession.fetch(`${GITHUB_API}/gists/${gistId}`, {
      headers: githubHeaders(token)
    })
    if (!gistRes.ok) throw new Error(`Gist konnte nicht geladen werden: HTTP ${gistRes.status}`)

    const gistData = (await gistRes.json()) as { files: Record<string, { content: string }> }
    const remoteContent = gistData.files[GIST_FILE_NAME]?.content ?? '{}'

    let remotePayload: GistPayload
    try {
      const raw = JSON.parse(remoteContent) as Partial<GistPayload>
      remotePayload = {
        version: raw.version ?? 1,
        syncedAt: raw.syncedAt ?? 0,
        manga: Array.isArray(raw.manga) ? raw.manga : [],
        deleted: Array.isArray(raw.deleted) ? raw.deleted : []
      }
    } catch {
      remotePayload = { version: 1, syncedAt: 0, manga: [], deleted: [] }
    }

    const localManga = store.get('mangaList')
    const localTrash = store.get('mangaTrash')
    const localDeleted: GistTombstone[] = localTrash.map((m) => ({
      id: m.id,
      deletedAt: (m as Manga & { deletedAt?: number }).deletedAt ?? m.updatedAt
    }))

    const { manga: mergedManga, deleted: mergedDeleted } = mergeLists(
      localManga,
      remotePayload.manga,
      localDeleted,
      remotePayload.deleted
    )

    const patchRes = await electronSession.defaultSession.fetch(`${GITHUB_API}/gists/${gistId}`, {
      method: 'PATCH',
      headers: githubHeaders(token),
      body: JSON.stringify({
        files: {
          [GIST_FILE_NAME]: {
            content: JSON.stringify(
              { version: 1, syncedAt: Date.now(), manga: mergedManga, deleted: mergedDeleted },
              null,
              2
            )
          }
        }
      })
    })
    if (!patchRes.ok) throw new Error(`Gist konnte nicht aktualisiert werden: HTTP ${patchRes.status}`)

    store.set('mangaList', mergedManga)
    store.set('settings', { ...settings, gistId, lastGistSync: Date.now() })

    return { success: true, gistId }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function registerGistIpc(): void {
  /** Testet ob der Token gültig ist — gibt GitHub-Username zurück */
  ipcMain.handle('gist:testAuth', async (_event, { token }: { token: string }) => {
    try {
      const res = await electronSession.defaultSession.fetch(`${GITHUB_API}/user`, {
        headers: githubHeaders(token)
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const data = (await res.json()) as { login: string }
      return { success: true, data: { username: data.login } }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  /** Synchronisiert die lokale Manga-Liste mit dem GitHub Gist */
  ipcMain.handle('gist:sync', async (_event, { token, gistId: providedGistId }: { token: string; gistId?: string }) => {
    try {
      const settings = store.get('settings')
      const storedGistId = providedGistId ?? settings.gistId ?? ''
      const result = await syncGistDirect(token, storedGistId)
      if (!result.success) return result
      const mergedManga = store.get('mangaList')
      return { success: true, data: mergedManga, gistId: result.gistId }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  /** Löscht Token und Gist-ID aus den Settings */
  ipcMain.handle('gist:disconnect', async () => {
    try {
      const settings = store.get('settings')
      store.set('settings', { ...settings, githubToken: '', gistId: '', gistSyncEnabled: false, lastGistSync: 0 })
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

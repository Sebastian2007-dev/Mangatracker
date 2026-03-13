/**
 * Gist Sync — plattformunabhängige Merge-Logik für GitHub Gist Synchronisation.
 * Kein fetch, kein IPC — nur pure Datenoperationen.
 */
import type { Manga, GistTombstone } from '../../../types/index'

const GIST_FILE_NAME = 'mangatracker-sync.json'
const GIST_VERSION = 1

export interface GistPayload {
  version: number
  syncedAt: number
  manga: Manga[]
  deleted: GistTombstone[]
}

/** Parst den rohen Gist-JSON-String und gibt ein GistPayload zurück. */
export function parseSyncPayload(json: string): GistPayload {
  const raw = JSON.parse(json) as Partial<GistPayload>
  return {
    version: raw.version ?? GIST_VERSION,
    syncedAt: raw.syncedAt ?? 0,
    manga: Array.isArray(raw.manga) ? raw.manga : [],
    deleted: Array.isArray(raw.deleted) ? raw.deleted : []
  }
}

/** Baut den JSON-String für den Gist aus der aktuellen Manga-Liste. */
export function buildSyncPayload(manga: Manga[], deleted: GistTombstone[]): string {
  const payload: GistPayload = {
    version: GIST_VERSION,
    syncedAt: Date.now(),
    manga,
    deleted
  }
  return JSON.stringify(payload, null, 2)
}

/**
 * Führt lokale und remote Manga-Listen zusammen.
 *
 * Algorithmus:
 * 1. Union beider Listen — Konflikte werden per updatedAt aufgelöst (neueres gewinnt)
 * 2. Tombstones beider Seiten werden zusammengeführt
 * 3. Einträge, die per Tombstone gelöscht wurden (deletedAt > updatedAt), werden entfernt
 * 4. Falls mehr als 3 Manga fokussiert sind, werden die ältesten un-fokussiert
 */
export function mergeLists(
  local: Manga[],
  remote: Manga[],
  localDeleted: GistTombstone[],
  remoteDeleted: GistTombstone[]
): { manga: Manga[]; deleted: GistTombstone[] } {
  // Schritt 1: Union per ID, neueres updatedAt gewinnt
  const map = new Map<string, Manga>()
  for (const m of local) map.set(m.id, m)
  for (const m of remote) {
    const existing = map.get(m.id)
    if (!existing || m.updatedAt > existing.updatedAt) {
      map.set(m.id, m)
    }
  }

  // Schritt 2: Tombstones zusammenführen (Union nach ID, neueres deletedAt gewinnt)
  const tombstoneMap = new Map<string, GistTombstone>()
  for (const t of localDeleted) tombstoneMap.set(t.id, t)
  for (const t of remoteDeleted) {
    const existing = tombstoneMap.get(t.id)
    if (!existing || t.deletedAt > existing.deletedAt) {
      tombstoneMap.set(t.id, t)
    }
  }

  // Schritt 3: Gelöschte Einträge aus der Manga-Liste entfernen
  // Regel: deletedAt > updatedAt → gelöscht; updatedAt > deletedAt → Bearbeitung nach Löschung, bleibt erhalten
  for (const [id, tombstone] of tombstoneMap) {
    const manga = map.get(id)
    if (manga && tombstone.deletedAt >= manga.updatedAt) {
      map.delete(id)
    } else if (!manga) {
      // Manga ist auf keiner Seite mehr aktiv — Tombstone kann aus der Map bleiben
    }
  }

  // Schritt 4: Focus-Limit auf 3 begrenzen (älteste un-fokussieren)
  let merged = Array.from(map.values())
  const focused = merged.filter((m) => m.isFocused).sort((a, b) => b.updatedAt - a.updatedAt)
  if (focused.length > 3) {
    const toUnfocus = new Set(focused.slice(3).map((m) => m.id))
    merged = merged.map((m) => (toUnfocus.has(m.id) ? { ...m, isFocused: false } : m))
  }

  return {
    manga: merged,
    deleted: Array.from(tombstoneMap.values())
  }
}

export { GIST_FILE_NAME }

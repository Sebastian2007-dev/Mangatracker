import type { TrashedManga } from '../types/index'

/**
 * Trash-Einträge sind die einzige lokale Tombstone-Quelle für den Gist-Sync.
 * Sie dürfen deshalb nicht sofort nach dem Undo-Fenster gelöscht werden —
 * sonst resurrectet der nächste Sync ein offline gelöschtes Manga.
 * Purge passiert stattdessen beim App-Start nach Ablauf der Retention.
 */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000 // 30 Tage

export function filterExpiredTrash(trash: TrashedManga[], now = Date.now()): TrashedManga[] {
  return trash.filter((manga) => now - (manga.deletedAt ?? 0) < TRASH_RETENTION_MS)
}

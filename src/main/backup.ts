import { app } from 'electron'
import { mkdir, readdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import store from './store'

const KEEP_COUNT = 7
const BACKUP_FILE_PATTERN = /^backup-\d{4}-\d{2}-\d{2}\.json$/

/**
 * Beim App-Start: Snapshot der Daten nach <userData>/backups/ schreiben.
 * Maximal ein Backup pro Kalendertag (der Tages-Erststand bleibt erhalten,
 * damit ein tagsüber kaputtgesyncter Zustand ihn nicht überschreibt),
 * die neuesten KEEP_COUNT Dateien werden behalten.
 * Das Format ist import-kompatibel: manga:import liest das mangaList-Feld.
 */
export async function runBackupRotation(): Promise<void> {
  try {
    const mangaList = store.get('mangaList')
    // Leere Bibliothek nicht sichern — sonst rotieren nach einem Datenverlust
    // ausgerechnet die noch brauchbaren Backups heraus.
    if (mangaList.length === 0) return

    const dir = join(app.getPath('userData'), 'backups')
    await mkdir(dir, { recursive: true })

    const today = new Date().toISOString().slice(0, 10)
    const fileName = `backup-${today}.json`
    const existing = (await readdir(dir)).filter((f) => BACKUP_FILE_PATTERN.test(f))

    if (!existing.includes(fileName)) {
      const snapshot = {
        createdAt: Date.now(),
        mangaList,
        mangaTrash: store.get('mangaTrash'),
        statsEvents: store.get('statsEvents'),
        earnedAchievements: store.get('earnedAchievements'),
        skillTree: store.get('skillTree'),
        settings: store.get('settings')
      }
      await writeFile(join(dir, fileName), JSON.stringify(snapshot, null, 2), 'utf-8')
      existing.push(fileName)
    }

    // Dateinamen enthalten ISO-Daten → lexikografische Sortierung ist chronologisch
    const surplus = existing.sort().slice(0, Math.max(0, existing.length - KEEP_COUNT))
    for (const file of surplus) {
      await unlink(join(dir, file)).catch(() => {})
    }
  } catch (e) {
    console.error('Backup rotation failed:', e)
  }
}

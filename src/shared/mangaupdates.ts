/**
 * MangaUpdates (Baka-Updates) — community-gepflegte Release-Datenbank.
 * Hostet selbst keine Kapitel → keine DMCA-Löschungen wie bei MangaDex.
 * Öffentliche API ohne Key: https://api.mangaupdates.com/v1
 *
 * Plattformneutral: nur URLs/Mapping, der HTTP-Transport kommt vom Aufrufer
 * (Desktop: Electron session.fetch, Mobile: CapacitorHttp).
 */

export const MU_API = 'https://api.mangaupdates.com/v1'
export const MU_USER_AGENT = 'MangaTracker/1.0 (personal hobby app)'

export const muSearchUrl = `${MU_API}/series/search`
export const muSeriesUrl = (id: string): string => `${MU_API}/series/${encodeURIComponent(id)}`

export function muSearchPayload(title: string): { search: string; perpage: number } {
  return { search: title, perpage: 10 }
}

type MuSearchResponse = {
  results?: {
    /** Der (ggf. alternative) Titel, über den die Suche getroffen hat */
    hit_title?: string
    record?: {
      series_id?: number | string
      title?: string
      type?: string
      image?: { url?: { original?: string | null; thumb?: string | null } }
    }
  }[]
}

export type MuSearchItem = { id: string; title: string; coverUrl: string | null }

// Keine Kapitel-Comics → würden falsche Kapitelstände liefern (Novel-Kapitel ≠ Comic-Kapitel)
const EXCLUDED_TYPES = new Set(['novel', 'doujinshi', 'artbook'])

export function mapMuSearch(json: unknown): MuSearchItem[] {
  const results = (json as MuSearchResponse | null)?.results ?? []
  return results
    .filter((r) => !!r.record && r.record.series_id != null)
    .filter((r) => !EXCLUDED_TYPES.has((r.record!.type ?? '').toLowerCase()))
    .map((r) => {
      const rec = r.record!
      return {
        id: String(rec.series_id),
        // hit_title ist der Name, unter dem der Nutzer den Titel kennt (oft der englische
        // Alternativtitel) — besser für Anzeige und Ähnlichkeitsabgleich als der Haupttitel.
        title: r.hit_title || rec.title || String(rec.series_id),
        coverUrl: rec.image?.url?.original || rec.image?.url?.thumb || null
      }
    })
}

/** latest_chapter aus GET /series/{id}; null wenn nicht vorhanden. */
export function muLatestChapter(json: unknown): number | null {
  const v = (json as { latest_chapter?: number | string | null } | null)?.latest_chapter
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 'NaN'))
  return Number.isFinite(n) && n > 0 ? n : null
}

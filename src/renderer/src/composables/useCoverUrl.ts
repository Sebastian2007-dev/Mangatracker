import { reactive } from 'vue'

type CoverSource = { mangaDexCoverUrl?: string; mangaUpdatesCoverUrl?: string; comickCoverUrl?: string }

// Cover-URLs, die im <img> nicht geladen werden konnten (z.B. MangaDex-Bot-
// Challenge bei Browser-User-Agent). Global, damit alle Ansichten desselben
// Manga gemeinsam auf den Fallback wechseln. Gilt bis zum App-Neustart.
const failedUrls = reactive(new Set<string>())

/** Erste noch nicht fehlgeschlagene Cover-URL: MangaDex → ComicK → MangaUpdates → null. */
export function coverUrlFor(m: CoverSource): string | null {
  for (const url of [m.mangaDexCoverUrl, m.comickCoverUrl, m.mangaUpdatesCoverUrl]) {
    if (url && !failedUrls.has(url)) return url
  }
  return null
}

/** Als @error-Handler am <img> verwenden: markiert die URL als kaputt → nächster Fallback. */
export function onCoverError(event: Event): void {
  const src = (event.target as HTMLImageElement | null)?.getAttribute('src')
  if (src) failedUrls.add(src)
}

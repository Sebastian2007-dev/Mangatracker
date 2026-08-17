/**
 * Background Runner Task — läuft via WorkManager (Android) im Hintergrund.
 * Kein DOM, kein Vue — nur CapacitorKV, CapacitorNotifications und fetch.
 * Manga-Liste wird via CapacitorKV gelesen. CapacitorKV nutzt das SharedPreferences-File
 * mit dem Namen des Runner-Labels (capacitor.config.ts) — die App MUSS deshalb
 * Preferences.configure({ group: '<label>' }) setzen (siehe storage.service.ts,
 * ensurePreferencesReady), sonst schreiben App und Runner in verschiedene Stores.
 *
 * Check-Ergebnisse (Spiegel der Desktop-Logik in chapterPoller.ts):
 *   { found: <number> }  → neues Kapitel
 *   'same'               → Quelle sagt: kein neues Kapitel (Short-Circuit, KEIN HTTP-Fallback)
 *   'skip'               → Quelle nicht nutzbar (Fehler/keine Daten) → nächste Stufe
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// FNV-1a — kollisionsarm im Gegensatz zur Zeichencode-Summe der UUID
function notificationIdFor(mangaId) {
  let hash = 0x811c9dc5
  for (let i = 0; i < mangaId.length; i++) {
    hash ^= mangaId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % 2147483647
}

async function checkMangaDex(manga) {
  const feedUrl =
    `https://api.mangadex.org/manga/${manga.mangaDexId}/feed` +
    `?translatedLanguage[]=en&order[chapter]=desc&limit=1` +
    `&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`

  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'MangaTracker/1.0 (personal hobby app)' }
  })
  if (!res.ok) return 'skip'

  const json = await res.json()
  const data = json.data ?? []
  if (data.length === 0) return 'skip'

  const latest = parseFloat(data[0].attributes.chapter ?? 'NaN')
  if (isNaN(latest)) return 'skip'
  if (latest <= manga.currentChapter) return 'same'
  return { found: latest }
}

async function checkComicK(manga) {
  const url = `https://api.comick.dev/comic/${manga.comickHid}/chapters?lang=en&limit=1&tachiyomi=true`
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json, text/plain, */*' }
  })
  if (!res.ok) return 'skip'

  const json = await res.json()
  const chapters = json.chapters ?? []
  if (chapters.length === 0) return 'skip'

  const latest = parseFloat(chapters[0].chap ?? 'NaN')
  if (isNaN(latest)) return 'skip'
  if (latest <= manga.currentChapter) return 'same'
  return { found: latest }
}

async function checkHttp(manga) {
  if (!manga.chapterUrlTemplate) return 'skip'
  const nextChapter = Math.floor(manga.currentChapter) + 1
  const chapterStr = Number.isInteger(nextChapter) ? String(nextChapter) : String(nextChapter).replace('.', '-')
  const url = manga.chapterUrlTemplate.replace('$chapter', chapterStr)
  if (!url || !url.startsWith('http')) return 'skip'

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Cache-Control': 'no-cache'
    }
  })
  if (res.status >= 400) return 'same'

  const body = await res.text()
  if (body.length < 2000) return 'same'

  // Kapitel-Nummer war in der angefragten URL, fehlt aber in der finalen URL →
  // die Seite hat auf eine andere Seite umgeleitet/umgeschrieben (False Positive)
  if (url.includes(chapterStr) && res.url && !res.url.includes(chapterStr)) return 'same'

  // 200er-Fehlerseiten am <title> erkennen (gleiche Guards wie Desktop)
  const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/i)
  const pageTitle = titleMatch ? titleMatch[1].toLowerCase() : ''
  const notFoundTitles = ['not found', 'page not found', 'chapter not found', '404 not found', 'error 404']
  if (pageTitle && notFoundTitles.some((p) => pageTitle.includes(p))) return 'same'

  return { found: nextChapter }
}

addEventListener('checkChapters', async (resolve, reject, _args) => {
  try {
    const settingsJson = CapacitorKV.get('app-settings')
    const mangaJson = CapacitorKV.get('manga-list')

    if (!settingsJson || !mangaJson) {
      resolve()
      return
    }

    let settings
    let mangaList
    try {
      settings = JSON.parse(settingsJson)
      mangaList = JSON.parse(mangaJson)
    } catch {
      resolve()
      return
    }

    if (!settings.backgroundNotificationsEnabled) {
      resolve()
      return
    }

    const candidates = mangaList.filter(
      (m) => m.status === 'reading' || m.status === 'rereading'
    )

    if (candidates.length === 0) {
      resolve()
      return
    }

    let changed = false
    let first = true

    for (const manga of candidates) {
      try {
        // Rate-Limit-Schutz: 300 ms Pause zwischen den Manga (429-Risiko)
        if (!first) await sleep(300)
        first = false

        let result = 'skip'

        if (manga.mangaDexId) {
          result = await checkMangaDex(manga)
        }

        if (result === 'skip' && manga.comickHid) {
          result = await checkComicK(manga)
        }

        // 'same' von einer API = verlässlich kein neues Kapitel → KEIN HTTP-Scrape
        // (der produziert bei "same" gern False Positives)
        if (result === 'skip') {
          result = await checkHttp(manga)
        }

        if (typeof result === 'object' && result !== null && typeof result.found === 'number') {
          const newChapter = result.found
          // Bereits gemeldet (App-Poller oder früherer Runner-Lauf) → nicht erneut
          const alreadyReported = (manga.lastCheckedChapter ?? 0) >= newChapter

          const idx = mangaList.findIndex((m) => m.id === manga.id)
          if (idx !== -1) {
            mangaList[idx] = {
              ...mangaList[idx],
              hasNewChapter: true,
              lastCheckedChapter: newChapter
            }
            changed = true
          }

          if (!alreadyReported && !manga.muteNotifications) {
            CapacitorNotifications.schedule([
              {
                id: notificationIdFor(manga.id),
                title: 'Neues Kapitel verfügbar!',
                body: `${manga.title} – Kapitel ${newChapter} ist da`
              }
            ])
          }
        }
      } catch (_e) {
        // Einzelne Fehler ignorieren, weiter mit nächstem Manga
      }
    }

    if (changed) {
      CapacitorKV.set('manga-list', JSON.stringify(mangaList))
    }

    resolve()
  } catch (e) {
    reject(e instanceof Error ? e.message : String(e))
  }
})

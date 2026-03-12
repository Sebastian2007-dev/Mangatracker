/**
 * Background Runner Task — läuft via WorkManager (Android) im Hintergrund.
 * Kein DOM, kein Vue — nur CapacitorKV, CapacitorNotifications und fetch.
 * Manga-Liste wird via CapacitorKV gelesen (= @capacitor/preferences, gleicher Store).
 */

async function checkMangaDex(manga) {
  const feedUrl =
    `https://api.mangadex.org/manga/${manga.mangaDexId}/feed` +
    `?translatedLanguage[]=en&order[chapter]=desc&limit=1` +
    `&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`

  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'MangaTracker/1.0 (personal hobby app)' }
  })
  if (!res.ok) return null

  const json = await res.json()
  const data = json.data ?? []
  if (data.length === 0) return null

  const latest = parseFloat(data[0].attributes.chapter ?? 'NaN')
  if (isNaN(latest) || latest <= manga.currentChapter) return null
  return latest
}

async function checkComicK(manga) {
  const url = `https://api.comick.dev/comic/${manga.comickHid}/chapters?lang=en&limit=1&tachiyomi=true`
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json, text/plain, */*' }
  })
  if (!res.ok) return null

  const json = await res.json()
  const chapters = json.chapters ?? []
  if (chapters.length === 0) return null

  const latest = parseFloat(chapters[0].chap ?? 'NaN')
  if (isNaN(latest) || latest <= manga.currentChapter) return null
  return latest
}

async function checkHttp(manga) {
  const nextChapter = Math.floor(manga.currentChapter) + 1
  const url = manga.chapterUrlTemplate.replace('$chapter', String(nextChapter))
  if (!url || !url.startsWith('http')) return null

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Cache-Control': 'no-cache'
    }
  })
  if (res.status >= 400) return null

  const body = await res.text()
  if (body.length < 2000) return null
  return nextChapter
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

    for (const manga of candidates) {
      try {
        let newChapter = null

        if (manga.mangaDexId) {
          newChapter = await checkMangaDex(manga)
        }

        if (newChapter === null && manga.comickHid) {
          newChapter = await checkComicK(manga)
        }

        if (newChapter === null) {
          newChapter = await checkHttp(manga)
        }

        if (newChapter !== null) {
          const idx = mangaList.findIndex((m) => m.id === manga.id)
          if (idx !== -1) {
            mangaList[idx] = {
              ...mangaList[idx],
              hasNewChapter: true,
              lastCheckedChapter: newChapter
            }
            changed = true
          }

          // Notification ID aus Manga-ID ableiten (deterministisch, kein crypto)
          let notifId = 0
          for (let i = 0; i < manga.id.length; i++) {
            notifId = (notifId + manga.id.charCodeAt(i)) % 2147483647
          }

          CapacitorNotifications.schedule([
            {
              id: notifId,
              title: 'Neues Kapitel verfügbar!',
              body: `${manga.title} \u2013 Kapitel ${newChapter} ist da`
            }
          ])
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

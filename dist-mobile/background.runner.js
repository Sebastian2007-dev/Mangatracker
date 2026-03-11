/**
 * Background Runner Task — läuft via WorkManager (Android) im Hintergrund.
 * Kein DOM, kein Vue — nur CapacitorKV, CapacitorNotifications und fetch.
 * Manga-Liste wird via CapacitorKV gelesen (= @capacitor/preferences, gleicher Store).
 */

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

    if (!settings.notificationsEnabled) {
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
      const nextChapter = Math.floor(manga.currentChapter) + 1
      const url = manga.chapterUrlTemplate.replace('$chapter', String(nextChapter))

      if (!url || !url.startsWith('http')) continue

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
            Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
            'Cache-Control': 'no-cache'
          }
        })

        if (res.status < 400) {
          const body = await res.text()
          if (body.length >= 2000) {
            // Kapitel gefunden
            const idx = mangaList.findIndex((m) => m.id === manga.id)
            if (idx !== -1) {
              mangaList[idx] = {
                ...mangaList[idx],
                hasNewChapter: true,
                lastCheckedChapter: nextChapter
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
                body: `${manga.title} \u2013 Kapitel ${nextChapter} ist da`
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

/**
 * Beispiel Scanner-Mod für MangaTracker
 * ======================================
 * Dieses Mod zeigt, wie man einen eigenen Kapitel-Scanner implementiert.
 *
 * Installation:
 *   Kopiere diesen Ordner nach:
 *     Windows:  %APPDATA%\Manga Tracker\mods\example-scanner\
 *     macOS:    ~/Library/Application Support/Manga Tracker/mods/example-scanner/
 *     Linux:    ~/.config/Manga Tracker/mods/example-scanner/
 *   Dann starte MangaTracker neu.
 *
 * Wie es funktioniert:
 *   - canHandle() entscheidet ob dieser Scanner für eine Manga zuständig ist
 *   - check() prüft ob ein neues Kapitel verfügbar ist
 *   - Rückgabe { latestChapter: null } → Fallback zu MangaDex / ComicK / HTTP
 *   - Rückgabe { latestChapter: 42 }   → Kapitel 42 ist das neueste
 */

module.exports = {
  /**
   * register() wird beim App-Start einmal aufgerufen.
   * @param {import('../../src/types/mod').ModApi} api
   */
  register(api) {
    api.log('Beispiel-Scanner geladen', 'success')

    api.addChapterScanner({
      name: 'Beispiel Scanner',

      /**
       * priority: Höherer Wert = wird früher geprüft.
       * Built-in Scanner (MangaDex, ComicK) verwenden -1.
       * Standard ist 0.
       */
      priority: 5,

      /**
       * canHandle() wird für jede Manga aufgerufen.
       * Gibt true zurück wenn dieser Scanner zuständig ist.
       *
       * Ersetze 'example-site.com' durch die echte Domain.
       */
      canHandle(manga) {
        return manga.mainUrl.includes('example-site.com')
      },

      /**
       * check() prüft ob ein neues Kapitel verfügbar ist.
       * Wird nur aufgerufen wenn canHandle() true zurückgegeben hat.
       *
       * @returns {{ latestChapter: number | null, error?: string }}
       */
      async check(manga) {
        try {
          // Beispiel: API-Aufruf zur Seite
          // Ersetze dies durch die echte API-Logik deiner Seite
          const res = await fetch(
            `https://api.example-site.com/manga/latest?url=${encodeURIComponent(manga.mainUrl)}`
          )

          if (!res.ok) {
            return { latestChapter: null, error: `HTTP ${res.status}` }
          }

          const data = await res.json()

          // Extrahiere die Kapitelnummer aus der API-Antwort
          // (Passe dies an das Format deiner Seite an)
          const latestChapter = parseFloat(data.latestChapter ?? data.chapter ?? 'NaN')

          if (isNaN(latestChapter)) {
            return { latestChapter: null, error: 'Kapitelnummer konnte nicht geparst werden' }
          }

          return { latestChapter }
        } catch (e) {
          // Bei Fehler: null zurückgeben → Fallback zu Built-in Scannern
          return { latestChapter: null, error: e.message }
        }
      }
    })

    // Optional: auf App-Events reagieren
    api.on('app:ready', () => {
      api.log('Beispiel-Scanner bereit', 'info')
    })

    api.on('manga:created', (manga) => {
      if (manga.mainUrl.includes('example-site.com')) {
        api.log(`Neue Manga für Beispiel-Scanner: ${manga.title}`, 'info')
      }
    })
  }
}

# Code-Review-Checkliste (2026-07-13)

Ergebnis eines Full-Repo-Reviews (Main-Prozess, Renderer, Mobile/Capacitor, Build/Repo).
Sortiert nach Schwere. Abhaken, was erledigt ist.

## 🔴 Kritisch

- [x] **Android-Background-Polling funktioniert nicht (KV-Store-Split)** *(gefixt 2026-07-13: `ensurePreferencesReady()` in storage.service.ts konfiguriert die Preferences-Gruppe auf das Runner-Label + einmalige Migration)*
  Der Background-Runner liest per `CapacitorKV` aus dem SharedPreferences-File `com.mangaTracker.app.background` (benannt nach dem Runner-Label), die App schreibt per `@capacitor/preferences` aber nach `CapacitorStorage`. Der Runner findet nie `app-settings`/`manga-list` und beendet sich sofort (`background.runner.js:69`).
  **Fix:** Beim Mobile-Start `Preferences.configure({ group: 'com.mangaTracker.app.background' })` + einmalige Migration der Keys aus `CapacitorStorage`.

- [x] **Foreground-Poller startet beim Kaltstart nicht** *(gefixt 2026-07-13: `startPoller()` in `initPollerLifecycle()`; zusätzlich Generation-Guard gegen Timer-Races)*
  `initPollerLifecycle()` (`src/renderer/src/services/mobile/poller.service.ts:251`) registriert nur den `appStateChange`-Listener; der feuert beim App-Launch nicht. Polling beginnt erst nach einmal Backgrounden + Zurückkehren.
  **Fix:** `startPoller()` direkt in `initPollerLifecycle()` aufrufen.

- [x] **Keystore-Passwörter im Klartext in git** *(gefixt 2026-07-13: build.gradle lädt `android/keystore.properties` (gitignored, Vorlage: keystore.properties.example); ohne Datei Debug-Signing. Achtung: alte Passwörter bleiben in der Git-Historie — Keystore/Passwörter rotieren!)*
  `android/app/build.gradle:7-14` enthält `storePassword`/`keyPassword` hart codiert; die referenzierte `manga-tracker.jks` fehlt zudem im Checkout → `assembleRelease` schlägt auf frischem Clone fehl.
  **Fix:** Signing-Config aus gitignorter `keystore.properties` laden; Passwörter als kompromittiert betrachten (Repo ist auf GitHub), neuen Keystore erwägen.

- [x] **Gist-Sync überschreibt parallele Änderungen (stale snapshot)** *(gefixt 2026-07-13: `syncGistDirect` liest den Store nach dem PATCH frisch und merged erneut, statt Snapshots zurückzuschreiben)*
  `syncGistDirect` (`src/main/ipc/gist.ipc.ts:98-151`) snapshottet Store-Daten vor mehreren Netzwerk-Roundtrips und schreibt danach die gemergten alten Daten zurück. Änderungen während des Syncs (User-Edit, Poller) werden still revertiert.
  **Fix:** Vor dem Zurückschreiben Store neu lesen und gegen den frischen Stand mergen.

- [x] **Undo nach Löschen wird vom Sync erneut gelöscht** *(gefixt 2026-07-13: `undoDelete` setzt `updatedAt: Date.now()` und bumpt `lastMutationAt`)*
  `undoDelete` stellt mit altem `updatedAt` wieder her (`manga.store.ts:75`); der bereits gepushte Tombstone (`deletedAt >= updatedAt`) gewinnt in `mergeLists` → Manga verschwindet beim nächsten Sync wieder. `undoDelete` bumpt auch `lastMutationAt` nicht.
  **Fix:** Beim Restore `updatedAt: Date.now()` setzen + `lastMutationAt` bumpen.

- [ ] **Offline-Delete wird vom Sync wiederbelebt (Trash-Purge nach 10 s)**
  `manga:emptyTrash` 10 s nach Delete zerstört die einzige Tombstone-Quelle. Wenn der Sync in dem Fenster nicht lief, resurrectet der nächste Sync das gelöschte Manga.
  **Fix:** Trash mit Retention (z. B. 30 Tage, Purge beim Start) statt Sofort-Purge; „Kürzlich gelöscht"-View als Bonus.

- [x] **Import verwirft Felder beim Backup-Restore** *(gefixt 2026-07-13: `normalizeImportedEntry` übernimmt jetzt note/rating/bookmarkedChapter/ignoreTemplateMismatch/chapterDetectionTemplate/scrollPosition — Desktop + Mobile)*
  `normalizeImportedEntry` (`src/main/ipc/manga.ipc.ts:394-421`) droppt `note`, `rating`, `bookmarkedChapter`, `ignoreTemplateMismatch`, `chapterDetectionTemplate`, `scrollPosition`; existierende Einträge werden ersetzt. Re-Import des eigenen Exports = Datenverlust.
  **Fix:** Felder explizit übernehmen (Whitelist synchron zum `Manga`-Typ halten).

## 🟠 Mittel — Desktop / Main-Prozess

- [ ] **Domain Guard: `endsWith` ohne Punkt-Grenze** (`domainGuard.ts:42,194,229`) — `evil-asura.gg` passiert Whitelist für `asura.gg`. Fix: `d === domain || domain.endsWith('.' + d)`.
- [ ] **Domain Guard: naive Base-Domain** (`domainGuard.ts:30-34`) — `foo.co.uk` → Base `co.uk`; „immer erlauben" whitelistet ganze ccSLD. Fix: Public-Suffix-Lib (z. B. `tldts`).
- [ ] **Popups ohne Guard bei `blockNewWindows=false`** (`ReaderView.ts:424-430`) — erlaubte Child-Windows bekommen weder Domain Guard noch window-open-Handler.
- [ ] **Poll-Intervall-Änderung wirkt erst nach Neustart** — `restartPoller` (`chapterPoller.ts:267`) wird nirgends aufgerufen; `settings:set` triggert ihn nicht.
- [ ] **Gleiche Kapitel-Notification feuert jede Stunde neu** (`chapterPoller.ts:226`) — Vergleich nur gegen `currentChapter`; `lastCheckedChapter` wird geschrieben, aber nie gelesen.
- [ ] **Element Picker (F2) persistiert nicht** (`ReaderView.ts:413-421`) — nur Live-`<style>`-Injektion; nach Reload alles wieder da, obwohl Persistenz versprochen wird.
- [ ] **macOS: `activate` → doppelte IPC-Registrierung wirft** (`index.ts:111-113`) — Handler-Registrierungen ohne `removeHandler`; zweiter `createWindow()` crasht.
- [ ] **`window.api.off` entfernt alle Listener statt einem** (`preload/index.ts:10-12`); gleicher Bug in `capacitor.adapter.ts:253-255`.
- [ ] **Hängende Navigation blockiert URL dauerhaft** (`domainGuard.ts:149-152`) — unbeantwortete `pendingNavigations` werden nie re-prompted.
- [ ] **`resize`-Listener leakt pro Reader-Open** (`ReaderView.ts:485`) — wird nie entfernt.
- [ ] **Kein Timeout auf `ses.fetch`** (Poller + Gist) — ein hängender Host stallt den ganzen Scan.
- [ ] **GitHub-Token unverschlüsselt im JSON** (`store.ts:42`) — `safeStorage` nutzen.
- [ ] **`settings:set` ohne Validierung** (`settings.ipc.ts:19-24`) — z. B. `notificationIntervalMs: 0` erzeugt Tight-Loop.
- [ ] **`scrollY` uncoerced in `executeJavaScript`** (`ReaderView.ts:542`) — `Number(...)` erzwingen.
- [ ] **`sandbox: false` unnötig** (`index.ts:42`); `shell.openExternal` ohne `http(s)`-Check (`index.ts:53`).

## 🟠 Mittel — Sync-/Poller-Drift Desktop ↔ Mobile

- [ ] **Mobile-Sync löscht `profile` aus dem Gist** — `buildSyncPayload` ohne `profile`-Argument (`mobile/gist.service.ts:134-144`).
- [ ] **Skill-Tree wird nie gesynct** — lebt nur im `localStorage`; `mergeLists` rechnet immer mit 3 Fokus-Slots → Fokusse gehen bei jedem Sync verloren. Payload-Feld + `mergeSkillTree` existieren bereits, nichts schreibt sie.
- [ ] **Mobile-Stats ohne `gistSynced` und ohne Achievement-Permanenz** (`mobile/stats.service.ts:304-310`) — `cloud_sync` nie erreichbar; Achievements widerrufbar; `availableSP` kann negativ werden.
- [ ] **Background-Runner: kein Short-Circuit bei „kein neues Kapitel"** — API-Antwort „same" fällt trotzdem in HTTP-Scrape durch → False Positives (`background.runner.js:104-114`).
- [ ] **Background-Runner: `URL_MISMATCH`/`TITLE_404`-Guards fehlen** (`background.runner.js:43-62`) — Desktop hat 3 False-Positive-Guards, Runner nur 2.
- [ ] **Background-Runner: kein 300-ms-Delay zwischen Requests** — 429-Risiko bei großen Bibliotheken.
- [ ] **Neues Kapitel erreicht Mobile-UI nicht** — Adapter emittet nie `notifications:newChapter`; `onNewChapter` verwirft das `manga:getAll`-Ergebnis (`main.mobile.ts:40-44`).
- [ ] **Read-Modify-Write-Races auf Mobile** — `update`/`delete`/`moveItem`/Poller schreiben die ganze Liste über mehrere awaits ohne Lock.
- [ ] **Notification-IDs = Zeichencode-Summe der UUID** — Kollisionen möglich; FNV-1a o. ä. verwenden (`poller.service.ts:202`, `background.runner.js:128-131`).
- [x] **`scheduleNext`-Race** (`poller.service.ts:236-248`) — Timer kann nach `stopPoller` noch armiert werden; doppelte Poll-Ketten möglich. *(gefixt 2026-07-13: Generation-Counter)*

## 🟠 Mittel — UI / Renderer

- [ ] **TemplateMismatch-Modal ohne `:key`** (`TemplateMismatchModal.vue:20` + `App.vue:137,203`) — zweites Event zeigt Manga B mit Template-Vorschlag von Manga A. Fix: `:key="templateMismatch.mangaId"`.
- [ ] **Jedes Editieren killt `hasNewChapter` + rewindet `lastCheckedChapter`** (`MangaFormDialog.vue:213-214`) — Badge weg + Duplikat-Notifications nach Titel-Tippfehler-Fix.
- [ ] **Scroll-Restore-Bar überlebt In-Reader-Navigation** (`reader.store.ts:19-23,38-40`) — scrollt falsche Seite und löscht die echte Position; `urlChanged` muss sie clearen.
- [ ] **„Von vorn anfangen" löscht die persistierte Scrollposition nicht** (`reader.store.ts:76-78`) — Bar kommt bei jedem Reload wieder.
- [ ] **`v-if="mod.enabled !== mod.enabled"` immer false** (`SettingsView.vue:535`) — Neustart-Hinweis pro Mod ist toter Code.
- [ ] **SkillTreeView ohne `fetchOverview`** (`SkillTreeView.vue:20`) — zeigt Level 1, wenn Statistik-Seite noch nie besucht wurde.
- [ ] **MangaCard: document-click-Listener leakt** (`MangaCard.vue:212-215`) — kein `onUnmounted`, leakt wenn Karte mit offenem Status-Picker verschwindet.
- [ ] **MangaDexSearchModal: Reopen-Race** (`MangaDexSearchModal.vue:37,43`) — laufende Suche blockiert Auto-Suche beim Wiederöffnen, stale Results.
- [ ] **`reader:templateMismatch`-Listener ohne Cleanup** (`App.vue:137`) + Watcher nach `await` in async `onMounted` (`App.vue:135`) nicht scope-gebunden.
- [ ] **Mod-iframe-Relay: `modId` nur geprüft, wenn mitgesendet** (`ModView.vue:55`) — Mod ohne `modId` kann fremde Mod-Settings lesen/schreiben.
- [ ] **Scan-/Import-Fehler sind stumm** (`AppHeader.vue:41`) — try/finally ohne catch, kein User-Feedback.
- [ ] **i18n-Bypass: hartcodierte deutsche Strings** (MangaCard-Dialoge, „Neu"-Badge, „Pflichtfeld", „Von:", „Std.", pubStatusLabels …) und englisches „LEVEL UP!" für deutsche User (`LevelUpOverlay.vue:28-33`).
- [ ] **Doppelte Registrierung `manga:refreshMetadata`** (`manga.ipc.ts:225` + `stats.ipc.ts:47`) — heute harmlos, Divergenz-Falle.

## 🟡 Build / Repo / Release

- [ ] **80 MB Installer-EXE + 11 MB APK committed** (`installer/`) → Repo-Pack ~279 MB. `git rm --cached` + `.gitignore` (`installer/*.exe`, `installer/*.apk`); Historie ggf. mit `git filter-repo` schrumpfen.
- [ ] **`android/.idea/`, `tsconfig.node.tsbuildinfo`, `dist-mobile/`-Reste getrackt** — untracken + ignorieren.
- [ ] **`versionCode 1` / `versionName "1.0"` hartcodiert** (`build.gradle:20-21`) — Android verweigert Updates; aus `package.json` ableiten.
- [ ] **Zwei Installer-Systeme** (NSIS via `npm run dist`, Inno via `build_release.bat`) mit gleichem Namensschema — eins entfernen.
- [ ] **`build_release.bat`: `npm install` nur wenn `node_modules` fehlt** — veraltete Deps nach `package.json`-Änderung; besser `npm ci` oder Vergleich lockfile-Timestamp. Optional `npm run typecheck` als Gate.
- [ ] **`usesCleartextTraffic="true"` app-weit** (`AndroidManifest.xml`) — besser `networkSecurityConfig` nur für Scrape-Domains; `allowBackup="true"` sichert den Klartext-GitHub-Token in Google-Backups.

## 💡 Ideen (größter Hebel)

- [ ] **Poller-Logik single-sourcen**: ein plattformneutrales Modul für das 3-Stufen-Fallback (inkl. SAME-Short-Circuit, URL_MISMATCH, TITLE_404, Rate-Limit-Delay), das Desktop-Poller, Mobile-Poller und `background.runner.js` speist. Gleiches Muster für Gist-Sync und Stats (Storage-Interface reingeben). Eliminiert die ganze Drift-Klasse.
- [ ] **Trash als Tombstone-Quelle mit Retention + „Kürzlich gelöscht"-View** (fixt Sync-Löschbugs an der Wurzel).
- [ ] **Validierte IPC-Schicht**: `registerHandler(channel, schema, fn)` mit Payload-Validierung und sauberem `removeHandler`.
- [ ] **`<KeepAlive>` um die RouterView** — Bibliothek verliert aktuell Tab + Scrollposition bei jedem Settings-Besuch.
- [ ] **Avatar-Uploads downscalen** (`StatisticsView.vue:78-86`) — rohes Foto landet als Base64 in Settings-JSON, jedem Broadcast und im Gist. Canvas auf ~256 px.
- [ ] **Icon-Map + Modal-Scaffolding deduplizieren** (`AchievementToast.vue`/`StatisticsView.vue`; 5× Backdrop-Pattern) → `resolveAchievementIcon` + `<ModalShell>`.

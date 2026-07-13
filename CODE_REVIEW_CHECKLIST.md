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

- [x] **Offline-Delete wird vom Sync wiederbelebt (Trash-Purge nach 10 s)** *(gefixt 2026-07-13: Undo-Timer schließt nur noch den Toast; Trash bleibt als Tombstone-Quelle erhalten. Neu: `shared/trash.ts` mit 30-Tage-Retention, `purgeExpiredTrash()` läuft beim App-Start auf Desktop (`index.ts`) und Mobile (`main.mobile.ts`). „Kürzlich gelöscht"-View weiterhin offen — siehe Ideen.)*
  `manga:emptyTrash` 10 s nach Delete zerstört die einzige Tombstone-Quelle. Wenn der Sync in dem Fenster nicht lief, resurrectet der nächste Sync das gelöschte Manga.
  **Fix:** Trash mit Retention (z. B. 30 Tage, Purge beim Start) statt Sofort-Purge; „Kürzlich gelöscht"-View als Bonus.

- [x] **Import verwirft Felder beim Backup-Restore** *(gefixt 2026-07-13: `normalizeImportedEntry` übernimmt jetzt note/rating/bookmarkedChapter/ignoreTemplateMismatch/chapterDetectionTemplate/scrollPosition — Desktop + Mobile)*
  `normalizeImportedEntry` (`src/main/ipc/manga.ipc.ts:394-421`) droppt `note`, `rating`, `bookmarkedChapter`, `ignoreTemplateMismatch`, `chapterDetectionTemplate`, `scrollPosition`; existierende Einträge werden ersetzt. Re-Import des eigenen Exports = Datenverlust.
  **Fix:** Felder explizit übernehmen (Whitelist synchron zum `Manga`-Typ halten).

## 🟠 Mittel — Desktop / Main-Prozess

- [x] **Domain Guard: `endsWith` ohne Punkt-Grenze** (`domainGuard.ts:42,194,229`) — `evil-asura.gg` passiert Whitelist für `asura.gg`. *(gefixt 2026-07-13: `matchesDomain()` mit Punkt-Grenze für White- und Blocklist)*
- [x] **Domain Guard: naive Base-Domain** — *(gefixt 2026-07-13: `tldts` (`getDomain`) statt „letzte zwei Segmente"; neue Dependency)*
- [x] **Popups ohne Guard bei `blockNewWindows=false`** — *(gefixt 2026-07-13: `did-create-window` hängt Domain Guard + Reader-Events rekursiv an erlaubte Child-Windows)*
- [x] **Poll-Intervall-Änderung wirkt erst nach Neustart** — *(gefixt 2026-07-13: `settings:set` ruft `restartPoller()` bei Änderung von `notificationIntervalMs`/`notificationsEnabled`; Poller merkt sich sein Fenster)*
- [x] **Gleiche Kapitel-Notification feuert jede Stunde neu** — *(gefixt 2026-07-13: `lastCheckedChapter >= newChapter` ⇒ „bereits gemeldet", keine Notification/Event; gleicher Fix im Mobile-Poller und Background-Runner)*
- [x] **Element Picker (F2) persistiert nicht** — *(gefixt 2026-07-13: Picker meldet Selektor per console-message an den Main-Prozess; Speicherung pro Domain in `settings.hiddenElements`, Re-Injektion via `insertCSS` bei jedem `did-finish-load`)*
- [x] **macOS: `activate` → doppelte IPC-Registrierung wirft** — *(gefixt 2026-07-13: statische IPC-Registrierung nur einmal; `registerReaderIpc`/`registerDomainGuardReplyHandler` machen `removeHandler` vor `handle`)*
- [x] **`window.api.off` entfernt alle Listener statt einem** — *(gefixt 2026-07-13: preload trackt Handler→Listener-Map; capacitor.adapter löscht nur den übergebenen Handler)*
- [x] **Hängende Navigation blockiert URL dauerhaft** — *(gefixt 2026-07-13: `pendingNavigations` haben jetzt einen `createdAt`-Timestamp; nach 2 min TTL gilt die Anfrage als stale und wird neu gestellt)*
- [x] **`resize`-Listener leakt pro Reader-Open** — *(gefixt 2026-07-13: ein Listener pro Fenster, registriert in `registerReaderIpc`)*
- [x] **Kein Timeout auf `ses.fetch`** (Poller + Gist) — *(gefixt 2026-07-13: `AbortSignal.timeout(20 s)` auf allen Poller- und Gist-Requests)*
- [ ] **GitHub-Token unverschlüsselt im JSON** (`store.ts:42`) — `safeStorage` nutzen.
- [x] **`settings:set` ohne Validierung** — *(gefixt 2026-07-13: Payload-Typ-Check + `notificationIntervalMs`-Clamp auf min. 60 s; vollständige Schema-Validierung weiterhin offen, siehe Ideen)*
- [x] **`scrollY` uncoerced in `executeJavaScript`** — *(gefixt 2026-07-13: `Math.max(0, Number(scrollY) || 0)`)*
- [x] **`sandbox: false` unnötig / `shell.openExternal` ohne `http(s)`-Check** — *(gefixt 2026-07-13: `sandbox: true` (Preload nutzt nur contextBridge+ipcRenderer) + `http(s)`-Check auf openExternal)*

## 🟠 Mittel — Sync-/Poller-Drift Desktop ↔ Mobile

- [x] **Mobile-Sync löscht `profile` aus dem Gist** — *(gefixt 2026-07-13: `remotePayload.profile` + `skillTree` werden beim PATCH durchgereicht statt gedroppt)*
- [ ] **Skill-Tree wird nie gesynct** — lebt nur im `localStorage`; `mergeLists` rechnet immer mit 3 Fokus-Slots → Fokusse gehen bei jedem Sync verloren. Payload-Feld + `mergeSkillTree` existieren bereits, nichts schreibt sie.
- [x] **Mobile-Stats ohne `gistSynced` und ohne Achievement-Permanenz** — *(gefixt 2026-07-13: `gistSynced` aus `settings.lastGistSync`; `earned-achievements.json` persistiert freigeschaltete Achievements wie auf Desktop; `availableSP` auf ≥ 0 geclampt)*
- [x] **Background-Runner: kein Short-Circuit bei „kein neues Kapitel"** — *(gefixt 2026-07-13: Checks liefern `found/same/skip`; `same` von MDX/CK beendet die Kette ohne HTTP-Scrape)*
- [x] **Background-Runner: `URL_MISMATCH`/`TITLE_404`-Guards fehlen** — *(gefixt 2026-07-13: beide Guards aus dem Desktop-Poller portiert)*
- [x] **Background-Runner: kein 300-ms-Delay zwischen Requests** — *(gefixt 2026-07-13: `sleep(300)` zwischen den Kandidaten)*
- [x] **Neues Kapitel erreicht Mobile-UI nicht** — *(gefixt 2026-07-13: `emitBridgeEvent('notifications:newChapter', data)` in main.mobile.ts → manga.store setzt `hasNewChapter`)*
- [x] **Read-Modify-Write-Races auf Mobile** — *(gefixt 2026-07-13: `withMangaListLock()` (Promise-Queue) in storage.service.ts serialisiert alle Listen-Mutationen in manga.service + Poller)*
- [x] **Notification-IDs = Zeichencode-Summe der UUID** — *(gefixt 2026-07-13: FNV-1a-Hash `notificationIdFor()` in poller.service.ts und background.runner.js)*
- [x] **`scheduleNext`-Race** (`poller.service.ts:236-248`) — Timer kann nach `stopPoller` noch armiert werden; doppelte Poll-Ketten möglich. *(gefixt 2026-07-13: Generation-Counter)*

## 🟠 Mittel — UI / Renderer

- [x] **TemplateMismatch-Modal ohne `:key`** — *(gefixt 2026-07-13: `:key="mangaId + suggestedTemplate"` in App.vue)*
- [x] **Jedes Editieren killt `hasNewChapter` + rewindet `lastCheckedChapter`** — *(gefixt 2026-07-13: Badge bleibt, solange `lastCheckedChapter > currentChapter`; `lastCheckedChapter` wird nie zurückgedreht)*
- [x] **Scroll-Restore-Bar überlebt In-Reader-Navigation** — *(gefixt 2026-07-13: `reader:urlChanged` mit neuer URL cleart `scrollPositionAvailable`)*
- [x] **„Von vorn anfangen" löscht die persistierte Scrollposition nicht** — *(gefixt 2026-07-13: neuer Channel `reader:clearScrollPosition`, von `dismissScrollPosition()` aufgerufen)*
- [x] **`v-if="mod.enabled !== mod.enabled"` immer false** — *(gefixt 2026-07-13: tote Zeile entfernt; globaler Restart-Hinweis darunter bleibt)*
- [x] **SkillTreeView ohne `fetchOverview`** — *(gefixt 2026-07-13: `onMounted` lädt Overview nach, falls noch nicht vorhanden)*
- [x] **MangaCard: document-click-Listener leakt** — *(gefixt 2026-07-13: `onUnmounted` entfernt den Listener)*
- [x] **MangaDexSearchModal: Reopen-Race** — *(gefixt 2026-07-13: Generation-Counter invalidiert laufende Suchen; `searching` blockiert Reopen nicht mehr)*
- [x] **`reader:templateMismatch`-Listener ohne Cleanup + Watcher nach `await` nicht scope-gebunden** — *(gefixt 2026-07-13: beide Cleanups in `onUnmounted`)*
- [x] **Mod-iframe-Relay: `modId` nur geprüft, wenn mitgesendet** — *(gefixt 2026-07-13: `payload.modId` wird immer auf den eigenen Mod überschrieben; top-level `modId` weiterhin geprüft)*
- [x] **Scan-/Import-Fehler sind stumm** — *(gefixt 2026-07-13: catch + Log-Store-Eintrag mit i18n-Keys `header.scanFailed`/`header.importFailed`)*
- [x] **i18n-Bypass: hartcodierte deutsche Strings** — *(gefixt 2026-07-13: MangaCard (Notiz, Mark-Read-Dialog, Info-Modal, pubStatus, „Kap.", Tooltips), „Neu"-Badge, „Pflichtfeld", „Von:" (DomainGuard), „Std." (SettingsView), LevelUp-Overlay — alles über neue Keys in de.json/en.json)*
- [x] **Doppelte Registrierung `manga:refreshMetadata`** — *(gefixt 2026-07-13: Registrierung nur noch in manga.ipc.ts)*

## 🟡 Build / Repo / Release

- [x] **80 MB Installer-EXE + 11 MB APK committed** — *(teilgefixt 2026-07-13: `git rm --cached` + `.gitignore` (`installer/*.exe`, `installer/*.apk`) — die Dateien verschwinden mit dem nächsten Commit aus dem Index. Historie-Schrumpfung mit `git filter-repo` weiterhin offen — destruktiv, braucht Force-Push.)*
- [x] **`android/.idea/`, `tsconfig.node.tsbuildinfo`, `dist-mobile/`-Reste getrackt** — *(gefixt 2026-07-13: untrackt + `.gitignore`-Einträge)*
- [x] **`versionCode 1` / `versionName "1.0"` hartcodiert** — *(gefixt 2026-07-13: build.gradle liest `version` aus package.json; versionCode = major·10000 + minor·100 + patch)*
- [ ] **Zwei Installer-Systeme** (NSIS via `npm run dist`, Inno via `build_release.bat`) mit gleichem Namensschema — eins entfernen.
- [x] **`build_release.bat`: `npm install` nur wenn `node_modules` fehlt** — *(gefixt 2026-07-13: Lockfile-Timestamp-Vergleich gegen `node_modules\.package-lock.json` + `npm run typecheck` als Gate. Hinweis: Install braucht `--legacy-peer-deps` wegen `@capacitor/background-runner@3` ↔ Capacitor 6-Peer-Konflikt.)*
- [ ] **`usesCleartextTraffic="true"` app-weit** (`AndroidManifest.xml`) — offen (Scrape-Domains sind userdefiniert, `networkSecurityConfig` bräuchte dynamische Domains); ~~`allowBackup="true"` sichert den Klartext-GitHub-Token in Google-Backups~~ *(gefixt 2026-07-13: `allowBackup="false"`)*.

## 💡 Ideen (größter Hebel)

- [ ] **Poller-Logik single-sourcen**: ein plattformneutrales Modul für das 3-Stufen-Fallback (inkl. SAME-Short-Circuit, URL_MISMATCH, TITLE_404, Rate-Limit-Delay), das Desktop-Poller, Mobile-Poller und `background.runner.js` speist. Gleiches Muster für Gist-Sync und Stats (Storage-Interface reingeben). Eliminiert die ganze Drift-Klasse.
- [ ] **Trash als Tombstone-Quelle mit Retention + „Kürzlich gelöscht"-View** (fixt Sync-Löschbugs an der Wurzel).
- [ ] **Validierte IPC-Schicht**: `registerHandler(channel, schema, fn)` mit Payload-Validierung und sauberem `removeHandler`.
- [ ] **`<KeepAlive>` um die RouterView** — Bibliothek verliert aktuell Tab + Scrollposition bei jedem Settings-Besuch.
- [x] **Avatar-Uploads downscalen** — *(gefixt 2026-07-13: Canvas-Downscale auf max. 256 px, JPEG q=0.85, vor dem Speichern)*
- [ ] **Icon-Map + Modal-Scaffolding deduplizieren** (`AchievementToast.vue`/`StatisticsView.vue`; 5× Backdrop-Pattern) → `resolveAchievementIcon` + `<ModalShell>`.

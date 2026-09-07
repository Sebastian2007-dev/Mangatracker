# Ideen-Sammlung: UI & neue Features (2026-07-13)

Brainstorming auf Basis des aktuellen Stands (Desktop + Android, Reader, Poller, Gist-Sync, Statistik/RPG, Mod-System). Sortiert nach Bereich, am Ende eine Priorisierung nach Aufwand/Nutzen.

---

## 🎨 UI / UX

### Bibliothek

- ~~**„Kürzlich gelöscht"-View**~~ ✅ *umgesetzt 2026-07-13: Sektion in den Einstellungen mit Wiederherstellen/Endgültig-löschen pro Eintrag (neuer IPC `manga:getTrash`).*
- **Ansichts-Umschalter**: Neben dem Karten-Grid eine kompakte Listenansicht (Titel, Kapitel, Status in einer Zeile) und ein reines Cover-Grid. Dichte-Regler (klein/mittel/groß) für große Bibliotheken.
- ~~**Sortierung**~~ ✅ *umgesetzt 2026-07-13: Sortier-Dropdown in der Bibliothek (eigene Reihenfolge, neue Kapitel zuerst, Titel, Kapitel, Bewertung, zuletzt aktualisiert/hinzugefügt), Auswahl in localStorage persistiert; Drag & Drop nur in „Eigene Reihenfolge" aktiv.* — Gruppierung nach Status als einklappbare Sektionen weiterhin offen.
- ~~**Neue-Kapitel-Inbox**~~ ✅ *umgesetzt 2026-07-13: Glocken-Button im Header (`NewChapterInbox.vue`) mit Zähler, Panel mit Cover/Titel/Kapitel, „Öffnen" (Reader/Browser) und „Als gesehen markieren".*
- ~~**`<KeepAlive>` um die RouterView**~~ ✅ *umgesetzt 2026-07-13: `<KeepAlive include="MangaListView">` in App.vue.*
- **Empty States & Onboarding**: Leere Bibliothek zeigt aktuell nichts Hilfreiches. Ein 3-Schritte-Onboarding (Manga hinzufügen → verknüpfen → Scan erklären) senkt die Einstiegshürde enorm.
- **Command Palette (Strg+K)**: Schnellsuche über Bibliothek + Aktionen („Scan starten", „Exportieren", Manga direkt öffnen). Auf Desktop ein echter Power-User-Gewinn.

### Reader (Desktop)

- ~~**Kapitel-Navigation im Toolbar**~~ ✅ *umgesetzt 2026-07-13: „⏮ Kap. N" / „Kap. M ⏭"-Buttons im Reader-Toolbar, gebaut aus dem URL-Template; nur sichtbar wenn ein `$chapter`-Template existiert. Kapitelnummern-Eingabe (Dropdown) weiterhin offen.*
- **Lese-Fortschrittsbalken** am unteren Rand (Scroll-Prozent existiert bereits für Scroll-Restore — nur visualisieren).
- **Auto-Mark-as-Read**: Wenn im Reader ein Kapitel zu >90 % gescrollt wurde, beim Schließen automatisch „Kapitel X gelesen?" vorschlagen (die Kapitel-Erkennung existiert bereits via `reader:chapterDetected`).
- ~~**Element-Picker-Verwaltung**~~ ✅ *umgesetzt 2026-07-13: Settings-Sektion listet Selektoren pro Domain mit Einzel-Löschen und „Alle entfernen".*

### Statistik / RPG

- **Aktivitäts-Heatmap** (GitHub-Style-Kalender) aus den StatisticsEvents — die Daten sind alle da, nur die Visualisierung fehlt.
- ~~**Streak-Widget im Header**~~ ✅ *umgesetzt 2026-07-13: Flammen-Chip im Header (nur bei Streak > 0), verlinkt zur Statistik.*
- **Share-Card**: Statistik-Übersicht (Level, Kapitel gesamt, Top-Tags) als Bild exportieren — auf Mobile direkt über den Share-Dialog.
- **Level-Fortschrittsbalken** in der Sidebar/TabBar statt nur in der Statistik-View.

### Mobile

- ~~**Pull-to-Refresh**~~ ✅ *umgesetzt 2026-07-14: Touch-Geste in der Bibliothek (`MangaListView.vue`) mit gedämpftem Zieh-Indikator, löst `manga:scanNow` aus (Mobile-Adapter → `runPoll(true)`).*
- **Swipe-Aktionen auf Karten**: links wischen = Kapitel +1, rechts = Status-Picker. Deutlich schneller als das aktuelle Tippen in Dialoge.
- **Bottom-Sheets statt zentrierter Modals** für Status-Picker & Mark-Read — fühlt sich auf Android nativer an.
- **Android-Homescreen-Widget**: „X neue Kapitel" mit den 3 neuesten — der Background-Runner hat die Daten bereits im KV-Store.

---

## ⚙️ Neue Funktionen

### Klein (je < 1 Tag)

- ~~**Pro-Manga-Benachrichtigungen stummschalten**~~ ✅ *umgesetzt 2026-07-14: `muteNotifications`-Flag am Manga, Checkbox im Bearbeiten-Dialog, BellOff-Indikator auf der Karte. Alle 3 Poller (Desktop, Mobile-Vordergrund, background.runner) unterdrücken nur die System-Notification — Badge/Inbox bleiben.*
- ~~**Lokale Backup-Rotation**~~ ✅ *umgesetzt 2026-07-14: `src/main/backup.ts` schreibt beim App-Start einen Snapshot (mangaList, Trash, Stats, Settings) nach `%APPDATA%/Manga Tracker/backups/backup-YYYY-MM-DD.json` — max. 1 pro Tag, die neuesten 7 bleiben; leere Bibliothek wird nie gesichert (schützt Backups nach Datenverlust). Import-kompatibel via `manga:import`.*
- **Duplikat-Merge-Assistent**: `detectDuplicates()` existiert schon und wird nach dem Sync angezeigt — es fehlt nur ein „Zusammenführen"-Button, der Lesestand/Links/Notizen beider Einträge vereint.
- **Rating & Notiz in der Info-Ansicht** prominenter machen; Sortierung nach Rating.

### Mittel (1–3 Tage)

- **Sammlungen / Leselisten**: Frei benennbare, farbige Sammlungen quer zu Status und Tags („Sommer-Backlog", „Mit Freunden lesen"). Als `collections: string[]` am Manga + Filter-UI.
- **Release-Kalender**: MangaDex liefert `publishAt` — daraus eine Wochenansicht „Was kommt wann?" bauen, inkl. „erscheint ca. alle X Tage"-Schätzung aus der Kapitel-Historie.
- **Wochen-Digest**: Eine Sammel-Notification am Sonntag („Diese Woche: 12 neue Kapitel in 5 Manga") als Alternative zu Einzel-Notifications.
- **Tachiyomi/Mihon-Import**: Deren Backup-Format (protobuf/JSON) einlesen — größter realistischer Zuwachskanal für neue Nutzer-Bibliotheken.
- **Kapitel-Historie pro Manga**: Beim Erhöhen des Lesestands Timestamp je Kapitel speichern → „gelesen am", Wiederlese-Erkennung, genauere Statistik (Grundlage existiert in den StatisticsEvents).
- **Trash-/Papierkorb-View** (siehe UI oben) + manuelles „Papierkorb leeren".

### Groß (Architektur, je > 3 Tage)

- **Poller-Logik single-sourcen** (aus der Checkliste): ein plattformneutrales Modul für das 3-Stufen-Fallback, das Desktop-Poller, Mobile-Poller und `background.runner.js` speist. Beseitigt die gesamte Drift-Klasse — Voraussetzung für alle weiteren Poller-Features.
- **AniList/MyAnimeList-Sync**: OAuth + Mapping (MangaDex liefert AniList-IDs bereits mit). Zweiseitiger Abgleich des Lesestands. Großes Feature, große Zielgruppe.
- **Skill-Tree- & Profil-Sync**: Skill-Tree aus dem localStorage in den Store/Gist-Payload heben (Payload-Feld + `mergeSkillTree` existieren schon, nichts schreibt sie).
- **QR-Pairing für Sync**: Desktop zeigt QR mit Token+GistId, Mobile scannt → entfällt das fehleranfällige Token-Abtippen aufs Handy.
- **Mod-Galerie**: Kuratiertes GitHub-Repo mit Mods, In-App-Browser mit Ein-Klick-Installation (Download → `mods/`-Ordner). Macht das Mod-System erst wirklich zugänglich.
- **Offline-Cover-Cache**: Cover beim Verknüpfen lokal speichern (Desktop: Dateisystem, Mobile: Filesystem-Plugin) statt Hotlinking — schneller, offline-fähig, keine toten Bilder.

---

## 📊 Priorisierung (Nutzen ÷ Aufwand)

| Idee | Aufwand | Nutzen | Quick Win? |
| --- | --- | --- | --- |
| Neue-Kapitel-Inbox | S | Hoch | ✅ |
| Pull-to-Refresh (Mobile) | S | Hoch | ✅ |
| „Kürzlich gelöscht"-View | S | Mittel | ✅ |
| Element-Picker-Verwaltung | S | Mittel | ✅ |
| Backup-Rotation | S | Hoch | ✅ |
| Pro-Manga-Mute | S | Mittel | ✅ |
| `<KeepAlive>` Bibliothek | S | Mittel | ✅ |
| Sortierung/Gruppierung | M | Hoch | |
| Auto-Mark-as-Read | M | Hoch | |
| Aktivitäts-Heatmap | M | Mittel | |
| Swipe-Aktionen (Mobile) | M | Hoch | |
| Duplikat-Merge | M | Mittel | |
| Tachiyomi-Import | M | Hoch | |
| Release-Kalender | M | Mittel | |
| Poller single-sourcen | L | Hoch (technisch) | |
| AniList/MAL-Sync | L | Hoch | |
| Mod-Galerie | L | Mittel | |
| QR-Pairing | L | Mittel | |

**Empfohlener Einstieg:** die Quick-Win-Zeile komplett (≈ 1 Woche), danach Auto-Mark-as-Read + Swipe-Aktionen — das sind die beiden Features, die den täglichen Lese-Flow am stärksten verbessern.

# Mangatracker – Entwicklerdokumentation

> Letzte Aktualisierung: 2026-03-12

---

## Inhaltsverzeichnis

1. [Projektübersicht](#1-projektübersicht)
2. [Technologie-Stack](#2-technologie-stack)
3. [Verzeichnisstruktur](#3-verzeichnisstruktur)
4. [Typdefinitionen](#4-typdefinitionen)
5. [Desktop-Architektur (Electron)](#5-desktop-architektur-electron)
   - 5.1 Einstiegspunkt
   - 5.2 Datenspeicher (electron-store)
   - 5.3 IPC-Handler – Manga
   - 5.4 IPC-Handler – Einstellungen
   - 5.5 Reader-Fenster-Verwaltung
   - 5.6 Domain Guard
   - 5.7 Ad Blocker
   - 5.8 Chapter Poller
6. [Mobile-Architektur (Capacitor/Android)](#6-mobile-architektur-capacitorandroid)
   - 6.1 Einstiegspunkt
   - 6.2 Capacitor Adapter (Bridge)
   - 6.3 Mobile Services
   - 6.4 Storage Service
   - 6.5 Mobiler Chapter Poller
   - 6.6 Background Runner
7. [Platform Bridge Pattern](#7-platform-bridge-pattern)
8. [Vue-Frontend (Renderer)](#8-vue-frontend-renderer)
   - 8.1 Router
   - 8.2 Pinia Stores
   - 8.3 Composables
   - 8.4 Komponenten-Übersicht
   - 8.5 i18n / Mehrsprachigkeit
9. [Datenflüsse](#9-datenflüsse)
   - 9.1 IPC-Kommunikation Desktop
   - 9.2 IPC-Kommunikation Mobile
   - 9.3 Chapter-Polling-Flow
   - 9.4 Reading-Session-Recovery
10. [Build-System](#10-build-system)
    - 10.1 electron-vite (Desktop)
    - 10.2 Vite Mobile Config
    - 10.3 Capacitor Sync
    - 10.4 build_release.bat
11. [Konfigurationsdateien](#11-konfigurationsdateien)
12. [Android-spezifisches](#12-android-spezifisches)
13. [NSIS-Installer (Windows)](#13-nsis-installer-windows)
14. [API-Integrationen](#14-api-integrationen)
    - 14.1 MangaDex
    - 14.2 ComicK.io
    - 14.3 HTTP-Fallback
15. [Einstellungen-Referenz](#15-einstellungen-referenz)
16. [Poller-Statuscodes](#16-poller-statuscodes)
17. [Import/Export-Format](#17-importexport-format)
18. [Erweiterungshinweise](#18-erweiterungshinweise)

---

## 1. Projektübersicht

Mangatracker ist ein plattformübergreifender Manga-Leseverfolgungstracker.

| Plattform | Technologie | Ausgabe |
|-----------|------------|--------|
| Windows Desktop | Electron + Vue 3 | NSIS-Installer `.exe` |
| Android | Capacitor + Vue 3 | APK `.apk` |

Kernfunktionen:
- Manga-Liste verwalten (CRUD) mit Status-Tracking
- Automatische Kapitel-Erkennung über MangaDex-API, ComicK-API oder HTTP-Scraping
- Push-/Desktop-Benachrichtigungen bei neuen Kapiteln
- Eingebauter Web-Reader (Desktop) / Capacitor Browser (Mobile)
- Domain Guard (verhindert Weiterleitungen auf unbekannte Domains)
- Import/Export der Manga-Liste als JSON
- Cover-Bilder über MangaDex- und ComicK-Verknüpfungen
- Auto-Verknüpfung: findet automatisch besten Treffer bei MangaDex + ComicK
- Reading-Session-Recovery: stellt ungespeicherte Lesestände nach App-Absturz wieder her
- Hintergrund-Scan auf Android (WorkManager)

---

## 2. Technologie-Stack

### Gemeinsam (Desktop + Mobile)
| Paket | Zweck |
|-------|-------|
| Vue 3 + TypeScript | UI-Framework |
| Pinia | State Management |
| Vue Router 4 | SPA-Routing |
| vue-i18n 11 | Mehrsprachigkeit (DE/EN) |
| Tailwind CSS 4 | Utility-first Styling |
| lucide-vue-next | Icons |
| vue-draggable-plus | Drag-and-Drop Sortierung |

### Desktop
| Paket | Zweck |
|-------|-------|
| Electron 28 | Desktop-Shell |
| electron-vite 2 | Build-Tool mit HMR |
| electron-builder 24 | Installer-Erstellung (NSIS) |
| electron-store 8 | Persistente JSON-Speicherung |
| @cliqz/adblocker-electron | Ad-Blocking im Reader |

### Mobile
| Paket | Zweck |
|-------|-------|
| @capacitor/core 6 | Native Bridge |
| @capacitor/android 6 | Android-Integration |
| @capacitor/browser | In-App-Browser |
| @capacitor/local-notifications | Push-Benachrichtigungen |
| @capacitor/preferences | Key-Value-Speicher |
| @capacitor/filesystem | Datei-Speicher |
| @capacitor/background-runner | WorkManager-Task (Android) |
| @capacitor/share | OS-Teilen-Dialog |
| @capacitor/app | Lifecycle-Events |

---

## 3. Verzeichnisstruktur

```
Mangatracker/
├── src/
│   ├── types/
│   │   └── index.ts                  # Alle gemeinsamen Typen (Manga, AppSettings, ...)
│   ├── main/                         # Electron Main-Process
│   │   ├── index.ts                  # Einstiegspunkt Desktop
│   │   ├── store.ts                  # electron-store Schema + Defaults
│   │   ├── ipc/
│   │   │   ├── manga.ipc.ts          # CRUD IPC-Handler + externe APIs
│   │   │   └── settings.ipc.ts       # Einstellungs-IPC
│   │   ├── notifications/
│   │   │   └── chapterPoller.ts      # Desktop Chapter-Polling
│   │   └── reader/
│   │       ├── ReaderView.ts         # BrowserView/BrowserWindow Verwaltung
│   │       ├── domainGuard.ts        # Domain-Whitelist/-Blocklist
│   │       └── adBlocker.ts          # @cliqz Ad Blocker
│   └── preload/
│       └── index.ts                  # contextBridge (window.api)
│
├── src/renderer/
│   ├── index.html                    # Desktop HTML-Einstieg
│   ├── index.mobile.html             # Mobile HTML-Einstieg
│   └── src/
│       ├── main.ts                   # Desktop Vue-Bootstrap
│       ├── main.mobile.ts            # Mobile Vue-Bootstrap
│       ├── App.vue                   # Root-Komponente (+ Recovery-Modal)
│       ├── types/                    # (re-export von src/types)
│       ├── router/
│       │   └── index.ts              # Vue Router Routen
│       ├── stores/
│       │   ├── manga.store.ts        # Manga-Zustand + Aktionen
│       │   ├── settings.store.ts     # Einstellungs-Zustand
│       │   ├── reader.store.ts       # Reader-Zustand
│       │   └── log.store.ts          # Aktivitätslog
│       ├── services/
│       │   ├── platform.ts           # PlatformBridge Interface + getBridge()
│       │   ├── capacitor.adapter.ts  # Mobile IPC-Bridge-Implementierung
│       │   └── mobile/
│       │       ├── manga.service.ts  # Mobile Manga-CRUD
│       │       ├── storage.service.ts# Preferences + Filesystem
│       │       ├── settings.service.ts
│       │       └── poller.service.ts # Mobile Chapter-Polling
│       ├── composables/
│       │   ├── usePlatform.ts        # isElectron / isMobile Erkennung
│       │   ├── useChapterUrl.ts      # buildChapterUrl() Helper
│       │   ├── useTheme.ts           # Theme-Anwendung
│       │   └── useReadingSession.ts  # Session Recovery (mobile)
│       ├── views/
│       │   ├── LibraryView.vue       # Manga-Liste (Hauptansicht)
│       │   ├── SettingsView.vue      # Einstellungen
│       │   └── LogView.vue           # Aktivitätslog
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppHeader.vue     # Kopfzeile + Suchfeld
│       │   │   ├── AppSidebar.vue    # Navigationsleiste (Desktop)
│       │   │   └── MobileTabBar.vue  # Tab-Leiste (Mobile)
│       │   └── manga/
│       │       ├── MangaCard.vue     # Einzelne Manga-Karte
│       │       ├── MangaFormDialog.vue # Hinzufügen/Bearbeiten-Dialog
│       │       ├── MangaDexSearchModal.vue # Suche (MDX + ComicK)
│       │       ├── ChapterInput.vue  # Kapitel-Eingabefeld
│       │       ├── NewChapterBadge.vue # "Neu"-Badge
│       │       └── DeleteUndoToast.vue # Rückgängig-Toast
│       └── public/
│           └── background.runner.js  # Android WorkManager JS-Task
│
├── resources/
│   ├── app.ico                       # Windows/App Icon
│   └── installer.nsh                 # NSIS Custom Hooks
│
├── android/                          # Capacitor Android-Projekt
├── electron.vite.config.ts           # Vite-Config Desktop
├── vite.mobile.config.mts            # Vite-Config Mobile
├── capacitor.config.ts               # Capacitor-Konfiguration
├── package.json                      # Abhängigkeiten + Build-Config
├── build_release.bat                 # Release-Build-Skript
└── POLLER_CODES.md                   # Status-Code-Referenz
```

---

## 4. Typdefinitionen

**Datei:** `src/types/index.ts`

### `Manga`

```typescript
interface Manga {
  id: string                  // UUID (crypto.randomUUID)
  title: string
  mainUrl: string             // Haupt-URL der Manga-Seite
  chapterUrlTemplate: string  // z.B. "https://example.com/manga/$chapter"
  status: MangaStatus         // 'reading' | 'plan_to_read' | 'hiatus' | 'completed' | 'rereading'
  isFocused: boolean          // In Fokus-Tab (max. 3 gleichzeitig)
  currentChapter: number      // Aktuell gelesenes Kapitel
  hasNewChapter: boolean      // Neues Kapitel verfügbar
  lastCheckedChapter: number  // Letztes via API gefundenes Kapitel
  mangaDexId?: string         // MangaDex UUID
  mangaDexTitle?: string      // Angezeigter MDX-Titel
  mangaDexCoverUrl?: string   // Cover-URL (meo.comick.pictures oder api.mangadex.org)
  comickHid?: string          // ComicK HID (interne ID)
  comickTitle?: string
  comickCoverUrl?: string
  createdAt: number           // Unix-Timestamp ms
  updatedAt: number
}

type MangaStatus = 'reading' | 'plan_to_read' | 'hiatus' | 'completed' | 'rereading'
type TabId = MangaStatus | 'focus' | 'all' | 'new'
```

### `AppSettings`

```typescript
interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  language: 'en' | 'de'
  readBehavior: 'main' | 'chapter' | 'ask'
  domainWhitelist: string[]             // Erlaubte Fremd-Domains im Reader
  domainBlocklist: string[]             // Immer blockierte Domains
  notificationIntervalMs: number        // Polling-Intervall (Standard: 3.600.000 = 1h)
  notificationsEnabled: boolean         // Kapitel-Scan aktiv
  backgroundNotificationsEnabled: boolean // Android WorkManager-Scan
  autoLinkEnabled: boolean              // Auto-Verknüpfung bei Speichern
  desktopNotificationsEnabled: boolean  // Desktop-Benachrichtigungen
  readerInSeparateWindow: boolean       // Reader als eigenes Fenster
  elementPickerEnabled: boolean         // F2 Element-Picker im Reader
  blockNewWindows: boolean              // Popup-Blocker im Reader
  titleExpand: boolean                  // Titel aufklappbar (hover/tap)
}
```

### Weitere Typen

```typescript
// IPC-Antwortformat (einheitlich auf allen Kanälen)
interface IpcResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// Reader
interface ReaderOpenPayload { mangaId: string; url: string }

// Domain Guard Dialog
type DomainGuardChoice = 'yes' | 'yes_always' | 'no' | 'no_block'
interface DomainGuardRequest {
  requestId: string
  targetDomain: string
  originDomain: string
}

// Aktivitätslog
type LogEntryType = 'info' | 'success' | 'error' | 'warning'
interface LogEntry {
  id: string
  type: LogEntryType
  message: string
  timestamp: number
}
```

---

## 5. Desktop-Architektur (Electron)

### 5.1 Einstiegspunkt

**Datei:** `src/main/index.ts`

Der Electron Main-Process wird beim Start ausgeführt. Reihenfolge:

1. **BrowserWindow erstellen** – 1280×800px, Mindestgröße 900×600px, Sandbox + Preload
2. **IPC-Handler registrieren** – `manga.ipc.ts`, `settings.ipc.ts`
3. **Reader initialisieren** – BrowserView oder separates Fenster
4. **Domain Guard aktivieren** – Whitelist/Blocklist-Prüfung
5. **Ad Blocker starten** – `@cliqz/adblocker-electron`
6. **Chapter Poller starten** – Timer-basiertes Polling

Das `preload/index.ts` exponiert `window.api` mit `contextBridge.exposeInMainWorld`:
```typescript
window.api = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (channel, handler) => { /* registers listener, returns cleanup */ },
  off: (channel, handler) => ipcRenderer.removeListener(channel, handler)
}
```

### 5.2 Datenspeicher (electron-store)

**Datei:** `src/main/store.ts`

Persistente Datenspeicherung mit `electron-store` (JSON-Datei in `%APPDATA%\manga-tracker\`):

```typescript
const store = new Store<StoreSchema>({
  defaults: {
    mangaList: [],
    mangaTrash: [],
    settings: {
      theme: 'system',
      language: 'de',
      readBehavior: 'ask',
      notificationIntervalMs: 3_600_000,
      notificationsEnabled: true,
      backgroundNotificationsEnabled: false,
      autoLinkEnabled: false,
      desktopNotificationsEnabled: true,
      readerInSeparateWindow: false,
      elementPickerEnabled: true,
      blockNewWindows: true,
      titleExpand: false,
      domainWhitelist: [],
      domainBlocklist: []
    }
  }
})
```

**Wichtig:** `mangaTrash` ist der Papierkorb für Soft-Deletes. Nach 10 Sekunden ohne "Rückgängig" wird der Eintrag aus dem Papierkorb entfernt (aber nicht sofort dauerhaft gelöscht – der Papierkorb bleibt für `manga:emptyTrash`).

### 5.3 IPC-Handler – Manga

**Datei:** `src/main/ipc/manga.ipc.ts`

Alle Handler sind über `ipcMain.handle(channel, handler)` registriert und geben `IpcResult<T>` zurück.

| Kanal | Payload | Antwort | Beschreibung |
|-------|---------|---------|--------------|
| `manga:getAll` | – | `Manga[]` | Alle Manga laden |
| `manga:create` | `Omit<Manga, 'id'\|'createdAt'\|'updatedAt'>` | `Manga` | Neu erstellen |
| `manga:createWithId` | `Manga` | `Manga` | Aus Papierkorb wiederherstellen |
| `manga:update` | `{ id, updates }` | `Manga` | Felder aktualisieren |
| `manga:delete` | `{ id }` | – | In Papierkorb verschieben |
| `manga:emptyTrash` | `{ id }` | – | Dauerhaft löschen |
| `manga:moveItem` | `{ fromId, toId }` | – | Reihenfolge ändern |
| `manga:export` | – | JSON-String | Gesamtliste exportieren |
| `manga:import` | JSON-String | `Manga[]` | Importieren + mergen |
| `mangadex:search` | `{ title }` | `SearchItem[]` | MangaDex-Suche |
| `mangadex:details` | `{ id }` | `MangaDetails` | MDX-Metadaten |
| `comick:search` | `{ title }` | `SearchItem[]` | ComicK-Suche |
| `comick:details` | `{ hid }` | `MangaDetails` | ComicK-Metadaten |

**Import-Normalisierung** (`normalizeImportedEntry`):

Der Importer akzeptiert flexible Feldnamen:
- `title` / `Title` / `name` / `Name`
- `chapter` / `Chapter` / `currentChapter`
- `status` mit Case-insensitiver Normalisierung und Sonderzeichen-Ersatz (`plan_to_read`, `plan to read`, `Plan To Read` etc.)
- Fehlende IDs werden als UUID generiert
- Merge-Strategie: bestehende Einträge (gleiche ID) werden aktualisiert, neue angehängt

### 5.4 IPC-Handler – Einstellungen

**Datei:** `src/main/ipc/settings.ipc.ts`

| Kanal | Funktion |
|-------|---------|
| `settings:get` | Gibt aktuelle Einstellungen zurück |
| `settings:set` | Speichert + sendet `settings:changed` an alle BrowserWindows |

`broadcastSettingsChanged()` iteriert über alle offenen Fenster und sendet das Event – damit sind Reader-Fenster und das Hauptfenster immer synchron.

### 5.5 Reader-Fenster-Verwaltung

**Datei:** `src/main/reader/ReaderView.ts`

**Modus 1 – Eingebetteter BrowserView (Standard):**
- Wird unterhalb der Toolbar (48px Offset) in das Hauptfenster eingebettet
- Passt sich automatisch bei Window-Resize an
- Teilt die Electron-Session mit dem Hauptfenster (gleiche Cookies, localStorage)

**Modus 2 – Separates Fenster** (`readerInSeparateWindow: true`):
- Öffnet eigenständiges `BrowserWindow`
- Gleiche Session-Konfiguration

**Kapitel-Auto-Erkennung:**

```typescript
// Wenn chapterUrlTemplate "$chapter" enthält:
const pattern = template.replace('$chapter', '(\\d+(?:\\.\\d+)?)')
const regex = new RegExp(pattern)
// Bei Navigation: regex.exec(url) → chapter number
// Sendet: mainWindow.webContents.send('reader:chapterDetected', { mangaId, chapter })
```

**Element-Picker (F2):**
- Injiziert JavaScript in den Reader-Webcontents
- Visueller Cursor-Wechsel, Hover-Highlighting
- Klick → Generiert CSS-Selektor (ID → Klassen → Tag-Hierarchie)
- Fügt `display: none !important` via `<style>`-Element ein
- Selektor wird in `localStorage` des Readers gespeichert (persistent)

**Popup-Blocker:**
```typescript
webContents.setWindowOpenHandler(({ url }) => {
  if (settings.blockNewWindows) return { action: 'deny' }
  return { action: 'allow' }
})
```

### 5.6 Domain Guard

**Datei:** `src/main/reader/domainGuard.ts`

Schützt vor unerwarteten Weiterleitungen (Phishing, Malware-Seiten).

**3 Ebenen:**

1. `will-navigate` – Vor der Navigation
2. `will-redirect` – Bei Server-Redirects
3. `did-navigate` – Nach erfolgreicher Navigation (Fallback)

**Prüflogik:**
```
Ziel-Domain == Origin-Domain? → erlaubt
Ziel-Domain in Whitelist? → erlaubt
Ziel-Domain in Blocklist? → blockiert, kein Dialog
Sonst → Dialog anzeigen
```

**Dialog (separates Fenster):** Nativer Electron-Dialog
**Dialog (eingebettet):** IPC-Event `reader:domainGuardRequest` → Vue-Modal in der App

**Nutzer-Entscheidungen:**

| Auswahl | Effekt |
|---------|--------|
| `yes` | Einmalig erlaubt |
| `yes_always` | Domain zur Whitelist hinzugefügt |
| `no` | Blockiert, nächstes Mal wieder fragen |
| `no_block` | Domain zur Blocklist hinzugefügt |

Whitelist/Blocklist werden sofort in den Einstellungen gespeichert.

### 5.7 Ad Blocker

**Datei:** `src/main/reader/adBlocker.ts`

Verwendet `@cliqz/adblocker-electron` mit vorgefertigten Filterlisten (EasyList, EasyPrivacy etc.).

```typescript
// Cache in userData/adblocker-cache.dat
// Blockiert Netzwerkanfragen über Electron-Session
adBlocker.enableBlockingInSession(session.defaultSession)
```

Läuft transparent – kein UI-Feedback, keine Einstellungsoption zum Deaktivieren (hardcoded aktiv im Reader).

### 5.8 Chapter Poller

**Datei:** `src/main/notifications/chapterPoller.ts`

**Initialisierung:**
```typescript
startPoller(mainWindow: BrowserWindow): void
// Startet Timer mit notificationIntervalMs
// Ruft sofort einmal runPoll() auf
```

**Polling-Schleife (`runPoll`):**
1. Alle Manga mit Status `reading` oder `rereading` laden
2. Für jeden Manga die 3-stufige Prüfung ausführen
3. 300ms Pause zwischen API-Calls (Rate Limiting)
4. Bei neuem Kapitel:
   - `store.set('mangaList', ...)` aktualisieren
   - `mainWindow.webContents.send('notifications:newChapter', { mangaId, newChapter })`
   - Desktop-Benachrichtigung (wenn `desktopNotificationsEnabled`)
   - Log-Eintrag senden

**3-stufige Kapitel-Erkennung:**

```
Stufe 1: MangaDex API (wenn mangaDexId vorhanden)
  GET /manga/{id}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=1
  → Erfolgreich? → fertig
  → MDX_SAME? → fertig (kein neues Kapitel)
  → MDX_NO_DATA / MDX_ERR? → weiter zu Stufe 2

Stufe 2: ComicK API (wenn comickHid vorhanden)
  GET /comic/{hid}/chapters?lang=en&limit=1&tachiyomi=true
  → Erfolgreich? → fertig
  → CK_SAME? → fertig
  → CK_NO_DATA / CK_ERR? → weiter zu Stufe 3

Stufe 3: HTTP-Scraping (wenn chapterUrlTemplate vorhanden)
  URL = template.replace('$chapter', floor(currentChapter) + 1)
  → HTTP-Status < 400?
  → Body >= 2000 Zeichen?
  → Kapitelnummer noch in finaler URL?
  → Kein "not found" im <title>?
  → Alle erfüllt → neues Kapitel gefunden
```

**Desktop-Benachrichtigung:**
```typescript
new Notification({
  title: 'Neues Kapitel verfügbar!',
  body: `${manga.title} – Kapitel ${newChapter} ist da`
}).show()
```

---

## 6. Mobile-Architektur (Capacitor/Android)

### 6.1 Einstiegspunkt

**Datei:** `src/renderer/src/main.mobile.ts`

```typescript
// 1. Capacitor Bridge registrieren (MUSS vor Vue-Mount passieren)
setBridge(capacitorAdapter)

// 2. Vue-App erstellen
const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)
app.mount('#app')

// 3. Benachrichtigungs-Berechtigungen anfragen (Android 13+)
LocalNotifications.requestPermissions()

// 4. Poller-Events mit Stores verbinden
onLogEntry((entry) => useLogStore().addEntry(entry))
onNewChapter(() => useMangaStore().fetchAll())

// 5. App-Lifecycle starten
initPollerLifecycle()
```

### 6.2 Capacitor Adapter (Bridge)

**Datei:** `src/renderer/src/services/capacitor.adapter.ts`

Implementiert `PlatformBridge` und leitet alle `invoke(channel, payload)`-Aufrufe an mobile Service-Funktionen weiter.

**Interner Event-Bus** (ersetzt Electron IPC-Events):
```typescript
const bus: Record<string, Set<Function>> = {}
function busEmit(channel: string, data: unknown): void
function busOn(channel: string, fn: Function): () => void
```

**Kanal → Service Mapping:**

| Kanal | Mobile Service |
|-------|---------------|
| `manga:getAll` | `mangaService.getAll()` |
| `manga:create` | `mangaService.create(payload)` |
| `manga:update` | `mangaService.update(id, updates)` |
| `manga:delete` | `mangaService.deleteManga(id)` |
| `manga:setChapter` | `mangaService.setChapter(id, chapter)` |
| `manga:export` | `mangaService.exportManga()` → Share-Dialog |
| `manga:import` | `mangaService.importManga(json)` |
| `settings:get` | `settingsService.settingsGet()` |
| `settings:set` | `settingsService.settingsSet(updates)` + busEmit |
| `mangadex:search` | fetch → MangaDex API |
| `mangadex:details` | fetch → MangaDex Details API |
| `comick:search` | fetch → ComicK API |
| `comick:details` | fetch → ComicK Details API |
| `manga:scanNow` | `runPoll()` |
| `reader:*` | Stubs (nicht genutzt auf Mobile) |

**Export auf Mobile:**
```typescript
// Schreibt Datei in Cache-Verzeichnis
const uri = await storageService.writeMangaExportFile(json)
// Öffnet nativen Teilen-Dialog
await Share.share({ title: 'manga-export.json', url: uri })
```

### 6.3 Mobile Services

**Datei:** `src/renderer/src/services/mobile/manga.service.ts`

Port der Desktop IPC-Handler ohne Electron-Abhängigkeiten:
- `getAll()`, `create()`, `update()`, `deleteManga()`, `setChapter()`, `setStatus()`, `toggleFocus()`, `moveItem()`
- Gleiche Normalisierungslogik beim Import wie Desktop
- Verwendet `crypto.randomUUID()` für IDs
- Gibt gleiche `IpcResult<T>`-Struktur zurück

### 6.4 Storage Service

**Datei:** `src/renderer/src/services/mobile/storage.service.ts`

**Duale Speicherstrategie:**

```
@capacitor/preferences (Preferences API)
  ├── Key: 'manga-list'     → JSON-String der Manga-Liste
  ├── Key: 'app-settings'   → JSON-String der Einstellungen
  └── Key: 'reading-session'→ Aktive Lese-Session (Recovery)

@capacitor/filesystem (Filesystem API, Directory.Data)
  ├── manga-list.json       → Backup der Manga-Liste
  └── manga-trash.json      → Papierkorb
```

**Warum doppelt?** Der Background Runner (WorkManager) kann nur auf `Preferences` zugreifen (`CapacitorKV`). Das Filesystem dient als Backup bei erstem Start oder Migration.

```typescript
// getMangaList(): Preferences first, Filesystem fallback
// setMangaList(): Schreibt in BEIDE (Preferences + Filesystem)
// getSettings(): Preferences mit DEFAULT_SETTINGS merge
// setSettings(): Nur Preferences
```

**Export:**
```typescript
writeMangaExportFile(json: string): Promise<string>
// Schreibt in Directory.Cache/manga-export.json
// Gibt URI zurück (file:///...) für Share-Plugin
```

### 6.5 Mobiler Chapter Poller

**Datei:** `src/renderer/src/services/mobile/poller.service.ts`

Identische 3-stufige Logik wie Desktop-Poller, aber:
- Kein Electron-Session → verwendet globales `fetch()`
- `CapacitorHttp.request()` für HTTP-Scraping (korrekte URL-Behandlung)
- `LocalNotifications.schedule()` statt Electron `Notification`
- Callback-System statt IPC-Events:

```typescript
// Listener registrieren:
onLogEntry((entry: LogEntry) => { /* ... */ })
onNewChapter((mangaId: string) => { /* ... */ })

// Lifecycle:
initPollerLifecycle()
// Lauscht auf App.addListener('appStateChange', ...)
// isActive=true → startPoller()
// isActive=false → stopPoller()
```

**Benachrichtigung (Mobile):**
```typescript
LocalNotifications.schedule({
  notifications: [{
    id: hashId,
    title: 'Neues Kapitel!',
    body: `${title} – Kapitel ${newChapter}`,
    schedule: { at: new Date(Date.now() + 100) }
  }]
})
```

### 6.6 Background Runner

**Datei:** `src/renderer/public/background.runner.js`

Wird von Android WorkManager alle 15 Minuten ausgeführt, auch wenn die App geschlossen ist.

**Einschränkungen:** Kein DOM, kein Vue, kein Pinia. Nur:
- `CapacitorKV` (= Preferences API read/write)
- `CapacitorNotifications`
- Globales `fetch()`

**Ablauf:**
```javascript
addEventListener('checkChapters', async (resolve, reject, args) => {
  // 1. Einstellungen laden
  const settings = JSON.parse(CapacitorKV.get('app-settings') ?? '{}')
  if (!settings.backgroundNotificationsEnabled) { resolve(); return }

  // 2. Manga-Liste laden
  const mangaList = JSON.parse(CapacitorKV.get('manga-list') ?? '[]')

  // 3. Für jeden Manga: MangaDex → ComicK → HTTP
  for (const manga of mangaList.filter(m => m.status === 'reading' || m.status === 'rereading')) {
    const newChapter = await checkMangaDex(manga)
                    ?? await checkComicK(manga)
                    ?? await checkHttp(manga)
    if (newChapter) {
      // 4. Liste aktualisieren + Benachrichtigung senden
    }
  }

  // 5. Aktualisierte Liste zurückschreiben
  CapacitorKV.set('manga-list', JSON.stringify(mangaList))
  resolve()
})
```

**Benachrichtigungs-ID:**
```javascript
// Deterministisch aus mangaId generiert (kein Math.random)
const notifId = manga.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 2147483647
```

---

## 7. Platform Bridge Pattern

**Datei:** `src/renderer/src/services/platform.ts`

Abstraktionsschicht die Desktop (Electron IPC) und Mobile (Capacitor) hinter einer gemeinsamen Schnittstelle versteckt:

```typescript
interface PlatformBridge {
  invoke<T>(channel: string, payload?: unknown): Promise<T>
  on(channel: string, handler: (...args: unknown[]) => void): () => void
  off(channel: string, handler: (...args: unknown[]) => void): void
}

// Registrierung (mobile):
setBridge(capacitorAdapter)

// Abruf (automatisch):
getBridge()
// → Gibt manuell registrierte Bridge zurück
// → Fallback: window.api (Electron preload)
// → Throw wenn keine Bridge verfügbar
```

**Verwendung in Komponenten und Stores:**
```typescript
import { getBridge } from '../services/platform'
const result = await getBridge().invoke<SomeType>('channel', payload)
```

---

## 8. Vue-Frontend (Renderer)

### 8.1 Router

**Datei:** `src/renderer/src/router/index.ts`

```typescript
const routes = [
  { path: '/',         component: LibraryView  },  // Manga-Liste
  { path: '/settings', component: SettingsView },  // Einstellungen
  { path: '/log',      component: LogView      }   // Aktivitätslog
]
// createWebHashHistory() → URL-basiert mit # (funktioniert in Electron + Capacitor)
```

### 8.2 Pinia Stores

#### Manga Store (`stores/manga.store.ts`)

```typescript
state:
  items: Manga[]           // Aktuelle Manga-Liste
  recentlyDeleted: Manga | null  // Für Rückgängig-Funktion
  focusFullVisible: boolean      // Toast-Anzeige

actions:
  fetchAll()               → API 'manga:getAll'
  create(payload)          → API 'manga:create'
  update(id, updates)      → API 'manga:update'
  remove(id)               → API 'manga:delete' + 10s Undo-Fenster
  undoDelete()             → API 'manga:createWithId' (aus Papierkorb)
  setChapter(id, chapter)  → API 'manga:update'
  setStatus(id, status)    → API 'manga:update'
  toggleFocus(id)          → API 'manga:update' (max. 3 fokussiert)
  reorder(fromId, toId)    → API 'manga:moveItem'
  setupListeners()         → Lauscht auf 'notifications:newChapter'

computed:
  mangaList → items (readonly)
```

#### Settings Store (`stores/settings.store.ts`)

Alle `AppSettings`-Felder als einzelne reaktive `ref()`-Werte. Wichtige Methoden:

```typescript
load()                    → API 'settings:get' → applySettings()
save(partial)             → API 'settings:set'
setupListeners()          → Lauscht auf 'settings:changed' (andere Fenster)
```

Jede Einstellung ist direkt als `settingsStore.theme`, `settingsStore.language` etc. zugreifbar.

#### Reader Store (`stores/reader.store.ts`)

Verwaltet den Zustand des eingebetteten Readers (nur Desktop):

```typescript
state:
  isOpen, currentUrl, canGoBack, canGoForward
  isLoading, pendingDomainGuard, currentMangaId

actions:
  open(mangaId, url)              → API 'reader:open'
  close()                         → API 'reader:close'
  goBack/Forward/reload()
  navigate(url)
  respondToDomainGuard(id, choice)→ API 'reader:domainGuardReply'

listeners:
  'reader:urlChanged'             → currentUrl, Navigation-Flags
  'reader:loadingChanged'         → isLoading
  'reader:domainGuardRequest'     → pendingDomainGuard
  'reader:chapterDetected'        → mangaStore.setChapter()
```

#### Log Store (`stores/log.store.ts`)

```typescript
state:
  entries: LogEntry[]    // Max. 500 Einträge, neueste zuerst
  unreadCount: number

actions:
  addEntry(entry)        → prepend, kürzt auf 500
  markAllRead()          → unreadCount = 0
  clear()                → entries = []
```

### 8.3 Composables

#### `usePlatform`

```typescript
const isElectron: boolean = typeof window.api !== 'undefined'
const isMobile: boolean   = typeof window.Capacitor !== 'undefined'

// Platform-Features:
{
  hasDesktopReader: boolean,     // Electron only
  hasElementPicker: boolean,     // Electron only
  hasDesktopNotifications: boolean,
  hasReaderWindowMode: boolean,
  hasDomainGuard: boolean,
  hasNativeShare: boolean        // Mobile only
}
```

#### `useChapterUrl`

```typescript
buildChapterUrl(template: string, chapter: number): string
// Ersetzt alle '$chapter'-Vorkommen durch chapter.toString()
// Beispiel: "https://site.com/manga/$chapter" + 42 → "https://site.com/manga/42"
```

#### `useTheme`

```typescript
useTheme(): void
// Beobachtet settingsStore.theme
// 'light' → document.documentElement.classList.add('light')
// 'dark'  → classList.remove('light')
// 'system'→ matchMedia('prefers-color-scheme: dark') prüfen
//           + OS-Theme-Änderungen verfolgen
```

#### `useReadingSession`

```typescript
type ReadingSession = { mangaId: string; title: string; chapter: number }

setReadingSession(session): Promise<void>
  // → Preferences.set('reading-session', JSON.stringify(session))

clearReadingSession(): Promise<void>
  // → Preferences.remove('reading-session')

getReadingSession(): Promise<ReadingSession | null>
  // → Preferences.get('reading-session') → JSON.parse
```

Wird für die **Reading Session Recovery** genutzt: Wenn der Nutzer beim Lesen die App schließt, bleibt die Session erhalten und beim nächsten App-Start wird ein Recovery-Dialog angezeigt.

### 8.4 Komponenten-Übersicht

#### Views

| Datei | Funktion |
|-------|---------|
| `LibraryView.vue` | Haupt-Manga-Liste mit Tab-Filterung, Drag-Drop, FAB |
| `SettingsView.vue` | Alle Einstellungen, plattform-spezifische Abschnitte |
| `LogView.vue` | Aktivitätslog mit Clear-Button |

#### Layout

| Datei | Funktion |
|-------|---------|
| `AppHeader.vue` | Suchfeld, "Scan Now"-Button, Desktop-Titel |
| `AppSidebar.vue` | Navigationsleiste für Desktop (Library, Log, Settings) |
| `MobileTabBar.vue` | Bottom-Tab-Leiste für Mobile |

#### Manga-Komponenten

| Datei | Funktion |
|-------|---------|
| `MangaCard.vue` | Einzelne Karte: Cover, Titel, Kapitel-Input, Aktionsbuttons, alle Dialoge |
| `MangaFormDialog.vue` | Dialog zum Erstellen/Bearbeiten: alle Felder + MDX/ComicK-Verknüpfung |
| `MangaDexSearchModal.vue` | Suchmodal für MDX und ComicK (Props: `searchChannel`, `modalTitle`) |
| `ChapterInput.vue` | Kapitel-Eingabefeld mit +/−-Buttons |
| `NewChapterBadge.vue` | "Neu"-Badge bei hasNewChapter |
| `DeleteUndoToast.vue` | Toast mit "Rückgängig"-Button nach Löschen |

#### `MangaCard.vue` – wichtigste Dialoge

1. **Mark-as-read Dialog** (Mobile, nach Browser-Schließen): Fragt "Bis zu welchem Kapitel gelesen?"
2. **Read-Choice Dialog**: Bei `readBehavior='ask'` – Hauptseite oder Kapitel öffnen
3. **Info Modal**: Zeigt Beschreibung, Tags, Autoren, Status von MDX/ComicK
4. **Status Picker**: Floating Dropdown zur schnellen Status-Änderung

#### `App.vue` – Reading Session Recovery

```typescript
// onMounted (nur mobile):
const session = await getReadingSession()
if (session && mangaStore.mangaList.find(m => m.id === session.mangaId)) {
  recoverySession.value = session
  recoveryChapter.value = session.chapter
  showRecovery.value = true
}
```

Zeigt Modal "Lesestand nachtragen" mit Kapitel-Eingabe und Speichern/Überspringen.

### 8.5 i18n / Mehrsprachigkeit

**Dateien:**
- `src/renderer/src/i18n/locales/de.json` (Standard-Sprache)
- `src/renderer/src/i18n/locales/en.json`

**Struktur:**
```json
{
  "tabs": { "all", "reading", "plan_to_read", "hiatus", "completed", "rereading", "focus", "new" },
  "manga": { "new", "edit", "delete", "read", "save", "cancel", "search", ... },
  "reader": { "open", "close", "openMain", "openChapter", "domainGuard.*" },
  "settings": { "title", "theme*", "language", "readBehavior*", "notifications*", ... },
  "nav": { "library", "settings", "log" },
  "log": { "title", "clear", "empty" }
}
```

Neue Schlüssel müssen **in beiden Dateien** gepflegt werden. Fehlende Schlüssel fallen auf den Schlüsselnamen zurück (kein Crash).

---

## 9. Datenflüsse

### 9.1 IPC-Kommunikation Desktop

```
Vue-Komponente
  ↓ getBridge().invoke('manga:update', { id, updates })
Platform Service (window.api)
  ↓ ipcRenderer.invoke('manga:update', payload)
[Electron IPC]
  ↓ ipcMain.handle('manga:update', handler)
manga.ipc.ts: updateHandler()
  ↓ store.set('mangaList', ...)
electron-store (JSON auf Disk)
  ↑ return IpcResult<Manga>
Vue-Komponente / Pinia Store aktualisieren
```

### 9.2 IPC-Kommunikation Mobile

```
Vue-Komponente
  ↓ getBridge().invoke('manga:update', { id, updates })
Capacitor Adapter (handler-Map)
  ↓ mangaService.update(id, updates)
Mobile Manga Service
  ↓ storageService.getMangaList() → modify → setMangaList()
Capacitor Preferences + Filesystem
  ↑ return IpcResult<Manga>
Vue-Komponente / Pinia Store aktualisieren
```

### 9.3 Chapter-Polling-Flow

```
Timer-Event (notificationIntervalMs)
  ↓
runPoll(mainWindow) [Desktop] / runPoll() [Mobile]
  ↓
Filtere: status === 'reading' | 'rereading'
  ↓
Für jeden Manga:
  ├─ mangaDexId vorhanden?
  │    ↓ GET api.mangadex.org/manga/{id}/feed?lang=en
  │    ├─ Neues Kapitel → markiere, benachrichtige ✓
  │    ├─ MDX_SAME → überspringen ✓
  │    └─ MDX_NO_DATA / Fehler → weiter
  │
  ├─ comickHid vorhanden?
  │    ↓ GET api.comick.fun/comic/{hid}/chapters?lang=en
  │    ├─ Neues Kapitel → markiere, benachrichtige ✓
  │    ├─ CK_SAME → überspringen ✓
  │    └─ CK_NO_DATA / Fehler → weiter
  │
  └─ chapterUrlTemplate vorhanden?
       ↓ HEAD/GET nextChapterUrl
       ├─ HTTP < 400 && body >= 2000 && URL-Match && kein 404-Title
       │  → Neues Kapitel gefunden ✓
       └─ Sonst → kein neues Kapitel

Nach jedem API-Call: 300ms sleep (Rate Limiting)

Bei neuem Kapitel:
  → store aktualisieren (hasNewChapter, lastCheckedChapter)
  → Desktop/Mobile-Benachrichtigung
  → IPC: 'notifications:newChapter' (Desktop) / onNewChapter-Callback (Mobile)
  → Log-Eintrag: success/error/info
```

### 9.4 Reading-Session-Recovery

```
[MangaCard.vue] User tippt "Lesen" (behavior='chapter')
  ↓
openUrl(url, chapter)
  ↓
setReadingSession({ mangaId, title, chapter })
  → Preferences.set('reading-session', JSON)
  ↓
Browser.open({ url, presentationStyle: 'fullscreen' })
  ↓
Browser.addListener('browserFinished', ...)

CASE A: Normaler Ablauf
  Browser-Schließen → browserFinished-Event
  → showMarkReadDialog = true
  User: "Speichern" oder "Abbrechen"
  → clearReadingSession() [Preferences.remove]
  → (ggf.) mangaStore.setChapter(id, chapter)

CASE B: App wird während des Lesens geschlossen
  Session bleibt in Preferences erhalten

[App.vue onMounted]
  ↓
getReadingSession() → findet Session
  ↓
Manga noch vorhanden? → showRecovery = true
  ↓
Recovery-Modal anzeigen:
  "Lesestand nachtragen"
  Manga-Titel + Kapitel-Eingabe (+/−)
  ↓
User: "Speichern"
  → clearReadingSession()
  → mangaStore.setChapter(id, recoveryChapter) (wenn > currentChapter)

User: "Überspringen"
  → clearReadingSession() (Session verwerfen)
```

---

## 10. Build-System

### 10.1 electron-vite (Desktop)

**Datei:** `electron.vite.config.ts`

```typescript
{
  main: { plugins: [externalizeDepsPlugin()] },   // Node.js-Module nicht bundlen
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [vue(), tailwindcss()],
    resolve: { alias: { '@': 'src/renderer/src', '@renderer': 'src/renderer/src' } }
  }
}
```

**Ausgabe:** `out/main/`, `out/preload/`, `out/renderer/`

### 10.2 Vite Mobile Config

**Datei:** `vite.mobile.config.mts`

```typescript
{
  root: 'src/renderer',
  build: { outDir: '../../dist-mobile' },
  define: { IS_MOBILE: true },
  plugins: [vue(), tailwindcss()],
  // Eingabe: src/renderer/index.mobile.html
  // Ausgabe: dist-mobile/ (nach Umbenennung: index.html)
}
```

`IS_MOBILE` ist ein Compile-Time-Flag. Code der nur auf Mobile läuft kann so tree-geshakt werden.

### 10.3 Capacitor Sync

Nach jedem Mobile-Build muss Capacitor synchronisiert werden:
```bash
npx cap sync android
# Kopiert dist-mobile/ nach android/app/src/main/assets/public/
# Aktualisiert Android-Plugins
```

### 10.4 build_release.bat

Vollständiger Release-Build in 7 Schritten:

```batch
[1/7] installer/ vorbereiten
[2/7] node_modules prüfen (npm install falls fehlend)
[3/7] npm run build (electron-vite build → out/)
[4/7] npx electron-builder --win --publish=never (→ dist/MangaTracker-Installer-*.exe)
[5/7] npm run build:mobile + npx cap sync android
[6/7] gradlew.bat assembleRelease (→ android/app/build/outputs/apk/release/app-release.apk)
[7/7] Artifacts nach installer/ kopieren (.exe + .apk)
```

**Wichtig:**
- Schritt 3 muss `npm run build` (nicht `npx electron-vite build`) verwenden
- `--publish=never` mit `=` (kein Leerzeichen) für zuverlässige CLI-Auswertung
- Bei Fehler: `goto :error`, Abbruch mit Exit-Code 1

---

## 11. Konfigurationsdateien

### `package.json` – Build-Konfiguration

```json
"build": {
  "appId": "com.mangaTracker.app",
  "productName": "Manga Tracker",
  "artifactName": "MangaTracker-Installer-${version}.${ext}",
  "directories": { "buildResources": "resources", "output": "dist" },
  "win": {
    "target": "nsis",
    "executableName": "MangaTracker",
    "icon": "resources/app.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "guid": "A3F7B2C1-4E5D-4F8A-9B0C-1D2E3F4A5B6C",
    "include": "resources/installer.nsh",
    "deleteAppDataOnUninstall": false,
    "runAfterFinish": true
  }
}
```

**GUID:** Muss fest bleiben – identifiziert die App im Windows-Deinstallations-Register. Ändern führt zu doppelten Einträgen.

### `capacitor.config.ts`

```typescript
{
  appId: 'com.mangaTracker.app',
  appName: 'Manga Tracker',
  webDir: 'dist-mobile',
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_icon', iconColor: '#488AFF' },
    CapacitorHttp: { enabled: false },  // WICHTIG: Muss false sein (fetch statt CapacitorHttp)
    BackgroundRunner: {
      label: 'com.mangaTracker.app.background',
      src: 'background.runner.js',
      event: 'checkChapters',
      repeat: true,
      interval: 15,   // Minuten
      autoStart: true
    }
  }
}
```

**Warum `CapacitorHttp.enabled: false`?**
CapacitorHttp verwendet Androids OkHttp-Client, dessen TLS-Fingerprint von manchen CDNs (z.B. ComicK) als Bot erkannt und mit HTTP 403 abgelehnt wird. Mit `false` werden Requests über den WebView (Chrome-Engine) gesendet, was nicht geblockt wird.

---

## 12. Android-spezifisches

### AndroidManifest.xml

Wichtige Einstellungen:
```xml
android:usesCleartextTraffic="true"
<!-- Erlaubt HTTP (nicht nur HTTPS) für Manga-Seiten die kein SSL haben -->

android:launchMode="singleTask"
<!-- Stellt sicher, dass immer dieselbe Activity-Instanz verwendet wird -->
```

Berechtigungen:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<!-- POST_NOTIFICATIONS wird zur Laufzeit angefragt (Android 13+) -->
```

### Gradle Build

Release-APK wird erstellt mit:
```batch
android\gradlew.bat assembleRelease
```
Ausgabe: `android\app\build\outputs\apk\release\app-release.apk`

Für den Release-Build wird ein Keystore benötigt (in `android/app/build.gradle` konfiguriert).

---

## 13. NSIS-Installer (Windows)

**Datei:** `resources/installer.nsh`

Drei Custom-Hooks die electron-builder in das NSIS-Skript einbindet:

### `customInit` (vor Installation)

1. Laufenden `MangaTracker.exe`-Prozess beenden (`taskkill /F`)
2. PowerShell-Skript nach `%TEMP%\mt_cleanup.ps1` schreiben
3. PS-Skript ausführen: Sucht in der Registry nach allen `"Manga Tracker*"`-Einträgen und führt deren Uninstaller mit `/S` (Silent) aus
4. `mt_cleanup.ps1` löschen

**Warum `$$` statt `$`?**
NSIS behandelt `$variable` als Variablenreferenz und gibt Warning 6000. `$$` ist das NSIS-Escape für ein einzelnes `$`-Zeichen in der Ausgabe. Das generierte PS1-Skript enthält dann korrekt `$paths`, `$p`, etc.

**Warum `[char]34`?**
Um Quoting-Konflikte zwischen NSIS-Single-Quotes und PowerShell-Strings zu vermeiden. `[char]34` ist das ASCII-Zeichen `"` in PowerShell.

### `customInstall` (nach Installation)

Beendet erneut `MangaTracker.exe` (falls beim Überschreiben noch läuft).

### `customUnInstall` (bei Deinstallation)

Beendet `MangaTracker.exe` vor dem Löschen der Dateien.

---

## 14. API-Integrationen

### 14.1 MangaDex

**Basis-URL:** `https://api.mangadex.org`

**Suche:**
```
GET /manga?title={query}&limit=10&includes[]=cover_art
Response: { data: [{ id, attributes: { title }, relationships: [{ type: 'cover_art', attributes: { fileName } }] }] }
Cover-URL: https://uploads.mangadex.org/covers/{mangaId}/{fileName}.256.jpg
```

**Kapitel-Feed:**
```
GET /manga/{id}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=1
Response: { data: [{ attributes: { chapter: "123.5" } }] }
```

**Details:**
```
GET /manga/{id}?includes[]=cover_art&includes[]=author&includes[]=tag
Response: { data: { attributes: { description, tags, publicationDemographic, year, status } } }
```

### 14.2 ComicK.io

**Basis-URL:** `https://api.comick.fun`

**Suche:**
```
GET /v1.0/search?q={query}&limit=10
Response: [{ hid, title, md_covers: [{ b2key }] }]
Cover-URL: https://meo.comick.pictures/{b2key}
```

**Kapitel:**
```
GET /comic/{hid}/chapters?lang=en&limit=1&tachiyomi=true
Response: { chapters: [{ chap: "123.5" }] }
```

**Details:**
```
GET /comic/{hid}
Response: { comic: { title, desc, status, country, last_chapter, genres, authors } }
```

**User-Agent:** Alle Requests senden `User-Agent: MangaTracker/1.0 (personal hobby app)`

### 14.3 HTTP-Fallback

```typescript
// URL-Konstruktion:
const nextChapter = Math.floor(manga.currentChapter) + 1
const url = template.replace(/\$chapter/g, String(nextChapter))

// Validierung (alle müssen erfüllt sein):
response.status < 400
body.length >= 2000
finalUrl.includes(String(nextChapter)) // Kapitel-Nr. noch in URL
!/<title>[^<]*(not found|404|error)[^<]*<\/title>/i.test(body)
```

---

## 15. Einstellungen-Referenz

| Schlüssel | Typ | Standard | Plattform | Beschreibung |
|-----------|-----|---------|-----------|--------------|
| `theme` | `'light'\|'dark'\|'system'` | `'system'` | Alle | App-Design |
| `language` | `'en'\|'de'` | `'de'` | Alle | Sprache |
| `readBehavior` | `'main'\|'chapter'\|'ask'` | `'ask'` | Alle | Was beim Klick auf "Lesen" passiert |
| `notificationIntervalMs` | `number` | `3600000` | Alle | Polling-Intervall in ms |
| `notificationsEnabled` | `boolean` | `true` | Alle | Kapitel-Polling aktiv |
| `backgroundNotificationsEnabled` | `boolean` | `false` | Mobile | Android WorkManager-Scan |
| `autoLinkEnabled` | `boolean` | `false` | Alle | Auto-Verknüpfung bei Speichern |
| `desktopNotificationsEnabled` | `boolean` | `true` | Desktop | System-Benachrichtigungen |
| `readerInSeparateWindow` | `boolean` | `false` | Desktop | Reader als eigenes Fenster |
| `elementPickerEnabled` | `boolean` | `true` | Desktop | F2 Element-Picker |
| `blockNewWindows` | `boolean` | `true` | Desktop | Popup-Blocker |
| `titleExpand` | `boolean` | `false` | Alle | Titel bei Hover/Tap aufklappen |
| `domainWhitelist` | `string[]` | `[]` | Desktop | Immer erlaubte Domains |
| `domainBlocklist` | `string[]` | `[]` | Desktop | Immer blockierte Domains |

---

## 16. Poller-Statuscodes

Werden im Aktivitätslog angezeigt. Vollständige Referenz in `POLLER_CODES.md`.

| Code | Quelle | Bedeutung |
|------|--------|----------|
| `MDX_SAME` | MangaDex | Kein neues Kapitel (aktuell) |
| `MDX_NO_DATA` | MangaDex | Keine englischen Kapitel gefunden |
| `MDX_ERR(HTTP_xxx)` | MangaDex | HTTP-Fehler von der API |
| `MDX_ERR(PARSE)` | MangaDex | Unlesbare API-Antwort |
| `CK_SAME` | ComicK | Kein neues Kapitel |
| `CK_NO_DATA` | ComicK | Keine englischen Kapitel |
| `CK_ERR(...)` | ComicK | API-Fehler |
| `NO_URL` | HTTP | Kein `chapterUrlTemplate` oder kein `http`-Präfix |
| `HTTP_xxx` | HTTP | HTTP-Statuscode ≥ 400 |
| `SHORT` | HTTP | Antwort kürzer als 2000 Zeichen |
| `URL_MISMATCH` | HTTP | Kapitelnummer nicht in finaler URL |
| `TITLE_404` | HTTP | `<title>` enthält "not found" / "404" |

---

## 17. Import/Export-Format

### Export-Format

```json
{
  "exportedAt": "2025-01-01T12:00:00.000Z",
  "version": 1,
  "mangaList": [
    {
      "id": "uuid",
      "title": "Manga Titel",
      "mainUrl": "https://...",
      "chapterUrlTemplate": "https://.../$chapter",
      "status": "reading",
      "isFocused": false,
      "currentChapter": 42,
      "hasNewChapter": false,
      "lastCheckedChapter": 42,
      "mangaDexId": "...",
      "mangaDexTitle": "...",
      "mangaDexCoverUrl": "https://...",
      "comickHid": "...",
      "comickTitle": "...",
      "comickCoverUrl": "https://...",
      "createdAt": 1704067200000,
      "updatedAt": 1704067200000
    }
  ]
}
```

### Import-Toleranz

Der Importer akzeptiert flexible Strukturen:

| Feld | Akzeptierte Varianten |
|------|-----------------------|
| `title` | `title`, `Title`, `name`, `Name` |
| `currentChapter` | `currentChapter`, `chapter`, `Chapter` |
| `mainUrl` | `mainUrl`, `url`, `URL` |
| `status` | Case-insensitiv, Leerzeichen/Apostrophe werden normalisiert |
| `id` | Beliebige UUID; fehlend → neue UUID generiert |
| Container | `mangaList`, `items` oder direkt ein Array |

**Merge-Strategie:** Vorhandene Einträge (gleiche ID) werden aktualisiert, neue angehängt. Keine Duplikate.

---

## 18. Erweiterungshinweise

### Neue IPC-Kanäle hinzufügen

1. **Desktop:** Handler in `src/main/ipc/manga.ipc.ts` (oder neue Datei) mit `ipcMain.handle()` registrieren
2. **Mobile:** Entsprechende Funktion in `src/renderer/src/services/mobile/` implementieren und in `capacitor.adapter.ts` mappen
3. **Typen:** Falls nötig, `src/types/index.ts` erweitern

### Neue Einstellung hinzufügen

1. `AppSettings`-Interface in `src/types/index.ts` erweitern
2. Default in `src/main/store.ts` hinzufügen
3. Default in `src/renderer/src/services/mobile/storage.service.ts` (`DEFAULT_SETTINGS`) hinzufügen
4. `ref()` + `applySettings()`-Mapping in `src/renderer/src/stores/settings.store.ts`
5. UI in `src/renderer/src/views/SettingsView.vue` (ggf. plattform-spezifisch mit `v-if="isMobile"`)
6. i18n-Schlüssel in `de.json` + `en.json`

### Neue API-Quelle für Kapitel-Erkennung hinzufügen

1. Neues `id`-Feld in `Manga`-Interface (`src/types/index.ts`)
2. Neue `check[ApiName]()`-Funktion in `src/main/notifications/chapterPoller.ts`
3. Funktion in die Fallback-Kette in `checkManga()` einbauen
4. Gleiche Funktion in `src/renderer/src/services/mobile/poller.service.ts`
5. Such-Handler in `src/main/ipc/manga.ipc.ts` + `capacitor.adapter.ts`
6. Suchmodal-Instanz in `MangaFormDialog.vue` hinzufügen (wiederverwendbarer `MangaDexSearchModal`)
7. Neue Statuscodes in `POLLER_CODES.md` dokumentieren

### Plattform-spezifische Komponenten

```vue
<!-- Nur Desktop zeigen: -->
<template v-if="!isMobile">...</template>

<!-- Nur Mobile zeigen: -->
<template v-if="isMobile">...</template>
```

```typescript
// Plattform-Detection:
import { isMobile } from '../composables/usePlatform'
```

### Version erhöhen

In `package.json`:
```json
"version": "1.0.1"
```

Gilt automatisch für:
- Installer-Dateiname (`MangaTracker-Installer-1.0.1.exe`)
- Windows-Deinstallations-Anzeigename
- APK-Version (über Gradle-Config)

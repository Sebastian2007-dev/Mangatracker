# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Desktop development (hot reload)
npm run dev

# Type checking without building
npm run typecheck

# Run stats-related tests
npm run test:stats

# Build desktop app (outputs to out/)
npm run build

# Build + package Windows installer
npm run dist

# Mobile web build (outputs to dist-mobile/)
npm run build:mobile

# Sync and open Android project in Android Studio
npm run cap:android

# Full release build: Windows installer + Android APK
.\build_release.bat
```

## Architecture

This is a **dual-platform manga tracker** (Electron desktop + Capacitor Android) sharing a Vue 3 frontend.

### Three-layer stack

```bash
Desktop (Electron)
  └─ Main Process  →  IPC handlers  →  electron-store (JSON on disk)
  └─ Preload       →  contextBridge → window.api
  └─ Renderer      ↑

Shared Vue Frontend (src/renderer/src/)
  └─ Pinia stores, Vue Router, vue-i18n, Tailwind CSS 4
  └─ Platform bridge: getBridge().invoke('channel', payload) → IpcResult<T>

Mobile (Capacitor)
  └─ CapacitorAdapter  →  MobileService  →  Capacitor Preferences + Filesystem
  └─ background.runner.js (Android WorkManager, 15-min polling)
```

### Platform bridge pattern

All state access goes through `getBridge()` in `src/renderer/src/services/platform.ts`. On desktop it calls `window.api.invoke(channel, payload)` (IPC to Electron main); on mobile it routes to `capacitor.adapter.ts` → mobile services. Components and stores never call platform APIs directly.

### IPC channels

Defined in `src/main/ipc/` — each file registers handlers for a domain:

- **manga**: `manga:getAll`, `manga:create`, `manga:update`, `manga:delete`, `manga:export`, `manga:import`, `manga:moveItem`, `manga:emptyTrash`, `manga:scanNow`
- **reader** (desktop only): `reader:open/close/goBack/goForward/reload`, `reader:domainGuardReply`, `reader:elementPickerResult`
- **settings**: `settings:get`, `settings:set` (broadcasts `settings:changed` to all windows)
- **mods**: `mods:getAll`, `mods:setEnabled`, `mods:getSetting`, `mods:setSetting`
- **stats/achievements**: `statistics:getAll`, `achievements:getAll`
- **gist sync**: `gist:*`

Push events from main → renderer: `notifications:newChapter`, `settings:changed`, `reader:urlChanged`, `reader:loadingChanged`, `reader:domainGuardRequest`, `reader:chapterDetected`.

### Pinia stores (`src/renderer/src/stores/`)

| Store | State held |
| --- | --- |
| `manga.store.ts` | Library items, recently-deleted (undo window) |
| `settings.store.ts` | All AppSettings as reactive refs |
| `statistics.store.ts` | StatisticsEvents, achievements, RPG attributes |
| `reader.store.ts` | Reader open/URL/nav state (desktop only) |
| `log.store.ts` | Activity log (max 500 entries) |
| `skill-tree.store.ts` | User level, focus slots |
| `achievement-toast.store.ts` | Toast visibility for unlocked achievements |

### Persistence

- **Desktop**: `electron-store` (JSON) in `%APPDATA%\Manga Tracker\`. Schema + migrations in `src/main/store.ts`.
- **Mobile**: `@capacitor/preferences` (key-value) + `@capacitor/filesystem`.
- No SQL database.

Store shape: `{ mangaList, mangaTrash, statsEvents, statsTagCache, earnedAchievements, settings, modDisabled, modSettings }`.

### Chapter detection (3-stage fallback)

Implemented identically in `src/main/notifications/chapterPoller.ts` (desktop) and `src/renderer/src/services/mobile/poller.service.ts` (mobile):

1. **MangaDex API** — if `manga.mangaDexId` is set
2. **ComicK API** — if `manga.comickHid` is set
3. **HTTP scraping** — if `manga.chapterUrlTemplate` is set (HEAD/GET next chapter URL, validate by body size + URL)

Status codes are documented in `POLLER_CODES.md`.

### Mod system

Users can drop mods into `%APPDATA%\Manga Tracker\mods\<mod-id>/`. Each mod has `mod.json` + optional `index.js` (custom scanner) + optional `theme.css`. Mods run before built-in scanners in the polling loop. Full API docs in `docs/MODDING_GUIDE.md`.

### Build outputs

| Target | Command | Output |
| --- | --- | --- |
| Desktop compiled | `npm run build` | `out/` |
| Windows installer | `npm run dist` | `dist/MangaTracker-Installer-*.exe` |
| Mobile web | `npm run build:mobile` | `dist-mobile/` |
| Release both | `.\build_release.bat` | `installer/` |

### Key config files

- `electron.vite.config.ts` — main/preload/renderer aliases and build
- `vite.mobile.config.mts` — mobile build; sets `IS_MOBILE` env flag to distinguish mobile-only code paths
- `capacitor.config.ts` — Capacitor appId, webDir, plugin config (LocalNotifications, BackgroundRunner)
- `tsconfig.json` — references `tsconfig.web.json`, `tsconfig.node.json`, `tsconfig.tests.json`

### Internationalization

German (`de.json`) and English (`en.json`) under `src/renderer/src/i18n/locales/`. Mods can ship their own `i18n/<locale>.json`.

## Notable implementation details

- **IS_MOBILE build flag**: `vite.mobile.config.mts` injects `import.meta.env.IS_MOBILE`; code that only runs on one platform is gated by this.
- **Domain Guard**: 3-tier whitelist/dialog/blocklist system in the reader; see `src/main/reader/domainGuard.ts`.
- **Element Picker** (F2): lets users hide DOM elements persistently, stored per-domain in settings.
- **RPG attributes**: Statistics module tracks Power, Speed, Wisdom, Stamina, Endurance, Arc (PWR/SPD/WIS/STM/END/ARC) derived from reading events.
- **Gist Sync**: Optional GitHub Gist cloud backup wired through `src/main/ipc/gist.ts`.

# MangaTracker - Modding Guide

> Security warning: Mods are loaded in Electron's main process with full Node.js access (filesystem, network, etc.). Only install mods from sources you trust.

## Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Theme Mods](#theme-mods)
4. [Scanner Mods](#scanner-mods)
5. [Plugin Mods](#plugin-mods)
6. [mod.json Reference](#modjson-reference)
7. [ModApi Reference](#modapi-reference)
8. [CSS Variable Reference](#css-variable-reference)

## Introduction

Mods are folders inside MangaTracker's `mods` directory. The app supports three mod types:

| Type | Purpose |
| --- | --- |
| `theme` | Override app colors, typography, and other CSS variables |
| `scanner` | Add custom chapter-detection logic |
| `plugin` | Extend behavior with events, IPC handlers, and mod storage |

A single mod can include multiple types.

## Installation

### Open the mods folder

In MangaTracker: `Settings -> Mods -> Open Folder`

Or manually:

| Platform | Path |
| --- | --- |
| Windows | `%APPDATA%\\manga-tracker\\mods\\` |
| macOS | `~/Library/Application Support/manga-tracker/mods/` |
| Linux | `~/.config/manga-tracker/mods/` |

### Install a mod

1. Copy the mod folder into `mods/`.
2. In MangaTracker Settings, click `Scan Mods`.
3. The mod appears in the Mods sidebar immediately.

### Disable a mod

Use the toggle in the Mods sidebar.  
Note: Enabling/disabling currently requires a restart to fully apply.

## Theme Mods

Theme mods do not need JavaScript. A `mod.json` plus a CSS file is enough.

### Folder structure

```text
mods/
  my-theme/
    mod.json
    theme.css
```

### mod.json

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "author": "YourName",
  "description": "Red accent palette",
  "type": ["theme"],
  "theme": "theme.css"
}
```

### theme.css

Override CSS custom properties in `:root`:

```css
:root {
  --primary: 0 84% 60%;
  --primary-foreground: 0 0% 100%;
}
```

Theme CSS is injected after page load and overrides app defaults.

Example: [`docs/example-mods/example-theme/`](./example-mods/example-theme/)

## Scanner Mods

Scanner mods add custom chapter detection and run before built-in scanners.

### Scanner folder structure

```text
mods/
  my-scanner/
    mod.json
    index.js
```

### Scanner mod.json

```json
{
  "id": "my-scanner",
  "name": "MySite Scanner",
  "version": "1.0.0",
  "author": "YourName",
  "description": "Detects chapters from mysite.com",
  "type": ["scanner"],
  "main": "index.js"
}
```

### Scanner index.js

```js
module.exports = {
  register(api) {
    api.addChapterScanner({
      name: 'MySite Scanner',
      priority: 10,

      canHandle(manga) {
        return manga.mainUrl.includes('mysite.com')
      },

      async check(manga) {
        try {
          const res = await fetch(`https://api.mysite.com/manga/${manga.id}/latest`)
          if (!res.ok) return { latestChapter: null, error: `HTTP ${res.status}` }

          const data = await res.json()
          return { latestChapter: data.latestChapter ?? null }
        } catch (e) {
          return { latestChapter: null, error: e.message }
        }
      }
    })
  }
}
```

### `check()` return values

| Return value | Meaning |
| --- | --- |
| `{ latestChapter: 42 }` | Latest chapter is known |
| `{ latestChapter: null }` | No result, fall back to built-in scanners |
| `{ latestChapter: null, error: '...' }` | Error, fall back to built-in scanners |

If `latestChapter > manga.currentChapter`, MangaTracker will trigger a notification.

Example: [`docs/example-mods/example-scanner/`](./example-mods/example-scanner/)

## Plugin Mods

Plugin mods can subscribe to app events, register custom IPC handlers, and store settings.

### Plugin mod.json

```json
{
  "id": "discord-notify",
  "name": "Discord Notifications",
  "version": "1.0.0",
  "author": "YourName",
  "description": "Send new chapter updates to Discord",
  "type": ["plugin"],
  "main": "index.js",
  "settings": [
    {
      "key": "webhookUrl",
      "type": "text",
      "label": "Discord Webhook URL",
      "default": ""
    }
  ]
}
```

### index.js - events

```js
module.exports = {
  register(api) {
    api.on('app:ready', () => {
      api.log('Discord plugin ready', 'success')
    })

    api.on('manga:created', (manga) => {
      api.log(`Added manga: ${manga.title}`)
    })

    api.on('manga:updated', (manga) => {
      // react to updates
    })

    api.on('manga:deleted', ({ id }) => {
      api.log(`Deleted manga: ${id}`)
    })
  }
}
```

### index.js - custom IPC handler

```js
module.exports = {
  register(api) {
    const storage = api.getStorage()

    api.registerHandler('discord-notify:sendTest', async () => {
      const url = storage.get('webhookUrl')
      if (!url) throw new Error('No webhook configured')
      return 'OK'
    })
  }
}
```

Renderer call:

```js
getBridge().invoke('mod:discord-notify:sendTest')
```

### Persistent mod storage

```js
const storage = api.getStorage()
storage.set('myKey', { value: 42 })
const data = storage.get('myKey')
```

Values are stored under `modSettings.{modId}.{key}` in `electron-store`.

### Sidebar tab (optional)

Add a desktop sidebar tab by setting `sidebarTab` in `mod.json`.

#### Option A — HTML file (recommended)

Provide a `tab.html` file that is rendered in a sandboxed iframe:

```json
{
  "id": "my-tab",
  "name": "My Tab",
  "version": "1.0.0",
  "type": ["plugin"],
  "main": "index.js",
  "sidebarTab": {
    "label": "My Tab",
    "html": "tab.html"
  }
}
```

The HTML file can include any CSS and JavaScript. It runs in a sandboxed iframe (`sandbox="allow-scripts"`), so it cannot access the app's IPC directly.

#### Option B — i18n placeholder

Without `html`, the tab shows a translated placeholder from the mod's i18n files:

```json
{
  "sidebarTab": { "label": "My Tab" },
  "i18nDir": "i18n"
}
```

`i18n/en.json`:

```json
{
  "tabLabel": "My Tab",
  "tabTitle": "My Tab",
  "tabSubtitle": "Subtitle text from the mod.",
  "tabEmpty": "Nothing here yet"
}
```

Example: [`docs/example-mods/example-tab/`](./example-mods/example-tab/)

## mod.json Reference

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | Unique id (`a-z`, `0-9`, `-`, `_`) |
| `name` | string | yes | Display name |
| `version` | string | yes | Semantic version (for example `1.0.0`) |
| `author` | string | no | Author name |
| `description` | string | no | Short description |
| `type` | string[] | yes | `theme`, `scanner`, `plugin`, or combination |
| `sidebarTab` | object | no | Adds a desktop sidebar tab |
| `i18nDir` | string | no | Mod translation folder (default: `i18n`) |
| `main` | string | no | JS entry file (default: `index.js`) |
| `theme` | string | no | CSS file for theme mods (default: `theme.css`) |
| `settings` | array | no | Optional settings schema |

### Settings schema field

```json
{
  "key": "apiKey",
  "type": "text",
  "label": "API Key",
  "default": "",
  "options": []
}
```

| Field | Type | Description |
| --- | --- | --- |
| `key` | string | Internal key used by `getStorage()` |
| `type` | string | `text`, `boolean`, `number`, `select` |
| `label` | string | Label shown in the UI |
| `default` | any | Default value |
| `options` | string[] | Required for `type: "select"` |

## ModApi Reference

### `api.addChapterScanner(scanner)`

Register a custom scanner. Higher `priority` runs first.

```ts
api.addChapterScanner({
  name: 'My Scanner',
  priority: 10,
  canHandle(manga) { return true },
  async check(manga) { return { latestChapter: null } }
})
```

### `api.registerHandler(channel, handler)`

Register a mod IPC handler available as `mod:{channel}` from the renderer.

### `api.on(event, callback)`

Subscribe to app events:

| Event | Payload |
| --- | --- |
| `app:ready` | `{}` |
| `manga:created` | `Manga` |
| `manga:updated` | `Manga` |
| `manga:deleted` | `{ id: string }` |

### `api.log(message, type?)`

Write to the app activity log. `type` can be `info`, `success`, `warning`, or `error`.

### `api.getStorage()`

Return namespaced persistent storage (`get` / `set`) for the current mod.

### `api.getDir()`

Returns the absolute path to the mod's own folder. Use this to read local files from within your mod:

```js
const fs = require('fs')
const path = require('path')

module.exports = {
  register(api) {
    const dir = api.getDir()
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf-8'))
    api.log('Config loaded: ' + config.name, 'success')
  }
}
```

## CSS Variable Reference

All values are HSL components without wrapping `hsl()`, for example: `0 84% 60%`.

| Variable | Description |
| --- | --- |
| `--background` | Main background |
| `--foreground` | Main text |
| `--card` | Card background |
| `--card-foreground` | Card text |
| `--primary` | Primary color |
| `--primary-foreground` | Text on primary color |
| `--secondary` | Secondary color |
| `--secondary-foreground` | Text on secondary color |
| `--muted` | Muted background |
| `--muted-foreground` | Muted text |
| `--accent` | Accent/hover background |
| `--accent-foreground` | Text on accent |
| `--border` | Border color |
| `--input` | Input background |
| `--ring` | Focus ring |

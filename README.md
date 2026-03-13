# MangaTracker

MangaTracker is a desktop/mobile manga tracking app built with Electron + Vue and Capacitor.

## Development

### Desktop (Electron)

```bash
npm run dev
```

### Android (Capacitor)

```bash
npm run cap:android
```

## Build

### Full release build (Windows installer + Android APK)

```bat
build_release.bat
```

Output artifacts are written to the `installer/` directory.

## Mods

- Mods are loaded from your user data folder: `.../Manga Tracker/mods/`
- Open it in-app: `Settings -> Mods -> Open Folder`
- After dropping a new mod into the folder, click `Scan Mods` in Settings  
  (no app restart needed for registration)

Detailed modding docs:

- [docs/MODDING_GUIDE.md](docs/MODDING_GUIDE.md)
- [docs/example-mods/example-theme](docs/example-mods/example-theme)
- [docs/example-mods/example-scanner](docs/example-mods/example-scanner)

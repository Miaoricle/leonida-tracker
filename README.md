# Leonida Tracker

A personal, ad-free GTA 6 map tracker: every location, category filters, search, and ticking things off as you
find them. Mobile-first PWA; works offline. No ads, accounts, analytics or backend.

**App:** https://miaoricle.github.io/leonida-tracker/

This repo holds only the app and the open map tiles. The location data is **not** here: it lives in a private
repo and is fetched only by your own device (see below). A CI guard fails the build if GTABase data ever shows up
in this repo or the build.

## Install on iPhone

1. Open the app URL in **Safari** → **Share** → **Add to Home Screen**.
2. Open it **from the home screen** and do the setup there (the home-screen app has its own storage, separate
   from Safari: a token pasted in Safari isn't visible to the installed app).

## Load the map data (first run)

### Option A: GitHub token (recommended, gets updates)
Create a fine-grained token: GitHub → Settings → Developer settings → **Personal access tokens → Fine-grained
tokens** → *Generate new token*:

- **Repository access:** Only select repositories → `Miaoricle/leonida-data`
- **Permissions:** Repository permissions → **Contents: Read-only** (nothing else)
- **Expiration:** 1 year

In the app: **Menu → Settings → Data source** → paste the token → **Save & test connection**. The token is stored
in IndexedDB on the device and sent **only** to `api.github.com`. The app checks for new data on open (at most
once a day, using ETags so an unchanged check downloads nothing), or tap **Check for updates**.

### Option B: no token
Download `markers.json`, `categories.json`, `labels.json`, `meta.json` from `leonida-data/data` to the Files app,
then **Settings → Import data file** and pick them.

## Updating the data (GTABase sync)
In `leonida-data`: **Actions → Sync GTABase → Run workflow**. It loads the GTABase map page once, decodes and
validates the markers, and commits only if something changed. Then tap **Check for updates** in the app.

## Backups
Progress, notes, favourites, personal markers and profiles live only on the device. **Settings → Export backup**
saves one JSON file (on iPhone: *Save to Files* → iCloud Drive). Do this regularly: deleting the home-screen app
deletes its data. The app reminds you after 7 days without a backup. **Import backup** merges a file (newer
entries win; nothing is deleted).

## Offline
The app shell, your data and progress work with no signal. Map tiles you've viewed are cached; **Settings →
Download map for offline** fetches the rest (Overview ≈ 8 MB, Detailed ≈ 26 MB, Full ≈ 86 MB).

## Features
Map with clustering and 5-tier place labels · filter sheet (Only, Hide found, jump to next unfound) · fuzzy,
accent-insensitive search · marker card (Found, favourite, note, share, previous/next) · up to 4 profiles ·
stats · reset · personal markers with photos · deep links `?feature=<category>`, `?m=<markerId>`,
`?at=x,y,zoom` · long-press map → copy link / add marker · coordinate picker · light/dark theme · keep screen
awake.

## Development
```bash
npm ci
npm run dev-data     # copy ../leonida-data/data into git-ignored dev-data/ (dev server only)
npm run dev          # http://localhost:5173/leonida-tracker/
npm test             # Vitest unit tests
npm run build && npx playwright test   # E2E on iPhone 13 + Pixel 7 viewports (synthetic fixture)
npm run tiles        # re-vendor gtadb.org tiles into public/tiles (clones into git-ignored vendor-src/)
npm run icons        # regenerate the Material Symbols glyph bundle after editing src/icons/mapping.ts
npm run guard        # check no GTABase data is in the repo / dist
```
Category → icon mapping: `src/icons/mapping.ts`. Coordinate system and alignment notes: `src/map/crs.ts`.

## Credits
- Locations & screenshots: [GTABase.com](https://www.gtabase.com/gta-6/map/)
- Map tiles: [gtadb.org](https://gtadb.org) and contributors (CC BY 4.0)
- Icons: Google Material Symbols (Apache 2.0)
- Fan project, not affiliated with Rockstar Games or Take-Two.

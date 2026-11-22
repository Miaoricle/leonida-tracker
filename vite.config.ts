import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';

const BASE = '/leonida-tracker/';

// Serves ./dev-data (a git-ignored local copy of the private GTABase data) at /dev-data/ in `vite dev` ONLY.
// It is never part of `public/`, so it can't end up in a build or on GitHub Pages.
function devData(): Plugin {
  const dir = path.resolve(process.cwd(), 'dev-data');
  return {
    name: 'leonida-dev-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/\/dev-data\/([a-z]+\.json)(\?|$)/);
        if (!m) return next();
        const f = path.join(dir, m[1]);
        if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('Run `npm run dev-data` first'); }
        res.setHeader('Content-Type', 'application/json');
        fs.createReadStream(f).pipe(res);
      });
    },
  };
}

// GitHub Pages serves 404.html for unknown paths: make it the app so deep links always boot.
function pages404(): Plugin {
  return {
    name: 'leonida-404',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve(process.cwd(), 'dist');
      if (fs.existsSync(path.join(dist, 'index.html'))) fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [
    devData(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // registered from src/pwa.ts (update toast)
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Leonida Tracker',
        short_name: 'Leonida',
        description: 'Personal, ad-free GTA 6 map tracker',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b1620',
        theme_color: '#0b1620',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // app shell only: tiles are cached at runtime (and by "Download map for offline")
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}', 'tiles/ranges.json', 'tiles/index.json'],
        globIgnores: ['tiles/**/*.jpg', '404.html'],
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/\/tiles\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // (a RegExp, not a closure: functions are copied into sw.js and can't see variables from this file)
            urlPattern: /\/leonida-tracker\/tiles\/\d+\/[\d,]+\.jpg$/,
            handler: 'CacheFirst',
            options: { cacheName: 'tiles', expiration: { maxEntries: 32000, purgeOnQuotaError: false }, cacheableResponse: { statuses: [200] } },
          },
          {
            // marker images you've opened (if the source allows embedding)
            urlPattern: ({ request, url }) => request.destination === 'image' && url.origin !== self.location.origin,
            handler: 'CacheFirst',
            options: { cacheName: 'marker-images', expiration: { maxEntries: 5000 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
    pages404(),
  ],
  build: { target: 'es2020', sourcemap: false },
});

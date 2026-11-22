import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

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

export default defineConfig({
  base: '/leonida-tracker/',
  plugins: [devData()],
  build: { target: 'es2020', sourcemap: false },
});

// Copies the private GTABase data from a sibling ../leonida-data checkout into ./dev-data (git-ignored)
// for local development. Usage: npm run dev-data [-- path/to/leonida-data]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(process.argv[2] || path.join(ROOT, '../leonida-data'), 'data');
const out = path.join(ROOT, 'dev-data');
fs.mkdirSync(out, { recursive: true });
for (const f of ['markers.json', 'categories.json', 'labels.json', 'meta.json']) {
  fs.copyFileSync(path.join(src, f), path.join(out, f));
  console.log('copied', f);
}

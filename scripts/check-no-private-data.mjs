// CI guard: fails if GTABase data (private, personal-use permission) appears in this public repo or its build.
// Checks every git-tracked file plus dist/ (if built).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
const all = [...new Set([...files, ...walk('dist')])].filter((f) => !f.startsWith('public/tiles/') && !f.startsWith(path.join('dist', 'tiles')) && /\.(json|js|mjs|ts|html|txt|csv)$/i.test(f) && f !== 'scripts/check-no-private-data.mjs');

const ID = /"id"\s*:\s*"[a-z0-9-]+-\d{3,}"/g; // GTABase marker ids look like "safehouse-001"
const problems = [];
for (const f of all) {
  if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, 'utf8');
  const base = path.basename(f);
  const ids = (s.match(ID) || []).length;
  if (/^(markers|categories|labels)\.json$/i.test(base) && ids > 0) problems.push(`${f}: data file with ${ids} GTABase-style ids`);
  else if (ids > 20) problems.push(`${f}: ${ids} GTABase-style marker ids`);
  if (/gtabase\.com\/images\/gta-6\/maps\/submissions\//.test(s)) problems.push(`${f}: GTABase submission image URLs`);
  if (/GTAB_MARKERS_DATA\s*=/.test(s)) problems.push(`${f}: raw GTAB_MARKERS_DATA`);
}
if (problems.length) {
  console.error('✗ GTABase data found in the public repo/build:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`✓ No GTABase data in ${all.length} files`);

// Generates the app icons (an original map-pin + check glyph) as SVG + PNG. Run: node scripts/app-icons.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const OUT = 'public/icons';
// pin + check, drawn in a 512 box; `scale` shrinks it for the maskable safe zone
const glyph = (scale = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <path d="M256 70c-84 0-150 64-150 146 0 104 128 222 140 233a14 14 0 0 0 20 0c12-11 140-129 140-233 0-82-66-146-150-146z"
          fill="url(#g)" stroke="#fff" stroke-width="14"/>
    <path d="M190 214l46 46 90-92" fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
const svg = ({ rounded, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16324a"/><stop offset="1" stop-color="#0b1620"/></linearGradient>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3fbf74"/><stop offset="1" stop-color="#1f7a45"/></linearGradient>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#bg)"/>
  ${glyph(scale)}
</svg>`;
fs.writeFileSync(`${OUT}/icon.svg`, svg({ rounded: true, scale: 1 }));
fs.writeFileSync(`${OUT}/maskable.svg`, svg({ rounded: false, scale: 0.72 }));
fs.writeFileSync('public/favicon.svg', svg({ rounded: true, scale: 1 }));
const b = await chromium.launch();
const p = await b.newPage();
const render = async (file, size, out, transparent) => {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="data:image/svg+xml;base64,${Buffer.from(fs.readFileSync(file)).toString('base64')}" width="${size}" height="${size}">`);
  await p.screenshot({ path: out, omitBackground: transparent });
};
await render(`${OUT}/icon.svg`, 192, `${OUT}/icon-192.png`, true);
await render(`${OUT}/icon.svg`, 512, `${OUT}/icon-512.png`, true);
await render(`${OUT}/maskable.svg`, 512, `${OUT}/maskable-512.png`, false);
await render(`${OUT}/maskable.svg`, 180, `${OUT}/apple-touch-icon.png`, false); // iOS rounds it itself
await b.close();
console.log(fs.readdirSync(OUT));

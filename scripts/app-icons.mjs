// Generates the app icons (original "VI" lettering) as SVG + PNG. Run: node scripts/app-icons.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const OUT = 'public/icons';
// original "VI" lettering in a sunset gradient (GTA VI style, not Rockstar's logo); `scale` shrinks it for the maskable safe zone
const glyph = (scale = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-265 -260)">
    <path d="M90 128h78l54 190 54-190h78l-92 264h-80z M372 128h68v264h-68z" fill="url(#g)" stroke="#fff" stroke-width="10" stroke-linejoin="round"/>
  </g>`;
const svg = ({ rounded, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1240"/><stop offset="1" stop-color="#0b1620"/></linearGradient>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc15e"/><stop offset="0.45" stop-color="#ff4f8b"/><stop offset="1" stop-color="#8a3ffc"/></linearGradient>
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

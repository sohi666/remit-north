// Renders the app icons from the SVG sources: node scripts/assets/render.mjs
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
const out = new URL('../../assets/', import.meta.url).pathname;
const jobs = [
  ['icon.svg', 'icon.png', 1024],
  ['fg.svg', 'android-icon-foreground.png', 1024],
  ['bg.svg', 'android-icon-background.png', 1024],
  ['mono.svg', 'android-icon-monochrome.png', 1024],
  ['splash.svg', 'splash-icon.png', 512],
  ['splash.svg', 'favicon.png', 96],
  ['icon.svg', 'store-icon-512.png', 512],
  ['splash.svg', 'logo-rounded-1024.png', 1024],
];
for (const [src, dst, w] of jobs) {
  const png = new Resvg(readFileSync(dir + src, 'utf8'), { fitTo: { mode: 'width', value: w }, font: { loadSystemFonts: true } }).render().asPng();
  writeFileSync(out + dst, png);
  console.log(dst, png.length);
}

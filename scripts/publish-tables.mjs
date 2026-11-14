#!/usr/bin/env node
// Builds the public tables feed the app downloads:
//   site/tables/index.json             { schema, packs: [{ year, version, url }] }
//   site/tables/<year>-<version>.json  the pack itself (immutable file names, safe to cache)
// Run after `npm run verify:pack`; then publish site/ to the remit-north-info Pages repo.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.TABLES_BASE_URL ?? 'https://sohi666.github.io/remit-north-info/tables';
const src = join(root, 'src', 'tax', 'packs');
const out = join(root, 'site', 'tables');
mkdirSync(out, { recursive: true });
const packs = [];
for (const f of readdirSync(src).filter((x) => x.endsWith('.json')).sort()) {
  const pack = JSON.parse(readFileSync(join(src, f), 'utf8'));
  const name = `${pack.year}-${pack.version}.json`;
  writeFileSync(join(out, name), JSON.stringify(pack));
  packs.push({ year: pack.year, version: pack.version, url: `${base}/${name}` });
}
writeFileSync(join(out, 'index.json'), JSON.stringify({ schema: 1, updated: new Date().toISOString().slice(0, 10), packs }, null, 2) + '\n');
console.log(packs.map((p) => `${p.year} ${p.version}`).join('\n'));

#!/usr/bin/env node
// Watches government sources for new tax tables and checks the shipped pack against the CRA's own CSV.
//
// 1. Fingerprints the CRA T4127 page and Revenu Québec's "principal changes" page. A change means a new
//    edition may be out (January and July for the CRA, December for Revenu Québec).
// 2. Downloads the CRA "Rates, income thresholds and constants" CSV for the current edition and checks
//    that every bracket threshold and rate in src/tax/packs/<year>.json appears in it. The check only
//    looks for the numbers, so it does not depend on the CSV's exact layout.
//
// Output: JSON on stdout { changed: [...], mismatches: [...], errors: [...] } and exit 0.
// State (previous fingerprints) is read from and written to .tables-watch/state.json.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stateFile = join(root, '.tables-watch', 'state.json');
const year = Number(process.env.TAX_YEAR ?? new Date().getFullYear());
const yy = String(year).slice(2);
const month = new Date().getMonth() + 1;
const edition = month >= 7 ? 'jul' : 'jan';

const PAGES = {
  cra: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas.html',
  rq: `https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/employers-principal-changes-for-${year}/`,
  rqNext: `https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/employers-principal-changes-for-${year + 1}/`,
};
const CSV = (ed) => `https://www.canada.ca/content/dam/cra-arc/formspubs/pub/t4127-${ed}/rtsncmtrshldcnstnt-${ed === 'jul' ? '07' : '01'}-${yy}e.csv`;

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'remit-north-tables-watch' }, signal: AbortSignal.timeout(30000) });
  return { status: res.status, text: res.ok ? await res.text() : '' };
}

/** Strip scripts, tags and dates that change on every load, then hash the main content. */
function fingerprint(html) {
  const main = (html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/Date modified:[^<\n]*/gi, '')
    .replace(/\s+/g, ' ');
  return createHash('sha256').update(main).digest('hex').slice(0, 16);
}

const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const result = { year, edition, changed: [], mismatches: [], errors: [], notes: [] };

for (const [key, url] of Object.entries(PAGES)) {
  try {
    const r = await get(url);
    if (r.status === 404) {
      if (key === 'rqNext') continue; // next year's page not published yet
      result.errors.push(`${key}: HTTP 404 ${url}`);
      continue;
    }
    if (!r.text) {
      result.errors.push(`${key}: HTTP ${r.status}`);
      continue;
    }
    const fp = fingerprint(r.text);
    if (state[key] && state[key] !== fp) result.changed.push({ key, url });
    if (!state[key] && key === 'rqNext') result.changed.push({ key, url, note: 'next year published' });
    state[key] = fp;
  } catch (e) {
    result.errors.push(`${key}: ${e.message}`);
  }
}

const packFile = join(root, 'src', 'tax', 'packs', `${year}.json`);
if (!existsSync(packFile)) {
  result.mismatches.push(`No pack for ${year} (src/tax/packs/${year}.json)`);
} else {
  const pack = JSON.parse(readFileSync(packFile, 'utf8'));
  try {
    const r = await get(CSV(edition));
    if (!r.text) {
      result.notes.push(`CRA CSV for the ${edition} ${year} edition not available (HTTP ${r.status}).`);
    } else {
      const nums = new Set((r.text.match(/-?\d[\d,]*\.?\d*/g) ?? []).map((s) => Number(s.replace(/,/g, ''))).filter(Number.isFinite));
      const has = (n) => nums.has(n) || nums.has(Math.round(n * 1e4) / 1e4) || [...nums].some((x) => Math.abs(x - n) < 1e-6 || Math.abs(x - n * 100) < 1e-6);
      const check = (label, brackets) => {
        for (const b of brackets) {
          if (b.from > 0 && !has(b.from)) result.mismatches.push(`${label}: threshold ${b.from} not in CRA CSV`);
          if (!has(b.rate)) result.mismatches.push(`${label}: rate ${b.rate} not in CRA CSV`);
        }
      };
      check('Federal', pack.federal.brackets);
      for (const [prov, j] of Object.entries(pack.jurisdictions)) {
        if (prov === 'QC') continue; // the CRA does not publish Quebec income tax
        check(prov, j.payroll?.brackets ?? j.brackets);
      }
      result.notes.push(`Checked against ${CSV(edition)} (${nums.size} numbers).`);
    }
  } catch (e) {
    result.errors.push(`CRA CSV: ${e.message}`);
  }
}

mkdirSync(dirname(stateFile), { recursive: true });
writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log(JSON.stringify(result, null, 2));

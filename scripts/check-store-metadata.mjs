#!/usr/bin/env node
/**
 * Offline lint for the store listings in fastlane/ (zero dependencies, Node >= 22).
 *
 *   node scripts/check-store-metadata.mjs               # lengths, required files, wording rules
 *   node scripts/check-store-metadata.mjs --check-urls  # also require every *_url.txt to answer (release gate)
 *
 * Limits enforced (App Store Connect / Google Play, as of 2026):
 *   App Store  name 30, subtitle 30, promotional_text 170, description 4000,
 *              keywords 100 (characters AND UTF-8 bytes, to be safe), release_notes 4000
 *   Play       title 30, short_description 80, full_description 4000, changelogs 500
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values: opts } = parseArgs({
  options: {
    'check-urls': { type: 'boolean', default: false },
    root: { type: 'string' },
  },
});

const ROOT = opts.root ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'fastlane');
const META = join(ROOT, 'metadata');
const IOS_LOCALES = ['en-US', 'fr-CA'];
const ANDROID_LOCALES = ['en-US', 'fr-CA'];
const GH = !!process.env.GITHUB_ACTIONS;

const IOS_FIELDS = {
  name: { max: 30, required: true },
  subtitle: { max: 30, required: true },
  promotional_text: { max: 170 },
  description: { max: 4000, required: true },
  keywords: { max: 100, required: true, bytes: true },
  release_notes: { max: 4000 },
  support_url: { url: true, required: true },
  marketing_url: { url: true },
  privacy_url: { url: true, required: true },
};
const ANDROID_FIELDS = {
  title: { max: 30, required: true },
  short_description: { max: 80, required: true },
  full_description: { max: 4000, required: true },
  'changelogs/default.txt': { max: 500, required: true, raw: true },
};

// ASC age-rating keys accepted by fastlane deliver's app_rating_config_path (docs.fastlane.tools, 2026).
const RATING_LEVEL_KEYS = [
  'alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated', 'gunsOrOtherWeapons',
  'horrorOrFearThemes', 'matureOrSuggestiveThemes', 'medicalOrTreatmentInformation',
  'profanityOrCrudeHumor', 'sexualContentGraphicAndNudity', 'sexualContentOrNudity',
  'violenceCartoonOrFantasy', 'violenceRealistic',
  'violenceRealisticProlongedGraphicOrSadistic',
];
const RATING_LEVELS = ['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE', 'INFREQUENT', 'FREQUENT'];
const RATING_BOOL_KEYS = [
  'advertising', 'ageAssurance', 'gambling', 'healthOrWellnessTopics', 'lootBox',
  'messagingAndChat', 'parentalControls', 'socialMedia', 'unrestrictedWebAccess', 'userGeneratedContent',
];
const RATING_ENUMS = {
  ageRatingOverrideV2: ['NONE', 'NINE_PLUS', 'THIRTEEN_PLUS', 'SIXTEEN_PLUS', 'EIGHTEEN_PLUS', 'UNRATED'],
  koreaAgeRatingOverride: ['NONE', 'FIFTEEN_PLUS', 'NINETEEN_PLUS'],
  kidsAgeBand: [null, 'FIVE_AND_UNDER', 'SIX_TO_EIGHT', 'NINE_TO_ELEVEN'],
};

const PLACEHOLDER = /\b(TODO|TBD|FIXME|lorem ipsum|placeholder)\b/i;
const CLAIMS = /#\s?1\b|\bno\.\s?1\b|\bnumber one\b|\bnum[ée]ro un\b|\bbest (game|puzzle|app)\b|\bmeilleur (jeu|casse-t[êe]te)\b|\b(award|prix)[- ]winning\b|\bmillions? of (players|downloads)\b/i;
const OTHER_STORE_IN_IOS = /\b(android|google play|play store)\b/i;
const OTHER_STORE_IN_ANDROID = /\b(ios|iphone|ipad|app store|apple)\b/i;

let errors = 0;
let warnings = 0;
const urls = new Map(); // url -> [files]
const rows = [];

function report(level, file, msg) {
  const rel = relative(process.cwd(), file);
  if (level === 'error') errors++;
  else warnings++;
  if (GH) console.log(`::${level} file=${rel}::${msg}`);
  else console.log(`${level.toUpperCase()}  ${rel}: ${msg}`);
}

const chars = (s) => [...s].length;
const read = (f) => readFileSync(f, 'utf8');

function checkText(file, value, spec, store) {
  const text = spec.raw ? value.replace(/\s+$/, '') : value.trim();
  if (!text) {
    if (spec.required) report('error', file, 'is empty');
    return;
  }
  if (spec.max) {
    const n = chars(text);
    rows.push([relative(META, file), n, spec.max]);
    if (n > spec.max) report('error', file, `${n} characters, limit ${spec.max}`);
    if (spec.bytes) {
      const b = Buffer.byteLength(text, 'utf8');
      if (b > spec.max) report('error', file, `${b} UTF-8 bytes, keep keywords <= ${spec.max} bytes`);
    }
  }
  if (spec.url) {
    if (!/^https:\/\/[^\s]+$/.test(text)) report('error', file, `must be a single https:// URL, got "${text}"`);
    else urls.set(text, [...(urls.get(text) ?? []), file]);
    return;
  }
  if (!spec.raw && /\n/.test(text) && spec.max && spec.max <= 30) report('error', file, 'must be a single line');
  if (PLACEHOLDER.test(text)) report('error', file, 'contains placeholder text (TODO/TBD/lorem...)');
  if (CLAIMS.test(text)) report('error', file, 'contains a ranking/award claim that cannot be backed up');
  if (/<\/?[a-z][^>]*>/i.test(text)) report('error', file, 'stores do not render HTML tags');
  if (store === 'ios' && OTHER_STORE_IN_IOS.test(text)) report('error', file, 'App Store text must not mention Android/Google Play');
  if (store === 'android' && OTHER_STORE_IN_ANDROID.test(text)) report('error', file, 'Play text must not mention iOS/Apple');
}

// ---- App Store ------------------------------------------------------------
for (const locale of IOS_LOCALES) {
  const dir = join(META, locale);
  if (!existsSync(dir)) {
    report('error', dir, 'missing App Store locale folder');
    continue;
  }
  for (const [field, spec] of Object.entries(IOS_FIELDS)) {
    const file = join(dir, `${field}.txt`);
    if (!existsSync(file)) {
      if (spec.required) report('error', file, 'missing');
      continue;
    }
    checkText(file, read(file), spec, 'ios');
  }
  const kwFile = join(dir, 'keywords.txt');
  if (existsSync(kwFile)) {
    const kw = read(kwFile).trim();
    if (/,\s/.test(kw)) report('warning', kwFile, 'spaces after commas waste keyword characters');
    const words = kw.split(',').map((k) => k.trim().toLowerCase());
    const dup = words.filter((w, i) => w && words.indexOf(w) !== i);
    if (dup.length) report('warning', kwFile, `duplicate keywords: ${dup.join(', ')}`);
    const nameFile = join(dir, 'name.txt');
    if (existsSync(nameFile)) {
      const name = read(nameFile).toLowerCase();
      const wasted = words.filter((w) => w && name.includes(w));
      if (wasted.length) report('warning', kwFile, `already in the app name (no ranking benefit): ${wasted.join(', ')}`);
    }
  }
}
for (const f of ['copyright.txt', 'primary_category.txt']) {
  const file = join(META, f);
  if (!existsSync(file) || !read(file).trim()) report('error', file, 'missing or empty');
}
const notes = join(META, 'review_information', 'notes.txt');
if (existsSync(notes)) checkText(notes, read(notes), { max: 4000 }, 'ios');

// ---- Age rating -----------------------------------------------------------
const ratingFile = join(ROOT, 'app_rating_config.json');
if (!existsSync(ratingFile)) report('error', ratingFile, 'missing');
else {
  try {
    const cfg = JSON.parse(read(ratingFile));
    for (const [k, v] of Object.entries(cfg)) {
      if (RATING_LEVEL_KEYS.includes(k)) {
        if (!RATING_LEVELS.includes(v)) report('error', ratingFile, `${k}: "${v}" is not one of ${RATING_LEVELS.join('/')}`);
      } else if (RATING_BOOL_KEYS.includes(k)) {
        if (typeof v !== 'boolean') report('error', ratingFile, `${k} must be true or false`);
      } else if (k in RATING_ENUMS) {
        if (!RATING_ENUMS[k].includes(v)) report('error', ratingFile, `${k}: "${v}" not in ${RATING_ENUMS[k].join('/')}`);
      } else if (k === 'developerAgeRatingInfoUrl') {
        if (typeof v !== 'string' || !/^https:\/\//.test(v)) report('error', ratingFile, `${k} must be an https URL`);
      } else report('error', ratingFile, `unknown age-rating key "${k}"`);
    }
    for (const k of [...RATING_LEVEL_KEYS, ...RATING_BOOL_KEYS]) {
      if (!(k in cfg)) report('warning', ratingFile, `"${k}" not answered; App Store Connect will ask for it`);
    }
  } catch (e) {
    report('error', ratingFile, `invalid JSON: ${e.message}`);
  }
}

// ---- Google Play ----------------------------------------------------------
for (const locale of ANDROID_LOCALES) {
  const dir = join(META, 'android', locale);
  if (!existsSync(dir)) {
    report('error', dir, 'missing Play locale folder');
    continue;
  }
  for (const [field, spec] of Object.entries(ANDROID_FIELDS)) {
    const file = spec.raw ? join(dir, field) : join(dir, `${field}.txt`);
    if (!existsSync(file)) {
      if (spec.required) report('error', file, 'missing');
      continue;
    }
    checkText(file, read(file), spec, 'android');
  }
  const cl = join(dir, 'changelogs');
  if (existsSync(cl)) {
    for (const f of readdirSync(cl).filter((n) => n.endsWith('.txt') && n !== 'default.txt')) {
      if (!/^\d+\.txt$/.test(f)) report('error', join(cl, f), 'changelog files must be default.txt or <versionCode>.txt');
      else checkText(join(cl, f), read(join(cl, f)), { max: 500, raw: true }, 'android');
    }
  }
}

// ---- URL reachability (release gate) --------------------------------------
if (opts['check-urls']) {
  for (const [url, files] of urls) {
    let status = 'no response';
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'remit-north-store-check' } });
      status = res.status;
      if (res.ok) {
        console.log(`ok    ${res.status} ${url}`);
        continue;
      }
    } catch (e) {
      status = e.cause?.code ?? e.name;
    }
    for (const f of files) report('error', f, `URL not reachable (${status}): ${url}`);
  }
}

console.log('\nfield                                          chars / limit');
for (const [f, n, max] of rows) console.log(`${f.padEnd(46)} ${String(n).padStart(5)} / ${max}`);
console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);

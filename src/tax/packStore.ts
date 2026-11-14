/**
 * Where the app's tax tables come from:
 * 1. Built-in packs (always available, offline).
 * 2. Packs downloaded from the public tables feed and saved on the device, used offline afterwards.
 * A downloaded pack replaces a built-in one only if it is newer and passes validation, including its own
 * reference calculations run through this app's engine.
 */
import pack2026 from './packs/2026.json';
import type { TaxPack } from './types';
import { newerVersion, validatePack } from './validate';
import { kv } from '../state/kv';

export const TABLES_INDEX_URL = 'https://sohi666.github.io/remit-north-info/tables/index.json';

export const BUNDLED: TaxPack[] = [pack2026 as unknown as TaxPack];

const KEY = 'packs.v1';

export interface PackCache {
  packs: TaxPack[];
  lastChecked?: string;
}

export interface TablesIndex {
  schema: number;
  packs: { year: number; version: string; url: string }[];
}

export type CheckStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate' }
  | { kind: 'updated'; versions: string[] }
  | { kind: 'offline' }
  | { kind: 'rejected'; error: string };

export function loadCache(): PackCache {
  try {
    const raw = kv.get(KEY);
    if (!raw) return { packs: [] };
    const c = JSON.parse(raw) as PackCache;
    // Re-validate on load: a pack saved by an older app version must still pass this engine's checks.
    return { ...c, packs: (c.packs ?? []).filter((p) => validatePack(p).ok) };
  } catch {
    return { packs: [] };
  }
}

function saveCache(c: PackCache) {
  kv.set(KEY, JSON.stringify(c));
}

/** Newest valid pack per year, built-in or downloaded. */
export function availablePacks(cache: PackCache): { pack: TaxPack; source: 'bundled' | 'downloaded' }[] {
  const byYear = new Map<number, { pack: TaxPack; source: 'bundled' | 'downloaded' }>();
  for (const p of BUNDLED) byYear.set(p.year, { pack: p, source: 'bundled' });
  for (const p of cache.packs) {
    const cur = byYear.get(p.year);
    if (!cur || newerVersion(p.version, cur.pack.version)) byYear.set(p.year, { pack: p, source: 'downloaded' });
  }
  return [...byYear.values()].sort((a, b) => b.pack.year - a.pack.year);
}

async function fetchJson(url: string, timeoutMs = 10000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Downloads any newer tables listed in the feed. Never throws. */
export async function checkForUpdates(cache: PackCache, indexUrl = TABLES_INDEX_URL): Promise<{ cache: PackCache; status: CheckStatus }> {
  let index: TablesIndex;
  try {
    index = (await fetchJson(indexUrl)) as TablesIndex;
    if (!index || !Array.isArray(index.packs)) throw new Error('bad index');
  } catch {
    return { cache, status: { kind: 'offline' } };
  }
  const have = availablePacks(cache);
  const versions: string[] = [];
  let error: string | undefined;
  const packs = [...cache.packs];
  for (const entry of index.packs) {
    const cur = have.find((h) => h.pack.year === entry.year);
    if (cur && !newerVersion(entry.version, cur.pack.version)) continue;
    try {
      const raw = await fetchJson(entry.url);
      const v = validatePack(raw);
      if (!v.ok) {
        error = v.error;
        continue;
      }
      const i = packs.findIndex((p) => p.year === v.pack.year);
      if (i >= 0) packs[i] = v.pack;
      else packs.push(v.pack);
      versions.push(v.pack.version);
    } catch (e) {
      error = String(e);
    }
  }
  const next: PackCache = { packs, lastChecked: new Date().toISOString() };
  saveCache(next);
  if (versions.length) return { cache: next, status: { kind: 'updated', versions } };
  if (error) return { cache: next, status: { kind: 'rejected', error } };
  return { cache: next, status: { kind: 'upToDate' } };
}

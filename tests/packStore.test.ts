import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('../src/state/kv', () => ({
  kv: { get: (k: string) => store.get(k) ?? null, set: (k: string, v: string) => void store.set(k, v) },
}));

import pack2026 from '../src/tax/packs/2026.json';
import { availablePacks, checkForUpdates, loadCache } from '../src/tax/packStore';

const INDEX = 'https://example.test/index.json';
function mockFetch(routes: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async (url: string) => {
    if (!(url in routes)) throw new Error('offline');
    return { ok: true, status: 200, json: async () => routes[url] } as Response;
  }) as unknown as typeof fetch;
}

describe('tables feed', () => {
  beforeEach(() => store.clear());

  it('works offline with the built-in pack', async () => {
    mockFetch({});
    const r = await checkForUpdates(loadCache(), INDEX);
    expect(r.status.kind).toBe('offline');
    expect(availablePacks(r.cache)[0].pack.version).toBe('2026.07.2');
  });

  it('downloads a newer valid pack, stores it, and uses it offline afterwards', async () => {
    const newer = { ...JSON.parse(JSON.stringify(pack2026)), version: '2026.07.3' };
    const y2027 = { ...JSON.parse(JSON.stringify(pack2026)), year: 2027, version: '2027.01.1' };
    mockFetch({
      [INDEX]: { schema: 1, packs: [{ year: 2026, version: '2026.07.3', url: 'u1' }, { year: 2027, version: '2027.01.1', url: 'u2' }] },
      u1: newer,
      u2: y2027,
    });
    const r = await checkForUpdates(loadCache(), INDEX);
    expect(r.status).toEqual({ kind: 'updated', versions: ['2026.07.3', '2027.01.1'] });
    mockFetch({});
    const again = availablePacks(loadCache());
    expect(again.map((p) => [p.pack.year, p.pack.version, p.source])).toEqual([
      [2027, '2027.01.1', 'downloaded'],
      [2026, '2026.07.3', 'downloaded'],
    ]);
  });

  it('rejects a pack whose reference checks fail', async () => {
    const broken = JSON.parse(JSON.stringify(pack2026));
    broken.version = '2026.07.4';
    broken.federal.brackets[0].rate = 0.2;
    mockFetch({ [INDEX]: { schema: 1, packs: [{ year: 2026, version: '2026.07.4', url: 'u3' }] }, u3: broken });
    const r = await checkForUpdates(loadCache(), INDEX);
    expect(r.status.kind).toBe('rejected');
    expect(availablePacks(r.cache)[0].pack.version).toBe('2026.07.2');
  });

  it('is up to date when the feed has nothing newer', async () => {
    mockFetch({ [INDEX]: { schema: 1, packs: [{ year: 2026, version: '2026.07.2', url: 'u1' }] } });
    expect((await checkForUpdates(loadCache(), INDEX)).status.kind).toBe('upToDate');
  });
});

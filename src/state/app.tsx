import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import { kv } from './kv';
import { STRINGS, deviceLang, type Lang, type Strings } from '../i18n';
import { DARK, LIGHT, type Palette } from '../theme';
import type { Prov, TaxPack } from '../tax/types';
import { availablePacks, checkForUpdates, loadCache, type CheckStatus, type PackCache } from '../tax/packStore';

export interface Prefs {
  lang: 'auto' | Lang;
  theme: 'auto' | 'light' | 'dark';
  autoUpdate: boolean;
  /** First-run guide finished or skipped. */
  onboarded: boolean;
  /** First-time tips the user has dismissed. */
  tipsSeen: string[];
  year?: number;
  prov: Prov;
  payroll: {
    amount: number;
    enterAnnual: boolean;
    periods: number;
    eiExempt: boolean;
    pensionExempt: boolean;
    reverse: boolean;
    wcbRate: number;
    hsfPrimary: boolean;
    extraTax: number;
    dependants: number;
    /** 0 = use the basic personal amount. */
    federalClaim: number;
    provincialClaim: number;
    vacationRate: number;
    ytdGross: number;
    ytdPension: number;
    ytdEi: number;
    ytdQpip: number;
  };
  sales: { sales: number; purchases: number; prior: number; activity: 'services' | 'goods' };
  corp: { revenue: number; expenses: number; payrollCost: number; otherIncome: number; psb: boolean; qcHours: number };
  owner: { profit: number; eiExempt: boolean; psb: boolean; qcHours: number };
}

const DEFAULTS: Prefs = {
  lang: 'auto',
  theme: 'auto',
  autoUpdate: true,
  onboarded: false,
  tipsSeen: [],
  prov: 'QC',
  payroll: { amount: 75000, enterAnnual: true, periods: 12, eiExempt: false, pensionExempt: false, reverse: false, wcbRate: 0, hsfPrimary: false, extraTax: 0, dependants: 0, federalClaim: 0, provincialClaim: 0, vacationRate: 0, ytdGross: 0, ytdPension: 0, ytdEi: 0, ytdQpip: 0 },
  sales: { sales: 50000, purchases: 3000, prior: 0, activity: 'services' },
  corp: { revenue: 200000, expenses: 20000, payrollCost: 80000, otherIncome: 0, psb: false, qcHours: 2000 },
  owner: { profit: 150000, eiExempt: true, psb: false, qcHours: 2000 },
};

const PREFS_KEY = 'prefs.v1';

function loadPrefs(): Prefs {
  try {
    const raw = kv.get(PREFS_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...p,
      payroll: { ...DEFAULTS.payroll, ...p.payroll },
      sales: { ...DEFAULTS.sales, ...p.sales },
      corp: { ...DEFAULTS.corp, ...p.corp },
      owner: { ...DEFAULTS.owner, ...p.owner },
    };
  } catch {
    return DEFAULTS;
  }
}

interface AppCtx {
  prefs: Prefs;
  set: <K extends keyof Prefs>(key: K, value: Prefs[K] | ((v: Prefs[K]) => Prefs[K])) => void;
  lang: Lang;
  s: Strings;
  c: Palette;
  pack: TaxPack;
  packSource: 'bundled' | 'downloaded';
  years: number[];
  lastChecked?: string;
  status: CheckStatus;
  check: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [cache, setCache] = useState<PackCache>(loadCache);
  const [status, setStatus] = useState<CheckStatus>({ kind: 'idle' });
  const scheme = useColorScheme();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback<AppCtx['set']>((key, value) => {
    setPrefs((p) => {
      const v = typeof value === 'function' ? (value as (x: Prefs[typeof key]) => Prefs[typeof key])(p[key]) : value;
      const next = { ...p, [key]: v };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => kv.set(PREFS_KEY, JSON.stringify(next)), 400);
      return next;
    });
  }, []);

  const check = useCallback(async () => {
    setStatus({ kind: 'checking' });
    const r = await checkForUpdates(cache);
    setCache(r.cache);
    setStatus(r.status);
  }, [cache]);

  // Refresh tables in the background at most every 12 hours.
  useEffect(() => {
    if (!prefs.autoUpdate) return;
    const last = cache.lastChecked ? Date.parse(cache.lastChecked) : 0;
    if (Date.now() - last > 12 * 3600 * 1000) void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AppCtx>(() => {
    const lang: Lang = prefs.lang === 'auto' ? deviceLang() : prefs.lang;
    const dark = prefs.theme === 'auto' ? scheme !== 'light' : prefs.theme === 'dark';
    const packs = availablePacks(cache);
    const chosen = packs.find((p) => p.pack.year === prefs.year) ?? packs[0];
    return {
      prefs,
      set,
      lang,
      s: STRINGS[lang],
      c: dark ? DARK : LIGHT,
      pack: chosen.pack,
      packSource: chosen.source,
      years: packs.map((p) => p.pack.year),
      lastChecked: cache.lastChecked,
      status,
      check,
    };
  }, [prefs, set, scheme, cache, status, check]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider missing');
  return v;
}

/** Forces the dark palette for a subtree (the onboarding sits on a navy backdrop in both modes). */
export function DarkScope({ children }: { children: React.ReactNode }) {
  const v = useApp();
  const value = useMemo(() => ({ ...v, c: DARK }), [v]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

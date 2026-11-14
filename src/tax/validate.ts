/** Structural and numeric checks a tax pack must pass before the app uses it. */
import { PACK_SCHEMA, PROVINCES, type Bracket, type TaxPack } from './types';
import { calcPeriod } from './engine/payroll';

const isNum = (n: unknown, lo = 0, hi = 1e9) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
const isRate = (n: unknown) => isNum(n, 0, 0.6);

function bracketsOk(b: unknown): b is Bracket[] {
  if (!Array.isArray(b) || b.length === 0 || b[0].from !== 0) return false;
  for (let i = 0; i < b.length; i++) {
    if (!isNum(b[i].from) || !isRate(b[i].rate)) return false;
    if (i > 0 && !(b[i].from > b[i - 1].from)) return false;
  }
  return true;
}

export function validatePack(raw: unknown): { ok: true; pack: TaxPack } | { ok: false; error: string } {
  const p = raw as TaxPack;
  try {
    if (!p || typeof p !== 'object') return { ok: false, error: 'not an object' };
    if (p.schema !== PACK_SCHEMA) return { ok: false, error: `schema ${p.schema} not supported` };
    if (!isNum(p.year, 2024, 2100)) return { ok: false, error: 'year' };
    if (typeof p.version !== 'string') return { ok: false, error: 'version' };
    if (!bracketsOk(p.federal?.brackets)) return { ok: false, error: 'federal brackets' };
    for (const k of ['rate', 'baseRate', 'rate2'] as const) {
      if (!isRate(p.cpp?.[k]) || !isRate(p.qpp?.[k])) return { ok: false, error: `pension ${k}` };
    }
    if (!isRate(p.ei?.rate) || !isRate(p.ei?.qcRate) || !isRate(p.qpip?.employee)) return { ok: false, error: 'EI/QPIP' };
    for (const prov of PROVINCES) {
      const j = p.jurisdictions?.[prov];
      if (!j) return { ok: false, error: `missing ${prov}` };
      if (!bracketsOk(j.brackets)) return { ok: false, error: `${prov} brackets` };
      if (j.payroll?.brackets && !bracketsOk(j.payroll.brackets)) return { ok: false, error: `${prov} payroll brackets` };
      if (!isRate(j.corp?.small) || !isRate(j.corp?.general) || !isNum(j.corp?.limit, 1)) return { ok: false, error: `${prov} corp` };
      if (!j.sales || !isRate(j.sales.quick?.services) || !isRate(j.sales.quick?.goods)) return { ok: false, error: `${prov} sales` };
    }
    if (!Array.isArray(p.checks) || p.checks.length === 0) return { ok: false, error: 'no checks' };
    for (const c of p.checks) {
      const r = calcPeriod(p, { prov: c.prov, grossPerPeriod: c.grossPerPeriod, periods: c.periods, eiExempt: c.eiExempt }).result;
      for (const [k, v] of Object.entries(c.expect)) {
        const got = r[k as keyof typeof r] as number;
        if (typeof v === 'number' && Math.abs(got - v) > c.tolerance) {
          return { ok: false, error: `check "${c.label}": ${k} ${got} ≠ ${v}` };
        }
      }
    }
    return { ok: true, pack: p };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Compare "2026.07.1"-style versions. */
export function newerVersion(a: string, b: string) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

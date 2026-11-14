import type { Amount, Bracket, Jurisdiction, PhasedAmount, Prov, Reduction, TaxPack } from '../types';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const clamp0 = (n: number) => (n > 0 ? n : 0);

/** Tax on `income` with progressive brackets. */
export function bracketTax(brackets: Bracket[], income: number): number {
  if (income <= 0) return 0;
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const lo = brackets[i].from;
    const hi = i + 1 < brackets.length ? brackets[i + 1].from : Infinity;
    if (income <= lo) break;
    tax += (Math.min(income, hi) - lo) * brackets[i].rate;
  }
  return tax;
}

/**
 * Payroll-table form of bracket tax: rate × income − K, where K is the bracket constant rounded to whole
 * dollars the way the publisher does it (CRA T4127 rounds; Revenu Québec TP-1015.F drops the cents).
 */
export function constantTax(brackets: Bracket[], income: number, roundK: (n: number) => number): number {
  if (income <= 0) return 0;
  let i = 0;
  while (i + 1 < brackets.length && income >= brackets[i + 1].from) i++;
  const k = brackets[i].rate * brackets[i].from - bracketTax(brackets, brackets[i].from);
  return brackets[i].rate * income - roundK(k);
}

/** Marginal rate at `income`. */
export function marginalRate(brackets: Bracket[], income: number): number {
  let r = brackets[0].rate;
  for (const b of brackets) if (income >= b.from) r = b.rate;
  return r;
}

export function phased(a: PhasedAmount, netIncome: number): number {
  if (netIncome <= a.start) return a.max;
  if (netIncome >= a.end) return a.min;
  return a.max - ((a.max - a.min) * (netIncome - a.start)) / (a.end - a.start);
}

export function amountAt(a: Amount, netIncome: number): number {
  return typeof a === 'number' ? a : phased(a, netIncome);
}

/** Province values for the chosen mode: `payroll` applies the current T4127 edition's withholding overrides. */
export function provValues(pack: TaxPack, prov: Prov, mode: 'payroll' | 'annual') {
  const j: Jurisdiction = pack.jurisdictions[prov];
  const o = mode === 'payroll' ? j.payroll : undefined;
  const brackets = o?.brackets ?? j.brackets;
  const bpaRaw = o?.bpa ?? j.bpa;
  const bpa: Amount = bpaRaw === 'federal' ? pack.federal.bpa : bpaRaw;
  const reduction: Reduction | undefined = o?.reduction ?? j.reduction;
  return { j, brackets, bpa, reduction, lowest: brackets[0].rate };
}

/** Ontario Health Premium on taxable income. */
export function ontarioHealthPremium(pack: TaxPack, income: number): number {
  let prev = 0;
  for (const s of pack.ontarioHealthPremium) {
    if (income <= s.upTo) return Math.min(s.cap, s.base + s.rate * clamp0(income - prev));
    prev = s.upTo;
  }
  return 0;
}

/** Provincial surtax on basic provincial tax (Ontario). */
export function surtax(j: Jurisdiction, basic: number): number {
  if (!j.surtax) return 0;
  return j.surtax.reduce((s, t) => s + t.rate * clamp0(basic - t.threshold), 0);
}

/** Low-income provincial tax reduction. `tax` is the tax it can reduce (ON: basic + surtax). */
export function reductionAmount(r: Reduction | undefined, tax: number, netIncome: number, dependants = 0): number {
  if (!r || tax <= 0) return 0;
  if (r.kind === 'ON') return clamp0(Math.min(tax, 2 * (r.basic + r.perDependant * dependants) - tax));
  if (netIncome <= r.start) return Math.min(tax, r.max);
  if (netIncome >= r.end) return 0;
  return Math.min(tax, r.max - (r.max * (netIncome - r.start)) / (r.end - r.start));
}

export function provName(pack: TaxPack, prov: Prov, lang: 'en' | 'fr') {
  return pack.jurisdictions[prov].name[lang];
}

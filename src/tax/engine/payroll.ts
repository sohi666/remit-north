/**
 * Payroll source deductions, period by period, following CRA T4127 Option 1 (annualized) and, for Quebec
 * income tax, Revenu Québec TP-1015.F. Year-to-date tracking caps CPP/QPP, CPP2, EI and QPIP exactly as
 * payroll does, so the month the caps are reached shows smaller deductions.
 */
import type { Prov, TaxPack } from '../types';
import { amountAt, clamp0, constantTax, ontarioHealthPremium, provValues, reductionAmount, round2, surtax } from './common';

export const PAY_PERIODS = [52, 26, 24, 12, 1] as const;
export type Periods = (typeof PAY_PERIODS)[number] | number;

export interface PayrollInput {
  prov: Prov;
  grossPerPeriod: number;
  periods: Periods;
  /** Shareholder controlling more than 40% of voting shares (or other excluded employment): no EI. */
  eiExempt?: boolean;
  /** Employee receives a CPP/QPP retirement pension and elected out, or is under 18 / over 70. */
  pensionExempt?: boolean;
  /** Withholding mode: current T4127 edition (default) or the annual rates (tax-return basis). */
  mode?: 'payroll' | 'annual';
  /** Employer rate for workers' compensation (CNESST, WSIB, WorkSafeBC…), share of gross. */
  wcbRate?: number;
  /** Quebec HSF rate (default: services rate). */
  hsfRate?: number;
  /** Extra income tax the employee asked to withhold, per period. */
  extraTax?: number;
  /** Ontario tax reduction dependants. */
  dependants?: number;
  /** Total claim amount from the federal TD1 (default: basic personal amount). */
  federalClaim?: number;
  /** Total claim amount from the provincial TD1 or Quebec TP-1015.3 (default: basic personal amount). */
  provincialClaim?: number;
  /** Vacation pay accrued by the employer, share of gross (e.g. 0.04). */
  vacationRate?: number;
}

export interface Ytd {
  pension: number;
  pension2: number;
  pensionable: number;
  ei: number;
  qpip: number;
}

export const emptyYtd = (): Ytd => ({ pension: 0, pension2: 0, pensionable: 0, ei: 0, qpip: 0 });

export interface PeriodResult {
  gross: number;
  /** CPP or QPP (base + first additional). */
  pension: number;
  /** CPP2 / QPP2. */
  pension2: number;
  ei: number;
  qpip: number;
  federalTax: number;
  provincialTax: number;
  net: number;
  employer: { pension: number; pension2: number; ei: number; qpip: number; hsf: number; cnt: number; wcb: number; vacation: number; total: number };
  /** What the employer sends to each agency for this period. */
  remit: { cra: number; rq: number };
  totalCost: number;
}

export function pensionPlan(pack: TaxPack, prov: Prov) {
  return prov === 'QC' ? pack.qpp : pack.cpp;
}

export function maxPension(pack: TaxPack, prov: Prov) {
  const p = pensionPlan(pack, prov);
  return {
    total: round2(p.rate * (p.ympe - p.exemption)),
    base: round2(p.baseRate * (p.ympe - p.exemption)),
    second: round2(p.rate2 * (p.yampe - p.ympe)),
  };
}

export function eiRate(pack: TaxPack, prov: Prov) {
  return prov === 'QC' ? pack.ei.qcRate : pack.ei.rate;
}

export function maxEi(pack: TaxPack, prov: Prov) {
  return round2(eiRate(pack, prov) * pack.ei.mie);
}

export function maxQpip(pack: TaxPack) {
  return round2(pack.qpip.employee * pack.qpip.mie);
}

export function calcPeriod(pack: TaxPack, input: PayrollInput, ytd: Ytd = emptyYtd()): { result: PeriodResult; ytd: Ytd } {
  const { prov, periods: P } = input;
  const gross = clamp0(input.grossPerPeriod);
  const mode = input.mode ?? 'payroll';
  const plan = pensionPlan(pack, prov);
  const pmax = maxPension(pack, prov);
  const isQc = prov === 'QC';

  // CPP / QPP (base + first additional)
  let pension = 0;
  let pension2 = 0;
  if (!input.pensionExempt) {
    pension = round2(clamp0(Math.min(pmax.total - ytd.pension, plan.rate * (gross - plan.exemption / P))));
    // CPP2 / QPP2 on pensionable earnings between YMPE and YAMPE
    const from = Math.max(ytd.pensionable, plan.ympe);
    const to = Math.min(ytd.pensionable + gross, plan.yampe);
    pension2 = round2(clamp0(Math.min(pmax.second - ytd.pension2, plan.rate2 * (to - from))));
  }

  const eiMax = maxEi(pack, prov);
  const ei = input.eiExempt ? 0 : round2(clamp0(Math.min(eiMax - ytd.ei, eiRate(pack, prov) * Math.min(gross, pack.ei.mie))));
  const qpipMax = maxQpip(pack);
  const qpip = isQc ? round2(clamp0(Math.min(qpipMax - ytd.qpip, pack.qpip.employee * gross))) : 0;

  const next: Ytd = {
    pension: ytd.pension + pension,
    pension2: ytd.pension2 + pension2,
    pensionable: ytd.pensionable + gross,
    ei: ytd.ei + ei,
    qpip: ytd.qpip + qpip,
  };

  // Enhanced (first additional) and second additional contributions are deducted from income (F5).
  const f5 = pension * ((plan.rate - plan.baseRate) / plan.rate) + pension2;
  const A = clamp0(P * (gross - f5));

  // Annual credit bases: once a maximum is reached, the annual maximum is used.
  const pensionCreditBase = pension === 0 && ytd.pension === 0
    ? 0
    : next.pension >= pmax.total - 0.005
      ? pmax.base
      : Math.min(P * pension * (plan.baseRate / plan.rate), pmax.base);
  const eiCreditBase = ei === 0 && ytd.ei === 0 ? 0 : next.ei >= eiMax - 0.005 ? eiMax : Math.min(P * ei, eiMax);
  const qpipCreditBase = !isQc || (qpip === 0 && ytd.qpip === 0) ? 0 : next.qpip >= qpipMax - 0.005 ? qpipMax : Math.min(P * qpip, qpipMax);

  // Federal
  const fed = pack.federal;
  const fLow = fed.brackets[0].rate;
  const k1 = fLow * (input.federalClaim ?? amountAt(fed.bpa, A));
  const k2 = fLow * (pensionCreditBase + eiCreditBase + qpipCreditBase);
  const k4 = Math.min(fLow * A, fLow * fed.cea);
  let t3 = clamp0(constantTax(fed.brackets, A, Math.round) - k1 - k2 - k4);
  if (isQc) t3 = t3 - fed.qcAbatement * t3;
  const federalTax = round2(t3 / P + (input.extraTax ?? 0));

  // Provincial
  let provAnnual: number;
  if (isQc) {
    const q = pack.quebec;
    const workDeduction = Math.min(q.employmentDeduction.rate * P * gross, q.employmentDeduction.max);
    const I = clamp0(A - workDeduction);
    const { brackets, bpa } = provValues(pack, prov, mode);
    // TP-1015.F uses whole-dollar bracket constants (K = 2,717, 8,151, 10,465 for 2026).
    provAnnual = clamp0(constantTax(brackets, I, Math.floor) - brackets[0].rate * (input.provincialClaim ?? amountAt(bpa, I)));
  } else {
    const { j, brackets, bpa, reduction, lowest } = provValues(pack, prov, mode);
    const k1p = lowest * (input.provincialClaim ?? amountAt(bpa, A));
    const k2p = lowest * (pensionCreditBase + eiCreditBase);
    const k4p = j.cea ? Math.min(lowest * A, lowest * j.cea) : 0;
    const k5p = j.supplementalCredit ? clamp0((k1p + k2p - j.supplementalCredit.threshold) * j.supplementalCredit.rate) : 0;
    const t4 = clamp0(constantTax(brackets, A, Math.round) - k1p - k2p - k4p - k5p);
    const v1 = surtax(j, t4);
    const v2 = j.healthPremium === 'ON' ? ontarioHealthPremium(pack, A) : 0;
    const s = reductionAmount(reduction, t4 + (reduction?.kind === 'ON' ? v1 : 0), A, input.dependants ?? 0);
    provAnnual = clamp0(t4 + v1 - s) + v2;
  }
  const provincialTax = round2(provAnnual / P);

  // Employer side
  const erPension = pension;
  const erPension2 = pension2;
  const erEi = round2(ei * pack.ei.employerFactor);
  const erQpip = isQc ? round2(clamp0(Math.min(pack.qpip.employer * pack.qpip.mie - ytd.qpip * (pack.qpip.employer / pack.qpip.employee), pack.qpip.employer * gross))) : 0;
  const hsf = isQc ? round2((input.hsfRate ?? pack.quebec.hsf.services) * gross) : 0;
  const cnt = isQc ? round2(pack.quebec.cnt.rate * clamp0(Math.min(gross, pack.quebec.cnt.max - ytd.pensionable))) : 0;
  const wcb = round2((input.wcbRate ?? 0) * gross);
  const vacation = round2((input.vacationRate ?? 0) * gross);
  const erTotal = round2(erPension + erPension2 + erEi + erQpip + hsf + cnt + wcb + vacation);

  const net = round2(gross - pension - pension2 - ei - qpip - federalTax - provincialTax);
  const remit = isQc
    ? { cra: round2(federalTax + ei + erEi), rq: round2(provincialTax + 2 * (pension + pension2) + qpip + erQpip + hsf) }
    : { cra: round2(federalTax + provincialTax + 2 * (pension + pension2) + ei + erEi), rq: 0 };

  return {
    result: {
      gross,
      pension,
      pension2,
      ei,
      qpip,
      federalTax,
      provincialTax,
      net,
      employer: { pension: erPension, pension2: erPension2, ei: erEi, qpip: erQpip, hsf, cnt, wcb, vacation, total: erTotal },
      remit,
      totalCost: round2(gross + erTotal),
    },
    ytd: next,
  };
}

export interface YearResult {
  periods: PeriodResult[];
  first: PeriodResult;
  totals: PeriodResult;
}

const sumKeys = ['gross', 'pension', 'pension2', 'ei', 'qpip', 'federalTax', 'provincialTax', 'net', 'totalCost'] as const;

/** Runs a whole year of identical pay periods with year-to-date caps. */
export function calcYear(pack: TaxPack, input: PayrollInput): YearResult {
  let ytd = emptyYtd();
  const periods: PeriodResult[] = [];
  const n = Math.max(1, Math.round(input.periods));
  for (let i = 0; i < n; i++) {
    const r = calcPeriod(pack, input, ytd);
    periods.push(r.result);
    ytd = r.ytd;
  }
  const totals: PeriodResult = JSON.parse(JSON.stringify(periods[0]));
  for (const k of sumKeys) totals[k] = round2(periods.reduce((s, p) => s + p[k], 0));
  for (const k of Object.keys(totals.employer) as (keyof PeriodResult['employer'])[]) {
    totals.employer[k] = round2(periods.reduce((s, p) => s + p.employer[k], 0));
  }
  totals.remit = {
    cra: round2(periods.reduce((s, p) => s + p.remit.cra, 0)),
    rq: round2(periods.reduce((s, p) => s + p.remit.rq, 0)),
  };
  return { periods, first: periods[0], totals };
}

/** Gross pay per period needed to take home `netTarget` per period (first-period basis). */
export function grossForNet(pack: TaxPack, input: Omit<PayrollInput, 'grossPerPeriod'>, netTarget: number): number {
  let lo = netTarget;
  let hi = netTarget * 3 + 1000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const net = calcPeriod(pack, { ...input, grossPerPeriod: mid }).result.net;
    if (net < netTarget) lo = mid;
    else hi = mid;
  }
  return round2(hi);
}

import { describe, expect, it } from 'vitest';
import pack2026 from '../src/tax/packs/2026.json';
import type { TaxPack } from '../src/tax/types';
import { PROVINCES } from '../src/tax/types';
import { calcPeriod, calcYear, grossForNet, maxPension } from '../src/tax/engine/payroll';
import { personalTax } from '../src/tax/engine/personal';
import { salesTax } from '../src/tax/engine/sales';
import { corporateTax } from '../src/tax/engine/corporate';
import { ownerPayCurve } from '../src/tax/engine/ownerPay';
import { newerVersion, validatePack } from '../src/tax/validate';
import { bracketTax } from '../src/tax/engine/common';

const pack = pack2026 as unknown as TaxPack;

describe('tax pack', () => {
  it('bundled pack validates and passes its reference checks', () => {
    const v = validatePack(pack);
    expect(v.ok, v.ok ? '' : v.error).toBe(true);
  });
  it('rejects a broken pack', () => {
    const bad = JSON.parse(JSON.stringify(pack));
    bad.jurisdictions.ON.brackets[1].from = -5;
    expect(validatePack(bad).ok).toBe(false);
    const wrong = JSON.parse(JSON.stringify(pack));
    wrong.qpp.rate = 0.05;
    expect(validatePack(wrong).ok).toBe(false);
  });
  it('compares versions', () => {
    expect(newerVersion('2026.07.2', '2026.07.1')).toBe(true);
    expect(newerVersion('2027.01.1', '2026.07.9')).toBe(true);
    expect(newerVersion('2026.07.1', '2026.07.1')).toBe(false);
  });
  it('federal bracket constants match T4127 K values', () => {
    // K = tax at the start of each bracket computed with the bracket's own rate minus actual tax.
    const b = pack.federal.brackets;
    const ks = b.map((x) => x.rate * x.from - bracketTax(b, x.from));
    expect(ks.map(Math.round)).toEqual([0, 3804, 10241, 15685, 26024]);
  });
});

describe('Quebec payroll matches impot.net (2026 tables)', () => {
  it('every reference case in the pack matches to within 2 cents', () => {
    for (const c of pack.checks) {
      const r = calcPeriod(pack, { prov: c.prov, grossPerPeriod: c.grossPerPeriod, periods: c.periods, eiExempt: c.eiExempt }).result;
      for (const [k, v] of Object.entries(c.expect)) expect(Math.abs((r as never)[k] - (v as number)), `${c.label} ${k}`).toBeLessThanOrEqual(0.02);
    }
    expect(pack.checks.length).toBeGreaterThanOrEqual(7);
  });
});

describe('Quebec payroll (impot.net reference, $9,000 monthly)', () => {
  const r = calcPeriod(pack, { prov: 'QC', grossPerPeriod: 9000, periods: 12 }).result;
  it('matches impot.net and splits remittances between the CRA and Revenu Québec', () => {
    expect(r.pension).toBeCloseTo(548.63, 2);
    expect(r.ei).toBeCloseTo(117, 2);
    expect(r.qpip).toBeCloseTo(38.7, 2);
    expect(r.provincialTax).toBeCloseTo(1222.97, 2);
    expect(r.federalTax).toBeCloseTo(1036.33, 2);
    expect(r.employer.hsf).toBeCloseTo(9000 * 0.0165, 2);
    expect(r.remit.cra).toBeCloseTo(r.federalTax + r.ei + r.employer.ei, 2);
    expect(r.remit.rq).toBeCloseTo(r.provincialTax + 2 * r.pension + r.qpip + r.employer.qpip + r.employer.hsf, 2);
  });
  it('caps QPP in December and adds QPP2', () => {
    const y = calcYear(pack, { prov: 'QC', grossPerPeriod: 7500, periods: 12, eiExempt: true });
    expect(y.totals.pension).toBeCloseTo(maxPension(pack, 'QC').total, 1);
    expect(y.totals.pension2).toBeCloseTo(0.04 * (85000 - 74600), 1);
    expect(y.periods[11].pension).toBeLessThan(y.periods[0].pension);
  });
});

describe('payroll across provinces', () => {
  it('every province produces sane deductions at $5,000/month', () => {
    for (const prov of PROVINCES) {
      const r = calcPeriod(pack, { prov, grossPerPeriod: 5000, periods: 12 }).result;
      expect(r.federalTax, prov).toBeGreaterThan(200);
      expect(r.federalTax, prov).toBeLessThan(700);
      expect(r.provincialTax, prov).toBeGreaterThan(prov === 'NU' ? 50 : 100);
      expect(r.provincialTax, prov).toBeLessThan(800);
      expect(r.net, prov).toBeGreaterThan(3200);
      expect(r.net, prov).toBeLessThan(4300);
    }
  });
  it('EI opt-out removes employee and employer EI', () => {
    const a = calcPeriod(pack, { prov: 'ON', grossPerPeriod: 4000, periods: 26 }).result;
    const b = calcPeriod(pack, { prov: 'ON', grossPerPeriod: 4000, periods: 26, eiExempt: true }).result;
    expect(a.ei).toBeCloseTo(65.2, 1);
    expect(a.employer.ei).toBeCloseTo(91.28, 1);
    expect(b.ei).toBe(0);
    expect(b.employer.ei).toBe(0);
    expect(b.net).toBeGreaterThan(a.net);
  });
  it('annual CPP and EI never exceed the maximums', () => {
    const y = calcYear(pack, { prov: 'AB', grossPerPeriod: 9000, periods: 26 });
    expect(y.totals.pension).toBeLessThanOrEqual(4230.45 + 0.01);
    expect(y.totals.ei).toBeLessThanOrEqual(1123.07 + 0.01);
    expect(y.totals.pension2).toBeLessThanOrEqual(416 + 0.01);
  });
  it('low incomes pay no income tax', () => {
    const r = calcPeriod(pack, { prov: 'ON', grossPerPeriod: 1000, periods: 12 }).result;
    expect(r.federalTax).toBe(0);
    expect(r.provincialTax).toBe(0);
  });
  it('Ontario health premium and surtax apply at higher pay', () => {
    const r = calcPeriod(pack, { prov: 'ON', grossPerPeriod: 15000, periods: 12 }).result;
    const annual = calcPeriod(pack, { prov: 'ON', grossPerPeriod: 15000, periods: 12, mode: 'annual' }).result;
    expect(r.provincialTax).toBeGreaterThan(1000);
    expect(r.provincialTax).toBe(annual.provincialTax);
  });
  it('BC July edition withholds more than the annual rate', () => {
    const pay = calcPeriod(pack, { prov: 'BC', grossPerPeriod: 4000, periods: 12 }).result;
    const ann = calcPeriod(pack, { prov: 'BC', grossPerPeriod: 4000, periods: 12, mode: 'annual' }).result;
    expect(pay.provincialTax).toBeGreaterThan(ann.provincialTax);
  });
  it('reverse calculator finds the gross for a net target', () => {
    const g = grossForNet(pack, { prov: 'QC', periods: 12, eiExempt: true }, 4500);
    expect(calcPeriod(pack, { prov: 'QC', grossPerPeriod: g, periods: 12, eiExempt: true }).result.net).toBeCloseTo(4500, 0);
  });
});

describe('personal annual tax', () => {
  it('annual tax is close to 12 months of withholding', () => {
    for (const prov of ['ON', 'QC', 'AB'] as const) {
      const y = calcYear(pack, { prov, grossPerPeriod: 6000, periods: 12, mode: 'annual' });
      const p = personalTax(pack, { prov, salary: 72000 });
      const withheld = y.totals.federalTax + y.totals.provincialTax;
      expect(Math.abs(p.totalTax - withheld), prov).toBeLessThan(150);
    }
  });
  it('non-eligible dividends are taxed less than the same salary', () => {
    const sal = personalTax(pack, { prov: 'ON', salary: 60000 });
    const div = personalTax(pack, { prov: 'ON', salary: 0, nonEligibleDividends: 60000 });
    expect(div.totalTax).toBeLessThan(sal.totalTax);
    expect(div.pension).toBe(0);
  });
});

describe('sales tax', () => {
  it('Quebec Quick Method: 3.6% GST and 6.6% QST on tax-included sales', () => {
    // $50,000 of services after the annual $30,000 credit is used: tax-included sales $57,487.50
    const r = salesTax(pack, { prov: 'QC', sales: 50000, taxablePurchases: 0, activity: 'services', priorTaxIncludedSales: 90000 });
    expect(r.taxIncludedSales).toBeCloseTo(57487.5, 2);
    expect(r.federal.quick).toBeCloseTo(2069.55, 2);
    expect(r.qst!.quick).toBeCloseTo(3794.18, 2);
    expect(r.quickGain).toBeCloseTo(2500 + 4987.5 - 2069.55 - 3794.18, 1);
  });
  it('applies the 1% credit on the first $30,000', () => {
    const r = salesTax(pack, { prov: 'ON', sales: 100000, taxablePurchases: 0, activity: 'services' });
    expect(r.federal.quick).toBeCloseTo(113000 * 0.088 - 300, 2);
    expect(r.federal.regular).toBeCloseTo(13000, 2);
  });
  it('PST is collected separately', () => {
    const r = salesTax(pack, { prov: 'BC', sales: 10000, taxablePurchases: 2000, activity: 'goods' });
    expect(r.pstCollected).toBe(700);
    expect(r.federal.regular).toBe(400);
    expect(r.taxIncludedSales).toBe(10500);
  });
});

describe('corporate tax', () => {
  it('Quebec: no small business rate under 5,000 paid hours', () => {
    const r = corporateTax(pack, { prov: 'QC', revenue: 80000, expenses: 0, payrollCost: 0, quebecHours: 0 });
    expect(r.federalTax).toBeCloseTo(7200, 2);
    expect(r.provincialTax).toBeCloseTo(9200, 2);
    const full = corporateTax(pack, { prov: 'QC', revenue: 80000, expenses: 0, payrollCost: 0, quebecHours: 6000 });
    expect(full.provincialTax).toBeCloseTo(80000 * 0.032, 2);
  });
  it('splits income above the business limit', () => {
    const r = corporateTax(pack, { prov: 'ON', revenue: 700000, expenses: 0, payrollCost: 0 });
    expect(r.smallPortion).toBe(500000);
    expect(r.federalTax).toBeCloseTo(500000 * 0.09 + 200000 * 0.15, 2);
  });
  it('personal services business loses the small business rate', () => {
    const r = corporateTax(pack, { prov: 'AB', revenue: 100000, expenses: 0, payrollCost: 0, psb: true });
    expect(r.totalTax).toBeCloseTo(100000 * (0.33 + 0.08), 2);
  });
});

describe('owner pay', () => {
  it('the optimum is at least as good as all-salary or all-dividends', () => {
    for (const prov of ['QC', 'ON', 'BC'] as const) {
      const c = ownerPayCurve(pack, { prov, profit: 150000, eiExempt: true });
      expect(c.best.cash).toBeGreaterThanOrEqual(c.allSalary.cash - 1);
      expect(c.best.cash).toBeGreaterThanOrEqual(c.allDividends.cash - 1);
      expect(c.best.cash).toBeLessThan(150000);
      expect(c.allSalary.salary + c.allSalary.employerCost).toBeCloseTo(150000, 0);
    }
  });
});

describe('payroll options', () => {
  it('TD1 claim amounts change withholding', () => {
    const base = calcPeriod(pack, { prov: 'ON', grossPerPeriod: 5000, periods: 12 }).result;
    const more = calcPeriod(pack, { prov: 'ON', grossPerPeriod: 5000, periods: 12, federalClaim: 30000, provincialClaim: 25000 }).result;
    expect(more.federalTax).toBeLessThan(base.federalTax);
    expect(more.provincialTax).toBeLessThan(base.provincialTax);
    const qc = calcPeriod(pack, { prov: 'QC', grossPerPeriod: 5000, periods: 12, provincialClaim: 18952 }).result;
    expect(qc.provincialTax).toBe(calcPeriod(pack, { prov: 'QC', grossPerPeriod: 5000, periods: 12 }).result.provincialTax);
  });
  it('year-to-date amounts cap the current pay', () => {
    const r = calcPeriod(pack, { prov: 'QC', grossPerPeriod: 8000, periods: 12 }, { pension: 4400, pension2: 0, pensionable: 72000, ei: 895.7, qpip: 0 }).result;
    expect(r.pension).toBeCloseTo(4479.3 - 4400, 2);
    expect(r.ei).toBe(0);
    expect(r.pension2).toBeCloseTo(0.04 * (80000 - 74600), 2);
  });
  it('53 weekly pays and vacation accrual', () => {
    const w = calcYear(pack, { prov: 'AB', grossPerPeriod: 1000, periods: 53, vacationRate: 0.04 });
    expect(w.periods.length).toBe(53);
    expect(w.first.employer.vacation).toBe(40);
    expect(w.first.totalCost).toBeCloseTo(1000 + w.first.employer.total, 2);
  });
});

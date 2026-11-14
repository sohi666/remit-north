/**
 * Salary vs dividends for an owner-manager: the corporation's profit before owner pay is either paid as
 * salary (deductible, with payroll contributions) or taxed in the corporation and paid out as non-eligible
 * dividends. Finds the mix with the most cash in the owner's hands this year.
 */
import type { Prov, TaxPack } from '../types';
import { clamp0, round2 } from './common';
import { corporateTax } from './corporate';
import { calcYear } from './payroll';
import { personalTax } from './personal';

export interface OwnerPayInput {
  prov: Prov;
  /** Corporate profit available before paying the owner. */
  profit: number;
  eiExempt?: boolean;
  psb?: boolean;
  quebecHours?: number;
  /** Cash the owner wants paid out this year; the rest stays in the company. Default: everything. */
  payoutAll?: boolean;
}

export interface OwnerPayPoint {
  salary: number;
  employerCost: number;
  corpTax: number;
  dividends: number;
  personalTax: number;
  contributions: number;
  /** CPP/QPP the owner and the company paid (builds the public pension). */
  pensionPaid: number;
  cash: number;
  /** Total tax and contributions as a share of profit. */
  burden: number;
  rrspRoom: number;
}

export function ownerPayPoint(pack: TaxPack, input: OwnerPayInput, salary: number): OwnerPayPoint {
  const { prov, profit } = input;
  const year = calcYear(pack, { prov, grossPerPeriod: salary / 12, periods: 12, eiExempt: input.eiExempt, mode: 'annual' });
  let s = salary;
  let employer = year.totals.employer.total;
  // Salary can't cost more than the profit available.
  if (s + employer > profit) {
    const scale = profit / (s + employer || 1);
    s = s * scale;
    employer = profit - s;
  }
  const corp = corporateTax(pack, { prov, revenue: profit, expenses: 0, payrollCost: s + employer, psb: input.psb, quebecHours: input.quebecHours });
  const dividends = clamp0(corp.afterTax);
  const p = personalTax(pack, { prov, salary: s, nonEligibleDividends: dividends, eiExempt: input.eiExempt });
  const contributions = p.pension + p.pension2 + p.ei + p.qpip;
  const cash = s + dividends - p.totalTax - contributions;
  return {
    salary: round2(s),
    employerCost: round2(employer),
    corpTax: corp.totalTax,
    dividends: round2(dividends),
    personalTax: p.totalTax,
    contributions: round2(contributions),
    pensionPaid: round2(2 * (p.pension + p.pension2)),
    cash: round2(cash),
    burden: profit > 0 ? (profit - cash) / profit : 0,
    rrspRoom: round2(0.18 * s),
  };
}

export function ownerPayCurve(pack: TaxPack, input: OwnerPayInput, steps = 40) {
  const pts: OwnerPayPoint[] = [];
  const maxSalary = input.profit;
  for (let i = 0; i <= steps; i++) pts.push(ownerPayPoint(pack, input, (maxSalary * i) / steps));
  let best = pts[0];
  for (const p of pts) if (p.cash > best.cash + 0.5) best = p;
  // Refine around the best step.
  const span = maxSalary / steps;
  for (let k = -10; k <= 10; k++) {
    const sal = clamp0(best.salary + (span * k) / 10);
    const p = ownerPayPoint(pack, input, sal);
    if (p.cash > best.cash + 0.5) best = p;
  }
  // Useful anchor: salary up to the YMPE (maximizes CPP/QPP and RRSP room without CPP2).
  const plan = input.prov === 'QC' ? pack.qpp : pack.cpp;
  const ympe = ownerPayPoint(pack, input, Math.min(plan.ympe, maxSalary));
  return { points: pts, best, allSalary: pts[pts.length - 1], allDividends: pts[0], ympe };
}

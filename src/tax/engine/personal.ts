/** Annual personal income tax (tax-return basis) for salary, non-eligible dividends and other income. */
import type { Prov, TaxPack } from '../types';
import { amountAt, bracketTax, clamp0, marginalRate, ontarioHealthPremium, provValues, reductionAmount, round2, surtax } from './common';
import { eiRate, maxEi, maxPension, maxQpip, pensionPlan } from './payroll';

export interface PersonalInput {
  prov: Prov;
  salary: number;
  nonEligibleDividends?: number;
  otherIncome?: number;
  rrspDeduction?: number;
  eiExempt?: boolean;
  dependants?: number;
}

export interface PersonalResult {
  pension: number;
  pension2: number;
  ei: number;
  qpip: number;
  netIncome: number;
  federalTax: number;
  provincialTax: number;
  totalTax: number;
  afterTax: number;
  averageRate: number;
  marginalSalaryRate: number;
}

function contributions(pack: TaxPack, prov: Prov, salary: number, eiExempt?: boolean) {
  const plan = pensionPlan(pack, prov);
  const m = maxPension(pack, prov);
  const pension = Math.min(m.total, clamp0(plan.rate * (Math.min(salary, plan.ympe) - plan.exemption)));
  const pension2 = Math.min(m.second, clamp0(plan.rate2 * (Math.min(salary, plan.yampe) - plan.ympe)));
  const ei = eiExempt ? 0 : Math.min(maxEi(pack, prov), eiRate(pack, prov) * salary);
  const qpip = prov === 'QC' ? Math.min(maxQpip(pack), pack.qpip.employee * salary) : 0;
  const enhanced = pension * ((plan.rate - plan.baseRate) / plan.rate) + pension2;
  const baseCredit = pension - pension * ((plan.rate - plan.baseRate) / plan.rate);
  return { pension, pension2, ei, qpip, enhanced, baseCredit };
}

function taxOnly(pack: TaxPack, input: PersonalInput) {
  const { prov } = input;
  const salary = clamp0(input.salary);
  const div = clamp0(input.nonEligibleDividends ?? 0);
  const grossedUp = div * (1 + pack.federal.grossUpNonEligible);
  const c = contributions(pack, prov, salary, input.eiExempt);
  const netIncome = clamp0(salary + grossedUp + (input.otherIncome ?? 0) - c.enhanced - (input.rrspDeduction ?? 0));

  // Federal
  const fed = pack.federal;
  const fLow = fed.brackets[0].rate;
  const credits = fLow * (amountAt(fed.bpa, netIncome) + c.baseCredit + c.ei + c.qpip + Math.min(salary, fed.cea));
  let federal = clamp0(bracketTax(fed.brackets, netIncome) - credits - fed.dtcNonEligible * grossedUp);
  if (prov === 'QC') federal -= fed.qcAbatement * federal;

  // Provincial
  const { j, brackets, bpa, reduction, lowest } = provValues(pack, prov, 'annual');
  let provincial: number;
  if (prov === 'QC') {
    const work = Math.min(pack.quebec.employmentDeduction.rate * salary, pack.quebec.employmentDeduction.max);
    const qcIncome = clamp0(netIncome - work);
    provincial = clamp0(bracketTax(brackets, qcIncome) - lowest * amountAt(bpa, qcIncome) - j.dtcNonEligible * grossedUp);
  } else {
    const k1 = lowest * amountAt(bpa, netIncome);
    const k2 = lowest * (c.baseCredit + c.ei);
    const k4 = j.cea ? lowest * Math.min(salary, j.cea) : 0;
    const k5 = j.supplementalCredit ? clamp0((k1 + k2 - j.supplementalCredit.threshold) * j.supplementalCredit.rate) : 0;
    const basic = clamp0(bracketTax(brackets, netIncome) - k1 - k2 - k4 - k5 - j.dtcNonEligible * grossedUp);
    const v1 = surtax(j, basic);
    const s = reductionAmount(reduction, basic + (reduction?.kind === 'ON' ? v1 : 0), netIncome, input.dependants ?? 0);
    const premium = j.healthPremium === 'ON' ? ontarioHealthPremium(pack, netIncome) : 0;
    provincial = clamp0(basic + v1 - s) + premium;
  }
  return { c, netIncome, federal, provincial };
}

export function personalTax(pack: TaxPack, input: PersonalInput): PersonalResult {
  const t = taxOnly(pack, input);
  const total = t.federal + t.provincial;
  const cash = clamp0(input.salary) + clamp0(input.nonEligibleDividends ?? 0) + (input.otherIncome ?? 0);
  const afterTax = cash - total - t.c.pension - t.c.pension2 - t.c.ei - t.c.qpip;
  const bump = taxOnly(pack, { ...input, salary: clamp0(input.salary) + 100 });
  const marginal = (bump.federal + bump.provincial - total) / 100;
  return {
    pension: round2(t.c.pension),
    pension2: round2(t.c.pension2),
    ei: round2(t.c.ei),
    qpip: round2(t.c.qpip),
    netIncome: round2(t.netIncome),
    federalTax: round2(t.federal),
    provincialTax: round2(t.provincial),
    totalTax: round2(total),
    afterTax: round2(afterTax),
    averageRate: cash > 0 ? total / cash : 0,
    marginalSalaryRate: marginal,
  };
}

/** Combined statutory marginal rate on ordinary income (brackets only, no credits), for display. */
export function topMarginal(pack: TaxPack, prov: Prov, income: number) {
  const fed = marginalRate(pack.federal.brackets, income) * (prov === 'QC' ? 1 - pack.federal.qcAbatement : 1);
  return fed + marginalRate(pack.jurisdictions[prov].brackets, income);
}

/** CCPC corporate income tax on active business income, plus instalment guidance. */
import type { Prov, TaxPack } from '../types';
import { clamp0, round2 } from './common';

export interface CorporateInput {
  prov: Prov;
  revenue: number;
  /** All deductible expenses other than owner pay (rent, software, phone, vehicle, meals at 50%…). */
  expenses: number;
  /** Salaries paid, including the employer's share of payroll contributions. */
  payrollCost: number;
  /** Quick Method gain on GST/HST/QST (taxable income). */
  otherIncome?: number;
  /** Personal services business (incorporated employee): no small business deduction, extra 5% federal. */
  psb?: boolean;
  /** Quebec: paid hours of employees in the year (for the Quebec small business deduction). */
  quebecHours?: number;
  /** Override of the provincial small business rate (e.g. a fiscal year straddling a change). */
  provSmallOverride?: number;
  /** Business limit share (associated corporations, short years). */
  limitShare?: number;
}

export interface CorporateResult {
  netIncome: number;
  smallPortion: number;
  generalPortion: number;
  federalTax: number;
  provincialTax: number;
  totalTax: number;
  effectiveRate: number;
  afterTax: number;
  federalRate: { small: number; general: number };
  provincialRate: { small: number; general: number };
  instalments: { required: boolean; monthly: number; quarterly: number };
  quebecSbdShare: number;
}

export function corporateTax(pack: TaxPack, input: CorporateInput): CorporateResult {
  const f = pack.federal.corp;
  const p = pack.jurisdictions[input.prov].corp;
  const netIncome = round2(input.revenue + (input.otherIncome ?? 0) - input.expenses - input.payrollCost);
  const taxable = clamp0(netIncome);
  const limit = Math.min(f.limit, p.limit) * (input.limitShare ?? 1);
  const fedLimit = f.limit * (input.limitShare ?? 1);
  const provLimit = p.limit * (input.limitShare ?? 1);

  let quebecSbdShare = 1;
  if (input.prov === 'QC') {
    const h = input.quebecHours ?? pack.quebec.sbdHours.full;
    const { full, none } = pack.quebec.sbdHours;
    quebecSbdShare = h >= full ? 1 : h <= none ? 0 : (h - none) / (full - none);
  }

  const provSmall = input.provSmallOverride ?? p.small;
  let federalTax: number;
  let provincialTax: number;
  let smallPortion: number;
  if (input.psb) {
    smallPortion = 0;
    federalTax = taxable * f.psb;
    provincialTax = taxable * p.general;
  } else {
    smallPortion = Math.min(taxable, limit);
    const fedSmall = Math.min(taxable, fedLimit);
    federalTax = fedSmall * f.small + (taxable - fedSmall) * f.general;
    const provSmallBase = Math.min(taxable, provLimit);
    const provSmallRate = provSmall * quebecSbdShare + p.general * (1 - quebecSbdShare);
    provincialTax = provSmallBase * provSmallRate + (taxable - provSmallBase) * p.general;
  }
  const totalTax = federalTax + provincialTax;
  return {
    netIncome,
    smallPortion: round2(smallPortion),
    generalPortion: round2(taxable - smallPortion),
    federalTax: round2(federalTax),
    provincialTax: round2(provincialTax),
    totalTax: round2(totalTax),
    effectiveRate: taxable > 0 ? totalTax / taxable : 0,
    afterTax: round2(netIncome - totalTax),
    federalRate: { small: input.psb ? f.psb : f.small, general: input.psb ? f.psb : f.general },
    provincialRate: { small: input.psb ? p.general : provSmall * quebecSbdShare + p.general * (1 - quebecSbdShare), general: p.general },
    // Instalments are not required when the tax for the year (or the prior year) is $3,000 or less.
    instalments: { required: totalTax > 3000, monthly: round2(totalTax / 12), quarterly: round2(totalTax / 4) },
    quebecSbdShare,
  };
}

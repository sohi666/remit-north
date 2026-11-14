/** Tax pack: every rate and threshold the engine uses for one tax year. Shipped in the app and refreshable online. */

export const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'] as const;
export type Prov = (typeof PROVINCES)[number];

export const PACK_SCHEMA = 1;

/** Progressive bracket: `rate` applies from `from` up to the next bracket's `from`. */
export interface Bracket {
  from: number;
  rate: number;
}

/** An amount that falls linearly from `max` to `min` as net income goes from `start` to `end`. */
export interface PhasedAmount {
  max: number;
  min: number;
  start: number;
  end: number;
}

export type Amount = number | PhasedAmount;

export type Reduction =
  /** Ontario tax reduction: 2 × (basic + dependants) − tax, capped at tax. */
  | { kind: 'ON'; basic: number; perDependant: number }
  /** BC tax reduction: `max`, phased out linearly from `start` to `end` of net income. */
  | { kind: 'BC'; max: number; start: number; end: number };

export interface SalesTax {
  kind: 'GST' | 'HST' | 'GST_PST' | 'GST_QST';
  /** Combined HST rate (HST provinces only). */
  hst?: number;
  /** Provincial sales tax (PST/RST, QST). */
  pst?: number;
  pstName?: string;
  /** Quick Method remittance rates for GST/HST, on tax-included sales. */
  quick: { services: number; goods: number };
  /** Quebec: QST Quick Method rates. */
  quickPst?: { services: number; goods: number };
}

export interface CorpRates {
  small: number;
  general: number;
  limit: number;
  note?: string;
}

export interface Jurisdiction {
  name: { en: string; fr: string };
  /** Annual (tax-return) brackets. */
  brackets: Bracket[];
  /** Basic personal amount, or "federal" to reuse the federal phased amount (Yukon). */
  bpa: Amount | 'federal';
  surtax?: { threshold: number; rate: number }[];
  healthPremium?: 'ON';
  reduction?: Reduction;
  /** Territorial Canada employment amount (Yukon). */
  cea?: number;
  /** Alberta supplemental credit: (credits − threshold) × rate. */
  supplementalCredit?: { threshold: number; rate: number };
  /** Non-eligible (small business) dividend tax credit, as a share of the grossed-up dividend. */
  dtcNonEligible: number;
  corp: CorpRates;
  sales: SalesTax;
  /**
   * Payroll withholding values for the current T4127 edition, when they differ from the annual figures
   * (mid-year rate changes are prorated over the remaining pay periods).
   */
  payroll?: { brackets?: Bracket[]; bpa?: Amount; reduction?: Reduction; editionNote?: string };
}

export interface PensionPlan {
  ympe: number;
  exemption: number;
  rate: number;
  baseRate: number;
  yampe: number;
  rate2: number;
}

export interface TaxPack {
  schema: number;
  year: number;
  /** Monotonic version, e.g. "2026.07.1". */
  version: string;
  issued: string;
  editions: { cra: string; rq: string };
  sources: { label: string; url: string }[];
  federal: {
    brackets: Bracket[];
    bpa: PhasedAmount;
    cea: number;
    qcAbatement: number;
    grossUpNonEligible: number;
    dtcNonEligible: number;
    corp: CorpRates & { psb: number };
  };
  cpp: PensionPlan;
  qpp: PensionPlan;
  ei: { mie: number; rate: number; qcRate: number; employerFactor: number };
  qpip: { mie: number; employee: number; employer: number };
  quebec: {
    employmentDeduction: { rate: number; max: number };
    hsf: { services: number; primaryManufacturing: number; payrollCeiling: number };
    cnt: { rate: number; max: number };
    /** Paid hours needed for the full Quebec small business deduction (none below `none`). */
    sbdHours: { full: number; none: number };
  };
  ontarioHealthPremium: { upTo: number; base: number; rate: number; cap: number }[];
  quickMethod: { creditRate: number; creditOn: number; maxSales: number };
  jurisdictions: Record<Prov, Jurisdiction>;
  /** Reference results the app checks before trusting a downloaded pack. */
  checks: PackCheck[];
}

export interface PackCheck {
  label: string;
  prov: Prov;
  grossPerPeriod: number;
  periods: number;
  eiExempt?: boolean;
  /** Expected first-period values (employee side). */
  expect: Partial<Record<'pension' | 'ei' | 'qpip' | 'federalTax' | 'provincialTax', number>>;
  tolerance: number;
}

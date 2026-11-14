/**
 * Investment (rental) property: annual rental income and tax, the tax on a sale (capital gain, CCA recapture,
 * flipping rule, principal residence exemption) and land transfer tax on a purchase.
 * Rental income, recapture and the taxable half of a capital gain are taxed at the owner's personal rates,
 * computed as the difference in personal tax with and without the property.
 */
import type { Bracket, Prov, TaxPack } from '../types';
import { bracketTax, clamp0, round2 } from './common';
import { personalTax } from './personal';

// ---------- Rates (2026) ----------

export interface LttSchedule {
  id: string;
  name: { en: string; fr: string };
  prov: Prov;
  kind: 'brackets' | 'flat' | 'fee';
  /** Brackets for one or two single-family homes (Ontario/Toronto) or for all property elsewhere. */
  brackets?: Bracket[];
  /** Ontario/Toronto brackets for other property (multiplexes with 3+ units, land, commercial). */
  otherBrackets?: Bracket[];
  /** BC: further rate on the residential value above a threshold. */
  surcharge?: { from: number; rate: number };
  flatRate?: number;
  /** Tax base is the greater of the price and the assessed value (QC, NB, PE). */
  greaterOfAssessment?: boolean;
  /** Below this value no tax applies (PE). */
  exemptUpTo?: number;
  /** Municipal tax charged on top of a provincial schedule (Toronto, Montréal…). */
  addsTo?: string;
  fee?: (value: number) => number;
  note?: { en: string; fr: string };
}

const ON_RES: Bracket[] = [
  { from: 0, rate: 0.005 }, { from: 55000, rate: 0.01 }, { from: 250000, rate: 0.015 }, { from: 400000, rate: 0.02 }, { from: 2000000, rate: 0.025 },
];
const QC_BASE: Bracket[] = [{ from: 0, rate: 0.005 }, { from: 62900, rate: 0.01 }, { from: 315000, rate: 0.015 }];
const perUnits = (value: number, unit: number) => Math.ceil(clamp0(value) / unit);

export const LTT: LttSchedule[] = [
  { id: 'ON', prov: 'ON', name: { en: 'Ontario', fr: 'Ontario' }, kind: 'brackets', brackets: ON_RES, otherBrackets: ON_RES.slice(0, 3),
    note: { en: 'Non-residents pay a further 25% Non-Resident Speculation Tax.', fr: 'Les non-résidents paient en plus l’impôt de 25 % sur la spéculation pour les non-résidents.' } },
  { id: 'TOR', prov: 'ON', name: { en: 'Toronto (Ontario + municipal)', fr: 'Toronto (Ontario + municipal)' }, kind: 'brackets', addsTo: 'ON',
    brackets: [...ON_RES.slice(0, 4), { from: 2000000, rate: 0.025 }, { from: 3000000, rate: 0.044 }, { from: 4000000, rate: 0.0545 }, { from: 5000000, rate: 0.065 }, { from: 10000000, rate: 0.0755 }, { from: 20000000, rate: 0.086 }],
    otherBrackets: ON_RES.slice(0, 4),
    note: { en: 'Toronto’s high-value rates above $3M apply from April 1, 2026.', fr: 'Les taux de Toronto au-delà de 3 M$ s’appliquent depuis le 1er avril 2026.' } },
  { id: 'QC', prov: 'QC', name: { en: 'Quebec (base rates)', fr: 'Québec (taux de base)' }, kind: 'brackets', brackets: QC_BASE, greaterOfAssessment: true,
    note: { en: 'Billed by the municipality. Some cities add rates above $500,000. Base: the highest of the price, the deed price and the assessment × comparative factor.', fr: 'Facturés par la municipalité. Certaines villes ajoutent des taux au-delà de 500 000 $. Base : le plus élevé du prix, du prix inscrit à l’acte et de l’évaluation × facteur comparatif.' } },
  { id: 'MTL', prov: 'QC', name: { en: 'Montréal', fr: 'Montréal' }, kind: 'brackets', greaterOfAssessment: true,
    brackets: [...QC_BASE, { from: 552300, rate: 0.02 }, { from: 1104700, rate: 0.025 }, { from: 2136500, rate: 0.035 }, { from: 3113000, rate: 0.04 }] },
  { id: 'QCC', prov: 'QC', name: { en: 'Québec City', fr: 'Ville de Québec' }, kind: 'brackets', greaterOfAssessment: true,
    brackets: [...QC_BASE, { from: 500000, rate: 0.025 }, { from: 750000, rate: 0.03 }] },
  { id: 'LAV', prov: 'QC', name: { en: 'Laval', fr: 'Laval' }, kind: 'brackets', greaterOfAssessment: true, brackets: [...QC_BASE, { from: 500000, rate: 0.03 }] },
  { id: 'BC', prov: 'BC', name: { en: 'British Columbia', fr: 'Colombie-Britannique' }, kind: 'brackets',
    brackets: [{ from: 0, rate: 0.01 }, { from: 200000, rate: 0.02 }, { from: 2000000, rate: 0.03 }], surcharge: { from: 3000000, rate: 0.02 },
    note: { en: 'Foreign buyers pay a further 20% in specified areas.', fr: 'Les acheteurs étrangers paient 20 % de plus dans certaines régions.' } },
  { id: 'MB', prov: 'MB', name: { en: 'Manitoba', fr: 'Manitoba' }, kind: 'brackets',
    brackets: [{ from: 0, rate: 0 }, { from: 30000, rate: 0.005 }, { from: 90000, rate: 0.01 }, { from: 150000, rate: 0.015 }, { from: 200000, rate: 0.02 }] },
  { id: 'NB', prov: 'NB', name: { en: 'New Brunswick', fr: 'Nouveau-Brunswick' }, kind: 'flat', flatRate: 0.01, greaterOfAssessment: true },
  { id: 'PE', prov: 'PE', name: { en: 'Prince Edward Island', fr: 'Île-du-Prince-Édouard' }, kind: 'flat', flatRate: 0.01, greaterOfAssessment: true, exemptUpTo: 30000 },
  { id: 'NS', prov: 'NS', name: { en: 'Nova Scotia (Halifax 1.5%)', fr: 'Nouvelle-Écosse (Halifax 1,5 %)' }, kind: 'flat', flatRate: 0.015,
    note: { en: 'Deed transfer tax is set by each municipality (1% to 1.5%). Non-residents pay a further provincial tax.', fr: 'Le taux est fixé par chaque municipalité (1 % à 1,5 %). Les non-résidents paient une taxe provinciale additionnelle.' } },
  { id: 'NL', prov: 'NL', name: { en: 'Newfoundland and Labrador', fr: 'Terre-Neuve-et-Labrador' }, kind: 'fee',
    fee: (v) => (v <= 500 ? 100 : 100 + 0.4 * perUnits(v - 500, 100)),
    note: { en: 'Registration fee only (no transfer tax). The mortgage registration fee is extra.', fr: 'Frais d’enregistrement seulement. Les frais d’enregistrement de l’hypothèque s’ajoutent.' } },
  { id: 'AB', prov: 'AB', name: { en: 'Alberta', fr: 'Alberta' }, kind: 'fee', fee: (v) => 50 + 5 * perUnits(v, 5000),
    note: { en: 'Land title registration fee only (no transfer tax). Mortgage registration is extra.', fr: 'Frais d’enregistrement du titre seulement. L’enregistrement de l’hypothèque s’ajoute.' } },
  { id: 'SK', prov: 'SK', name: { en: 'Saskatchewan', fr: 'Saskatchewan' }, kind: 'fee', fee: (v) => (v <= 500 ? 0 : v <= 6300 ? 25 : 0.004 * v),
    note: { en: 'Land titles transfer fee only (no transfer tax). Mortgage registration is extra.', fr: 'Frais de transfert seulement. L’enregistrement de l’hypothèque s’ajoute.' } },
  { id: 'NT', prov: 'NT', name: { en: 'Northwest Territories', fr: 'Territoires du Nord-Ouest' }, kind: 'fee',
    fee: (v) => (v <= 1000000 ? Math.max(100, 2 * perUnits(v, 1000)) : 2000 + 1.5 * perUnits(v - 1000000, 1000)) },
  { id: 'NU', prov: 'NU', name: { en: 'Nunavut', fr: 'Nunavut' }, kind: 'fee',
    fee: (v) => (v <= 1000000 ? Math.max(60, 1.5 * perUnits(v, 1000)) : 1500 + perUnits(v - 1000000, 1000)) },
  { id: 'YT', prov: 'YT', name: { en: 'Yukon', fr: 'Yukon' }, kind: 'fee',
    fee: (v) => (v < 100000 ? 50 : v < 500000 ? 150 : v < 3000000 ? 350 : v < 10000000 ? 550 : 750) },
];

export const CCA = {
  class1: 0.04,
  /** New purpose-built rental housing (construction begun after April 15, 2024 and before 2031). */
  purposeBuilt: 0.1,
  /** Accelerated investment incentive: half-year rule suspended for property available for use up to this year. */
  aiiLastYear: 2027,
};

export const CAPITAL_GAINS_INCLUSION = 0.5;

// ---------- Rental income ----------

export interface RentalInput {
  prov: Prov;
  /** Gross rents for the whole property, per year. */
  grossRent: number;
  vacancyRate: number;
  /** Deductible expenses for the whole property, per year (mortgage interest, property and school tax, insurance, repairs, utilities, condo fees, management, advertising…). */
  expenses: number;
  /** Mortgage principal repaid in the year (not deductible; used for cash flow). */
  principalRepaid?: number;
  /** Your ownership share (0–1). */
  share: number;
  /** Share of the property used personally (renting part of your home), 0–1. */
  personalUse?: number;
  /** Building cost (no land) if bought this year, or the class 1 UCC at the start of the year. */
  buildingCostOrUcc: number;
  boughtThisYear: boolean;
  /** Year the building became available for use (for the first-year CCA rule). */
  year: number;
  purposeBuilt?: boolean;
  claimCca: boolean;
  /** Your other income (salary, etc.) to find your marginal rate. */
  otherIncome: number;
}

export interface RentalResult {
  rentCollected: number;
  deductibleExpenses: number;
  netBeforeCca: number;
  ccaMax: number;
  ccaClaimed: number;
  netRentalIncome: number;
  /** Positive = extra tax; negative = tax saved by a rental loss. */
  tax: number;
  marginalRate: number;
  cashFlowBeforeTax: number;
  cashFlowAfterTax: number;
  uccEnd: number;
}

function personalOnTop(pack: TaxPack, prov: Prov, otherIncome: number, extra: number) {
  const base = personalTax(pack, { prov, salary: clamp0(otherIncome) });
  const withIt = personalTax(pack, { prov, salary: clamp0(otherIncome), otherIncome: extra });
  return withIt.totalTax - base.totalTax;
}

export function rentalIncome(pack: TaxPack, i: RentalInput): RentalResult {
  const share = Math.min(1, clamp0(i.share));
  const business = 1 - Math.min(1, clamp0(i.personalUse ?? 0));
  const rent = clamp0(i.grossRent) * (1 - Math.min(1, clamp0(i.vacancyRate))) * share;
  const expenses = clamp0(i.expenses) * share * business;
  const netBeforeCca = rent - expenses;

  const rate = i.purposeBuilt ? CCA.purposeBuilt : CCA.class1;
  const base = clamp0(i.buildingCostOrUcc) * share * business;
  // First year: half-year rule unless the accelerated investment incentive suspends it (available for use before 2028).
  const firstYearFactor = i.boughtThisYear && i.year > CCA.aiiLastYear ? 0.5 : 1;
  const ccaMax = base * rate * firstYearFactor;
  // CCA can't create or increase a rental loss.
  const ccaClaimed = i.claimCca ? Math.min(ccaMax, clamp0(netBeforeCca)) : 0;
  const net = netBeforeCca - ccaClaimed;

  const tax = personalOnTop(pack, i.prov, i.otherIncome, net);
  const bump = personalOnTop(pack, i.prov, i.otherIncome, net + 100) - tax;
  const cashBefore = rent - expenses - clamp0(i.principalRepaid ?? 0) * share;
  return {
    rentCollected: round2(rent),
    deductibleExpenses: round2(expenses),
    netBeforeCca: round2(netBeforeCca),
    ccaMax: round2(ccaMax),
    ccaClaimed: round2(ccaClaimed),
    netRentalIncome: round2(net),
    tax: round2(tax),
    marginalRate: bump / 100,
    cashFlowBeforeTax: round2(cashBefore),
    cashFlowAfterTax: round2(cashBefore - tax),
    uccEnd: round2(base - ccaClaimed),
  };
}

// ---------- Sale ----------

export interface SaleInput {
  prov: Prov;
  salePrice: number;
  sellingCosts: number;
  /** Purchase price plus purchase costs (transfer tax, legal fees). */
  purchaseCost: number;
  improvements: number;
  /** Land share of the purchase price (land is not depreciable). */
  landShare: number;
  /** Total CCA claimed over the years (building). */
  ccaClaimed: number;
  share: number;
  /** Held less than 12 months: gain is business income (flipping rule) unless an exception applies. */
  flip: boolean;
  /** Principal residence: years designated and years owned (exemption = (1 + designated) / owned). */
  prYears?: number;
  ownedYears?: number;
  /** Share you live in (e.g. one unit of a duplex), 0–1: that part of the gain is covered by the principal residence exemption. */
  ownerOccupied?: number;
  otherIncome: number;
  mortgageBalance?: number;
}

export interface SaleResult {
  netProceeds: number;
  adjustedCostBase: number;
  capitalGain: number;
  prExemption: number;
  recapture: number;
  terminalLoss: number;
  taxableAmount: number;
  tax: number;
  cashAfterTax: number;
  inclusionRate: number;
}

export function saleTax(pack: TaxPack, i: SaleInput): SaleResult {
  const share = Math.min(1, clamp0(i.share));
  const proceeds = (clamp0(i.salePrice) - clamp0(i.sellingCosts)) * share;
  const cost = (clamp0(i.purchaseCost) + clamp0(i.improvements)) * share;
  const occ = i.flip ? 0 : Math.min(1, clamp0(i.ownerOccupied ?? 0));
  const land = clamp0(i.purchaseCost) * Math.min(1, clamp0(i.landShare)) * share;
  // CCA and recapture only concern the rented part of the building.
  const rentedProceeds = proceeds * (1 - occ);
  const rentedLand = land * (1 - occ);
  const buildingCost = (cost - land) * (1 - occ);
  const cca = Math.min(clamp0(i.ccaClaimed) * share, buildingCost);
  const ucc = buildingCost - cca;
  // Allocate proceeds to the land first at its cost, the rest to the building (common simplification).
  const buildingProceeds = clamp0(rentedProceeds - rentedLand);
  const recapture = clamp0(Math.min(buildingProceeds, buildingCost) - ucc);
  const terminalLoss = buildingProceeds < ucc ? ucc - buildingProceeds : 0;
  const gain = proceeds - cost;

  let prExemption = 0;
  if (!i.flip && gain > 0) {
    // The part you live in is designated every year; the rented part only for the years you designate.
    const rentedFraction = i.prYears && i.ownedYears ? Math.min(1, (1 + i.prYears) / i.ownedYears) : 0;
    prExemption = gain * occ + gain * (1 - occ) * rentedFraction;
  }
  const netGain = gain - prExemption;
  const inclusion = i.flip ? 1 : CAPITAL_GAINS_INCLUSION;
  // A capital loss can't be deducted from other income (only from capital gains); a terminal loss can.
  const taxable = (netGain > 0 ? netGain * inclusion : i.flip ? netGain : 0) + recapture - terminalLoss;
  const tax = personalOnTop(pack, i.prov, i.otherIncome, taxable);
  return {
    netProceeds: round2(proceeds),
    adjustedCostBase: round2(cost),
    capitalGain: round2(gain),
    prExemption: round2(prExemption),
    recapture: round2(recapture),
    terminalLoss: round2(terminalLoss),
    taxableAmount: round2(taxable),
    tax: round2(tax),
    cashAfterTax: round2(proceeds - tax - clamp0(i.mortgageBalance ?? 0) * share),
    inclusionRate: inclusion,
  };
}

// ---------- Purchase ----------

export interface LttResult {
  base: number;
  provincial: number;
  municipal: number;
  /** First-time buyer refund or exemption (only when you'll live in the home). */
  rebate: number;
  total: number;
  effectiveRate: number;
}

/** First-time home buyer relief, 2026. Only applies when the buyer will live in the home. */
function firstTimeRebate(s: LttSchedule, base: number, provincial: number, municipal: number) {
  const prov = s.addsTo ?? s.id;
  let r = 0;
  if (prov === 'ON') r += Math.min(provincial, 4000);
  if (s.id === 'TOR') r += Math.min(municipal, 4475);
  if (prov === 'BC') {
    // Exempt on the first $500,000 for homes up to $835,000, phased out to $860,000.
    const onFirst = Math.min(provincial, bracketTax(s.brackets!, Math.min(base, 500000)));
    if (base <= 835000) r += onFirst;
    else if (base < 860000) r += onFirst * (860000 - base) / 25000;
  }
  if (prov === 'PE') r += provincial;
  return r;
}

function scheduleTax(s: LttSchedule, base: number, singleFamily: boolean) {
  if (s.exemptUpTo && base <= s.exemptUpTo) return 0;
  if (s.kind === 'flat') return base * (s.flatRate ?? 0);
  if (s.kind === 'fee') return s.fee ? s.fee(base) : 0;
  const br = !singleFamily && s.otherBrackets ? s.otherBrackets : s.brackets!;
  let t = bracketTax(br, base);
  // BC: further tax on the residential value above $3M (investment property here is residential).
  if (s.surcharge) t += clamp0(base - s.surcharge.from) * s.surcharge.rate;
  return t;
}

export function landTransferTax(scheduleId: string, price: number, assessed = 0, singleFamily = true, firstTimeBuyer = false): LttResult {
  const s = LTT.find((x) => x.id === scheduleId) ?? LTT[0];
  const base = s.greaterOfAssessment ? Math.max(clamp0(price), clamp0(assessed)) : clamp0(price);
  let provincial = 0;
  let municipal = 0;
  if (s.addsTo) {
    provincial = scheduleTax(LTT.find((x) => x.id === s.addsTo)!, base, singleFamily);
    municipal = scheduleTax(s, base, singleFamily);
  } else if (s.prov === 'QC') {
    municipal = scheduleTax(s, base, singleFamily); // Quebec duties are municipal
  } else {
    provincial = scheduleTax(s, base, singleFamily);
  }
  const rebate = firstTimeBuyer ? firstTimeRebate(s, base, provincial, municipal) : 0;
  const total = provincial + municipal - rebate;
  return { base: round2(base), provincial: round2(provincial), municipal: round2(municipal), rebate: round2(rebate), total: round2(total), effectiveRate: base > 0 ? total / base : 0 };
}

export function lttSchedulesFor(prov: Prov) {
  return LTT.filter((s) => s.prov === prov);
}

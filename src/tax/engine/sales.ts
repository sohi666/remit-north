/** GST/HST, QST and PST: regular method vs Quick Method for one filing period. */
import type { Prov, TaxPack } from '../types';
import { clamp0, round2 } from './common';

export interface SalesInput {
  prov: Prov;
  /** Taxable sales for the period, before tax. */
  sales: number;
  /** Purchases and expenses on which GST/HST (and QST) was paid, before tax. */
  taxablePurchases: number;
  activity: 'services' | 'goods';
  /** Tax-included sales already reported earlier in this fiscal year (for the 1% credit on the first $30,000). */
  priorTaxIncludedSales?: number;
}

export interface TaxLine {
  collected: number;
  itc: number;
  regular: number;
  quick: number;
  quickCredit: number;
}

export interface SalesResult {
  kind: 'GST' | 'HST' | 'GST_PST' | 'GST_QST';
  federalLabel: 'GST' | 'HST';
  federalRate: number;
  pstRate: number;
  pstName?: string;
  taxIncludedSales: number;
  federal: TaxLine;
  /** QST (Quebec). */
  qst?: TaxLine;
  /** PST / RST collected: remitted to the province, not part of the Quick Method. */
  pstCollected: number;
  quickRates: { federal: number; qst?: number };
  savings: number;
  /** Quick Method gain: tax collected minus tax remitted. It is taxable income. */
  quickGain: number;
  totalRegular: number;
  totalQuick: number;
}

export function salesTax(pack: TaxPack, input: SalesInput): SalesResult {
  const s = pack.jurisdictions[input.prov].sales;
  const qm = pack.quickMethod;
  const sales = clamp0(input.sales);
  const fedRate = s.kind === 'HST' ? s.hst! : 0.05;
  const qstRate = s.kind === 'GST_QST' ? s.pst! : 0;
  const pstRate = s.kind === 'GST_PST' ? s.pst! : 0;

  const fedCollected = sales * fedRate;
  const qstCollected = sales * qstRate;
  // Tax-included sales for the Quick Method include GST/HST and QST, not PST.
  const taxIncluded = sales + fedCollected + qstCollected;
  const prior = clamp0(input.priorTaxIncludedSales ?? 0);
  const creditBase = clamp0(Math.min(taxIncluded, qm.creditOn - prior));

  const fedQuickRate = s.quick[input.activity];
  const fedQuickCredit = creditBase * qm.creditRate;
  const fedItc = clamp0(input.taxablePurchases) * fedRate;
  const federal: TaxLine = {
    collected: round2(fedCollected),
    itc: round2(fedItc),
    regular: round2(fedCollected - fedItc),
    quick: round2(clamp0(taxIncluded * fedQuickRate - fedQuickCredit)),
    quickCredit: round2(fedQuickCredit),
  };

  let qst: TaxLine | undefined;
  if (s.kind === 'GST_QST' && s.quickPst) {
    const r = s.quickPst[input.activity];
    const credit = creditBase * qm.creditRate;
    const itc = clamp0(input.taxablePurchases) * qstRate;
    qst = {
      collected: round2(qstCollected),
      itc: round2(itc),
      regular: round2(qstCollected - itc),
      quick: round2(clamp0(taxIncluded * r - credit)),
      quickCredit: round2(credit),
    };
  }

  const totalRegular = round2(federal.regular + (qst?.regular ?? 0));
  const totalQuick = round2(federal.quick + (qst?.quick ?? 0));
  const collected = federal.collected + (qst?.collected ?? 0);
  return {
    kind: s.kind,
    federalLabel: s.kind === 'HST' ? 'HST' : 'GST',
    federalRate: fedRate,
    pstRate: pstRate || qstRate,
    pstName: s.pstName,
    taxIncludedSales: round2(taxIncluded),
    federal,
    qst,
    pstCollected: round2(sales * pstRate),
    quickRates: { federal: fedQuickRate, qst: s.quickPst?.[input.activity] },
    savings: round2(totalRegular - totalQuick),
    quickGain: round2(collected - totalQuick),
    totalRegular,
    totalQuick,
  };
}

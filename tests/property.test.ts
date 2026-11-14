import { describe, expect, it } from 'vitest';
import pack2026 from '../src/tax/packs/2026.json';
import type { TaxPack } from '../src/tax/types';
import { landTransferTax, rentalIncome, saleTax } from '../src/tax/engine/property';
import { personalTax } from '../src/tax/engine/personal';

const pack = pack2026 as unknown as TaxPack;

describe('land transfer tax (official examples)', () => {
  it('Quebec base rates: quebec.ca example, $350,000 → $3,360.50', () => {
    expect(landTransferTax('QC', 350000).total).toBeCloseTo(314.5 + 2521 + 525, 2);
  });
  it('Montréal: montreal.ca example, $700,000 → $9,349', () => {
    expect(landTransferTax('MTL', 700000).total).toBeCloseTo(9349, 2);
  });
  it('Quebec uses the greater of price and assessment', () => {
    expect(landTransferTax('QC', 300000, 350000).total).toBeCloseTo(3360.5, 2);
  });
  it('Ontario and Toronto at $500,000: $6,475 each', () => {
    const on = landTransferTax('ON', 500000);
    const tor = landTransferTax('TOR', 500000);
    expect(on.total).toBeCloseTo(6475, 2);
    expect(tor.provincial).toBeCloseTo(6475, 2);
    expect(tor.municipal).toBeCloseTo(6475, 2);
    expect(tor.total).toBeCloseTo(12950, 2);
  });
  it('Ontario multiplex (not 1–2 single-family homes) stays at 1.5% above $250k', () => {
    expect(landTransferTax('ON', 1000000, 0, false).total).toBeCloseTo(275 + 1950 + 0.015 * 750000, 2);
  });
  it('Toronto high-value bands from April 1, 2026', () => {
    // $4M: 0.5%·55k + 1%·195k + 1.5%·150k + 2%·1.6M + 2.5%·1M + 4.4%·1M
    expect(landTransferTax('TOR', 4000000).municipal).toBeCloseTo(275 + 1950 + 2250 + 32000 + 25000 + 44000, 2);
  });
  it('BC: $900,000 → $16,000; $3.5M → $93,000 (further 2% over $3M)', () => {
    expect(landTransferTax('BC', 900000).total).toBeCloseTo(16000, 2);
    expect(landTransferTax('BC', 3500000).total).toBeCloseTo(93000, 2);
  });
  it('Manitoba, New Brunswick, PEI', () => {
    expect(landTransferTax('MB', 250000).total).toBeCloseTo(300 + 600 + 750 + 1000, 2);
    expect(landTransferTax('NB', 300000, 320000).total).toBeCloseTo(3200, 2);
    expect(landTransferTax('PE', 25000).total).toBe(0);
  });
  it('fee-only provinces', () => {
    expect(landTransferTax('AB', 500000).total).toBe(550);
    expect(landTransferTax('SK', 400000).total).toBeCloseTo(1600, 2);
  });
});

describe('rental income', () => {
  const base = {
    prov: 'QC' as const, grossRent: 30000, vacancyRate: 0, expenses: 18000, share: 1,
    buildingCostOrUcc: 400000, boughtThisYear: true, year: 2026, claimCca: true, otherIncome: 90000,
  };
  it('first-year CCA without the half-year rule in 2026 (accelerated investment incentive)', () => {
    const r = rentalIncome(pack, { ...base, expenses: 0 });
    expect(r.ccaMax).toBeCloseTo(400000 * 0.04, 2);
  });
  it('half-year rule returns for buildings available for use after 2027', () => {
    expect(rentalIncome(pack, { ...base, expenses: 0, year: 2028 }).ccaMax).toBeCloseTo(8000, 2);
  });
  it('CCA cannot create a rental loss', () => {
    const r = rentalIncome(pack, base);
    expect(r.netBeforeCca).toBe(12000);
    expect(r.ccaClaimed).toBe(12000);
    expect(r.netRentalIncome).toBe(0);
    expect(r.tax).toBeCloseTo(0, 2);
  });
  it('net rental income is taxed at the owner’s marginal rate; a 50% share halves everything', () => {
    const r = rentalIncome(pack, { ...base, claimCca: false });
    const expected = personalTax(pack, { prov: 'QC', salary: 90000, otherIncome: 12000 }).totalTax - personalTax(pack, { prov: 'QC', salary: 90000 }).totalTax;
    expect(r.tax).toBeCloseTo(expected, 1);
    expect(r.marginalRate).toBeGreaterThan(0.3);
    const half = rentalIncome(pack, { ...base, claimCca: false, share: 0.5 });
    expect(half.netRentalIncome).toBeCloseTo(6000, 2);
  });
  it('a rental loss reduces tax on other income', () => {
    const r = rentalIncome(pack, { ...base, expenses: 40000 });
    expect(r.netRentalIncome).toBe(-10000);
    expect(r.ccaClaimed).toBe(0);
    expect(r.tax).toBeLessThan(0);
  });
});

describe('sale', () => {
  const base = {
    prov: 'ON' as const, salePrice: 900000, sellingCosts: 40000, purchaseCost: 600000, improvements: 20000,
    landShare: 0.3, ccaClaimed: 50000, share: 1, flip: false, otherIncome: 80000,
  };
  it('capital gain is 50% taxable and CCA claimed is recaptured', () => {
    const r = saleTax(pack, base);
    expect(r.capitalGain).toBeCloseTo(860000 - 620000, 2);
    expect(r.recapture).toBeCloseTo(50000, 2);
    expect(r.taxableAmount).toBeCloseTo(240000 * 0.5 + 50000, 2);
    expect(r.inclusionRate).toBe(0.5);
  });
  it('flipping rule: held under 12 months, the whole gain is business income', () => {
    const r = saleTax(pack, { ...base, flip: true, ccaClaimed: 0 });
    expect(r.taxableAmount).toBeCloseTo(240000, 2);
  });
  it('principal residence designation exempts (1 + years) / years owned', () => {
    const r = saleTax(pack, { ...base, ccaClaimed: 0, prYears: 4, ownedYears: 10 });
    expect(r.prExemption).toBeCloseTo(240000 * 0.5, 2);
  });
  it('selling below cost: no tax on the capital loss, terminal loss is deductible', () => {
    const r = saleTax(pack, { ...base, salePrice: 500000, ccaClaimed: 30000 });
    expect(r.capitalGain).toBeLessThan(0);
    expect(r.recapture).toBe(0);
    expect(r.terminalLoss).toBeGreaterThan(0);
    expect(r.tax).toBeLessThan(0);
  });
});

describe('owner-occupied', () => {
  it('duplex, live in half: half the gain is exempt, recapture only on the rented half', () => {
    const r = saleTax(pack, {
      prov: 'QC', salePrice: 800000, sellingCosts: 0, purchaseCost: 500000, improvements: 0, landShare: 0.3,
      ccaClaimed: 20000, share: 1, flip: false, ownerOccupied: 0.5, otherIncome: 80000,
    });
    expect(r.capitalGain).toBeCloseTo(300000, 2);
    expect(r.prExemption).toBeCloseTo(150000, 2);
    expect(r.recapture).toBeCloseTo(20000, 2);
    expect(r.taxableAmount).toBeCloseTo(75000 + 20000, 2);
  });
  it('rental expenses and CCA only count for the rented share', () => {
    const r = rentalIncome(pack, {
      prov: 'ON', grossRent: 24000, vacancyRate: 0, expenses: 20000, share: 1, personalUse: 0.5,
      buildingCostOrUcc: 400000, boughtThisYear: false, year: 2026, claimCca: true, otherIncome: 70000,
    });
    expect(r.deductibleExpenses).toBe(10000);
    expect(r.ccaMax).toBeCloseTo(8000, 2);
  });
  it('first-time buyer rebates: Ontario $4,000, Toronto + $4,475, BC first $500k', () => {
    expect(landTransferTax('ON', 500000, 0, true, true).total).toBeCloseTo(2475, 2);
    expect(landTransferTax('TOR', 500000, 0, true, true).total).toBeCloseTo(12950 - 8475, 2);
    expect(landTransferTax('BC', 700000, 0, true, true).total).toBeCloseTo(4000, 2);
    expect(landTransferTax('BC', 900000, 0, true, true).rebate).toBe(0);
  });
});

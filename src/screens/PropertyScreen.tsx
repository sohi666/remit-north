import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useApp } from '../state/app';
import { money, pct } from '../i18n';
import { landTransferTax, lttSchedulesFor, rentalIncome, saleTax } from '../tax/engine/property';
import { Card, Divider, Hero, Note, NumberField, Pill, Row, Screen, Segmented, ToggleRow, Txt } from '../ui/kit';
import { StackBar } from '../ui/charts';
import { ProvinceChip } from '../ui/ProvincePicker';
import { TipCard } from '../ui/TipCard';
import { TablesBadge } from '../ui/TablesBadge';
import { SPACE } from '../theme';

const W = 'rgba(255,255,255,0.85)';

export function PropertyScreen() {
  const { prefs, set, pack, lang, s, c } = useApp();
  const v = prefs.property;
  const p = s.prop;
  const prov = prefs.prov;
  const upd = (patch: Partial<typeof v>) => set('property', (x) => ({ ...x, ...patch }));
  const m = (n: number) => money(n, lang);
  const m0 = (n: number) => money(n, lang, false);

  const expenses = v.mortgageInterest + v.propertyTax + v.insurance + v.repairs + v.utilities + v.condo + v.management + v.otherExp;
  const year = Number(String(pack.year).slice(0, 4)) || 2026;

  const rent = useMemo(
    () => rentalIncome(pack, {
      prov, grossRent: v.grossRent, vacancyRate: v.vacancy / 100, expenses, principalRepaid: v.principal, share: v.share / 100,
      personalUse: v.personalUse / 100, buildingCostOrUcc: v.building, boughtThisYear: v.boughtThisYear, year, purposeBuilt: v.purposeBuilt,
      claimCca: v.claimCca, otherIncome: v.otherIncome,
    }),
    [pack, prov, v, expenses, year],
  );
  const sale = useMemo(
    () => saleTax(pack, {
      prov, salePrice: v.salePrice, sellingCosts: v.sellingCosts, purchaseCost: v.purchaseCost, improvements: v.improvements,
      landShare: v.landShare / 100, ccaClaimed: v.ccaClaimed, share: v.share / 100, flip: v.flip, prYears: v.prYears, ownedYears: v.ownedYears, ownerOccupied: v.personalUse / 100,
      otherIncome: v.otherIncome, mortgageBalance: v.mortgageBalance,
    }),
    [pack, prov, v],
  );
  const schedules = lttSchedulesFor(prov);
  const schedule = schedules.find((x) => x.id === v.schedule) ?? schedules[0];
  const ltt = useMemo(() => (schedule ? landTransferTax(schedule.id, v.price, v.assessed, v.singleFamily, v.firstTimeBuyer) : null), [schedule, v.price, v.assessed, v.singleFamily, v.firstTimeBuyer]);

  return (
    <Screen title={p.title} subtitle={s.appName} right={<TablesBadge />}>
      <ProvinceChip />
      <TipCard id="property" text={s.tips.property} />
      <Segmented
        options={[{ value: 'rental', label: p.rental }, { value: 'sale', label: p.sale }, { value: 'purchase', label: p.purchase }]}
        value={v.mode}
        onChange={(mode) => upd({ mode })}
      />

      {v.mode !== 'purchase' ? (
        <Card>
          <NumberField label={p.share} value={v.share} onChange={(n) => upd({ share: Math.min(100, Math.max(0, n)) })} prefix="" suffix="%" decimals={1} />
          <NumberField label={p.otherIncome} value={v.otherIncome} onChange={(n) => upd({ otherIncome: n })} hint={p.otherIncomeHint} />
        </Card>
      ) : null}

      {v.mode === 'rental' ? (
        <>
          <Card title={p.income} icon="home-outline">
            <NumberField label={p.grossRent} value={v.grossRent} onChange={(n) => upd({ grossRent: n })} />
            <NumberField label={p.vacancy} value={v.vacancy} onChange={(n) => upd({ vacancy: Math.min(100, Math.max(0, n)) })} prefix="" suffix="%" decimals={1} />
            <NumberField label={p.personalUse} value={v.personalUse} onChange={(n) => upd({ personalUse: Math.min(100, Math.max(0, n)) })} prefix="" suffix="%" decimals={0} hint={p.personalUseHint} />
          </Card>
          <Card title={p.expenses} icon="construct-outline">
            <NumberField label={p.mortgageInterest} value={v.mortgageInterest} onChange={(n) => upd({ mortgageInterest: n })} />
            <NumberField label={p.propertyTax} value={v.propertyTax} onChange={(n) => upd({ propertyTax: n })} />
            <NumberField label={p.insurance} value={v.insurance} onChange={(n) => upd({ insurance: n })} />
            <NumberField label={p.repairs} value={v.repairs} onChange={(n) => upd({ repairs: n })} />
            <NumberField label={p.utilities} value={v.utilities} onChange={(n) => upd({ utilities: n })} />
            <NumberField label={p.condo} value={v.condo} onChange={(n) => upd({ condo: n })} />
            <NumberField label={p.management} value={v.management} onChange={(n) => upd({ management: n })} />
            <NumberField label={p.otherExp} value={v.otherExp} onChange={(n) => upd({ otherExp: n })} />
            <Note>{p.notDeductible}</Note>
            <NumberField label={p.principal} value={v.principal} onChange={(n) => upd({ principal: n })} />
          </Card>
          <Card title={p.cca} icon="trending-down-outline">
            <ToggleRow label={p.claimCca} hint={p.claimCcaHint} value={v.claimCca} onChange={(b) => upd({ claimCca: b })} />
            {v.claimCca ? (
              <>
                <NumberField label={p.building} value={v.building} onChange={(n) => upd({ building: n })} />
                <ToggleRow label={p.boughtThisYear} hint={p.boughtThisYearHint} value={v.boughtThisYear} onChange={(b) => upd({ boughtThisYear: b })} />
                <ToggleRow label={p.purposeBuilt} hint={p.purposeBuiltHint} value={v.purposeBuilt} onChange={(b) => upd({ purposeBuilt: b })} />
              </>
            ) : null}
          </Card>

          <Hero>
            <Txt variant="tiny" color={W}>{rent.tax >= 0 ? p.taxOwing : p.taxSaved}</Txt>
            <Txt variant="hero" color="#FFFFFF">{m(Math.abs(rent.tax))}</Txt>
            <Txt variant="small" color={W}>{p.netRental} {m(rent.netRentalIncome)} · {p.marginal} {pct(rent.marginalRate, lang)}</Txt>
          </Hero>

          <Card title={p.netRental} icon="calculator-outline">
            <StackBar parts={[
              { value: rent.deductibleExpenses, color: c.violet },
              { value: rent.ccaClaimed, color: c.blue },
              { value: Math.max(0, rent.tax), color: c.accent },
              { value: Math.max(0, rent.netRentalIncome - Math.max(0, rent.tax)), color: c.good },
            ]} />
            <Row label={p.rentCollected} value={m(rent.rentCollected)} />
            <Row label={p.expensesShort} value={`− ${m(rent.deductibleExpenses)}`} dot={c.violet} />
            <Row label={p.netBeforeCca} value={m(rent.netBeforeCca)} />
            {v.claimCca ? <Row label={`${p.ccaClaimed} (${p.ccaMax(m0(rent.ccaMax))})`} value={`− ${m(rent.ccaClaimed)}`} dot={c.blue} /> : null}
            <Divider />
            <Row label={p.netRental} value={m(rent.netRentalIncome)} strong />
            <Row label={rent.tax >= 0 ? p.taxOwing : p.taxSaved} value={m(Math.abs(rent.tax))} dot={c.accent} />
            <Divider />
            <Row label={p.cashBefore} value={m(rent.cashFlowBeforeTax)} />
            <Row label={p.cashAfter} value={m(rent.cashFlowAfterTax)} strong dot={c.good} />
            {v.claimCca ? <Row label={p.uccEnd} value={m(rent.uccEnd)} /> : null}
          </Card>
          <Card>{p.rentalNotes.map((n) => <Note key={n}>{n}</Note>)}</Card>
        </>
      ) : null}

      {v.mode === 'sale' ? (
        <>
          <Card title={p.sale} icon="pricetag-outline">
            <NumberField label={p.salePrice} value={v.salePrice} onChange={(n) => upd({ salePrice: n })} />
            <NumberField label={p.sellingCosts} value={v.sellingCosts} onChange={(n) => upd({ sellingCosts: n })} />
            <NumberField label={p.purchaseCost} value={v.purchaseCost} onChange={(n) => upd({ purchaseCost: n })} />
            <NumberField label={p.improvements} value={v.improvements} onChange={(n) => upd({ improvements: n })} />
            <NumberField label={p.landShare} value={v.landShare} onChange={(n) => upd({ landShare: Math.min(100, Math.max(0, n)) })} prefix="" suffix="%" decimals={0} />
            <NumberField label={p.totalCca} value={v.ccaClaimed} onChange={(n) => upd({ ccaClaimed: n })} />
            <NumberField label={p.mortgageBalance} value={v.mortgageBalance} onChange={(n) => upd({ mortgageBalance: n })} />
            <Divider />
            <ToggleRow label={p.flip} hint={p.flipHint} value={v.flip} onChange={(b) => upd({ flip: b })} />
            {!v.flip ? (
              <>
                <NumberField label={p.ownerOccSale} value={v.personalUse} onChange={(n) => upd({ personalUse: Math.min(100, Math.max(0, n)) })} prefix="" suffix="%" decimals={0} hint={p.ownerOccSaleHint} />
                <NumberField label={p.prYears} value={v.prYears} onChange={(n) => upd({ prYears: Math.max(0, Math.round(n)) })} prefix="" decimals={0} />
                <NumberField label={p.ownedYears} value={v.ownedYears} onChange={(n) => upd({ ownedYears: Math.max(1, Math.round(n)) })} prefix="" decimals={0} />
              </>
            ) : null}
            {!v.flip ? <Note>{p.prRentedHint}</Note> : null}
          </Card>

          <Hero>
            <Txt variant="tiny" color={W}>{p.saleTax}</Txt>
            <Txt variant="hero" color="#FFFFFF">{m(sale.tax)}</Txt>
            <Txt variant="small" color={W}>{p.capitalGain} {m(sale.capitalGain)} · {p.inclusion(pct(sale.inclusionRate, lang, 0))}</Txt>
          </Hero>

          <Card title={p.saleTax} icon="calculator-outline">
            <Row label={p.netProceeds} value={m(sale.netProceeds)} />
            <Row label={p.acb} value={`− ${m(sale.adjustedCostBase)}`} />
            <Row label={p.capitalGain} value={m(sale.capitalGain)} strong />
            {sale.prExemption > 0 ? <Row label={p.prExemption} value={`− ${m(sale.prExemption)}`} dot={c.good} /> : null}
            {sale.recapture > 0 ? <Row label={p.recapture} value={m(sale.recapture)} dot={c.blue} /> : null}
            {sale.terminalLoss > 0 ? <Row label={p.terminalLoss} value={`− ${m(sale.terminalLoss)}`} dot={c.good} /> : null}
            <Divider />
            <Row label={p.taxable} value={m(sale.taxableAmount)} />
            <Row label={p.saleTax} value={m(sale.tax)} strong dot={c.accent} />
            <Divider />
            <Row label={p.cashAfterSale} value={m(sale.cashAfterTax)} strong dot={c.good} />
          </Card>
          <Card>{p.saleNotes.map((n) => <Note key={n}>{n}</Note>)}</Card>
        </>
      ) : null}

      {v.mode === 'purchase' && schedule && ltt ? (
        <>
          <Card title={p.purchase} icon="key-outline">
            {schedules.length > 1 ? (
              <>
                <Txt variant="small" dim>{p.schedule}</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s }}>
                  {schedules.map((x) => <Pill key={x.id} label={x.name[lang]} active={x.id === schedule.id} onPress={() => upd({ schedule: x.id })} />)}
                </View>
              </>
            ) : null}
            <NumberField label={p.price} value={v.price} onChange={(n) => upd({ price: n })} />
            {schedule.greaterOfAssessment ? <NumberField label={p.assessed} value={v.assessed} onChange={(n) => upd({ assessed: n })} /> : null}
            <ToggleRow label={p.firstTimeBuyer} hint={p.firstTimeBuyerHint} value={v.firstTimeBuyer} onChange={(b) => upd({ firstTimeBuyer: b })} />
            {schedule.otherBrackets ? <ToggleRow label={p.singleFamily} hint={p.singleFamilyHint} value={v.singleFamily} onChange={(b) => upd({ singleFamily: b })} /> : null}
          </Card>

          <Hero>
            <Txt variant="tiny" color={W}>{p.ltt} · {schedule.name[lang]}</Txt>
            <Txt variant="hero" color="#FFFFFF">{m(ltt.total)}</Txt>
            <Txt variant="small" color={W}>{pct(ltt.effectiveRate, lang, 2)} {p.effective}</Txt>
          </Hero>

          <Card title={p.ltt} icon="document-text-outline">
            {ltt.provincial > 0 ? <Row label={p.provincialLtt} value={m(ltt.provincial)} dot={c.blue} /> : null}
            {ltt.municipal > 0 ? <Row label={p.municipalLtt} value={m(ltt.municipal)} dot={c.violet} /> : null}
            {ltt.rebate > 0 ? <Row label={p.rebate} value={`− ${m(ltt.rebate)}`} dot={c.good} /> : null}
            <Divider />
            <Row label={p.ltt} value={m(ltt.total)} strong />
            {schedule.note ? <Note>{schedule.note[lang]}</Note> : null}
          </Card>
          <Card>{p.purchaseNotes.map((n) => <Note key={n}>{n}</Note>)}</Card>
        </>
      ) : null}
    </Screen>
  );
}

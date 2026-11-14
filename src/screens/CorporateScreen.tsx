import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useApp } from '../state/app';
import { money, pct } from '../i18n';
import { corporateTax } from '../tax/engine/corporate';
import { calcYear } from '../tax/engine/payroll';
import { salesTax } from '../tax/engine/sales';
import { Button, Card, Divider, Hero, Note, NumberField, Row, Screen, ToggleRow, Txt } from '../ui/kit';
import { StackBar } from '../ui/charts';
import { ProvinceChip } from '../ui/ProvincePicker';
import { TablesBadge } from '../ui/TablesBadge';
import { SPACE } from '../theme';

export function CorporateScreen() {
  const { prefs, set, pack, lang, s, c } = useApp();
  const v = prefs.corp;
  const prov = prefs.prov;
  const upd = (patch: Partial<typeof v>) => set('corp', (x) => ({ ...x, ...patch }));
  const r = useMemo(
    () => corporateTax(pack, { prov, revenue: v.revenue, expenses: v.expenses, payrollCost: v.payrollCost, otherIncome: v.otherIncome, psb: v.psb, quebecHours: v.qcHours }),
    [pack, prov, v],
  );
  const m = (n: number) => money(n, lang);
  const j = pack.jurisdictions[prov];

  const fromPayroll = () => {
    const p = prefs.payroll;
    const per = p.enterAnnual ? p.amount / p.periods : p.amount;
    const y = calcYear(pack, { prov, grossPerPeriod: per, periods: p.periods, eiExempt: p.eiExempt, pensionExempt: p.pensionExempt, wcbRate: p.wcbRate / 100 });
    const gain = salesTax(pack, { prov, sales: v.revenue, taxablePurchases: 0, activity: prefs.sales.activity }).quickGain;
    upd({ payrollCost: Math.round(y.totals.totalCost), otherIncome: Math.round(gain) });
  };

  return (
    <Screen title={s.corpTitle} subtitle={s.appName} right={<TablesBadge />}>
      <ProvinceChip />
      <Card>
        <NumberField label={s.revenue} value={v.revenue} onChange={(n) => upd({ revenue: n })} />
        <NumberField label={s.expenses} value={v.expenses} onChange={(n) => upd({ expenses: n })} />
        <NumberField label={s.payrollCost} value={v.payrollCost} onChange={(n) => upd({ payrollCost: n })} />
        <NumberField label={s.otherIncome} value={v.otherIncome} onChange={(n) => upd({ otherIncome: n })} />
        <Button label={s.usePayroll} icon="download-outline" kind="secondary" onPress={fromPayroll} />
        <Divider />
        <ToggleRow label={s.psb} hint={s.psbHint} value={v.psb} onChange={(b) => upd({ psb: b })} />
        {prov === 'QC' && !v.psb ? <NumberField label={s.qcHours} value={v.qcHours} onChange={(n) => upd({ qcHours: Math.round(n) })} prefix="" decimals={0} hint={s.qcHoursHint} /> : null}
      </Card>

      <Hero>
        <Txt variant="tiny" color="rgba(255,255,255,0.8)">{s.corpTotal}</Txt>
        <Txt variant="hero" color="#FFFFFF">{m(r.totalTax)}</Txt>
        <Txt variant="small" color="rgba(255,255,255,0.85)">
          {pct(r.effectiveRate, lang)} {s.effective} · {s.netIncome} {m(r.netIncome)}
        </Txt>
      </Hero>

      <Card title={s.corpTotal} icon="briefcase-outline">
        <StackBar parts={[{ value: r.federalTax, color: c.blue }, { value: r.provincialTax, color: c.violet }, { value: Math.max(0, r.afterTax), color: c.good }]} />
        <Row label={s.netIncome} value={m(r.netIncome)} />
        <Row label={s.corpFed} value={m(r.federalTax)} dot={c.blue} />
        <Row label={s.corpProv} value={m(r.provincialTax)} dot={c.violet} />
        <Divider />
        <Row label={s.afterTaxProfit} value={m(r.afterTax)} strong dot={c.good} />
      </Card>

      <Card title={s.instalments} icon="calendar-number-outline">
        {r.instalments.required ? (
          <>
            <Row label={s.monthly} value={m(r.instalments.monthly)} />
            <Row label={s.quarterly} value={m(r.instalments.quarterly)} />
          </>
        ) : (
          <Note tone="good" icon="checkmark-circle-outline">{s.instalmentsNone}</Note>
        )}
        <Note>{s.balanceDue}</Note>
      </Card>

      <Card title={s.ratesUsed} icon="stats-chart-outline">
        <View style={{ flexDirection: 'row', gap: SPACE.m }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="tiny" dim>{s.smallBusiness}</Txt>
            <Txt variant="num">{pct(r.federalRate.small, lang, 2)} + {pct(r.provincialRate.small, lang, 2)}</Txt>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="tiny" dim>{s.generalRate}</Txt>
            <Txt variant="num">{pct(r.federalRate.general, lang, 2)} + {pct(r.provincialRate.general, lang, 2)}</Txt>
          </View>
        </View>
        <Note>
          {lang === 'fr' ? 'Plafond des affaires' : 'Business limit'}: {money(Math.min(pack.federal.corp.limit, j.corp.limit), lang, false)}
          {j.corp.limit !== pack.federal.corp.limit ? ` (${j.name[lang]}: ${money(j.corp.limit, lang, false)})` : ''}
        </Note>
        {j.corp.note ? <Note>{j.corp.note}</Note> : null}
      </Card>
    </Screen>
  );
}

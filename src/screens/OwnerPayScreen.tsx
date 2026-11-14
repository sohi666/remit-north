import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useApp } from '../state/app';
import { money, pct } from '../i18n';
import { ownerPayCurve, type OwnerPayPoint } from '../tax/engine/ownerPay';
import { Card, Divider, Hero, Note, NumberField, Row, Screen, ToggleRow, Txt } from '../ui/kit';
import { LineChart, StackBar } from '../ui/charts';
import { ProvinceChip } from '../ui/ProvincePicker';
import { TipCard } from '../ui/TipCard';
import { TablesBadge } from '../ui/TablesBadge';
import { SPACE } from '../theme';

export function OwnerPayScreen() {
  const { prefs, set, pack, lang, s, c } = useApp();
  const v = prefs.owner;
  const prov = prefs.prov;
  const upd = (patch: Partial<typeof v>) => set('owner', (x) => ({ ...x, ...patch }));
  const curve = useMemo(
    () => ownerPayCurve(pack, { prov, profit: v.profit, eiExempt: v.eiExempt, psb: v.psb, quebecHours: v.qcHours }),
    [pack, prov, v],
  );
  const m = (n: number) => money(n, lang, false);
  const b = curve.best;

  const option = (label: string, p: OwnerPayPoint, highlight?: boolean) => (
    <View key={label} style={{ gap: 6, padding: SPACE.m, borderRadius: 16, backgroundColor: highlight ? c.surface2 : 'transparent', borderWidth: 1, borderColor: highlight ? c.accent : c.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt variant="label" style={{ flex: 1 }}>{label}</Txt>
        <Txt variant="numLg" color={highlight ? c.good : undefined} style={{ fontSize: 18 }}>{m(p.cash)}</Txt>
      </View>
      <StackBar
        parts={[
          { value: p.cash, color: c.good },
          { value: p.corpTax, color: c.blue },
          { value: p.personalTax, color: c.violet },
          { value: p.contributions + p.employerCost, color: c.amber },
        ]}
        height={8}
      />
      <Txt variant="small" dim>
        {s.salaryLabel} {m(p.salary)} · {s.dividendsLabel} {m(p.dividends)} · {s.burden} {pct(p.burden, lang)}
      </Txt>
    </View>
  );

  return (
    <Screen title={s.ownerTitle} subtitle={s.appName} right={<TablesBadge />}>
      <ProvinceChip />
      <TipCard id="owner" text={s.tips.owner} />
      <Card>
        <NumberField label={s.profit} value={v.profit} onChange={(n) => upd({ profit: n })} />
        <ToggleRow label={s.eiOptOut} hint={s.eiOptOutHint} value={v.eiExempt} onChange={(x) => upd({ eiExempt: x })} />
        <ToggleRow label={s.psb} hint={s.psbHint} value={v.psb} onChange={(x) => upd({ psb: x })} />
        {prov === 'QC' && !v.psb ? <NumberField label={s.qcHours} value={v.qcHours} onChange={(n) => upd({ qcHours: Math.round(n) })} prefix="" decimals={0} hint={s.qcHoursHint} /> : null}
      </Card>

      <Hero>
        <Txt variant="tiny" color="rgba(255,255,255,0.8)">{s.bestMix}</Txt>
        <Txt variant="hero" color="#FFFFFF">{m(b.cash)}</Txt>
        <Txt variant="small" color="rgba(255,255,255,0.9)">
          {s.salaryLabel} {m(b.salary)} + {s.dividendsLabel} {m(b.dividends)}
        </Txt>
      </Hero>

      <Card title={s.chartTitle} icon="analytics-outline">
        <LineChart
          points={curve.points.map((p) => ({ x: p.salary, y: p.cash }))}
          highlight={{ x: b.salary, y: b.cash }}
          formatX={(x) => m(x)}
          formatY={(y) => m(y)}
        />
      </Card>

      <Card>
        {option(s.bestMix, b, true)}
        {option(s.allSalary, curve.allSalary)}
        {option(s.allDividends, curve.allDividends)}
        {option(`${s.salaryToYmpe} (${m(prov === 'QC' ? pack.qpp.ympe : pack.cpp.ympe)})`, curve.ympe)}
      </Card>

      <Card title={s.bestMix} icon="pie-chart-outline">
        <Row label={s.salaryLabel} value={m(b.salary)} />
        <Row label={s.dividendsLabel} value={m(b.dividends)} />
        <Divider />
        <Row label={s.corpTaxLabel} value={m(b.corpTax)} dot={c.blue} />
        <Row label={s.personalTaxLabel} value={m(b.personalTax)} dot={c.violet} />
        <Row label={s.contributionsLabel} value={m(b.contributions + b.employerCost)} dot={c.amber} />
        <Divider />
        <Row label={s.cashInHand} value={m(b.cash)} strong dot={c.good} />
        <Row label={s.rrspRoom} value={m(b.rrspRoom)} />
        <Row label={s.pensionBuilt} value={m(b.pensionPaid)} />
      </Card>
      <Note>{s.ownerNote}</Note>
    </Screen>
  );
}

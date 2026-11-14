import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useApp } from '../state/app';
import { money, pct } from '../i18n';
import { salesTax, type TaxLine } from '../tax/engine/sales';
import { Card, Divider, Hero, Note, NumberField, Row, Screen, Segmented, Txt } from '../ui/kit';
import { ProvinceChip } from '../ui/ProvincePicker';
import { TipCard } from '../ui/TipCard';
import { TablesBadge } from '../ui/TablesBadge';
import { SPACE } from '../theme';

export function SalesScreen() {
  const { prefs, set, pack, lang, s, c } = useApp();
  const v = prefs.sales;
  const upd = (patch: Partial<typeof v>) => set('sales', (x) => ({ ...x, ...patch }));
  const r = useMemo(
    () => salesTax(pack, { prov: prefs.prov, sales: v.sales, taxablePurchases: v.purchases, activity: v.activity, priorTaxIncludedSales: v.prior }),
    [pack, prefs.prov, v],
  );
  const m = (n: number) => money(n, lang);
  const quickWins = r.savings >= 0;
  const fedName = r.federalLabel;

  const block = (title: string, line: TaxLine, quickRate: number | undefined, mode: 'regular' | 'quick') =>
    mode === 'regular' ? (
      <View style={{ gap: 6 }}>
        <Txt variant="tiny" dim>{title}</Txt>
        <Row label={s.collected} value={m(line.collected)} />
        <Row label={s.itrs} value={`− ${m(line.itc)}`} />
        <Row label={s.remittance} value={m(line.regular)} strong />
      </View>
    ) : (
      <View style={{ gap: 6 }}>
        <Txt variant="tiny" dim>{title}</Txt>
        <Row label={s.rateOnSales(pct(quickRate ?? 0, lang))} value={m(line.quick + line.quickCredit)} />
        {line.quickCredit > 0 ? <Row label={s.credit1} value={`− ${m(line.quickCredit)}`} /> : null}
        <Row label={s.remittance} value={m(line.quick)} strong />
      </View>
    );

  return (
    <Screen title={s.salesTitle} subtitle={s.appName} right={<TablesBadge />}>
      <ProvinceChip />
      <TipCard id="sales" text={s.tips.sales} />
      <Card>
        <Txt variant="small" dim>{s.activity}</Txt>
        <Segmented options={[{ value: 'services', label: s.services }, { value: 'goods', label: s.goods }]} value={v.activity} onChange={(a) => upd({ activity: a })} />
        {v.activity === 'goods' ? <Note>{s.goodsHint}</Note> : null}
        <NumberField label={s.periodSales} value={v.sales} onChange={(n) => upd({ sales: n })} />
        <NumberField label={s.taxablePurchases} value={v.purchases} onChange={(n) => upd({ purchases: n })} />
        <NumberField label={s.priorSales} value={v.prior} onChange={(n) => upd({ prior: n })} hint={s.credit1} />
      </Card>

      <Hero>
        <Txt variant="tiny" color="rgba(255,255,255,0.8)">{quickWins ? s.savings : s.costsMore}</Txt>
        <Txt variant="hero" color="#FFFFFF">{m(Math.abs(r.savings))}</Txt>
        <View style={{ flexDirection: 'row', gap: SPACE.l }}>
          <View style={{ flex: 1 }}>
            <Txt variant="small" color="rgba(255,255,255,0.8)">{s.regularMethod}</Txt>
            <Txt variant="numLg" color="#FFFFFF">{m(r.totalRegular)}</Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="small" color="rgba(255,255,255,0.8)">{s.quickMethod}</Txt>
            <Txt variant="numLg" color="#FFFFFF">{m(r.totalQuick)}</Txt>
          </View>
        </View>
      </Hero>

      <Card title={s.regularMethod} icon="receipt-outline">
        {block(`${fedName} ${pct(r.federalRate, lang, r.federalRate === 0.05 ? 0 : 0)}`, r.federal, undefined, 'regular')}
        {r.qst ? (
          <>
            <Divider />
            {block(`QST ${pct(0.09975, lang, 3)}`, r.qst, undefined, 'regular')}
          </>
        ) : null}
      </Card>

      <Card title={s.quickMethod} icon="flash-outline">
        <Row label={s.taxIncludedSales} value={m(r.taxIncludedSales)} />
        <Divider />
        {block(fedName, r.federal, r.quickRates.federal, 'quick')}
        {r.qst ? (
          <>
            <Divider />
            {block('QST', r.qst, r.quickRates.qst, 'quick')}
          </>
        ) : null}
        <Divider />
        <Row label={s.quickGain} value={m(r.quickGain)} valueColor={c.amber} />
        <Note tone="warn">{s.quickEligibility}</Note>
      </Card>

      {r.pstCollected > 0 ? (
        <Card>
          <Row label={s.pstCollected(r.pstName ?? 'PST')} value={m(r.pstCollected)} strong />
        </Card>
      ) : null}
    </Screen>
  );
}

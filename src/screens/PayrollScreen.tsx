import React, { useMemo, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { money, pct } from '../i18n';
import { PROVINCES } from '../tax/types';
import { calcPeriod, calcYear, grossForNet, type PeriodResult } from '../tax/engine/payroll';
import { amountAt } from '../tax/engine/common';
import { Button, Card, Collapsible, Divider, Hero, Note, NumberField, Row, Screen, Segmented, Sheet, ToggleRow, Txt, tap } from '../ui/kit';
import { Donut, StackBar } from '../ui/charts';
import { ProvinceChip } from '../ui/ProvincePicker';
import { TablesBadge } from '../ui/TablesBadge';
import { SPACE } from '../theme';

const FREQS = [52, 26, 24, 12] as const;

export function PayrollScreen() {
  const { prefs, set, pack, lang, s, c } = useApp();
  const p = prefs.payroll;
  const prov = prefs.prov;
  const isQc = prov === 'QC';
  const [compare, setCompare] = useState(false);
  const upd = (patch: Partial<typeof p>) => set('payroll', (v) => ({ ...v, ...patch }));

  const base = {
    prov,
    periods: p.periods,
    eiExempt: p.eiExempt,
    pensionExempt: p.pensionExempt,
    wcbRate: p.wcbRate / 100,
    hsfRate: p.hsfPrimary ? pack.quebec.hsf.primaryManufacturing : pack.quebec.hsf.services,
    extraTax: p.extraTax,
    dependants: p.dependants,
    federalClaim: p.federalClaim > 0 ? p.federalClaim : undefined,
    provincialClaim: p.provincialClaim > 0 ? p.provincialClaim : undefined,
    vacationRate: p.vacationRate / 100,
  };
  const hasYtd = p.ytdGross > 0 || p.ytdPension > 0 || p.ytdEi > 0 || p.ytdQpip > 0;
  const perPeriodAmount = p.enterAnnual ? p.amount / p.periods : p.amount;
  const gross = useMemo(
    () => (p.reverse ? grossForNet(pack, base, perPeriodAmount) : perPeriodAmount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pack, p, prov],
  );
  const year = useMemo(() => calcYear(pack, { ...base, grossPerPeriod: gross }), [pack, gross, p, prov]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = useMemo(
    () =>
      hasYtd
        ? calcPeriod(pack, { ...base, grossPerPeriod: gross }, { pension: p.ytdPension, pension2: 0, pensionable: p.ytdGross, ei: p.ytdEi, qpip: p.ytdQpip }).result
        : year.first,
    [hasYtd, year, gross, p], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const t = year.totals;
  const pensionLabel = isQc ? s.qpp : s.cpp;
  const pension2Label = isQc ? s.qpp2 : s.cpp2;
  const provTaxLabel = isQc ? s.qcTax : s.provTax;
  const m = (n: number) => money(n, lang);
  const deductions = r.pension + r.pension2 + r.ei + r.qpip + r.federalTax + r.provincialTax;
  const segs = [
    { value: r.net, color: '#FFFFFF' },
    { value: r.federalTax, color: c.blue },
    { value: r.provincialTax, color: c.violet },
    { value: r.pension + r.pension2, color: c.amber },
    { value: r.ei + r.qpip, color: c.pink },
  ];
  const editionNote = pack.jurisdictions[prov].payroll?.editionNote;

  const shareText = () =>
    [
      `${s.appName} · ${pack.jurisdictions[prov].name[lang]} · ${pack.year}`,
      `${s.gross}: ${m(r.gross)} / ${s.freqShort[p.periods]}`,
      `${pensionLabel}: ${m(r.pension + r.pension2)}`,
      r.ei ? `${s.ei}: ${m(r.ei)}` : `${s.ei}: 0 (${s.eiOptOut})`,
      isQc ? `${s.qpip}: ${m(r.qpip)}` : '',
      `${s.fedTax}: ${m(r.federalTax)}`,
      `${provTaxLabel}: ${m(r.provincialTax)}`,
      `${s.netPay}: ${m(r.net)}`,
      `${s.employerCost}: ${m(r.employer.total)}`,
      isQc ? `${s.remitCra}: ${m(r.remit.cra)} · ${s.remitRq}: ${m(r.remit.rq)}` : `${s.remitCra}: ${m(r.remit.cra)}`,
    ]
      .filter(Boolean)
      .join('\n');

  return (
    <Screen title={s.payrollTitle} subtitle={s.appName} right={<TablesBadge />}>
      <ProvinceChip />

      <Card>
        <Segmented
          options={[
            { value: 'g', label: s.grossToNet },
            { value: 'n', label: s.netToGross },
          ]}
          value={p.reverse ? 'n' : 'g'}
          onChange={(v) => upd({ reverse: v === 'n' })}
        />
        <NumberField label={p.reverse ? s.takeHome : s.salary} value={p.amount} onChange={(v) => upd({ amount: v })} />
        <Segmented
          small
          options={[
            { value: 'y', label: s.perYear },
            { value: 'p', label: s.perPeriod },
          ]}
          value={p.enterAnnual ? 'y' : 'p'}
          onChange={(v) => {
            const annual = v === 'y';
            if (annual === p.enterAnnual) return;
            upd({ enterAnnual: annual, amount: Math.round(annual ? p.amount * p.periods : p.amount / p.periods) });
          }}
        />
        <Txt variant="small" dim>{s.frequency}</Txt>
        <Segmented small options={FREQS.map((f) => ({ value: f, label: s.freq[f] }))} value={(p.periods === 53 ? 52 : p.periods) as (typeof FREQS)[number]} onChange={(v) => upd({ periods: v })} />
        <Divider />
        <ToggleRow label={s.eiOptOut} hint={s.eiOptOutHint} value={p.eiExempt} onChange={(v) => upd({ eiExempt: v })} />
        <Collapsible title={s.advanced}>
          {p.periods === 52 || p.periods === 53 ? (
            <ToggleRow label={s.week53} hint={s.week53Hint} value={p.periods === 53} onChange={(v) => upd({ periods: v ? 53 : 52 })} />
          ) : null}
          <ToggleRow label={s.pensionExempt} hint={s.pensionExemptHint} value={p.pensionExempt} onChange={(v) => upd({ pensionExempt: v })} />
          <NumberField label={s.fedClaim} value={p.federalClaim} onChange={(v) => upd({ federalClaim: v })} hint={s.claimHint(m(pack.federal.bpa.max))} />
          <NumberField
            label={isQc ? s.provClaimQc : s.provClaim}
            value={p.provincialClaim}
            onChange={(v) => upd({ provincialClaim: v })}
            hint={s.claimHint(m(amountAt(pack.jurisdictions[prov].bpa === 'federal' ? pack.federal.bpa : (pack.jurisdictions[prov].payroll?.bpa ?? (pack.jurisdictions[prov].bpa as number)), 0)))}
          />
          <NumberField label={s.vacation} value={p.vacationRate} onChange={(v) => upd({ vacationRate: v })} prefix="" suffix="%" decimals={2} />
          <NumberField label={s.wcb} value={p.wcbRate} onChange={(v) => upd({ wcbRate: v })} prefix="" suffix="%" decimals={3} />
          {isQc ? (
            <>
              <Txt variant="small" dim>{s.hsfRate}</Txt>
              <Segmented small options={[{ value: 's', label: s.hsfServices }, { value: 'p', label: s.hsfPrimary }]} value={p.hsfPrimary ? 'p' : 's'} onChange={(v) => upd({ hsfPrimary: v === 'p' })} />
            </>
          ) : null}
          <NumberField label={s.extraTax} value={p.extraTax} onChange={(v) => upd({ extraTax: v })} />
          <Divider />
          <Txt variant="label">{s.ytdTitle}</Txt>
          <Note>{s.ytdHint}</Note>
          <NumberField label={s.ytdGross} value={p.ytdGross} onChange={(v) => upd({ ytdGross: v })} />
          <NumberField label={s.ytdPension(pensionLabel)} value={p.ytdPension} onChange={(v) => upd({ ytdPension: v })} />
          {!p.eiExempt ? <NumberField label={s.ytdEi} value={p.ytdEi} onChange={(v) => upd({ ytdEi: v })} /> : null}
          {isQc ? <NumberField label={s.ytdQpip} value={p.ytdQpip} onChange={(v) => upd({ ytdQpip: v })} /> : null}
          {prov === 'ON' ? <NumberField label={s.dependants} value={p.dependants} onChange={(v) => upd({ dependants: Math.round(v) })} prefix="" decimals={0} /> : null}
        </Collapsible>
      </Card>

      <Hero>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.l }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="tiny" color="rgba(255,255,255,0.8)">{s.netPay} · {s.freqShort[p.periods]}</Txt>
            <Txt variant="hero" color="#FFFFFF" numberOfLines={1}>{m(r.net)}</Txt>
            <Txt variant="small" color="rgba(255,255,255,0.85)">
              {s.gross} {m(r.gross)} · {m(t.net)} {s.perYear}
            </Txt>
          </View>
          <Donut size={92} stroke={12} segments={segs}>
            <Txt variant="num" color="#FFFFFF">{pct(r.gross ? r.net / r.gross : 0, lang, 0)}</Txt>
          </Donut>
        </View>
        {hasYtd ? <Txt variant="small" color="rgba(255,255,255,0.8)">{s.thisPayYtd}</Txt> : null}
        {editionNote ? (
          <Txt variant="small" color="rgba(255,255,255,0.8)">{s.editionNote}: {editionNote}</Txt>
        ) : null}
      </Hero>

      <Card title={s.employeeDeductions} icon="person-outline">
        <StackBar parts={segs.slice(1)} />
        <Row label={pensionLabel} value={m(r.pension)} dot={c.amber} />
        {r.pension2 > 0 || t.pension2 > 0 ? <Row label={pension2Label} value={m(r.pension2)} dot={c.amber} sub={`${m(t.pension2)} ${s.perYear}`} /> : null}
        <Row label={s.ei} value={p.eiExempt ? '—' : m(r.ei)} dot={c.pink} />
        {isQc ? <Row label={s.qpip} value={m(r.qpip)} dot={c.pink} /> : null}
        <Row label={s.fedTax} value={m(r.federalTax)} dot={c.blue} />
        <Row label={provTaxLabel} value={m(r.provincialTax)} dot={c.violet} />
        <Divider />
        <Row label={s.totalDeductions} value={m(deductions)} strong />
      </Card>

      <Card title={s.employerCost} icon="business-outline">
        <Row label={pensionLabel} value={m(r.employer.pension + r.employer.pension2)} />
        {!p.eiExempt ? <Row label={`${s.ei} (×${pack.ei.employerFactor})`} value={m(r.employer.ei)} /> : null}
        {isQc ? (
          <>
            <Row label={s.qpip} value={m(r.employer.qpip)} />
            <Row label={s.hsf} value={m(r.employer.hsf)} />
            <Row label={s.cnt} value={m(r.employer.cnt)} />
          </>
        ) : null}
        {r.employer.wcb ? <Row label={s.wcbShort} value={m(r.employer.wcb)} /> : null}
        {r.employer.vacation ? <Row label={s.vacationShort} value={m(r.employer.vacation)} /> : null}
        <Divider />
        <Row label={s.totalCost} value={m(r.totalCost)} strong sub={`${m(t.totalCost)} ${s.perYear}`} />
      </Card>

      <Card title={s.remittances} icon="paper-plane-outline">
        <Row label={s.remitCra} value={m(r.remit.cra)} strong />
        {isQc ? <Row label={s.remitRq} value={m(r.remit.rq)} strong /> : null}
        <Note>{s.remitDue}</Note>
        {isQc ? <Note>{s.remitCraQcNote}</Note> : null}
      </Card>

      <Card title={s.schedule} icon="calendar-outline">
        <Note>{s.scheduleHint}</Note>
        <Schedule periods={year.periods} perYear={p.periods} first={r} />
        <Divider />
        <Txt variant="label">{s.annualTotals}</Txt>
        <Row label={s.gross} value={m(t.gross)} />
        <Row label={`${pensionLabel} + ${pension2Label}`} value={m(t.pension + t.pension2)} />
        {!p.eiExempt ? <Row label={s.ei} value={m(t.ei)} /> : null}
        {isQc ? <Row label={s.qpip} value={m(t.qpip)} /> : null}
        <Row label={s.incomeTax} value={m(t.federalTax + t.provincialTax)} sub={`${pct(t.gross ? (t.federalTax + t.provincialTax) / t.gross : 0, lang)} ${s.effective}`} />
        <Row label={s.netPay} value={m(t.net)} strong />
      </Card>

      <Button label={s.compareProvinces} icon="git-compare-outline" onPress={() => setCompare(true)} />
      <Button label={s.share} icon="share-outline" kind="secondary" onPress={() => Share.share({ message: shareText() }).catch(() => undefined)} />

      <Sheet visible={compare} onClose={() => setCompare(false)} title={`${s.compareTitle} · ${m(r.gross)}`}>
        <CompareTable gross={r.gross} />
      </Sheet>
    </Screen>
  );

  function CompareTable({ gross: g }: { gross: number }) {
    const rows = PROVINCES.map((pv) => {
      const y = calcYear(pack, { ...base, prov: pv, grossPerPeriod: g, hsfRate: pack.quebec.hsf.services });
      return { pv, net: y.first.net, tax: y.totals.federalTax + y.totals.provincialTax, gross: y.totals.gross, cost: y.first.totalCost };
    }).sort((a, b) => b.net - a.net);
    return (
      <>
        {rows.map((row, i) => {
          const on = row.pv === prov;
          return (
            <Pressable
              key={row.pv}
              onPress={() => {
                tap();
                set('prov', row.pv);
                setCompare(false);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.m, padding: SPACE.m, borderRadius: 14, backgroundColor: on ? c.surface2 : c.surface }}
            >
              <Txt variant="num" dim style={{ width: 22 }}>{i + 1}</Txt>
              <View style={{ flex: 1 }}>
                <Txt variant="label">{pack.jurisdictions[row.pv].name[lang]}</Txt>
                <Txt variant="small" dim>
                  {s.incomeTax} {money(row.tax, lang, false)} {s.perYear} · {pct(row.gross ? row.tax / row.gross : 0, lang)}
                </Txt>
              </View>
              <Txt variant="num" color={i === 0 ? c.good : undefined}>{m(row.net)}</Txt>
              {on ? <Ionicons name="location" size={16} color={c.accent} /> : null}
            </Pressable>
          );
        })}
      </>
    );
  }
}

function Schedule({ periods, perYear, first }: { periods: PeriodResult[]; perYear: number; first: PeriodResult }) {
  const { lang, c, s } = useApp();
  const months = Array.from({ length: 12 }, (_, i) => ({ net: 0, remit: 0, capped: false, n: 0 }));
  periods.forEach((pr, i) => {
    const mi = Math.min(11, Math.floor((i * 12) / perYear));
    months[mi].net += pr.net;
    months[mi].remit += pr.remit.cra + pr.remit.rq;
    months[mi].n += 1;
    if ((first.pension > 0 && pr.pension < first.pension - 0.01) || (first.ei > 0 && pr.ei < first.ei - 0.01)) months[mi].capped = true;
  });
  const fmt = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short' });
  const maxNet = Math.max(...months.map((x) => x.net), 1);
  return (
    <View style={{ gap: 6 }}>
      {months.map((mo, i) =>
        mo.n === 0 ? null : (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s }}>
            <Txt variant="small" dim style={{ width: 40 }}>{fmt.format(new Date(2026, i, 15))}</Txt>
            <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c.surface2, overflow: 'hidden' }}>
              <View style={{ width: `${(mo.net / maxNet) * 100}%`, height: 8, backgroundColor: mo.capped ? c.good : c.blue, borderRadius: 4 }} />
            </View>
            <Txt variant="num" style={{ width: 100, textAlign: 'right', fontSize: 13 }}>{money(mo.net, lang, false)}</Txt>
            {mo.capped ? <Ionicons name="trending-up" size={14} color={c.good} accessibilityLabel={s.maxReached} /> : <View style={{ width: 14 }} />}
          </View>
        ),
      )}
    </View>
  );
}

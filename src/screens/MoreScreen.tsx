import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { Button, Card, Divider, Note, Row, Screen, Segmented, ToggleRow, Txt } from '../ui/kit';
import { Logo } from '../ui/Logo';
import { SPACE } from '../theme';

export function MoreScreen() {
  const { prefs, set, pack, packSource, years, lastChecked, status, check, lang, s, c } = useApp();
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : s.never);
  const statusText =
    status.kind === 'checking'
      ? s.checking
      : status.kind === 'upToDate'
        ? s.upToDate
        : status.kind === 'updated'
          ? s.updated(status.versions.join(', '))
          : status.kind === 'offline'
            ? s.offline
            : status.kind === 'rejected'
              ? s.updateFailed(status.error)
              : null;
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen title={s.moreTitle} subtitle={s.appName}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.m }}>
          <Logo size={56} />
          <View style={{ flex: 1 }}>
            <Txt variant="heading">{s.appName}</Txt>
            <Txt variant="small" dim>{s.tagline}</Txt>
          </View>
        </View>
      </Card>

      <Card title={s.taxTables} icon="library-outline">
        {years.length > 1 ? (
          <>
            <Txt variant="small" dim>{s.taxYear}</Txt>
            <Segmented options={years.map((y) => ({ value: y, label: String(y) }))} value={pack.year} onChange={(y) => set('year', y)} />
          </>
        ) : null}
        <Row label={s.taxYear} value={String(pack.year)} />
        <Row label={s.version} value={`${pack.version} (${packSource === 'bundled' ? s.bundled : s.downloaded})`} />
        <View style={{ gap: 2 }}>
          <Txt variant="small" dim>{s.edition}</Txt>
          <Txt variant="small">CRA: {pack.editions.cra}</Txt>
          <Txt variant="small">Revenu Québec: {pack.editions.rq}</Txt>
        </View>
        <Row label={s.lastChecked} value={fmt(lastChecked)} />
        {statusText ? <Note tone={status.kind === 'rejected' || status.kind === 'offline' ? 'warn' : status.kind === 'updated' ? 'good' : undefined}>{statusText}</Note> : null}
        <Button label={status.kind === 'checking' ? s.checking : s.checkNow} icon="cloud-download-outline" onPress={() => void check()} disabled={status.kind === 'checking'} />
        <ToggleRow label={s.autoUpdate} value={prefs.autoUpdate} onChange={(v) => set('autoUpdate', v)} />
      </Card>

      <Card title={s.language} icon="language-outline">
        <Segmented options={[{ value: 'auto', label: s.auto }, { value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]} value={prefs.lang} onChange={(v) => set('lang', v)} />
        <Txt variant="small" dim>{s.appearance}</Txt>
        <Segmented options={[{ value: 'auto', label: s.auto }, { value: 'light', label: s.light }, { value: 'dark', label: s.dark }]} value={prefs.theme} onChange={(v) => set('theme', v)} />
      </Card>

      <Card title={s.sources} icon="link-outline">
        {pack.sources.map((src, i) => (
          <React.Fragment key={src.url}>
            {i > 0 ? <Divider /> : null}
            <Pressable onPress={() => Linking.openURL(src.url).catch(() => undefined)} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s }} accessibilityRole="link">
              <Txt variant="body" style={{ flex: 1 }}>{src.label}</Txt>
              <Ionicons name="open-outline" size={16} color={c.dim} />
            </Pressable>
          </React.Fragment>
        ))}
      </Card>

      <Card title={s.privacyTitle} icon="lock-closed-outline">
        <Txt variant="body" dim>{s.privacyBody}</Txt>
      </Card>
      <Card title={s.disclaimerTitle} icon="alert-circle-outline">
        <Txt variant="body" dim>{s.disclaimer}</Txt>
      </Card>
      <Button label={s.contact} icon="mail-outline" kind="secondary" onPress={() => Linking.openURL('mailto:support@cibinc.ca?subject=Remit%20North').catch(() => undefined)} />
      <Txt variant="small" dim center>
        {s.appName} {version} · Consultation Behtoyi Inc.
      </Txt>
    </Screen>
  );
}

/**
 * First run: a short animated intro (logo, name, tagline), then a swipeable five-step guide that ends with
 * province and owner setup. Skippable at any moment; replayable from Settings.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/app';
import { money } from '../i18n';
import { PROVINCES } from '../tax/types';
import { calcPeriod } from '../tax/engine/payroll';
import { Logo } from '../ui/Logo';
import { Donut, LineChart } from '../ui/charts';
import { Button, Hero, Segmented, ToggleRow, Txt, tap } from '../ui/kit';
import { F, RADIUS, SPACE } from '../theme';

const PAGES = 5;
const native = Platform.OS !== 'web';

/** Gentle floating motion for the illustrations. */
function useFloat(delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1800, delay, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(v, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] };
}

/** Navy backdrop with a soft maple-red glow, like the app icon. */
function Backdrop() {
  const { width, height } = useWindowDimensions();
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
      <Defs>
        <RadialGradient id="ob-glow" gradientUnits="userSpaceOnUse" cx={width / 2} cy={height * 0.2} r={Math.max(width, height) * 0.6}>
          <Stop offset="0" stopColor="#E8343A" stopOpacity="0.28" />
          <Stop offset="0.55" stopColor="#1A2646" stopOpacity="0.4" />
          <Stop offset="1" stopColor="#0A0F1C" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="#0A0F1C" />
      <Rect width={width} height={height} fill="url(#ob-glow)" />
    </Svg>
  );
}

// ---------- Intro ----------

function Intro({ onDone }: { onDone: () => void }) {
  const { s } = useApp();
  const scale = useRef(new Animated.Value(0.4)).current;
  const spin = useRef(new Animated.Value(-0.08)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const title = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: native }),
        Animated.timing(spin, { toValue: 0, duration: 700, easing: Easing.out(Easing.back(2)), useNativeDriver: native }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 350, useNativeDriver: native }),
        Animated.timing(ring, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      ]),
      Animated.timing(title, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      Animated.timing(tagline, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      Animated.delay(900),
    ]);
    anim.start(({ finished }) => finished && onDone());
    return () => anim.stop();
  }, [scale, spin, logoOpacity, title, tagline, ring, onDone]);
  const rise = (v: Animated.Value) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] });
  return (
    <Pressable style={styles.center} onPress={onDone} accessibilityRole="button" accessibilityLabel={s.onboarding.next}>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            position: 'absolute',
            width: 220,
            height: 220,
            borderRadius: 110,
            borderWidth: 2,
            borderColor: 'rgba(232,52,58,0.45)',
            opacity: ring.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] }) }],
          }}
        />
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [{ scale }, { rotate: spin.interpolate({ inputRange: [-1, 1], outputRange: ['-180deg', '180deg'] }) }],
            shadowColor: '#E8343A',
            shadowOpacity: 0.45,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 10 },
          }}
        >
          <Logo size={128} />
        </Animated.View>
      </View>
      <Animated.View style={[{ marginTop: SPACE.xxl, alignItems: 'center' }, rise(title)]}>
        <Txt variant="hero" color="#FFFFFF" style={{ fontSize: 36 }}>Remit North</Txt>
      </Animated.View>
      <Animated.View style={[{ marginTop: SPACE.s }, rise(tagline)]}>
        <Txt variant="body" color="rgba(255,255,255,0.75)" center>{s.tagline}</Txt>
      </Animated.View>
    </Pressable>
  );
}

// ---------- Illustrations ----------

function PayrollArt() {
  const { pack, lang, c } = useApp();
  const float = useFloat();
  const float2 = useFloat(600);
  const r = useMemo(() => calcPeriod(pack, { prov: 'QC', grossPerPeriod: 6000, periods: 12 }).result, [pack]);
  const m = (n: number) => money(n, lang);
  const rows: [string, number, string][] = [
    [lang === 'fr' ? 'Impôt fédéral' : 'Federal tax', r.federalTax, c.blue],
    [lang === 'fr' ? 'Impôt du Québec' : 'Quebec tax', r.provincialTax, c.violet],
    ['QPP / RRQ', r.pension, c.amber],
  ];
  return (
    <View style={{ width: '100%', gap: SPACE.m }}>
      <Animated.View style={float}>
        <Hero style={{ padding: SPACE.l }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.m }}>
            <View style={{ flex: 1 }}>
              <Txt variant="tiny" color="rgba(255,255,255,0.8)">{lang === 'fr' ? 'Paie nette' : 'Net pay'}</Txt>
              <Txt variant="hero" color="#FFFFFF" style={{ fontSize: 30 }}>{money(r.net, lang, false)}</Txt>
            </View>
            <Donut
              size={74}
              stroke={10}
              segments={[
                { value: r.net, color: '#FFFFFF' },
                { value: r.federalTax, color: c.blue },
                { value: r.provincialTax, color: c.violet },
                { value: r.pension, color: c.amber },
                { value: r.ei + r.qpip, color: c.pink },
              ]}
            />
          </View>
        </Hero>
      </Animated.View>
      <Animated.View style={[styles.glass, float2]}>
        {rows.map(([label, v, col]) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: col }} />
            <Txt variant="small" color="rgba(255,255,255,0.75)" style={{ flex: 1 }}>{label}</Txt>
            <Txt variant="num" color="#FFFFFF">{m(v)}</Txt>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

function SalesArt() {
  const { lang, c } = useApp();
  const grow = useRef(new Animated.Value(0)).current;
  const float = useFloat(300);
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(grow, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.delay(1800),
        Animated.timing(grow, { toValue: 0, duration: 500, useNativeDriver: false }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [grow]);
  const bar = (label: string, amount: number, pct: number, color: string) => (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt variant="small" color="rgba(255,255,255,0.8)">{label}</Txt>
        <Txt variant="num" color="#FFFFFF">{money(amount, lang, false)}</Txt>
      </View>
      <View style={{ height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <Animated.View style={{ height: 14, borderRadius: 7, backgroundColor: color, width: grow.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${pct}%`] }) }} />
      </View>
    </View>
  );
  return (
    <Animated.View style={[styles.glass, { width: '100%', gap: SPACE.l, padding: SPACE.xl }, float]}>
      {bar(lang === 'fr' ? 'Méthode normale' : 'Regular method', 7038, 100, c.blue)}
      {bar(lang === 'fr' ? 'Méthode rapide' : 'Quick Method', 5264, 75, c.accent)}
      <View style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(46,230,168,0.15)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
        <Ionicons name="sparkles" size={14} color={c.good} />
        <Txt variant="label" color={c.good}>{lang === 'fr' ? 'Économie de 1 775 $' : 'You save $1,775'}</Txt>
      </View>
    </Animated.View>
  );
}

function OwnerArt() {
  const { lang } = useApp();
  const float = useFloat(200);
  const pts = Array.from({ length: 21 }, (_, i) => {
    const x = i * 7500;
    const y = 92000 - Math.pow((x - 52000) / 1000, 2) * 2.2 + (i % 3) * 120;
    return { x, y };
  });
  const best = pts.reduce((a, b) => (b.y > a.y ? b : a));
  return (
    <Animated.View style={[styles.glass, { width: '100%', padding: SPACE.l }, float]}>
      <Txt variant="small" color="rgba(255,255,255,0.75)">{lang === 'fr' ? 'Net en main selon le salaire' : 'Cash in hand by salary'}</Txt>
      <LineChart points={pts} highlight={best} height={150} formatX={(x) => money(x, lang, false)} formatY={() => ''} />
    </Animated.View>
  );
}

// ---------- Guide ----------

function Page({ width, children, title, body }: { width: number; children: React.ReactNode; title: string; body: string }) {
  return (
    <View style={{ width, paddingHorizontal: SPACE.xl, justifyContent: 'center' }}>
      <View style={{ minHeight: 280, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
      <View style={{ marginTop: SPACE.xl, gap: SPACE.s }}>
        <Txt variant="title" color="#FFFFFF" style={{ fontSize: 26 }}>{title}</Txt>
        <Txt variant="body" color="rgba(255,255,255,0.75)" style={{ fontSize: 16, lineHeight: 23 }}>{body}</Txt>
      </View>
    </View>
  );
}

function Guide({ onFinish }: { onFinish: () => void }) {
  const { prefs, set, pack, lang, s, c } = useApp();
  const o = s.onboarding;
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const width = Math.min(winW, 560);
  const scrollX = useRef(new Animated.Value(0)).current;
  const ref = useRef<{ scrollTo: (o: { x: number; animated: boolean }) => void } | null>(null);
  const [page, setPage] = useState(0);
  const fadeIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: native }).start();
  }, [fadeIn]);

  const go = (i: number) => {
    tap();
    ref.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  const owner = prefs.payroll.eiExempt;
  const setOwner = (v: boolean) => {
    set('payroll', (p) => ({ ...p, eiExempt: v }));
    set('owner', (p) => ({ ...p, eiExempt: v }));
  };

  return (
    <Animated.View style={{ flex: 1, opacity: fadeIn, paddingTop: insets.top, paddingBottom: insets.bottom + SPACE.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.xl, paddingVertical: SPACE.m, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <Txt variant="tiny" color="rgba(255,255,255,0.55)">{o.page(page + 1, PAGES)}</Txt>
        {page < PAGES - 1 ? (
          <Pressable onPress={onFinish} hitSlop={12} accessibilityRole="button" accessibilityLabel={o.skip}>
            <Txt variant="label" color="rgba(255,255,255,0.8)">{o.skip}</Txt>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flex: 1, width, alignSelf: 'center' }}>
        <Animated.ScrollView
          ref={ref as never}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={onScrollEnd}
          onScrollEndDrag={Platform.OS === 'web' ? onScrollEnd : undefined}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
          contentContainerStyle={{ alignItems: 'center' }}
        >
          <Page width={width} title={o.welcomeTitle} body={o.welcomeBody}>
            <View style={{ alignItems: 'center', gap: SPACE.xl, width: '100%' }}>
              <Logo size={112} />
              <View style={{ width: '100%', gap: SPACE.s }}>
                <Txt variant="tiny" color="rgba(255,255,255,0.55)">{o.chooseLanguage}</Txt>
                <Segmented
                  options={[
                    { value: 'en', label: 'English' },
                    { value: 'fr', label: 'Français' },
                  ]}
                  value={lang}
                  onChange={(v) => set('lang', v)}
                />
              </View>
            </View>
          </Page>
          <Page width={width} title={o.payrollTitle} body={o.payrollBody}>
            <PayrollArt />
          </Page>
          <Page width={width} title={o.salesTitle} body={o.salesBody}>
            <SalesArt />
          </Page>
          <Page width={width} title={o.corpTitle} body={o.corpBody}>
            <OwnerArt />
          </Page>
          <View style={{ width, paddingHorizontal: SPACE.xl, gap: SPACE.m }}>
            <Txt variant="title" color="#FFFFFF" style={{ fontSize: 26 }}>{o.setupTitle}</Txt>
            <Txt variant="body" color="rgba(255,255,255,0.75)">{o.setupBody}</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PROVINCES.map((p) => {
                const on = p === prefs.prov;
                return (
                  <Pressable
                    key={p}
                    onPress={() => {
                      tap();
                      set('prov', p);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={pack.jurisdictions[p].name[lang]}
                    style={{
                      width: '22%',
                      flexGrow: 1,
                      paddingVertical: 12,
                      borderRadius: RADIUS.m,
                      alignItems: 'center',
                      backgroundColor: on ? c.accent : 'rgba(255,255,255,0.07)',
                      borderWidth: 1,
                      borderColor: on ? c.accent : 'rgba(255,255,255,0.12)',
                    }}
                  >
                    <Txt variant="label" color="#FFFFFF" style={{ fontFamily: F.uiBold }}>{p}</Txt>
                  </Pressable>
                );
              })}
            </View>
            <Txt variant="small" color="rgba(255,255,255,0.7)">{pack.jurisdictions[prefs.prov].name[lang]}</Txt>
            <View style={[styles.glass, { padding: SPACE.l }]}>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1 }}>
                  <OwnerToggle label={o.ownerQ} hint={o.ownerHint} value={owner} onChange={setOwner} />
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: SPACE.s, alignItems: 'flex-start' }}>
              <Ionicons name="shield-checkmark" size={18} color={c.good} style={{ marginTop: 2 }} />
              <Txt variant="small" color="rgba(255,255,255,0.7)" style={{ flex: 1 }}>{o.trust}</Txt>
            </View>
          </View>
        </Animated.ScrollView>
      </View>

      <View style={{ paddingHorizontal: SPACE.xl, gap: SPACE.l, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {Array.from({ length: PAGES }, (_, i) => (
            <Pressable key={i} onPress={() => go(i)} hitSlop={8} accessibilityLabel={o.page(i + 1, PAGES)}>
              <Animated.View
                style={{
                  height: 8,
                  borderRadius: 4,
                  width: scrollX.interpolate({ inputRange: [(i - 1) * width, i * width, (i + 1) * width], outputRange: [8, 26, 8], extrapolate: 'clamp' }),
                  backgroundColor: scrollX.interpolate({
                    inputRange: [(i - 1) * width, i * width, (i + 1) * width],
                    outputRange: ['rgba(255,255,255,0.25)', '#E8343A', 'rgba(255,255,255,0.25)'],
                    extrapolate: 'clamp',
                  }),
                }}
              />
            </Pressable>
          ))}
        </View>
        {page < PAGES - 1 ? (
          <Button label={o.next} icon="arrow-forward" onPress={() => go(page + 1)} />
        ) : (
          <Button label={o.start} icon="checkmark" onPress={onFinish} />
        )}
      </View>
    </Animated.View>
  );
}

/** ToggleRow with white text for the dark onboarding backdrop. */
function OwnerToggle(props: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View>
      <ToggleRow label={props.label} hint={props.hint} value={props.value} onChange={props.onChange} />
    </View>
  );
}

export function Onboarding({ onDone, skipIntro }: { onDone: () => void; skipIntro?: boolean }) {
  const [phase, setPhase] = useState<'intro' | 'guide'>(skipIntro ? 'guide' : 'intro');
  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      {phase === 'intro' ? <Intro onDone={() => setPhase('guide')} /> : <Guide onFinish={onDone} />}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xl },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.l,
    padding: SPACE.l,
    gap: SPACE.s,
  },
});

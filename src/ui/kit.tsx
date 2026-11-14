import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/app';
import { F, RADIUS, SPACE, type Palette } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
};

const SIZES = {
  hero: { fontFamily: F.display, fontSize: 38, letterSpacing: -1 },
  num: { fontFamily: F.displayMedium, fontSize: 15, letterSpacing: -0.2 },
  numLg: { fontFamily: F.display, fontSize: 22, letterSpacing: -0.5 },
  title: { fontFamily: F.display, fontSize: 24, letterSpacing: -0.5 },
  heading: { fontFamily: F.uiBold, fontSize: 17 },
  body: { fontFamily: F.ui, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: F.ui, fontSize: 13, lineHeight: 18 },
  tiny: { fontFamily: F.uiSemi, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  label: { fontFamily: F.uiSemi, fontSize: 14 },
} as const;

/** Shrinks the headline number so long amounts fit on one line. */
function heroSize(text: string) {
  const n = text.length;
  return n <= 7 ? 38 : n <= 8 ? 34 : n <= 10 ? 28 : n <= 12 ? 25 : 21;
}

export function Txt({
  children,
  variant = 'body',
  color,
  dim,
  style,
  center,
  numberOfLines,
}: {
  children: React.ReactNode;
  variant?: keyof typeof SIZES;
  color?: string;
  dim?: boolean;
  style?: StyleProp<TextStyle>;
  center?: boolean;
  numberOfLines?: number;
}) {
  const { c } = useApp();
  return (
    <Text
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={1.35}
      style={[SIZES[variant], variant === 'hero' && typeof children === 'string' ? { fontSize: heroSize(children) } : null, { color: color ?? (dim ? c.dim : c.text) }, center && { textAlign: 'center' }, style]}
    >
      {children}
    </Text>
  );
}

export function Screen({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const { c } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingTop: insets.top + SPACE.m, paddingHorizontal: SPACE.l, paddingBottom: 120, gap: SPACE.m, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
        <View style={{ flex: 1 }}>
          {subtitle ? <Txt variant="tiny" dim>{subtitle}</Txt> : null}
          <Txt variant="title">{title}</Txt>
        </View>
        {right}
      </View>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, title, icon, right }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; title?: string; icon?: IconName; right?: React.ReactNode }) {
  const { c } = useApp();
  return (
    <View style={[{ backgroundColor: c.surface, borderRadius: RADIUS.l, padding: SPACE.l, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, gap: SPACE.m }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s }}>
          {icon ? <Ionicons name={icon} size={18} color={c.accent} /> : null}
          <Txt variant="heading" style={{ flex: 1 }}>{title}</Txt>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Aurora gradient card for the headline number. */
export function Hero({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useApp();
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[{ borderRadius: RADIUS.xl, overflow: 'hidden', padding: SPACE.xl, gap: SPACE.s }, style]}
    >
      <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h}>
        <Defs>
          <LinearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c.heroFrom} />
            <Stop offset="1" stopColor={c.heroTo} />
          </LinearGradient>
          <LinearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.accent} stopOpacity="0.28" />
            <Stop offset="1" stopColor={c.accent} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={size.w} height={size.h} fill="url(#hero)" />
        <Rect x={size.w * 0.45} y={-size.h * 0.6} width={size.w} height={size.h * 1.2} rx={size.h * 0.6} fill="url(#sheen)" />
      </Svg>
      {children}
    </View>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  small,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
}) {
  const { c } = useApp();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surface2, borderRadius: RADIUS.m, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              paddingVertical: small ? 7 : 9,
              borderRadius: RADIUS.m - 3,
              alignItems: 'center',
              backgroundColor: on ? c.surface : 'transparent',
              ...(on && c.dark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.line } : null),
              ...(on && !c.dark ? { shadowColor: '#0E1525', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 } : null),
            }}
          >
            <Txt variant="label" color={on ? c.text : c.dim} style={{ fontSize: small ? 12 : 13 }} numberOfLines={1}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Pill({ label, icon, onPress, active }: { label: string; icon?: IconName; onPress?: () => void; active?: boolean }) {
  const { c } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: active ? c.accent : c.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? c.accent : c.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={16} color={active ? c.accentText : c.text} /> : null}
      <Txt variant="label" color={active ? c.accentText : c.text}>{label}</Txt>
    </Pressable>
  );
}

function parseNum(t: string) {
  const v = Number(t.replace(/[^0-9.,-]/g, '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
}

export function NumberField({
  label,
  value,
  onChange,
  prefix = '$',
  suffix,
  hint,
  decimals = 2,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  decimals?: number;
}) {
  const { c, lang } = useApp();
  const fmt = useMemo(
    () => (v: number) => new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { maximumFractionDigits: decimals }).format(v),
    [lang, decimals],
  );
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt(value));
  }, [value, focused, fmt]);
  const pre = lang === 'fr' && prefix === '$' ? '' : prefix;
  const suf = lang === 'fr' && prefix === '$' ? '$' : suffix;
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="small" dim>{label}</Txt>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: c.surface2,
          borderRadius: RADIUS.m,
          paddingHorizontal: SPACE.l,
          borderWidth: 1.5,
          borderColor: focused ? c.accent : 'transparent',
        }}
      >
        {pre ? <Txt variant="numLg" dim style={{ marginRight: 6 }}>{pre}</Txt> : null}
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            onChange(parseNum(t));
          }}
          onFocus={() => {
            setFocused(true);
            setText(value ? String(value) : '');
          }}
          onBlur={() => {
            setFocused(false);
            setText(fmt(value));
          }}
          keyboardType="decimal-pad"
          inputMode="decimal"
          returnKeyType="done"
          selectTextOnFocus
          accessibilityLabel={label}
          style={{ flex: 1, minWidth: 0, paddingVertical: 12, color: c.text, fontFamily: F.display, fontSize: 22, letterSpacing: -0.5, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null) }}
          placeholderTextColor={c.faint}
          placeholder="0"
        />
        {suf ? <Txt variant="numLg" dim style={{ marginLeft: 6 }}>{suf}</Txt> : null}
      </View>
      {hint ? <Txt variant="small" color={c.faint}>{hint}</Txt> : null}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { c } = useApp();
  return (
    <Pressable
      onPress={() => {
        tap();
        onChange(!value);
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.m }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label">{label}</Txt>
        {hint ? <Txt variant="small" dim>{hint}</Txt> : null}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          tap();
          onChange(v);
        }}
        trackColor={{ true: c.accent, false: c.line }}
        thumbColor="#FFFFFF"
        {...(Platform.OS === 'web' ? ({ activeThumbColor: '#FFFFFF' } as object) : null)}
      />
    </Pressable>
  );
}

export function Row({
  label,
  value,
  dot,
  strong,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  dot?: string;
  strong?: boolean;
  sub?: string;
  valueColor?: string;
}) {
  const { c } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s }}>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <View style={{ flex: 1 }}>
        <Txt variant={strong ? 'label' : 'body'} dim={!strong}>{label}</Txt>
        {sub ? <Txt variant="small" color={c.faint}>{sub}</Txt> : null}
      </View>
      <Txt variant={strong ? 'numLg' : 'num'} color={valueColor} style={strong ? { fontSize: 18 } : undefined}>{value}</Txt>
    </View>
  );
}

export function Divider() {
  const { c } = useApp();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />;
}

export function Button({ label, icon, onPress, kind = 'primary', disabled }: { label: string; icon?: IconName; onPress: () => void; kind?: 'primary' | 'secondary'; disabled?: boolean }) {
  const { c } = useApp();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACE.s,
        paddingVertical: 14,
        borderRadius: RADIUS.m,
        backgroundColor: primary ? c.accent : c.surface2,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      {icon ? <Ionicons name={icon} size={18} color={primary ? c.accentText : c.text} /> : null}
      <Txt variant="label" color={primary ? c.accentText : c.text}>{label}</Txt>
    </Pressable>
  );
}

export function Note({ children, icon = 'information-circle-outline', tone }: { children: React.ReactNode; icon?: IconName; tone?: 'warn' | 'good' }) {
  const { c } = useApp();
  const color = tone === 'warn' ? c.amber : tone === 'good' ? c.good : c.dim;
  return (
    <View style={{ flexDirection: 'row', gap: SPACE.s, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={16} color={color} style={{ marginTop: 2 }} />
      <Txt variant="small" color={tone ? color : c.dim} style={{ flex: 1 }}>{children}</Txt>
    </View>
  );
}

export function Collapsible({ title, children, initiallyOpen = false }: { title: string; children: React.ReactNode; initiallyOpen?: boolean }) {
  const { c } = useApp();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={{ gap: SPACE.m }}>
      <Pressable
        onPress={() => {
          tap();
          setOpen(!open);
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Txt variant="label" color={c.accent} style={{ flex: 1 }}>{title}</Txt>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.accent} />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { c, s } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={s.close} />
        <View
          style={{
            backgroundColor: c.bg,
            borderTopLeftRadius: RADIUS.xl,
            borderTopRightRadius: RADIUS.xl,
            maxHeight: '88%',
            paddingBottom: insets.bottom + SPACE.m,
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: SPACE.s }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.l, paddingVertical: SPACE.m }}>
            <Txt variant="heading" style={{ flex: 1 }}>{title}</Txt>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={s.close} hitSlop={12}>
              <Ionicons name="close-circle" size={28} color={c.faint} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: SPACE.l, gap: SPACE.s, paddingBottom: SPACE.l }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function useStyles<T>(make: (c: Palette) => T): T {
  const { c } = useApp();
  return useMemo(() => make(c), [c, make]);
}

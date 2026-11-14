import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import { Unbounded_500Medium, Unbounded_700Bold } from '@expo-google-fonts/unbounded';
import { Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/state/app';
import { PayrollScreen } from './src/screens/PayrollScreen';
import { SalesScreen } from './src/screens/SalesScreen';
import { CorporateScreen } from './src/screens/CorporateScreen';
import { OwnerPayScreen } from './src/screens/OwnerPayScreen';
import { MoreScreen } from './src/screens/MoreScreen';
import { Onboarding } from './src/screens/Onboarding';
import { DarkScope } from './src/state/app';
import { Txt, tap, type IconName } from './src/ui/kit';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

type Tab = 'payroll' | 'sales' | 'corp' | 'owner' | 'more';
const TABS: { key: Tab; icon: IconName; iconOn: IconName }[] = [
  { key: 'payroll', icon: 'wallet-outline', iconOn: 'wallet' },
  { key: 'sales', icon: 'receipt-outline', iconOn: 'receipt' },
  { key: 'corp', icon: 'business-outline', iconOn: 'business' },
  { key: 'owner', icon: 'swap-horizontal-outline', iconOn: 'swap-horizontal' },
  { key: 'more', icon: 'settings-outline', iconOn: 'settings' },
];

/** Web preview / screenshots: `?tab=sales&lang=fr&theme=light`. */
function initialTab(): Tab {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'payroll';
  const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
  return t && TABS.some((x) => x.key === t) ? t : 'payroll';
}

/** Web QA: `?intro=1` replays the welcome, `?intro=0` skips it. */
function introOverride(): boolean | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('intro');
  return v === '1' ? true : v === '0' ? false : null;
}

function Root() {
  const { prefs, set, c } = useApp();
  const [forced, setForced] = useState(introOverride);
  const show = forced ?? !prefs.onboarded;
  if (show) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0F1C' }}>
        <StatusBar style="light" />
        <DarkScope>
          <Onboarding
            onDone={() => {
              setForced(null);
              set('onboarded', true);
            }}
          />
        </DarkScope>
      </View>
    );
  }
  return <Shell key={c.dark ? 'd' : 'l'} />;
}

function Shell() {
  const { c, s } = useApp();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => undefined);
  }, [c.bg]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        {tab === 'payroll' && <PayrollScreen />}
        {tab === 'sales' && <SalesScreen />}
        {tab === 'corp' && <CorporateScreen />}
        {tab === 'owner' && <OwnerPayScreen />}
        {tab === 'more' && <MoreScreen />}
      </View>
      <View
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: Math.max(insets.bottom, 10),
          flexDirection: 'row',
          backgroundColor: c.surface,
          borderRadius: 26,
          paddingVertical: 8,
          paddingHorizontal: 6,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.line,
          maxWidth: 560,
          alignSelf: 'center',
          shadowColor: '#000',
          shadowOpacity: c.dark ? 0.5 : 0.12,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }}
      >
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={s.tabs[t.key]}
              onPress={() => {
                tap();
                setTab(t.key);
              }}
              style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 }}
            >
              <View style={{ paddingHorizontal: 14, paddingVertical: 4, borderRadius: 999, backgroundColor: on ? c.accent : 'transparent' }}>
                <Ionicons name={on ? t.iconOn : t.icon} size={20} color={on ? c.accentText : c.dim} />
              </View>
              <Txt variant="small" color={on ? c.text : c.dim} style={{ fontSize: 11 }} numberOfLines={1}>{s.tabs[t.key]}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Unbounded_500Medium,
    Unbounded_700Bold,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    ...Ionicons.font,
  });
  const ready = fontsLoaded || !!fontError;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}

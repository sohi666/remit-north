import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { RADIUS, SPACE } from '../theme';
import { Txt, tap } from './kit';

/** A first-time tip for one screen. Dismissed tips are remembered and never shown again. */
export function TipCard({ id, text }: { id: string; text: string }) {
  const { prefs, set, c, s } = useApp();
  const seen = prefs.tipsSeen.includes(id);
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!seen) Animated.timing(enter, { toValue: 1, duration: 450, delay: 250, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [seen, enter]);
  if (seen) return null;
  const dismiss = () => {
    tap();
    set('tipsSeen', (t) => [...t, id]);
  };
  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
        flexDirection: 'row',
        gap: SPACE.m,
        padding: SPACE.l,
        borderRadius: RADIUS.l,
        backgroundColor: c.dark ? 'rgba(255,77,85,0.10)' : 'rgba(232,52,58,0.07)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.dark ? 'rgba(255,77,85,0.35)' : 'rgba(232,52,58,0.3)',
      }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="bulb" size={18} color={c.accentText} />
      </View>
      <View style={{ flex: 1, gap: SPACE.s }}>
        <Txt variant="small" style={{ fontSize: 14, lineHeight: 20 }}>{text}</Txt>
        <Pressable onPress={dismiss} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start' }}>
          <Txt variant="label" color={c.accent}>{s.gotIt}</Txt>
        </Pressable>
      </View>
    </Animated.View>
  );
}

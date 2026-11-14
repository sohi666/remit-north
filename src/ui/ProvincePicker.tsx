import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { PROVINCES, type Prov } from '../tax/types';
import { RADIUS, SPACE } from '../theme';
import { Sheet, Txt, tap } from './kit';

/** Province chip + sheet. The province is shared by every tab. */
export function ProvinceChip() {
  const { prefs, set, pack, lang, c, s } = useApp();
  const [open, setOpen] = useState(false);
  const choose = (p: Prov) => {
    set('prov', p);
    setOpen(false);
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${s.province}: ${pack.jurisdictions[prefs.prov].name[lang]}`}
        onPress={() => {
          tap();
          setOpen(true);
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.s,
          alignSelf: 'flex-start',
          backgroundColor: c.surface,
          borderRadius: 999,
          paddingLeft: 6,
          paddingRight: 14,
          paddingVertical: 6,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.line,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View style={{ backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
          <Txt variant="label" color={c.accentText} style={{ fontSize: 12 }}>{prefs.prov}</Txt>
        </View>
        <Txt variant="label">{pack.jurisdictions[prefs.prov].name[lang]}</Txt>
        <Ionicons name="chevron-down" size={16} color={c.dim} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={s.chooseProvince}>
        {PROVINCES.map((p) => {
          const on = p === prefs.prov;
          const j = pack.jurisdictions[p];
          return (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                tap();
                choose(p);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.m,
                padding: SPACE.m,
                borderRadius: RADIUS.m,
                backgroundColor: on ? c.surface2 : pressed ? c.surface : 'transparent',
              })}
            >
              <View style={{ width: 40, alignItems: 'center', backgroundColor: on ? c.accent : c.surface2, borderRadius: 10, paddingVertical: 6 }}>
                <Txt variant="label" color={on ? c.accentText : c.text}>{p}</Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="label">{j.name[lang]}</Txt>
                <Txt variant="small" dim>
                  {j.sales.kind === 'HST' ? `HST ${Math.round(j.sales.hst! * 100)}%` : j.sales.kind === 'GST_QST' ? 'GST 5% + QST 9.975%' : j.sales.kind === 'GST_PST' ? `GST 5% + ${j.sales.pstName} ${Math.round(j.sales.pst! * 100)}%` : 'GST 5%'}
                </Txt>
              </View>
              {on ? <Ionicons name="checkmark-circle" size={22} color={c.accent} /> : null}
            </Pressable>
          );
        })}
      </Sheet>
    </>
  );
}

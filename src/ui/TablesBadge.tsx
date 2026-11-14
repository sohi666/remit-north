import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { Txt } from './kit';

/** Which tax tables are in use; spins while checking for new ones. */
export function TablesBadge() {
  const { pack, status, packSource, c } = useApp();
  const icon = status.kind === 'checking' ? 'sync' : status.kind === 'offline' ? 'cloud-offline-outline' : packSource === 'downloaded' || status.kind === 'upToDate' || status.kind === 'updated' ? 'cloud-done-outline' : 'shield-checkmark-outline';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: c.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.line,
      }}
      accessibilityLabel={`Tax tables ${pack.version}`}
    >
      <Ionicons name={icon} size={14} color={status.kind === 'offline' ? c.amber : c.accent} />
      <Txt variant="small" style={{ fontSize: 12 }}>{pack.year}</Txt>
      <Txt variant="small" dim style={{ fontSize: 12 }}>v{pack.version.split('.').slice(1).join('.')}</Txt>
    </View>
  );
}

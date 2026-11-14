import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { useApp } from '../state/app';
import { Txt } from './kit';

/** Ring chart; segments are drawn clockwise from 12 o'clock. */
export function Donut({ size = 132, stroke = 16, segments, children }: { size?: number; stroke?: number; segments: { value: number; color: string }[]; children?: React.ReactNode }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.18)" strokeWidth={stroke} fill="none" />
          {segments.map((sg, i) => {
            const len = (Math.max(0, sg.value) / total) * circ;
            const gap = segments.length > 1 && len > 4 ? 2 : 0;
            const el = (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={sg.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${Math.max(0, len - gap)} ${circ}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
        </G>
      </Svg>
      {children}
    </View>
  );
}

/** Smooth area line chart with a highlighted point. */
export function LineChart({
  points,
  highlight,
  height = 170,
  formatX,
  formatY,
}: {
  points: { x: number; y: number }[];
  highlight?: { x: number; y: number };
  height?: number;
  formatX: (v: number) => string;
  formatY: (v: number) => string;
}) {
  const { c } = useApp();
  const [w, setW] = useState(0);
  const pad = { l: 4, r: 4, t: 14, b: 22 };
  if (points.length < 2) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs) || 1;
  const minY = Math.min(...ys) * 0.985;
  const maxY = Math.max(...ys) * 1.005;
  const sx = (x: number) => pad.l + ((x - minX) / (maxX - minX || 1)) * (w - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - minY) / (maxY - minY || 1)) * (height - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const area = `${d} L${sx(maxX)},${height - pad.b} L${sx(minX)},${height - pad.b} Z`;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.good} stopOpacity="0.35" />
              <Stop offset="1" stopColor={c.good} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Line x1={pad.l} x2={w - pad.r} y1={height - pad.b} y2={height - pad.b} stroke={c.line} strokeWidth={1} />
          <Path d={area} fill="url(#area)" />
          <Path d={d} stroke={c.good} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
          {highlight ? (
            <>
              <Line x1={sx(highlight.x)} x2={sx(highlight.x)} y1={pad.t} y2={height - pad.b} stroke={c.good} strokeDasharray="3 4" strokeWidth={1} />
              <Circle cx={sx(highlight.x)} cy={sy(highlight.y)} r={6} fill={c.bg} stroke={c.good} strokeWidth={3} />
            </>
          ) : null}
        </Svg>
      ) : null}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt variant="small" dim>{formatX(minX)}</Txt>
        <Txt variant="small" dim>{formatX(maxX)}</Txt>
      </View>
      <View style={{ position: 'absolute', left: 0, top: 0 }}>
        <Txt variant="small" dim>{formatY(Math.max(...ys))}</Txt>
      </View>
    </View>
  );
}

/** Horizontal stacked bar. */
export function StackBar({ parts, height = 10 }: { parts: { value: number; color: string }[]; height?: number }) {
  const { c } = useApp();
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  return (
    <View style={{ flexDirection: 'row', height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: c.surface2 }}>
      {parts.map((p, i) => (
        <View key={i} style={{ width: `${(Math.max(0, p.value) / total) * 100}%`, backgroundColor: p.color }} />
      ))}
    </View>
  );
}

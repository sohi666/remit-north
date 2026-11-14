import React from 'react';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

/** Remit North mark: a calculator whose screen shows a maple leaf. Source: scripts/assets/icon.svg. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="lg-k" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1A2646" />
          <Stop offset="1" stopColor="#0A0F1C" />
        </LinearGradient>
        <RadialGradient id="lg-g" cx="0.5" cy="0.25" r="0.6">
          <Stop offset="0" stopColor="#E8343A" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#E8343A" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="1024" height="1024" rx="230" fill="url(#lg-k)" />
      <Rect x="0" y="0" width="1024" height="1024" rx="230" fill="url(#lg-g)" />
      <Rect x="270" y="150" width="484" height="300" rx="44" fill="#FFFFFF" />
      <Path d="M512.0,174.8 L529.3,218.7 L551.6,207.9 L545.1,261.9 L580.4,229.5 L588.3,249.7 L631.5,243.2 L616.4,283.5 L638.7,294.3 L580.4,337.5 L589.8,359.8 L529.3,351.2 L523.5,387.2 L523.5,425.4 L500.5,425.4 L500.5,387.2 L494.7,351.2 L434.2,359.8 L443.6,337.5 L385.3,294.3 L407.6,283.5 L392.5,243.2 L435.7,249.7 L443.6,229.5 L478.9,261.9 L472.4,207.9 L494.7,218.7 L512.0,174.8 Z" fill="#E8343A" />
      <Rect x="300" y="500" width="124" height="96" rx="26" fill="#2A3654" />
      <SvgText x="362" y="568" textAnchor="middle" fontFamily="Arial" fontWeight="700" fontSize="56" fill="#FFFFFF">7</SvgText>
      <Rect x="450" y="500" width="124" height="96" rx="26" fill="#2A3654" />
      <SvgText x="512" y="568" textAnchor="middle" fontFamily="Arial" fontWeight="700" fontSize="56" fill="#FFFFFF">8</SvgText>
      <Rect x="600" y="500" width="124" height="96" rx="26" fill="#E8343A" />
      <SvgText x="662" y="568" textAnchor="middle" fontFamily="Arial" fontWeight="700" fontSize="56" fill="#FFFFFF">%</SvgText>
      <Rect x="300" y="620" width="124" height="96" rx="26" fill="#2A3654" />
      <SvgText x="362" y="688" textAnchor="middle" fontFamily="Arial" fontWeight="700" fontSize="56" fill="#FFFFFF">4</SvgText>
      <Rect x="450" y="620" width="124" height="96" rx="26" fill="#2A3654" />
      <SvgText x="512" y="688" textAnchor="middle" fontFamily="Arial" fontWeight="700" fontSize="56" fill="#FFFFFF">5</SvgText>
      <Rect x="600" y="620" width="124" height="96" rx="26" fill="#2A3654" />
      <SvgText x="662" y="688" textAnchor="middle" fontFamily="Arial" fontWeight="700" fontSize="56" fill="#FFFFFF">−</SvgText>
      <Rect x="300" y="740" width="124" height="96" rx="26" fill="#2A3654" />
      <SvgText x="362" y="808" textAnchor="middle" fontFamily="Arial" fontWeight="700" fontSize="56" fill="#FFFFFF">1</SvgText>
      <Rect x="450" y="740" width="124" height="96" rx="26" fill="#2A3654" />
      <SvgText x="512" y="808" textAnchor="middle" fontFamily="Arial" fontWeight="700" fontSize="56" fill="#FFFFFF">2</SvgText>
      <Rect x="600" y="740" width="124" height="96" rx="26" fill="#E8343A" />
      <SvgText x="662" y="808" textAnchor="middle" fontFamily="Arial" fontWeight="700" fontSize="56" fill="#FFFFFF">=</SvgText>
    </Svg>
  );
}

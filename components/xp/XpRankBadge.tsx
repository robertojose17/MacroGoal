/**
 * XpRankBadge
 *
 * Pill-shaped badge displaying the XP rank tier name + roman numeral.
 * Uses LinearGradient for Transcendent (tier 18) and Apex (tier 19).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { XpRank } from '@/utils/xpRanks';

interface XpRankBadgeProps {
  rank: XpRank;
  size?: 'small' | 'medium' | 'large';
}

const SIZE_CONFIG = {
  small:  { fontSize: 10, romanSize: 8.5,  paddingV: 4,  paddingH: 10 },
  medium: { fontSize: 12, romanSize: 10.2, paddingV: 6,  paddingH: 14 },
  large:  { fontSize: 14, romanSize: 11.9, paddingV: 8,  paddingH: 18 },
};

export default function XpRankBadge({ rank, size = 'medium' }: XpRankBadgeProps) {
  const cfg = SIZE_CONFIG[size];
  const textColor = rank.isLight ? '#0F172A' : '#FFFFFF';
  const useGradient = rank.tierIndex >= 18 && rank.gradientColor != null;

  const tierNameUpper = rank.tierName.toUpperCase();
  const romanUpper = rank.romanNumeral;

  const innerContent = (
    <View style={styles.inner}>
      <Text
        style={[
          styles.tierName,
          {
            fontSize: cfg.fontSize,
            color: textColor,
          },
        ]}
      >
        {tierNameUpper}
      </Text>
      <View style={{ width: 4 }} />
      <Text
        style={[
          styles.roman,
          {
            fontSize: cfg.romanSize,
            color: textColor,
          },
        ]}
      >
        {romanUpper}
      </Text>
    </View>
  );

  const pillStyle = [
    styles.pill,
    {
      paddingVertical: cfg.paddingV,
      paddingHorizontal: cfg.paddingH,
    },
  ];

  if (useGradient) {
    return (
      <LinearGradient
        colors={[rank.primaryColor, rank.gradientColor as string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={pillStyle}
      >
        {innerContent}
      </LinearGradient>
    );
  }

  return (
    <View style={[pillStyle, { backgroundColor: rank.primaryColor }]}>
      {innerContent}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierName: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  roman: {
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});

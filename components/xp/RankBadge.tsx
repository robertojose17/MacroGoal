/**
 * RankBadge
 *
 * Small chip showing rank name with rank-specific color.
 * Used inside XpHeroCard and LevelUpModal.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { rankColors } from '@/constants/Colors';

interface RankBadgeProps {
  rank: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function RankBadge({ rank, size = 'md' }: RankBadgeProps) {
  const rankColor = rankColors[rank] ?? rankColors['Rookie'];

  const fontSize = size === 'sm' ? 10 : size === 'lg' ? 14 : 12;
  const paddingV = size === 'sm' ? 2 : size === 'lg' ? 6 : 4;
  const paddingH = size === 'sm' ? 6 : size === 'lg' ? 12 : 8;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: rankColor.glow,
          borderColor: rankColor.text,
          paddingVertical: paddingV,
          paddingHorizontal: paddingH,
        },
      ]}
    >
      <Text style={[styles.text, { color: rankColor.text, fontSize }]}>
        {rank.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 99,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});

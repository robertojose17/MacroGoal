
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';

interface MacroBarProps {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
}

export default function MacroBar({ label, current, target, color, unit = 'g' }: MacroBarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  const percentage = Math.min((current / target) * 100, 100);
  const remaining = Math.max(target - current, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
          {label}
        </Text>
        <Text style={[styles.values, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
          {Math.round(current)} / {Math.round(target)}{unit}
        </Text>
      </View>
      <View style={[styles.barBackground, { backgroundColor: isDark ? colors.borderDark : colors.border }]}>
        <View
          style={[
            styles.barFill,
            {
              width: `${percentage}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
      <Text style={[styles.remaining, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
        {Math.round(remaining)}{unit} remaining
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  values: {
    fontSize: 14,
    fontWeight: '500',
  },
  barBackground: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  remaining: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
});

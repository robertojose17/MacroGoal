
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';

interface ProgressCircleProps {
  current: number;
  target: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  unit?: string;
}

export default function ProgressCircle({
  current,
  target,
  size = 120,
  strokeWidth = 10,
  color = colors.primary,
  label,
  unit = '',
}: ProgressCircleProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  const percentage = Math.min((current / target) * 100, 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Calculate remaining calories
  const remaining = target - current;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View style={styles.circleContainer}>
        <View 
          style={[
            styles.backgroundCircle, 
            { 
              width: size, 
              height: size, 
              borderRadius: size / 2,
              borderWidth: strokeWidth,
              borderColor: isDark ? colors.borderDark : colors.border,
            }
          ]} 
        />
        <View 
          style={[
            styles.progressCircle, 
            { 
              width: size, 
              height: size, 
              borderRadius: size / 2,
              borderWidth: strokeWidth,
              borderColor: color,
              transform: [{ rotate: '-90deg' }],
            }
          ]} 
        >
          <View 
            style={[
              styles.progressMask,
              {
                width: size - strokeWidth * 2,
                height: size - strokeWidth * 2,
                borderRadius: (size - strokeWidth * 2) / 2,
                backgroundColor: isDark ? colors.backgroundDark : colors.background,
              }
            ]}
          />
        </View>
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.value, { color: remaining >= 0 ? (isDark ? colors.textDark : colors.text) : colors.error }]}>
          {Math.round(remaining)}
        </Text>
        {label && (
          <Text style={[styles.label, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {label}
          </Text>
        )}
        <Text style={[styles.target, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
          {Math.round(current)} / {Math.round(target)}{unit}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundCircle: {
    position: 'absolute',
  },
  progressCircle: {
    position: 'absolute',
  },
  progressMask: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  textContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  target: {
    fontSize: 11,
    fontWeight: '400',
  },
});

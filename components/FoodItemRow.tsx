
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@/styles/commonStyles';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';

export interface FoodItemRowProps {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  servingText: string;
  onPress?: () => void;
  onDelete?: () => void;
  isDark: boolean;
  style?: object;
}

export default function FoodItemRow({
  name,
  brand,
  calories,
  protein,
  carbs,
  fats,
  servingText,
  onPress,
  onDelete,
  isDark,
  style,
}: FoodItemRowProps) {
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const caloriesRounded = Math.round(calories);
  const proteinRounded = Math.round(protein);
  const carbsRounded = Math.round(carbs);
  const fatsRounded = Math.round(fats);

  const inner = (isSwiping: boolean) => (
    <TouchableOpacity
      style={[styles.foodItem, style]}
      onPress={() => {
        if (onPress) {
          console.log('[FoodItemRow] Row pressed:', name);
          onPress();
        }
      }}
      activeOpacity={0.7}
      disabled={isSwiping}
    >
      <View style={styles.foodInfo}>
        {/* Row 1: name (+ calories if NO brand) */}
        <View style={styles.row}>
          <Text style={[styles.foodName, { color: textColor }]} numberOfLines={2}>
            {name}
          </Text>
          {!brand && (
            <View style={styles.caloriesBlock}>
              <Text style={[styles.foodCaloriesValue, { color: textColor }]}>
                {caloriesRounded}
              </Text>
              <Text style={[styles.foodCaloriesLabel, { color: secondaryColor }]}>
                kcal
              </Text>
            </View>
          )}
        </View>
        {/* Row 2: brand (+ calories if HAS brand) */}
        {!!brand && (
          <View style={styles.row}>
            <Text style={[styles.foodBrand, { color: secondaryColor }]} numberOfLines={1}>
              {brand}
            </Text>
            <View style={styles.caloriesBlock}>
              <Text style={[styles.foodCaloriesValue, { color: textColor }]}>
                {caloriesRounded}
              </Text>
              <Text style={[styles.foodCaloriesLabel, { color: secondaryColor }]}>
                kcal
              </Text>
            </View>
          </View>
        )}
        {/* Row 3: serving text + macros */}
        <View style={styles.macroRow}>
          <Text style={[styles.macroBase, { color: secondaryColor }]}>
            {servingText}
          </Text>
          <Text style={[styles.macroBase, { color: secondaryColor }]}>
            {'•'}
          </Text>
          <Text style={[styles.macroValue, { color: colors.protein }]}>
            {'P: '}
            {proteinRounded}
            {'g'}
          </Text>
          <Text style={[styles.macroBase, { color: secondaryColor }]}>
            {'•'}
          </Text>
          <Text style={[styles.macroValue, { color: colors.carbs }]}>
            {'C: '}
            {carbsRounded}
            {'g'}
          </Text>
          <Text style={[styles.macroBase, { color: secondaryColor }]}>
            {'•'}
          </Text>
          <Text style={[styles.macroValue, { color: colors.fats }]}>
            {'F: '}
            {fatsRounded}
            {'g'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (onDelete) {
    return (
      <SwipeToDeleteRow onDelete={() => {
        console.log('[FoodItemRow] Delete swiped for:', name);
        onDelete();
      }}>
        {(isSwiping: boolean) => inner(isSwiping)}
      </SwipeToDeleteRow>
    );
  }

  return inner(false);
}

const styles = StyleSheet.create({
  foodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  foodInfo: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  foodName: {
    ...typography.bodyBold,
    marginBottom: 2,
    flex: 1,
  },
  foodBrand: {
    ...typography.caption,
    marginBottom: 2,
    flex: 1,
  },
  caloriesBlock: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  foodCaloriesValue: {
    ...typography.bodyBold,
    fontSize: 18,
  },
  foodCaloriesLabel: {
    ...typography.caption,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  macroBase: {
    fontSize: 12,
  },
  macroValue: {
    fontSize: 12,
    fontWeight: '600',
  },
});

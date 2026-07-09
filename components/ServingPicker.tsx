/**
 * components/ServingPicker.tsx
 * Unified serving picker — quantity input + unit dropdown.
 * Used by FoodDetailsLayout (barcode scan, food search, edit mode).
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';

export type ServingOption = {
  key: string;
  /** e.g. "1 cookie", "1 g", "1 oz", "1 serving (29g)" */
  label: string;
  /** grams per 1 unit of this option */
  gramsPerUnit: number;
};

interface ServingPickerProps {
  options: ServingOption[];
  selectedKey: string;
  quantity: string;
  onOptionChange: (option: ServingOption) => void;
  onQuantityChange: (value: string) => void;
  isDark: boolean;
}

export default function ServingPicker({
  options,
  selectedKey,
  quantity,
  onOptionChange,
  onQuantityChange,
  isDark,
}: ServingPickerProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  const textColor = isDark ? colors.textDark : colors.text;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const cardBackground = isDark ? colors.cardDark : colors.card;
  const selectedBg = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';

  const currentOption = options.find((o) => o.key === selectedKey) ?? options[0];
  const currentLabel = currentOption ? currentOption.label : '';

  const handleUnitPress = () => {
    console.log('[ServingPicker] Unit button pressed, toggling dropdown. current selectedKey=', selectedKey);
    setShowDropdown((prev) => !prev);
  };

  const handleOptionSelect = (option: ServingOption) => {
    console.log('[ServingPicker] Option selected:', option.key, option.label, 'gramsPerUnit=', option.gramsPerUnit);
    onOptionChange(option);
    setShowDropdown(false);
  };

  const handleQuantityChange = (value: string) => {
    console.log('[ServingPicker] Quantity changed to:', value);
    onQuantityChange(value);
  };

  return (
    <View>
      <View style={styles.row}>
        <TextInput
          style={[
            styles.quantityInput,
            {
              color: textColor,
              borderColor,
              backgroundColor: cardBackground,
            },
          ]}
          value={quantity}
          onChangeText={handleQuantityChange}
          keyboardType="decimal-pad"
          placeholder="1"
          placeholderTextColor={isDark ? '#666' : '#999'}
        />
        <TouchableOpacity
          style={[
            styles.unitButton,
            {
              borderColor,
              backgroundColor: cardBackground,
            },
          ]}
          onPress={handleUnitPress}
          activeOpacity={0.7}
        >
          <Text
            style={[styles.unitButtonText, { color: textColor, flex: 1 }]}
            numberOfLines={1}
          >
            {currentLabel}
          </Text>
          <IconSymbol
            ios_icon_name={showDropdown ? 'chevron.up' : 'chevron.down'}
            android_material_icon_name={showDropdown ? 'expand-less' : 'expand-more'}
            size={16}
            color={textColor}
          />
        </TouchableOpacity>
      </View>

      {showDropdown && (
        <View
          style={[
            styles.dropdown,
            {
              backgroundColor: cardBackground,
              borderColor,
              shadowColor: isDark ? '#000' : '#333',
            },
          ]}
        >
          {options.map((option, index) => {
            const isSelected = option.key === selectedKey;
            const isLast = index === options.length - 1;
            return (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.dropdownOption,
                  { borderBottomColor: isLast ? 'transparent' : borderColor },
                  isSelected && { backgroundColor: selectedBg },
                ]}
                onPress={() => handleOptionSelect(option)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    { color: textColor, fontWeight: isSelected ? '600' : '400' },
                  ]}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <IconSymbol
                    ios_icon_name="checkmark"
                    android_material_icon_name="check"
                    size={16}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  quantityInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    fontSize: 16,
    marginRight: spacing.sm,
  },
  unitButton: {
    flex: 2,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  unitButtonText: {
    fontSize: 16,
  },
  dropdown: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownOptionText: {
    fontSize: 16,
    flex: 1,
  },
});

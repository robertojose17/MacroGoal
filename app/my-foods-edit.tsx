
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform, Alert, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';

export default function MyFoodsEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  const foodId = params.foodId as string;

  const [foodName, setFoodName] = useState('');
  const [brand, setBrand] = useState('');
  const [servingAmount, setServingAmount] = useState('100');
  const [servingUnit, setServingUnit] = useState('g');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');
  const [fiber, setFiber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadFood = useCallback(async () => {
    console.log('[MyFoodsEdit] Loading food:', foodId);
    try {
      const { data, error } = await supabase
        .from('foods')
        .select('*')
        .eq('id', foodId)
        .single();

      if (error) {
        console.error('[MyFoodsEdit] Error loading food:', error);
        Alert.alert(t('common.error'), t('myFoodsEdit.failedToLoad'));
        router.back();
        return;
      }

      console.log('[MyFoodsEdit] Food loaded:', data);
      setFoodName(data.name);
      setBrand(data.brand || '');
      setServingAmount(data.serving_amount.toString());
      setServingUnit(data.serving_unit);
      setCalories(data.calories.toString());
      setProtein(data.protein.toString());
      setCarbs(data.carbs.toString());
      setFats(data.fats.toString());
      setFiber(data.fiber.toString());
      setLoading(false);
    } catch (error) {
      console.error('[MyFoodsEdit] Error in loadFood:', error);
      Alert.alert(t('common.error'), t('common.unexpectedError'));
      router.back();
    }
  }, [foodId, router]);

  useEffect(() => {
    loadFood();
  }, [loadFood]);

  const handleSave = async () => {
    console.log('[MyFoodsEdit] ========== SAVE BUTTON PRESSED ==========');
    console.log('[MyFoodsEdit] Food ID:', foodId);
    console.log('[MyFoodsEdit] Food Name:', foodName);
    
    if (!foodName.trim()) {
      Alert.alert(t('common.error'), t('myFoodsEdit.enterFoodName'));
      return;
    }

    if (!calories.trim()) {
      Alert.alert(t('common.error'), t('myFoodsEdit.enterCalories'));
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: foodName.trim(),
        brand: brand.trim() || null,
        serving_amount: parseFloat(servingAmount) || 100,
        serving_unit: servingUnit,
        calories: parseFloat(calories) || 0,
        protein: parseFloat(protein) || 0,
        carbs: parseFloat(carbs) || 0,
        fats: parseFloat(fats) || 0,
        fiber: parseFloat(fiber) || 0,
      };

      console.log('[MyFoodsEdit] Payload:', payload);
      console.log('[MyFoodsEdit] Updating food in database...');

      const { data, error } = await supabase
        .from('foods')
        .update(payload)
        .eq('id', foodId)
        .select()
        .single();

      if (error) {
        console.error('[MyFoodsEdit] ❌ Error updating food:', error);
        console.error('[MyFoodsEdit] Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        Alert.alert(t('common.error'), t('myFoodsEdit.failedToUpdate', { message: error.message }));
        setSaving(false);
        return;
      }

      console.log('[MyFoodsEdit] ✅ Food updated successfully!');
      console.log('[MyFoodsEdit] Updated data:', data);

      Alert.alert(t('common.success'), t('myFoodsEdit.foodUpdated'), [
        {
          text: t('common.ok'),
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('[MyFoodsEdit] ❌ Unexpected error in handleSave:', error);
      if (error instanceof Error) {
        console.error('[MyFoodsEdit] Error message:', error.message);
        console.error('[MyFoodsEdit] Error stack:', error.stack);
      }
      Alert.alert(t('common.error'), t('common.unexpectedError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            {t('myFoodsEdit.loadingFood')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow_back"
              size={24}
              color={isDark ? colors.textDark : colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
            {t('myFoodsEdit.title')}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
              {t('myFoodsEdit.foodInformation')}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                {t('myFoodsEdit.foodNameRequired')}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                placeholder={t('myFoodsEdit.foodNamePlaceholder')}
                placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                value={foodName}
                onChangeText={setFoodName}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                {t('myFoodsEdit.brandOptional')}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                placeholder={t('myFoodsEdit.brandPlaceholder')}
                placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                value={brand}
                onChangeText={setBrand}
                returnKeyType="next"
              />
            </View>

            <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text, marginTop: spacing.lg }]}>
              {t('myFoodsEdit.servingSize')}
            </Text>

            <View style={styles.servingRow}>
              <View style={styles.servingAmountInput}>
                <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('myFoodsEdit.amount')}
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder="100"
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={servingAmount}
                  onChangeText={setServingAmount}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.servingUnitInput}>
                <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('myFoodsEdit.unit')}
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder="g"
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  value={servingUnit}
                  onChangeText={setServingUnit}
                  returnKeyType="next"
                />
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text, marginTop: spacing.lg }]}>
              {t('myFoodsEdit.nutritionPerServing')}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                {t('myFoodsEdit.caloriesRequired')}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                placeholder={t('myFoodsEdit.caloriesPlaceholder')}
                placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                keyboardType="decimal-pad"
                value={calories}
                onChangeText={setCalories}
                returnKeyType="next"
              />
            </View>

            <View style={styles.macroRow}>
              <View style={styles.macroInput}>
                <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('myFoodsEdit.proteinG')}
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder="0"
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={protein}
                  onChangeText={setProtein}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.macroInput}>
                <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('myFoodsEdit.carbsG')}
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder="0"
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={carbs}
                  onChangeText={setCarbs}
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.macroRow}>
              <View style={styles.macroInput}>
                <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('myFoodsEdit.fatsG')}
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder="0"
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={fats}
                  onChangeText={setFats}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.macroInput}>
                <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('myFoodsEdit.fiberG')}
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder="0"
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={fiber}
                  onChangeText={setFiber}
                  returnKeyType="done"
                />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>{t('myFoodsEdit.saveChanges')}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodyBold,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  servingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  servingAmountInput: {
    flex: 2,
  },
  servingUnitInput: {
    flex: 1,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  macroInput: {
    flex: 1,
  },
  saveButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 100,
  },
});

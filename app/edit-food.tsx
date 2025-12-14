
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform, Alert, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

export default function EditFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const itemId = params.itemId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [item, setItem] = useState<any>(null);
  const [grams, setGrams] = useState('');
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');
  const [fiber, setFiber] = useState('');

  const loadItem = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('meal_items')
        .select(`
          *,
          foods (
            id,
            name,
            brand,
            serving_amount,
            serving_unit,
            calories,
            protein,
            carbs,
            fats,
            fiber,
            user_created
          )
        `)
        .eq('id', itemId)
        .single();

      if (error) {
        console.error('[EditFood] Error loading item:', error);
        Alert.alert('Error', 'Failed to load food item');
        router.back();
        return;
      }

      console.log('[EditFood] Item loaded:', data);
      setItem(data);
      setFoodName(data.foods?.name || '');
      
      // Calculate grams from quantity
      // If serving_unit is 'g' and serving_amount is 100, then quantity represents the multiplier
      const servingAmount = data.foods?.serving_amount || 100;
      const servingUnit = data.foods?.serving_unit || 'g';
      
      if (servingUnit === 'g') {
        const totalGrams = (data.quantity || 1) * servingAmount;
        setGrams(totalGrams.toString());
      } else {
        // For non-gram servings, just use quantity
        setGrams((data.quantity || 1).toString());
      }
      
      // Calculate per-100g values for display
      const per100gCalories = (data.foods?.calories || 0);
      const per100gProtein = (data.foods?.protein || 0);
      const per100gCarbs = (data.foods?.carbs || 0);
      const per100gFats = (data.foods?.fats || 0);
      const per100gFiber = (data.foods?.fiber || 0);

      setCalories(per100gCalories.toFixed(1));
      setProtein(per100gProtein.toFixed(1));
      setCarbs(per100gCarbs.toFixed(1));
      setFats(per100gFats.toFixed(1));
      setFiber(per100gFiber.toFixed(1));
    } catch (error) {
      console.error('[EditFood] Error in loadItem:', error);
      Alert.alert('Error', 'An unexpected error occurred');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [itemId, router]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  const handleSave = async () => {
    if (!grams || parseFloat(grams) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (item?.foods?.user_created && (!foodName.trim() || !calories.trim())) {
      Alert.alert('Error', 'Please enter at least food name and calories');
      return;
    }

    setSaving(true);

    try {
      const gramsNum = parseFloat(grams) || 100;
      const caloriesNum = parseFloat(calories) || 0;
      const proteinNum = parseFloat(protein) || 0;
      const carbsNum = parseFloat(carbs) || 0;
      const fatsNum = parseFloat(fats) || 0;
      const fiberNum = parseFloat(fiber) || 0;

      const servingAmount = item.foods?.serving_amount || 100;
      const servingUnit = item.foods?.serving_unit || 'g';

      // Calculate quantity (multiplier) and total values
      let quantity = 1;
      let totalCalories = caloriesNum;
      let totalProtein = proteinNum;
      let totalCarbs = carbsNum;
      let totalFats = fatsNum;
      let totalFiber = fiberNum;

      if (servingUnit === 'g') {
        // For gram-based foods, calculate multiplier
        quantity = gramsNum / servingAmount;
        totalCalories = caloriesNum * quantity;
        totalProtein = proteinNum * quantity;
        totalCarbs = carbsNum * quantity;
        totalFats = fatsNum * quantity;
        totalFiber = fiberNum * quantity;
      } else {
        // For other units, use grams as quantity directly
        quantity = gramsNum;
        totalCalories = caloriesNum * quantity;
        totalProtein = proteinNum * quantity;
        totalCarbs = carbsNum * quantity;
        totalFats = fatsNum * quantity;
        totalFiber = fiberNum * quantity;
      }

      // If it's a user-created food, update the food entry as well
      if (item?.foods?.user_created) {
        const { error: foodError } = await supabase
          .from('foods')
          .update({
            name: foodName.trim(),
            calories: caloriesNum,
            protein: proteinNum,
            carbs: carbsNum,
            fats: fatsNum,
            fiber: fiberNum,
          })
          .eq('id', item.food_id);

        if (foodError) {
          console.error('[EditFood] Error updating food:', foodError);
          Alert.alert('Error', 'Failed to update food');
          setSaving(false);
          return;
        }
      }

      // Update meal item
      const { error: itemError } = await supabase
        .from('meal_items')
        .update({
          quantity: quantity,
          calories: totalCalories,
          protein: totalProtein,
          carbs: totalCarbs,
          fats: totalFats,
          fiber: totalFiber,
        })
        .eq('id', itemId);

      if (itemError) {
        console.error('[EditFood] Error updating meal item:', itemError);
        Alert.alert('Error', 'Failed to update food entry');
        setSaving(false);
        return;
      }

      console.log('[EditFood] Food updated successfully');
      Alert.alert('Success', 'Food entry updated!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('[EditFood] Error in handleSave:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.errorText, { color: isDark ? colors.textDark : colors.text }]}>
            Food item not found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isUserCreated = item.foods?.user_created;
  const servingUnit = item.foods?.serving_unit || 'g';
  const isGramBased = servingUnit === 'g';

  // Calculate display values
  const gramsNum = parseFloat(grams) || 100;
  const caloriesNum = parseFloat(calories) || 0;
  const proteinNum = parseFloat(protein) || 0;
  const carbsNum = parseFloat(carbs) || 0;
  const fatsNum = parseFloat(fats) || 0;
  const fiberNum = parseFloat(fiber) || 0;

  const servingAmount = item.foods?.serving_amount || 100;
  const multiplier = isGramBased ? gramsNum / servingAmount : gramsNum;

  const displayCalories = caloriesNum * multiplier;
  const displayProtein = proteinNum * multiplier;
  const displayCarbs = carbsNum * multiplier;
  const displayFats = fatsNum * multiplier;
  const displayFiber = fiberNum * multiplier;

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
            Edit Food Entry
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
              Food Details
            </Text>

            {isUserCreated ? (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                  Food Name *
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder="e.g., Chicken Breast"
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  value={foodName}
                  onChangeText={setFoodName}
                  returnKeyType="next"
                />
              </View>
            ) : (
              <View style={styles.infoGroup}>
                <Text style={[styles.foodNameDisplay, { color: isDark ? colors.textDark : colors.text }]}>
                  {item.foods?.name || 'Unknown Food'}
                </Text>
                {item.foods?.brand && (
                  <Text style={[styles.foodBrandDisplay, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    {item.foods.brand}
                  </Text>
                )}
                <Text style={[styles.infoNote, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  This is a database food. You can only change the amount.
                </Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                {isGramBased ? 'Amount (grams) *' : 'Quantity (servings) *'}
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder={isGramBased ? '100' : '1'}
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={grams}
                  onChangeText={setGrams}
                  returnKeyType="next"
                />
                <Text style={[styles.unitLabel, { color: isDark ? colors.textDark : colors.text }]}>
                  {isGramBased ? 'g' : servingUnit}
                </Text>
              </View>
              <Text style={[styles.helpText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Base serving: {servingAmount} {servingUnit}
              </Text>
            </View>

            {isGramBased && (
              <View style={styles.quickButtons}>
                <TouchableOpacity
                  style={[styles.quickButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                  onPress={() => setGrams('50')}
                >
                  <Text style={[styles.quickButtonText, { color: isDark ? colors.textDark : colors.text }]}>50g</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                  onPress={() => setGrams('100')}
                >
                  <Text style={[styles.quickButtonText, { color: isDark ? colors.textDark : colors.text }]}>100g</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                  onPress={() => setGrams('150')}
                >
                  <Text style={[styles.quickButtonText, { color: isDark ? colors.textDark : colors.text }]}>150g</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                  onPress={() => setGrams('200')}
                >
                  <Text style={[styles.quickButtonText, { color: isDark ? colors.textDark : colors.text }]}>200g</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {isUserCreated && (
            <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
              <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
                Nutrition (per {servingAmount}{servingUnit})
              </Text>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                  Calories *
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder="0"
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
                    Protein (g)
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
                    Carbs (g)
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
                    Fats (g)
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
                    Fiber (g)
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
          )}

          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Total Nutrition
            </Text>
            <Text style={[styles.totalNote, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              For {Math.round(gramsNum)}{isGramBased ? 'g' : ` ${servingUnit}`}
            </Text>

            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textDark : colors.text }]}>
                Calories
              </Text>
              <Text style={[styles.totalValue, { color: colors.calories }]}>
                {Math.round(displayCalories)} kcal
              </Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textDark : colors.text }]}>
                Protein
              </Text>
              <Text style={[styles.totalValue, { color: colors.protein }]}>
                {displayProtein.toFixed(1)}g
              </Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textDark : colors.text }]}>
                Carbs
              </Text>
              <Text style={[styles.totalValue, { color: colors.carbs }]}>
                {displayCarbs.toFixed(1)}g
              </Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textDark : colors.text }]}>
                Fats
              </Text>
              <Text style={[styles.totalValue, { color: colors.fats }]}>
                {displayFats.toFixed(1)}g
              </Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textDark : colors.text }]}>
                Fiber
              </Text>
              <Text style={[styles.totalValue, { color: colors.fiber }]}>
                {displayFiber.toFixed(1)}g
              </Text>
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
              <Text style={styles.saveButtonText}>Save Changes</Text>
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
  errorText: {
    ...typography.body,
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
  infoGroup: {
    marginBottom: spacing.md,
  },
  foodNameDisplay: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  foodBrandDisplay: {
    ...typography.body,
    marginBottom: spacing.sm,
  },
  infoNote: {
    ...typography.caption,
    fontStyle: 'italic',
  },
  label: {
    ...typography.bodyBold,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  unitLabel: {
    ...typography.h3,
    fontSize: 18,
  },
  helpText: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  quickButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  quickButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickButtonText: {
    ...typography.bodyBold,
    fontSize: 14,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  macroInput: {
    flex: 1,
  },
  totalNote: {
    ...typography.caption,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  totalLabel: {
    ...typography.body,
  },
  totalValue: {
    ...typography.bodyBold,
    fontSize: 18,
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

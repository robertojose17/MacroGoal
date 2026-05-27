
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Image, ImageSourcePropType, Modal,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase/client';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';

// ─── Types ────────────────────────────────────────────────────────────────────

type MealTypeOption = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEAL_TYPE_OPTIONS: MealTypeOption[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface Ingredient {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

// ─── Form Field ───────────────────────────────────────────────────────────────

function FormLabel({ text, required, isDark }: { text: string; required?: boolean; isDark: boolean }) {
  const color = isDark ? colors.textSecondaryDark : colors.textSecondary;
  return (
    <View style={{ flexDirection: 'row', marginBottom: 6 }}>
      <Text style={[formStyles.label, { color }]}>{text}</Text>
      {required && <Text style={{ color: colors.error, fontSize: 12, marginLeft: 2 }}>*</Text>}
    </View>
  );
}

const formStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RecipeCreateScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Form state
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mealType, setMealType] = useState<MealTypeOption>('lunch');
  const [cuisine, setCuisine] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  // Quick Add modal state
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [qaName, setQaName] = useState('');
  const [qaGrams, setQaGrams] = useState('');
  const [qaKcal, setQaKcal] = useState('');
  const [qaProtein, setQaProtein] = useState('');
  const [qaCarbs, setQaCarbs] = useState('');
  const [qaFat, setQaFat] = useState('');

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? colors.cardDark : colors.card;
  const inputBorder = isDark ? colors.borderDark : colors.border;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;

  const inputStyle = [styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }];

  // ── Consume pendingIngredient when screen regains focus ──
  useFocusEffect(
    useCallback(() => {
      const pending = (global as any).__pendingIngredient;
      if (pending) {
        console.log('[RecipeCreate] Consuming pendingIngredient:', pending.name);
        setIngredients(prev => [...prev, pending as Ingredient]);
        (global as any).__pendingIngredient = null;
      }
    }, [])
  );

  // ── Derived totals ──
  const totalKcal = ingredients.reduce((s, i) => s + i.kcal, 0);
  const totalProtein = ingredients.reduce((s, i) => s + i.protein, 0);
  const totalCarbs = ingredients.reduce((s, i) => s + i.carbs, 0);
  const totalFat = ingredients.reduce((s, i) => s + i.fat, 0);

  const totalKcalDisplay = String(Math.round(totalKcal));
  const totalProteinDisplay = String(Math.round(totalProtein));
  const totalCarbsDisplay = String(Math.round(totalCarbs));
  const totalFatDisplay = String(Math.round(totalFat));

  // ── Photo picker ──
  const handlePickPhoto = async () => {
    console.log('[RecipeCreate] Photo picker pressed');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      console.log('[RecipeCreate] Photo selected:', result.assets[0].uri);
      setPhotoUri(result.assets[0].uri);
    }
  };

  // ── Upload photo ──
  const uploadPhoto = async (uri: string): Promise<string | null> => {
    console.log('[RecipeCreate] Uploading photo to Supabase Storage');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const ext = uri.split('.').pop() || 'jpg';
      const fileName = `${user.id}_${Date.now()}.${ext}`;

      const response = await fetch(uri);
      const blob = await response.blob();

      const { data, error } = await supabase.storage
        .from('recipe-images')
        .upload(fileName, blob, { contentType: `image/${ext}`, upsert: false });

      if (error) {
        console.error('[RecipeCreate] Storage upload error:', error);
        return null;
      }

      const { data: urlData } = supabase.storage.from('recipe-images').getPublicUrl(data.path);
      console.log('[RecipeCreate] Photo uploaded, URL:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (err) {
      console.error('[RecipeCreate] Photo upload failed, continuing without image:', err);
      return null;
    }
  };

  // ── Ingredient picker buttons ──
  const handleOpenLibrary = () => {
    console.log('[RecipeCreate] Library button pressed — opening food-search in ingredient mode');
    router.push({ pathname: '/food-search', params: { mode: 'ingredient' } });
  };

  const handleOpenBarcode = () => {
    console.log('[RecipeCreate] Barcode button pressed — opening barcode-scanner in ingredient mode');
    router.push({ pathname: '/barcode-scanner', params: { mode: 'ingredient' } });
  };

  const handleOpenQuickAdd = () => {
    console.log('[RecipeCreate] Quick Add button pressed — opening inline modal');
    setQuickAddVisible(true);
  };

  const handleQuickAddCancel = () => {
    console.log('[RecipeCreate] Quick Add modal cancelled');
    setQuickAddVisible(false);
    setQaName(''); setQaGrams(''); setQaKcal(''); setQaProtein(''); setQaCarbs(''); setQaFat('');
  };

  const handleQuickAddSubmit = () => {
    const trimmedName = qaName.trim();
    if (!trimmedName) {
      Alert.alert('Required', 'Please enter an ingredient name.');
      return;
    }
    const kcalNum = parseFloat(qaKcal);
    if (!qaKcal.trim() || isNaN(kcalNum) || kcalNum <= 0) {
      Alert.alert('Required', 'Please enter calories.');
      return;
    }
    const ing: Ingredient = {
      name: trimmedName,
      grams: parseFloat(qaGrams) || 0,
      kcal: kcalNum,
      protein: parseFloat(qaProtein) || 0,
      carbs: parseFloat(qaCarbs) || 0,
      fat: parseFloat(qaFat) || 0,
    };
    console.log('[RecipeCreate] Quick Add ingredient submitted:', ing.name, 'kcal:', ing.kcal);
    setIngredients(prev => [...prev, ing]);
    setQuickAddVisible(false);
    setQaName(''); setQaGrams(''); setQaKcal(''); setQaProtein(''); setQaCarbs(''); setQaFat('');
  };

  const removeIngredient = (index: number) => {
    console.log('[RecipeCreate] Remove ingredient pressed, index:', index);
    setIngredients(prev => prev.filter((_, i) => i !== index));
  };

  // ── Publish ──
  const handlePublish = async () => {
    console.log('[RecipeCreate] Publish Recipe pressed');

    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a recipe name.');
      return;
    }
    if (ingredients.length === 0) {
      Alert.alert('Required', 'Please add at least one ingredient.');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in to publish recipes.');
        return;
      }

      let thumbnailUrl: string | null = null;
      if (photoUri) {
        thumbnailUrl = await uploadPhoto(photoUri);
      }

      const ingredientsPayload = ingredients.map(i => ({
        name: i.name,
        amount: `${i.grams}g`,
      }));

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        meal_type: mealType,
        cuisine: cuisine.trim() || 'Other',
        calories: Math.round(totalKcal) || null,
        protein: Math.round(totalProtein) || null,
        carbs: Math.round(totalCarbs) || null,
        fat: Math.round(totalFat) || null,
        ingredients: ingredientsPayload.length > 0 ? ingredientsPayload : null,
        instructions: instructions.trim() || null,
        thumbnail_url: thumbnailUrl,
        source: 'user',
        created_by: user.id,
        is_public: true,
        approved_for_meal_plan: false,
      };

      console.log('[RecipeCreate] Inserting recipe into meal_recipes:', payload.name, 'kcal:', payload.calories);
      const { data, error } = await supabase
        .from('meal_recipes')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[RecipeCreate] Error inserting recipe:', error);
        Alert.alert('Error', 'Failed to publish recipe. Please try again.');
        return;
      }

      console.log('[RecipeCreate] Recipe published successfully, id:', data?.id);
      router.back();
    } catch (err: any) {
      console.error('[RecipeCreate] Unexpected error:', err);
      Alert.alert('Error', err?.message || 'Failed to publish recipe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <Stack.Screen
        options={{
          title: 'New Recipe',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: isDark ? colors.backgroundDark : colors.background },
          headerTintColor: textColor,
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Photo picker */}
          <TouchableOpacity
            style={[styles.photoPicker, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={handlePickPhoto}
            activeOpacity={0.8}
          >
            {photoUri ? (
              <Image source={resolveImageSource(photoUri)} style={styles.photoPreview} resizeMode="cover" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="camera-alt" size={32} color={secondaryColor} />
                <Text style={[styles.photoPlaceholderText, { color: secondaryColor }]}>Add Photo (optional)</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Name */}
          <View style={styles.fieldGroup}>
            <FormLabel text="Recipe Name" required isDark={isDark} />
            <TextInput
              style={inputStyle}
              placeholder="e.g. Grilled Chicken Salad"
              placeholderTextColor={secondaryColor}
              value={name}
              onChangeText={setName}
              returnKeyType="next"
            />
          </View>

          {/* Description */}
          <View style={styles.fieldGroup}>
            <FormLabel text="Description" isDark={isDark} />
            <TextInput
              style={[inputStyle, styles.textArea]}
              placeholder="Brief description of the recipe..."
              placeholderTextColor={secondaryColor}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Meal type */}
          <View style={styles.fieldGroup}>
            <FormLabel text="Meal Type" isDark={isDark} />
            <View style={styles.pillRow}>
              {MEAL_TYPE_OPTIONS.map((option) => {
                const isActive = mealType === option;
                const label = option.charAt(0).toUpperCase() + option.slice(1);
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.mealTypePill,
                      {
                        backgroundColor: isActive ? colors.primary : inputBg,
                        borderColor: isActive ? colors.primary : inputBorder,
                      },
                    ]}
                    onPress={() => {
                      console.log('[RecipeCreate] Meal type selected:', option);
                      setMealType(option);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.mealTypePillText, { color: isActive ? '#fff' : secondaryColor }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Cuisine */}
          <View style={styles.fieldGroup}>
            <FormLabel text="Cuisine" isDark={isDark} />
            <TextInput
              style={inputStyle}
              placeholder="e.g. Italian, Mexican, Other"
              placeholderTextColor={secondaryColor}
              value={cuisine}
              onChangeText={setCuisine}
              returnKeyType="next"
            />
          </View>

          {/* Ingredients section */}
          <View style={styles.fieldGroup}>
            <FormLabel text="Ingredients" required isDark={isDark} />

            {/* Totals card — only shown when there are ingredients */}
            {ingredients.length > 0 && (
              <View style={[styles.totalsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Text style={[styles.totalsTitle, { color: textColor }]}>Totals</Text>
                <View style={styles.totalsRow}>
                  <View style={styles.totalItem}>
                    <Text style={[styles.totalValue, { color: colors.calories }]}>{totalKcalDisplay}</Text>
                    <Text style={[styles.totalLabel, { color: secondaryColor }]}>kcal</Text>
                  </View>
                  <View style={styles.totalItem}>
                    <Text style={[styles.totalValue, { color: colors.protein }]}>{totalProteinDisplay}g</Text>
                    <Text style={[styles.totalLabel, { color: secondaryColor }]}>Protein</Text>
                  </View>
                  <View style={styles.totalItem}>
                    <Text style={[styles.totalValue, { color: colors.carbs }]}>{totalCarbsDisplay}g</Text>
                    <Text style={[styles.totalLabel, { color: secondaryColor }]}>Carbs</Text>
                  </View>
                  <View style={styles.totalItem}>
                    <Text style={[styles.totalValue, { color: colors.fats }]}>{totalFatDisplay}g</Text>
                    <Text style={[styles.totalLabel, { color: secondaryColor }]}>Fat</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Ingredient list */}
            {ingredients.map((ing, idx) => {
              const ingKcal = String(Math.round(ing.kcal));
              const ingGrams = String(Math.round(ing.grams));
              const ingProtein = String(Math.round(ing.protein));
              const ingCarbs = String(Math.round(ing.carbs));
              const ingFat = String(Math.round(ing.fat));
              return (
                <View key={idx} style={[styles.ingredientRow, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                  <View style={styles.ingredientInfo}>
                    <Text style={[styles.ingredientName, { color: textColor }]} numberOfLines={1}>{ing.name}</Text>
                    <Text style={[styles.ingredientMacros, { color: secondaryColor }]}>
                      {ingGrams}g
                      {'  ·  '}
                      {ingKcal}kcal
                      {'  ·  '}
                      <Text style={{ color: colors.protein }}>P{ingProtein}</Text>
                      {'  '}
                      <Text style={{ color: colors.carbs }}>C{ingCarbs}</Text>
                      {'  '}
                      <Text style={{ color: colors.fats }}>F{ingFat}</Text>
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.removeIngredientBtn, { backgroundColor: colors.error + '22' }]}
                    onPress={() => removeIngredient(idx)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={14} color={colors.error} />
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* Picker buttons */}
            <View style={styles.pickerButtonsRow}>
              <TouchableOpacity
                style={[styles.pickerBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}
                onPress={handleOpenLibrary}
                activeOpacity={0.7}
              >
                <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={16} color={colors.primary} />
                <Text style={[styles.pickerBtnText, { color: colors.primary }]}>Library</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerBtn, { backgroundColor: colors.info + '18', borderColor: colors.info }]}
                onPress={handleOpenBarcode}
                activeOpacity={0.7}
              >
                <IconSymbol ios_icon_name="barcode.viewfinder" android_material_icon_name="qr-code-scanner" size={16} color={colors.info} />
                <Text style={[styles.pickerBtnText, { color: colors.info }]}>Barcode</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerBtn, { backgroundColor: colors.success + '18', borderColor: colors.success }]}
                onPress={handleOpenQuickAdd}
                activeOpacity={0.7}
              >
                <IconSymbol ios_icon_name="plus.circle" android_material_icon_name="add-circle-outline" size={16} color={colors.success} />
                <Text style={[styles.pickerBtnText, { color: colors.success }]}>Quick Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Instructions */}
          <View style={styles.fieldGroup}>
            <FormLabel text="Instructions" isDark={isDark} />
            <TextInput
              style={[inputStyle, styles.instructionsArea]}
              placeholder="Step-by-step instructions..."
              placeholderTextColor={secondaryColor}
              value={instructions}
              onChangeText={setInstructions}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>

          {/* Publish button */}
          <TouchableOpacity
            style={[styles.publishBtn, { backgroundColor: colors.success, opacity: saving ? 0.7 : 1 }]}
            onPress={handlePublish}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <IconSymbol ios_icon_name="paperplane.fill" android_material_icon_name="send" size={20} color="#fff" />
                <Text style={styles.publishBtnText}>Publish Recipe</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Quick Add Modal */}
      <Modal
        visible={quickAddVisible}
        transparent
        animationType="slide"
        onRequestClose={handleQuickAddCancel}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKAV}
          >
            <View style={[styles.modalSheet, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
              <Text style={[styles.modalTitle, { color: textColor }]}>Quick Add Ingredient</Text>

              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: secondaryColor }]}>Name *</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
                  placeholder="e.g. Olive oil"
                  placeholderTextColor={secondaryColor}
                  value={qaName}
                  onChangeText={setQaName}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: secondaryColor }]}>Grams (optional)</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
                  placeholder="0"
                  placeholderTextColor={secondaryColor}
                  value={qaGrams}
                  onChangeText={setQaGrams}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: secondaryColor }]}>Calories *</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
                  placeholder="0"
                  placeholderTextColor={secondaryColor}
                  value={qaKcal}
                  onChangeText={setQaKcal}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.modalMacroRow}>
                <View style={[styles.modalField, { flex: 1 }]}>
                  <Text style={[styles.modalLabel, { color: colors.protein }]}>Protein (g)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
                    placeholder="0"
                    placeholderTextColor={secondaryColor}
                    value={qaProtein}
                    onChangeText={setQaProtein}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                </View>
                <View style={[styles.modalField, { flex: 1 }]}>
                  <Text style={[styles.modalLabel, { color: colors.carbs }]}>Carbs (g)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
                    placeholder="0"
                    placeholderTextColor={secondaryColor}
                    value={qaCarbs}
                    onChangeText={setQaCarbs}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                </View>
                <View style={[styles.modalField, { flex: 1 }]}>
                  <Text style={[styles.modalLabel, { color: colors.fats }]}>Fat (g)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
                    placeholder="0"
                    placeholderTextColor={secondaryColor}
                    value={qaFat}
                    onChangeText={setQaFat}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleQuickAddSubmit}
                  />
                </View>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: inputBorder }]}
                  onPress={handleQuickAddCancel}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.modalCancelBtnText, { color: secondaryColor }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalAddBtn, { backgroundColor: colors.success }]}
                  onPress={handleQuickAddSubmit}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalAddBtnText}>Add Ingredient</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 60,
  },
  photoPicker: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.md,
    height: 160,
  },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  photoPlaceholderText: { fontSize: 14, fontWeight: '500' },

  fieldGroup: { marginBottom: spacing.md },

  input: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  textArea: {
    minHeight: 80,
    paddingTop: spacing.sm,
  },
  instructionsArea: {
    minHeight: 120,
    paddingTop: spacing.sm,
  },

  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  mealTypePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  mealTypePillText: { fontSize: 13, fontWeight: '600' },

  totalsCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  totalsTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalItem: {
    alignItems: 'center',
    flex: 1,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  totalLabel: {
    fontSize: 11,
    marginTop: 2,
  },

  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  ingredientInfo: { flex: 1 },
  ingredientName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  ingredientMacros: { fontSize: 12 },
  removeIngredientBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  pickerButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  pickerBtn: {
    flex: 1,
    minWidth: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
  },
  pickerBtnText: { fontSize: 13, fontWeight: '700' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalKAV: { width: '100%' },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  modalField: {
    marginBottom: spacing.sm,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  modalInput: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  modalMacroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: { fontSize: 15, fontWeight: '600' },
  modalAddBtn: {
    flex: 2,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAddBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  publishBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});


import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Image, ImageSourcePropType,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
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
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '' }]);
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? colors.cardDark : colors.card;
  const inputBorder = isDark ? colors.borderDark : colors.border;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;

  const inputStyle = [styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }];

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
        // TODO: bucket may not exist — continue with null
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

  // ── Ingredient helpers ──
  const addIngredient = () => {
    console.log('[RecipeCreate] Add ingredient pressed');
    setIngredients(prev => [...prev, { name: '' }]);
  };

  const updateIngredient = (index: number, value: string) => {
    setIngredients(prev => prev.map((ing, i) => i === index ? { name: value } : ing));
  };

  const removeIngredient = (index: number) => {
    console.log('[RecipeCreate] Remove ingredient pressed, index:', index);
    setIngredients(prev => prev.filter((_, i) => i !== index));
  };

  // ── Publish ──
  const handlePublish = async () => {
    console.log('[RecipeCreate] Publish Recipe pressed');

    // Validation
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a recipe name.');
      return;
    }
    if (!calories.trim() || !protein.trim() || !carbs.trim() || !fat.trim()) {
      Alert.alert('Required', 'Please fill in all macro fields (calories, protein, carbs, fat).');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in to publish recipes.');
        return;
      }

      // Upload photo if selected
      let thumbnailUrl: string | null = null;
      if (photoUri) {
        thumbnailUrl = await uploadPhoto(photoUri);
        if (!thumbnailUrl) {
          console.log('[RecipeCreate] Photo upload failed, continuing without thumbnail');
        }
      }

      // Filter out empty ingredients
      const filteredIngredients = ingredients
        .map(i => ({ name: i.name.trim() }))
        .filter(i => i.name.length > 0);

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        meal_type: mealType,
        cuisine: cuisine.trim() || 'Other',
        calories: Number(calories) || null,
        protein: Number(protein) || null,
        carbs: Number(carbs) || null,
        fat: Number(fat) || null,
        ingredients: filteredIngredients.length > 0 ? filteredIngredients : null,
        instructions: instructions.trim() || null,
        thumbnail_url: thumbnailUrl,
        source: 'user',
        created_by: user.id,
        is_public: true,
        approved_for_meal_plan: false,
      };

      console.log('[RecipeCreate] Inserting recipe into meal_recipes:', payload.name);
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

          {/* Macros */}
          <View style={styles.fieldGroup}>
            <FormLabel text="Macros per Serving" required isDark={isDark} />
            <View style={styles.macroGrid}>
              <View style={styles.macroInputWrapper}>
                <Text style={[styles.macroInputLabel, { color: colors.calories }]}>Calories</Text>
                <TextInput
                  style={[inputStyle, styles.macroInput]}
                  placeholder="0"
                  placeholderTextColor={secondaryColor}
                  value={calories}
                  onChangeText={setCalories}
                  keyboardType="numeric"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.macroInputWrapper}>
                <Text style={[styles.macroInputLabel, { color: colors.protein }]}>Protein (g)</Text>
                <TextInput
                  style={[inputStyle, styles.macroInput]}
                  placeholder="0"
                  placeholderTextColor={secondaryColor}
                  value={protein}
                  onChangeText={setProtein}
                  keyboardType="numeric"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.macroInputWrapper}>
                <Text style={[styles.macroInputLabel, { color: colors.carbs }]}>Carbs (g)</Text>
                <TextInput
                  style={[inputStyle, styles.macroInput]}
                  placeholder="0"
                  placeholderTextColor={secondaryColor}
                  value={carbs}
                  onChangeText={setCarbs}
                  keyboardType="numeric"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.macroInputWrapper}>
                <Text style={[styles.macroInputLabel, { color: colors.fats }]}>Fat (g)</Text>
                <TextInput
                  style={[inputStyle, styles.macroInput]}
                  placeholder="0"
                  placeholderTextColor={secondaryColor}
                  value={fat}
                  onChangeText={setFat}
                  keyboardType="numeric"
                  returnKeyType="next"
                />
              </View>
            </View>
          </View>

          {/* Ingredients */}
          <View style={styles.fieldGroup}>
            <FormLabel text="Ingredients" isDark={isDark} />
            {ingredients.map((ing, idx) => (
              <View key={idx} style={styles.ingredientRow}>
                <TextInput
                  style={[inputStyle, styles.ingredientInput]}
                  placeholder={`Ingredient ${idx + 1}`}
                  placeholderTextColor={secondaryColor}
                  value={ing.name}
                  onChangeText={(val) => updateIngredient(idx, val)}
                  returnKeyType="next"
                />
                {ingredients.length > 1 && (
                  <TouchableOpacity
                    style={[styles.removeIngredientBtn, { backgroundColor: colors.error + '22' }]}
                    onPress={() => removeIngredient(idx)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <IconSymbol ios_icon_name="minus" android_material_icon_name="remove" size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity
              style={[styles.addIngredientBtn, { borderColor: colors.primary }]}
              onPress={addIngredient}
              activeOpacity={0.7}
            >
              <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color={colors.primary} />
              <Text style={[styles.addIngredientText, { color: colors.primary }]}>Add Ingredient</Text>
            </TouchableOpacity>
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

  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  macroInputWrapper: {
    width: '47%',
  },
  macroInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  macroInput: {
    textAlign: 'center',
  },

  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  ingredientInput: { flex: 1 },
  removeIngredientBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIngredientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  addIngredientText: { fontSize: 14, fontWeight: '600' },

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

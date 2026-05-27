
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView,
  Platform, ImageSourcePropType, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase/client';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecipeDetail {
  id: string;
  name: string;
  cuisine: string | null;
  meal_type: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  description: string | null;
  dietary_tags: string[] | null;
  thumbnail_url: string | null;
  source: string | null;
  average_rating: number | null;
  review_count: number | null;
  ingredients: any;
  instructions: string | null;
  created_by: string | null;
}

interface RecipeReview {
  id: string;
  recipe_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

function parseIngredient(item: any): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    if (item.name && item.amount) return `${item.name} — ${item.amount}`;
    if (item.name) return String(item.name);
    if (item.amount) return String(item.amount);
    try { return JSON.stringify(item); } catch { return String(item); }
  }
  return String(item);
}

function renderStars(rating: number, size: number = 20): string {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// ─── Star Picker ──────────────────────────────────────────────────────────────

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginVertical: spacing.md }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => {
            console.log('[RecipeDetail] Star rating selected:', star);
            onChange(star);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={{ fontSize: 36, color: star <= value ? colors.fats : '#D1D5DB' }}>
            {star <= value ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Macro Pill ───────────────────────────────────────────────────────────────

function MacroPill({ label, value, unit, color, isDark }: { label: string; value: number | null; unit: string; color: string; isDark: boolean }) {
  const displayValue = value != null ? String(Math.round(Number(value))) : '—';
  return (
    <View style={[macroPillStyles.pill, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}>
      <Text style={[macroPillStyles.value, { color }]}>{displayValue}</Text>
      <Text style={[macroPillStyles.unit, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>{unit}</Text>
      <Text style={[macroPillStyles.label, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const macroPillStyles = StyleSheet.create({
  pill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: 2,
  },
  value: { fontSize: 18, fontWeight: '700' },
  unit: { fontSize: 11, fontWeight: '500' },
  label: { fontSize: 11, fontWeight: '500' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Favorite/bookmark state
  const [isSaved, setIsSaved] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);

  // Rating state
  const [myReview, setMyReview] = useState<RecipeReview | null>(null);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;

  const loadRecipe = useCallback(async () => {
    if (!id) return;
    console.log('[RecipeDetail] Loading recipe:', id);
    setLoading(true);
    setError(null);
    try {
      const [recipeResult, userResult] = await Promise.all([
        supabase
          .from('meal_recipes')
          .select('id, name, cuisine, meal_type, calories, protein, carbs, fat, description, dietary_tags, thumbnail_url, source, average_rating, review_count, ingredients, instructions, created_by')
          .eq('id', id)
          .single(),
        supabase.auth.getUser(),
      ]);

      if (recipeResult.error) {
        console.error('[RecipeDetail] Error loading recipe:', recipeResult.error);
        setError('Failed to load recipe.');
        return;
      }

      console.log('[RecipeDetail] Recipe loaded:', recipeResult.data?.name);
      setRecipe(recipeResult.data as RecipeDetail);

      // Load user's existing review and favorite status
      const user = userResult.data?.user;
      if (user) setCurrentUserId(user.id);
      if (user) {
        const [reviewResult, favoriteResult] = await Promise.all([
          supabase
            .from('recipe_reviews')
            .select('*')
            .eq('recipe_id', id)
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('recipe_favorites')
            .select('id')
            .eq('recipe_id', id)
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        if (!reviewResult.error && reviewResult.data) {
          console.log('[RecipeDetail] Existing review found, rating:', reviewResult.data.rating);
          setMyReview(reviewResult.data as RecipeReview);
          setSelectedRating(reviewResult.data.rating);
          setRatingComment(reviewResult.data.comment || '');
        }

        const savedState = !favoriteResult.error && !!favoriteResult.data;
        console.log('[RecipeDetail] Recipe saved state:', savedState);
        setIsSaved(savedState);
      }
    } catch (err: any) {
      console.error('[RecipeDetail] Unexpected error:', err);
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadRecipe();
  }, [loadRecipe]);

  const handleSubmitRating = async () => {
    if (selectedRating === 0) {
      Alert.alert('Rating required', 'Please select a star rating before submitting.');
      return;
    }
    console.log('[RecipeDetail] Submitting rating:', selectedRating, 'for recipe:', id);
    setSubmittingRating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in to rate recipes.');
        return;
      }

      const reviewPayload = {
        recipe_id: id,
        user_id: user.id,
        rating: selectedRating,
        comment: ratingComment.trim() || null,
      };

      const { data, error: upsertError } = await supabase
        .from('recipe_reviews')
        .upsert(reviewPayload, { onConflict: 'recipe_id,user_id' })
        .select()
        .single();

      if (upsertError) {
        console.error('[RecipeDetail] Error submitting rating:', upsertError);
        Alert.alert('Error', 'Failed to submit rating. Please try again.');
        return;
      }

      console.log('[RecipeDetail] Rating submitted successfully');
      setMyReview(data as RecipeReview);
      setRatingModalVisible(false);
      // Reload to get updated average
      loadRecipe();
    } catch (err: any) {
      console.error('[RecipeDetail] Unexpected error submitting rating:', err);
      Alert.alert('Error', err?.message || 'Failed to submit rating.');
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: bgColor }]}>
        <Stack.Screen options={{ title: 'Recipe', headerBackTitle: 'Back' }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !recipe) {
    return (
      <View style={[styles.centered, { backgroundColor: bgColor }]}>
        <Stack.Screen options={{ title: 'Recipe', headerBackTitle: 'Back' }} />
        <Text style={[styles.errorText, { color: colors.error }]}>{error || 'Recipe not found.'}</Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            console.log('[RecipeDetail] Retry pressed');
            loadRecipe();
          }}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cuisineLabel = recipe.cuisine || 'Unknown';
  const mealTypeLabel = recipe.meal_type ? recipe.meal_type.charAt(0).toUpperCase() + recipe.meal_type.slice(1) : '';
  const subtitleLabel = [cuisineLabel, mealTypeLabel].filter(Boolean).join(' · ');
  const avgRating = recipe.average_rating != null ? Number(recipe.average_rating) : 0;
  const avgRatingDisplay = recipe.average_rating != null ? Number(recipe.average_rating).toFixed(1) : '—';
  const reviewCountDisplay = recipe.review_count != null ? String(recipe.review_count) : '0';
  const starsDisplay = avgRating > 0 ? renderStars(avgRating) : '☆☆☆☆☆';

  const ingredients: any[] = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const instructionsText = recipe.instructions || '';

  const myRatingLabel = myReview ? `You rated this ${myReview.rating}/5` : null;

  const isOwner = !!(currentUserId && recipe.created_by && currentUserId === recipe.created_by);

  const handleToggleSave = async () => {
    if (!currentUserId || !recipe) return;
    console.log('[RecipeDetail] Bookmark toggle pressed, currently saved:', isSaved, 'recipe:', recipe.id);

    // Optimistic update
    const previousState = isSaved;
    setIsSaved(!isSaved);
    setSavingFavorite(true);

    try {
      if (previousState) {
        // Remove from favorites
        const { error: deleteError } = await supabase
          .from('recipe_favorites')
          .delete()
          .eq('user_id', currentUserId)
          .eq('recipe_id', recipe.id);

        if (deleteError) {
          console.error('[RecipeDetail] Error removing favorite:', deleteError);
          setIsSaved(previousState); // revert
          Alert.alert('Error', 'Failed to remove from saved. Please try again.');
        } else {
          console.log('[RecipeDetail] Recipe removed from favorites');
        }
      } else {
        // Add to favorites
        const { error: insertError } = await supabase
          .from('recipe_favorites')
          .insert({ user_id: currentUserId, recipe_id: recipe.id });

        if (insertError) {
          console.error('[RecipeDetail] Error saving favorite:', insertError);
          setIsSaved(previousState); // revert
          Alert.alert('Error', 'Failed to save recipe. Please try again.');
        } else {
          console.log('[RecipeDetail] Recipe added to favorites');
        }
      }
    } catch (err: any) {
      console.error('[RecipeDetail] Unexpected error toggling favorite:', err);
      setIsSaved(previousState); // revert
    } finally {
      setSavingFavorite(false);
    }
  };

  const handleEdit = () => {
    console.log('[RecipeDetail] Edit button pressed for recipe:', recipe.id);
    router.push({ pathname: '/recipe-edit', params: { id: recipe.id } });
  };

  const handleDelete = () => {
    console.log('[RecipeDetail] Delete button pressed for recipe:', recipe.id);
    Alert.alert(
      'Delete Recipe',
      'Are you sure you want to delete this recipe? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            console.log('[RecipeDetail] Confirming delete for recipe:', recipe.id);
            try {
              const { error: deleteError } = await supabase
                .from('meal_recipes')
                .delete()
                .eq('id', recipe.id);
              if (deleteError) {
                console.error('[RecipeDetail] Error deleting recipe:', deleteError);
                Alert.alert('Error', 'Failed to delete recipe. Please try again.');
                return;
              }
              console.log('[RecipeDetail] Recipe deleted successfully');
              router.back();
            } catch (err: any) {
              console.error('[RecipeDetail] Unexpected error deleting:', err);
              Alert.alert('Error', err?.message || 'Failed to delete recipe.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <Stack.Screen
        options={{
          title: recipe.name,
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: isDark ? colors.backgroundDark : colors.background },
          headerTintColor: textColor,
        }}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Hero image */}
        {recipe.thumbnail_url ? (
          <View style={styles.heroContainer}>
            <Image
              source={resolveImageSource(recipe.thumbnail_url)}
              style={styles.heroImage}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.55)']}
              style={styles.heroGradient}
            />
            {currentUserId ? (
              <TouchableOpacity
                style={styles.bookmarkBtn}
                onPress={handleToggleSave}
                disabled={savingFavorite}
                activeOpacity={0.8}
              >
                <IconSymbol
                  ios_icon_name={isSaved ? 'bookmark.fill' : 'bookmark'}
                  android_material_icon_name={isSaved ? 'bookmark' : 'bookmark-border'}
                  size={22}
                  color="#fff"
                />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={[styles.heroPlaceholder, { backgroundColor: colors.primary + '33' }]}>
            <Text style={[styles.heroPlaceholderText, { color: colors.primary }]}>{cuisineLabel}</Text>
            {currentUserId ? (
              <TouchableOpacity
                style={[styles.bookmarkBtnPlain, { backgroundColor: isSaved ? colors.primary : (isDark ? colors.cardDark : colors.card), borderColor: isDark ? colors.borderDark : colors.border }]}
                onPress={handleToggleSave}
                disabled={savingFavorite}
                activeOpacity={0.8}
              >
                <IconSymbol
                  ios_icon_name={isSaved ? 'bookmark.fill' : 'bookmark'}
                  android_material_icon_name={isSaved ? 'bookmark' : 'bookmark-border'}
                  size={20}
                  color={isSaved ? '#fff' : colors.primary}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <View style={styles.contentPadding}>
          {/* Title + subtitle */}
          <Text style={[styles.title, { color: textColor }]}>{recipe.name}</Text>
          <Text style={[styles.subtitle, { color: secondaryColor }]}>{subtitleLabel}</Text>

          {/* Description */}
          {recipe.description ? (
            <Text style={[styles.description, { color: secondaryColor }]}>{recipe.description}</Text>
          ) : null}

          {/* Macro pills */}
          <View style={styles.macroRow}>
            <MacroPill label="Calories" value={recipe.calories} unit="kcal" color={colors.calories} isDark={isDark} />
            <MacroPill label="Protein" value={recipe.protein} unit="g" color={colors.protein} isDark={isDark} />
            <MacroPill label="Carbs" value={recipe.carbs} unit="g" color={colors.carbs} isDark={isDark} />
            <MacroPill label="Fat" value={recipe.fat} unit="g" color={colors.fats} isDark={isDark} />
          </View>

          {/* Rating block */}
          <View style={[styles.ratingCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.ratingHeader}>
              <Text style={[styles.starsText, { color: colors.fats }]}>{starsDisplay}</Text>
              <Text style={[styles.ratingValue, { color: textColor }]}>{avgRatingDisplay}</Text>
              <Text style={[styles.reviewCount, { color: secondaryColor }]}>
                {'('}
                {reviewCountDisplay}
                {' ratings)'}
              </Text>
            </View>

            {myRatingLabel ? (
              <Text style={[styles.myRatingLabel, { color: colors.success }]}>{myRatingLabel}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.rateBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                console.log('[RecipeDetail] Rate this recipe pressed');
                setRatingModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.rateBtnText}>{myReview ? 'Update Rating' : 'Rate this recipe'}</Text>
            </TouchableOpacity>
          </View>

          {/* Ingredients */}
          {ingredients.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Ingredients</Text>
              {ingredients.map((item, idx) => {
                const ingredientText = parseIngredient(item);
                return (
                  <View key={idx} style={styles.ingredientRow}>
                    <View style={[styles.ingredientDot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.ingredientText, { color: textColor }]}>{ingredientText}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Instructions */}
          {instructionsText.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Instructions</Text>
              <Text style={[styles.instructionsText, { color: textColor }]}>{instructionsText}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { backgroundColor: bgColor, borderTopColor: isDark ? colors.borderDark : colors.border }]}>
        {isOwner ? (
          <View style={styles.ownerActions}>
            <TouchableOpacity
              style={[styles.editBtn, { backgroundColor: colors.primary }]}
              onPress={handleEdit}
              activeOpacity={0.85}
            >
              <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={18} color="#fff" />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteBtn, { borderColor: colors.error }]}
              onPress={handleDelete}
              activeOpacity={0.85}
            >
              <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={18} color={colors.error} />
              <Text style={[styles.deleteBtnText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addToPlanBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              console.log('[RecipeDetail] Add to Meal Plan pressed for recipe:', recipe.id);
              Alert.alert('Coming soon', 'We will wire this up to your meal plans next');
            }}
            activeOpacity={0.85}
          >
            <IconSymbol ios_icon_name="calendar.badge.plus" android_material_icon_name="event" size={20} color="#fff" />
            <Text style={styles.addToPlanBtnText}>Add to Meal Plan</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Rating Modal */}
      <Modal
        visible={ratingModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setRatingModalVisible(false)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'position' : undefined}
          style={styles.modalSheet}
        >
          <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
            <View style={[styles.modalHandle, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />
            <Text style={[styles.modalTitle, { color: textColor }]}>Rate this Recipe</Text>
            <Text style={[styles.modalSubtitle, { color: secondaryColor }]}>{recipe.name}</Text>

            <StarPicker value={selectedRating} onChange={setSelectedRating} />

            <Text style={[styles.commentLabel, { color: secondaryColor }]}>Comment (optional)</Text>
            <TextInput
              style={[styles.commentInput, { backgroundColor: isDark ? colors.backgroundDark : '#F3F4F6', color: textColor, borderColor: isDark ? colors.borderDark : colors.border }]}
              placeholder="Share your thoughts..."
              placeholderTextColor={secondaryColor}
              value={ratingComment}
              onChangeText={setRatingComment}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: selectedRating === 0 ? 0.5 : 1 }]}
              onPress={handleSubmitRating}
              disabled={submittingRating || selectedRating === 0}
              activeOpacity={0.8}
            >
              {submittingRating
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitBtnText}>Submit Rating</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelBtn, { backgroundColor: isDark ? colors.backgroundDark : '#F3F4F6' }]}
              onPress={() => {
                console.log('[RecipeDetail] Rating modal cancelled');
                setRatingModalVisible(false);
              }}
            >
              <Text style={[styles.cancelBtnText, { color: textColor }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorText: { ...typography.body, textAlign: 'center', marginBottom: spacing.md },
  retryBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: borderRadius.md },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  heroContainer: { width: '100%', height: 240, position: 'relative' },
  heroImage: { width: '100%', height: 240 },
  heroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 },
  heroPlaceholder: {
    width: '100%',
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderText: { fontSize: 22, fontWeight: '700' },
  bookmarkBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkBtnPlain: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  contentPadding: { paddingHorizontal: spacing.md, paddingTop: spacing.md },

  title: { ...typography.h2, marginBottom: 4 },
  subtitle: { fontSize: 14, fontWeight: '500', marginBottom: spacing.sm },
  description: { fontSize: 14, lineHeight: 21, marginBottom: spacing.md },

  macroRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },

  ratingCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  ratingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  starsText: { fontSize: 20, letterSpacing: 2 },
  ratingValue: { fontSize: 18, fontWeight: '700' },
  reviewCount: { fontSize: 13 },
  myRatingLabel: { fontSize: 13, fontWeight: '600' },
  rateBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  rateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, marginBottom: spacing.sm },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  ingredientDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    flexShrink: 0,
  },
  ingredientText: { flex: 1, fontSize: 14, lineHeight: 20 },
  instructionsText: { fontSize: 14, lineHeight: 22 },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addToPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
  },
  addToPlanBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  ownerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
  },
  editBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
  },
  deleteBtnText: { fontSize: 16, fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  modalSubtitle: { fontSize: 14, textAlign: 'center', marginBottom: spacing.sm },
  commentLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
  commentInput: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.sm,
    fontSize: 15,
    minHeight: 80,
    marginBottom: spacing.md,
  },
  submitBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
});

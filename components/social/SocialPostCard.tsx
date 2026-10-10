import React, { useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Image,
  ImageSourcePropType,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  MessageCircle,
  Trophy,
  Flame,
  TrendingUp,
  MoreHorizontal,
  Bookmark,
  HelpCircle,
  Pin,
  ExternalLink,
  BookmarkCheck,
} from 'lucide-react-native';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import type { SocialPost } from '@/utils/socialApi';
import Avatar from '@/components/social/Avatar';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';

function resolveImageSource(
  source: string | number | ImageSourcePropType | undefined
): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

// ─── MealV2Body sub-component ─────────────────────────────────────────────────

interface MealV2BodyProps {
  post: SocialPost;
  isDark: boolean;
  textColor: string;
  subColor: string;
  mealPhotoUrl: string | null;
  recipeName: string | null;
  captionDiffersFromName: boolean;
  captionText: string | null;
  mealCalDisplay: string | null;
  mealProtDisplay: string | null;
  mealCarbDisplay: string | null;
  mealFatDisplay: string | null;
  servingsDisplay: string | null;
  onSaveMeal: ((post: SocialPost) => void) | null;
  router: ReturnType<typeof useRouter>;
}

function MealV2Body({
  post,
  isDark,
  textColor,
  subColor,
  mealPhotoUrl,
  recipeName,
  captionDiffersFromName,
  captionText,
  mealCalDisplay,
  mealProtDisplay,
  mealCarbDisplay,
  mealFatDisplay,
  servingsDisplay,
  onSaveMeal,
  router,
}: MealV2BodyProps) {
  const [recipeSaved, setRecipeSaved] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);

  const handleViewRecipe = useCallback(() => {
    console.log('[SocialPostCard] View Recipe pressed — post_id:', post.id, 'recipe_id:', post.meal_recipe_id);
    if (post.meal_recipe_id) {
      router.push(`/recipe-finder-detail?recipe_id=${post.meal_recipe_id}`);
    }
  }, [post.id, post.meal_recipe_id, router]);

  const handleSaveToFavorites = useCallback(async () => {
    const recipeData = post.meal_recipe_data;
    if (!recipeData) {
      console.log('[SocialPostCard] Save to Favorites — no recipe_data on post:', post.id);
      return;
    }
    console.log('[SocialPostCard] Save to Favorites pressed — post_id:', post.id, 'recipe_id:', recipeData.id);
    setSavingRecipe(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[SocialPostCard] Save to Favorites — no auth user');
        return;
      }
      const { error } = await supabase.from('saved_recipes').upsert({
        id: recipeData.id,
        user_id: user.id,
        recipe_data: recipeData,
        created_at: new Date().toISOString(),
      });
      if (error) {
        console.error('[SocialPostCard] Save to Favorites error:', error.message);
        Alert.alert('Error', 'Could not save recipe. Please try again.');
      } else {
        console.log('[SocialPostCard] Recipe saved to favorites — recipe_id:', recipeData.id);
        setRecipeSaved(true);
      }
    } catch (e) {
      console.error('[SocialPostCard] Save to Favorites exception:', e);
    } finally {
      setSavingRecipe(false);
    }
  }, [post.id, post.meal_recipe_data]);

  const hasMacros = mealCalDisplay || mealProtDisplay || mealCarbDisplay || mealFatDisplay;

  return (
    <View>
      {mealPhotoUrl ? (
        <Image
          source={resolveImageSource(mealPhotoUrl)}
          style={styles.mealPhoto}
          resizeMode="cover"
        />
      ) : null}
      {recipeName ? (
        <Text style={[styles.mealName, { color: textColor }]}>{recipeName}</Text>
      ) : null}
      {hasMacros ? (
        <View style={styles.mealMacroPills}>
          {mealCalDisplay ? (
            <View style={[styles.macroPill, { backgroundColor: colors.calories + '18' }]}>
              <Text style={[styles.macroPillText, { color: colors.calories }]}>
                {'🔥 '}
                {mealCalDisplay}
                {' kcal'}
              </Text>
            </View>
          ) : null}
          {mealProtDisplay ? (
            <View style={[styles.macroPill, { backgroundColor: colors.protein + '18' }]}>
              <Text style={[styles.macroPillText, { color: colors.protein }]}>
                {'💪 '}
                {mealProtDisplay}
                {'g'}
              </Text>
            </View>
          ) : null}
          {mealCarbDisplay ? (
            <View style={[styles.macroPill, { backgroundColor: colors.carbs + '18' }]}>
              <Text style={[styles.macroPillText, { color: colors.carbs }]}>
                {'🍞 '}
                {mealCarbDisplay}
                {'g'}
              </Text>
            </View>
          ) : null}
          {mealFatDisplay ? (
            <View style={[styles.macroPill, { backgroundColor: colors.fats + '18' }]}>
              <Text style={[styles.macroPillText, { color: colors.fats }]}>
                {'🥑 '}
                {mealFatDisplay}
                {'g'}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {servingsDisplay ? (
        <Text style={[styles.mealServings, { color: subColor }]}>
          {servingsDisplay}
          {' serving(s)'}
        </Text>
      ) : null}
      {captionDiffersFromName && captionText ? (
        <Text style={[styles.mealCaption, { color: textColor }]}>{captionText}</Text>
      ) : null}
      <View style={styles.mealActionRow}>
        {post.meal_recipe_id ? (
          <Pressable
            style={[styles.mealActionBtn, { borderColor: colors.primary }]}
            onPress={handleViewRecipe}
            accessibilityRole="button"
          >
            <ExternalLink size={13} color={colors.primary} />
            <Text style={[styles.mealActionBtnText, { color: colors.primary }]}>View Recipe</Text>
          </Pressable>
        ) : null}
        {post.meal_recipe_data ? (
          <Pressable
            style={[styles.mealActionBtn, { borderColor: recipeSaved ? colors.success : subColor, opacity: savingRecipe ? 0.6 : 1 }]}
            onPress={handleSaveToFavorites}
            disabled={savingRecipe || recipeSaved}
            accessibilityRole="button"
          >
            {recipeSaved ? (
              <BookmarkCheck size={13} color={colors.success} />
            ) : (
              <Bookmark size={13} color={subColor} />
            )}
            <Text style={[styles.mealActionBtnText, { color: recipeSaved ? colors.success : subColor }]}>
              {recipeSaved ? 'Saved ✓' : 'Save to Favorites'}
            </Text>
          </Pressable>
        ) : onSaveMeal ? (
          <Pressable
            style={[styles.saveMealBtn, { borderColor: colors.primary }]}
            onPress={() => {
              console.log('[SocialPostCard] Save to Food pressed — post_id:', post.id);
              onSaveMeal(post);
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.saveMealBtnText, { color: colors.primary }]}>Save to Food</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface SocialPostCardProps {
  post: SocialPost;
  isDark: boolean;
  onLike: (postId: string) => void;
  onSave?: (postId: string, savedByMe: boolean) => void;
  onComment?: (postId: string) => void;
  onPressUser?: (userId: string) => void;
  onMoreOptions?: (postId: string, authorId: string) => void;
  onSaveMeal?: (post: SocialPost) => void;
  index?: number;
  hideCommentButton?: boolean;
}

export default function SocialPostCard({
  post,
  isDark,
  onLike,
  onSave,
  onComment,
  onPressUser,
  onMoreOptions,
  onSaveMeal,
  index = 0,
  hideCommentButton = false,
}: SocialPostCardProps) {
  const router = useRouter();
  const likeScale = useRef(new Animated.Value(1)).current;
  const saveScale = useRef(new Animated.Value(1)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(12)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 350,
        delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 0,
        duration: 350,
        delay: index * 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleLike = useCallback(() => {
    console.log('[SocialPostCard] Like (🔥) pressed — post_id:', post.id, 'currently liked:', post.liked_by_me);
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.3, useNativeDriver: true, speed: 50, bounciness: 10 }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }),
    ]).start();
    onLike(post.id);
  }, [post.id, post.liked_by_me, onLike]);

  const handleSave = useCallback(() => {
    console.log('[SocialPostCard] Save (🔖) pressed — post_id:', post.id, 'currently saved:', post.saved_by_me);
    Animated.sequence([
      Animated.spring(saveScale, { toValue: 1.3, useNativeDriver: true, speed: 50, bounciness: 10 }),
      Animated.spring(saveScale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }),
    ]).start();
    if (onSave) onSave(post.id, post.saved_by_me ?? false);
  }, [post.id, post.saved_by_me, onSave]);

  const handleComment = useCallback(() => {
    console.log('[SocialPostCard] Comment pressed — post_id:', post.id);
    if (onComment) {
      onComment(post.id);
    } else {
      router.push(`/social-post-detail?post_id=${post.id}`);
    }
  }, [post.id, onComment, router]);

  const handlePressUser = useCallback(() => {
    console.log('[SocialPostCard] User pressed — user_id:', post.author?.id, 'username:', post.author?.username);
    if (onPressUser) {
      onPressUser(post.author?.id ?? '');
    } else {
      router.push(`/social-profile?user_id=${post.author?.id}`);
    }
  }, [post.author, onPressUser, router]);

  const bg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const timeAgoText = timeAgo(post.created_at);
  const likesCount = post.likes_count;
  const commentsCount = post.comments_count;
  const savesCount = post.saves_count ?? 0;
  const likeActive = post.liked_by_me;
  const saveActive = post.saved_by_me ?? false;
  const authorUsername = post.author?.username ?? 'Unknown';
  const authorName = post.author?.name ?? null;
  const captionText = post.content ?? null;
  const isElite = post.author?.user_type === 'premium' || post.author?.is_premium === true;
  const isFounder = post.is_founder_post === true;
  const isPinned = post.is_pinned === true;
  const isAutoPost = post.post_type_v2 === 'auto';

  // Derived display values
  const caloriesDisplay = post.calories != null ? Math.round(Number(post.calories)).toString() : null;
  const proteinDisplay = post.protein != null ? Math.round(Number(post.protein)).toString() : null;
  const carbsDisplay = post.carbs != null ? Math.round(Number(post.carbs)).toString() : null;
  const fatDisplay = post.fat != null ? Math.round(Number(post.fat)).toString() : null;
  const streakDisplay = post.streak_days != null ? post.streak_days.toString() : null;
  const weightDisplay = post.weight_value != null ? Number(post.weight_value).toFixed(1) : null;
  const weightUnit = post.weight_unit ?? 'lbs';

  // Meal v2 display values
  const mealCalDisplay = post.meal_calories != null ? Math.round(Number(post.meal_calories)).toString() : caloriesDisplay;
  const mealProtDisplay = post.meal_protein != null ? Math.round(Number(post.meal_protein)).toString() : proteinDisplay;
  const mealCarbDisplay = post.meal_carbs != null ? Math.round(Number(post.meal_carbs)).toString() : carbsDisplay;
  const mealFatDisplay = post.meal_fat != null ? Math.round(Number(post.meal_fat)).toString() : fatDisplay;

  // Progress stats display
  const progressStats = post.progress_stats as Record<string, unknown> | null | undefined;

  const renderV2Body = () => {
    const typeV2 = post.post_type_v2;

    if (typeV2 === 'question') {
      return (
        <View style={styles.questionBody}>
          {post.question_title ? (
            <Text style={[styles.questionTitle, { color: textColor }]}>{post.question_title}</Text>
          ) : null}
          {post.question_details ? (
            <Text style={[styles.questionDetails, { color: subColor }]} numberOfLines={3}>
              {post.question_details}
            </Text>
          ) : null}
        </View>
      );
    }

    if (typeV2 === 'meal') {
      const mealPhotoUrl = post.meal_photo_url ?? post.image_url;
      const recipeData = post.meal_recipe_data;
      const recipeName = recipeData?.name ?? captionText;
      const servingsDisplay = post.meal_servings != null ? String(post.meal_servings) : null;
      const captionDiffersFromName = captionText && recipeData?.name && captionText !== recipeData.name;

      return (
        <MealV2Body
          post={post}
          isDark={isDark}
          textColor={textColor}
          subColor={subColor}
          mealPhotoUrl={mealPhotoUrl ?? null}
          recipeName={recipeName ?? null}
          captionDiffersFromName={captionDiffersFromName ?? false}
          captionText={captionText}
          mealCalDisplay={mealCalDisplay}
          mealProtDisplay={mealProtDisplay}
          mealCarbDisplay={mealCarbDisplay}
          mealFatDisplay={mealFatDisplay}
          servingsDisplay={servingsDisplay}
          onSaveMeal={onSaveMeal ?? null}
          router={router}
        />
      );
    }

    if (typeV2 === 'progress') {
      return (
        <View style={[styles.progressBody, { backgroundColor: isDark ? '#1E2A3A' : '#F0F7FF', borderColor: isDark ? '#2A3A4A' : '#DBEAFE' }]}>
          {captionText ? (
            <Text style={[styles.progressCaption, { color: textColor }]}>{captionText}</Text>
          ) : null}
          {progressStats ? (
            <View style={styles.progressTiles}>
              {progressStats.streak_days != null ? (
                <View style={[styles.progressTile, { backgroundColor: isDark ? '#2A1A1A' : '#FEF2F2' }]}>
                  <Text style={styles.progressTileEmoji}>🔥</Text>
                  <Text style={[styles.progressTileValue, { color: '#EF4444' }]}>
                    {String(progressStats.streak_days)}
                  </Text>
                  <Text style={[styles.progressTileLabel, { color: subColor }]}>day streak</Text>
                </View>
              ) : null}
              {progressStats.consistency_score != null ? (
                <View style={[styles.progressTile, { backgroundColor: isDark ? '#1A2A1A' : '#F0FDF4' }]}>
                  <Text style={styles.progressTileEmoji}>📊</Text>
                  <Text style={[styles.progressTileValue, { color: colors.success }]}>
                    {String(progressStats.consistency_score)}
                  </Text>
                  <Text style={[styles.progressTileLabel, { color: subColor }]}>consistency</Text>
                </View>
              ) : null}
              {progressStats.weight_value != null ? (
                <View style={[styles.progressTile, { backgroundColor: isDark ? '#1A1A2A' : '#F5F3FF' }]}>
                  <Text style={styles.progressTileEmoji}>⚖️</Text>
                  <Text style={[styles.progressTileValue, { color: colors.primary }]}>
                    {Number(progressStats.weight_value).toFixed(1)}
                  </Text>
                  <Text style={[styles.progressTileLabel, { color: subColor }]}>
                    {String(progressStats.weight_unit ?? 'lbs')}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {post.progress_photo_url ? (
            <Image
              source={resolveImageSource(post.progress_photo_url)}
              style={styles.progressPhoto}
              resizeMode="cover"
            />
          ) : null}
        </View>
      );
    }

    // update / auto / null — fall through to legacy renderPostBody
    return null;
  };

  const renderPostBody = () => {
    // If v2 type is set and handled, use v2 renderer
    if (post.post_type_v2 && post.post_type_v2 !== 'update' && post.post_type_v2 !== 'auto') {
      return renderV2Body();
    }

    switch (post.post_type) {
      case 'photo':
        return post.image_url ? (
          <Image
            source={resolveImageSource(post.image_url)}
            style={styles.photoImage}
            resizeMode="cover"
          />
        ) : null;

      case 'streak':
        return (
          <View style={[styles.specialCard, { backgroundColor: isDark ? '#3D1A1A' : '#FEF2F2' }]}>
            <Flame size={36} color="#EF4444" />
            {streakDisplay ? (
              <Text style={[styles.streakNumber, { color: '#EF4444' }]}>{streakDisplay}</Text>
            ) : null}
            <Text style={[styles.streakLabel, { color: isDark ? '#FCA5A5' : '#991B1B' }]}>
              day streak
            </Text>
          </View>
        );

      case 'milestone':
        return (
          <View style={[styles.specialCard, { backgroundColor: isDark ? '#2D2A14' : '#FFFBEB' }]}>
            <Trophy size={32} color="#F59E0B" />
            {post.milestone_type ? (
              <Text style={[styles.milestoneType, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                {post.milestone_type}
              </Text>
            ) : null}
            {weightDisplay ? (
              <Text style={[styles.milestoneWeight, { color: isDark ? colors.textDark : colors.text }]}>
                {weightDisplay}
                {' '}
                {weightUnit}
              </Text>
            ) : null}
          </View>
        );

      case 'stats':
        return (
          <View style={[styles.statsCard, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor }]}>
            {caloriesDisplay ? (
              <View style={styles.statsRow}>
                <Text style={[styles.statsLabel, { color: subColor }]}>Calories</Text>
                <Text style={[styles.statsValue, { color: colors.calories }]}>{caloriesDisplay}</Text>
                <Text style={[styles.statsUnit, { color: subColor }]}>kcal</Text>
              </View>
            ) : null}
            <View style={styles.macroPills}>
              {proteinDisplay ? (
                <View style={[styles.macroPill, { backgroundColor: colors.protein + '18' }]}>
                  <Text style={[styles.macroPillText, { color: colors.protein }]}>
                    {proteinDisplay}
                    {'g P'}
                  </Text>
                </View>
              ) : null}
              {carbsDisplay ? (
                <View style={[styles.macroPill, { backgroundColor: colors.carbs + '18' }]}>
                  <Text style={[styles.macroPillText, { color: colors.carbs }]}>
                    {carbsDisplay}
                    {'g C'}
                  </Text>
                </View>
              ) : null}
              {fatDisplay ? (
                <View style={[styles.macroPill, { backgroundColor: colors.fats + '18' }]}>
                  <Text style={[styles.macroPillText, { color: colors.fats }]}>
                    {fatDisplay}
                    {'g F'}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        );

      case 'meal':
        return (
          <View>
            {post.image_url ? (
              <Image
                source={resolveImageSource(post.image_url)}
                style={styles.photoImage}
                resizeMode="cover"
              />
            ) : null}
            {(proteinDisplay || carbsDisplay || fatDisplay) ? (
              <View style={styles.mealMacroPills}>
                {proteinDisplay ? (
                  <View style={[styles.macroPill, { backgroundColor: colors.protein + '18' }]}>
                    <Text style={[styles.macroPillText, { color: colors.protein }]}>
                      {proteinDisplay}
                      {'g P'}
                    </Text>
                  </View>
                ) : null}
                {carbsDisplay ? (
                  <View style={[styles.macroPill, { backgroundColor: colors.carbs + '18' }]}>
                    <Text style={[styles.macroPillText, { color: colors.carbs }]}>
                      {carbsDisplay}
                      {'g C'}
                    </Text>
                  </View>
                ) : null}
                {fatDisplay ? (
                  <View style={[styles.macroPill, { backgroundColor: colors.fats + '18' }]}>
                    <Text style={[styles.macroPillText, { color: colors.fats }]}>
                      {fatDisplay}
                      {'g F'}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );

      case 'text':
      default:
        return null;
    }
  };

  const cardStyle = isAutoPost
    ? [styles.card, { backgroundColor: isDark ? '#1E2030' : '#F8F9FC', borderColor, opacity: 0.92 }]
    : [styles.card, { backgroundColor: bg, borderColor }];

  return (
    <Animated.View
      style={[
        cardStyle,
        { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] },
      ]}
    >
      {/* Pin indicator */}
      {isPinned ? (
        <View style={styles.pinnedRow}>
          <Pin size={12} color={colors.primary} />
          <Text style={[styles.pinnedText, { color: colors.primary }]}>Pinned</Text>
        </View>
      ) : null}

      {/* Auto label */}
      {isAutoPost ? (
        <View style={styles.autoLabel}>
          <Text style={styles.autoLabelText}>Auto</Text>
        </View>
      ) : null}

      {/* Header */}
      <Pressable onPress={handlePressUser} style={styles.header} accessibilityRole="button">
        <Avatar username={authorUsername} size={40} />
        <View style={styles.headerInfo}>
          <View style={styles.usernameRow}>
            <Text style={[styles.username, { color: textColor }]} numberOfLines={1}>
              {authorUsername}
            </Text>
            {isFounder ? (
              <View style={styles.founderBadge}>
                <Text style={styles.founderBadgeText}>Founder</Text>
              </View>
            ) : null}
            {isElite && !isFounder ? (
              <View style={styles.eliteBadge}>
                <IconSymbol ios_icon_name="crown.fill" android_material_icon_name="workspace_premium" size={12} color="#fff" />
              </View>
            ) : null}
            {post.post_type_v2 === 'question' ? (
              <View style={styles.questionBadge}>
                <HelpCircle size={10} color="#3B82F6" />
                <Text style={styles.questionBadgeText}>Question</Text>
              </View>
            ) : null}
            {post.post_type_v2 === 'progress' ? (
              <View style={styles.progressBadge}>
                <TrendingUp size={10} color="#8B5CF6" />
                <Text style={styles.progressBadgeText}>Progress</Text>
              </View>
            ) : null}
          </View>
          {authorName ? (
            <Text style={[styles.authorName, { color: subColor }]} numberOfLines={1}>
              {authorName}
            </Text>
          ) : null}
          <Text style={[styles.timestamp, { color: subColor }]}>{timeAgoText}</Text>
        </View>
        <Pressable
          onPress={() => {
            console.log('[SocialPostCard] More options pressed — post_id:', post.id, 'author_id:', post.author?.id);
            if (onMoreOptions) {
              onMoreOptions(post.id, post.author?.id ?? '');
            }
          }}
          style={styles.moreBtn}
          accessibilityLabel="More options"
          accessibilityRole="button"
          hitSlop={8}
        >
          <MoreHorizontal size={20} color={subColor} />
        </Pressable>
      </Pressable>

      {/* Post body */}
      {renderPostBody()}

      {/* Caption for update/auto/text posts */}
      {captionText && (!post.post_type_v2 || post.post_type_v2 === 'update' || post.post_type_v2 === 'auto') ? (
        <View style={styles.captionRow}>
          <Text style={[styles.captionUsername, { color: textColor }]}>{authorUsername}</Text>
          <Text style={[styles.captionText, { color: textColor }]}>{captionText}</Text>
        </View>
      ) : null}

      {/* Image for update posts */}
      {post.image_url && (!post.post_type_v2 || post.post_type_v2 === 'update' || post.post_type_v2 === 'auto') && post.post_type !== 'photo' && post.post_type !== 'meal' ? (
        <Image
          source={resolveImageSource(post.image_url)}
          style={styles.updateImage}
          resizeMode="cover"
        />
      ) : null}

      {/* Actions row */}
      <View style={[styles.actionsRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
        {/* Like */}
        <Pressable
          onPress={handleLike}
          style={styles.actionBtn}
          accessibilityLabel="Support post"
          accessibilityRole="button"
        >
          <Animated.View style={{ transform: [{ scale: likeScale }], opacity: likeActive ? 1 : 0.45 }}>
            <IconSymbol ios_icon_name="flame.fill" android_material_icon_name="local_fire_department" size={18} color={likeActive ? '#EF4444' : subColor} />
          </Animated.View>
          <Text style={[styles.actionCount, { color: likeActive ? '#EF4444' : subColor }]}>
            {likesCount}
          </Text>
        </Pressable>

        {/* Comment */}
        {!hideCommentButton && (
          <Pressable
            onPress={handleComment}
            style={styles.actionBtn}
            accessibilityLabel="View comments"
            accessibilityRole="button"
          >
            <MessageCircle size={18} color={subColor} />
            <Text style={[styles.actionCount, { color: subColor }]}>{commentsCount}</Text>
          </Pressable>
        )}

        {/* Save */}
        {onSave ? (
          <Pressable
            onPress={handleSave}
            style={styles.actionBtn}
            accessibilityLabel="Save post"
            accessibilityRole="button"
          >
            <Animated.View style={{ transform: [{ scale: saveScale }] }}>
              <Bookmark
                size={18}
                color={saveActive ? colors.primary : subColor}
                fill={saveActive ? colors.primary : 'transparent'}
              />
            </Animated.View>
            {savesCount > 0 ? (
              <Text style={[styles.actionCount, { color: saveActive ? colors.primary : subColor }]}>
                {savesCount}
              </Text>
            ) : null}
          </Pressable>
        ) : null}
      </View>

      {/* Likes count */}
      {likesCount > 0 ? (
        <Text style={[styles.likesLine, { color: textColor }]}>
          {likesCount}
          {' '}
          {likesCount === 1 ? 'like' : 'likes'}
        </Text>
      ) : null}

      {/* View comments link */}
      {commentsCount > 0 && !hideCommentButton ? (
        <Pressable
          onPress={handleComment}
          style={styles.viewCommentsBtn}
          accessibilityRole="button"
        >
          <Text style={[styles.viewCommentsText, { color: subColor }]}>
            {'View all '}
            {commentsCount}
            {' '}
            {commentsCount === 1 ? 'comment' : 'comments'}
          </Text>
        </Pressable>
      ) : null}

      {/* Timestamp */}
      <Text style={[styles.timeFooter, { color: subColor }]}>{timeAgoText}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    borderBottomWidth: 1,
  },
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingTop: 8,
    paddingBottom: 2,
  },
  pinnedText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  autoLabel: {
    position: 'absolute',
    top: 10,
    right: 48,
    backgroundColor: 'rgba(107,114,128,0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 1,
  },
  autoLabelText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  username: {
    fontSize: 14,
    fontWeight: '700',
  },
  founderBadge: {
    backgroundColor: '#0D9488',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  founderBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  eliteBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#3B82F6' + '18',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  questionBadgeText: {
    color: '#3B82F6',
    fontSize: 10,
    fontWeight: '700',
  },
  progressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#8B5CF6' + '18',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  progressBadgeText: {
    color: '#8B5CF6',
    fontSize: 10,
    fontWeight: '700',
  },
  authorName: {
    fontSize: 12,
    marginTop: 1,
  },
  timestamp: {
    fontSize: 11,
    marginTop: 1,
  },
  moreBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoImage: {
    width: '100%',
    aspectRatio: 1,
  },
  updateImage: {
    width: '100%',
    height: 200,
    marginTop: 4,
  },
  // Question
  questionBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: 6,
  },
  questionTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  questionDetails: {
    fontSize: 14,
    lineHeight: 20,
  },
  // Meal v2
  mealPhoto: {
    width: '100%',
    height: 200,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  mealName: {
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 4,
  },
  mealMacroPills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mealServings: {
    fontSize: 12,
    paddingHorizontal: spacing.md,
    paddingBottom: 4,
  },
  mealCaption: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: spacing.md,
    paddingBottom: 4,
  },
  mealActionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  mealActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  mealActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveMealBtn: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  saveMealBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Progress v2
  progressBody: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  progressCaption: {
    fontSize: 14,
    lineHeight: 20,
  },
  progressTiles: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  progressTile: {
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
    minWidth: 80,
    gap: 2,
  },
  progressTileEmoji: {
    fontSize: 20,
  },
  progressTileValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  progressTileLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  progressPhoto: {
    width: '100%',
    height: 180,
    borderRadius: borderRadius.sm,
  },
  // Legacy
  specialCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 8,
  },
  streakNumber: {
    fontSize: 48,
    fontWeight: '800',
    lineHeight: 56,
  },
  streakLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  milestoneType: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  milestoneWeight: {
    fontSize: 15,
    fontWeight: '500',
  },
  statsCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  statsLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  statsValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statsUnit: {
    fontSize: 13,
  },
  macroPills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  macroPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  macroPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 6,
    gap: spacing.md,
    borderTopWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
  },
  actionCount: {
    fontSize: 14,
    fontWeight: '600',
  },
  likesLine: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    marginBottom: 4,
  },
  captionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    marginBottom: 4,
    gap: 4,
  },
  captionUsername: {
    fontSize: 13,
    fontWeight: '700',
  },
  captionText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  viewCommentsBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  viewCommentsText: {
    fontSize: 13,
  },
  timeFooter: {
    fontSize: 10,
    paddingHorizontal: spacing.md,
    paddingBottom: 10,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});

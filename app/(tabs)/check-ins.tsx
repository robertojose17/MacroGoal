/**
 * Community Tab — Feed / Friends / Premium Club
 * 3 sub-tabs rendered as pill selector (state-based, not router tabs)
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Alert,
  TouchableOpacity,
  Image,
  Switch,
  ImageSourcePropType,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import {
  Search,
  SquarePen,
  Crown,
  Heart,
  MessageCircle,
  MoreHorizontal,
  X,
  Plus,
  Users,
  Lock,
  ChevronRight,
  Check,
  Settings,
  MessageSquare,
  UtensilsCrossed,
  TrendingUp,
  Bookmark,
  Trash2,
  Flag,
  UserX,
  Pencil,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { usePremium } from '@/hooks/usePremium';
import { supabase } from '@/lib/supabase/client';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';

import { calcDailyScore } from '@/utils/consistencyMath';
import { toLocalDateString } from '@/utils/dateUtils';
import { createPost, savePost, unsavePost, addComment, fetchComments } from '@/utils/socialApi';
import type { SocialPost, Comment } from '@/utils/socialApi';
import { syncPremiumMembership } from '@/utils/premiumSync';

const COACH_AVATAR = require('@/assets/images/ff4ef6e4-805c-4f79-a014-9784ebe735d9.jpeg');

// ─── Types ────────────────────────────────────────────────────────────────────

type CommunityTab = 'feed' | 'friends' | 'club';
type PostCategory = 'general' | 'small_win' | 'meal_idea' | 'question' | 'progress';
type PostSection = 'feed' | 'club';
type ComposerType = 'post' | 'meal' | 'progress';

interface PostAuthor {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  user_type: string | null;
}

interface CommunityPost {
  id: string;
  user_id: string;
  section: PostSection;
  category: PostCategory;
  content: string;
  image_url: string | null;
  food_name: string | null;
  food_calories: number | null;
  is_pinned: boolean;
  is_founder_post: boolean;
  likes_count: number;
  comments_count: number;
  saves_count?: number;
  created_at: string;
  author: PostAuthor | null;
  liked_by_me: boolean;
  saved_by_me?: boolean;
  top_comment?: TopComment | null;
  // v2 fields
  post_type_v2?: string | null;
  question_title?: string | null;
  question_details?: string | null;
  meal_photo_url?: string | null;
  meal_calories?: number | null;
  meal_protein?: number | null;
  meal_carbs?: number | null;
  meal_fat?: number | null;
  meal_recipe_id?: string | null;
  meal_recipe_data?: any | null;
  meal_servings?: number | null;
  progress_stats?: Record<string, unknown> | null;
  auto_post_type?: string | null;
  streak_days?: number | null;
  weekly_recap_score?: number | null;
  weekly_recap_days_tracked?: number | null;
  weekly_recap_week_start?: string | null;
  weekly_recap_day_flags?: boolean[] | null;
  weight_goal_pct?: number | null;
  featured_recipe_id?: string | null;
  featured_recipe_week?: string | null;
  edu_headline?: string | null;
  edu_body?: string | null;
  edu_example?: string | null;
  edu_week?: string | null;
}

interface TopComment {
  id: string;
  content: string;
  author: PostAuthor | null;
}

interface SearchUserResult {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface FollowingUser {
  id: string;
  username: string;
  name: string | null;
  avatar_url: string | null;
}

interface Commitment {
  id: string;
  user_id: string;
  partner_id: string;
  target_days: number;
  week_start: string;
  status: 'active' | 'pending' | 'completed';
  partner?: FollowingUser | null;
  requester?: FollowingUser | null;
}

interface ProgressStat {
  key: string;
  label: string;
  emoji: string;
  value: string | number;
  selected: boolean;
}

interface RecipeResult {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  prep_time_minutes?: number | null;
  servings?: number | null;
  calories_per_serving?: number | null;
  protein_per_serving?: number | null;
  carbs_per_serving?: number | null;
  fat_per_serving?: number | null;
  fiber_per_serving?: number | null;
  ingredients?: string[] | null;
  instructions?: string[] | null;
  reviews?: unknown[] | null;
  tags?: string[] | null;
  is_saved?: boolean;
}

interface SavedRecipeRow {
  id: string;
  recipe_data: RecipeResult;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getInitials(name: string | null, username: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (username && username.trim()) return username.slice(0, 2).toUpperCase();
  return '?';
}

function getAvatarColor(username: string): string {
  const palette = ['#5B9AA8', '#5CB97B', '#FF8A5B', '#8B5CF6', '#3B82F6', '#EF4444', '#F59E0B'];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

const CATEGORY_COLORS: Record<PostCategory, string> = {
  small_win: '#5CB97B',
  meal_idea: '#FF8A5B',
  question: '#3B82F6',
  progress: '#8B5CF6',
  general: '#6B7280',
};

const CATEGORY_LABELS: Record<PostCategory, string> = {
  small_win: 'Small win',
  meal_idea: 'Meal idea',
  question: 'Question',
  progress: 'Progress',
  general: 'General',
};

// ─── Avatar Component ─────────────────────────────────────────────────────────

interface AvatarProps {
  url: string | null;
  name: string | null;
  username: string;
  size?: number;
}

function UserAvatar({ url, name, username, size = 40 }: AvatarProps) {
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    setHasError(false);
  }, [url]);
  const isEmpty = (!name || !name.trim()) && (!username || !username.trim());
  const initials = getInitials(name, username);
  const bgColor = name ? '#5B9AA8' : getAvatarColor(username);
  if (url && !hasError) {
    return (
      <Image
        source={{ uri: url }}
        key={url}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setHasError(true)}
      />
    );
  }
  if (isEmpty) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center' }}>
        <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={size * 0.5} color="#fff" />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.35, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
}

// ─── MealPostCardBody sub-component ──────────────────────────────────────────

interface MealPostCardBodyProps {
  post: CommunityPost;
  isDark: boolean;
  textColor: string;
  secondaryColor: string;
  mealPhotoUrl: string | null;
  recipeName: string | null;
  captionDiffersFromName: boolean;
  calDisplay: string | null;
  protDisplay: string | null;
  carbDisplay: string | null;
  fatDisplay: string | null;
  servingsDisplay: string | null;
  router: ReturnType<typeof useRouter>;
}

function MealPostCardBody({
  post,
  isDark,
  textColor,
  secondaryColor,
  mealPhotoUrl,
  recipeName,
  captionDiffersFromName,
  calDisplay,
  protDisplay,
  carbDisplay,
  fatDisplay,
  servingsDisplay,
  router,
}: MealPostCardBodyProps) {
  const [recipeSaved, setRecipeSaved] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);

  const handleViewRecipe = () => {
    console.log('[Community] View Recipe pressed — post_id:', post.id, 'recipe_id:', post.meal_recipe_id);
    if (post.meal_recipe_id) {
      router.push(`/recipe-finder-detail?recipe_id=${post.meal_recipe_id}`);
    }
  };

  const handleSaveToFavorites = async () => {
    const recipeData = post.meal_recipe_data;
    if (!recipeData) {
      console.log('[Community] Save to Favorites — no recipe_data on post:', post.id);
      return;
    }
    console.log('[Community] Save to Favorites pressed — post_id:', post.id, 'recipe_id:', recipeData.id);
    setSavingRecipe(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('saved_recipes').upsert({
        id: recipeData.id,
        user_id: user.id,
        recipe_data: recipeData,
        created_at: new Date().toISOString(),
      });
      if (error) {
        console.error('[Community] Save to Favorites error:', error.message);
        Alert.alert('Error', 'Could not save recipe.');
      } else {
        console.log('[Community] Recipe saved to favorites — recipe_id:', recipeData.id);
        setRecipeSaved(true);
      }
    } catch (e) {
      console.error('[Community] Save to Favorites exception:', e);
    } finally {
      setSavingRecipe(false);
    }
  };

  const hasMacros = calDisplay || protDisplay || carbDisplay || fatDisplay;

  return (
    <View>
      {mealPhotoUrl ? (
        <Image
          source={resolveImageSource(mealPhotoUrl)}
          style={{ width: '100%', height: 200, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
          resizeMode="cover"
        />
      ) : null}
      {recipeName ? (
        <Text style={{ fontSize: 15, fontWeight: '600', color: textColor, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 4 }}>
          {recipeName}
        </Text>
      ) : null}
      {hasMacros ? (
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
          {calDisplay ? (
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.calories + '18' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.calories }}>{'🔥 '}{calDisplay}{' kcal'}</Text>
            </View>
          ) : null}
          {protDisplay ? (
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.protein + '18' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.protein }}>{'💪 '}{protDisplay}{'g'}</Text>
            </View>
          ) : null}
          {carbDisplay ? (
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.carbs + '18' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.carbs }}>{'🍞 '}{carbDisplay}{'g'}</Text>
            </View>
          ) : null}
          {fatDisplay ? (
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.fats + '18' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.fats }}>{'🥑 '}{fatDisplay}{'g'}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {servingsDisplay ? (
        <Text style={{ fontSize: 12, color: secondaryColor, paddingHorizontal: spacing.md, paddingBottom: 4 }}>
          {servingsDisplay}{' serving(s)'}
        </Text>
      ) : null}
      {captionDiffersFromName && post.content ? (
        <Text style={{ fontSize: 13, color: textColor, paddingHorizontal: spacing.md, paddingBottom: 4, lineHeight: 18 }}>
          {post.content}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, flexWrap: 'wrap' }}>
        {post.meal_recipe_id ? (
          <TouchableOpacity
            style={[styles.mealActionBtn, { borderColor: colors.primary }]}
            onPress={handleViewRecipe}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>View Recipe</Text>
          </TouchableOpacity>
        ) : null}
        {post.meal_recipe_data ? (
          <TouchableOpacity
            style={[styles.mealActionBtn, { borderColor: recipeSaved ? colors.success : secondaryColor, opacity: savingRecipe ? 0.6 : 1 }]}
            onPress={handleSaveToFavorites}
            disabled={savingRecipe || recipeSaved}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: recipeSaved ? colors.success : secondaryColor }}>
              {recipeSaved ? 'Saved ✓' : 'Save to Favorites'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// ─── Streak Milestone Card ────────────────────────────────────────────────────

interface StreakMilestoneCardProps {
  streakDays: number;
  isDark: boolean;
}

function StreakMilestoneCard({ streakDays, isDark }: StreakMilestoneCardProps) {
  const bgColor = isDark ? '#1A2A1A' : '#F0FDF4';
  const borderColor = isDark ? '#2A4A2A' : '#BBF7D0';
  const streakLabel = `${streakDays}-day streak`;
  const streakSubtitle = `${streakDays} consecutive days of tracking`;
  return (
    <View style={{
      marginHorizontal: 0,
      backgroundColor: bgColor,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor,
      paddingVertical: 24,
      paddingHorizontal: 20,
      alignItems: 'center',
      gap: 6,
    }}>
      <Text style={{ fontSize: 40 }}>🔥</Text>
      <Text style={{ fontSize: 28, fontWeight: '800', color: '#5CB97B', letterSpacing: -0.5 }}>
        {streakLabel}
      </Text>
      <Text style={{ fontSize: 14, color: isDark ? '#86EFAC' : '#166534', fontWeight: '500' }}>
        {streakSubtitle}
      </Text>
    </View>
  );
}

// ─── Weekly Recap Card ────────────────────────────────────────────────────────

interface WeeklyRecapCardProps {
  score: number;
  daysTracked: number;
  weekStart: string;
  dayFlags: boolean[] | null;
  isDark: boolean;
}

function WeeklyRecapCard({ score, daysTracked, weekStart, dayFlags, isDark }: WeeklyRecapCardProps) {
  const bgColor = isDark ? '#0F1A2A' : '#F0F7FF';
  const borderColor = isDark ? '#1E3A5A' : '#BFDBFE';
  const scoreColor = score >= 80 ? '#5CB97B' : score >= 70 ? '#F59E0B' : '#EF4444';

  const monday = new Date(weekStart + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmtMonday = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtSunday = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekLabel = `${fmtMonday} – ${fmtSunday}`;

  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const flags = dayFlags && dayFlags.length === 7 ? dayFlags : Array(7).fill(false) as boolean[];

  const scoreDisplay = `${score}%`;
  const daysDisplay = `${daysTracked}/7`;

  return (
    <View style={{
      marginHorizontal: 0,
      backgroundColor: bgColor,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor,
      paddingVertical: 20,
      paddingHorizontal: 20,
      gap: 12,
    }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: isDark ? '#E0F2FE' : '#1E3A5A' }}>
        My week
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', fontWeight: '500' }}>Consistency</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: scoreColor }}>{scoreDisplay}</Text>
        </View>
        <View style={{ gap: 4, alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', fontWeight: '500' }}>Days tracked</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: isDark ? '#E0F2FE' : '#1E3A5A' }}>{daysDisplay}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
        {flags.map((tracked, i) => {
          const dotBg = tracked ? '#5CB97B' : (isDark ? '#1E2A3A' : '#E2E8F0');
          const label = dayLabels[i];
          return (
            <View key={i} style={{ alignItems: 'center', gap: 3 }}>
              <View style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: dotBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {tracked ? <Text style={{ fontSize: 14 }}>✓</Text> : null}
              </View>
              <Text style={{ fontSize: 10, color: isDark ? '#64748B' : '#94A3B8', fontWeight: '600' }}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={{ fontSize: 11, color: isDark ? '#475569' : '#94A3B8', textAlign: 'center' }}>
        {weekLabel}
      </Text>
    </View>
  );
}

// ─── Weight Goal Card ─────────────────────────────────────────────────────────

interface WeightGoalCardProps {
  progressPct: number;
  isDark: boolean;
}

function WeightGoalCard({ progressPct, isDark }: WeightGoalCardProps) {
  const bgColor = isDark ? '#1A1A2A' : '#F5F3FF';
  const borderColor = isDark ? '#2A2A4A' : '#DDD6FE';
  const fillColor = '#5B9AA8';
  const trackBg = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  const milestoneLabel: Record<number, string> = {
    25: '25% completed',
    50: '50% completed',
    75: '75% completed',
    100: '100% completed',
  };
  const headlineLabel: Record<number, string> = {
    25: '🎯 A quarter of the way there!',
    50: '🎯 Halfway to my goal!',
    75: '🎯 Almost there!',
    100: '🎯 Goal reached!',
  };

  const headline = headlineLabel[progressPct] ?? `🎯 ${progressPct}% to my goal!`;
  const subtitle = milestoneLabel[progressPct] ?? `${progressPct}% completed`;
  const barWidth = `${progressPct}%` as `${number}%`;

  return (
    <View style={{
      marginHorizontal: 0,
      backgroundColor: bgColor,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor,
      paddingVertical: 24,
      paddingHorizontal: 20,
      gap: 10,
    }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: isDark ? '#E0E7FF' : '#3730A3', letterSpacing: -0.3 }}>
        {headline}
      </Text>
      <Text style={{ fontSize: 14, color: isDark ? '#A5B4FC' : '#6366F1', fontWeight: '600' }}>
        {subtitle}
      </Text>
      {/* Progress bar */}
      <View style={{ height: 8, borderRadius: 8, backgroundColor: trackBg, overflow: 'hidden', marginTop: 4 }}>
        <View style={{
          height: '100%',
          width: barWidth,
          backgroundColor: fillColor,
          borderRadius: 8,
        }} />
      </View>
    </View>
  );
}

// ─── Educational Card ─────────────────────────────────────────────────────────

interface EducationalCardProps {
  headline: string;
  body: string;
  example?: string | null;
  isDark: boolean;
}

function EducationalCard({ headline, body, example, isDark }: EducationalCardProps) {
  const bgColor = isDark ? '#0A1A1A' : '#F0FDFA';
  const borderColor = isDark ? '#134E4A' : '#99F6E4';
  const headlineColor = isDark ? '#5EEAD4' : '#0F766E';
  const bodyColor = isDark ? '#CCFBF1' : '#134E4A';
  const exampleBg = isDark ? 'rgba(20,184,166,0.12)' : 'rgba(20,184,166,0.08)';

  return (
    <View style={{
      marginHorizontal: 0,
      backgroundColor: bgColor,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor,
      paddingVertical: 20,
      paddingHorizontal: 20,
      gap: 10,
    }}>
      <View style={{ width: 32, height: 3, borderRadius: 2, backgroundColor: '#14B8A6' }} />
      <Text style={{
        fontSize: 20,
        fontWeight: '800',
        color: headlineColor,
        lineHeight: 26,
        letterSpacing: -0.3,
      }}>
        {headline}
      </Text>
      <Text style={{
        fontSize: 14,
        color: bodyColor,
        lineHeight: 21,
        fontWeight: '400',
      }}>
        {body}
      </Text>
      {example ? (
        <View style={{
          backgroundColor: exampleBg,
          borderRadius: 10,
          padding: 12,
          borderLeftWidth: 3,
          borderLeftColor: '#14B8A6',
        }}>
          <Text style={{ fontSize: 13, color: isDark ? '#99F6E4' : '#0F766E', lineHeight: 19, fontStyle: 'italic' }}>
            {example}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: CommunityPost;
  isDark: boolean;
  currentUserId: string;
  onLike: (postId: string, liked: boolean) => void;
  onSave: (postId: string, savedByMe: boolean) => void;
  onReport: (postId: string) => void;
  onBlock: (userId: string) => void;
  onDelete: (postId: string) => void;
  onOpenComments: (post: CommunityPost) => void;
  onSaveMeal?: (post: CommunityPost) => void;
  showSaveMeal?: boolean;
  showTopReply?: boolean;
}

function PostCard({
  post,
  isDark,
  currentUserId,
  onLike,
  onSave,
  onReport,
  onBlock,
  onDelete,
  onOpenComments,
  onSaveMeal,
  showSaveMeal = false,
}: PostCardProps) {
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);
  const cardBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const authorUsername = post.author?.username || 'unknown';
  const authorAvatarUri = post.author?.avatar_url ?? null;
  const relTime = getRelativeTime(post.created_at);
  const isOwn = post.user_id === currentUserId;
  const isAutoPost = post.post_type_v2 === 'auto';

  // Educational posts always display as "Coach" with the Coach avatar
  const isEduPost = post.auto_post_type === 'educational';
  const displayName = isEduPost ? 'Coach' : (authorUsername ?? 'User');
  const displayAvatar = isEduPost ? COACH_AVATAR : authorAvatarUri;

  const handleMenuPress = () => {
    console.log('[Community] Three-dot menu opened for post:', post.id, 'isOwn:', isOwn);
    setMenuVisible(true);
  };

  const handleLike = () => {
    console.log('[Community] Like button pressed for post:', post.id, 'currently liked:', post.liked_by_me);
    onLike(post.id, post.liked_by_me);
  };

  const handleSave = () => {
    console.log('[Community] Bookmark button pressed for post:', post.id, 'currently saved:', post.saved_by_me);
    onSave(post.id, post.saved_by_me ?? false);
  };

  const handleCommentPress = () => {
    console.log('[Community] Comment button pressed for post:', post.id);
    onOpenComments(post);
  };

  const handleViewAllComments = () => {
    console.log('[Community] View all comments pressed for post:', post.id, 'count:', post.comments_count);
    onOpenComments(post);
  };

  const handleReport = () => {
    console.log('[Community] Report pressed for post:', post.id);
    setMenuVisible(false);
    onReport(post.id);
  };

  const handleBlock = () => {
    console.log('[Community] Block pressed for user:', post.user_id);
    setMenuVisible(false);
    if (post.user_id) onBlock(post.user_id);
  };

  const handleDelete = () => {
    console.log('[Community] Delete pressed for post:', post.id);
    setMenuVisible(false);
    onDelete(post.id);
  };

  const handleSaveMealPress = () => {
    console.log('[Community] Save meal pressed for post:', post.id, 'food:', post.food_name);
    if (onSaveMeal) onSaveMeal(post);
    else Alert.alert('Meal saved!');
  };

  // ── Media zone ──
  const renderMedia = () => {
    // Streak milestone card
    if (post.auto_post_type === 'streak_milestone' && post.streak_days != null) {
      return <StreakMilestoneCard streakDays={post.streak_days} isDark={isDark} />;
    }

    // Weight goal milestone card
    if (post.auto_post_type === 'weight_milestone' && post.weight_goal_pct != null) {
      return <WeightGoalCard progressPct={post.weight_goal_pct} isDark={isDark} />;
    }

    // Educational / Coach post
    if (post.auto_post_type === 'educational') {
      return (
        <EducationalCard
          headline={post.edu_headline ?? 'Did you know?'}
          body={post.edu_body ?? post.content ?? ''}
          example={post.edu_example}
          isDark={isDark}
        />
      );
    }

    // Weekly recap card
    if (post.auto_post_type === 'weekly_recap') {
      const recapScore = post.weekly_recap_score ?? 0;
      const recapDays = post.weekly_recap_days_tracked ?? 0;
      const recapWeekStart = post.weekly_recap_week_start ?? new Date().toISOString().split('T')[0];
      const recapDayFlags = post.weekly_recap_day_flags ?? null;
      return (
        <WeeklyRecapCard
          score={recapScore}
          daysTracked={recapDays}
          weekStart={recapWeekStart}
          dayFlags={recapDayFlags}
          isDark={isDark}
        />
      );
    }

    if (post.post_type_v2 === 'meal') {
      const mealPhotoUrl = post.meal_photo_url ?? post.image_url;
      const calDisplay = post.meal_calories != null ? Math.round(Number(post.meal_calories)).toString() : null;
      const protDisplay = post.meal_protein != null ? Math.round(Number(post.meal_protein)).toString() : null;
      const carbDisplay = post.meal_carbs != null ? Math.round(Number(post.meal_carbs)).toString() : null;
      const fatDisplay = post.meal_fat != null ? Math.round(Number(post.meal_fat)).toString() : null;
      const recipeData = post.meal_recipe_data;
      const recipeName = recipeData?.name ?? post.content;
      const servingsDisplay = post.meal_servings != null ? String(post.meal_servings) : null;
      const captionDiffersFromName = !!(post.content && recipeData?.name && post.content !== recipeData.name);
      return (
        <View>
          {mealPhotoUrl ? (
            <Image
              source={resolveImageSource(mealPhotoUrl)}
              style={{ width: '100%', aspectRatio: 1.2 }}
              resizeMode="cover"
            />
          ) : null}
          {recipeName ? (
            <Text style={{ fontSize: 15, fontWeight: '600', color: textColor, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
              {recipeName}
            </Text>
          ) : null}
          {(calDisplay || protDisplay || carbDisplay || fatDisplay) ? (
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 8 }}>
              {calDisplay ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.calories + '18' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.calories }}>{'🔥 '}{calDisplay}{' kcal'}</Text>
                </View>
              ) : null}
              {protDisplay ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.protein + '18' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.protein }}>{'💪 '}{protDisplay}{'g'}</Text>
                </View>
              ) : null}
              {carbDisplay ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.carbs + '18' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.carbs }}>{'🍞 '}{carbDisplay}{'g'}</Text>
                </View>
              ) : null}
              {fatDisplay ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.fats + '18' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.fats }}>{'🥑 '}{fatDisplay}{'g'}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {servingsDisplay ? (
            <Text style={{ fontSize: 12, color: secondaryColor, paddingHorizontal: 16, paddingBottom: 4 }}>
              {servingsDisplay}{' serving(s)'}
            </Text>
          ) : null}
          {captionDiffersFromName && post.content ? (
            <Text style={{ fontSize: 13, color: textColor, paddingHorizontal: 16, paddingBottom: 4, lineHeight: 18 }}>
              {post.content}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8, flexWrap: 'wrap' }}>
            {post.meal_recipe_id ? (
              <TouchableOpacity
                style={[styles.mealActionBtn, { borderColor: colors.primary }]}
                onPress={() => {
                  console.log('[Community] View Recipe pressed — post_id:', post.id, 'recipe_id:', post.meal_recipe_id);
                  router.push(`/recipe-finder-detail?recipe_id=${post.meal_recipe_id}`);
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>View Recipe</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      );
    }

    if (post.post_type_v2 === 'progress') {
      const stats = post.progress_stats;
      return (
        <View style={{ marginHorizontal: 16, marginBottom: 8, borderRadius: borderRadius.md, borderWidth: 1, borderColor: isDark ? '#2A3A4A' : '#DBEAFE', backgroundColor: isDark ? '#1E2A3A' : '#F0F7FF', padding: spacing.md, gap: spacing.sm }}>
          {post.content ? (
            <Text style={{ fontSize: 14, color: textColor, lineHeight: 20 }}>{post.content}</Text>
          ) : null}
          {stats ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {stats.streak_days != null ? (
                <View style={{ borderRadius: borderRadius.md, padding: spacing.sm, alignItems: 'center', minWidth: 80, backgroundColor: isDark ? '#2A1A1A' : '#FEF2F2', gap: 2 }}>
                  <Text style={{ fontSize: 20 }}>🔥</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#EF4444' }}>{String(stats.streak_days)}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: secondaryColor }}>day streak</Text>
                </View>
              ) : null}
              {stats.consistency_score != null ? (
                <View style={{ borderRadius: borderRadius.md, padding: spacing.sm, alignItems: 'center', minWidth: 80, backgroundColor: isDark ? '#1A2A1A' : '#F0FDF4', gap: 2 }}>
                  <Text style={{ fontSize: 20 }}>📊</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: colors.success }}>{String(stats.consistency_score)}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: secondaryColor }}>consistency</Text>
                </View>
              ) : null}
              {stats.weight_value != null ? (
                <View style={{ borderRadius: borderRadius.md, padding: spacing.sm, alignItems: 'center', minWidth: 80, backgroundColor: isDark ? '#1A1A2A' : '#F5F3FF', gap: 2 }}>
                  <Text style={{ fontSize: 20 }}>⚖️</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary }}>{Number(stats.weight_value).toFixed(1)}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: secondaryColor }}>{String(stats.weight_unit ?? 'lbs')}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      );
    }

    if (post.image_url) {
      return (
        <Image
          source={resolveImageSource(post.image_url)}
          style={{ width: '100%', aspectRatio: 1.2 }}
          resizeMode="cover"
        />
      );
    }

    return null;
  };

  // ── Caption text ──
  const captionUsername = authorUsername;
  const captionOpacity = isAutoPost ? 0.8 : 1;

  const renderCaption = () => {
    if (post.post_type_v2 === 'question') {
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          {post.question_title ? (
            <Text style={{ fontSize: 14, color: textColor, lineHeight: 20, opacity: captionOpacity }}>
              <Text style={{ fontWeight: '700' }}>{captionUsername}</Text>
              {'  '}
              <Text style={{ fontWeight: '700' }}>{post.question_title}</Text>
            </Text>
          ) : null}
          {post.question_details ? (
            <Text style={{ fontSize: 13, color: secondaryColor, lineHeight: 18, marginTop: 2 }} numberOfLines={3}>
              {post.question_details}
            </Text>
          ) : null}
        </View>
      );
    }

    if (post.post_type_v2 === 'meal') {
      // Caption already rendered inside renderMedia for meal posts
      return null;
    }

    if (post.auto_post_type === 'streak_milestone') {
      const streakMsgs: Record<number, string> = {
        7: 'Keeping the momentum going!',
        14: 'Two weeks of showing up.',
        30: 'A full month of discipline.',
        60: 'Habits are forming.',
        100: 'Triple digits. Absolute legend.',
      };
      const streakCaption = streakMsgs[post.streak_days ?? 0] ?? 'Staying consistent!';
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <Text style={{ fontSize: 14, color: textColor, lineHeight: 20 }}>
            <Text style={{ fontWeight: '700' }}>{authorUsername}</Text>
            {'  '}{streakCaption}
          </Text>
        </View>
      );
    }

    if (post.auto_post_type === 'weekly_recap') {
      const weeklyCaption = 'Another week of showing up!';
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <Text style={{ fontSize: 14, color: textColor, lineHeight: 20 }}>
            <Text style={{ fontWeight: '700' }}>{authorUsername}</Text>
            {'  '}{weeklyCaption}
          </Text>
        </View>
      );
    }

    if (post.auto_post_type === 'weight_milestone' && post.weight_goal_pct != null) {
      const captions: Record<number, string> = {
        25: 'One milestone closer to my goal!',
        50: 'One milestone closer to my goal!',
        75: 'Almost there — keeping the momentum!',
        100: 'Goal achieved. On to the next one!',
      };
      const caption = captions[post.weight_goal_pct] ?? 'One milestone closer to my goal!';
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <Text style={{ fontSize: 14, color: textColor, lineHeight: 20 }}>
            <Text style={{ fontWeight: '700' }}>{authorUsername}</Text>
            {'  '}{caption}
          </Text>
        </View>
      );
    }

    if (post.auto_post_type === 'featured_recipe') {
      const recipeName = post.meal_recipe_data?.name ?? post.content ?? 'Featured Recipe';
      const cal = post.meal_calories != null ? Math.round(Number(post.meal_calories)) : null;
      const prot = post.meal_protein != null ? Math.round(Number(post.meal_protein)) : null;
      const macroLine = cal != null && prot != null ? `${cal} kcal · ${prot}g protein per serving` : null;
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 2 }}>
          <Text style={{ fontSize: 14, color: textColor, lineHeight: 20 }}>
            <Text style={{ fontWeight: '700' }}>Macro Goal</Text>
            {'  '}
            {`This week's featured recipe: ${recipeName}`}
          </Text>
          {macroLine ? (
            <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 18 }}>
              {macroLine}
            </Text>
          ) : null}
        </View>
      );
    }

    if (post.auto_post_type === 'educational') {
      // No separate caption — the card body IS the content.
      return null;
    }

    if (post.content) {
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <Text style={{ fontSize: 14, color: textColor, lineHeight: 20, opacity: captionOpacity }}>
            <Text style={{ fontWeight: '700' }}>{captionUsername}</Text>
            {'  '}
            {post.content}
          </Text>
        </View>
      );
    }

    if (post.food_name) {
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <View style={styles.foodChip}>
            <Check size={12} color="#fff" />
            <Text style={styles.foodChipText}>
              {post.food_name}
              {post.food_calories ? ` · ${post.food_calories} kcal` : ''}
            </Text>
          </View>
        </View>
      );
    }

    return null;
  };

  const commentsCountDisplay = post.comments_count > 0 ? String(post.comments_count) : '';
  const likesCountDisplay = post.likes_count > 0 ? String(post.likes_count) : '';
  const savesCountDisplay = (post.saves_count ?? 0) > 0 ? String(post.saves_count) : '';

  return (
    <View style={[styles.postCard, { backgroundColor: cardBg }]}>
      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 }}>
        <TouchableOpacity
          onPress={() => {
            if (!isEduPost && post.user_id && post.user_id !== currentUserId) {
              console.log('[Community] Post avatar tapped, navigating to profile:', post.user_id);
              router.push({ pathname: '/social-profile-view', params: { userId: post.user_id } });
            }
          }}
          disabled={isEduPost || !post.user_id || post.user_id === currentUserId}
        >
          {isEduPost ? (
            <Image
              source={typeof displayAvatar === 'number' ? displayAvatar : { uri: displayAvatar as string }}
              style={{ width: 40, height: 40, borderRadius: 20 }}
            />
          ) : (
            <UserAvatar url={authorAvatarUri} name={post.author?.full_name ?? null} username={post.author?.username ?? 'u'} size={40} />
          )}
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={() => {
                if (!isEduPost && post.user_id && post.user_id !== currentUserId) {
                  console.log('[Community] Post username tapped, navigating to profile:', post.user_id);
                  router.push({ pathname: '/social-profile-view', params: { userId: post.user_id } });
                }
              }}
              disabled={isEduPost || !post.user_id || post.user_id === currentUserId}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: textColor }}>{displayName}</Text>
            </TouchableOpacity>
            {post.is_founder_post ? (
              <View style={[styles.founderBadge, { backgroundColor: '#0D9488' }]}>
                <Text style={styles.founderBadgeText}>Founder</Text>
              </View>
            ) : null}
            {post.is_pinned ? (
              <Text style={{ fontSize: 11, fontWeight: '500', color: colors.primary }}>Pinned</Text>
            ) : null}
          </View>
        </View>
        <TouchableOpacity onPress={handleMenuPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MoreHorizontal size={20} color={secondaryColor} />
        </TouchableOpacity>
      </View>

      {/* ── Media zone ── */}
      {renderMedia()}

      {/* ── Action row ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 16 }} onPress={handleLike}>
          <Heart size={22} color={post.liked_by_me ? '#EF4444' : textColor} fill={post.liked_by_me ? '#EF4444' : 'transparent'} />
          {likesCountDisplay ? (
            <Text style={{ fontSize: 14, fontWeight: '600', color: post.liked_by_me ? '#EF4444' : textColor }}>{likesCountDisplay}</Text>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 16 }} onPress={handleCommentPress}>
          <MessageCircle size={22} color={textColor} />
          {commentsCountDisplay ? (
            <Text style={{ fontSize: 14, fontWeight: '600', color: textColor }}>{commentsCountDisplay}</Text>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={handleSave}>
          <Bookmark size={22} color={post.saved_by_me ? colors.primary : textColor} fill={post.saved_by_me ? colors.primary : 'transparent'} />
        </TouchableOpacity>
      </View>

      {/* ── Caption area ── */}
      {renderCaption()}

      {/* ── Comment preview ── */}
      {post.comments_count > 0 ? (
        <TouchableOpacity onPress={handleViewAllComments} style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <Text style={{ fontSize: 13, color: secondaryColor }}>
            {'View all '}
            {commentsCountDisplay}
            {' comments'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* ── Timestamp ── */}
      <Text style={{ fontSize: 11, color: secondaryColor, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
        {relTime}
      </Text>

      {/* ── Save meal button (club only) ── */}
      {showSaveMeal && post.category === 'meal_idea' && post.post_type_v2 !== 'meal' ? (
        <TouchableOpacity style={styles.saveMealBtn} onPress={handleSaveMealPress}>
          <Text style={[styles.saveMealBtnText, { color: colors.primary }]}>Save meal</Text>
        </TouchableOpacity>
      ) : null}

      {/* ── Three-dot menu modal ── */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuSheet, { backgroundColor: isDark ? colors.cardDark : '#fff' }]}>
            {isOwn ? (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => {
                  console.log('[Community] Edit post pressed:', post.id);
                  setMenuVisible(false);
                }}>
                  <Pencil size={18} color={textColor} />
                  <Text style={[styles.menuItemText, { color: textColor }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                  <Trash2 size={18} color={colors.error} />
                  <Text style={[styles.menuItemText, { color: colors.error }]}>Delete</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
                  <Flag size={18} color={textColor} />
                  <Text style={[styles.menuItemText, { color: textColor }]}>Report</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleBlock}>
                  <UserX size={18} color={textColor} />
                  <Text style={[styles.menuItemText, { color: textColor }]}>Block user</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Comments Modal ───────────────────────────────────────────────────────────

interface CommentsModalProps {
  visible: boolean;
  post: CommunityPost | null;
  currentUserId: string;
  currentUserAvatar: string | null;
  currentUserName: string;
  isDark: boolean;
  onClose: () => void;
  onCommentAdded: (postId: string) => void;
}

function CommentsModal({
  visible,
  post,
  currentUserId,
  currentUserAvatar,
  currentUserName,
  isDark,
  onClose,
  onCommentAdded,
}: CommentsModalProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);

  const textColor = isDark ? colors.textDark : colors.primaryText;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const bgColor = isDark ? colors.backgroundDark : colors.primaryBackground;
  const cardBg = isDark ? colors.cardDark : '#fff';
  const borderColor = isDark ? colors.borderDark : colors.border;

  useEffect(() => {
    if (visible && post) {
      console.log('[Community] CommentsModal opened for post:', post.id);
      loadComments();
    } else {
      setComments([]);
      setCommentText('');
    }
  }, [visible, post?.id]);

  const loadComments = async () => {
    if (!post) return;
    console.log('[Community] Network request: fetchComments for post:', post.id);
    setLoading(true);
    try {
      const data = await fetchComments(post.id);
      setComments(data);
      console.log('[Community] Comments loaded:', data.length);
    } catch (e) {
      console.warn('[Community] fetchComments error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!post || !commentText.trim()) return;
    console.log('[Community] Send comment pressed for post:', post.id, 'text length:', commentText.trim().length);
    setSending(true);
    try {
      const newComment = await addComment(post.id, commentText.trim());
      console.log('[Community] Comment added, id:', newComment.id);
      setComments(prev => [...prev, newComment]);
      setCommentText('');
      onCommentAdded(post.id);
    } catch (e) {
      console.warn('[Community] addComment error:', e);
      Alert.alert('Error', 'Could not post comment. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const renderComment = ({ item }: { item: Comment }) => {
    const commentUsername = item.author?.username || 'unknown';
    const commentTime = getRelativeTime(item.created_at);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, gap: 10 }}>
        <UserAvatar
          url={item.author?.avatar_url ?? null}
          name={item.author?.full_name ?? null}
          username={commentUsername}
          size={32}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, color: textColor, lineHeight: 20 }}>
            <Text style={{ fontWeight: '700' }}>{commentUsername}</Text>
            {'  '}
            {item.content}
          </Text>
          <Text style={{ fontSize: 11, color: secondaryColor, marginTop: 3 }}>{commentTime}</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: bgColor }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: borderColor }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: textColor }}>Comments</Text>
          <TouchableOpacity
            onPress={() => {
              console.log('[Community] CommentsModal close button pressed');
              onClose();
            }}
            style={{ position: 'absolute', right: 16 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={22} color={secondaryColor} />
          </TouchableOpacity>
        </View>

        {/* Comments list */}
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            renderItem={renderComment}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Text style={{ fontSize: 14, color: secondaryColor }}>No comments yet. Be the first!</Text>
              </View>
            }
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}

        {/* Bottom input bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: borderColor, backgroundColor: cardBg, gap: 10 }}>
          {currentUserAvatar ? (
            <Image source={{ uri: currentUserAvatar }} style={{ width: 32, height: 32, borderRadius: 16 }} resizeMode="cover" />
          ) : (
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#5B9AA8', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{currentUserName ? currentUserName.charAt(0).toUpperCase() : 'U'}</Text>
            </View>
          )}
          <TextInput
            style={{ flex: 1, fontSize: 14, color: textColor, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: isDark ? '#2C2C2E' : '#F3F4F6', maxHeight: 80 }}
            placeholder="Add a comment..."
            placeholderTextColor={secondaryColor}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!commentText.trim() || sending}
            style={{ opacity: commentText.trim() && !sending ? 1 : 0.4 }}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <IconSymbol ios_icon_name="arrow.up.circle.fill" android_material_icon_name="send" size={32} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── New Composer Sheet ───────────────────────────────────────────────────────

interface ComposerSheetProps {
  visible: boolean;
  onClose: () => void;
  onPosted: (newPost?: CommunityPost) => void;
  section: PostSection;
  isDark: boolean;
  currentUserId: string;
  currentUserName: string;
  currentUserFirstName: string;
  currentUserAvatar: string | null;
}

function ComposerSheet({
  visible,
  onClose,
  onPosted,
  section,
  isDark,
  currentUserId,
  currentUserName,
  currentUserFirstName,
  currentUserAvatar,
}: ComposerSheetProps) {
  const router = useRouter();
  const [composerType, setComposerType] = useState<ComposerType>('post');
  // Post fields (merged update + question)
  const [postText, setPostText] = useState('');
  const [postImageUri, setPostImageUri] = useState<string | null>(null);
  // Meal fields — recipe picker
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipeRow[]>([]);
  const [savedRecipesLoading, setSavedRecipesLoading] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeResult | null>(null);
  const [mealCaption, setMealCaption] = useState('');
  // Progress fields
  const [progressStats, setProgressStats] = useState<ProgressStat[]>([]);
  const [progressText, setProgressText] = useState('');
  const [progressLoading, setProgressLoading] = useState(false);

  const [posting, setPosting] = useState(false);

  const bgColor = isDark ? colors.backgroundDark : colors.primaryBackground;
  const cardBg = isDark ? colors.cardDark : '#fff';
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;

  // Load data when switching composer tabs
  useEffect(() => {
    if (composerType === 'progress' && progressStats.length === 0) {
      loadProgressStats();
    }
    if (composerType === 'meal' && savedRecipes.length === 0 && !savedRecipesLoading) {
      loadSavedRecipes();
    }
  }, [composerType]);

  const loadSavedRecipes = async () => {
    console.log('[Community] Loading saved recipes for meal composer, user:', currentUserId);
    setSavedRecipesLoading(true);
    try {
      const { data, error } = await supabase
        .from('saved_recipes')
        .select('id, recipe_data, created_at')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[Community] loadSavedRecipes error:', error.message);
      } else {
        console.log('[Community] Saved recipes loaded:', data?.length ?? 0);
        setSavedRecipes((data as SavedRecipeRow[]) ?? []);
      }
    } catch (e) {
      console.error('[Community] loadSavedRecipes exception:', e);
    } finally {
      setSavedRecipesLoading(false);
    }
  };

  const loadProgressStats = async () => {
    console.log('[Community] Loading progress stats for composer');
    setProgressLoading(true);
    try {
      const [xpRes, checkInsRes] = await Promise.all([
        supabase.from('user_xp').select('current_streak, longest_streak').eq('user_id', currentUserId).maybeSingle(),
        supabase.from('check_ins').select('weight, weight_unit, created_at').eq('user_id', currentUserId).order('created_at', { ascending: false }).limit(1),
      ]);

      const streak = xpRes.data?.current_streak ?? 0;
      const latestCheckIn = checkInsRes.data?.[0];

      // Calculate weekly consistency
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(today);
      monday.setDate(today.getDate() - daysFromMonday);
      const mondayStr = toLocalDateString(monday);
      const todayStr = toLocalDateString(today);

      const mealsRes = await supabase.from('meals').select('date').eq('user_id', currentUserId).gte('date', mondayStr).lte('date', todayStr);
      const trackedDays = new Set((mealsRes.data || []).map((m: { date: string }) => m.date)).size;
      const daysElapsed = daysFromMonday + 1;
      const consistencyScore = Math.round((trackedDays / daysElapsed) * 100);

      const stats: ProgressStat[] = [];
      if (streak > 0) {
        stats.push({ key: 'streak_days', label: 'Current streak', emoji: '🔥', value: streak, selected: false });
      }
      stats.push({ key: 'consistency_score', label: 'Weekly consistency', emoji: '📊', value: consistencyScore, selected: false });
      if (latestCheckIn?.weight) {
        stats.push({ key: 'weight_value', label: 'Current weight', emoji: '⚖️', value: latestCheckIn.weight, selected: false });
      }

      console.log('[Community] Progress stats loaded:', stats.length, 'items');
      setProgressStats(stats);
    } catch (e) {
      console.warn('[Community] Failed to load progress stats:', e);
    } finally {
      setProgressLoading(false);
    }
  };

  const handlePickImage = async () => {
    console.log('[Community] Image picker opened');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      console.log('[Community] Image selected:', result.assets[0].uri);
      setPostImageUri(result.assets[0].uri);
    }
  };

  const toggleProgressStat = (key: string) => {
    console.log('[Community] Progress stat toggled:', key);
    setProgressStats(prev => prev.map(s => s.key === key ? { ...s, selected: !s.selected } : s));
  };

  const canPost = () => {
    if (composerType === 'post') return postText.trim().length > 0;
    if (composerType === 'meal') return selectedRecipe !== null;
    if (composerType === 'progress') return progressStats.some(s => s.selected);
    return false;
  };

  const handlePost = async () => {
    if (!canPost()) return;
    console.log('[Community] Posting — type:', composerType, 'section:', section);
    setPosting(true);
    try {
      let postData: Parameters<typeof createPost>[0];

      if (composerType === 'post') {
        console.log('[Community] Network request: createPost type=post, text length:', postText.trim().length, 'hasImage:', !!postImageUri);
        postData = {
          post_type: 'text',
          post_type_v2: 'update',
          content: postText.trim(),
          image_url: postImageUri ?? undefined,
          is_public: true,
        };
      } else if (composerType === 'meal') {
        if (!selectedRecipe) throw new Error('No recipe selected');
        console.log('[Community] Posting meal with recipe:', selectedRecipe.id, selectedRecipe.name);
        postData = {
          post_type: 'meal',
          post_type_v2: 'meal',
          content: mealCaption.trim() || selectedRecipe.name,
          meal_photo_url: selectedRecipe.image_url ?? undefined,
          meal_servings: selectedRecipe.servings ?? undefined,
          meal_calories: selectedRecipe.calories_per_serving ?? undefined,
          meal_protein: selectedRecipe.protein_per_serving ?? undefined,
          meal_carbs: selectedRecipe.carbs_per_serving ?? undefined,
          meal_fat: selectedRecipe.fat_per_serving ?? undefined,
          meal_recipe_id: selectedRecipe.id,
          meal_recipe_data: selectedRecipe,
          is_public: true,
        };
      } else {
        // progress
        const selectedStats = progressStats.filter(s => s.selected);
        const statsObj: Record<string, unknown> = {};
        selectedStats.forEach(s => { statsObj[s.key] = s.value; });
        const statLabels = selectedStats.map(s => `${s.emoji} ${s.value} ${s.label}`).join(', ');
        postData = {
          post_type: 'stats',
          post_type_v2: 'progress',
          content: progressText.trim() || statLabels,
          progress_stats: statsObj,
          is_public: true,
        };
      }

      console.log('[Community] Network request: createPost, type:', postData.post_type_v2);
      const result = await createPost(postData);
      console.log('[Community] Post created successfully, id:', result?.id);

      // Build optimistic post for immediate prepend
      const optimisticPost: CommunityPost = {
        id: result?.id ?? `temp_${Date.now()}`,
        user_id: currentUserId,
        section,
        category: 'general',
        content: postData.content ?? '',
        image_url: postData.image_url ?? null,
        food_name: null,
        food_calories: null,
        is_pinned: false,
        is_founder_post: false,
        likes_count: 0,
        comments_count: 0,
        saves_count: 0,
        created_at: new Date().toISOString(),
        author: null,
        liked_by_me: false,
        saved_by_me: false,
        post_type_v2: postData.post_type_v2 ?? null,
        question_title: null,
        question_details: null,
        meal_photo_url: postData.meal_photo_url ?? null,
        meal_calories: postData.meal_calories ?? null,
        meal_protein: postData.meal_protein ?? null,
        meal_carbs: postData.meal_carbs ?? null,
        meal_fat: postData.meal_fat ?? null,
        meal_recipe_id: (postData as any).meal_recipe_id ?? null,
        meal_recipe_data: (postData as any).meal_recipe_data ?? null,
        progress_stats: (postData.progress_stats as Record<string, unknown>) ?? null,
      };

      // Reset form
      setPostText('');
      setPostImageUri(null);
      setSelectedRecipe(null);
      setMealCaption('');
      setProgressText('');
      setProgressStats(prev => prev.map(s => ({ ...s, selected: false })));

      onPosted(optimisticPost);
      onClose();
    } catch (e) {
      console.error('[Community] Post failed:', e);
      Alert.alert('Error', 'Could not post. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const composerTypes: { key: ComposerType; icon: React.ReactNode; label: string }[] = [
    { key: 'post', icon: <MessageSquare size={20} color={composerType === 'post' ? '#fff' : colors.primary} />, label: 'Post' },
    { key: 'meal', icon: <UtensilsCrossed size={20} color={composerType === 'meal' ? '#fff' : '#FF8A5B'} />, label: 'Recipe' },
    { key: 'progress', icon: <TrendingUp size={20} color={composerType === 'progress' ? '#fff' : '#8B5CF6'} />, label: 'Progress' },
  ];

  const typeColors: Record<ComposerType, string> = {
    post: colors.primary,
    meal: '#FF8A5B',
    progress: '#8B5CF6',
  };

  const activeColor = typeColors[composerType];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: bgColor }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Sheet header */}
        <View style={[styles.sheetHeader, { borderBottomColor: borderColor }]}>
          <TouchableOpacity onPress={() => {
            console.log('[Community] Composer close button pressed');
            onClose();
          }}>
            <X size={22} color={secondaryColor} />
          </TouchableOpacity>
          <Text style={[styles.sheetTitle, { color: textColor }]}>New Post</Text>
          <TouchableOpacity
            style={[styles.postBtn, { backgroundColor: activeColor, opacity: canPost() ? 1 : 0.5 }]}
            onPress={handlePost}
            disabled={posting || !canPost()}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.postBtnText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Type selector toolbar */}
        <View style={[styles.composerToolbar, { borderBottomColor: borderColor }]}>
          {composerTypes.map(({ key, icon, label }) => {
            const isActive = composerType === key;
            const tColor = typeColors[key];
            return (
              <TouchableOpacity
                key={key}
                onPress={() => {
                  console.log('[Community] Composer type selected:', key);
                  setComposerType(key);
                }}
                style={[styles.composerTypeBtn, isActive && { backgroundColor: tColor }]}
              >
                {icon}
                <Text style={[styles.composerTypeBtnText, { color: isActive ? '#fff' : secondaryColor }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
          {/* Author row */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md }}>
            {currentUserAvatar ? (
              <Image key={currentUserAvatar} source={{ uri: currentUserAvatar }} style={{ width: 40, height: 40, borderRadius: 20 }} resizeMode="cover" />
            ) : (
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#5B9AA8', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{currentUserFirstName ? currentUserFirstName.charAt(0).toUpperCase() : 'U'}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: textColor }}>{currentUserName || 'You'}</Text>
              <Text style={{ fontSize: 12, color: secondaryColor }}>Public</Text>
            </View>
          </View>

          {/* ── POST ── */}
          {composerType === 'post' && (
            <View>
              <TextInput
                style={[styles.composeInput, { color: textColor, borderColor }]}
                placeholder="What's on your mind?"
                placeholderTextColor={secondaryColor}
                multiline
                value={postText}
                onChangeText={setPostText}
                autoFocus
              />
              {postImageUri ? (
                <View style={{ marginTop: spacing.sm, position: 'relative' }}>
                  <Image source={resolveImageSource(postImageUri)} style={{ width: '100%', height: 180, borderRadius: borderRadius.md }} resizeMode="cover" />
                  <TouchableOpacity style={styles.removeImageBtn} onPress={() => {
                    console.log('[Community] Post image removed');
                    setPostImageUri(null);
                  }}>
                    <X size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity style={[styles.imagePickerBtn, { borderColor }]} onPress={() => handlePickImage()}>
                <Plus size={16} color={colors.primary} />
                <Text style={[styles.imagePickerText, { color: colors.primary }]}>Add photo</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── MEAL ── */}
          {composerType === 'meal' && (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: 14, color: secondaryColor, lineHeight: 20 }}>
                Pick a saved recipe to share:
              </Text>
              {savedRecipesLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
              ) : savedRecipes.length === 0 ? (
                <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
                  <UtensilsCrossed size={40} color={secondaryColor} />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: textColor, textAlign: 'center' }}>No saved recipes yet</Text>
                  <Text style={{ fontSize: 13, color: secondaryColor, textAlign: 'center' }}>Save recipes from the Recipes tab to share them here.</Text>
                  <TouchableOpacity
                    style={[styles.browseRecipesBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      console.log('[Community] Browse Recipes button pressed — navigating to (home) tab');
                      onClose();
                      router.push('/(tabs)/(home)');
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Browse Recipes</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {savedRecipes.map((row) => {
                    const recipe = row.recipe_data;
                    const isSelected = selectedRecipe?.id === recipe.id;
                    const calDisplay = recipe.calories_per_serving != null ? Math.round(Number(recipe.calories_per_serving)).toString() : null;
                    const protDisplay = recipe.protein_per_serving != null ? Math.round(Number(recipe.protein_per_serving)).toString() : null;
                    const carbDisplay = recipe.carbs_per_serving != null ? Math.round(Number(recipe.carbs_per_serving)).toString() : null;
                    const fatDisplay = recipe.fat_per_serving != null ? Math.round(Number(recipe.fat_per_serving)).toString() : null;
                    return (
                      <TouchableOpacity
                        key={row.id}
                        onPress={() => {
                          console.log('[Community] Recipe card selected:', recipe.id, recipe.name);
                          setSelectedRecipe(isSelected ? null : recipe);
                        }}
                        style={[
                          styles.recipePickerCard,
                          {
                            borderColor: isSelected ? colors.primary : borderColor,
                            backgroundColor: isSelected ? colors.primary + '10' : cardBg,
                          },
                        ]}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                          {recipe.image_url ? (
                            <Image
                              source={resolveImageSource(recipe.image_url)}
                              style={{ width: 72, height: 72, borderRadius: borderRadius.md }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={{ width: 72, height: 72, borderRadius: borderRadius.md, backgroundColor: isDark ? '#2A2A2A' : '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                              <UtensilsCrossed size={28} color={secondaryColor} />
                            </View>
                          )}
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: textColor }} numberOfLines={2}>{recipe.name}</Text>
                            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                              {calDisplay ? (
                                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.calories + '18' }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.calories }}>{calDisplay}{' kcal'}</Text>
                                </View>
                              ) : null}
                              {protDisplay ? (
                                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.protein + '18' }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.protein }}>{protDisplay}{'g P'}</Text>
                                </View>
                              ) : null}
                              {carbDisplay ? (
                                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.carbs + '18' }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.carbs }}>{carbDisplay}{'g C'}</Text>
                                </View>
                              ) : null}
                              {fatDisplay ? (
                                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.fats + '18' }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.fats }}>{fatDisplay}{'g F'}</Text>
                                </View>
                              ) : null}
                            </View>
                            {recipe.servings != null ? (
                              <Text style={{ fontSize: 11, color: secondaryColor }}>{String(recipe.servings)}{' serving(s)'}</Text>
                            ) : null}
                          </View>
                          {isSelected ? (
                            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                              <Check size={13} color="#fff" />
                            </View>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {selectedRecipe ? (
                    <TextInput
                      style={[styles.composeInput, { color: textColor, borderColor, marginTop: spacing.sm }]}
                      placeholder="Add a caption (optional)..."
                      placeholderTextColor={secondaryColor}
                      multiline
                      value={mealCaption}
                      onChangeText={setMealCaption}
                    />
                  ) : null}
                </>
              )}
            </View>
          )}

          {/* ── PROGRESS ── */}
          {composerType === 'progress' && (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: 14, color: secondaryColor, lineHeight: 20 }}>
                Select what to share from your real data:
              </Text>
              {progressLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
              ) : progressStats.length === 0 ? (
                <Text style={{ color: secondaryColor, fontSize: 14 }}>No data available yet. Start tracking to share progress!</Text>
              ) : (
                progressStats.map(stat => (
                  <TouchableOpacity
                    key={stat.key}
                    onPress={() => toggleProgressStat(stat.key)}
                    style={[
                      styles.progressStatRow,
                      { borderColor: stat.selected ? colors.primary : borderColor, backgroundColor: stat.selected ? colors.primary + '12' : cardBg },
                    ]}
                  >
                    <Text style={{ fontSize: 22 }}>{stat.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: textColor }}>{stat.label}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: stat.selected ? colors.primary : textColor }}>{String(stat.value)}</Text>
                    </View>
                    <View style={[styles.checkCircle, { borderColor: stat.selected ? colors.primary : borderColor, backgroundColor: stat.selected ? colors.primary : 'transparent' }]}>
                      {stat.selected ? <Check size={14} color="#fff" /> : null}
                    </View>
                  </TouchableOpacity>
                ))
              )}
              <TextInput
                style={[styles.composeInput, { color: textColor, borderColor, marginTop: spacing.sm }]}
                placeholder="Add a caption (optional)..."
                placeholderTextColor={secondaryColor}
                multiline
                value={progressText}
                onChangeText={setProgressText}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Report Modal ─────────────────────────────────────────────────────────────

interface ReportModalProps {
  visible: boolean;
  postId: string | null;
  onClose: () => void;
  isDark: boolean;
  currentUserId: string;
}

const REPORT_REASONS = ['Spam', 'Inappropriate', 'Other'];

function ReportModal({ visible, postId, onClose, isDark, currentUserId }: ReportModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const cardBg = isDark ? colors.cardDark : '#fff';

  const handleSubmit = async () => {
    if (!reason || !postId) return;
    console.log('[Community] Submitting report for post:', postId, 'reason:', reason);
    setSubmitting(true);
    try {
      const { error } = await supabase.from('community_reports').insert({
        post_id: postId,
        reporter_id: currentUserId,
        reason,
      });
      if (error) {
        console.log('[Community] Report insert error:', error.message);
      } else {
        console.log('[Community] Report submitted successfully');
      }
    } catch (e) {
      console.log('[Community] Report exception:', e);
    } finally {
      setSubmitting(false);
      setReason('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuOverlay} onPress={onClose}>
        <View style={[styles.reportSheet, { backgroundColor: cardBg }]}>
          <Text style={[styles.reportTitle, { color: textColor }]}>Report this post?</Text>
          {REPORT_REASONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.reportOption, { borderColor: reason === r ? colors.primary : (isDark ? colors.borderDark : colors.border) }]}
              onPress={() => {
                console.log('[Community] Report reason selected:', r);
                setReason(r);
              }}
            >
              <Text style={[styles.reportOptionText, { color: reason === r ? colors.primary : textColor }]}>{r}</Text>
              {reason === r && <Check size={16} color={colors.primary} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.postBtn, { opacity: reason ? 1 : 0.5, marginTop: spacing.md }]}
            onPress={handleSubmit}
            disabled={!reason || submitting}
          >
            {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.postBtnText}>Submit report</Text>}
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Auto-Share Settings Modal ────────────────────────────────────────────────

interface AutoShareSettingsProps {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  currentUserId: string;
}

function AutoShareSettingsModal({ visible, onClose, isDark, currentUserId }: AutoShareSettingsProps) {
  const [autoShareAll, setAutoShareAll] = useState(true);
  const [autoShareStreaks, setAutoShareStreaks] = useState(true);
  const [autoShareWeekly, setAutoShareWeekly] = useState(true);
  const [autoShareWeight, setAutoShareWeight] = useState(true);
  const [audience, setAudience] = useState<'public' | 'followers'>('public');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const textColor = isDark ? colors.textDark : colors.primaryText;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#fff';
  const borderColor = isDark ? colors.borderDark : colors.border;
  const bgColor = isDark ? colors.backgroundDark : colors.primaryBackground;

  useEffect(() => {
    if (visible) loadSettings();
  }, [visible]);

  const loadSettings = async () => {
    console.log('[Community] Loading auto-share settings for user:', currentUserId);
    setLoading(true);
    try {
      const { data } = await supabase
        .from('users')
        .select('auto_share_achievements, auto_share_streaks, auto_share_weekly_recap, auto_share_weight_milestones, auto_share_audience')
        .eq('id', currentUserId)
        .single();
      if (data) {
        setAutoShareAll(data.auto_share_achievements !== false);
        setAutoShareStreaks(data.auto_share_streaks !== false);
        setAutoShareWeekly(data.auto_share_weekly_recap !== false);
        setAutoShareWeight(data.auto_share_weight_milestones !== false);
        setAudience(data.auto_share_audience === 'followers' ? 'followers' : 'public');
        console.log('[Community] Auto-share settings loaded:', data);
      }
    } catch (e) {
      console.warn('[Community] Failed to load auto-share settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (updates: Record<string, unknown>) => {
    console.log('[Community] Saving auto-share settings:', updates);
    setSaving(true);
    try {
      const { error } = await supabase.from('users').update(updates).eq('id', currentUserId);
      if (error) console.warn('[Community] Failed to save auto-share settings:', error.message);
      else console.log('[Community] Auto-share settings saved');
    } catch (e) {
      console.warn('[Community] Save settings exception:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAll = (val: boolean) => {
    console.log('[Community] Disable all auto-sharing toggled:', !val);
    setAutoShareAll(val);
    saveSettings({ auto_share_achievements: val });
  };

  const handleToggleStreaks = (val: boolean) => {
    console.log('[Community] Auto-share streaks toggled:', val);
    setAutoShareStreaks(val);
    saveSettings({ auto_share_streaks: val });
  };

  const handleToggleWeekly = (val: boolean) => {
    console.log('[Community] Auto-share weekly recap toggled:', val);
    setAutoShareWeekly(val);
    saveSettings({ auto_share_weekly_recap: val });
  };

  const handleToggleWeight = (val: boolean) => {
    console.log('[Community] Auto-share weight milestones toggled:', val);
    setAutoShareWeight(val);
    saveSettings({ auto_share_weight_milestones: val });
  };

  const handleAudienceChange = (val: 'public' | 'followers') => {
    console.log('[Community] Auto-share audience changed to:', val);
    setAudience(val);
    saveSettings({ auto_share_audience: val });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: bgColor }}>
        {/* Header */}
        <View style={[styles.sheetHeader, { borderBottomColor: borderColor }]}>
          <TouchableOpacity onPress={() => {
            console.log('[Community] Auto-share settings closed');
            onClose();
          }}>
            <X size={22} color={secondaryColor} />
          </TouchableOpacity>
          <Text style={[styles.sheetTitle, { color: textColor }]}>Auto-Share Settings</Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
            {/* Disable all */}
            <View style={[styles.settingsCard, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.settingsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingsLabel, { color: textColor }]}>Enable auto-sharing</Text>
                  <Text style={[styles.settingsDesc, { color: secondaryColor }]}>Automatically share achievements to the community</Text>
                </View>
                <Switch
                  value={autoShareAll}
                  onValueChange={handleToggleAll}
                  trackColor={{ false: borderColor, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {/* Individual toggles */}
            <View style={[styles.settingsCard, { backgroundColor: cardBg, borderColor, opacity: autoShareAll ? 1 : 0.5 }]}>
              <View style={[styles.settingsRow, { borderBottomWidth: 1, borderBottomColor: borderColor, paddingBottom: spacing.md, marginBottom: spacing.md }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingsLabel, { color: textColor }]}>Streak milestones</Text>
                  <Text style={[styles.settingsDesc, { color: secondaryColor }]}>Share when you hit 7, 14, 30, 60, 100 day streaks</Text>
                </View>
                <Switch
                  value={autoShareStreaks && autoShareAll}
                  onValueChange={handleToggleStreaks}
                  disabled={!autoShareAll}
                  trackColor={{ false: borderColor, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
              <View style={[styles.settingsRow, { borderBottomWidth: 1, borderBottomColor: borderColor, paddingBottom: spacing.md, marginBottom: spacing.md }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingsLabel, { color: textColor }]}>Weekly recap</Text>
                  <Text style={[styles.settingsDesc, { color: secondaryColor }]}>Share your weekly recap when consistency is 70% or higher</Text>
                </View>
                <Switch
                  value={autoShareWeekly && autoShareAll}
                  onValueChange={handleToggleWeekly}
                  disabled={!autoShareAll}
                  trackColor={{ false: borderColor, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
              <View style={[styles.settingsRow, { borderTopWidth: 0, paddingTop: 0, marginTop: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingsLabel, { color: textColor }]}>Weight goal milestones</Text>
                  <Text style={[styles.settingsDesc, { color: secondaryColor }]}>Share when you reach 25%, 50%, 75% and 100% of your weight goal</Text>
                </View>
                <Switch
                  value={autoShareWeight && autoShareAll}
                  onValueChange={handleToggleWeight}
                  disabled={!autoShareAll}
                  trackColor={{ false: borderColor, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {/* Audience */}
            <View style={[styles.settingsCard, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[styles.settingsLabel, { color: textColor, marginBottom: spacing.sm }]}>Audience</Text>
              {(['public', 'followers'] as const).map(opt => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => handleAudienceChange(opt)}
                  style={[styles.audienceOption, { borderColor: audience === opt ? colors.primary : borderColor, backgroundColor: audience === opt ? colors.primary + '12' : 'transparent' }]}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: audience === opt ? colors.primary : textColor }}>
                    {opt === 'public' ? 'Public' : 'Followers only'}
                  </Text>
                  {audience === opt ? <Check size={16} color={colors.primary} /> : null}
                </TouchableOpacity>
              ))}
            </View>

            {saving ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.sm }} />
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { t } = useTranslation();
  const { isPremium, loading: premiumLoading } = usePremium();
  const clubSyncedRef = useRef(false);

  const bgColor = isDark ? colors.backgroundDark : colors.primaryBackground;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;

  // ── Auth state ──
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserFirstName, setCurrentUserFirstName] = useState('');
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<CommunityTab>('feed');

  // ── Feed state ──
  const [feedPosts, setFeedPosts] = useState<CommunityPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [showAutoShareSettings, setShowAutoShareSettings] = useState(false);
  const [commentsPost, setCommentsPost] = useState<CommunityPost | null>(null);

  // ── Friends state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [following, setFollowing] = useState<FollowingUser[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsRefreshing, setFriendsRefreshing] = useState(false);
  const [commitment, setCommitment] = useState<Commitment | null>(null);
  const [myMealDays, setMyMealDays] = useState(0);
  const [partnerMealDays, setPartnerMealDays] = useState(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Leaderboard state ──
  interface LeaderboardEntry {
    userId: string;
    name: string;
    username: string;
    avatarUrl: string | null;
    score: number;
    rank: number;
    isMe: boolean;
    noActivity: boolean;
  }
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [showAllLeaderboard, setShowAllLeaderboard] = useState(false);

  // ── Club state ──
  const [clubPosts, setClubPosts] = useState<CommunityPost[]>([]);
  const [clubLoading, setClubLoading] = useState(false);
  const [clubRefreshing, setClubRefreshing] = useState(false);
  const [clubMemberCount, setClubMemberCount] = useState<number | null>(null);
  const [clubMembers, setClubMembers] = useState<{id: string; username: string; full_name: string | null; avatar_url: string | null}[]>([]);
  const [showMemberList, setShowMemberList] = useState(false);
  const [memberListLoading, setMemberListLoading] = useState(false);

  // ── Load current user (run once on mount) ──
  useEffect(() => {
    const loadUser = async () => {
      console.log('[Community] Loading current user session');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.log('[Community] No session found');
        return;
      }
      const uid = session.user.id;
      setCurrentUserId(uid);
      console.log('[Community] Session user id:', uid);

      // Check founder status via server-side RPC
      const { data: founderData } = await supabase.rpc('is_founder_user');
      setIsFounder(founderData === true);
      console.log('[Community] isFounder:', founderData);

      const { data: profile } = await supabase
        .from('users')
        .select('username, full_name, avatar_url')
        .eq('id', uid)
        .single();
      if (profile) {
        const uname = profile.username || session.user.email?.split('@')[0] || 'user';
        const fname = profile.full_name?.split(' ')[0] || uname;
        setCurrentUserName(uname);
        setCurrentUserFirstName(fname);
        if (profile.avatar_url) {
          if (String(profile.avatar_url).startsWith('http')) {
            setCurrentUserAvatar(`${profile.avatar_url.split('?')[0]}?t=${Date.now()}`);
          } else {
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
            setCurrentUserAvatar(`${urlData.publicUrl}?t=${Date.now()}`);
          }
        }
        console.log('[Community] User profile loaded:', uname);
      }
    };
    loadUser();
  }, []);

  // ── Reload avatar on every tab focus ──
  const reloadAvatar = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const uid = session.user.id;
    const { data: profile } = await supabase.from('users').select('avatar_url').eq('id', uid).single();
    if (profile?.avatar_url) {
      if (String(profile.avatar_url).startsWith('http')) {
        setCurrentUserAvatar(`${profile.avatar_url.split('?')[0]}?t=${Date.now()}`);
      } else {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
        setCurrentUserAvatar(`${urlData.publicUrl}?t=${Date.now()}`);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reloadAvatar();
    }, [reloadAvatar])
  );

  // ── Trigger initial data load once currentUserId is set ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!currentUserId) return;
    console.log('[Community] currentUserId set, loading all tabs data:', currentUserId);
    setFeedLoading(true);
    fetchFeedPosts(currentUserId).finally(() => setFeedLoading(false));
    setFriendsLoading(true);
    fetchFriendsData(currentUserId).finally(() => setFriendsLoading(false));
    setClubLoading(true);
    fetchClubPosts(currentUserId).finally(() => setClubLoading(false));
  }, [currentUserId]);

  // ── Fetch feed posts (reads from social_posts — same table the composer writes to) ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchFeedPosts = useCallback(async (overrideUserId?: string) => {
    const uid = overrideUserId || currentUserId;
    if (!uid) return;
    console.log('[Community] Fetching feed posts from social_posts for user:', uid);
    try {
      const postsRes = await supabase
        .from('social_posts')
        .select(`
          id, user_id, content, image_url, created_at, likes_count, comments_count,
          is_public, post_type, post_type_v2, meal_photo_url, meal_calories,
          meal_protein, meal_carbs, meal_fat, meal_servings, meal_recipe_id,
          meal_recipe_data, question_title, question_details, progress_stats,
          is_pinned, is_founder_post, saves_count, auto_post_type, auto_post_date,
          streak_days, milestone_type, weight_value, weight_unit,
          weekly_recap_score, weekly_recap_days_tracked, weekly_recap_week_start, weekly_recap_day_flags,
          weight_goal_pct, featured_recipe_id, featured_recipe_week,
          edu_headline, edu_body, edu_example, edu_week,
          author:users!user_id(id, username, full_name, avatar_url, user_type)
        `)
        .eq('is_public', true)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);
      console.log('[Community] Feed posts fetched from social_posts:', postsRes.data?.length ?? 0, 'error:', postsRes.error?.message ?? 'none');

      // Likes and saves — non-fatal if they fail
      let likedIds = new Set<string>();
      let savedIds = new Set<string>();
      try {
        const [likesRes, savesRes] = await Promise.all([
          supabase.from('community_likes').select('post_id').eq('user_id', uid),
          supabase.from('social_post_saves').select('post_id').eq('user_id', uid),
        ]);
        likedIds = new Set((likesRes.data || []).map((l: { post_id: string }) => l.post_id));
        savedIds = new Set((savesRes.data || []).map((s: { post_id: string }) => s.post_id));
      } catch (likesErr) {
        console.log('[Community] Likes/saves fetch non-fatal error:', likesErr);
      }

      const posts: CommunityPost[] = (postsRes.data || []).map((p: Record<string, unknown>) => ({
        ...(p as CommunityPost),
        section: 'feed' as PostSection,
        category: 'general' as PostCategory,
        food_name: null,
        food_calories: null,
        liked_by_me: likedIds.has(p.id as string),
        saved_by_me: savedIds.has(p.id as string),
      }));
      setFeedPosts(posts);
    } catch (e) {
      console.log('[Community] fetchFeedPosts error:', e);
    }
  }, []);

  // ── Fetch club posts ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchClubPosts = useCallback(async (overrideUserId?: string) => {
    const uid = overrideUserId || currentUserId;
    if (!uid) return;
    console.log('[Community] Fetching club posts for user:', uid);
    try {
      const [postsRes, likesRes, commentsRes, savesRes] = await Promise.all([
        supabase
          .from('community_posts')
          .select('*, author:users!user_id(id, username, full_name, avatar_url, user_type)')
          .eq('section', 'club')
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(30),
        supabase.from('community_likes').select('post_id').eq('user_id', uid),
        supabase
          .from('community_comments')
          .select('id, post_id, content, author:users!user_id(id, username, full_name, avatar_url, user_type)')
          .order('created_at', { ascending: true }),
        supabase.from('social_post_saves').select('post_id').eq('user_id', uid),
      ]);
      console.log('[Community] Club posts fetched:', postsRes.data?.length ?? 0);
      const likedIds = new Set((likesRes.data || []).map((l: { post_id: string }) => l.post_id));
      const savedIds = new Set((savesRes.data || []).map((s: { post_id: string }) => s.post_id));
      const commentsByPost: Record<string, TopComment> = {};
      for (const c of (commentsRes.data || [])) {
        if (!commentsByPost[c.post_id]) {
          commentsByPost[c.post_id] = { id: c.id, content: c.content, author: c.author };
        }
      }
      const posts: CommunityPost[] = (postsRes.data || []).map((p: Record<string, unknown>) => ({
        ...(p as CommunityPost),
        liked_by_me: likedIds.has(p.id as string),
        saved_by_me: savedIds.has(p.id as string),
        top_comment: commentsByPost[p.id as string] || null,
      }));
      setClubPosts(posts);
    } catch (e) {
      console.log('[Community] fetchClubPosts error:', e);
    }
  }, []);

  // ── Founder check (server-side RPC) ──
  const [isFounder, setIsFounder] = useState(false);

  // ── Fetch club member count (founder only) ──
  const fetchClubMemberCount = useCallback(async () => {
    if (!isFounder) return;
    try {
      const { data: countData, error: countError } = await supabase.rpc('get_premium_member_count');
      if (countError) {
        console.warn('[Community] get_premium_member_count error (expected for non-founders):', countError.message);
        setClubMemberCount(null);
        return;
      }
      setClubMemberCount(countData as number ?? null);
      console.log('[Community] Premium member count:', countData);

      const { data: membersData, error: membersError } = await supabase.rpc('get_premium_members');
      if (membersError) {
        console.warn('[Community] get_premium_members error:', membersError.message);
        return;
      }
      setClubMembers((membersData as any[]) ?? []);
    } catch (e) {
      console.warn('[Community] fetchClubMemberCount unexpected error:', e);
      setClubMemberCount(null);
    }
  }, [isFounder]);

  // ── Fetch friends data ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchFriendsData = useCallback(async (overrideUserId?: string) => {
    const uid = overrideUserId || currentUserId;
    if (!uid) return;
    console.log('[Community] Fetching friends data for user:', uid);
    try {
      const weekStart = getMondayOfWeek(new Date());
      const { count: rawFollowCount } = await supabase
        .from('social_follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', uid);
      setFollowingCount(rawFollowCount ?? 0);

      const { data: followData, error: followDataError } = await supabase
        .from('social_follows')
        .select('following_id')
        .eq('follower_id', uid);
      console.log('[Community] followData result:', JSON.stringify(followData), 'error:', followDataError?.message, 'uid used:', uid);

      let finalFollowData = followData;
      if ((!followData || followData.length === 0) && (rawFollowCount ?? 0) > 0) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id && session.user.id !== uid) {
          const { data: fallbackData } = await supabase
            .from('social_follows')
            .select('following_id')
            .eq('follower_id', session.user.id);
          console.log('[Community] fallback followData:', JSON.stringify(fallbackData));
          finalFollowData = fallbackData;
        }
      }

      const followingIdList = (finalFollowData || []).map((f: { following_id: string }) => f.following_id);
      console.log('[Community] Following IDs count:', followingIdList.length);

      let followingList: FollowingUser[] = [];
      if (followingIdList.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, username, name, avatar_url')
          .in('id', followingIdList);
        console.log('[Community] usersData:', JSON.stringify(usersData), 'error:', usersError?.message);
        followingList = (usersData || []).map((u: any) => ({
          id: u.id,
          username: u.username,
          name: u.name ?? null,
          avatar_url: u.avatar_url,
        }));
      }
      setFollowing(followingList);
      setFollowingIds(new Set(followingList.map((u) => u.id)));

      fetchWeeklyConsistency(uid, followingList);

      const [commitRes] = await Promise.all([
        supabase
          .from('community_commitments')
          .select('*, partner:users!community_commitments_partner_id_fkey(id, username, full_name, avatar_url), requester:users!community_commitments_user_id_fkey(id, username, full_name, avatar_url)')
          .or(`user_id.eq.${uid},partner_id.eq.${uid}`)
          .eq('week_start', weekStart)
          .in('status', ['active', 'pending'])
          .limit(1),
      ]);

      if (commitRes.data && commitRes.data.length > 0) {
        const c = commitRes.data[0] as Commitment;
        setCommitment(c);
        console.log('[Community] Commitment found:', c.id, 'status:', c.status);
        const partnerId = c.user_id === uid ? c.partner_id : c.user_id;
        const [myMeals, partnerMeals] = await Promise.all([
          supabase.from('meals').select('date').eq('user_id', uid).gte('date', weekStart),
          supabase.from('meals').select('date').eq('user_id', partnerId).gte('date', weekStart),
        ]);
        const myDays = new Set((myMeals.data || []).map((m: { date: string }) => m.date)).size;
        const partnerDays = new Set((partnerMeals.data || []).map((m: { date: string }) => m.date)).size;
        setMyMealDays(myDays);
        setPartnerMealDays(partnerDays);
        console.log('[Community] Meal days — me:', myDays, 'partner:', partnerDays);
      } else {
        setCommitment(null);
      }
    } catch (e) {
      console.log('[Community] fetchFriendsData error:', e);
    }
  }, []);

  // ── Fetch weekly consistency leaderboard ──
  const fetchWeeklyConsistency = useCallback(async (uid: string, followedUsers: FollowingUser[]) => {
    setLeaderboardLoading(true);
    console.log('[Community] fetchWeeklyConsistency: starting for uid:', uid, 'followed:', followedUsers.length);
    try {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(today);
      monday.setDate(today.getDate() - daysFromMonday);
      const mondayStr = toLocalDateString(monday);
      const todayStr = toLocalDateString(today);
      const daysElapsed = daysFromMonday + 1;

      const allUsers = [
        { id: uid, name: currentUserFirstName || 'You', username: '', avatarUrl: currentUserAvatar, isMe: true },
        ...followedUsers.map(u => ({ id: u.id, name: u.name || u.username, username: u.username, avatarUrl: u.avatar_url, isMe: false })),
      ];

      const userIds = allUsers.map(u => u.id);
      const { data: privacyData } = await supabase
        .from('users')
        .select('id, show_consistency_score')
        .in('id', userIds);
      const privacyMap = new Map((privacyData || []).map((r: any) => [r.id, r.show_consistency_score !== false]));

      const { data: blockData } = await supabase
        .from('blocked_users')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`);
      const blockedIds = new Set((blockData || []).flatMap((b: any) => [b.blocker_id, b.blocked_id]).filter((id: string) => id !== uid));

      const visibleUsers = allUsers.filter(u => u.isMe || (privacyMap.get(u.id) !== false && !blockedIds.has(u.id)));
      console.log('[Community] fetchWeeklyConsistency: visible users:', visibleUsers.length, 'week:', mondayStr, '-', todayStr);

      // Compute current user's weekly data separately for auto-share
      let myByDate: Record<string, boolean> = {};
      try {
        const myMealsRes = await supabase
          .from('meals')
          .select('date')
          .eq('user_id', uid)
          .gte('date', mondayStr)
          .lte('date', todayStr);
        (myMealsRes.data || []).forEach((m: any) => { myByDate[m.date] = true; });
        console.log('[Community] fetchWeeklyConsistency: myByDate days:', Object.keys(myByDate).length);
      } catch (e) {
        console.warn('[Community] fetchWeeklyConsistency: myByDate fetch failed (non-fatal):', e);
      }

      const scores = await Promise.all(visibleUsers.map(async (u) => {
        try {
          const [mealsRes, goalsRes] = await Promise.all([
            supabase.from('meals').select('date, meal_items(calories, protein, is_scheduled)').eq('user_id', u.id).gte('date', mondayStr).lte('date', todayStr),
            supabase.from('goals').select('daily_calories, protein_g').eq('user_id', u.id).eq('is_active', true).maybeSingle(),
          ]);

          const calorieTarget = goalsRes.data?.daily_calories ?? 2000;
          const proteinTarget = goalsRes.data?.protein_g ?? 150;

          const byDate: Record<string, { calories: number; protein: number }> = {};
          mealsRes.data?.forEach((meal: any) => {
            const d = meal.date;
            if (!byDate[d]) byDate[d] = { calories: 0, protein: 0 };
            meal.meal_items?.forEach((item: any) => {
              if (!item.is_scheduled) {
                byDate[d].calories += item.calories ?? 0;
                byDate[d].protein += item.protein ?? 0;
              }
            });
          });

          let totalScore = 0;
          for (let i = 0; i < daysElapsed; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const key = toLocalDateString(d);
            const dayData = byDate[key];
            const hasTracking = !!dayData;
            const dayCals = dayData?.calories ?? 0;
            const dayProt = dayData?.protein ?? 0;
            totalScore += calcDailyScore(hasTracking, dayCals, calorieTarget, dayProt, proteinTarget);
          }

          const avgScore = Math.round(totalScore / daysElapsed);
          const noActivity = Object.keys(byDate).length === 0;
          return { userId: u.id, name: u.name, username: u.username, avatarUrl: u.avatarUrl, score: avgScore, isMe: u.isMe, noActivity };
        } catch {
          return { userId: u.id, name: u.name, username: u.username, avatarUrl: u.avatarUrl, score: 0, isMe: u.isMe, noActivity: true };
        }
      }));

      const sorted = [...scores].sort((a, b) => b.score - a.score);
      let rank = 1;
      const ranked: LeaderboardEntry[] = sorted.map((entry, idx) => {
        if (idx > 0 && entry.score < sorted[idx - 1].score) rank = idx + 1;
        return { ...entry, rank };
      });
      console.log('[Community] fetchWeeklyConsistency: ranked entries:', ranked.length);
      setLeaderboard(ranked);

      const isSunday = today.getDay() === 0;
      if (isSunday) {
        const myScore = ranked.find(e => e.isMe);
        if (myScore) {
          await supabase.from('weekly_consistency_scores').upsert({
            user_id: uid,
            week_start: mondayStr,
            score: myScore.score,
          }, { onConflict: 'user_id,week_start' });
          console.log('[Community] fetchWeeklyConsistency: Sunday snapshot saved, score:', myScore.score);

          // Auto-share weekly recap if score >= 70%
          if (myScore.score >= 70) {
            const dayFlags: boolean[] = [];
            for (let i = 0; i < 7; i++) {
              const d = new Date(monday);
              d.setDate(monday.getDate() + i);
              dayFlags.push(!!myByDate[toLocalDateString(d)]);
            }
            const daysTracked = dayFlags.filter(Boolean).length;
            console.log('[Community] fetchWeeklyConsistency: triggering autoShareWeeklyRecap, score:', myScore.score, 'daysTracked:', daysTracked);
            const { autoShareWeeklyRecap } = await import('@/utils/autoShareAchievements');
            autoShareWeeklyRecap(myScore.score, daysTracked, mondayStr, dayFlags).catch(console.warn);
          }
        }
      }
    } catch (e) {
      console.warn('[Community] fetchWeeklyConsistency error:', e);
    } finally {
      setLeaderboardLoading(false);
    }
  }, [currentUserFirstName, currentUserAvatar]);

  // ── Focus effect: always refresh feed on focus (fixes profile→feed sync) ──
  useFocusEffect(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => {
      if (!currentUserId) return;
      console.log('[Community] Screen focused, refreshing tab:', activeTab);
      fetchFriendsData(currentUserId);
      if (activeTab === 'feed') {
        setFeedLoading(true);
        fetchFeedPosts(currentUserId).finally(() => setFeedLoading(false));
      } else if (activeTab === 'friends') {
        setFriendsLoading(true);
        fetchFriendsData(currentUserId).finally(() => setFriendsLoading(false));
      } else if (activeTab === 'club') {
        setClubLoading(true);
        fetchClubPosts(currentUserId).finally(() => setClubLoading(false));
        // Sync premium membership once per session when club tab is focused
        // so cross-device purchases are reflected without a restart.
        if (!clubSyncedRef.current) {
          clubSyncedRef.current = true;
          console.log('[Community] Club tab focused — triggering one-time premium sync');
          syncPremiumMembership().catch(console.warn);
        }
        // Fetch member count for founder
        fetchClubMemberCount();
      }
    }, [activeTab, currentUserId, fetchClubMemberCount])
  );

  // ── Tab switch: reload data ──
  const handleTabSwitch = (tab: CommunityTab) => {
    console.log('[Community] Tab switched to:', tab);
    setActiveTab(tab);
    if (!currentUserId) return;
    if (tab === 'feed') {
      setFeedLoading(true);
      fetchFeedPosts(currentUserId).finally(() => setFeedLoading(false));
    } else if (tab === 'friends') {
      setFriendsLoading(true);
      fetchFriendsData(currentUserId).finally(() => setFriendsLoading(false));
    } else if (tab === 'club') {
      setClubLoading(true);
      fetchClubPosts(currentUserId).finally(() => setClubLoading(false));
    }
  };

  // ── Like toggle ──
  const handleLike = useCallback(async (postId: string, liked: boolean) => {
    console.log('[Community] Network request: toggle like, postId:', postId, 'liked:', liked);
    const updatePosts = (posts: CommunityPost[]) =>
      posts.map((p) =>
        p.id === postId
          ? { ...p, liked_by_me: !liked, likes_count: liked ? p.likes_count - 1 : p.likes_count + 1 }
          : p
      );
    if (activeTab === 'feed') setFeedPosts((prev) => updatePosts(prev));
    else setClubPosts((prev) => updatePosts(prev));

    if (liked) {
      const { error } = await supabase.from('community_likes').delete().eq('post_id', postId).eq('user_id', currentUserId);
      console.log('[Community] Like removed, error:', error?.message ?? 'none');
    } else {
      const { error } = await supabase.from('community_likes').upsert({ post_id: postId, user_id: currentUserId });
      console.log('[Community] Like added, error:', error?.message ?? 'none');
    }
  }, [activeTab, currentUserId, feedPosts]);

  // ── Save toggle ──
  const handleSave = useCallback(async (postId: string, savedByMe: boolean) => {
    console.log('[Community] Network request: toggle save, postId:', postId, 'savedByMe:', savedByMe);
    const updatePosts = (posts: CommunityPost[]) =>
      posts.map((p) =>
        p.id === postId
          ? { ...p, saved_by_me: !savedByMe, saves_count: savedByMe ? (p.saves_count ?? 1) - 1 : (p.saves_count ?? 0) + 1 }
          : p
      );
    if (activeTab === 'feed') setFeedPosts((prev) => updatePosts(prev));
    else setClubPosts((prev) => updatePosts(prev));

    try {
      if (savedByMe) {
        await unsavePost(postId);
      } else {
        await savePost(postId);
      }
    } catch (e) {
      console.warn('[Community] Save toggle failed (non-fatal):', e);
      // Revert optimistic update on error
      const revert = (posts: CommunityPost[]) =>
        posts.map((p) =>
          p.id === postId
            ? { ...p, saved_by_me: savedByMe, saves_count: savedByMe ? (p.saves_count ?? 0) + 1 : (p.saves_count ?? 1) - 1 }
            : p
        );
      if (activeTab === 'feed') setFeedPosts((prev) => revert(prev));
      else setClubPosts((prev) => revert(prev));
    }
  }, [activeTab]);

  // ── Report ──
  const handleReport = (postId: string) => {
    console.log('[Community] Report modal opened for post:', postId);
    setReportPostId(postId);
  };

  // ── Block ──
  const handleBlock = async (userId: string) => {
    console.log('[Community] Network request: block user:', userId);
    const { error } = await supabase.from('community_blocks').upsert({ blocker_id: currentUserId, blocked_id: userId });
    console.log('[Community] Block result, error:', error?.message ?? 'none');
    Alert.alert('User blocked');
  };

  // ── Delete post ──
  const handleDelete = async (postId: string) => {
    console.log('[Community] Delete post pressed:', postId);
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          console.log('[Community] Network request: delete post from both tables:', postId);
          // Delete from both tables to handle legacy posts and new social_posts
          const [r1, r2] = await Promise.all([
            supabase.from('social_posts').delete().eq('id', postId).eq('user_id', currentUserId),
            supabase.from('community_posts').delete().eq('id', postId).eq('user_id', currentUserId),
          ]);
          console.log('[Community] Delete result — social_posts:', r1.error?.message ?? 'ok', 'community_posts:', r2.error?.message ?? 'ok');
          setFeedPosts((prev) => prev.filter((p) => p.id !== postId));
          setClubPosts((prev) => prev.filter((p) => p.id !== postId));
        },
      },
    ]);
  };

  // ── Comments ──
  const handleOpenComments = useCallback((post: CommunityPost) => {
    console.log('[Community] Opening comments for post:', post.id);
    setCommentsPost(post);
  }, []);

  const handleCommentAdded = useCallback((postId: string) => {
    console.log('[Community] Comment added, incrementing count for post:', postId);
    const increment = (posts: CommunityPost[]) =>
      posts.map(p => p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p);
    setFeedPosts(prev => increment(prev));
    setClubPosts(prev => increment(prev));
  }, []);

  // ── Search users ──
  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      console.log('[Community] Network request: search users, query:', q);
      setSearchLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, username, full_name, avatar_url')
        .ilike('username', `%${q}%`)
        .limit(10);
      console.log('[Community] Search results:', data?.length ?? 0, 'error:', error?.message ?? 'none');
      setSearchResults((data as SearchUserResult[]) || []);
      setSearchLoading(false);
    }, 400);
  };

  // ── Follow / Unfollow ──
  const handleFollow = async (userId: string) => {
    const isFollowing = followingIds.has(userId);
    console.log('[Community] Network request:', isFollowing ? 'unfollow' : 'follow', 'user:', userId);
    if (isFollowing) {
      const { error } = await supabase.from('social_follows').delete().eq('follower_id', currentUserId).eq('following_id', userId);
      console.log('[Community] Unfollow result, error:', error?.message ?? 'none');
      setFollowingIds((prev) => { const s = new Set(prev); s.delete(userId); return s; });
      setFollowing((prev) => prev.filter((u) => u.id !== userId));
    } else {
      const { error } = await supabase.from('social_follows').insert({ follower_id: currentUserId, following_id: userId });
      console.log('[Community] Follow result, error:', error?.message ?? 'none');
      setFollowingIds((prev) => new Set([...prev, userId]));
      const found = searchResults.find((u) => u.id === userId);
      if (found) setFollowing((prev) => [...prev, found]);
    }
  };

  // ── Accept / Decline commitment ──
  const handleAcceptCommitment = async () => {
    if (!commitment) return;
    console.log('[Community] Network request: accept commitment:', commitment.id);
    const { error } = await supabase.from('community_commitments').update({ status: 'active' }).eq('id', commitment.id);
    console.log('[Community] Accept commitment result, error:', error?.message ?? 'none');
    if (!error) setCommitment({ ...commitment, status: 'active' });
  };

  const handleDeclineCommitment = async () => {
    if (!commitment) return;
    console.log('[Community] Network request: decline commitment:', commitment.id);
    const { error } = await supabase.from('community_commitments').delete().eq('id', commitment.id);
    console.log('[Community] Decline commitment result, error:', error?.message ?? 'none');
    if (!error) setCommitment(null);
  };

  // ── Refresh handlers ──
  const handleFeedRefresh = async () => {
    console.log('[Community] Feed pull-to-refresh triggered');
    setFeedRefreshing(true);
    await fetchFeedPosts(currentUserId);
    setFeedRefreshing(false);
  };

  const handleFriendsRefresh = async () => {
    console.log('[Community] Friends pull-to-refresh triggered');
    setFriendsRefreshing(true);
    await fetchFriendsData(currentUserId);
    setFriendsRefreshing(false);
  };

  const handleClubRefresh = async () => {
    console.log('[Community] Club pull-to-refresh triggered');
    setClubRefreshing(true);
    await fetchClubPosts(currentUserId);
    setClubRefreshing(false);
  };

  // ── Post created callback — optimistic prepend + delayed server refresh ──
  const handlePosted = useCallback((newPost?: CommunityPost) => {
    console.log('[Community] Post created callback, optimistic prepend:', newPost?.id, 'tab:', activeTab);
    if (newPost) {
      if (activeTab === 'feed') {
        setFeedPosts(prev => [newPost, ...prev]);
      } else if (activeTab === 'club') {
        setClubPosts(prev => [newPost, ...prev]);
      }
    }
    // Refresh from server after a short delay to get the real post with correct data
    setTimeout(() => {
      console.log('[Community] Delayed server refresh after post, tab:', activeTab);
      if (activeTab === 'feed') {
        fetchFeedPosts(currentUserId);
      } else if (activeTab === 'club') {
        fetchClubPosts(currentUserId);
      }
    }, 1500);
  }, [activeTab, currentUserId, fetchFeedPosts, fetchClubPosts]);

  // ── Pill selector ──
  const tabLabels: { key: CommunityTab; label: string }[] = [
    { key: 'feed', label: 'Feed' },
    { key: 'friends', label: 'Friends' },
    { key: 'club', label: 'Premium Club' },
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: bgColor }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Text style={[styles.headerTitle, { color: textColor }]}>Community</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <TouchableOpacity
            onPress={() => {
              console.log('[Community] Auto-share settings button pressed');
              setShowAutoShareSettings(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Settings size={20} color={secondaryColor} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              console.log('[Community] Compose button pressed');
              setShowCreatePost(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <SquarePen size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Pill selector */}
      <View style={[styles.pillContainer, { borderColor }]}>
        {tabLabels.map(({ key, label }) => {
          const isActive = activeTab === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.pill, isActive && { backgroundColor: colors.primary }]}
              onPress={() => handleTabSwitch(key)}
            >
              {key === 'club' && (
                <Crown size={13} color={isActive ? '#fff' : '#F59E0B'} style={{ marginRight: 4 }} />
              )}
              <Text style={[styles.pillText, { color: isActive ? '#fff' : secondaryColor }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── FEED TAB ── */}
      {activeTab === 'feed' && (
        <FlatList
          data={feedPosts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={feedRefreshing} onRefresh={handleFeedRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            feedLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateText, { color: secondaryColor }]}>
                  No posts yet. Be the first to share!
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              isDark={isDark}
              currentUserId={currentUserId}
              onLike={handleLike}
              onSave={handleSave}
              onReport={handleReport}
              onBlock={handleBlock}
              onDelete={handleDelete}
              onOpenComments={handleOpenComments}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      {/* ── FRIENDS TAB ── */}
      {activeTab === 'friends' && (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={friendsRefreshing} onRefresh={handleFriendsRefresh} tintColor={colors.primary} />
          }
        >
          {/* Search bar */}
          <View style={[styles.searchBar, { backgroundColor: cardBg, borderColor }]}>
            <Search size={18} color={secondaryColor} />
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder="Search by username..."
              placeholderTextColor={secondaryColor}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchLoading && <ActivityIndicator size="small" color={colors.primary} />}
          </View>

          {/* Search results */}
          {searchResults.length > 0 && (
            <View style={[styles.searchResultsCard, { backgroundColor: cardBg, borderColor }]}>
              {searchResults.map((user) => {
                const isFollowing = followingIds.has(user.id);
                return (
                  <View key={user.id} style={[styles.searchResultRow, { borderBottomColor: borderColor }]}>
                    <UserAvatar url={user.avatar_url} name={user.full_name} username={user.username} size={40} />
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text style={[styles.searchResultName, { color: textColor }]}>{user.full_name || user.username}</Text>
                      <Text style={[styles.searchResultHandle, { color: secondaryColor }]}>@{user.username}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.followBtn, isFollowing && { backgroundColor: 'transparent', borderColor: colors.primary }]}
                      onPress={() => handleFollow(user.id)}
                    >
                      <Text style={[styles.followBtnText, isFollowing && { color: colors.primary }]}>
                        {isFollowing ? 'Following' : 'Follow'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Weekly Consistency Leaderboard */}
          <View style={{ marginTop: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Weekly Consistency</Text>
              <Text style={{ fontSize: 11, color: secondaryColor }}>Mon – Today</Text>
            </View>

            {leaderboardLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
            ) : leaderboard.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateText, { color: secondaryColor }]}>Follow people to see the leaderboard.</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: cardBg, borderRadius: 16, borderWidth: 1, borderColor, overflow: 'hidden' }}>
                {(showAllLeaderboard ? leaderboard : leaderboard.slice(0, 5)).map((entry, idx) => {
                  const visibleCount = showAllLeaderboard ? leaderboard.length : Math.min(5, leaderboard.length);
                  const isLast = idx === visibleCount - 1;
                  const initial = (entry.name || entry.username || '?').charAt(0).toUpperCase();
                  const rankColor = entry.rank <= 3 ? colors.primary : secondaryColor;
                  const nameWeight = entry.isMe ? '700' : '500';
                  const scoreColor = entry.rank === 1 ? colors.primary : textColor;
                  const rowBg = entry.isMe ? colors.primary + '18' : 'transparent';
                  return (
                    <TouchableOpacity
                      key={entry.userId}
                      onPress={() => {
                        if (entry.isMe) return;
                        console.log('[Community] Leaderboard entry tapped:', entry.username);
                        router.push({ pathname: '/social-profile-view', params: { userId: entry.userId } });
                      }}
                      activeOpacity={entry.isMe ? 1 : 0.7}
                      style={[
                        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: rowBg },
                        !isLast && { borderBottomWidth: 1, borderBottomColor: borderColor },
                      ]}
                    >
                      <Text style={{ width: 28, fontSize: 13, fontWeight: '700', color: rankColor }}>#{entry.rank}</Text>
                      {entry.avatarUrl ? (
                        <Image source={{ uri: entry.avatarUrl }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }} resizeMode="cover" />
                      ) : (
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: entry.isMe ? colors.primary : '#6B7280', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{initial}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: nameWeight, color: textColor }} numberOfLines={1}>
                          {entry.isMe ? 'You' : entry.name}
                        </Text>
                        {!entry.isMe && entry.username ? (
                          <Text style={{ fontSize: 11, color: secondaryColor }}>@{entry.username}</Text>
                        ) : null}
                      </View>
                      {entry.noActivity ? (
                        <Text style={{ fontSize: 12, color: secondaryColor, fontStyle: 'italic' }}>Sin actividad</Text>
                      ) : (
                        <Text style={{ fontSize: 15, fontWeight: '700', color: scoreColor }}>{entry.score}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}

                {leaderboard.length > 5 && (
                  <TouchableOpacity
                    onPress={() => {
                      console.log('[Community] Leaderboard show all toggled:', !showAllLeaderboard);
                      setShowAllLeaderboard(v => !v);
                    }}
                    style={{ paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: borderColor }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                      {showAllLeaderboard ? 'Show less' : `View all (${leaderboard.length})`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Following list */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.lg }}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Following</Text>
            <Text style={[styles.sectionSubtitle, { color: secondaryColor }]}>{followingCount} people</Text>
          </View>

          {following.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateText, { color: secondaryColor }]}>
                You're not following anyone yet. Search above to find friends.
              </Text>
            </View>
          ) : (
            <View style={[styles.followingCard, { backgroundColor: cardBg, borderColor }]}>
              {following.map((user, idx) => (
                <TouchableOpacity
                  key={user.id}
                  style={[styles.followingRow, idx < following.length - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor }]}
                  onPress={() => {
                    console.log('[Community] Following user tapped:', user.username);
                    router.push({ pathname: '/social-profile-view', params: { userId: user.id } });
                  }}
                >
                  <UserAvatar url={user.avatar_url} name={user.name} username={user.username} size={44} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={[styles.followingName, { color: textColor }]}>{user.name || user.username}</Text>
                    <Text style={[styles.followingHandle, { color: secondaryColor }]}>@{user.username}</Text>
                    <Text style={[styles.followingActivity, { color: secondaryColor }]}>Active recently</Text>
                  </View>
                  <ChevronRight size={18} color={secondaryColor} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[styles.privacyNote, { color: secondaryColor }]}>
            You only see what each person chooses to share.
          </Text>
        </ScrollView>
      )}

      {/* ── PREMIUM CLUB TAB ── */}
      {activeTab === 'club' && premiumLoading && (
        <View style={[styles.gateContainer, { backgroundColor: bgColor }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {activeTab === 'club' && !premiumLoading && !isPremium && (
        <View style={[styles.gateContainer, { backgroundColor: bgColor }]}>
          <Lock size={48} color={colors.primary} />
          <Text style={[styles.gateTitle, { color: textColor }]}>Macro Goal Premium Club</Text>
          <Text style={[styles.gateBadge, { color: secondaryColor }]}>Private · Included with Premium</Text>
          <Text style={[styles.gateDesc, { color: secondaryColor }]}>
            Support, practical ideas, and progress together.
          </Text>
          <TouchableOpacity
            style={[styles.inviteBtn, { marginTop: spacing.lg, paddingHorizontal: spacing.xl }]}
            onPress={() => {
              console.log('[Community] Unlock Premium Club button pressed');
              router.push('/subscription');
            }}
          >
            <Text style={styles.inviteBtnText}>Unlock Premium Club</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'club' && isPremium && (
        <FlatList
          data={clubPosts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={clubRefreshing} onRefresh={handleClubRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <View>
              <View style={[styles.clubHeader, { backgroundColor: cardBg, borderColor, borderWidth: 1, borderRadius: 16, padding: spacing.lg, marginBottom: spacing.md }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                  <Lock size={18} color={colors.primary} />
                  <Text style={[styles.clubTitle, { color: textColor }]}>Premium Club</Text>
                </View>
                <Text style={{ fontSize: 14, color: secondaryColor, lineHeight: 20 }}>
                  You're here because you're committed to transforming your body. Let's share our progress, support each other, and reach our goals together.
                </Text>
              </View>

              {isFounder && clubMemberCount !== null && (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isDark ? '#1A2A1A' : '#F0FDF4',
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: spacing.md,
                    borderWidth: 1,
                    borderColor: isDark ? '#2A4A2A' : '#BBF7D0',
                  }}
                  onPress={() => {
                    console.log('[Community] Member list button pressed, count:', clubMemberCount);
                    setShowMemberList(true);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Users size={18} color="#16A34A" />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#4ADE80' : '#16A34A' }}>
                      {clubMemberCount}
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#4ADE80' : '#16A34A' }}>
                      Premium Members
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#16A34A" />
                </TouchableOpacity>
              )}

              <View style={[styles.composeRow, { backgroundColor: cardBg, borderColor, marginBottom: spacing.md }]}>
                {currentUserAvatar ? (
                  <Image key={currentUserAvatar} source={{ uri: currentUserAvatar }} style={{ width: 36, height: 36, borderRadius: 18 }} resizeMode="cover" />
                ) : (
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#5B9AA8', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{currentUserFirstName ? currentUserFirstName.charAt(0).toUpperCase() : 'U'}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.composePlaceholder, { borderColor }]}
                  onPress={() => {
                    console.log('[Community] Club compose placeholder tapped');
                    setShowCreatePost(true);
                  }}
                >
                  <Text style={[styles.composePlaceholderText, { color: secondaryColor }]}>
                    Share progress, a struggle, or encouragement...
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  console.log('[Community] Club compose plus button tapped');
                  setShowCreatePost(true);
                }}>
                  <Plus size={22} color={secondaryColor} />
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            clubLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateText, { color: secondaryColor }]}>No posts yet. Start the conversation!</Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              isDark={isDark}
              currentUserId={currentUserId}
              onLike={handleLike}
              onSave={handleSave}
              onReport={handleReport}
              onBlock={handleBlock}
              onDelete={handleDelete}
              onOpenComments={handleOpenComments}
              showSaveMeal
              showTopReply
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      {/* Composer sheet */}
      <ComposerSheet
        visible={showCreatePost}
        onClose={() => setShowCreatePost(false)}
        onPosted={handlePosted}
        section={activeTab === 'club' ? 'club' : 'feed'}
        isDark={isDark}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        currentUserFirstName={currentUserFirstName}
        currentUserAvatar={currentUserAvatar}
      />

      {/* Report modal */}
      <ReportModal
        visible={reportPostId !== null}
        postId={reportPostId}
        onClose={() => setReportPostId(null)}
        isDark={isDark}
        currentUserId={currentUserId}
      />

      {/* Auto-share settings modal */}
      <AutoShareSettingsModal
        visible={showAutoShareSettings}
        onClose={() => setShowAutoShareSettings(false)}
        isDark={isDark}
        currentUserId={currentUserId}
      />

      {/* Comments modal */}
      <CommentsModal
        visible={commentsPost !== null}
        post={commentsPost}
        currentUserId={currentUserId}
        currentUserAvatar={currentUserAvatar}
        currentUserName={currentUserName}
        isDark={isDark}
        onClose={() => {
          console.log('[Community] CommentsModal closed');
          setCommentsPost(null);
        }}
        onCommentAdded={handleCommentAdded}
      />

      {/* Premium member list modal (founder only) */}
      <Modal
        visible={showMemberList}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowMemberList(false)}
      >
        <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.primaryBackground }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? colors.borderDark : colors.border }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: isDark ? colors.textDark : colors.primaryText }}>
              Premium Members
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: isDark ? colors.textDark : colors.primaryText }}>
                ({clubMemberCount ?? 0})
              </Text>
              <TouchableOpacity
                onPress={() => {
                  console.log('[Community] Member list modal closed');
                  setShowMemberList(false);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={22} color={isDark ? colors.textSecondaryDark : colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
          {memberListLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={clubMembers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                  <UserAvatar url={item.avatar_url} name={item.full_name} username={item.username} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? colors.textDark : colors.primaryText }}>
                      {item.full_name || item.username}
                    </Text>
                    <Text style={{ fontSize: 13, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>
                      @{item.username}
                    </Text>
                  </View>
                  <Crown size={16} color="#F59E0B" />
                </View>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: isDark ? colors.borderDark : colors.border }} />}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 56,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  pillContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inviteBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  composePlaceholder: {
    flex: 1,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
  },
  composePlaceholderText: {
    fontSize: 14,
  },
  postCard: {
    borderRadius: borderRadius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  postAuthorName: {
    fontSize: 15,
    fontWeight: '700',
  },
  founderBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  founderBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  pinnedLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  postMeta: {
    fontSize: 13,
  },
  postContent: {
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  foodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    gap: 4,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  foodChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  postImage: {
    width: '100%',
    height: 180,
    marginBottom: spacing.sm,
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
  topReplyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  topReplyAuthor: {
    fontSize: 12,
    fontWeight: '600',
  },
  topReplyContent: {
    fontSize: 12,
  },
  postFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.lg,
  },
  postAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  postActionText: {
    fontSize: 14,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.md,
    paddingBottom: 32,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuItemText: {
    fontSize: 16,
  },
  reportSheet: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.md,
    paddingBottom: 32,
  },
  reportTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  reportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  reportOptionText: {
    fontSize: 15,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  postBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
  },
  postBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // Composer
  composerToolbar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  composerTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
  },
  composerTypeBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  composeInput: {
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  fieldInput: {
    fontSize: 14,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  mealPhotoPicker: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  recipePickerCard: {
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    overflow: 'hidden',
  },
  browseRecipesBtn: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    alignSelf: 'center',
  },
  mealActionBtn: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  progressStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
  imagePickerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Settings
  settingsCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingsDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  audienceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  searchResultsCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: '600',
  },
  searchResultHandle: {
    fontSize: 13,
  },
  followBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  followBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 14,
  },
  followingCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  followingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  followingName: {
    fontSize: 15,
    fontWeight: '600',
  },
  followingHandle: {
    fontSize: 13,
  },
  followingActivity: {
    fontSize: 12,
    marginTop: 1,
  },
  privacyNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
  },
  gateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  gateTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  gateBadge: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  gateDesc: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  clubHeader: {
    marginBottom: spacing.md,
  },
  clubTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
});

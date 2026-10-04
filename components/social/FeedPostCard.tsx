/**
 * FeedPostCard — shared PostCard component used by both the Community feed
 * (check-ins.tsx) and the Social Profile screen (social-profile.tsx).
 *
 * Accepts either CommunityPost (from check-ins) or SocialPost (from socialApi)
 * via the unified FeedPost union type.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
  ImageSourcePropType,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Heart,
  MessageCircle,
  MoreHorizontal,
  Bookmark,
  Check,
  Trash2,
  Flag,
  UserX,
  Pencil,
} from 'lucide-react-native';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { supabase } from '@/lib/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';

const COACH_AVATAR = require('@/assets/images/ff4ef6e4-805c-4f79-a014-9784ebe735d9.jpeg');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedPostAuthor {
  id: string;
  username: string;
  full_name?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  user_type?: string | null;
}

export interface FeedPost {
  id: string;
  user_id: string;
  content?: string | null;
  image_url?: string | null;
  is_pinned?: boolean | null;
  is_founder_post?: boolean | null;
  likes_count: number;
  comments_count: number;
  saves_count?: number | null;
  created_at: string;
  author?: FeedPostAuthor | null;
  liked_by_me?: boolean;
  saved_by_me?: boolean;
  // v2 fields
  post_type?: string | null;
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
  progress_stats?: {
    streak_days?: number | null;
    consistency_score?: number | null;
    weight_value?: number | null;
    weight_unit?: string | null;
    weight_goal_pct?: number | null;
    steps_today?: number | null;
    steps_goal?: number | null;
    gym_checked_in?: boolean | null;
  } | Record<string, unknown> | null;
  auto_post_type?: string | null;
  streak_days?: number | null;
  weekly_recap_score?: number | null;
  weekly_recap_days_tracked?: number | null;
  weekly_recap_week_start?: string | null;
  weekly_recap_day_flags?: boolean[] | null;
  weight_goal_pct?: number | null;
  edu_headline?: string | null;
  edu_body?: string | null;
  edu_example?: string | null;
  edu_week?: string | null;
  // legacy
  food_name?: string | null;
  food_calories?: number | null;
  category?: string | null;
}

export interface FeedPostCardProps {
  post: FeedPost;
  isDark: boolean;
  currentUserId: string;
  onLike: (postId: string, liked: boolean) => void;
  onSave: (postId: string, savedByMe: boolean) => void;
  onReport: (postId: string) => void;
  onBlock: (userId: string) => void;
  onDelete: (postId: string) => void;
  onOpenComments: (post: FeedPost) => void;
  onSaveMeal?: (post: FeedPost) => void;
  showSaveMeal?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function resolveImageSource(
  source: string | number | ImageSourcePropType | undefined
): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

export function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function getInitials(name: string | null | undefined, username: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (username && username.trim()) return username.slice(0, 2).toUpperCase();
  return '?';
}

export function getAvatarColor(username: string): string {
  const palette = ['#5B9AA8', '#5CB97B', '#FF8A5B', '#8B5CF6', '#3B82F6', '#EF4444', '#F59E0B'];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

// ─── UserAvatar ───────────────────────────────────────────────────────────────

interface AvatarProps {
  url: string | null | undefined;
  name: string | null | undefined;
  username: string;
  size?: number;
}

export function UserAvatar({ url, name, username, size = 40 }: AvatarProps) {
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

// ─── StreakMilestoneCard ──────────────────────────────────────────────────────

function StreakMilestoneCard({ streakDays, isDark }: { streakDays: number; isDark: boolean }) {
  const bgColor = isDark ? '#1A2A1A' : '#F0FDF4';
  const borderColor = isDark ? '#2A4A2A' : '#BBF7D0';
  const streakLabel = `${streakDays}-day streak`;
  const streakSubtitle = `${streakDays} consecutive days of tracking`;
  return (
    <View style={{ marginHorizontal: 0, backgroundColor: bgColor, borderTopWidth: 1, borderBottomWidth: 1, borderColor, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center', gap: 6 }}>
      <Text style={{ fontSize: 40 }}>🔥</Text>
      <Text style={{ fontSize: 28, fontWeight: '800', color: '#5CB97B', letterSpacing: -0.5 }}>{streakLabel}</Text>
      <Text style={{ fontSize: 14, color: isDark ? '#86EFAC' : '#166534', fontWeight: '500' }}>{streakSubtitle}</Text>
    </View>
  );
}

// ─── WeeklyRecapCard ──────────────────────────────────────────────────────────

function WeeklyRecapCard({ score, daysTracked, weekStart, dayFlags, isDark }: {
  score: number; daysTracked: number; weekStart: string; dayFlags: boolean[] | null; isDark: boolean;
}) {
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
    <View style={{ marginHorizontal: 0, backgroundColor: bgColor, borderTopWidth: 1, borderBottomWidth: 1, borderColor, paddingVertical: 20, paddingHorizontal: 20, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: isDark ? '#E0F2FE' : '#1E3A5A' }}>My week</Text>
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
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: dotBg, alignItems: 'center', justifyContent: 'center' }}>
                {tracked ? <Text style={{ fontSize: 14 }}>✓</Text> : null}
              </View>
              <Text style={{ fontSize: 10, color: isDark ? '#64748B' : '#94A3B8', fontWeight: '600' }}>{label}</Text>
            </View>
          );
        })}
      </View>
      <Text style={{ fontSize: 11, color: isDark ? '#475569' : '#94A3B8', textAlign: 'center' }}>{weekLabel}</Text>
    </View>
  );
}

// ─── WeightGoalCard ───────────────────────────────────────────────────────────

function WeightGoalCard({ progressPct, isDark }: { progressPct: number; isDark: boolean }) {
  const bgColor = isDark ? '#1A1A2A' : '#F5F3FF';
  const borderColor = isDark ? '#2A2A4A' : '#DDD6FE';
  const fillColor = '#5B9AA8';
  const trackBg = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const headlineLabel: Record<number, string> = { 25: '🎯 A quarter of the way there!', 50: '🎯 Halfway to my goal!', 75: '🎯 Almost there!', 100: '🎯 Goal reached!' };
  const milestoneLabel: Record<number, string> = { 25: '25% completed', 50: '50% completed', 75: '75% completed', 100: '100% completed' };
  const headline = headlineLabel[progressPct] ?? `🎯 ${progressPct}% to my goal!`;
  const subtitle = milestoneLabel[progressPct] ?? `${progressPct}% completed`;
  const barWidth = `${progressPct}%` as `${number}%`;
  return (
    <View style={{ marginHorizontal: 0, backgroundColor: bgColor, borderTopWidth: 1, borderBottomWidth: 1, borderColor, paddingVertical: 24, paddingHorizontal: 20, gap: 10 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: isDark ? '#E0E7FF' : '#3730A3', letterSpacing: -0.3 }}>{headline}</Text>
      <Text style={{ fontSize: 14, color: isDark ? '#A5B4FC' : '#6366F1', fontWeight: '600' }}>{subtitle}</Text>
      <View style={{ height: 8, borderRadius: 8, backgroundColor: trackBg, overflow: 'hidden', marginTop: 4 }}>
        <View style={{ height: '100%', width: barWidth, backgroundColor: fillColor, borderRadius: 8 }} />
      </View>
    </View>
  );
}

// ─── EducationalCard ──────────────────────────────────────────────────────────

function EducationalCard({ headline, body, example, isDark }: { headline: string; body: string; example?: string | null; isDark: boolean }) {
  const bgColor = isDark ? '#0A1A1A' : '#F0FDFA';
  const borderColor = isDark ? '#134E4A' : '#99F6E4';
  const headlineColor = isDark ? '#5EEAD4' : '#0F766E';
  const bodyColor = isDark ? '#CCFBF1' : '#134E4A';
  const exampleBg = isDark ? 'rgba(20,184,166,0.12)' : 'rgba(20,184,166,0.08)';
  return (
    <View style={{ marginHorizontal: 0, backgroundColor: bgColor, borderTopWidth: 1, borderBottomWidth: 1, borderColor, paddingVertical: 20, paddingHorizontal: 20, gap: 10 }}>
      <View style={{ width: 32, height: 3, borderRadius: 2, backgroundColor: '#14B8A6' }} />
      <Text style={{ fontSize: 20, fontWeight: '800', color: headlineColor, lineHeight: 26, letterSpacing: -0.3 }}>{headline}</Text>
      <Text style={{ fontSize: 14, color: bodyColor, lineHeight: 21, fontWeight: '400' }}>{body}</Text>
      {example ? (
        <View style={{ backgroundColor: exampleBg, borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: '#14B8A6' }}>
          <Text style={{ fontSize: 13, color: isDark ? '#99F6E4' : '#0F766E', lineHeight: 19, fontStyle: 'italic' }}>{example}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── FeedPostCard ─────────────────────────────────────────────────────────────

export default function FeedPostCard({
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
}: FeedPostCardProps) {
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
  const isEduPost = post.auto_post_type === 'educational';
  const displayName = isEduPost ? 'Coach' : (authorUsername ?? 'User');
  const displayAvatar = isEduPost ? COACH_AVATAR : authorAvatarUri;

  const handleMenuPress = () => {
    console.log('[FeedPostCard] Three-dot menu opened for post:', post.id, 'isOwn:', isOwn);
    setMenuVisible(true);
  };

  const handleLike = () => {
    console.log('[FeedPostCard] Like button pressed for post:', post.id, 'currently liked:', post.liked_by_me);
    onLike(post.id, post.liked_by_me ?? false);
  };

  const handleSave = () => {
    console.log('[FeedPostCard] Bookmark button pressed for post:', post.id, 'currently saved:', post.saved_by_me);
    onSave(post.id, post.saved_by_me ?? false);
  };

  const handleCommentPress = () => {
    console.log('[FeedPostCard] Comment button pressed for post:', post.id);
    onOpenComments(post);
  };

  const handleViewAllComments = () => {
    console.log('[FeedPostCard] View all comments pressed for post:', post.id, 'count:', post.comments_count);
    onOpenComments(post);
  };

  const handleReport = () => {
    console.log('[FeedPostCard] Report pressed for post:', post.id);
    setMenuVisible(false);
    onReport(post.id);
  };

  const handleBlock = () => {
    console.log('[FeedPostCard] Block pressed for user:', post.user_id);
    setMenuVisible(false);
    if (post.user_id) onBlock(post.user_id);
  };

  const handleDelete = () => {
    console.log('[FeedPostCard] Delete pressed for post:', post.id);
    setMenuVisible(false);
    onDelete(post.id);
  };

  const handleSaveMealPress = () => {
    console.log('[FeedPostCard] Save meal pressed for post:', post.id);
    if (onSaveMeal) onSaveMeal(post);
    else Alert.alert('Meal saved!');
  };

  // ── Media zone ──
  const renderMedia = () => {
    if (post.auto_post_type === 'streak_milestone' && post.streak_days != null) {
      return <StreakMilestoneCard streakDays={post.streak_days} isDark={isDark} />;
    }
    if (post.auto_post_type === 'weight_milestone' && post.weight_goal_pct != null) {
      return <WeightGoalCard progressPct={post.weight_goal_pct} isDark={isDark} />;
    }
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
            <Image source={resolveImageSource(mealPhotoUrl)} style={{ width: '100%', aspectRatio: 1.2 }} resizeMode="cover" />
          ) : null}
          {recipeName ? (
            <Text style={{ fontSize: 15, fontWeight: '600', color: textColor, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>{recipeName}</Text>
          ) : null}
          {(calDisplay || protDisplay || carbDisplay || fatDisplay) ? (
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 8 }}>
              {calDisplay ? <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.calories + '18' }}><Text style={{ fontSize: 12, fontWeight: '700', color: colors.calories }}>{'🔥 '}{calDisplay}{' kcal'}</Text></View> : null}
              {protDisplay ? <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.protein + '18' }}><Text style={{ fontSize: 12, fontWeight: '700', color: colors.protein }}>{'💪 '}{protDisplay}{'g'}</Text></View> : null}
              {carbDisplay ? <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.carbs + '18' }}><Text style={{ fontSize: 12, fontWeight: '700', color: colors.carbs }}>{'🍞 '}{carbDisplay}{'g'}</Text></View> : null}
              {fatDisplay ? <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.fats + '18' }}><Text style={{ fontSize: 12, fontWeight: '700', color: colors.fats }}>{'🥑 '}{fatDisplay}{'g'}</Text></View> : null}
            </View>
          ) : null}
          {servingsDisplay ? <Text style={{ fontSize: 12, color: secondaryColor, paddingHorizontal: 16, paddingBottom: 4 }}>{servingsDisplay}{' serving(s)'}</Text> : null}
          {captionDiffersFromName && post.content ? <Text style={{ fontSize: 13, color: textColor, paddingHorizontal: 16, paddingBottom: 4, lineHeight: 18 }}>{post.content}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8, flexWrap: 'wrap' }}>
            {post.meal_recipe_id ? (
              <TouchableOpacity
                style={{ borderWidth: 1, borderRadius: borderRadius.full, paddingVertical: 5, paddingHorizontal: 10, borderColor: colors.primary }}
                onPress={() => {
                  console.log('[FeedPostCard] View Recipe pressed — post_id:', post.id, 'recipe_id:', post.meal_recipe_id);
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
      const stats = post.progress_stats as Record<string, unknown> | null | undefined;
      if (!stats) return null;

      const progressCards = [
        stats.streak_days != null ? { key: 'streak', emoji: '🔥', value: String(stats.streak_days), label: 'day streak', bg: isDark ? '#2A1A1A' : '#FEF2F2', color: '#EF4444' } : null,
        stats.consistency_score != null ? { key: 'consistency', emoji: '📊', value: `${stats.consistency_score}%`, label: 'consistency', bg: isDark ? '#1A2A1A' : '#F0FDF4', color: colors.success } : null,
        stats.weight_goal_pct != null ? { key: 'weight_goal', emoji: '🎯', value: `${stats.weight_goal_pct}%`, label: 'to goal', bg: isDark ? '#1A1A2A' : '#F5F3FF', color: colors.primary } : null,
        stats.steps_today != null ? { key: 'steps', emoji: '👟', value: String(stats.steps_today), label: `/ ${stats.steps_goal ?? 10000} steps`, bg: isDark ? '#1A2A2A' : '#F0FDFA', color: '#0D9488' } : null,
        stats.gym_checked_in != null ? { key: 'gym', emoji: stats.gym_checked_in ? '💪' : '⏳', value: stats.gym_checked_in ? 'Trained' : 'Not yet', label: 'today', bg: isDark ? '#2A1A2A' : '#FDF4FF', color: '#9333EA' } : null,
        stats.weight_value != null && stats.weight_goal_pct == null ? { key: 'weight', emoji: '⚖️', value: Number(stats.weight_value).toFixed(1), label: String(stats.weight_unit ?? 'lbs'), bg: isDark ? '#1A1A2A' : '#F5F3FF', color: colors.primary } : null,
      ].filter(Boolean) as Array<{ key: string; emoji: string; value: string; label: string; bg: string; color: string }>;

      if (progressCards.length === 0) return null;

      const isOne = progressCards.length === 1;
      const isTwo = progressCards.length === 2;

      return (
        <View style={{ marginHorizontal: 16, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#2A3A4A' : '#DBEAFE', backgroundColor: isDark ? '#1E2A3A' : '#F0F7FF', padding: 12, gap: 8 }}>
          {post.content ? (
            <Text style={{ fontSize: 14, color: textColor, lineHeight: 20, marginBottom: 4 }}>{post.content}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: isOne ? 'nowrap' : 'wrap', gap: 8 }}>
            {progressCards.map(card => (
              <View key={card.key} style={{
                flex: isOne ? 1 : isTwo ? 1 : undefined,
                width: isOne ? undefined : isTwo ? undefined : '47%',
                borderRadius: 10,
                padding: 12,
                alignItems: 'center',
                backgroundColor: card.bg,
                gap: 2,
              }}>
                <Text style={{ fontSize: isOne ? 32 : 24 }}>{card.emoji}</Text>
                <Text style={{ fontSize: isOne ? 28 : 22, fontWeight: '800', color: card.color }}>{card.value}</Text>
                <Text style={{ fontSize: 11, fontWeight: '500', color: secondaryColor, textAlign: 'center' }}>{card.label}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    }

    if (post.image_url) {
      return (
        <Image source={resolveImageSource(post.image_url)} style={{ width: '100%', aspectRatio: 1.2 }} resizeMode="cover" />
      );
    }

    return null;
  };

  // ── Caption ──
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
            <Text style={{ fontSize: 13, color: secondaryColor, lineHeight: 18, marginTop: 2 }} numberOfLines={3}>{post.question_details}</Text>
          ) : null}
        </View>
      );
    }
    if (post.post_type_v2 === 'meal') return null;
    if (post.auto_post_type === 'streak_milestone') {
      const streakMsgs: Record<number, string> = { 7: 'Keeping the momentum going!', 14: 'Two weeks of showing up.', 30: 'A full month of discipline.', 60: 'Habits are forming.', 100: 'Triple digits. Absolute legend.' };
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
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <Text style={{ fontSize: 14, color: textColor, lineHeight: 20 }}>
            <Text style={{ fontWeight: '700' }}>{authorUsername}</Text>
            {'  '}{'Another week of showing up!'}
          </Text>
        </View>
      );
    }
    if (post.auto_post_type === 'weight_milestone' && post.weight_goal_pct != null) {
      const captions: Record<number, string> = { 25: 'One milestone closer to my goal!', 50: 'One milestone closer to my goal!', 75: 'Almost there — keeping the momentum!', 100: 'Goal achieved. On to the next one!' };
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
            {'  '}{`This week's featured recipe: ${recipeName}`}
          </Text>
          {macroLine ? <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 18 }}>{macroLine}</Text> : null}
        </View>
      );
    }
    if (post.auto_post_type === 'educational') return null;
    if (post.content) {
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <Text style={{ fontSize: 14, color: textColor, lineHeight: 20, opacity: captionOpacity }}>
            <Text style={{ fontWeight: '700' }}>{captionUsername}</Text>
            {'  '}{post.content}
          </Text>
        </View>
      );
    }
    if (post.food_name) {
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <View style={cardStyles.foodChip}>
            <Check size={12} color="#fff" />
            <Text style={cardStyles.foodChipText}>
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

  return (
    <View style={[cardStyles.postCard, { backgroundColor: cardBg }]}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 }}>
        <TouchableOpacity
          onPress={() => {
            if (!isEduPost && post.user_id && post.user_id !== currentUserId) {
              console.log('[FeedPostCard] Post avatar tapped, navigating to profile:', post.user_id);
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
            <UserAvatar url={authorAvatarUri} name={post.author?.full_name ?? post.author?.name ?? null} username={post.author?.username ?? 'u'} size={40} />
          )}
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={() => {
                if (!isEduPost && post.user_id && post.user_id !== currentUserId) {
                  console.log('[FeedPostCard] Post username tapped, navigating to profile:', post.user_id);
                  router.push({ pathname: '/social-profile-view', params: { userId: post.user_id } });
                }
              }}
              disabled={isEduPost || !post.user_id || post.user_id === currentUserId}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: textColor }}>{displayName}</Text>
            </TouchableOpacity>
            {post.is_founder_post ? (
              <View style={[cardStyles.founderBadge, { backgroundColor: '#0D9488' }]}>
                <Text style={cardStyles.founderBadgeText}>Founder</Text>
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

      {/* Media */}
      {renderMedia()}

      {/* Action row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 16 }} onPress={handleLike}>
          <Heart size={22} color={post.liked_by_me ? '#EF4444' : textColor} fill={post.liked_by_me ? '#EF4444' : 'transparent'} />
          {likesCountDisplay ? <Text style={{ fontSize: 14, fontWeight: '600', color: post.liked_by_me ? '#EF4444' : textColor }}>{likesCountDisplay}</Text> : null}
        </TouchableOpacity>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 16 }} onPress={handleCommentPress}>
          <MessageCircle size={22} color={textColor} />
          {commentsCountDisplay ? <Text style={{ fontSize: 14, fontWeight: '600', color: textColor }}>{commentsCountDisplay}</Text> : null}
        </TouchableOpacity>
        <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={handleSave}>
          <Bookmark size={22} color={post.saved_by_me ? colors.primary : textColor} fill={post.saved_by_me ? colors.primary : 'transparent'} />
        </TouchableOpacity>
      </View>

      {/* Caption */}
      {renderCaption()}

      {/* Comment preview */}
      {post.comments_count > 0 ? (
        <TouchableOpacity onPress={handleViewAllComments} style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <Text style={{ fontSize: 13, color: secondaryColor }}>
            {'View all '}
            {commentsCountDisplay}
            {' comments'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Timestamp */}
      <Text style={{ fontSize: 11, color: secondaryColor, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
        {relTime}
      </Text>

      {/* Save meal button */}
      {showSaveMeal && post.category === 'meal_idea' && post.post_type_v2 !== 'meal' ? (
        <TouchableOpacity style={cardStyles.saveMealBtn} onPress={handleSaveMealPress}>
          <Text style={[cardStyles.saveMealBtnText, { color: colors.primary }]}>Save meal</Text>
        </TouchableOpacity>
      ) : null}

      {/* Three-dot menu */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={cardStyles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[cardStyles.menuSheet, { backgroundColor: isDark ? '#1C1C1E' : '#fff' }]}>
            {isOwn ? (
              <>
                <TouchableOpacity style={cardStyles.menuItem} onPress={() => {
                  console.log('[FeedPostCard] Edit post pressed:', post.id);
                  setMenuVisible(false);
                }}>
                  <Pencil size={18} color={textColor} />
                  <Text style={[cardStyles.menuItemText, { color: textColor }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={cardStyles.menuItem} onPress={handleDelete}>
                  <Trash2 size={18} color={colors.error} />
                  <Text style={[cardStyles.menuItemText, { color: colors.error }]}>Delete</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={cardStyles.menuItem} onPress={handleReport}>
                  <Flag size={18} color={textColor} />
                  <Text style={[cardStyles.menuItemText, { color: textColor }]}>Report</Text>
                </TouchableOpacity>
                <TouchableOpacity style={cardStyles.menuItem} onPress={handleBlock}>
                  <UserX size={18} color={textColor} />
                  <Text style={[cardStyles.menuItemText, { color: textColor }]}>Block user</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardStyles = StyleSheet.create({
  postCard: {
    marginBottom: 8,
    borderRadius: 0,
    overflow: 'hidden',
  },
  founderBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  founderBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  foodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  foodChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  saveMealBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  saveMealBtnText: {
    fontSize: 14,
    fontWeight: '600',
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
});

import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Image,
  ImageSourcePropType,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MessageCircle, Trophy, Flame, TrendingUp, MoreHorizontal } from 'lucide-react-native';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import type { SocialPost } from '@/utils/socialApi';
import Avatar from '@/components/social/Avatar';

function resolveImageSource(
  source: string | number | ImageSourcePropType | undefined
): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
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
  onComment?: (postId: string) => void;
  onPressUser?: (userId: string) => void;
  index?: number;
  hideCommentButton?: boolean;
}

export default function SocialPostCard({
  post,
  isDark,
  onLike,
  onComment,
  onPressUser,
  index = 0,
  hideCommentButton = false,
}: SocialPostCardProps) {
  const router = useRouter();
  const likeScale = useRef(new Animated.Value(1)).current;
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
  const likeActive = post.liked_by_me;
  const authorUsername = post.author?.username ?? 'Unknown';
  const authorName = post.author?.name ?? null;
  const captionText = post.content ?? null;

  // Derived display values
  const caloriesDisplay = post.calories != null ? Math.round(Number(post.calories)).toString() : null;
  const proteinDisplay = post.protein != null ? Math.round(Number(post.protein)).toString() : null;
  const carbsDisplay = post.carbs != null ? Math.round(Number(post.carbs)).toString() : null;
  const fatDisplay = post.fat != null ? Math.round(Number(post.fat)).toString() : null;
  const streakDisplay = post.streak_days != null ? post.streak_days.toString() : null;
  const weightDisplay = post.weight_value != null ? Number(post.weight_value).toFixed(1) : null;
  const weightUnit = post.weight_unit ?? 'lbs';

  const renderPostBody = () => {
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
                    g P
                  </Text>
                </View>
              ) : null}
              {carbsDisplay ? (
                <View style={[styles.macroPill, { backgroundColor: colors.carbs + '18' }]}>
                  <Text style={[styles.macroPillText, { color: colors.carbs }]}>
                    {carbsDisplay}
                    g C
                  </Text>
                </View>
              ) : null}
              {fatDisplay ? (
                <View style={[styles.macroPill, { backgroundColor: colors.fats + '18' }]}>
                  <Text style={[styles.macroPillText, { color: colors.fats }]}>
                    {fatDisplay}
                    g F
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
                      g P
                    </Text>
                  </View>
                ) : null}
                {carbsDisplay ? (
                  <View style={[styles.macroPill, { backgroundColor: colors.carbs + '18' }]}>
                    <Text style={[styles.macroPillText, { color: colors.carbs }]}>
                      {carbsDisplay}
                      g C
                    </Text>
                  </View>
                ) : null}
                {fatDisplay ? (
                  <View style={[styles.macroPill, { backgroundColor: colors.fats + '18' }]}>
                    <Text style={[styles.macroPillText, { color: colors.fats }]}>
                      {fatDisplay}
                      g F
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

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: bg, borderColor },
        { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] },
      ]}
    >
      {/* Header */}
      <Pressable onPress={handlePressUser} style={styles.header} accessibilityRole="button">
        <Avatar username={authorUsername} size={40} />
        <View style={styles.headerInfo}>
          <Text style={[styles.username, { color: textColor }]} numberOfLines={1}>
            {authorUsername}
          </Text>
          {authorName ? (
            <Text style={[styles.authorName, { color: subColor }]} numberOfLines={1}>
              {authorName}
            </Text>
          ) : null}
          <Text style={[styles.timestamp, { color: subColor }]}>{timeAgoText}</Text>
        </View>
        <Pressable
          onPress={() => console.log('[SocialPostCard] More options pressed — post_id:', post.id)}
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

      {/* Actions row */}
      <View style={[styles.actionsRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
        <Pressable
          onPress={handleLike}
          style={styles.actionBtn}
          accessibilityLabel="Like post"
          accessibilityRole="button"
        >
          <Animated.Text
            style={[styles.likeEmoji, { transform: [{ scale: likeScale }], opacity: likeActive ? 1 : 0.45 }]}
          >
            🔥
          </Animated.Text>
          <Text style={[styles.actionCount, { color: likeActive ? colors.warning : subColor }]}>
            {likesCount}
          </Text>
        </Pressable>

        {!hideCommentButton && (
          <Pressable
            onPress={handleComment}
            style={styles.actionBtn}
            accessibilityLabel="View comments"
            accessibilityRole="button"
          >
            <MessageCircle size={20} color={subColor} />
            <Text style={[styles.actionCount, { color: subColor }]}>{commentsCount}</Text>
          </Pressable>
        )}
      </View>

      {/* Likes count */}
      {likesCount > 0 ? (
        <Text style={[styles.likesLine, { color: textColor }]}>
          {likesCount}
          {' '}
          {likesCount === 1 ? 'like' : 'likes'}
        </Text>
      ) : null}

      {/* Caption */}
      {captionText ? (
        <View style={styles.captionRow}>
          <Text style={[styles.captionUsername, { color: textColor }]}>{authorUsername}</Text>
          <Text style={[styles.captionText, { color: textColor }]}>{captionText}</Text>
        </View>
      ) : null}

      {/* View comments link */}
      {commentsCount > 0 && !hideCommentButton ? (
        <Pressable
          onPress={handleComment}
          style={styles.viewCommentsBtn}
          accessibilityRole="button"
        >
          <Text style={[styles.viewCommentsText, { color: subColor }]}>
            View all
            {' '}
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
  username: {
    fontSize: 14,
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
  mealMacroPills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  likeEmoji: {
    fontSize: 22,
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

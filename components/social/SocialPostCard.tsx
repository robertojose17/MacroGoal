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
import { Heart, MessageCircle, Trophy, Flame, Camera, Pencil } from 'lucide-react-native';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import type { SocialPost, PostType } from '@/utils/socialApi';

function resolveImageSource(
  source: string | number | ImageSourcePropType | undefined
): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

function timeAgo(dateStr: string): string {
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

function getPostTypeIcon(type: PostType, isDark: boolean) {
  const color = isDark ? colors.textSecondaryDark : colors.textSecondary;
  switch (type) {
    case 'milestone': return <Trophy size={14} color="#F59E0B" />;
    case 'streak': return <Flame size={14} color="#EF4444" />;
    case 'photo': return <Camera size={14} color={color} />;
    default: return <Pencil size={14} color={color} />;
  }
}

function getPostTypeLabel(type: PostType): string {
  switch (type) {
    case 'milestone': return 'Milestone';
    case 'streak': return 'Streak';
    case 'photo': return 'Photo';
    default: return 'Post';
  }
}

function getPostTypeBadgeColor(type: PostType): string {
  switch (type) {
    case 'milestone': return '#FEF3C7';
    case 'streak': return '#FEE2E2';
    case 'photo': return '#EFF6FF';
    default: return '#F3F4F6';
  }
}

function getPostTypeBadgeTextColor(type: PostType): string {
  switch (type) {
    case 'milestone': return '#92400E';
    case 'streak': return '#991B1B';
    case 'photo': return '#1E40AF';
    default: return '#374151';
  }
}

interface AvatarProps {
  username: string;
  avatarUrl: string | null;
  size?: number;
}

function Avatar({ username, avatarUrl, size = 40 }: AvatarProps) {
  const initial = (username ?? 'U').charAt(0).toUpperCase();
  if (avatarUrl) {
    return (
      <Image
        source={resolveImageSource(avatarUrl)}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.primary + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: colors.primary }}>
        {initial}
      </Text>
    </View>
  );
}

interface SocialPostCardProps {
  post: SocialPost;
  isDark: boolean;
  onLike: (postId: string) => void;
  index?: number;
}

export default function SocialPostCard({ post, isDark, onLike, index = 0 }: SocialPostCardProps) {
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
    console.log('[SocialPostCard] Like pressed — post_id:', post.id, 'currently liked:', post.liked_by_me);
    Animated.sequence([
      Animated.spring(likeScale, {
        toValue: 1.4,
        useNativeDriver: true,
        speed: 50,
        bounciness: 8,
      }),
      Animated.spring(likeScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
        bounciness: 4,
      }),
    ]).start();
    onLike(post.id);
  }, [post.id, post.liked_by_me, onLike]);

  const handleComment = useCallback(() => {
    console.log('[SocialPostCard] Comment pressed — post_id:', post.id);
    router.push(`/social-post-detail?post_id=${post.id}`);
  }, [post.id, router]);

  const bg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const timeAgoText = timeAgo(post.created_at);
  const badgeBg = getPostTypeBadgeColor(post.post_type);
  const badgeText = getPostTypeBadgeTextColor(post.post_type);
  const typeLabel = getPostTypeLabel(post.post_type);
  const likesCount = post.likes_count;
  const commentsCount = post.comments_count;
  const likeColor = post.liked_by_me ? '#EF4444' : subColor;

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: bg, borderColor },
        { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Avatar username={post.author?.username ?? 'U'} avatarUrl={post.author?.avatar_url ?? null} size={40} />
        <View style={styles.headerInfo}>
          <Text style={[styles.username, { color: textColor }]} numberOfLines={1}>
            {post.author?.username ?? 'Unknown'}
          </Text>
          <Text style={[styles.timestamp, { color: subColor }]}>{timeAgoText}</Text>
        </View>
        <View style={[styles.typeBadge, { backgroundColor: badgeBg }]}>
          {getPostTypeIcon(post.post_type, isDark)}
          <Text style={[styles.typeBadgeText, { color: badgeText }]}>{typeLabel}</Text>
        </View>
      </View>

      {/* Content */}
      {post.content ? (
        <Text style={[styles.content, { color: textColor }]}>{post.content}</Text>
      ) : null}

      {/* Streak info */}
      {post.post_type === 'streak' && post.streak_days != null ? (
        <View style={styles.streakRow}>
          <Flame size={18} color="#EF4444" />
          <Text style={[styles.streakText, { color: textColor }]}>
            {post.streak_days}
          </Text>
          <Text style={[styles.streakLabel, { color: subColor }]}>day streak</Text>
        </View>
      ) : null}

      {/* Weight info */}
      {post.weight_value != null ? (
        <View style={styles.weightRow}>
          <Text style={[styles.weightValue, { color: colors.primary }]}>
            {Number(post.weight_value).toFixed(1)}
          </Text>
          <Text style={[styles.weightUnit, { color: subColor }]}>
            {post.weight_unit ?? 'lbs'}
          </Text>
        </View>
      ) : null}

      {/* Image */}
      {post.image_url ? (
        <Image
          source={resolveImageSource(post.image_url)}
          style={styles.postImage}
          resizeMode="cover"
        />
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={handleLike}
          style={styles.actionBtn}
          accessibilityLabel="Like post"
          accessibilityRole="button"
        >
          <Animated.View style={{ transform: [{ scale: likeScale }] }}>
            <Heart
              size={20}
              color={likeColor}
              fill={post.liked_by_me ? '#EF4444' : 'transparent'}
            />
          </Animated.View>
          <Text style={[styles.actionCount, { color: subColor }]}>{likesCount}</Text>
        </Pressable>

        <Pressable
          onPress={handleComment}
          style={styles.actionBtn}
          accessibilityLabel="View comments"
          accessibilityRole="button"
        >
          <MessageCircle size={20} color={subColor} />
          <Text style={[styles.actionCount, { color: subColor }]}>{commentsCount}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 12,
    marginTop: 1,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  streakText: {
    fontSize: 22,
    fontWeight: '700',
  },
  streakLabel: {
    fontSize: 14,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  weightValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  weightUnit: {
    fontSize: 14,
  },
  postImage: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingVertical: 4,
  },
  actionCount: {
    fontSize: 14,
    fontWeight: '500',
  },
});

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Users } from 'lucide-react-native';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import type { SearchUser } from '@/utils/socialApi';
import { followUser, unfollowUser } from '@/utils/socialApi';
import Avatar from '@/components/social/Avatar';

interface SearchUserRowProps {
  user: SearchUser;
  isDark: boolean;
  index?: number;
  onFollowChange?: (userId: string, isFollowing: boolean) => void;
}

export default function SearchUserRow({
  user,
  isDark,
  index = 0,
  onFollowChange,
}: SearchUserRowProps) {
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(user.is_following);
  const [loading, setLoading] = useState(false);
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(10)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 300, delay: index * 50, useNativeDriver: true }),
      Animated.timing(cardTranslateY, { toValue: 0, duration: 300, delay: index * 50, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleFollowToggle = useCallback(async () => {
    const newFollowing = !isFollowing;
    console.log('[SearchUserRow] Follow toggle pressed — user_id:', user.id, 'username:', user.username, 'newFollowing:', newFollowing);
    setIsFollowing(newFollowing);
    setLoading(true);
    try {
      if (newFollowing) {
        await followUser(user.id);
        console.log('[SearchUserRow] Followed user:', user.username);
      } else {
        await unfollowUser(user.id);
        console.log('[SearchUserRow] Unfollowed user:', user.username);
      }
      onFollowChange?.(user.id, newFollowing);
    } catch (e) {
      console.error('[SearchUserRow] Follow toggle failed, reverting:', e);
      setIsFollowing(!newFollowing);
    } finally {
      setLoading(false);
    }
  }, [user.id, user.username, isFollowing, onFollowChange]);

  const handleRowPress = useCallback(() => {
    console.log('[SearchUserRow] Row pressed — navigating to profile user_id:', user.id);
    router.push(`/social-profile?user_id=${user.id}`);
  }, [user.id, router]);

  const bg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const followersText = user.followers_count === 1
    ? '1 follower'
    : `${user.followers_count} followers`;

  const followBtnBg = isFollowing ? 'transparent' : colors.primary;
  const followBtnBorder = isFollowing ? (isDark ? colors.cardBorderDark : colors.cardBorder) : colors.primary;
  const followBtnText = isFollowing ? (isDark ? colors.textDark : colors.text) : '#FFFFFF';
  const followLabel = isFollowing ? 'Following' : 'Follow';

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: bg, borderColor },
        { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] },
      ]}
    >
      <Pressable onPress={handleRowPress} style={styles.row} accessibilityRole="button">
        <Avatar username={user.username} size={44} />
        <View style={styles.info}>
          <Text style={[styles.username, { color: textColor }]} numberOfLines={1}>
            {user.username}
          </Text>
          {user.name ? (
            <Text style={[styles.name, { color: subColor }]} numberOfLines={1}>
              {user.name}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <Users size={11} color={subColor} />
            <Text style={[styles.metaText, { color: subColor }]}>{followersText}</Text>
          </View>
        </View>
        <Pressable
          onPress={handleFollowToggle}
          disabled={loading}
          style={[
            styles.followBtn,
            {
              backgroundColor: followBtnBg,
              borderColor: followBtnBorder,
              opacity: loading ? 0.6 : 1,
            },
          ]}
          accessibilityLabel={followLabel}
          accessibilityRole="button"
        >
          <Text style={[styles.followBtnText, { color: followBtnText }]}>
            {loading ? '...' : followLabel}
          </Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  username: {
    fontSize: 15,
    fontWeight: '700',
  },
  name: {
    fontSize: 13,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
  },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    minWidth: 80,
    alignItems: 'center',
  },
  followBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

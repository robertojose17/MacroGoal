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
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import type { Connection, ConnectionRole } from '@/utils/socialApi';

function resolveImageSource(
  source: string | number | ImageSourcePropType | undefined
): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

const ROLE_COLORS: Record<ConnectionRole, { bg: string; text: string; label: string }> = {
  coach: { bg: '#EDE9FE', text: '#6D28D9', label: 'Coach' },
  friend: { bg: '#DBEAFE', text: '#1D4ED8', label: 'Friend' },
  partner: { bg: '#FCE7F3', text: '#BE185D', label: 'Partner' },
};

function Avatar({ username, avatarUrl, size = 44 }: { username: string; avatarUrl: string | null; size?: number }) {
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
      <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: colors.primary }}>
        {initial}
      </Text>
    </View>
  );
}

interface ConnectionRowProps {
  connection: Connection;
  isDark: boolean;
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
  index?: number;
}

export default function ConnectionRow({
  connection,
  isDark,
  onAccept,
  onDecline,
  index = 0,
}: ConnectionRowProps) {
  const router = useRouter();
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(10)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 300, delay: index * 50, useNativeDriver: true }),
      Animated.timing(cardTranslateY, { toValue: 0, duration: 300, delay: index * 50, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleViewStats = useCallback(() => {
    console.log('[ConnectionRow] View Stats pressed — user_id:', connection.other_user.id, 'username:', connection.other_user.username);
    router.push(`/social-profile?user_id=${connection.other_user.id}`);
  }, [connection.other_user.id, router]);

  const handleAccept = useCallback(() => {
    console.log('[ConnectionRow] Accept pressed — connection_id:', connection.id);
    onAccept?.(connection.id);
  }, [connection.id, onAccept]);

  const handleDecline = useCallback(() => {
    console.log('[ConnectionRow] Decline pressed — connection_id:', connection.id);
    onDecline?.(connection.id);
  }, [connection.id, onDecline]);

  const bg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const roleInfo = ROLE_COLORS[connection.role] ?? ROLE_COLORS.friend;
  const isPending = connection.status === 'pending';
  const username = connection.other_user?.username ?? 'Unknown';

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: bg, borderColor },
        { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] },
      ]}
    >
      <View style={styles.row}>
        <Avatar username={username} avatarUrl={connection.other_user?.avatar_url ?? null} size={44} />
        <View style={styles.info}>
          <Text style={[styles.username, { color: textColor }]} numberOfLines={1}>
            {username}
          </Text>
          <View style={styles.badges}>
            <View style={[styles.roleBadge, { backgroundColor: roleInfo.bg }]}>
              <Text style={[styles.roleBadgeText, { color: roleInfo.text }]}>{roleInfo.label}</Text>
            </View>
            {isPending && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>Pending</Text>
              </View>
            )}
          </View>
        </View>

        {isPending && onAccept && onDecline ? (
          <View style={styles.pendingActions}>
            <Pressable
              onPress={handleAccept}
              style={[styles.acceptBtn]}
              accessibilityLabel="Accept connection"
              accessibilityRole="button"
            >
              <Text style={styles.acceptBtnText}>Accept</Text>
            </Pressable>
            <Pressable
              onPress={handleDecline}
              style={[styles.declineBtn]}
              accessibilityLabel="Decline connection"
              accessibilityRole="button"
            >
              <Text style={styles.declineBtnText}>Decline</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={handleViewStats}
            style={[styles.viewStatsBtn, { borderColor: colors.primary }]}
            accessibilityLabel="View stats"
            accessibilityRole="button"
          >
            <Text style={[styles.viewStatsBtnText, { color: colors.primary }]}>View Stats</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
  },
  viewStatsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  viewStatsBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.success,
  },
  acceptBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  declineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  declineBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#991B1B',
  },
});

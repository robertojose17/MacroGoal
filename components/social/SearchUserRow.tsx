import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Image,
  ImageSourcePropType,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { X } from 'lucide-react-native';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import type { SearchUser, ConnectionRole } from '@/utils/socialApi';

function resolveImageSource(
  source: string | number | ImageSourcePropType | undefined
): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

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

const ROLES: { role: ConnectionRole; label: string; color: string; bg: string }[] = [
  { role: 'friend', label: 'Friend', color: '#1D4ED8', bg: '#DBEAFE' },
  { role: 'coach', label: 'Coach', color: '#6D28D9', bg: '#EDE9FE' },
  { role: 'partner', label: 'Partner', color: '#BE185D', bg: '#FCE7F3' },
];

interface SearchUserRowProps {
  user: SearchUser;
  isDark: boolean;
  onConnect: (userId: string, role: ConnectionRole) => Promise<void>;
  index?: number;
}

export default function SearchUserRow({ user, isDark, onConnect, index = 0 }: SearchUserRowProps) {
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(10)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 300, delay: index * 50, useNativeDriver: true }),
      Animated.timing(cardTranslateY, { toValue: 0, duration: 300, delay: index * 50, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleConnectPress = useCallback(() => {
    console.log('[SearchUserRow] Connect pressed — user_id:', user.id, 'username:', user.username);
    setShowRolePicker(true);
  }, [user.id, user.username]);

  const handleRoleSelect = useCallback(async (role: ConnectionRole) => {
    console.log('[SearchUserRow] Role selected — user_id:', user.id, 'role:', role);
    setShowRolePicker(false);
    setConnecting(true);
    try {
      await onConnect(user.id, role);
      console.log('[SearchUserRow] Connection request sent successfully');
    } catch (e) {
      console.error('[SearchUserRow] Connection request failed:', e);
    } finally {
      setConnecting(false);
    }
  }, [user.id, onConnect]);

  const bg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const modalBg = isDark ? colors.cardDark : '#fff';

  const statusText = user.connection_status === 'pending'
    ? 'Pending'
    : user.connection_status === 'accepted'
    ? 'Connected'
    : null;

  const canConnect = !user.connection_status;

  return (
    <>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: bg, borderColor },
          { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] },
        ]}
      >
        <View style={styles.row}>
          <Avatar username={user.username} avatarUrl={user.avatar_url} size={44} />
          <View style={styles.info}>
            <Text style={[styles.username, { color: textColor }]} numberOfLines={1}>
              {user.username}
            </Text>
            {statusText ? (
              <Text style={[styles.statusText, { color: subColor }]}>{statusText}</Text>
            ) : null}
          </View>
          {canConnect ? (
            <Pressable
              onPress={handleConnectPress}
              disabled={connecting}
              style={[styles.connectBtn, { opacity: connecting ? 0.6 : 1 }]}
              accessibilityLabel="Connect with user"
              accessibilityRole="button"
            >
              <Text style={styles.connectBtnText}>
                {connecting ? 'Sending...' : 'Connect'}
              </Text>
            </Pressable>
          ) : (
            <View style={[styles.statusBadge, { backgroundColor: colors.primary + '18' }]}>
              <Text style={[styles.statusBadgeText, { color: colors.primary }]}>
                {statusText}
              </Text>
            </View>
          )}
        </View>
      </Animated.View>

      {/* Role Picker Modal */}
      <Modal
        visible={showRolePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRolePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            console.log('[SearchUserRow] Role picker dismissed');
            setShowRolePicker(false);
          }}
        >
          <View style={[styles.modalSheet, { backgroundColor: modalBg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>Connect as...</Text>
              <Pressable
                onPress={() => setShowRolePicker(false)}
                style={styles.closeBtn}
                accessibilityLabel="Close"
              >
                <X size={20} color={subColor} />
              </Pressable>
            </View>
            <Text style={[styles.modalSubtitle, { color: subColor }]}>
              How do you know {user.username}?
            </Text>
            {ROLES.map((r) => (
              <Pressable
                key={r.role}
                onPress={() => handleRoleSelect(r.role)}
                style={[styles.roleOption, { backgroundColor: r.bg }]}
                accessibilityLabel={`Connect as ${r.label}`}
                accessibilityRole="button"
              >
                <Text style={[styles.roleOptionText, { color: r.color }]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
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
    gap: 3,
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 12,
  },
  connectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  connectBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  roleOption: {
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  roleOptionText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';

interface Props {
  visible: boolean;
  lostStreakValue: number;
  priceLabel: string;
  purchasing: boolean;
  onPurchase: () => void;
  onDismiss: () => void;
}

export default function StreakRescueModal({
  visible,
  lostStreakValue,
  priceLabel,
  purchasing,
  onPurchase,
  onDismiss,
}: Props) {
  const titleText = `You lost your ${lostStreakValue}-day streak!`;
  const subtitleText = "Don't let all that hard work disappear.";
  const rescueLabel = 'Rescue my streak';
  const dismissLabel = 'No, start over';
  const priceLine = priceLabel ? `Only ${priceLabel}` : '';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Flame icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.flameEmoji}>🔥</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {titleText}
          </Text>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            {subtitleText}
          </Text>

          {/* Price hint */}
          {priceLine.length > 0 && (
            <Text style={styles.priceHint}>
              {priceLine}
            </Text>
          )}

          {/* Primary CTA */}
          <TouchableOpacity
            style={[styles.primaryButton, purchasing && styles.primaryButtonDisabled]}
            onPress={() => {
              console.log('[StreakRescueModal] Rescue my streak pressed');
              onPurchase();
            }}
            activeOpacity={0.85}
            disabled={purchasing}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {rescueLabel}
              </Text>
            )}
          </TouchableOpacity>

          {/* Secondary dismiss */}
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={() => {
              console.log('[StreakRescueModal] Dismiss pressed — user chose to start over');
              onDismiss();
            }}
            activeOpacity={0.7}
            disabled={purchasing}
          >
            <Text style={styles.dismissButtonText}>
              {dismissLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const CARD_BG = '#1a1a1a';
const ORANGE = '#FF8A5B';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 138, 91, 0.25)',
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 138, 91, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  flameEmoji: {
    fontSize: 36,
  },
  title: {
    ...typography.h3,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondaryDark,
    textAlign: 'center',
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  priceHint: {
    fontSize: 13,
    fontWeight: '600',
    color: ORANGE,
    textAlign: 'center',
    marginBottom: spacing.lg,
    letterSpacing: 0.2,
  },
  primaryButton: {
    backgroundColor: ORANGE,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: spacing.sm,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dismissButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  dismissButtonText: {
    color: colors.textSecondaryDark,
    fontSize: 15,
    fontWeight: '500',
  },
});

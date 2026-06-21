/**
 * StreakBenefitsModal
 *
 * Shows the streak multiplier table with the user's current tier highlighted.
 */

import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

interface StreakBenefitsModalProps {
  visible: boolean;
  currentStreak: number;
  onClose: () => void;
  isDark: boolean;
}

interface StreakTier {
  minDays: number;
  maxDays: number | null;
  label: string;
  multiplier: number;
  xpExample: number;
}

const STREAK_TIERS: StreakTier[] = [
  { minDays: 0,   maxDays: 6,   label: '0 – 6 days',   multiplier: 1.0, xpExample: 100 },
  { minDays: 7,   maxDays: 29,  label: '7 – 29 days',  multiplier: 1.1, xpExample: 110 },
  { minDays: 30,  maxDays: 89,  label: '30 – 89 days', multiplier: 1.25, xpExample: 125 },
  { minDays: 90,  maxDays: 364, label: '90 – 364 days', multiplier: 1.5, xpExample: 150 },
  { minDays: 365, maxDays: null, label: '365+ days',   multiplier: 2.0, xpExample: 200 },
];

function getCurrentTierIndex(streak: number): number {
  for (let i = STREAK_TIERS.length - 1; i >= 0; i--) {
    if (streak >= STREAK_TIERS[i].minDays) return i;
  }
  return 0;
}

function getMultiplierLabel(multiplier: number): string {
  return multiplier.toFixed(1) + 'x XP Boost';
}

export default function StreakBenefitsModal({
  visible,
  currentStreak,
  onClose,
  isDark,
}: StreakBenefitsModalProps) {
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const textSecColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const modalBg = isDark ? colors.backgroundDark : colors.background;
  const trackColor = isDark ? '#3A3C52' : '#E5E7EB';

  const currentTierIndex = getCurrentTierIndex(currentStreak);
  const currentTier = STREAK_TIERS[currentTierIndex];
  const currentMultiplierLabel = getMultiplierLabel(currentTier.multiplier);
  const streakDisplay = String(currentStreak);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView
        edges={['top']}
        style={[styles.safeArea, { backgroundColor: cardBg }]}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { backgroundColor: cardBg }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              console.log('[StreakBenefitsModal] Close button pressed');
              onClose();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol name="xmark" size={20} color={textColor} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: textColor }]}>
              {'🔥 Streak Benefits'}
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={{ backgroundColor: modalBg }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: spacing.md, paddingBottom: spacing.xl * 2 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Sub-hero ── */}
          <View style={[styles.heroCard, { backgroundColor: cardBg }]}>
            <View style={styles.heroRow}>
              <Text style={styles.heroFlame}>
                {'🔥'}
              </Text>
              <Text style={[styles.heroStreak, { color: textColor }]}>
                {streakDisplay}
              </Text>
            </View>
            <Text style={[styles.heroLabel, { color: textSecColor }]}>
              Day Streak
            </Text>
            <View style={styles.multiplierBadge}>
              <Text style={styles.multiplierBadgeText}>
                {currentMultiplierLabel}
              </Text>
            </View>
          </View>

          {/* ── Table ── */}
          <Text style={[styles.sectionLabel, { color: textSecColor }]}>
            MULTIPLIER TIERS
          </Text>
          <View style={[styles.tableCard, { backgroundColor: cardBg }]}>
            {/* Table header */}
            <View style={[styles.tableHeaderRow, { borderBottomColor: trackColor }]}>
              <Text style={[styles.tableHeaderCell, styles.colDays, { color: textSecColor }]}>
                DAYS
              </Text>
              <Text style={[styles.tableHeaderCell, styles.colMultiplier, { color: textSecColor }]}>
                MULTIPLIER
              </Text>
              <Text style={[styles.tableHeaderCell, styles.colExample, { color: textSecColor }]}>
                100 BASE XP
              </Text>
            </View>

            {STREAK_TIERS.map((tier, index) => {
              const isCurrentTier = index === currentTierIndex;
              const rowBg = isCurrentTier
                ? isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.06)'
                : 'transparent';
              const isLast = index === STREAK_TIERS.length - 1;
              const multiplierText = tier.multiplier.toFixed(1) + 'x';
              const xpText = String(tier.xpExample) + ' XP';

              return (
                <View
                  key={index}
                  style={[
                    styles.tableRow,
                    { backgroundColor: rowBg },
                    isCurrentTier && styles.tableRowCurrent,
                    !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: trackColor },
                  ]}
                >
                  <Text style={[styles.tableCell, styles.colDays, { color: textColor }]}>
                    {tier.label}
                  </Text>
                  <Text
                    style={[
                      styles.tableCell,
                      styles.colMultiplier,
                      { color: isCurrentTier ? '#22C55E' : textColor, fontWeight: '700' },
                    ]}
                  >
                    {multiplierText}
                  </Text>
                  <View style={[styles.colExample, styles.exampleCell]}>
                    <Text style={[styles.tableCell, { color: isCurrentTier ? '#22C55E' : textSecColor }]}>
                      {xpText}
                    </Text>
                    {isCurrentTier && (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeText}>
                          {'★ YOU'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* ── Explanation ── */}
          <View style={[styles.explanationCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.explanationText, { color: textSecColor }]}>
              {'Your streak boost stacks with Premium (1.5x) for a maximum of 3.0x XP on every action. A 365-day streak + Premium is the fastest path to the top ranks.'}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    paddingTop: spacing.md,
    gap: spacing.md,
  },

  // ── Hero ──
  heroCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroFlame: {
    fontSize: 40,
  },
  heroStreak: {
    fontSize: 56,
    fontWeight: '900',
    lineHeight: 64,
  },
  heroLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 2,
  },
  multiplierBadge: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: spacing.sm,
  },
  multiplierBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Section label ──
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 0,
  },

  // ── Table ──
  tableCard: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  tableRowCurrent: {
    borderLeftWidth: 4,
    borderLeftColor: '#22C55E',
  },
  tableCell: {
    fontSize: 14,
    fontWeight: '500',
  },
  colDays: {
    flex: 1.5,
  },
  colMultiplier: {
    flex: 1.5,
    textAlign: 'center',
  },
  colExample: {
    flex: 1.5,
  },
  exampleCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  youBadge: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  youBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },

  // ── Explanation ──
  explanationCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  explanationText: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 20,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

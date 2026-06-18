/**
 * XpRanksModal
 *
 * Shows all 20 XP rank tiers in a scrollable list.
 * Each row shows the V sub-level badge, tier name, level range, and status.
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
import XpRankBadge from '@/components/xp/XpRankBadge';
import RankIcon from '@/components/xp/RankIcon';
import { getXpRank } from '@/utils/xpRanks';

interface XpRanksModalProps {
  visible: boolean;
  currentLevel: number;
  onClose: () => void;
  isDark: boolean;
}

const TIER_NAMES = [
  'Rookie', 'Novice', 'Challenger', 'Athlete', 'Warrior',
  'Fighter', 'Grinder', 'Dedicated', 'Iron Mind', 'Titan',
  'Elite', 'Champion', 'Master', 'Grandmaster', 'Legend',
  'Mythic', 'Immortal', 'Ascendant', 'Transcendent', 'Apex',
];

export default function XpRanksModal({
  visible,
  currentLevel,
  onClose,
  isDark,
}: XpRanksModalProps) {
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const textSecColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const modalBg = isDark ? colors.backgroundDark : colors.background;

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
              console.log('[XpRanksModal] Close button pressed');
              onClose();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol name="xmark" size={20} color={textColor} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: textColor }]}>
              All Ranks
            </Text>
            <Text style={[styles.headerSubtitle, { color: textSecColor }]}>
              Climb 20 ranks from Rookie to Apex
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
          <View style={[styles.listCard, { backgroundColor: cardBg }]}>
            {TIER_NAMES.map((tierName, tierIndex) => {
              const minLevel = tierIndex * 5 + 1;
              const maxLevel = tierIndex * 5 + 5;
              // Show the V sub-level badge (final form of this tier)
              const badgeRank = getXpRank(maxLevel);

              const isCurrent = currentLevel >= minLevel && currentLevel <= maxLevel;
              const isCompleted = currentLevel > maxLevel;
              const isLocked = currentLevel < minLevel;
              const isLast = tierIndex === 19;

              const rangeLabel = 'Levels ' + String(minLevel) + '–' + String(maxLevel);

              const rowBg = isCurrent
                ? isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.06)'
                : 'transparent';

              const rowOpacity = isLocked ? 0.35 : 1;

              return (
                <View
                  key={tierIndex}
                  style={[
                    styles.tierRow,
                    { backgroundColor: rowBg, opacity: rowOpacity },
                    isCurrent && styles.tierRowCurrent,
                    !isLast && styles.tierRowBorder,
                    isDark && !isLast && { borderBottomColor: colors.borderDark },
                  ]}
                >
                  {/* Badge */}
                  <View style={styles.badgeCol}>
                    <RankIcon
                      tierIndex={tierIndex}
                      size={44}
                      color={badgeRank.primaryColor}
                      gradientColor={badgeRank.gradientColor}
                    />
                  </View>

                  {/* Info */}
                  <View style={styles.tierInfo}>
                    <Text
                      style={[styles.tierName, { color: textColor }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {tierName}
                    </Text>
                    <Text style={[styles.tierRange, { color: textSecColor }]}>
                      {rangeLabel}
                    </Text>
                  </View>

                  {/* Status */}
                  <View style={styles.statusCol}>
                    {isCurrent && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>
                          {'★ CURRENT'}
                        </Text>
                      </View>
                    )}
                    {isCompleted && (
                      <IconSymbol
                        name="checkmark.circle.fill"
                        size={20}
                        color={colors.success}
                      />
                    )}
                    {isLocked && (
                      <Text style={styles.lockIcon}>
                        {'🔒'}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
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
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    paddingTop: spacing.md,
  },
  listCard: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    gap: 6,
  },
  tierRowCurrent: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  tierRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  badgeCol: {
    width: 88,
    alignItems: 'flex-start',
  },
  tierInfo: {
    flex: 1,
    gap: 2,
  },
  tierName: {
    fontSize: 14,
    fontWeight: '700',
  },
  tierRange: {
    fontSize: 12,
    fontWeight: '400',
  },
  statusCol: {
    width: 80,
    alignItems: 'flex-end',
  },
  currentBadge: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  currentBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  lockIcon: {
    fontSize: 16,
  },
});

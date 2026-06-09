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
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import {
  getStreakRank,
  getAllRanks,
  getNextRank,
  daysUntilNextRank,
  type RankListEntry,
} from '@/utils/streakRanks';

interface StreakRanksModalProps {
  visible: boolean;
  onClose: () => void;
  currentStreakDays: number;
}

export default function StreakRanksModal({
  visible,
  onClose,
  currentStreakDays,
}: StreakRanksModalProps) {
  const isDark = useColorScheme() === 'dark';
  const currentRank = getStreakRank(currentStreakDays);
  const nextRank = getNextRank(currentStreakDays);
  const daysLeft = daysUntilNextRank(currentStreakDays);
  const allRanks = getAllRanks();

  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const textSecColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const modalBg = isDark ? colors.backgroundDark : colors.background;

  const streakCountText = `${currentStreakDays} day streak`;
  const daysLeftText = daysLeft !== null ? `${daysLeft} days to go` : null;

  function getRankStatus(entry: RankListEntry): 'completed' | 'current' | 'future' {
    if (currentStreakDays >= entry.startDay && currentStreakDays <= entry.endDay) {
      return 'current';
    }
    if (entry.endDay !== Infinity && currentStreakDays > entry.endDay) {
      return 'completed';
    }
    return 'future';
  }

  function getDayRangeText(entry: RankListEntry): string {
    if (entry.endDay === Infinity) {
      return `Days ${entry.startDay}+`;
    }
    return `Days ${entry.startDay}\u2013${entry.endDay}`;
  }

  function renderStatusIndicator(status: 'completed' | 'current' | 'future') {
    if (status === 'completed') {
      return (
        <IconSymbol
          name="checkmark.circle.fill"
          size={20}
          color={colors.success}
        />
      );
    }
    if (status === 'current') {
      return <View style={styles.dotCurrent} />;
    }
    return <View style={styles.dotFuture} />;
  }

  function getRowOpacity(status: 'completed' | 'current' | 'future'): number {
    if (status === 'completed') return 0.55;
    if (status === 'current') return 1;
    return 0.85;
  }

  const currentRowBg = isDark
    ? 'rgba(91, 154, 168, 0.15)'
    : 'rgba(91, 154, 168, 0.08)';

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
        {/* Header */}
        <View style={[styles.header, { backgroundColor: cardBg }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              console.log('[StreakRanksModal] Close button pressed');
              onClose();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol name="xmark" size={20} color={textColor} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textColor }]}>
            Rank Progression
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={{ backgroundColor: modalBg }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Current Rank ── */}
          <Text style={[styles.sectionLabel, { color: textSecColor }]}>
            YOUR RANK
          </Text>
          <View
            style={[
              styles.currentRankCard,
              { backgroundColor: cardBg },
            ]}
          >
            <Text style={styles.currentRankEmoji}>{currentRank.emoji}</Text>
            <Text style={[styles.currentRankLabel, { color: textColor }]}>
              {currentRank.fullLabel}
            </Text>
            <Text style={[styles.currentRankDays, { color: textSecColor }]}>
              {streakCountText}
            </Text>
          </View>

          {/* ── Next Rank ── */}
          <Text
            style={[
              styles.sectionLabel,
              { color: textSecColor, marginTop: spacing.md },
            ]}
          >
            NEXT RANK
          </Text>
          {nextRank === null ? (
            <View style={[styles.nextRankCard, { backgroundColor: cardBg }]}>
              <Text style={[styles.topReachedText, { color: textSecColor }]}>
                🐐 You&apos;ve reached the top.
              </Text>
            </View>
          ) : (
            <View style={[styles.nextRankCard, { backgroundColor: cardBg }]}>
              <View style={styles.nextRankLeft}>
                <Text style={styles.nextRankEmoji}>{nextRank.emoji}</Text>
                <View style={styles.nextRankInfo}>
                  <Text style={[styles.nextRankLabel, { color: textColor }]}>
                    {nextRank.fullLabel}
                  </Text>
                  <Text style={[styles.nextRankDays, { color: textSecColor }]}>
                    {daysLeftText}
                  </Text>
                </View>
              </View>
              <IconSymbol
                name="chevron.right"
                size={16}
                color={textSecColor}
              />
            </View>
          )}

          {/* ── All Ranks ── */}
          <Text
            style={[
              styles.sectionLabel,
              { color: textSecColor, marginTop: spacing.md },
            ]}
          >
            ALL RANKS
          </Text>

          <View style={[styles.allRanksCard, { backgroundColor: cardBg }]}>
            {allRanks.map((entry, i) => {
              const status = getRankStatus(entry);
              const opacity = getRowOpacity(status);
              const dayRangeText = getDayRangeText(entry);
              const isCurrent = status === 'current';
              const showYearlyDivider =
                i > 0 &&
                entry.subLevel === '' &&
                allRanks[i - 1].subLevel !== '';

              return (
                <View key={`${entry.fullLabel}-${entry.startDay}`}>
                  {showYearlyDivider && (
                    <Text
                      style={[
                        styles.yearlyDividerLabel,
                        {
                          color: textSecColor,
                          marginTop: spacing.lg,
                          marginBottom: spacing.sm,
                        },
                      ]}
                    >
                      LEGENDARY TIER (1+ YEAR)
                    </Text>
                  )}
                  <View
                    style={[
                      styles.rankRow,
                      { opacity },
                      isCurrent && {
                        backgroundColor: currentRowBg,
                        borderRadius: 10,
                        paddingHorizontal: 8,
                      },
                      i < allRanks.length - 1 && !showYearlyDivider && styles.rankRowBorder,
                    ]}
                  >
                    {/* Status indicator */}
                    <View style={styles.statusCol}>
                      {renderStatusIndicator(status)}
                    </View>

                    {/* Emoji */}
                    <Text style={styles.rankRowEmoji}>{entry.emoji}</Text>

                    {/* Name + day range */}
                    <View style={styles.rankRowInfo}>
                      <Text style={[styles.rankRowName, { color: textColor }]}>
                        {entry.fullLabel}
                      </Text>
                      <Text
                        style={[styles.rankRowRange, { color: textSecColor }]}
                      >
                        {dayRangeText}
                      </Text>
                    </View>

                    {/* YOU badge */}
                    {isCurrent && (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeText}>YOU</Text>
                      </View>
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
  headerTitle: {
    ...typography.h3,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    paddingTop: spacing.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  // Current rank card
  currentRankCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(91, 154, 168, 0.4)',
  },
  currentRankEmoji: {
    fontSize: 40,
    marginBottom: spacing.xs,
  },
  currentRankLabel: {
    ...typography.h2,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  currentRankDays: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  // Next rank card
  nextRankCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nextRankLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  nextRankEmoji: {
    fontSize: 28,
    marginRight: spacing.sm,
  },
  nextRankInfo: {
    flex: 1,
  },
  nextRankLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  nextRankDays: {
    fontSize: 13,
    fontWeight: '400',
  },
  topReachedText: {
    fontSize: 15,
    fontStyle: 'italic',
    textAlign: 'center',
    flex: 1,
  },
  // All ranks list
  allRanksCard: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  rankRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  statusCol: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  dotCurrent: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  dotFuture: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(107, 114, 128, 0.3)',
  },
  rankRowEmoji: {
    fontSize: 20,
    marginRight: spacing.sm,
    width: 28,
    textAlign: 'center',
  },
  rankRowInfo: {
    flex: 1,
  },
  rankRowName: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 1,
  },
  rankRowRange: {
    fontSize: 12,
    fontWeight: '400',
  },
  youBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: spacing.xs,
  },
  youBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  yearlyDividerLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});

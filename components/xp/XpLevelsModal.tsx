/**
 * XpLevelsModal
 *
 * Shows all XP levels with progress context:
 * - Completed levels (< currentLevel)
 * - Current level with real progress bar
 * - Next level with exact XP to unlock
 * - Future levels as "Coming up"
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
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';

interface XpLevelsModalProps {
  visible: boolean;
  onClose: () => void;
  currentLevel: number;
  xpInCurrentLevel: number;
  xpNeededForNextLevel: number;
  totalXp: number;
}

type LevelStatus = 'completed' | 'current' | 'next' | 'future';

interface LevelRow {
  level: number;
  status: LevelStatus;
}

export default function XpLevelsModal({
  visible,
  onClose,
  currentLevel,
  xpInCurrentLevel,
  xpNeededForNextLevel,
  totalXp,
}: XpLevelsModalProps) {
  const isDark = useColorScheme() === 'dark';

  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const textSecColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const modalBg = isDark ? colors.backgroundDark : colors.background;
  const trackColor = isDark ? '#3A3C52' : '#E5E7EB';

  const xpToNext = Math.max(0, xpNeededForNextLevel - xpInCurrentLevel);
  const progressPercent = xpNeededForNextLevel > 0
    ? Math.min(100, Math.round((xpInCurrentLevel / xpNeededForNextLevel) * 100))
    : 0;
  const nextLevel = currentLevel + 1;

  // Pre-compute display strings
  const headerSubtitle = 'Level ' + String(currentLevel) + ' — ' + Number(totalXp).toLocaleString() + ' XP total';
  const currentProgressText = Number(xpInCurrentLevel).toLocaleString() + ' / ' + Number(xpNeededForNextLevel).toLocaleString() + ' XP';
  const xpToGoText = Number(xpToNext).toLocaleString() + ' XP to go';
  const progressPercentText = String(progressPercent) + '%';
  const progressBarWidth = progressPercent + '%';

  // Build level rows
  const FUTURE_COUNT = 5;
  const maxLevel = currentLevel + FUTURE_COUNT;

  // Determine which completed levels to show
  const COLLAPSE_THRESHOLD = 10;
  const SHOW_LAST_COMPLETED = 5;

  function buildRows(): LevelRow[] {
    const rows: LevelRow[] = [];
    for (let lvl = 1; lvl <= maxLevel; lvl++) {
      if (lvl < currentLevel) {
        rows.push({ level: lvl, status: 'completed' });
      } else if (lvl === currentLevel) {
        rows.push({ level: lvl, status: 'current' });
      } else if (lvl === currentLevel + 1) {
        rows.push({ level: lvl, status: 'next' });
      } else {
        rows.push({ level: lvl, status: 'future' });
      }
    }
    return rows;
  }

  const allRows = buildRows();

  // Collapse old completed levels if currentLevel > COLLAPSE_THRESHOLD
  const shouldCollapse = currentLevel > COLLAPSE_THRESHOLD;
  const collapseUpTo = currentLevel - SHOW_LAST_COMPLETED - 1; // last collapsed level index (1-based)

  // Rows to actually render
  const visibleRows = shouldCollapse
    ? allRows.filter((r) => r.level > collapseUpTo || r.status !== 'completed')
    : allRows;

  const collapsedCount = shouldCollapse ? collapseUpTo : 0;
  const collapsedLabel =
    collapsedCount > 0
      ? 'Level 1 – Level ' + String(collapsedCount) + ' ✓ all completed'
      : null;

  function renderStatusIcon(status: LevelStatus, level: number) {
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
      return (
        <View style={styles.dotCurrent} />
      );
    }
    // next or future
    return (
      <View style={styles.dotFuture} />
    );
  }

  function renderLevelRow(row: LevelRow, index: number, isLast: boolean) {
    const { level, status } = row;
    const isCurrent = status === 'current';
    const isCompleted = status === 'completed';

    const rowOpacity = isCompleted ? 0.55 : 1;
    const currentRowBg = isDark
      ? 'rgba(91, 154, 168, 0.15)'
      : 'rgba(91, 154, 168, 0.08)';

    const levelLabel = 'Level ' + String(level);

    let statusText = '';
    if (status === 'completed') {
      statusText = 'Completed';
    } else if (status === 'next') {
      statusText = 'Next — ' + Number(xpToNext).toLocaleString() + ' XP to unlock';
    } else if (status === 'future') {
      statusText = 'Coming up';
    }

    return (
      <View
        key={level}
        style={[
          styles.levelRow,
          { opacity: rowOpacity },
          isCurrent && {
            backgroundColor: currentRowBg,
            borderRadius: 10,
            paddingHorizontal: 8,
          },
          !isLast && !isCurrent && styles.levelRowBorder,
        ]}
      >
        {/* Status icon */}
        <View style={styles.statusCol}>
          {renderStatusIcon(status, level)}
        </View>

        {/* Level info */}
        <View style={styles.levelInfo}>
          {/* Level name row */}
          <View style={styles.levelNameRow}>
            <Text style={[styles.levelLabel, { color: textColor }]}>
              {levelLabel}
            </Text>
            {isCurrent && (
              <View style={styles.youBadge}>
                <Text style={styles.youBadgeText}>
                  ★ YOU
                </Text>
              </View>
            )}
          </View>

          {/* Current level: XP progress + bar */}
          {isCurrent && (
            <View style={styles.currentLevelDetail}>
              <Text style={[styles.currentXpText, { color: textSecColor }]}>
                {currentProgressText}
              </Text>
              {/* Mini progress bar */}
              <View style={[styles.miniBarBg, { backgroundColor: trackColor }]}>
                <View
                  style={[
                    styles.miniBarFill,
                    {
                      width: progressBarWidth as `${number}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          {/* Completed / next / future status text */}
          {!isCurrent && (
            <Text
              style={[
                styles.statusText,
                {
                  color: status === 'next' ? colors.primary : textSecColor,
                },
              ]}
            >
              {statusText}
            </Text>
          )}
        </View>

        {/* Right: percent for current */}
        {isCurrent && (
          <Text style={[styles.percentText, { color: colors.primary }]}>
            {progressPercentText}
          </Text>
        )}
      </View>
    );
  }

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
              console.log('[XpLevelsModal] Close button pressed');
              onClose();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol name="xmark" size={20} color={textColor} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: textColor }]}>
              📈 XP Levels
            </Text>
            <Text style={[styles.headerSubtitle, { color: textSecColor }]}>
              {headerSubtitle}
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
          {/* ── Current Level Hero Card ── */}
          <Text style={[styles.sectionLabel, { color: textSecColor }]}>
            CURRENT LEVEL
          </Text>
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: cardBg,
                borderColor: colors.primary,
              },
            ]}
          >
            <Text style={[styles.heroLevelText, { color: textColor }]}>
              {'★ LEVEL ' + String(currentLevel)}
            </Text>
            <Text style={[styles.heroProgressLabel, { color: textSecColor }]}>
              {'Progress to Level ' + String(nextLevel)}
            </Text>
            {/* Progress bar */}
            <View style={[styles.heroBarBg, { backgroundColor: trackColor }]}>
              <View
                style={[
                  styles.heroBarFill,
                  {
                    width: progressBarWidth as `${number}%`,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            </View>
            {/* Bar labels row */}
            <View style={styles.heroBarLabels}>
              <Text style={[styles.heroBarPercent, { color: colors.primary }]}>
                {progressPercentText}
              </Text>
              <Text style={[styles.heroBarXpToGo, { color: textSecColor }]}>
                {xpToGoText}
              </Text>
            </View>
          </View>

          {/* ── All Levels ── */}
          <Text
            style={[
              styles.sectionLabel,
              { color: textSecColor, marginTop: spacing.md },
            ]}
          >
            ALL LEVELS
          </Text>

          <View style={[styles.allLevelsCard, { backgroundColor: cardBg }]}>
            {/* Collapsed earlier levels banner */}
            {collapsedLabel !== null && (
              <View style={[styles.collapsedBanner, { borderBottomColor: isDark ? '#3A3C52' : '#E5E7EB' }]}>
                <IconSymbol
                  name="checkmark.circle.fill"
                  size={16}
                  color={colors.success}
                />
                <Text style={[styles.collapsedText, { color: textSecColor }]}>
                  {'Earlier levels: ' + collapsedLabel}
                </Text>
              </View>
            )}

            {visibleRows.map((row, i) => {
              const isLast = i === visibleRows.length - 1;
              return renderLevelRow(row, i, isLast);
            })}
          </View>

          {/* Footer hint */}
          <Text style={[styles.footerHint, { color: textSecColor }]}>
            …keep tracking to climb higher
          </Text>
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
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },

  // ── Hero card ──
  heroCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 2,
  },
  heroLevelText: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  heroProgressLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  heroBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  heroBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  heroBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  heroBarPercent: {
    fontSize: 13,
    fontWeight: '700',
  },
  heroBarXpToGo: {
    fontSize: 13,
    fontWeight: '400',
  },

  // ── All levels list ──
  allLevelsCard: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  collapsedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 2,
  },
  collapsedText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  levelRowBorder: {
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
    backgroundColor: colors.primary,
  },
  dotFuture: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(107, 114, 128, 0.3)',
  },
  levelInfo: {
    flex: 1,
  },
  levelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  youBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  youBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  currentLevelDetail: {
    marginTop: 4,
    gap: 4,
  },
  currentXpText: {
    fontSize: 12,
    fontWeight: '500',
  },
  miniBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
  percentText: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: spacing.sm,
  },

  // ── Footer ──
  footerHint: {
    textAlign: 'center',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});

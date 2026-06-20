/**
 * TodaysChallengesCard
 *
 * Unified card replacing TodaysXpBreakdown + TodaysMissionsCard nutrition section.
 * Shows 5 compact horizontally-scrollable challenge tiles:
 *   Weight Check-in | Protein | Calories | Steps | Workout
 *
 * Tapping any tile opens a bottom-sheet with full tier breakdown.
 * Data comes from useXpStatus → status.todays_challenges (backend field).
 * Falls back gracefully when the field is not yet present.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, spacing } from '@/styles/commonStyles';
import { toLocalDateString } from '@/utils/dateUtils';
import { awardXp } from '@/utils/xpApi';
import { emitXpRefresh } from '@/utils/xpEvents';
import type { ChallengeCard, ChallengeTier, XpStatus } from '@/types/xp';

// ─── Types ────────────────────────────────────────────────────────────────────

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  status: XpStatus | null;
  isDark: boolean;
  localSteps: number | null;
  onRefresh?: () => void;
}

// ─── Fallback skeleton cards when backend hasn't returned todays_challenges ───

const FALLBACK_TYPES: ChallengeCard['challenge_type'][] = [
  'weight_checkin',
  'protein_goal',
  'calorie_goal',
  'steps',
  'workout',
];

const FALLBACK_LABELS: Record<ChallengeCard['challenge_type'], string> = {
  weight_checkin: 'Weight',
  protein_goal: 'Protein',
  calorie_goal: 'Calories',
  steps: 'Steps',
  workout: 'Workout',
};

const FALLBACK_ICONS: Record<ChallengeCard['challenge_type'], IoniconsName> = {
  weight_checkin: 'scale-outline',
  protein_goal: 'fitness-outline',
  calorie_goal: 'pie-chart-outline',
  steps: 'walk-outline',
  workout: 'barbell-outline',
};

function buildFallbackCards(): ChallengeCard[] {
  return FALLBACK_TYPES.map((t) => ({
    challenge_type: t,
    label: FALLBACK_LABELS[t],
    icon: FALLBACK_ICONS[t],
    current_value: 0,
    goal_value: 0,
    progress_percent: 0,
    current_tier: 0,
    current_xp_earned: 0,
    max_xp: 0,
    tiers: [],
  }));
}

// ─── Animated percentage number ───────────────────────────────────────────────

function AnimatedPercent({
  value,
  isDark,
  isComplete,
}: {
  value: number;
  isDark: boolean;
  isComplete: boolean;
}) {
  const animVal = useRef(new Animated.Value(value)).current;
  const [displayed, setDisplayed] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    if (Math.abs(value - prevValue.current) < 1) {
      setDisplayed(value);
      return;
    }
    prevValue.current = value;
    Animated.spring(animVal, {
      toValue: value,
      useNativeDriver: false,
      tension: 80,
      friction: 10,
    }).start();
    const id = animVal.addListener(({ value: v }) => setDisplayed(Math.round(v)));
    return () => animVal.removeListener(id);
  }, [value, animVal]);

  const percentText = String(Math.round(displayed)) + '%';
  const textColor = isComplete
    ? colors.success
    : isDark
    ? colors.textDark
    : colors.primaryText;

  return (
    <Text style={[styles.percentText, { color: textColor }]}>{percentText}</Text>
  );
}

// ─── Single compact tile ──────────────────────────────────────────────────────

function CompactTile({
  card,
  isDark,
  onPress,
}: {
  card: ChallengeCard;
  isDark: boolean;
  onPress: () => void;
}) {
  const isComplete = card.progress_percent >= 100;
  const hasProgress = card.progress_percent > 0;

  const iconName = (card.icon || FALLBACK_ICONS[card.challenge_type]) as IoniconsName;

  const bgColor = isComplete
    ? isDark
      ? 'rgba(92,185,123,0.15)'
      : 'rgba(92,185,123,0.08)'
    : hasProgress
    ? isDark
      ? 'rgba(91,154,168,0.12)'
      : 'rgba(91,154,168,0.06)'
    : isDark
    ? colors.cardDark
    : colors.card;

  const borderColor = isComplete
    ? isDark
      ? 'rgba(92,185,123,0.4)'
      : 'rgba(92,185,123,0.3)'
    : isDark
    ? colors.cardBorderDark
    : colors.cardBorder;

  const iconBg = isComplete
    ? isDark
      ? 'rgba(92,185,123,0.25)'
      : 'rgba(92,185,123,0.15)'
    : hasProgress
    ? isDark
      ? 'rgba(91,154,168,0.2)'
      : 'rgba(91,154,168,0.12)'
    : isDark
    ? 'rgba(255,255,255,0.06)'
    : 'rgba(0,0,0,0.05)';

  const iconColor = isComplete
    ? colors.success
    : hasProgress
    ? colors.primary
    : isDark
    ? colors.textSecondaryDark
    : colors.textSecondary;

  const xpLabel = card.current_xp_earned > 0
    ? '+' + card.current_xp_earned + 'XP'
    : card.max_xp > 0
    ? '+' + card.max_xp + 'XP'
    : '—';

  const xpColor = isComplete
    ? colors.success
    : card.current_xp_earned > 0
    ? colors.primary
    : isDark
    ? colors.textSecondaryDark
    : colors.textSecondary;

  const shortLabel = FALLBACK_LABELS[card.challenge_type] ?? card.label;

  return (
    <TouchableOpacity
      onPress={() => {
        console.log('[TodaysChallengesCard] tile pressed:', card.challenge_type, 'progress:', card.progress_percent + '%');
        onPress();
      }}
      activeOpacity={0.75}
      style={[
        styles.tile,
        {
          backgroundColor: bgColor,
          borderColor,
        },
      ]}
    >
      {/* Icon area */}
      <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={18} color={iconColor} />
        {isComplete && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={9} color="#fff" />
          </View>
        )}
      </View>

      {/* Label */}
      <Text
        style={[
          styles.tileLabel,
          { color: isDark ? colors.textSecondaryDark : colors.textSecondary },
        ]}
        numberOfLines={1}
      >
        {shortLabel}
      </Text>

      {/* Big % */}
      <AnimatedPercent
        value={Math.min(100, Math.max(0, card.progress_percent))}
        isDark={isDark}
        isComplete={isComplete}
      />

      {/* XP value */}
      <Text style={[styles.xpLabel, { color: xpColor }]} numberOfLines={1}>{xpLabel}</Text>
    </TouchableOpacity>
  );
}

// ─── Tier row inside bottom sheet ─────────────────────────────────────────────

function TierRow({
  tier,
  isNext,
  isDark,
}: {
  tier: ChallengeTier;
  isNext: boolean;
  isDark: boolean;
}) {
  const dotColor = tier.reached
    ? colors.success
    : isNext
    ? colors.warning
    : isDark
    ? colors.textSecondaryDark
    : colors.textSecondary;

  const rowBg = isNext
    ? isDark
      ? 'rgba(255,138,91,0.1)'
      : 'rgba(255,138,91,0.07)'
    : 'transparent';

  const labelColor = tier.reached
    ? isDark
      ? colors.textDark
      : colors.primaryText
    : isNext
    ? colors.warning
    : isDark
    ? colors.textSecondaryDark
    : colors.textSecondary;

  const xpColor = tier.reached
    ? colors.success
    : isNext
    ? colors.warning
    : isDark
    ? colors.textSecondaryDark
    : colors.textSecondary;

  const iconName: IoniconsName = tier.reached
    ? 'checkmark-circle'
    : isNext
    ? 'flag'
    : 'ellipse-outline';

  return (
    <View style={[styles.tierRow, { backgroundColor: rowBg }]}>
      <Ionicons name={iconName} size={18} color={dotColor} style={styles.tierIcon} />
      <Text style={[styles.tierLabel, { color: labelColor }]} numberOfLines={1}>
        {tier.threshold_label}
      </Text>
      <Text style={[styles.tierXp, { color: xpColor }]}>
        {'+' + tier.xp_reward + ' XP'}
      </Text>
    </View>
  );
}

// ─── Bottom sheet detail modal ────────────────────────────────────────────────

function DetailSheet({
  card,
  isDark,
  visible,
  onClose,
  onLogWeight,
  xpConfig,
}: {
  card: ChallengeCard | null;
  isDark: boolean;
  visible: boolean;
  onClose: () => void;
  onLogWeight: () => void;
  xpConfig?: Record<string, number>;
}) {
  if (!card) return null;

  const iconName = (card.icon || FALLBACK_ICONS[card.challenge_type]) as IoniconsName;
  const isComplete = card.progress_percent >= 100;
  const isWeightCheckin = card.challenge_type === 'weight_checkin';

  // Find next unreached tier index
  const nextTierIndex = card.tiers.findIndex((t) => !t.reached);

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : '#fff';
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const dividerColor = isDark ? colors.borderDark : colors.border;

  // Build "current / next" summary line
  const currentValueLabel = card.current_value > 0
    ? String(Math.round(card.current_value))
    : '0';

  const nextTier = nextTierIndex >= 0 ? card.tiers[nextTierIndex] : null;
  const toNextLabel = nextTier
    ? String(Math.max(0, Math.round(nextTier.threshold_value - card.current_value))) +
      ' more to reach next tier'
    : isComplete
    ? 'All tiers complete!'
    : '';

  const shortLabel = FALLBACK_LABELS[card.challenge_type] ?? card.label;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <Pressable
          style={[styles.sheetContainer, { backgroundColor: cardBg }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Handle bar */}
          <View style={[styles.sheetHandle, { backgroundColor: dividerColor }]} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderLeft}>
              <View
                style={[
                  styles.sheetIconCircle,
                  {
                    backgroundColor: isComplete
                      ? 'rgba(92,185,123,0.15)'
                      : 'rgba(91,154,168,0.12)',
                  },
                ]}
              >
                <Ionicons
                  name={iconName}
                  size={22}
                  color={isComplete ? colors.success : colors.primary}
                />
              </View>
              <Text style={[styles.sheetTitle, { color: textColor }]}>{shortLabel}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                console.log('[TodaysChallengesCard] detail sheet closed for:', card.challenge_type);
                onClose();
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name="close-circle"
                size={26}
                color={isDark ? colors.textSecondaryDark : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Subtitle */}
          <Text style={[styles.sheetSubtitle, { color: subColor }]}>
            How to earn XP today
          </Text>
          <View style={[styles.divider, { backgroundColor: dividerColor }]} />

          {/* Tier rows */}
          {card.tiers.length === 0 ? (
            <Text style={[styles.emptyTiers, { color: subColor }]}>
              Tier data loading…
            </Text>
          ) : (
            card.tiers.map((tier, idx) => (
              <TierRow
                key={tier.tier}
                tier={tier}
                isNext={idx === nextTierIndex}
                isDark={isDark}
              />
            ))
          )}

          {/* Current value summary */}
          {card.current_value > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: dividerColor, marginTop: spacing.md }]} />
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: subColor }]}>
                  {'Current: ' + currentValueLabel + (card.challenge_type === 'steps' ? ' steps' : '')}
                </Text>
                {toNextLabel.length > 0 && (
                  <Text style={[styles.summaryHint, { color: subColor }]}>{toNextLabel}</Text>
                )}
              </View>
            </>
          )}

          {/* Weight check-in CTA */}
          {isWeightCheckin && !isComplete && (
            <TouchableOpacity
              style={[styles.ctaButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                console.log('[TodaysChallengesCard] Log Weight Now pressed — navigating to check-in-form');
                onClose();
                onLogWeight();
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="scale-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.ctaButtonText}>Log Weight Now</Text>
            </TouchableOpacity>
          )}

          {/* Weight XP hint when not done */}
          {isWeightCheckin && !isComplete && (
            <View style={styles.weightHintRow}>
              <View style={styles.weightHintItem}>
                <Ionicons name="scale-outline" size={14} color={subColor} />
                <Text style={[styles.weightHintText, { color: subColor }]}>
                  {'Weight only  +' + (xpConfig?.['weight_checkin'] ?? 50) + ' XP'}
                </Text>
              </View>
              <View style={styles.weightHintItem}>
                <Ionicons name="camera-outline" size={14} color={colors.primary} />
                <Text style={[styles.weightHintText, { color: colors.primary }]}>
                  {'Weight + Photo  +' + ((xpConfig?.['weight_checkin'] ?? 50) + (xpConfig?.['progress_photo'] ?? 50)) + ' XP'}
                </Text>
              </View>
            </View>
          )}

          {/* Bottom safe area padding */}
          <View style={{ height: Platform.OS === 'ios' ? 32 : 16 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export default function TodaysChallengesCard({
  status,
  isDark,
  localSteps,
  onRefresh,
}: Props) {
  const router = useRouter();
  const [selectedCard, setSelectedCard] = useState<ChallengeCard | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  // Steps XP sync — debounced, fires when local steps meaningfully exceed backend value
  const lastSyncedSteps = useRef<number>(0);

  useEffect(() => {
    if (localSteps === null || localSteps <= 0) return;

    const backendCard = status?.todays_challenges?.find(
      (c) => c.challenge_type === 'steps',
    );
    const backendSteps = backendCard?.current_value ?? 0;

    const delta = localSteps - Math.max(backendSteps, lastSyncedSteps.current);
    if (delta < 500) return; // debounce — only sync on meaningful change

    const today = toLocalDateString(new Date());
    console.log('[TodaysChallengesCard] syncing steps to backend — local:', localSteps, 'backend:', backendSteps, 'delta:', delta);
    lastSyncedSteps.current = localSteps;

    awardXp({
      event_type: 'steps',
      source_id: today,
      metadata: { steps_count: localSteps },
    })
      .then((result) => {
        console.log('[TodaysChallengesCard] steps XP awarded:', result.awarded, 'total today:', result.xp_today);
        if (result.awarded > 0) {
          emitXpRefresh();
          onRefresh?.();
        }
      })
      .catch((err) =>
        console.warn('[TodaysChallengesCard] steps award failed (non-fatal):', err?.message ?? err),
      );
  }, [localSteps, status?.todays_challenges, onRefresh]);

  // Build display cards — prefer backend data, fall back to skeleton
  const rawCards: ChallengeCard[] = status?.todays_challenges ?? buildFallbackCards();

  // Ensure order: weight, protein, calories, steps, workout
  const ORDER: ChallengeCard['challenge_type'][] = [
    'weight_checkin',
    'protein_goal',
    'calorie_goal',
    'steps',
    'workout',
  ];

  const cards: ChallengeCard[] = ORDER.map((type) => {
    const found = rawCards.find((c) => c.challenge_type === type);
    if (found) {
      // Optimistically show local steps if higher than backend
      if (type === 'steps' && localSteps !== null && localSteps > found.current_value) {
        const optimisticPct = found.goal_value > 0
          ? Math.min(100, Math.round((localSteps / found.goal_value) * 100))
          : found.progress_percent;
        return { ...found, current_value: localSteps, progress_percent: optimisticPct };
      }
      return found;
    }
    return {
      challenge_type: type,
      label: FALLBACK_LABELS[type],
      icon: FALLBACK_ICONS[type],
      current_value: 0,
      goal_value: 0,
      progress_percent: 0,
      current_tier: 0,
      current_xp_earned: 0,
      max_xp: 0,
      tiers: [],
    };
  });

  const doneCount = cards.filter((c) => c.progress_percent >= 100).length;

  const openSheet = useCallback((card: ChallengeCard) => {
    console.log('[TodaysChallengesCard] opening detail sheet for:', card.challenge_type);
    setSelectedCard(card);
    setSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => {
    console.log('[TodaysChallengesCard] closing detail sheet');
    setSheetVisible(false);
  }, []);

  const handleLogWeight = useCallback(() => {
    console.log('[TodaysChallengesCard] navigating to check-in-form for weight log');
    router.push('/check-in-form');
  }, [router]);

  const bgColor = isDark ? colors.cardDark : '#fff';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const doneText = String(doneCount) + ' of 5 done';

  return (
    <View style={[styles.card, { backgroundColor: bgColor, borderColor }]}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: textColor }]}>Today's Challenges</Text>
        <View style={[styles.doneBadge, { backgroundColor: doneCount > 0 ? 'rgba(91,154,168,0.12)' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
          <Text style={[styles.doneText, { color: doneCount > 0 ? colors.primary : subColor }]}>
            {doneText}
          </Text>
        </View>
      </View>

      {/* Fixed 5-column tile row */}
      <View style={styles.tileRow}>
        {cards.map((card) => (
          <CompactTile
            key={card.challenge_type}
            card={card}
            isDark={isDark}
            onPress={() => openSheet(card)}
          />
        ))}
      </View>

      {/* Detail bottom sheet */}
      <DetailSheet
        card={selectedCard}
        isDark={isDark}
        visible={sheetVisible}
        onClose={closeSheet}
        onLogWeight={handleLogWeight}
        xpConfig={status?.xp_config}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  doneBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  doneText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tileRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: 4,
  },

  // ── Compact tile ──
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 4,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  checkBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  tileLabel: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  percentText: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 20,
  },
  xpLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Bottom sheet ──
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sheetIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sheetSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    marginBottom: spacing.sm,
  },
  emptyTiers: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  // ── Tier row ──
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: 2,
  },
  tierIcon: {
    marginRight: spacing.sm,
  },
  tierLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  tierXp: {
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Summary ──
  summaryRow: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    gap: 2,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  summaryHint: {
    fontSize: 12,
  },

  // ── Weight CTA ──
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    paddingVertical: 13,
    marginTop: spacing.md,
    marginHorizontal: spacing.sm,
  },
  ctaButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  weightHintRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  weightHintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weightHintText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

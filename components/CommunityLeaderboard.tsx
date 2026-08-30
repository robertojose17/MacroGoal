import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { fetchLeaderboard, type LeaderboardEntry, type LeaderboardResponse, type LeaderboardPeriod } from '@/utils/leaderboardApi';
import { Trophy } from 'lucide-react-native';
import { toLocalDateString } from '@/utils/dateUtils';
import { useTranslation } from 'react-i18next';

type Tab = 'steps';

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function formatShortDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function SkeletonLine({ width, height = 13, isDark }: { width: number | string; height?: number; isDark: boolean }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shimmer = isDark ? '#3A3C52' : '#D4D6DA';
  return (
    <Animated.View
      style={{ width, height, borderRadius: height / 2, backgroundColor: shimmer, opacity }}
    />
  );
}

function LeaderboardRow({
  entry,
  unit,
  isDark,
  isLast,
}: {
  entry: LeaderboardEntry;
  unit: string;
  isDark: boolean;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const medal = MEDAL[entry.rank];
  const rankLabel = medal ?? String(entry.rank);
  const valueFormatted = entry.totalValue.toLocaleString('en-US');
  const youSuffix = entry.isYou ? ` · ${t('leaderboard.you')}` : '';
  const rowBg = entry.isYou
    ? isDark
      ? colors.primary + '22'
      : colors.primary + '14'
    : 'transparent';

  return (
    <View
      style={[
        styles.leaderRow,
        { backgroundColor: rowBg },
        !isLast && { borderBottomWidth: 1, borderBottomColor: isDark ? colors.borderDark : colors.border },
      ]}
    >
      <Text style={[styles.rankText, { color: medal ? undefined : subColor, fontSize: medal ? 18 : 14 }]}>
        {rankLabel}
      </Text>
      <View style={styles.leaderNameCol}>
        <Text style={[styles.leaderName, { color: textColor }]} numberOfLines={1}>
          {entry.username}
          {youSuffix ? (
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{youSuffix}</Text>
          ) : null}
        </Text>
      </View>
      <Text style={[styles.leaderValue, { color: entry.isYou ? colors.primary : textColor }]}>
        {valueFormatted}
        {unit ? <Text style={[styles.leaderUnit, { color: subColor }]}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

interface CommunityLeaderboardProps {
  isDark: boolean;
  refreshKey?: number;
}

export function CommunityLeaderboard({ isDark, refreshKey }: CommunityLeaderboardProps) {
  const { t } = useTranslation();

  const [stepsData, setStepsData] = useState<LeaderboardResponse | null>(null);
  const [loadingSteps, setLoadingSteps] = useState(true);

  // Period selector state
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);
  const [showPeriodSheet, setShowPeriodSheet] = useState(false);
  const [showCustomSheet, setShowCustomSheet] = useState(false);

  // Custom range picker temp state
  const [tempStart, setTempStart] = useState<Date>(new Date());
  const [tempEnd, setTempEnd] = useState<Date>(new Date());
  const [customDateError, setCustomDateError] = useState<string | null>(null);

  // Android date picker visibility
  const [showAndroidStart, setShowAndroidStart] = useState(false);
  const [showAndroidEnd, setShowAndroidEnd] = useState(false);

  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const sheetBg = isDark ? '#1E2035' : '#FFFFFF';
  const sheetBorder = isDark ? colors.borderDark : colors.border;

  const PERIOD_OPTIONS: { value: LeaderboardPeriod; label: string }[] = [
    { value: 'today', label: t('leaderboard.periodToday') },
    { value: 'week', label: t('leaderboard.periodThisWeek') },
    { value: 'month', label: t('leaderboard.periodThisMonth') },
    { value: 'last30', label: t('leaderboard.periodLast30') },
    { value: 'custom', label: t('leaderboard.periodCustom') },
  ];

  const getPeriodLabel = (
    p: LeaderboardPeriod,
    cs: Date | null,
    ce: Date | null,
  ): string => {
    switch (p) {
      case 'today': return t('leaderboard.periodToday');
      case 'week': return t('leaderboard.periodThisWeek');
      case 'month': return t('leaderboard.periodThisMonth');
      case 'last30': return t('leaderboard.periodLast30');
      case 'custom':
        if (cs && ce) {
          return `${formatShortDate(cs)} – ${formatShortDate(ce)}`;
        }
        return t('leaderboard.periodCustomRange');
      default: return t('leaderboard.periodThisWeek');
    }
  };

  const loadTab = useCallback(async (p: LeaderboardPeriod, cs: Date | null, ce: Date | null) => {
    console.log('[CommunityLeaderboard] Loading steps leaderboard, period:', p);
    const startStr = cs ? toLocalDateString(cs) : undefined;
    const endStr = ce ? toLocalDateString(ce) : undefined;

    setLoadingSteps(true);
    try {
      const data = await fetchLeaderboard('steps', p, startStr, endStr);
      setStepsData(data);
    } catch (err) {
      console.warn('[CommunityLeaderboard] loadTab steps error:', err);
    } finally {
      setLoadingSteps(false);
    }
  }, []);

  const loadAll = useCallback(() => {
    loadTab(period, customStart, customEnd);
  }, [loadTab, period, customStart, customEnd]);

  useEffect(() => {
    loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, period, customStart, customEnd]);

  const handlePeriodButtonPress = () => {
    console.log('[CommunityLeaderboard] Period selector opened');
    setShowPeriodSheet(true);
  };

  const handlePeriodSelect = (selected: LeaderboardPeriod) => {
    console.log('[CommunityLeaderboard] Period selected:', selected);
    if (selected === 'custom') {
      setShowPeriodSheet(false);
      // Default: last 7 days
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      setTempStart(start);
      setTempEnd(end);
      setCustomDateError(null);
      setShowCustomSheet(true);
    } else {
      setPeriod(selected);
      setShowPeriodSheet(false);
    }
  };

  const handleCustomApply = () => {
    console.log('[CommunityLeaderboard] Custom range apply pressed:', toLocalDateString(tempStart), toLocalDateString(tempEnd));
    if (tempStart > tempEnd) {
      setCustomDateError(t('leaderboard.dateErrorStartBeforeEnd'));
      return;
    }
    setCustomStart(tempStart);
    setCustomEnd(tempEnd);
    setPeriod('custom');
    setShowCustomSheet(false);
  };

  const handleCustomCancel = () => {
    console.log('[CommunityLeaderboard] Custom range cancelled');
    setShowCustomSheet(false);
  };

  const activeData = stepsData;
  const isLoading = loadingSteps;
  const unit = t('leaderboard.stepsUnit');

  const top5 = activeData?.leaderboard.slice(0, 5) ?? [];
  const userEntry = activeData?.leaderboard.find((e) => e.isYou);
  const userInTop5 = top5.some((e) => e.isYou);
  const showUserRow = userEntry && !userInTop5;

  const periodLabel = getPeriodLabel(period, customStart, customEnd);

  return (
    <View style={[styles.container, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Trophy size={18} color={colors.warning} strokeWidth={2} />
          <Text style={[styles.title, { color: textColor }]}>{t('leaderboard.title')}</Text>
        </View>
        <TouchableOpacity
          onPress={handlePeriodButtonPress}
          style={[styles.periodButton, { backgroundColor: isDark ? '#2A2C42' : '#EAECF2' }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.periodButtonText, { color: colors.primary }]}>{periodLabel}</Text>
          <Ionicons name="chevron-down" size={12} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <SkeletonLine width={24} height={20} isDark={isDark} />
              <SkeletonLine width="45%" isDark={isDark} />
              <SkeletonLine width="25%" isDark={isDark} />
            </View>
          ))}
        </View>
      ) : top5.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: textColor }]}>{t('leaderboard.noDataTitle')}</Text>
          <Text style={[styles.emptySub, { color: subColor }]}>
            {t('leaderboard.noDataSubtitle')}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {top5.map((entry, idx) => (
            <LeaderboardRow
              key={entry.userId}
              entry={entry}
              unit={unit}
              isDark={isDark}
              isLast={idx === top5.length - 1 && !showUserRow}
            />
          ))}
          {showUserRow && userEntry ? (
            <>
              <View style={[styles.ellipsisRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}>
                <Text style={[styles.ellipsisText, { color: subColor }]}>· · ·</Text>
              </View>
              <LeaderboardRow
                entry={userEntry}
                unit={unit}
                isDark={isDark}
                isLast
              />
            </>
          ) : null}
        </View>
      )}

      {/* Period Selector Sheet */}
      <Modal
        visible={showPeriodSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPeriodSheet(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setShowPeriodSheet(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.sheet, { backgroundColor: sheetBg }]}
            onPress={() => {/* prevent overlay close */}}
          >
            <View style={[styles.dragHandle, { backgroundColor: isDark ? '#4A4C62' : '#D4D6DA' }]} />
            <Text style={[styles.sheetTitle, { color: textColor }]}>{t('leaderboard.selectPeriod')}</Text>
            {PERIOD_OPTIONS.map((opt, idx) => {
              const isSelected = period === opt.value;
              const isLast = idx === PERIOD_OPTIONS.length - 1;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => handlePeriodSelect(opt.value)}
                  style={[
                    styles.sheetOption,
                    !isLast && { borderBottomWidth: 1, borderBottomColor: sheetBorder },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sheetOptionText, { color: isSelected ? colors.primary : textColor }]}>
                    {opt.label}
                  </Text>
                  {isSelected ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Custom Range Sheet */}
      <Modal
        visible={showCustomSheet}
        transparent
        animationType="slide"
        onRequestClose={handleCustomCancel}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={handleCustomCancel}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.sheet, styles.customSheet, { backgroundColor: sheetBg }]}
            onPress={() => {/* prevent overlay close */}}
          >
            <View style={[styles.dragHandle, { backgroundColor: isDark ? '#4A4C62' : '#D4D6DA' }]} />
            <Text style={[styles.sheetTitle, { color: textColor }]}>{t('leaderboard.customRange')}</Text>

            {/* Start Date */}
            <View style={[styles.dateRow, { borderColor: sheetBorder }]}>
              <Text style={[styles.dateLabel, { color: subColor }]}>{t('leaderboard.startDate')}</Text>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={tempStart}
                  mode="date"
                  display="compact"
                  maximumDate={new Date()}
                  onChange={(_e, date) => {
                    if (date) {
                      console.log('[CommunityLeaderboard] Custom start date changed:', toLocalDateString(date));
                      setTempStart(date);
                      setCustomDateError(null);
                    }
                  }}
                  style={styles.datePicker}
                />
              ) : (
                <TouchableOpacity
                  onPress={() => setShowAndroidStart(true)}
                  style={[styles.androidDateButton, { borderColor: sheetBorder }]}
                >
                  <Text style={[styles.androidDateText, { color: textColor }]}>
                    {toLocalDateString(tempStart)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* End Date */}
            <View style={[styles.dateRow, { borderColor: sheetBorder }]}>
              <Text style={[styles.dateLabel, { color: subColor }]}>{t('leaderboard.endDate')}</Text>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={tempEnd}
                  mode="date"
                  display="compact"
                  maximumDate={new Date()}
                  onChange={(_e, date) => {
                    if (date) {
                      console.log('[CommunityLeaderboard] Custom end date changed:', toLocalDateString(date));
                      setTempEnd(date);
                      setCustomDateError(null);
                    }
                  }}
                  style={styles.datePicker}
                />
              ) : (
                <TouchableOpacity
                  onPress={() => setShowAndroidEnd(true)}
                  style={[styles.androidDateButton, { borderColor: sheetBorder }]}
                >
                  <Text style={[styles.androidDateText, { color: textColor }]}>
                    {toLocalDateString(tempEnd)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Android pickers rendered outside the row when triggered */}
            {showAndroidStart && (
              <DateTimePicker
                value={tempStart}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={(_e, date) => {
                  setShowAndroidStart(false);
                  if (date) {
                    console.log('[CommunityLeaderboard] Android start date changed:', toLocalDateString(date));
                    setTempStart(date);
                    setCustomDateError(null);
                  }
                }}
              />
            )}
            {showAndroidEnd && (
              <DateTimePicker
                value={tempEnd}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={(_e, date) => {
                  setShowAndroidEnd(false);
                  if (date) {
                    console.log('[CommunityLeaderboard] Android end date changed:', toLocalDateString(date));
                    setTempEnd(date);
                    setCustomDateError(null);
                  }
                }}
              />
            )}

            {customDateError ? (
              <Text style={styles.errorText}>{customDateError}</Text>
            ) : null}

            <View style={styles.customSheetButtons}>
              <TouchableOpacity
                onPress={handleCustomCancel}
                style={[styles.customBtn, styles.cancelBtn, { borderColor: sheetBorder }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelBtnText, { color: subColor }]}>{t('leaderboard.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCustomApply}
                style={[styles.customBtn, styles.applyBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.7}
              >
                <Text style={styles.applyBtnText}>{t('leaderboard.apply')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  periodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.full,
    padding: 3,
    gap: 2,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    paddingBottom: spacing.sm,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  rankText: {
    width: 28,
    textAlign: 'center',
    fontWeight: '700',
  },
  leaderNameCol: {
    flex: 1,
  },
  leaderName: {
    fontSize: 14,
    fontWeight: '600',
  },
  leaderValue: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  leaderUnit: {
    fontSize: 11,
    fontWeight: '400',
  },
  ellipsisRow: {
    alignItems: 'center',
    paddingVertical: 4,
    borderTopWidth: 1,
  },
  ellipsisText: {
    fontSize: 14,
    letterSpacing: 4,
  },
  skeletonList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: 12,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  customSheet: {
    paddingBottom: 40,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  sheetOptionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  datePicker: {
    height: 36,
  },
  androidDateButton: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  androidDateText: {
    fontSize: 14,
    fontWeight: '500',
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    marginTop: 8,
    marginBottom: 4,
  },
  customSheetButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  customBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  cancelBtn: {
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  applyBtn: {},
  applyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

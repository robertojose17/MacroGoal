
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { toLocalDateString } from '@/utils/dateUtils';
import { supabase } from '@/lib/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';
import CalendarDateRangePicker from '@/components/CalendarDateRangePicker';
import {
  calcDailyScore,
  getLabel,
  getLabelColor,
  type ScoreLabel,
} from '@/utils/consistencyMath';

interface ConsistencyScoreProps {
  userId: string;
  isDark: boolean;
  initialExpanded?: boolean;
}

interface ScoreBreakdown {
  score: number;
  label: ScoreLabel;
  totalDays: number;
  trackedDays: number;
  avgCalorieAccuracy: number;
  avgProteinAccuracy: number;
  insight: string;
  trackedToday: boolean;
}

function buildInsight(
  label: ScoreLabel,
  trackedDays: number,
  totalDays: number,
  avgCalPct: number,
  avgProtPct: number,
): string {
  if (trackedDays === 0) return 'Start logging meals to build your consistency score.';
  if (label === 'Locked In') return 'Outstanding — you\'re hitting your targets consistently.';
  if (label === 'On Track') {
    if (avgCalPct < 70) return 'Log more calories each day to push your score higher.';
    if (avgProtPct < 70) return 'Boost your protein intake to move into "Locked In" territory.';
    return `You tracked ${trackedDays} of ${totalDays} days — keep the streak going.`;
  }
  if (trackedDays < totalDays / 2) return 'Log food every day — missing days are the biggest score killer.';
  if (avgCalPct < 50) return 'Your calorie accuracy is low — try to hit closer to your daily target.';
  return 'Stay consistent with logging and hitting your macro targets.';
}

// ─── Stat tooltip modal ───────────────────────────────────────────────────────

interface StatTooltipModalProps {
  visible: boolean;
  title: string;
  explanation: string;
  isDark: boolean;
  onClose: () => void;
}

function StatTooltipModal({ visible, title, explanation, isDark, onClose }: StatTooltipModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 32,
        }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            borderRadius: 20,
            padding: 24,
            width: '100%',
            maxWidth: 340,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 10,
          }}
          onPress={() => {}}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: isDark ? '#888' : '#999',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 14, color: isDark ? '#AAA' : '#666', lineHeight: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text
            style={{
              fontSize: 15,
              color: isDark ? '#E5E5EA' : '#1C1C1E',
              lineHeight: 22,
              fontWeight: '400',
            }}
          >
            {explanation}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConsistencyScore({ userId, isDark, initialExpanded = false }: ConsistencyScoreProps) {
  const [loading, setLoading] = useState(true);
  const [scoreData, setScoreData] = useState<ScoreBreakdown | null>(null);
  const [showDetails, setShowDetails] = useState(initialExpanded);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [tooltipKey, setTooltipKey] = useState<string | null>(null);

  const [journeyStartDate, setJourneyStartDate] = useState<string | null>(null);
  const [rangeStartDate, setRangeStartDate] = useState<string | null>(null);
  const [rangeEndDate, setRangeEndDate] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      loadJourneyStartDate();
    } else {
      // No userId — nothing to load, stop the spinner
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (userId && journeyStartDate && rangeStartDate && rangeEndDate) {
      calculateConsistencyScore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, journeyStartDate, rangeStartDate, rangeEndDate]);

  const loadJourneyStartDate = useCallback(async () => {
    try {
      console.log('[ConsistencyScore] Loading journey start date for user:', userId);

      const [{ data: userData }, { data: goalData }] = await Promise.all([
        supabase.from('users').select('created_at').eq('id', userId).maybeSingle(),
        supabase
          .from('goals')
          .select('start_date')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('start_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      let startDate: string;
      if (goalData?.start_date) {
        startDate = goalData.start_date;
        console.log('[ConsistencyScore] Using goal start_date:', startDate);
      } else if (userData?.created_at) {
        startDate = userData.created_at.split('T')[0];
        console.log('[ConsistencyScore] Using user created_at:', startDate);
      } else {
        startDate = toLocalDateString();
        console.log('[ConsistencyScore] Falling back to today:', startDate);
      }

      const today = toLocalDateString();
      setJourneyStartDate(startDate);
      setRangeStartDate(startDate);
      setRangeEndDate(today);
      console.log('[ConsistencyScore] Range initialized:', startDate, '→', today);
    } catch (error) {
      console.error('[ConsistencyScore] Error loading journey start date:', error);
      const today = toLocalDateString();
      setJourneyStartDate(today);
      setRangeStartDate(today);
      setRangeEndDate(today);
    }
  }, [userId]);

  const calculateConsistencyScore = useCallback(async () => {
    try {
      setLoading(true);

      if (!rangeStartDate || !rangeEndDate) {
        setLoading(false);
        return;
      }

      console.log('[ConsistencyScore] Calculating score for range:', rangeStartDate, '→', rangeEndDate);

      // Fetch meals and active goal in parallel
      const [{ data: allMeals, error: mealsError }, { data: goalData, error: goalError }] =
        await Promise.all([
          supabase
            .from('meals')
            .select('id, date, meal_items(id, calories, protein)')
            .eq('user_id', userId)
            .gte('date', rangeStartDate)
            .lte('date', rangeEndDate)
            .order('date', { ascending: true }),
          supabase
            .from('goals')
            .select('daily_calories, protein_g')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      if (mealsError) {
        console.error('[ConsistencyScore] Error loading meals:', mealsError);
        setLoading(false);
        return;
      }
      if (goalError) {
        console.error('[ConsistencyScore] Error loading goal:', goalError);
      }

      const calorieTarget = goalData?.daily_calories || 2000;
      const proteinTarget = goalData?.protein_g || 150;
      console.log('[ConsistencyScore] Targets — calories:', calorieTarget, 'protein:', proteinTarget);

      // Build per-day totals map
      const dailyData: Record<string, { calories: number; protein: number; hasMeals: boolean }> = {};

      for (const meal of allMeals ?? []) {
        if (!dailyData[meal.date]) {
          dailyData[meal.date] = { calories: 0, protein: 0, hasMeals: false };
        }
        for (const item of meal.meal_items ?? []) {
          const cal = parseFloat(String(item.calories || '0'));
          const prot = parseFloat(String(item.protein || '0'));
          if (cal > 0 || prot > 0) {
            dailyData[meal.date].hasMeals = true;
          }
          dailyData[meal.date].calories += cal;
          dailyData[meal.date].protein += prot;
        }
      }

      // Generate every date in range
      const allDates: string[] = [];
      const cur = new Date(rangeStartDate + 'T00:00:00');
      const end = new Date(rangeEndDate + 'T00:00:00');
      while (cur <= end) {
        allDates.push(toLocalDateString(cur));
        cur.setDate(cur.getDate() + 1);
      }

      const totalDays = allDates.length;
      console.log('[ConsistencyScore] Total days in range:', totalDays);

      // Step 1 — compute DailyScore for every day (missing = 0)
      let trackedDays = 0;
      let sumCalPct = 0;
      let sumProtPct = 0;
      let sumDailyScore = 0;

      for (const date of allDates) {
        const day = dailyData[date];
        const hasTracking = day?.hasMeals ?? false;

        if (hasTracking) {
          trackedDays++;
          const calPct = calorieTarget > 0 ? (day.calories / calorieTarget) * 100 : 0;
          const protPct = proteinTarget > 0 ? (day.protein / proteinTarget) * 100 : 0;
          sumCalPct += calPct;
          sumProtPct += protPct;
        }

        const dayScore = calcDailyScore(
          hasTracking,
          day?.calories ?? 0,
          calorieTarget,
          day?.protein ?? 0,
          proteinTarget,
        );
        sumDailyScore += dayScore;

        console.log(
          `[ConsistencyScore] ${date}: tracked=${hasTracking}, score=${dayScore.toFixed(1)}`,
        );
      }

      // Step 2 — final score = average over ALL days
      const score = totalDays > 0 ? Math.round(sumDailyScore / totalDays) : 0;

      // Averages only over tracked days (for display)
      const avgCalorieAccuracy = trackedDays > 0 ? Math.round(sumCalPct / trackedDays) : 0;
      const avgProteinAccuracy = trackedDays > 0 ? Math.round(sumProtPct / trackedDays) : 0;

      // Step 3 — label
      const label = getLabel(score);
      const insight = buildInsight(label, trackedDays, totalDays, avgCalorieAccuracy, avgProteinAccuracy);

      const today = toLocalDateString();
      const trackedToday = dailyData[today]?.hasMeals === true;

      console.log('[ConsistencyScore] Final score:', score, '| Label:', label);
      console.log('[ConsistencyScore] Tracked days:', trackedDays, '/', totalDays);
      console.log('[ConsistencyScore] Avg calorie accuracy:', avgCalorieAccuracy, '%');
      console.log('[ConsistencyScore] Avg protein accuracy:', avgProteinAccuracy, '%');
      console.log('[ConsistencyScore] Tracked today:', trackedToday);

      setScoreData({ score, label, totalDays, trackedDays, avgCalorieAccuracy, avgProteinAccuracy, insight, trackedToday });
      setLoading(false);
    } catch (error) {
      console.error('[ConsistencyScore] Error calculating score:', error);
      setLoading(false);
    }
  }, [userId, rangeStartDate, rangeEndDate]);

  const handleDateRangeSelect = (startDate: Date, endDate: Date) => {
    const startStr = toLocalDateString(startDate);
    const endStr = toLocalDateString(endDate);
    console.log('[ConsistencyScore] Date range changed:', startStr, '→', endStr);
    setRangeStartDate(startStr);
    setRangeEndDate(endStr);
  };

  const handleResetToJourneyStart = () => {
    if (journeyStartDate) {
      const today = toLocalDateString();
      console.log('[ConsistencyScore] Reset to journey start:', journeyStartDate, '→', today);
      setRangeStartDate(journeyStartDate);
      setRangeEndDate(today);
    }
  };

  const handleToggleDetails = () => {
    const next = !showDetails;
    console.log('[ConsistencyScore] Toggle details:', next ? 'open' : 'closed');
    setShowDetails(next);
  };

  const handleOpenCalendar = () => {
    console.log('[ConsistencyScore] Open calendar picker');
    setShowCalendarPicker(true);
  };

  const getDateRangeText = () => {
    if (!rangeStartDate || !rangeEndDate) return 'Loading...';
    const isDefault =
      rangeStartDate === journeyStartDate &&
      rangeEndDate === toLocalDateString();
    const start = new Date(rangeStartDate + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (isDefault) return `${start} - Today`;
    const end = new Date(rangeEndDate + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${start} - ${end}`;
  };

  const isCustomRange = () => {
    if (!rangeStartDate || !rangeEndDate || !journeyStartDate) return false;
    const today = toLocalDateString();
    return rangeStartDate !== journeyStartDate || rangeEndDate !== today;
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder },
        ]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!scoreData) return null;

  const labelColor = getLabelColor(scoreData.label);
  const dateRangeText = getDateRangeText();
  const customRange = isCustomRange();
  const trackedText = `${scoreData.trackedDays} / ${scoreData.totalDays} days tracked`;
  const calAccText = `${scoreData.avgCalorieAccuracy}%`;
  const protAccText = `${scoreData.avgProteinAccuracy}%`;
  const todayStatusText = scoreData.trackedToday ? '✓ Logged' : 'No tracking yet';
  const todayStatusColor = scoreData.trackedToday
    ? colors.success
    : (isDark ? colors.textSecondaryDark : colors.textSecondary);

  const handleInfoPress = (key: string) => {
    console.log('[ConsistencyScore] Info button tapped:', key);
    setTooltipKey(key);
  };

  const handleTooltipClose = () => {
    console.log('[ConsistencyScore] Tooltip dismissed:', tooltipKey);
    setTooltipKey(null);
  };

  const tooltips: Record<string, { title: string; explanation: string }> = {
    score: {
      title: 'Consistency Score',
      explanation: 'A 0–100 score that measures how consistently you are hitting your daily nutrition targets. Each day earns up to 100 points: 50 for logging any food, up to 30 for calorie accuracy, and up to 20 for protein accuracy. Your final score is the average across all days in the selected range.',
    },
    today: {
      title: 'Today',
      explanation: 'Whether you have logged any food today. Logging at least one meal earns you the base 50 tracking points for the day, which is the single biggest driver of your Consistency Score.',
    },
    consistency: {
      title: 'Consistency — Days Tracked',
      explanation: 'The number of days in the selected range where you logged at least one meal. Missing days score zero and pull your overall Consistency Score down the most, so daily logging is the highest-impact habit to build.',
    },
    calories: {
      title: 'Calories on Target',
      explanation: 'How many days your total calorie intake landed within 5% of your daily calorie goal (95–105%). Hitting this window earns the full 30 calorie points for that day. Days further from your target earn fewer points on a sliding scale.',
    },
    protein: {
      title: 'Protein on Target',
      explanation: 'How many days your total protein intake landed within 5% of your daily protein goal (95–105%). Hitting this window earns the full 20 protein points for that day. Protein accuracy is weighted second after calorie accuracy in the scoring formula.',
    },
  };

  const activeTooltip = tooltipKey ? tooltips[tooltipKey] : null;

  return (
    <React.Fragment>
      {activeTooltip && (
        <StatTooltipModal
          visible={!!tooltipKey}
          title={activeTooltip.title}
          explanation={activeTooltip.explanation}
          isDark={isDark}
          onClose={handleTooltipClose}
        />
      )}

      <View
        style={[
          styles.card,
          { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder },
        ]}
      >
        {/* Main Score Row */}
        <TouchableOpacity
          activeOpacity={initialExpanded ? 1 : 0.7}
          onPress={initialExpanded ? undefined : handleToggleDetails}
          style={styles.mainScoreContainer}
        >
          <View style={[styles.scoreCircle, { borderColor: labelColor + '40' }]}>
            <Text style={[styles.scoreValue, { color: labelColor }]}>
              {scoreData.score}
            </Text>
            <Text style={[styles.scoreLabelText, { color: labelColor }]}>
              {scoreData.label}
            </Text>
          </View>
          <View style={styles.titleContainer}>
            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>
                Consistency Score
              </Text>
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); handleInfoPress('score'); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ fontSize: 14, color: isDark ? '#555' : '#C0C0C0' }}>ⓘ</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.subtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {scoreData.insight}
            </Text>
          </View>
          {!initialExpanded && (
            <IconSymbol
              ios_icon_name={showDetails ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={showDetails ? 'expand_less' : 'expand_more'}
              size={24}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          )}
        </TouchableOpacity>

        {/* Breakdown */}
        {showDetails && (
          <View style={styles.breakdownContainer}>

            {/* Stats grid */}
            <View style={styles.statsGrid}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handleInfoPress('today')}
                style={[styles.statCell, { backgroundColor: isDark ? '#1E2035' : '#F7F8FC' }]}
              >
                <View style={styles.statCellHeader}>
                  <Text style={[styles.statValue, { color: todayStatusColor, fontSize: 13 }]}>
                    {todayStatusText}
                  </Text>
                  <Text style={{ fontSize: 12, color: isDark ? '#555' : '#C0C0C0' }}>ⓘ</Text>
                </View>
                <Text style={[styles.statLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Today
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handleInfoPress('consistency')}
                style={[styles.statCell, { backgroundColor: isDark ? '#1E2035' : '#F7F8FC' }]}
              >
                <View style={styles.statCellHeader}>
                  <Text style={[styles.statValue, { color: isDark ? colors.textDark : colors.text }]}>
                    {`${scoreData.trackedDays} / ${scoreData.totalDays} days`}
                  </Text>
                  <Text style={{ fontSize: 12, color: isDark ? '#555' : '#C0C0C0' }}>ⓘ</Text>
                </View>
                <Text style={[styles.statLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Consistency
                </Text>
                <Text style={[styles.statLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  days completed
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handleInfoPress('calories')}
                style={[styles.statCell, { backgroundColor: isDark ? '#1E2035' : '#F7F8FC' }]}
              >
                <View style={styles.statCellHeader}>
                  <Text style={[styles.statValue, { color: colors.calories }]}>
                    {`${scoreData.trackedDays} / ${scoreData.totalDays} days`}
                  </Text>
                  <Text style={{ fontSize: 12, color: isDark ? '#555' : '#C0C0C0' }}>ⓘ</Text>
                </View>
                <Text style={[styles.statLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Calories
                </Text>
                <Text style={[styles.statLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  on target
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handleInfoPress('protein')}
                style={[styles.statCell, { backgroundColor: isDark ? '#1E2035' : '#F7F8FC' }]}
              >
                <View style={styles.statCellHeader}>
                  <Text style={[styles.statValue, { color: colors.protein }]}>
                    {`${scoreData.trackedDays} / ${scoreData.totalDays} days`}
                  </Text>
                  <Text style={{ fontSize: 12, color: isDark ? '#555' : '#C0C0C0' }}>ⓘ</Text>
                </View>
                <Text style={[styles.statLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Protein
                </Text>
                <Text style={[styles.statLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  on target
                </Text>
              </TouchableOpacity>
            </View>

            {/* Date Range Control */}
            <View style={[styles.dateRangeSection, { borderTopColor: isDark ? '#3A3C52' : '#E5E7EB' }]}>
              <View style={styles.dateRangeHeader}>
                <Text style={[styles.dateRangeLabel, { color: isDark ? colors.textDark : colors.text }]}>
                  Date range
                </Text>
                <TouchableOpacity
                  style={[
                    styles.changeDateButton,
                    { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border },
                  ]}
                  onPress={handleOpenCalendar}
                >
                  <IconSymbol
                    ios_icon_name="calendar"
                    android_material_icon_name="calendar_today"
                    size={14}
                    color={colors.primary}
                  />
                  <Text style={[styles.changeDateButtonText, { color: colors.primary }]}>
                    Change
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.dateRangeText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {dateRangeText}
              </Text>
              {customRange && (
                <TouchableOpacity style={styles.resetButton} onPress={handleResetToJourneyStart}>
                  <Text style={[styles.resetButtonText, { color: colors.primary }]}>
                    Reset to journey start
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      {journeyStartDate && rangeStartDate && rangeEndDate && (
        <CalendarDateRangePicker
          visible={showCalendarPicker}
          onClose={() => setShowCalendarPicker(false)}
          onSelectRange={handleDateRangeSelect}
          initialStartDate={new Date(rangeStartDate + 'T00:00:00')}
          initialEndDate={new Date(rangeEndDate + 'T00:00:00')}
          maxDate={new Date()}
          minDate={new Date(journeyStartDate + 'T00:00:00')}
          title="Select Date Range"
        />
      )}
    </React.Fragment>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.06)',
    elevation: 2,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  mainScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  scoreLabelText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 1,
    textTransform: 'uppercase',
  },
  titleContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  statCellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 2,
  },
  cardTitle: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 12,
    lineHeight: 16,
  },
  breakdownContainer: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCell: {
    flex: 1,
    minWidth: '44%',
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  scoreBarSection: {
    gap: spacing.xs,
  },
  scoreBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreBarLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  scoreBarValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  scoreBarMax: {
    fontSize: 12,
    fontWeight: '400',
  },
  progressBar: {
    height: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 8,
  },
  dateRangeSection: {
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  dateRangeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  dateRangeLabel: {
    ...typography.bodyBold,
    fontSize: 13,
  },
  changeDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  changeDateButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateRangeText: {
    ...typography.caption,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  resetButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

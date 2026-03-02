
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { supabase } from '@/app/integrations/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';
import CalendarDateRangePicker from '@/components/CalendarDateRangePicker';

interface ConsistencyScoreProps {
  userId: string;
  isDark: boolean;
}

interface ScoreBreakdown {
  dailyTracking: number;
  streakScore: number;
  proteinAccuracy: number;
  total: number;
  streakDays: number;
  hasLoggedToday: boolean;
  proteinLogged: number;
  proteinTarget: number;
}

interface DailyScore {
  date: string;
  trackingScore: number; // 0 or 40
  streakScore: number; // 0-35
  proteinScore: number; // 0-25
}

export default function ConsistencyScore({ userId, isDark }: ConsistencyScoreProps) {
  const [loading, setLoading] = useState(true);
  const [scoreData, setScoreData] = useState<ScoreBreakdown | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  
  // Date range state
  const [journeyStartDate, setJourneyStartDate] = useState<string | null>(null);
  const [rangeStartDate, setRangeStartDate] = useState<string | null>(null);
  const [rangeEndDate, setRangeEndDate] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      loadJourneyStartDate();
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
      console.log('[ConsistencyScore] ===== LOADING JOURNEY START DATE =====');
      console.log('[ConsistencyScore] User ID:', userId);
      
      // First, try to get the user's created_at date (when they joined)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('created_at')
        .eq('id', userId)
        .maybeSingle();

      if (userError) {
        console.error('[ConsistencyScore] Error loading user data:', userError);
      }

      let startDate: string | null = null;

      // Try to get start_date from active goal - THIS IS THE PRIMARY SOURCE
      const { data: goalData, error: goalError } = await supabase
        .from('goals')
        .select('start_date')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (goalError) {
        console.error('[ConsistencyScore] Error loading goal:', goalError);
      }

      console.log('[ConsistencyScore] Goal data retrieved:', goalData);
      console.log('[ConsistencyScore] Goal start_date from DB:', goalData?.start_date);

      // Priority: goal start_date > user created_at > today
      if (goalData?.start_date) {
        startDate = goalData.start_date;
        console.log('[ConsistencyScore] ✅ Using goal start_date from Profile tab:', startDate);
      } else if (userData?.created_at) {
        startDate = userData.created_at.split('T')[0];
        console.log('[ConsistencyScore] ⚠️ No goal start_date, using user created_at:', startDate);
      } else {
        startDate = new Date().toISOString().split('T')[0];
        console.log('[ConsistencyScore] ⚠️ No start date found, using today:', startDate);
      }

      setJourneyStartDate(startDate);
      
      // Set default range: journey start → today
      setRangeStartDate(startDate);
      const today = new Date().toISOString().split('T')[0];
      setRangeEndDate(today);
      
      console.log('[ConsistencyScore] ===== RANGE INITIALIZED =====');
      console.log('[ConsistencyScore] Journey Start Date:', startDate);
      console.log('[ConsistencyScore] Default Range:', startDate, '→', today);
      console.log('[ConsistencyScore] =====================================');
    } catch (error) {
      console.error('[ConsistencyScore] Error loading journey start date:', error);
      // Fallback to today
      const today = new Date().toISOString().split('T')[0];
      setJourneyStartDate(today);
      setRangeStartDate(today);
      setRangeEndDate(today);
    }
  }, [userId]);

  const calculateConsistencyScore = useCallback(async () => {
    try {
      setLoading(true);

      if (!rangeStartDate || !rangeEndDate) {
        console.log('[ConsistencyScore] Missing date range');
        setLoading(false);
        return;
      }

      console.log('[ConsistencyScore] ===== CALCULATING CONSISTENCY SCORE =====');
      console.log('[ConsistencyScore] Date range:', rangeStartDate, '→', rangeEndDate);
      console.log('[ConsistencyScore] User ID:', userId);

      // 1. Get all meals in the date range
      const { data: allMeals, error: mealsError } = await supabase
        .from('meals')
        .select(`
          id,
          date,
          meal_items (
            id,
            calories,
            protein
          )
        `)
        .eq('user_id', userId)
        .gte('date', rangeStartDate)
        .lte('date', rangeEndDate)
        .order('date', { ascending: true });

      if (mealsError) {
        console.error('[ConsistencyScore] Error loading meals:', mealsError);
        setLoading(false);
        return;
      }

      console.log('[ConsistencyScore] Meals found:', allMeals?.length || 0);

      // 2. Get protein target from active goal
      const { data: goalData, error: goalError } = await supabase
        .from('goals')
        .select('protein_g')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (goalError) {
        console.error('[ConsistencyScore] Error loading goal:', goalError);
      }

      const proteinTarget = goalData?.protein_g || 150;
      console.log('[ConsistencyScore] Protein target:', proteinTarget, 'g');

      // 3. Organize data by date
      const dailyData: { [date: string]: { calories: number; protein: number; hasMeals: boolean } } = {};

      if (allMeals && allMeals.length > 0) {
        for (const meal of allMeals) {
          if (!dailyData[meal.date]) {
            dailyData[meal.date] = { calories: 0, protein: 0, hasMeals: false };
          }

          if (meal.meal_items && meal.meal_items.length > 0) {
            dailyData[meal.date].hasMeals = true;
            
            for (const item of meal.meal_items) {
              const itemCalories = parseFloat(String(item.calories || '0'));
              const itemProtein = parseFloat(String(item.protein || '0'));
              
              dailyData[meal.date].calories += itemCalories;
              dailyData[meal.date].protein += itemProtein;
            }
          }
        }
      }

      console.log('[ConsistencyScore] Daily data:', dailyData);

      // 4. Generate all dates in range
      const allDatesInRange: string[] = [];
      const startDate = new Date(rangeStartDate + 'T00:00:00');
      const endDate = new Date(rangeEndDate + 'T00:00:00');
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        allDatesInRange.push(dateStr);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      console.log('[ConsistencyScore] Total days in range:', allDatesInRange.length);
      console.log('[ConsistencyScore] Days with data:', Object.keys(dailyData).length);

      // Edge case: If range > 2 days with no data at all, score = 0
      if (allDatesInRange.length > 2 && Object.keys(dailyData).length === 0) {
        console.log('[ConsistencyScore] No data in range > 2 days, score = 0');
        setScoreData({
          dailyTracking: 0,
          streakScore: 0,
          proteinAccuracy: 0,
          total: 0,
          streakDays: 0,
          hasLoggedToday: false,
          proteinLogged: 0,
          proteinTarget,
        });
        setLoading(false);
        return;
      }

      // 5. Calculate daily scores for each day in range
      const dailyScores: DailyScore[] = [];
      let currentStreakDays = 0;
      let maxStreakDays = 0;
      let totalProteinLogged = 0;
      let daysWithProtein = 0;

      for (let i = 0; i < allDatesInRange.length; i++) {
        const date = allDatesInRange[i];
        const dayData = dailyData[date];
        
        // A) Daily Tracking Score (0 or 40)
        const hasTracking = dayData?.hasMeals || false;
        const trackingScore = hasTracking ? 40 : 0;

        // B) Streak Score (0-35)
        // Update streak counter - FIXED: Reset to 0 on break, no carryover
        if (hasTracking) {
          currentStreakDays++;
          maxStreakDays = Math.max(maxStreakDays, currentStreakDays);
        } else {
          // Reset streak on break (no carryover)
          currentStreakDays = 0;
        }

        // Calculate streak score using log curve: 35 * (1 - e^(-0.1 * streak))
        // This gives: 1 day = 3pts, 7 days = 17pts, 14 days = 25pts, 30 days = 32pts
        const streakScore = currentStreakDays > 0 
          ? Math.round(35 * (1 - Math.exp(-0.1 * currentStreakDays)))
          : 0;

        // C) Protein Accuracy Score (0-25)
        const proteinLogged = dayData?.protein || 0;
        const proteinScore = calculateProteinAccuracyScore(proteinLogged, proteinTarget);

        if (proteinLogged > 0) {
          totalProteinLogged += proteinLogged;
          daysWithProtein++;
        }

        dailyScores.push({
          date,
          trackingScore,
          streakScore,
          proteinScore,
        });
      }

      console.log('[ConsistencyScore] Daily scores calculated:', dailyScores.length);
      console.log('[ConsistencyScore] Max streak days:', maxStreakDays);

      // 6. Calculate averages - ONLY across days with actual data
      // Filter to only include days that have tracking data
      const daysWithData = dailyScores.filter(day => day.trackingScore > 0);
      const daysWithDataCount = daysWithData.length;

      console.log('[ConsistencyScore] Days with data:', daysWithDataCount, '/', dailyScores.length);

      // If no days with data, score = 0
      if (daysWithDataCount === 0) {
        console.log('[ConsistencyScore] No days with data, score = 0');
        setScoreData({
          dailyTracking: 0,
          streakScore: 0,
          proteinAccuracy: 0,
          total: 0,
          streakDays: 0,
          hasLoggedToday: false,
          proteinLogged: 0,
          proteinTarget,
        });
        setLoading(false);
        return;
      }

      // Calculate averages ONLY from days with data
      const avgTracking = daysWithData.reduce((sum, day) => sum + day.trackingScore, 0) / daysWithDataCount;
      const avgStreak = daysWithData.reduce((sum, day) => sum + day.streakScore, 0) / daysWithDataCount;
      const avgProtein = daysWithData.reduce((sum, day) => sum + day.proteinScore, 0) / daysWithDataCount;

      const totalScore = Math.round(avgTracking + avgStreak + avgProtein);
      const avgProteinLogged = daysWithProtein > 0 ? totalProteinLogged / daysWithProtein : 0;

      console.log('[ConsistencyScore] ===== AVERAGES (ONLY DAYS WITH DATA) =====');
      console.log('[ConsistencyScore] Days counted:', daysWithDataCount, '/', dailyScores.length);
      console.log('[ConsistencyScore] Avg Daily Tracking:', avgTracking.toFixed(1), '/ 40');
      console.log('[ConsistencyScore] Avg Streak Score:', avgStreak.toFixed(1), '/ 35');
      console.log('[ConsistencyScore] Avg Protein Accuracy:', avgProtein.toFixed(1), '/ 25');
      console.log('[ConsistencyScore] TOTAL SCORE:', totalScore, '/ 100');

      const todayStr = new Date().toISOString().split('T')[0];
      const hasLoggedToday = dailyData[todayStr]?.hasMeals || false;

      setScoreData({
        dailyTracking: Math.round(avgTracking),
        streakScore: Math.round(avgStreak),
        proteinAccuracy: Math.round(avgProtein),
        total: totalScore,
        streakDays: maxStreakDays,
        hasLoggedToday,
        proteinLogged: avgProteinLogged,
        proteinTarget,
      });

      setLoading(false);
    } catch (error) {
      console.error('[ConsistencyScore] Error calculating score:', error);
      setLoading(false);
    }
  }, [userId, rangeStartDate, rangeEndDate]);

  const calculateProteinAccuracyScore = (proteinLogged: number, proteinTarget: number): number => {
    if (proteinTarget === 0) {
      return 0;
    }

    const percentage = (proteinLogged / proteinTarget) * 100;

    // Scoring tiers:
    // 95-105% → 25 pts
    // 80-94% → 20 pts
    // 60-79% → 15 pts
    // 40-59% → 10 pts
    // <40% → 0-5 pts (scaled)
    // >105% → gradually reduce from 25 to 15

    if (percentage >= 95 && percentage <= 105) {
      return 25;
    } else if (percentage >= 80 && percentage < 95) {
      return 20;
    } else if (percentage >= 60 && percentage < 80) {
      return 15;
    } else if (percentage >= 40 && percentage < 60) {
      return 10;
    } else if (percentage < 40) {
      return Math.round((percentage / 40) * 5);
    } else {
      // Over 105%, gradually reduce score
      const excess = percentage - 105;
      const penalty = Math.min(10, excess / 5);
      return Math.max(15, Math.round(25 - penalty));
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) {
      return colors.success;
    } else if (score >= 60) {
      return colors.warning;
    } else {
      return colors.error;
    }
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 90) {
      return 'Excellent';
    } else if (score >= 80) {
      return 'Great';
    } else if (score >= 70) {
      return 'Good';
    } else if (score >= 60) {
      return 'Fair';
    } else {
      return 'Needs Work';
    }
  };

  const handleDateRangeSelect = (startDate: Date, endDate: Date) => {
    console.log('[ConsistencyScore] ===== DATE RANGE CHANGED =====');
    console.log('[ConsistencyScore] New range:', startDate.toISOString(), '→', endDate.toISOString());
    
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    setRangeStartDate(startStr);
    setRangeEndDate(endStr);
    
    console.log('[ConsistencyScore] Range state updated, will recalculate');
  };

  const handleResetToJourneyStart = () => {
    console.log('[ConsistencyScore] ===== RESET TO JOURNEY START =====');
    if (journeyStartDate) {
      const today = new Date().toISOString().split('T')[0];
      setRangeStartDate(journeyStartDate);
      setRangeEndDate(today);
      console.log('[ConsistencyScore] Reset to:', journeyStartDate, '→', today);
    }
  };

  const getDateRangeText = () => {
    if (!rangeStartDate || !rangeEndDate) {
      return 'Loading...';
    }

    const isDefaultRange = rangeStartDate === journeyStartDate && rangeEndDate === new Date().toISOString().split('T')[0];

    if (isDefaultRange) {
      const start = new Date(rangeStartDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${start} - Today`;
    } else {
      const start = new Date(rangeStartDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const end = new Date(rangeEndDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${start} - ${end}`;
    }
  };

  const isCustomRange = () => {
    if (!rangeStartDate || !rangeEndDate || !journeyStartDate) {
      return false;
    }
    const today = new Date().toISOString().split('T')[0];
    return rangeStartDate !== journeyStartDate || rangeEndDate !== today;
  };

  if (loading) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? colors.cardDark : colors.card,
            borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
          },
        ]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!scoreData) {
    return null;
  }

  const scoreColor = getScoreColor(scoreData.total);
  const scoreLabel = getScoreLabel(scoreData.total);

  return (
    <React.Fragment>
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? colors.cardDark : colors.card,
            borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
          },
        ]}
      >
        {/* Main Score Display - Tappable */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowDetails(!showDetails)}
          style={styles.mainScoreContainer}
        >
          <View style={styles.scoreCircle}>
            <Text style={[styles.scoreValue, { color: scoreColor }]}>
              {scoreData.total}
            </Text>
            <Text style={[styles.scoreLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {scoreLabel}
            </Text>
          </View>
          <View style={styles.titleContainer}>
            <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Consistency Score
            </Text>
            <Text style={[styles.subtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Your daily tracking performance
            </Text>
          </View>
          <IconSymbol
            ios_icon_name={showDetails ? "chevron.up" : "chevron.down"}
            android_material_icon_name={showDetails ? "expand_less" : "expand_more"}
            size={24}
            color={isDark ? colors.textSecondaryDark : colors.textSecondary}
          />
        </TouchableOpacity>

        {/* Score Breakdown - Conditionally Rendered */}
        {showDetails && (
          <View style={styles.breakdownContainer}>
            {/* Daily Tracking */}
            <View style={styles.breakdownItem}>
              <View style={styles.breakdownHeader}>
                <Text style={[styles.breakdownLabel, { color: isDark ? colors.textDark : colors.text }]}>
                  Daily Tracking
                </Text>
                <Text style={[styles.breakdownScore, { color: scoreData.dailyTracking >= 30 ? colors.success : colors.warning }]}>
                  {scoreData.dailyTracking}/40
                </Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${(scoreData.dailyTracking / 40) * 100}%`,
                      backgroundColor: scoreData.dailyTracking >= 30 ? colors.success : colors.warning,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.breakdownHint, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Average across days in range
              </Text>
            </View>

            {/* Streak Score */}
            <View style={styles.breakdownItem}>
              <View style={styles.breakdownHeader}>
                <Text style={[styles.breakdownLabel, { color: isDark ? colors.textDark : colors.text }]}>
                  Streak Score
                </Text>
                <Text style={[styles.breakdownScore, { color: colors.primary }]}>
                  {scoreData.streakScore}/35
                </Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${(scoreData.streakScore / 35) * 100}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.breakdownHint, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {scoreData.streakDays} day{scoreData.streakDays !== 1 ? 's' : ''} longest streak
              </Text>
            </View>

            {/* Protein Accuracy */}
            <View style={styles.breakdownItem}>
              <View style={styles.breakdownHeader}>
                <Text style={[styles.breakdownLabel, { color: isDark ? colors.textDark : colors.text }]}>
                  Protein Accuracy
                </Text>
                <Text style={[styles.breakdownScore, { color: colors.protein }]}>
                  {scoreData.proteinAccuracy}/25
                </Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${(scoreData.proteinAccuracy / 25) * 100}%`,
                      backgroundColor: colors.protein,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.breakdownHint, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {Math.round(scoreData.proteinLogged)}g / {scoreData.proteinTarget}g avg ({Math.round((scoreData.proteinLogged / scoreData.proteinTarget) * 100)}%)
              </Text>
            </View>

            {/* Date Range Control */}
            <View style={styles.dateRangeSection}>
              <View style={styles.dateRangeHeader}>
                <Text style={[styles.dateRangeLabel, { color: isDark ? colors.textDark : colors.text }]}>
                  Date range
                </Text>
                <TouchableOpacity
                  style={[
                    styles.changeDateButton,
                    {
                      backgroundColor: isDark ? colors.backgroundDark : colors.background,
                      borderColor: isDark ? colors.borderDark : colors.border,
                    },
                  ]}
                  onPress={() => setShowCalendarPicker(true)}
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
                {getDateRangeText()}
              </Text>
              {isCustomRange() && (
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={handleResetToJourneyStart}
                >
                  <Text style={[styles.resetButtonText, { color: colors.primary }]}>
                    Reset to journey start
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Calendar Date Range Picker */}
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
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
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
    backgroundColor: colors.background + '40',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.primary + '30',
  },
  scoreValue: {
    ...typography.h1,
    fontSize: 32,
    fontWeight: '700',
  },
  scoreLabel: {
    ...typography.caption,
    fontSize: 10,
    marginTop: 2,
  },
  titleContainer: {
    flex: 1,
  },
  cardTitle: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 12,
  },
  breakdownContainer: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  breakdownItem: {
    gap: spacing.xs,
  },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    ...typography.bodyBold,
    fontSize: 13,
  },
  breakdownScore: {
    ...typography.bodyBold,
    fontSize: 13,
  },
  progressBar: {
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  breakdownHint: {
    ...typography.caption,
    fontSize: 11,
  },
  dateRangeSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border + '30',
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

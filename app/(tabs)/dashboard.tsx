
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import MacroBar from '@/components/MacroBar';
import CalendarDateRangePicker from '@/components/CalendarDateRangePicker';
import { supabase } from '@/app/integrations/supabase/client';

type TimeRange = '7days' | '30days' | 'custom';

interface CheckIn {
  id: string;
  date: string;
  weight: number | null;
  steps: number | null;
  steps_goal: number | null;
  went_to_gym: boolean;
}

interface DailySummary {
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fats: number;
  total_fiber: number;
}

interface CustomDateRange {
  startDate: Date;
  endDate: Date;
}

export default function DashboardScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [goal, setGoal] = useState<any>(null);
  const [todayCheckIn, setTodayCheckIn] = useState<CheckIn | null>(null);
  const [todaySummary, setTodaySummary] = useState<DailySummary | null>(null);
  
  const [nutritionRange, setNutritionRange] = useState<TimeRange>('7days');
  
  const [nutritionCustomRange, setNutritionCustomRange] = useState<CustomDateRange | null>(null);
  
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  
  const [nutritionStats, setNutritionStats] = useState<any>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.log('[Dashboard] No user found');
        setLoading(false);
        return;
      }

      setUser(authUser);

      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (userData) {
        setUser({ ...authUser, ...userData });
      }

      const { data: goalData } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('is_active', true)
        .maybeSingle();

      if (goalData) {
        setGoal(goalData);
      } else {
        setGoal({
          daily_calories: 2000,
          protein_g: 150,
          carbs_g: 200,
          fats_g: 65,
          fiber_g: 30,
        });
      }

      const today = new Date().toISOString().split('T')[0];
      const { data: checkInsData } = await supabase
        .from('check_ins')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('date', today)
        .order('created_at', { ascending: false });

      if (checkInsData && checkInsData.length > 0) {
        setTodayCheckIn(checkInsData[0]);
      } else {
        setTodayCheckIn(null);
      }

      await loadTodaySummary(authUser.id, today);
      await loadNutritionTrends(authUser.id);

    } catch (error) {
      console.error('[Dashboard] Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      console.log('[Dashboard] Nutrition range changed, reloading trends');
      loadNutritionTrends(user.id);
    }
  }, [nutritionRange, nutritionCustomRange]);

  const loadTodaySummary = async (userId: string, date: string) => {
    try {
      const { data: mealsData } = await supabase
        .from('meals')
        .select(`
          meal_items (
            calories,
            protein,
            carbs,
            fats,
            fiber
          )
        `)
        .eq('user_id', userId)
        .eq('date', date);

      let totalCals = 0;
      let totalP = 0;
      let totalC = 0;
      let totalF = 0;
      let totalFib = 0;

      if (mealsData && mealsData.length > 0) {
        mealsData.forEach((meal: any) => {
          if (meal.meal_items) {
            meal.meal_items.forEach((item: any) => {
              totalCals += item.calories || 0;
              totalP += item.protein || 0;
              totalC += item.carbs || 0;
              totalF += item.fats || 0;
              totalFib += item.fiber || 0;
            });
          }
        });
      }

      setTodaySummary({
        date,
        total_calories: totalCals,
        total_protein: totalP,
        total_carbs: totalC,
        total_fats: totalF,
        total_fiber: totalFib,
      });
    } catch (error) {
      console.error('[Dashboard] Error loading today summary:', error);
    }
  };

  const loadNutritionTrends = async (userId: string) => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      
      if (nutritionRange === '7days') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (nutritionRange === '30days') {
        startDate.setDate(startDate.getDate() - 30);
      } else if (nutritionRange === 'custom' && nutritionCustomRange) {
        startDate.setTime(nutritionCustomRange.startDate.getTime());
        endDate.setTime(nutritionCustomRange.endDate.getTime());
      }

      console.log('[Dashboard] Loading nutrition trends from', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0]);

      const { data: mealsData } = await supabase
        .from('meals')
        .select(`
          date,
          meal_items (
            calories,
            protein,
            carbs,
            fats,
            fiber
          )
        `)
        .eq('user_id', userId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0]);

      const daysWithData = new Set<string>();
      let totalCals = 0;
      let totalP = 0;
      let totalC = 0;
      let totalF = 0;
      let totalFib = 0;

      if (mealsData && mealsData.length > 0) {
        mealsData.forEach((meal: any) => {
          daysWithData.add(meal.date);
          if (meal.meal_items) {
            meal.meal_items.forEach((item: any) => {
              totalCals += item.calories || 0;
              totalP += item.protein || 0;
              totalC += item.carbs || 0;
              totalF += item.fats || 0;
              totalFib += item.fiber || 0;
            });
          }
        });
      }

      const daysCount = daysWithData.size;
      const avgCals = daysCount > 0 ? totalCals / daysCount : 0;
      const avgP = daysCount > 0 ? totalP / daysCount : 0;
      const avgC = daysCount > 0 ? totalC / daysCount : 0;
      const avgF = daysCount > 0 ? totalF / daysCount : 0;
      const avgFib = daysCount > 0 ? totalFib / daysCount : 0;

      const streak = calculateStreak(Array.from(daysWithData).sort());

      console.log('[Dashboard] Nutrition stats:', { daysCount, avgCals, streak });

      setNutritionStats({
        streak,
        avgCalories: avgCals,
        avgProtein: avgP,
        avgCarbs: avgC,
        avgFats: avgF,
        avgFiber: avgFib,
      });
    } catch (error) {
      console.error('[Dashboard] Error loading nutrition trends:', error);
    }
  };

  const calculateStreak = (sortedDates: string[]): number => {
    if (sortedDates.length === 0) return 0;

    let currentStreak = 1;
    const today = new Date().toISOString().split('T')[0];
    
    const lastDate = sortedDates[sortedDates.length - 1];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    if (lastDate !== today && lastDate !== yesterdayStr) {
      return 0;
    }

    for (let i = sortedDates.length - 2; i >= 0; i--) {
      const currentDate = new Date(sortedDates[i + 1]);
      const prevDate = new Date(sortedDates[i]);
      const diffDays = Math.floor((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        currentStreak++;
      } else {
        break;
      }
    }

    return currentStreak;
  };

  useFocusEffect(
    useCallback(() => {
      console.log('[Dashboard] Screen focused, loading data');
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleQuickCheckIn = (type: 'weight' | 'steps' | 'gym') => {
    setShowCheckInModal(false);
    router.push({
      pathname: '/check-in-form',
      params: { type },
    });
  };

  const handleCustomRangeSelect = () => {
    console.log('[Dashboard] Opening calendar date range picker for nutrition');
    setShowCalendarPicker(true);
  };

  const handleDateRangeSelect = (startDate: Date, endDate: Date) => {
    console.log('[Dashboard] Date range selected:', startDate, 'to', endDate);
    
    const customRange: CustomDateRange = { 
      startDate, 
      endDate 
    };
    
    setNutritionCustomRange(customRange);
    setNutritionRange('custom');
  };

  const handleCalendarClose = () => {
    console.log('[Dashboard] Calendar picker closed');
    setShowCalendarPicker(false);
    
    // If user cancelled and no custom range was set, revert to 7 days
    if (nutritionRange === 'custom' && !nutritionCustomRange) {
      setNutritionRange('7days');
    }
  };

  const getCustomRangeLabel = (range: CustomDateRange | null) => {
    if (!range) return 'Custom';
    const start = range.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = range.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${start} - ${end}`;
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
        edges={['top']}
      >
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Loading dashboard...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const caloriesGoal = goal?.daily_calories || 2000;
  const caloriesEaten = todaySummary?.total_calories || 0;
  const caloriesRemaining = caloriesGoal - caloriesEaten;
  const caloriesProgress = Math.min((caloriesEaten / caloriesGoal) * 100, 100);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        scrollEventThrottle={16}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
            Dashboard
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Daily Summary
            </Text>
            <TouchableOpacity
              style={styles.quickAddButton}
              onPress={() => setShowCheckInModal(true)}
            >
              <IconSymbol
                ios_icon_name="plus.circle.fill"
                android_material_icon_name="add_circle"
                size={24}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Goal
              </Text>
              <Text style={[styles.summaryValue, { color: isDark ? colors.textDark : colors.text }]}>
                {caloriesGoal}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Eaten
              </Text>
              <Text style={[styles.summaryValue, { color: colors.calories }]}>
                {Math.round(caloriesEaten)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Remaining
              </Text>
              <Text style={[styles.summaryValue, { color: caloriesRemaining >= 0 ? colors.success : colors.error }]}>
                {Math.round(caloriesRemaining)}
              </Text>
            </View>
          </View>

          <View style={[styles.progressBarContainer, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
            <View 
              style={[
                styles.progressBarFill, 
                { 
                  width: `${caloriesProgress}%`,
                  backgroundColor: caloriesRemaining >= 0 ? colors.success : colors.error
                }
              ]} 
            />
          </View>

          <View style={styles.macrosRow}>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.protein }]}>
                {Math.round(todaySummary?.total_protein || 0)} / {goal?.protein_g || 150}g
              </Text>
              <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Protein
              </Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.carbs }]}>
                {Math.round(todaySummary?.total_carbs || 0)} / {goal?.carbs_g || 200}g
              </Text>
              <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Carbs
              </Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.fats }]}>
                {Math.round(todaySummary?.total_fats || 0)} / {goal?.fats_g || 65}g
              </Text>
              <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Fats
              </Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.fiber }]}>
                {Math.round(todaySummary?.total_fiber || 0)} / {goal?.fiber_g || 30}g
              </Text>
              <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Fiber
              </Text>
            </View>
          </View>

          <View style={styles.activityRow}>
            <View style={styles.activityItem}>
              <IconSymbol
                ios_icon_name={todayCheckIn?.went_to_gym ? 'checkmark.circle.fill' : 'xmark.circle'}
                android_material_icon_name={todayCheckIn?.went_to_gym ? 'check_circle' : 'cancel'}
                size={24}
                color={todayCheckIn?.went_to_gym ? colors.success : colors.textSecondary}
              />
              <Text style={[styles.activityText, { color: isDark ? colors.textDark : colors.text }]}>
                Workout: {todayCheckIn?.went_to_gym ? 'Yes' : 'No'}
              </Text>
            </View>
            <View style={styles.activityItem}>
              <IconSymbol
                ios_icon_name="figure.walk"
                android_material_icon_name="directions_walk"
                size={24}
                color={colors.info}
              />
              <Text style={[styles.activityText, { color: isDark ? colors.textDark : colors.text }]}>
                Steps: {todayCheckIn?.steps?.toLocaleString() || 0} / {todayCheckIn?.steps_goal?.toLocaleString() || 10000}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Nutrition Trends
          </Text>

          <View style={styles.rangeSelector}>
            <TouchableOpacity
              style={[
                styles.rangeButton,
                nutritionRange === '7days' && { backgroundColor: colors.primary },
              ]}
              onPress={() => setNutritionRange('7days')}
            >
              <Text
                style={[
                  styles.rangeButtonText,
                  { color: nutritionRange === '7days' ? '#FFFFFF' : (isDark ? colors.textDark : colors.text) },
                ]}
              >
                Last 7 days
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.rangeButton,
                nutritionRange === '30days' && { backgroundColor: colors.primary },
              ]}
              onPress={() => setNutritionRange('30days')}
            >
              <Text
                style={[
                  styles.rangeButtonText,
                  { color: nutritionRange === '30days' ? '#FFFFFF' : (isDark ? colors.textDark : colors.text) },
                ]}
              >
                Last 30 days
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.rangeButton,
                nutritionRange === 'custom' && { backgroundColor: colors.primary },
              ]}
              onPress={handleCustomRangeSelect}
            >
              <Text
                style={[
                  styles.rangeButtonText,
                  { color: nutritionRange === 'custom' ? '#FFFFFF' : (isDark ? colors.textDark : colors.text) },
                ]}
              >
                {nutritionRange === 'custom' ? getCustomRangeLabel(nutritionCustomRange) : 'Custom'}
              </Text>
            </TouchableOpacity>
          </View>

          {nutritionStats ? (
            <React.Fragment>
              <View style={styles.streakContainer}>
                <Text style={[styles.streakText, { color: isDark ? colors.textDark : colors.text }]}>
                  {nutritionStats.streak}-day streak
                </Text>
              </View>

              <View style={styles.statRow}>
                <Text style={[styles.statLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Average calories per day:
                </Text>
                
                {caloriesGoal > 0 ? (
                  <View style={styles.caloriesBarContainer}>
                    <MacroBar
                      label="Calories"
                      current={nutritionStats.avgCalories}
                      target={caloriesGoal}
                      color={colors.calories}
                      unit=" kcal"
                    />
                  </View>
                ) : (
                  <Text style={[styles.statValue, { color: colors.calories }]}>
                    {Math.round(nutritionStats.avgCalories)} kcal
                  </Text>
                )}
              </View>

              <View style={styles.statRow}>
                <Text style={[styles.statLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Average macros per day:
                </Text>
                
                <View style={styles.macroBarsContainer}>
                  <MacroBar
                    label="Protein"
                    current={nutritionStats.avgProtein}
                    target={goal?.protein_g || 150}
                    color={colors.protein}
                  />
                  <MacroBar
                    label="Carbs"
                    current={nutritionStats.avgCarbs}
                    target={goal?.carbs_g || 200}
                    color={colors.carbs}
                  />
                  <MacroBar
                    label="Fats"
                    current={nutritionStats.avgFats}
                    target={goal?.fats_g || 65}
                    color={colors.fats}
                  />
                  <MacroBar
                    label="Fiber"
                    current={nutritionStats.avgFiber}
                    target={goal?.fiber_g || 30}
                    color={colors.fiber}
                  />
                </View>
              </View>
            </React.Fragment>
          ) : (
            <Text style={[styles.noDataText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              No nutrition data available for this period.
            </Text>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <Modal
        visible={showCheckInModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCheckInModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCheckInModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Quick Check-In
            </Text>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleQuickCheckIn('weight')}
            >
              <IconSymbol
                ios_icon_name="scalemass"
                android_material_icon_name="monitor_weight"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.modalOptionText, { color: isDark ? colors.textDark : colors.text }]}>
                Log Weight
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleQuickCheckIn('steps')}
            >
              <IconSymbol
                ios_icon_name="figure.walk"
                android_material_icon_name="directions_walk"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.modalOptionText, { color: isDark ? colors.textDark : colors.text }]}>
                Log Steps
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleQuickCheckIn('gym')}
            >
              <IconSymbol
                ios_icon_name="dumbbell.fill"
                android_material_icon_name="fitness_center"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.modalOptionText, { color: isDark ? colors.textDark : colors.text }]}>
                Log Gym Session
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalCancelButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
              onPress={() => setShowCheckInModal(false)}
            >
              <Text style={[styles.modalCancelText, { color: isDark ? colors.textDark : colors.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <CalendarDateRangePicker
        visible={showCalendarPicker}
        onClose={handleCalendarClose}
        onSelectRange={handleDateRangeSelect}
        initialStartDate={nutritionCustomRange?.startDate || (() => {
          const date = new Date();
          date.setDate(date.getDate() - 7);
          return date;
        })()}
        initialEndDate={nutritionCustomRange?.endDate || new Date()}
        maxDate={new Date()}
        title="Select Date Range"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.body,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h2,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    ...typography.h3,
  },
  quickAddButton: {
    padding: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    ...typography.h2,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  progressBarContainer: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  macrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  macroItem: {
    flex: 1,
    alignItems: 'center',
  },
  macroValue: {
    ...typography.bodyBold,
    fontSize: 13,
    marginBottom: 2,
    textAlign: 'center',
  },
  macroLabel: {
    ...typography.caption,
    fontSize: 11,
    textAlign: 'center',
  },
  activityRow: {
    gap: spacing.sm,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  activityText: {
    ...typography.body,
  },
  rangeSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  rangeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  rangeButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  streakContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  streakText: {
    ...typography.h3,
    fontSize: 18,
  },
  statRow: {
    marginBottom: spacing.md,
  },
  statLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  statValue: {
    ...typography.bodyBold,
  },
  caloriesBarContainer: {
    marginTop: spacing.sm,
  },
  macroBarsContainer: {
    marginTop: spacing.sm,
  },
  noDataText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  bottomSpacer: {
    height: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.2)',
    elevation: 5,
  },
  modalTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  modalOptionText: {
    ...typography.bodyBold,
  },
  modalCancelButton: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  modalCancelText: {
    ...typography.bodyBold,
  },
});

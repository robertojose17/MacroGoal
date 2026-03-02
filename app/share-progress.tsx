
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import ShareableProgressCard from '@/components/ShareableProgressCard';
import { supabase } from '@/app/integrations/supabase/client';
import { TouchableOpacity } from 'react-native-gesture-handler';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

interface CardData {
  consistencyScore: number;
  weightGoalProgress: number;
  weightLost: number;
  dayStreak: number;
  progressPhotoUrl?: string;
  beforePhotoUrl?: string;
  motivationalLine: string;
}

export default function ShareProgressScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [cardData, setCardData] = useState<CardData | null>(null);
  const viewShotRef = useRef<ViewShot>(null);

  const calculateProteinAccuracyScore = useCallback((proteinLogged: number, proteinTarget: number): number => {
    if (proteinTarget === 0) {
      return 0;
    }

    const percentage = (proteinLogged / proteinTarget) * 100;

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
      const excess = percentage - 105;
      const penalty = Math.min(10, excess / 5);
      return Math.max(15, Math.round(25 - penalty));
    }
  }, []);

  /**
   * Calculate Consistency Score based on check-in data
   * Uses the same logic as ConsistencyScore component
   */
  const calculateConsistencyScore = useCallback(async (userId: string, startDate: string, proteinTarget: number): Promise<number> => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get all meals in the date range
      const { data: allMeals } = await supabase
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
        .gte('date', startDate)
        .lte('date', today)
        .order('date', { ascending: true });

      // Organize data by date
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

      // Generate all dates in range
      const allDatesInRange: string[] = [];
      const start = new Date(startDate + 'T00:00:00');
      const end = new Date(today + 'T00:00:00');
      const currentDate = new Date(start);

      while (currentDate <= end) {
        const dateStr = currentDate.toISOString().split('T')[0];
        allDatesInRange.push(dateStr);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Edge case: If range > 2 days with no data at all, score = 0
      const hasNoData = Object.keys(dailyData).length === 0;
      if (allDatesInRange.length > 2 && hasNoData) {
        return 0;
      }

      // Calculate daily scores
      const dailyScores: { trackingScore: number; streakScore: number; proteinScore: number }[] = [];
      let currentStreakDays = 0;

      for (let i = 0; i < allDatesInRange.length; i++) {
        const date = allDatesInRange[i];
        const dayData = dailyData[date];
        
        // A) Daily Tracking Score (0 or 40)
        const hasTracking = dayData?.hasMeals || false;
        const trackingScore = hasTracking ? 40 : 0;

        // B) Streak Score (0-35)
        if (hasTracking) {
          currentStreakDays++;
        } else {
          currentStreakDays = Math.floor(currentStreakDays * 0.3);
        }

        const streakScore = currentStreakDays > 0 
          ? Math.round(35 * (1 - Math.exp(-0.1 * currentStreakDays)))
          : 0;

        // C) Protein Accuracy Score (0-25)
        const proteinLogged = dayData?.protein || 0;
        const proteinScore = calculateProteinAccuracyScore(proteinLogged, proteinTarget);

        dailyScores.push({
          trackingScore,
          streakScore,
          proteinScore,
        });
      }

      // Calculate averages
      const avgTracking = dailyScores.reduce((sum, day) => sum + day.trackingScore, 0) / dailyScores.length;
      const avgStreak = dailyScores.reduce((sum, day) => sum + day.streakScore, 0) / dailyScores.length;
      const avgProtein = dailyScores.reduce((sum, day) => sum + day.proteinScore, 0) / dailyScores.length;

      const totalScore = Math.round(avgTracking + avgStreak + avgProtein);
      // Ensure score is between 0 and 100
      return Math.max(0, Math.min(100, totalScore));
    } catch (error) {
      console.error('[ShareProgress] Error calculating consistency score:', error);
      return 0;
    }
  }, [calculateProteinAccuracyScore]);

  /**
   * Calculate Weight Goal Progress (% Complete)
   * % Complete = (Weight Lost so far ÷ Total Weight Goal) × 100
   * Source: CHECK-IN data (not calories)
   */
  const calculateWeightGoalProgress = async (
    userId: string,
    userData: any
  ): Promise<{ weightGoalProgress: number; weightLost: number }> => {
    try {
      console.log('[ShareProgress] === WEIGHT GOAL PROGRESS CALCULATION ===');
      console.log('[ShareProgress] userData:', userData);

      // Get all weight check-ins ordered by date
      const { data: checkIns } = await supabase
        .from('check_ins')
        .select('weight, date')
        .eq('user_id', userId)
        .not('weight', 'is', null)
        .order('date', { ascending: true });

      console.log('[ShareProgress] Check-ins found:', checkIns?.length || 0);

      if (!checkIns || checkIns.length === 0) {
        console.log('[ShareProgress] No check-ins found, returning 0');
        return { weightGoalProgress: 0, weightLost: 0 };
      }

      // Get first and last weight (in kg from database)
      const firstWeightKg = checkIns[0].weight;
      const lastWeightKg = checkIns[checkIns.length - 1].weight;
      
      console.log('[ShareProgress] First weight (kg):', firstWeightKg);
      console.log('[ShareProgress] Last weight (kg):', lastWeightKg);

      // Calculate weight lost in lbs
      const weightLostKg = firstWeightKg - lastWeightKg;
      const weightLostLbs = weightLostKg * 2.20462;

      console.log('[ShareProgress] Weight lost (kg):', weightLostKg);
      console.log('[ShareProgress] Weight lost (lbs):', weightLostLbs);

      // Calculate % complete if goal weight is set
      let weightGoalProgress = 0;

      // Parse goal_weight from userData
      const goalWeightRaw = userData?.goal_weight;
      console.log('[ShareProgress] Goal weight (raw):', goalWeightRaw);

      if (goalWeightRaw) {
        const goalWeightKg = parseFloat(goalWeightRaw);
        console.log('[ShareProgress] Goal weight (kg):', goalWeightKg);

        if (!isNaN(goalWeightKg) && goalWeightKg > 0) {
          // Calculate total weight goal (starting weight - goal weight)
          const totalWeightGoalKg = firstWeightKg - goalWeightKg;
          const totalWeightGoalLbs = totalWeightGoalKg * 2.20462;
          
          console.log('[ShareProgress] Total weight goal (kg):', totalWeightGoalKg);
          console.log('[ShareProgress] Total weight goal (lbs):', totalWeightGoalLbs);

          // DEFENSIVE GUARD: Only calculate % if totalWeightGoalLbs > 0
          const isValidGoal = totalWeightGoalLbs > 0;
          if (isValidGoal) {
            weightGoalProgress = (weightLostLbs / totalWeightGoalLbs) * 100;
            console.log('[ShareProgress] Weight goal progress (%):', weightGoalProgress);
          } else {
            console.log('[ShareProgress] Total weight goal <= 0, cannot calculate %');
            weightGoalProgress = 0;
          }
        } else {
          console.log('[ShareProgress] Invalid goal weight, cannot calculate %');
        }
      } else {
        console.log('[ShareProgress] No goal weight set');
        // If no goal weight, assume 10% of starting weight as goal
        const assumedGoalLbs = (firstWeightKg * 2.20462) * 0.1;
        const hasAssumedGoal = assumedGoalLbs > 0;
        if (hasAssumedGoal) {
          weightGoalProgress = (weightLostLbs / assumedGoalLbs) * 100;
          console.log('[ShareProgress] Using assumed goal (10% of start), progress:', weightGoalProgress);
        }
      }

      // DEFENSIVE GUARD: Clamp progress between 0 and 100, handle NaN/Infinity
      if (isNaN(weightGoalProgress) || !isFinite(weightGoalProgress)) {
        console.log('[ShareProgress] Invalid progress value, setting to 0');
        weightGoalProgress = 0;
      } else {
        weightGoalProgress = Math.max(0, Math.min(100, Math.round(weightGoalProgress)));
      }

      // DEFENSIVE GUARD: Ensure weightLost is non-negative and rounded
      const finalWeightLost = Math.max(0, Math.round(weightLostLbs * 10) / 10);

      console.log('[ShareProgress] === FINAL VALUES ===');
      console.log('[ShareProgress] Weight goal progress:', weightGoalProgress);
      console.log('[ShareProgress] Weight lost:', finalWeightLost);

      return {
        weightGoalProgress,
        weightLost: finalWeightLost,
      };
    } catch (error) {
      console.error('[ShareProgress] Error calculating weight goal progress:', error);
      return { weightGoalProgress: 0, weightLost: 0 };
    }
  };

  /**
   * Calculate Day Streak
   * Consecutive days with at least one meal logged
   */
  const calculateDayStreak = async (userId: string, startDate: string): Promise<number> => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get all meals from start date to today
      const { data: allMeals } = await supabase
        .from('meals')
        .select('date, meal_items(calories)')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', today)
        .order('date', { ascending: false });

      if (!allMeals || allMeals.length === 0) {
        return 0;
      }

      // Find days with logged meals
      const daysWithData = new Set<string>();
      allMeals.forEach((meal: any) => {
        if (meal.meal_items && meal.meal_items.length > 0) {
          if (meal.meal_items.some((item: any) => item.calories > 0)) {
            daysWithData.add(meal.date);
          }
        }
      });

      // Calculate current streak (working backwards from today)
      let streak = 0;
      const currentDate = new Date(today + 'T00:00:00');
      const maxIterations = 1000; // Safety limit to prevent infinite loop
      
      while (streak < maxIterations) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // Safety check: don't go before start date
        if (dateStr < startDate) {
          break;
        }
        
        if (daysWithData.has(dateStr)) {
          streak++;
          currentDate.setDate(currentDate.getDate() - 1);
        } else {
          break;
        }
      }

      return streak;
    } catch (error) {
      console.error('[ShareProgress] Error calculating day streak:', error);
      return 0;
    }
  };

  /**
   * Get Progress Photos
   * Returns the most recent photo and the first photo (if available)
   */
  const getProgressPhotos = async (
    userId: string
  ): Promise<{ progressPhotoUrl?: string; beforePhotoUrl?: string }> => {
    try {
      const { data: photoCheckIns } = await supabase
        .from('check_ins')
        .select('photo_url, date')
        .eq('user_id', userId)
        .not('photo_url', 'is', null)
        .order('date', { ascending: true });

      if (!photoCheckIns || photoCheckIns.length === 0) {
        return {};
      }

      if (photoCheckIns.length === 1) {
        return { progressPhotoUrl: photoCheckIns[0].photo_url };
      }

      return {
        beforePhotoUrl: photoCheckIns[0].photo_url,
        progressPhotoUrl: photoCheckIns[photoCheckIns.length - 1].photo_url,
      };
    } catch (error) {
      console.error('[ShareProgress] Error getting progress photos:', error);
      return {};
    }
  };

  /**
   * Get Motivational Line
   * Based on consistency score, weight lost, and day streak
   */
  const getMotivationalLine = (
    consistencyScore: number,
    weightLost: number,
    dayStreak: number
  ): string => {
    if (dayStreak >= 14) {
      return 'Still showing up 💪';
    }
    if (consistencyScore >= 90) {
      return 'One step closer 🔥';
    }
    if (weightLost >= 5) {
      return 'Progress over perfection';
    }
    return 'Small wins add up';
  };

  const loadCardData = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[ShareProgress] Loading card data...');

      // Get user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.log('[ShareProgress] No user found');
        setLoading(false);
        return;
      }

      // Get user profile
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      // Get active goal
      const { data: goalData } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('is_active', true)
        .maybeSingle();

      const goal = goalData || {
        daily_calories: 2000,
        protein_g: 150,
        carbs_g: 200,
        fats_g: 65,
        fiber_g: 30,
        start_date: new Date().toISOString().split('T')[0],
      };

      // Determine journey start date
      let startDate: string;
      if (goalData?.start_date) {
        startDate = goalData.start_date;
      } else if (userData?.created_at) {
        startDate = userData.created_at.split('T')[0];
      } else {
        startDate = new Date().toISOString().split('T')[0];
      }

      console.log('[ShareProgress] Journey start date:', startDate);

      // ===== CALCULATE CONSISTENCY SCORE =====
      const consistencyScore = await calculateConsistencyScore(authUser.id, startDate, goal.protein_g || 150);
      console.log('[ShareProgress] Consistency Score:', consistencyScore);

      // ===== CALCULATE WEIGHT GOAL PROGRESS (% COMPLETE) =====
      const { weightGoalProgress, weightLost } = await calculateWeightGoalProgress(
        authUser.id,
        userData
      );
      console.log('[ShareProgress] Weight Goal Progress:', weightGoalProgress, '%');
      console.log('[ShareProgress] Weight Lost:', weightLost, 'lb');

      // ===== CALCULATE DAY STREAK =====
      const dayStreak = await calculateDayStreak(authUser.id, startDate);
      console.log('[ShareProgress] Day Streak:', dayStreak);

      // ===== GET PROGRESS PHOTOS =====
      const { progressPhotoUrl, beforePhotoUrl } = await getProgressPhotos(authUser.id);
      console.log('[ShareProgress] Progress Photo:', progressPhotoUrl);
      console.log('[ShareProgress] Before Photo:', beforePhotoUrl);

      // ===== GET MOTIVATIONAL LINE =====
      const motivationalLine = getMotivationalLine(consistencyScore, weightLost, dayStreak);
      console.log('[ShareProgress] Motivational Line:', motivationalLine);

      setCardData({
        consistencyScore,
        weightGoalProgress,
        weightLost,
        dayStreak,
        progressPhotoUrl,
        beforePhotoUrl,
        motivationalLine,
      });

      setLoading(false);
    } catch (error) {
      console.error('[ShareProgress] Error loading card data:', error);
      setLoading(false);
    }
  }, [calculateConsistencyScore]);

  useEffect(() => {
    loadCardData();
  }, [loadCardData]);

  const handleShare = async () => {
    if (!viewShotRef.current) {
      console.log('[ShareProgress] ViewShot ref not available');
      return;
    }

    try {
      setSharing(true);
      console.log('[ShareProgress] Capturing card...');

      // Capture the card as an image
      const uri = await viewShotRef.current.capture();
      console.log('[ShareProgress] Card captured:', uri);

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing not available', 'Sharing is not available on this device');
        setSharing(false);
        return;
      }
      
      console.log('[ShareProgress] Sharing is available, proceeding...');
      
      // Share the image
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share your progress',
      });

      console.log('[ShareProgress] Card shared successfully');
      setSharing(false);
    } catch (error) {
      console.error('[ShareProgress] Error sharing card:', error);
      Alert.alert('Error', 'Failed to share progress card');
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: isDark ? colors.backgroundDark : colors.background },
        ]}
        edges={['top']}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow_back"
              size={24}
              color={isDark ? colors.textDark : colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
            Share Progress
          </Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Preparing your progress card...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!cardData) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: isDark ? colors.backgroundDark : colors.background },
        ]}
        edges={['top']}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow_back"
              size={24}
              color={isDark ? colors.textDark : colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
            Share Progress
          </Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: isDark ? colors.textDark : colors.text }]}>
            Unable to load progress data
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.backgroundDark : colors.background },
      ]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
          Share Progress
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoCard}>
          <IconSymbol
            ios_icon_name="sparkles"
            android_material_icon_name="auto_awesome"
            size={24}
            color={colors.primary}
          />
          <Text style={[styles.infoText, { color: isDark ? colors.textDark : colors.text }]}>
            Your shareable progress card is ready! Designed to look amazing on Instagram, Stories, and all social platforms.
          </Text>
        </View>

        <View style={styles.cardPreview}>
          <ShareableProgressCard
            {...cardData}
            onCapture={(ref) => {
              viewShotRef.current = ref.current;
            }}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.shareButton,
            sharing && styles.shareButtonDisabled,
          ]}
          onPress={handleShare}
          disabled={sharing}
        >
          {sharing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <React.Fragment>
              <IconSymbol
                ios_icon_name="square.and.arrow.up"
                android_material_icon_name="share"
                size={24}
                color="#FFFFFF"
              />
              <Text style={styles.shareButtonText}>Share Your Progress</Text>
            </React.Fragment>
          )}
        </TouchableOpacity>

        <View style={styles.tipsCard}>
          <Text style={[styles.tipsTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Perfect for:
          </Text>
          <View style={styles.tipRow}>
            <Text style={styles.tipEmoji}>📸</Text>
            <Text style={[styles.tipText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Instagram posts and stories
            </Text>
          </View>
          <View style={styles.tipRow}>
            <Text style={styles.tipEmoji}>💬</Text>
            <Text style={[styles.tipText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              WhatsApp and iMessage group chats
            </Text>
          </View>
          <View style={styles.tipRow}>
            <Text style={styles.tipEmoji}>🎯</Text>
            <Text style={[styles.tipText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Motivating friends and accountability partners
            </Text>
          </View>
          <View style={styles.tipRow}>
            <Text style={styles.tipEmoji}>🔥</Text>
            <Text style={[styles.tipText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Celebrating your wins
            </Text>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
  },
  backButton: {
    padding: spacing.xs,
  },
  title: {
    ...typography.h2,
    fontSize: 20,
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
  },
  infoCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.primary + '15',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  infoText: {
    flex: 1,
    ...typography.body,
    fontSize: 14,
  },
  cardPreview: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    transform: [{ scale: 0.28 }],
    marginVertical: -420,
  },
  shareButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    boxShadow: '0px 4px 12px rgba(91, 154, 168, 0.3)',
    elevation: 4,
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  tipsCard: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: spacing.md,
  },
  tipsTitle: {
    ...typography.h3,
    fontSize: 18,
    marginBottom: spacing.xs,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tipEmoji: {
    fontSize: 20,
  },
  tipText: {
    flex: 1,
    ...typography.body,
    fontSize: 14,
  },
  bottomSpacer: {
    height: 40,
  },
});

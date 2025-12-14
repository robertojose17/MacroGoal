
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import ShareableProgressCard from '@/components/ShareableProgressCard';
import { supabase } from '@/app/integrations/supabase/client';
import { TouchableOpacity } from 'react-native-gesture-handler';

export default function ShareProgressScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [cardData, setCardData] = useState<any>(null);

  useEffect(() => {
    loadCardData();
  }, []);

  const loadCardData = async () => {
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

      const userName = userData?.name || 'Alex';
      setUser({ ...authUser, ...userData, displayName: userName });

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

      // Get today's nutrition data
      const today = new Date().toISOString().split('T')[0];
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
        .eq('user_id', authUser.id)
        .eq('date', today);

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

      // Calculate streak (last 7 days for demo)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const startDateStr = sevenDaysAgo.toISOString().split('T')[0];

      const { data: allMeals } = await supabase
        .from('meals')
        .select('date, meal_items(calories)')
        .eq('user_id', authUser.id)
        .gte('date', startDateStr)
        .lte('date', today);

      const daysWithData = new Set<string>();
      if (allMeals && allMeals.length > 0) {
        allMeals.forEach((meal: any) => {
          if (meal.meal_items && meal.meal_items.length > 0) {
            if (meal.meal_items.some((item: any) => item.calories > 0)) {
              daysWithData.add(meal.date);
            }
          }
        });
      }

      const streakDays = daysWithData.size;

      // Calculate protein accuracy
      const proteinAccuracy = goal.protein_g > 0
        ? Math.round((totalP / goal.protein_g) * 100)
        : 0;

      // Get weight data for weight lost calculation
      const { data: checkIns } = await supabase
        .from('check_ins')
        .select('weight, date')
        .eq('user_id', authUser.id)
        .not('weight', 'is', null)
        .order('date', { ascending: true });

      let weightLost = 0;
      if (checkIns && checkIns.length >= 2) {
        const firstWeight = checkIns[0].weight;
        const lastWeight = checkIns[checkIns.length - 1].weight;
        weightLost = Math.abs(firstWeight - lastWeight);
      }

      // Calculate discipline score (simplified version)
      const dailyTrackingScore = daysWithData.size >= 5 ? 40 : (daysWithData.size / 7) * 40;
      const streakScore = Math.min(35, streakDays * 5);
      const proteinScore = proteinAccuracy >= 95 && proteinAccuracy <= 105 ? 25 : 
                          proteinAccuracy >= 80 ? 20 : 
                          proteinAccuracy >= 60 ? 15 : 10;
      const disciplineScore = Math.round(dailyTrackingScore + streakScore + proteinScore);

      // Get photos for transformation
      const { data: photoCheckIns } = await supabase
        .from('check_ins')
        .select('photo_url, date')
        .eq('user_id', authUser.id)
        .not('photo_url', 'is', null)
        .order('date', { ascending: true });

      let leftPhotoUrl, rightPhotoUrl, leftPhotoDate, rightPhotoDate;
      if (photoCheckIns && photoCheckIns.length >= 2) {
        leftPhotoUrl = photoCheckIns[0].photo_url;
        leftPhotoDate = new Date(photoCheckIns[0].date + 'T00:00:00').toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        rightPhotoUrl = photoCheckIns[photoCheckIns.length - 1].photo_url;
        rightPhotoDate = new Date(photoCheckIns[photoCheckIns.length - 1].date + 'T00:00:00').toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }

      // Format date range
      const startDate = new Date(goal.start_date + 'T00:00:00');
      const dateRange = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - Today`;

      setCardData({
        userName,
        disciplineScore,
        dateRange,
        caloriesConsumed: totalCals,
        caloriesGoal: goal.daily_calories,
        protein: totalP,
        proteinGoal: goal.protein_g,
        carbs: totalC,
        carbsGoal: goal.carbs_g,
        fats: totalF,
        fatsGoal: goal.fats_g,
        fiber: totalFib,
        fiberGoal: goal.fiber_g,
        streakDays,
        proteinAccuracy,
        weightLost,
        leftPhotoUrl,
        rightPhotoUrl,
        leftPhotoDate,
        rightPhotoDate,
      });

      console.log('[ShareProgress] Card data loaded:', {
        disciplineScore,
        streakDays,
        proteinAccuracy,
        weightLost,
      });

      setLoading(false);
    } catch (error) {
      console.error('[ShareProgress] Error loading card data:', error);
      setLoading(false);
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
            ios_icon_name="info.circle.fill"
            android_material_icon_name="info"
            size={24}
            color={colors.primary}
          />
          <Text style={[styles.infoText, { color: isDark ? colors.textDark : colors.text }]}>
            Your shareable progress card is ready! This card is optimized for Instagram (1080x1080) and other social platforms.
          </Text>
        </View>

        <View style={styles.cardPreview}>
          <ShareableProgressCard {...cardData} />
        </View>

        <View style={styles.tipsCard}>
          <Text style={[styles.tipsTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Sharing Tips:
          </Text>
          <Text style={[styles.tipText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            - Perfect for Instagram posts and stories
          </Text>
          <Text style={[styles.tipText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            - Share to TikTok, X (Twitter), or Snapchat
          </Text>
          <Text style={[styles.tipText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            - Send to friends in group chats
          </Text>
          <Text style={[styles.tipText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            - Motivate others with your progress!
          </Text>
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
    transform: [{ scale: 0.35 }],
    marginVertical: -300,
  },
  tipsCard: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: spacing.sm,
  },
  tipsTitle: {
    ...typography.h3,
    fontSize: 18,
    marginBottom: spacing.xs,
  },
  tipText: {
    ...typography.body,
    fontSize: 14,
  },
  bottomSpacer: {
    height: 40,
  },
});

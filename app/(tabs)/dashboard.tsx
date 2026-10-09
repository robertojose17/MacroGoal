
import React, { useState, useCallback, useEffect, useRef, Component } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
  Pressable,
  Animated,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import PhotoProgressCard from '@/components/PhotoProgressCard';
import ConsistencyScore from '@/components/ConsistencyScore';
import GoalWeightCard from '@/components/GoalWeightCard';
import CheckInTilesCard from '@/components/CheckInTilesCard';

import { supabase } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';
import { useStreakStatus } from '@/hooks/useStreakStatus';
import { useWidget } from '@/contexts/WidgetContext';
import { usePremium } from '@/hooks/usePremium';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Local error boundary ─────────────────────────────────────────────────────
interface CardErrorBoundaryState { hasError: boolean; }
class CardErrorBoundary extends Component<{ children: React.ReactNode; label?: string }, CardErrorBoundaryState> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) {
    console.error('[Dashboard] CardErrorBoundary caught error in', this.props.label, ':', error);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

interface DailySummary {
  date: string;
  total_calories: number;
  total_protein: number;
}

function getGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'dashboard.goodMorning';
  if (hour < 18) return 'dashboard.goodAfternoon';
  return 'dashboard.goodEvening';
}

function SkeletonBlock({ height, isDark }: { height: number; isDark: boolean }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        styles.skeletonBlock,
        { height, backgroundColor: isDark ? colors.cardDark : colors.card, opacity },
      ]}
    />
  );
}

// ─── CoachInsightCard ─────────────────────────────────────────────────────────
interface CoachInsight {
  id: string;
  insight_text: string;
  cta_message: string | null;
  is_read: boolean;
  created_at: string;
}

function CoachInsightCard({ userId, isDark, isPremium }: { userId: string; isDark: boolean; isPremium: boolean }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [insight, setInsight] = useState<CoachInsight | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchInsight() {
      console.log('[CoachInsightCard] Fetching latest insight for user', userId);
      const { data, error } = await supabase
        .from('coach_daily_insights')
        .select('id, insight_text, cta_message, is_read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[CoachInsightCard] Error fetching insight:', error);
        return;
      }
      if (!cancelled) {
        console.log('[CoachInsightCard] Insight fetched:', data ? data.id : 'none');
        setInsight(data ?? null);
      }
    }
    fetchInsight();
    return () => { cancelled = true; };
  }, [userId]);

  const handleDismiss = useCallback(async () => {
    if (!insight) return;
    console.log('[CoachInsightCard] Dismiss pressed — marking insight as read:', insight.id);
    setDismissed(true);
    await supabase
      .from('coach_daily_insights')
      .update({ is_read: true })
      .eq('id', insight.id);
  }, [insight]);

  const handleCta = useCallback(() => {
    if (!insight) return;
    console.log('[CoachInsightCard] CTA pressed — navigating to coach tab with prefill, isPremium:', isPremium);
    if (isPremium) {
      const prefill = encodeURIComponent(`My coach detected this about me: "${insight.insight_text}" — let's talk about this.`);
      router.push(`/(tabs)/coach?prefill_message=${prefill}`);
    } else {
      const prefill = encodeURIComponent(`I saw you detected something specific about my progress. What did you find?`);
      router.push(`/(tabs)/coach?prefill_message=${prefill}`);
    }
  }, [router, isPremium, insight]);

  if (dismissed || !insight) return null;
  if (!insight.insight_text) return null;

  // Only show insights from the last 24 hours
  const createdAt = new Date(insight.created_at).getTime();
  const now = Date.now();
  if (now - createdAt > 24 * 60 * 60 * 1000) return null;

  const cardBg = isDark ? '#0D1F2D' : '#F0F7FF';
  const borderColor = colors.primary + '25';
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const fullText = insight.insight_text;
  const truncated = fullText.length > 80;
  const displayText = !isPremium && truncated ? fullText.slice(0, 80) + '...' : fullText;

  const ctaLabel = isPremium ? t('coachInsight.talkToCoach') : t('coachInsight.viewFullAnalysis');

  return (
    <View style={[coachStyles.card, { backgroundColor: cardBg, borderColor }]}>
      {/* Header row */}
      <View style={coachStyles.headerRow}>
        <View style={coachStyles.titleRow}>
          <IconSymbol
            ios_icon_name="sparkles"
            android_material_icon_name="auto_awesome"
            size={16}
            color={colors.primary}
          />
          <Text style={[coachStyles.title, { color: textColor }]}>
            {t('coachInsight.title')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={coachStyles.dismissBtn}
        >
          <Text style={[coachStyles.dismissText, { color: subColor }]}>×</Text>
        </TouchableOpacity>
      </View>

      {/* Insight text */}
      <Text style={[coachStyles.insightText, { color: textColor }]}>
        {displayText}
      </Text>

      {/* CTA row */}
      <TouchableOpacity onPress={handleCta} style={coachStyles.ctaRow}>
        <Text style={[coachStyles.ctaText, { color: colors.primary }]}>
          {ctaLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const coachStyles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dismissBtn: {
    padding: 2,
  },
  dismissText: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '400',
  },
  insightText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    marginBottom: spacing.sm,
  },
  ctaRow: {
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.primary + '30',
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

// ─── InlineStreakBadge ────────────────────────────────────────────────────────
function InlineStreakBadge({ isDark }: { isDark: boolean }) {
  const { t } = useTranslation();
  const { streak } = useStreakStatus();
  const streakValue = streak?.current_streak ?? 0;
  if (streakValue === 0) return null;
  const textColor = isDark ? colors.textDark : colors.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <IconSymbol ios_icon_name="flame.fill" android_material_icon_name="local_fire_department" size={14} color={colors.primary} />
      <Text style={{ fontSize: 15, fontWeight: '600', color: textColor }}>
        {streakValue}
      </Text>
      <Text style={{ fontSize: 15, fontWeight: '400', color: textColor }}>
        {t('common.days')}
      </Text>
    </View>
  );
}

// ─── StreakPill ───────────────────────────────────────────────────────────────
function StreakPill({ isDark }: { isDark: boolean }) {
  const { t } = useTranslation();
  const { streak } = useStreakStatus();

  const streakValue = streak?.current_streak ?? 0;

  if (streakValue === 0) return null;

  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  return (
    <View
      style={[
        styles.pillContainer,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
        },
      ]}
    >
      <View style={styles.pillRow}>
        <View style={styles.pillSegment}>
          <IconSymbol ios_icon_name="flame.fill" android_material_icon_name="local_fire_department" size={16} color={colors.primary} />
          <Text style={[styles.pillText, { color: textColor }]}>
            {streakValue}
          </Text>
          <Text style={[styles.pillSubText, { color: subColor }]}>
            {' '}{t('common.days')}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [goal, setGoal] = useState<any>(null);
  const [todaySummary, setTodaySummary] = useState<DailySummary | null>(null);

  const { syncWidget } = useWidget();
  const { isPremium } = usePremium();

  const loadTodaySummary = useCallback(async (userId: string, date: string) => {
    try {
      const { data: mealsData } = await supabase
        .from('meals')
        .select(`meal_items (calories, protein, carbs, fats, fiber)`)
        .eq('user_id', userId)
        .eq('date', date);

      let totalCals = 0;
      let totalP = 0;

      if (mealsData && mealsData.length > 0) {
        mealsData.forEach((meal: any) => {
          if (meal.meal_items) {
            meal.meal_items.forEach((item: any) => {
              totalCals += item.calories || 0;
              totalP += item.protein || 0;
            });
          }
        });
      }

      setTodaySummary({ date, total_calories: totalCals, total_protein: totalP });
    } catch (error) {
      console.error('[Dashboard] Error loading today summary:', error);
    }
  }, []);

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

      const [userRes, goalRes] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).maybeSingle(),
        supabase.from('goals').select('*').eq('user_id', authUser.id).eq('is_active', true).maybeSingle(),
      ]);

      if (userRes.data) {
        setUser({ ...authUser, ...userRes.data });
      }
      if (goalRes.data) {
        setGoal(goalRes.data);
      }

      const today = toLocalDateString();
      await loadTodaySummary(authUser.id, today);
      syncWidget();
    } catch (error) {
      console.error('[Dashboard] Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadTodaySummary, syncWidget]);

  useFocusEffect(
    useCallback(() => {
      console.log('[Dashboard] Screen focused, loading data');
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    console.log('[Dashboard] Pull-to-refresh triggered');
    setRefreshing(true);
    try {
      await AsyncStorage.removeItem('steps_reporter_last_report_ts');
    } catch {}
    loadData();
  }, [loadData]);

  const greetingKey = getGreetingKey();
  const greeting = t(greetingKey);
  const firstName = user?.name?.split(' ')[0] || t('dashboard.there');

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
        edges={['top']}
      >
        <View style={[styles.header, { borderBottomColor: isDark ? colors.borderDark : colors.border, backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
          <View style={styles.greetingColumn}>
            <View style={[styles.skeletonText, { width: 180, height: 22, backgroundColor: isDark ? colors.cardDark : colors.card }]} />
            <View style={[styles.skeletonText, { width: 140, height: 14, marginTop: 6, backgroundColor: isDark ? colors.cardDark : colors.card }]} />
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <SkeletonBlock height={44} isDark={isDark} />
          <SkeletonBlock height={280} isDark={isDark} />
          <SkeletonBlock height={180} isDark={isDark} />
          <SkeletonBlock height={120} isDark={isDark} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      {/* ── Fixed Header ── */}
      <View style={[styles.header, { borderBottomColor: isDark ? colors.borderDark : colors.border, backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
        <View style={styles.greetingColumn}>
          <Text style={[styles.greetingSmall, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {greeting}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.greetingName, { color: isDark ? colors.textDark : colors.text }]}>
              {firstName}
            </Text>
            <InlineStreakBadge isDark={isDark} />
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.headerIconBtn}
            onPress={() => {
              console.log('[Dashboard] Bug report icon pressed');
              router.push('/bug-report?tab_source=dashboard');
            }}
          >
            <IconSymbol
              ios_icon_name="ladybug"
              android_material_icon_name="bug_report"
              size={22}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => {
              console.log('[Dashboard] Top share icon pressed — navigating to share-progress');
              router.push('/share-progress?variant=level');
            }}
          >
            <IconSymbol
              ios_icon_name="square.and.arrow.up"
              android_material_icon_name="share"
              size={24}
              color={colors.primary}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        scrollEventThrottle={16}
      >
        {/* ── Coach Insight Card ── */}
        {user && (
          <CardErrorBoundary label="CoachInsightCard">
            <CoachInsightCard userId={user.id} isDark={isDark} isPremium={isPremium} />
          </CardErrorBoundary>
        )}

        {/* ── Consistency Score ── */}
        {user && (
          <CardErrorBoundary label="ConsistencyScore">
            <ConsistencyScore userId={user.id} isDark={isDark} />
          </CardErrorBoundary>
        )}

        {/* ── Goal Weight Card ── */}
        {user && (
          <CardErrorBoundary label="GoalWeightCard">
            <GoalWeightCard
              userId={user.id}
              isDark={isDark}
              currentWeightKg={user.current_weight ?? null}
              goalWeightKg={user.goal_weight ?? null}
              startWeightKg={user.journey_start_weight ?? null}
            />
          </CardErrorBoundary>
        )}

        {/* ── Check-In Tiles Card ── */}
        {user && (
          <CardErrorBoundary label="CheckInTilesCard">
            <CheckInTilesCard
              isDark={isDark}
              userId={user.id}
              goal={{
                ...goal,
                today_calories: todaySummary?.total_calories ?? 0,
                today_protein: todaySummary?.total_protein ?? 0,
              }}
              onXpRefresh={() => {
                console.log('[Dashboard] CheckInTilesCard refresh requested');
              }}
            />
          </CardErrorBoundary>
        )}

        {/* ── Photo Progress Card ── */}
        {user && (
          <CardErrorBoundary label="PhotoProgressCard">
            <PhotoProgressCard userId={user.id} isDark={isDark} />
          </CardErrorBoundary>
        )}

        {/* ── Share My Progress button ── */}
        <TouchableOpacity
          style={[
            styles.shareProgressButton,
            {
              backgroundColor: isDark ? colors.cardDark : colors.card,
              borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
            },
          ]}
          onPress={() => {
            console.log('[Dashboard] Share My Progress pressed');
            router.push('/share-progress?variant=level');
          }}
          activeOpacity={0.75}
        >
          <Text style={[styles.shareProgressTitle, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
            {t('dashboard.shareMyProgress')}
          </Text>
        </TouchableOpacity>

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
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerIconBtn: {
    padding: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingColumn: {
    flex: 1,
  },
  greetingSmall: {
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 2,
  },
  greetingName: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  shareButton: {
    padding: spacing.xs,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 32,
  },
  bottomSpacer: {
    height: 48,
  },
  skeletonBlock: {
    borderRadius: borderRadius.xl,
    marginBottom: spacing.md,
  },
  skeletonText: {
    borderRadius: borderRadius.sm,
  },
  // ── Streak + League Pill ──────────────────────────────────────────────────
  pillContainer: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  pillTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillSegment: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  pillEmoji: {
    fontSize: 13,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pillSubText: {
    fontSize: 12,
    fontWeight: '500',
  },
  pillDot: {
    fontSize: 14,
    fontWeight: '300',
    marginHorizontal: 2,
  },
  pillChevron: {
    fontSize: 18,
    fontWeight: '300',
    marginLeft: 'auto' as any,
  },
  // ── Share progress button ─────────────────────────────────────────────────
  shareProgressButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  shareProgressTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

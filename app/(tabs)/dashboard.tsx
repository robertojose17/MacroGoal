
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
  Linking,
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
import { useXpStatus } from '@/hooks/useXpStatus';
import { useLeague } from '@/hooks/useLeague';
import { usePremium } from '@/hooks/usePremium';
import { emitXpRefresh } from '@/utils/xpEvents';
import { useWidget } from '@/contexts/WidgetContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LeagueLeaderboard from '@/components/xp/LeagueLeaderboard';
import { TIER_METADATA } from '@/types/leagues';

const FEATURED_DISMISSED_KEY = 'featured_card_dismissed_v1';

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

// ─── StreakLeaguePill ─────────────────────────────────────────────────────────
function StreakLeaguePill({ isDark }: { isDark: boolean }) {
  const { t } = useTranslation();
  const xp = useXpStatus();
  const league = useLeague();
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const streak = xp.status?.current_streak ?? 0;
  const leagueStatus = league.status;

  if (!xp.status && !leagueStatus) return null;

  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const tierMeta = leagueStatus ? TIER_METADATA[leagueStatus.tier] : null;
  const leagueLabel = tierMeta ? tierMeta.label : null;
  const leaguePosition = leagueStatus ? leagueStatus.user_position : null;

  const handlePress = () => {
    console.log('[Dashboard] StreakLeaguePill tapped — opening LeagueLeaderboard');
    setShowLeaderboard(true);
  };

  return (
    <>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.pillContainer,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text style={[styles.pillTitle, { color: textColor }]}>{t('dashboard.streakLeagueTitle')}</Text>
        <View style={styles.pillRow}>
          {streak > 0 && (
            <View style={styles.pillSegment}>
              <Text style={styles.pillEmoji}>🔥</Text>
              <Text style={[styles.pillText, { color: textColor }]}>
                {streak}
              </Text>
              <Text style={[styles.pillSubText, { color: subColor }]}>
                {' '}{t('common.days')}
              </Text>
            </View>
          )}
          {streak > 0 && leagueLabel && (
            <Text style={[styles.pillDot, { color: subColor }]}>·</Text>
          )}
          {leagueLabel && (
            <View style={styles.pillSegment}>
              <Text style={styles.pillEmoji}>{tierMeta?.emoji ?? '🏆'}</Text>
              <Text style={[styles.pillText, { color: textColor }]}>{leagueLabel}</Text>
              {leaguePosition != null && (
                <Text style={[styles.pillSubText, { color: subColor }]}>
                  {' #'}{leaguePosition}
                </Text>
              )}
            </View>
          )}
          <Text style={[styles.pillChevron, { color: subColor }]}>›</Text>
        </View>
      </Pressable>

      <LeagueLeaderboard
        visible={showLeaderboard}
        onClose={() => {
          console.log('[Dashboard] LeagueLeaderboard closed from pill');
          setShowLeaderboard(false);
        }}
      />
    </>
  );
}

// ─── FeaturedCard ─────────────────────────────────────────────────────────────
function FeaturedCard({ isDark }: { isDark: boolean }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(FEATURED_DISMISSED_KEY).then((val) => {
      if (!val) {
        setDismissed(false);
        return;
      }
      // Check if dismissed today
      try {
        const { date } = JSON.parse(val);
        const today = toLocalDateString(new Date());
        setDismissed(date === today);
      } catch {
        setDismissed(false);
      }
    });
  }, []);

  const handleDismiss = () => {
    console.log('[Dashboard] FeaturedCard dismissed');
    const today = toLocalDateString(new Date());
    AsyncStorage.setItem(FEATURED_DISMISSED_KEY, JSON.stringify({ date: today }));
    setDismissed(true);
  };

  const handleLearnMore = () => {
    console.log('[Dashboard] FeaturedCard "Learn More" tapped — opening https://macrogoal.app');
    Linking.openURL('https://macrogoal.app');
  };

  if (dismissed === null || dismissed === true) return null;

  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const logoBg = isDark ? '#2A2C40' : '#F3F4F6';

  return (
    <View style={[styles.featuredCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      <View style={styles.featuredHeader}>
        <View style={styles.featuredBadge}>
          <Text style={styles.featuredBadgeText}>⭐ FEATURED</Text>
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Text style={[styles.featuredClose, { color: subColor }]}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.featuredBody}>
        <View style={[styles.featuredLogo, { backgroundColor: logoBg }]}>
          <Text style={styles.featuredLogoEmoji}>🏪</Text>
        </View>
        <View style={styles.featuredTextCol}>
          <Text style={[styles.featuredTitle, { color: textColor }]}>{t('dashboard.featuredTitle')}</Text>
          <Text style={[styles.featuredSub, { color: subColor }]}>{t('dashboard.featuredSub')}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.featuredCta}
        onPress={handleLearnMore}
        activeOpacity={0.8}
      >
        <Text style={styles.featuredCtaText}>{t('dashboard.featuredCta')}</Text>
      </TouchableOpacity>
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

  const xp = useXpStatus();
  const { isPremium } = usePremium();
  const { syncWidget } = useWidget();

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
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <View style={[styles.skeletonText, { width: 180, height: 22, backgroundColor: isDark ? colors.cardDark : colors.card }]} />
              <View style={[styles.skeletonText, { width: 140, height: 14, marginTop: 6, backgroundColor: isDark ? colors.cardDark : colors.card }]} />
            </View>
          </View>
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        scrollEventThrottle={16}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.greetingColumn}>
            <Text style={[styles.greetingSmall, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {greeting}
            </Text>
            <Text style={[styles.greetingName, { color: isDark ? colors.textDark : colors.text }]}>
              {firstName}
            </Text>
          </View>
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

        {/* ── Streak + League Pill ── */}
        <CardErrorBoundary label="StreakLeaguePill">
          <StreakLeaguePill isDark={isDark} />
        </CardErrorBoundary>

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
                console.log('[Dashboard] CheckInTilesCard XP refresh requested');
                xp.refresh();
                emitXpRefresh();
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

        {/* ── Featured Card (free users only) ── */}
        {!isPremium && (
          <CardErrorBoundary label="FeaturedCard">
            <FeaturedCard isDark={isDark} />
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
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
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
  // ── Featured Card ─────────────────────────────────────────────────────────
  featuredCard: {
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
  featuredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  featuredBadge: {
    backgroundColor: colors.primary + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  featuredBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  featuredClose: {
    fontSize: 14,
    fontWeight: '600',
  },
  featuredBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  featuredLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredLogoEmoji: {
    fontSize: 24,
  },
  featuredTextCol: {
    flex: 1,
  },
  featuredTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  featuredSub: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  featuredCta: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  featuredCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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

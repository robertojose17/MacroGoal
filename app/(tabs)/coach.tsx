
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  Image,
  ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type Confidence = 'high' | 'moderate' | 'low';
type ProgressDirection = 'losing' | 'gaining' | 'stable' | 'insufficient_data';
type InsightType =
  | 'pattern_detected'
  | 'positive_reinforcement'
  | 'risk'
  | 'missing_data'
  | 'milestone'
  | 'behavior_correlation';

type CoachDashboard = {
  greeting: string;
  coach_focus: {
    headline: string;
    instruction: string;
    why: string;
    do_not_change: string;
    next_review: string;
    confidence: Confidence;
  };
  today_plan: {
    summary: string;
    biggest_opportunity: string;
    cta_label: string;
    cta_prompt: string;
  };
  weekly_execution: {
    score: number;
    score_label: string;
    breakdown_summary: string;
    vs_last_week: string;
    what_drove_score: string;
  };
  progress_trend: {
    direction: ProgressDirection;
    weekly_rate_display: string;
    vs_expected: string;
    interpretation: string;
    data_note: string;
  };
  recommendation: {
    title: string;
    what: string;
    why: string;
    current_value: string;
    proposed_value: string;
    expected_impact: string;
    trial_duration: string;
    review_date: string;
    action_type: string;
    proposed_numeric: number;
    current_numeric: number;
  } | null;
  insight: {
    type: InsightType;
    title: string;
    explanation: string;
    evidence: string;
    recommended_action: string;
    cta_label: string;
    cta_prompt: string;
  } | null;
  quick_actions: {
    label: string;
    ios_icon: string;
    android_icon: string;
    prompt: string;
  }[];
  computed: {
    calories_goal: number;
    calories_logged: number;
    calories_remaining: number;
    protein_goal: number;
    protein_logged: number;
    protein_remaining: number;
    meals_logged_today: number;
    score: number;
    score_breakdown: {
      calories: number;
      protein: number;
      steps: number;
      logging: number;
      weighins: number;
    };
    weekly_rate: number;
    weight_unit: string;
    weight_entries_last_14: number;
    status: string;
    confidence: string;
    data_sufficient: boolean;
    days_logged_last_7: number;
  };
  active_experiment: {
    id: string;
    variable: string;
    previous_value: number;
    new_value: number;
    reason: string;
    started_at: string;
    review_at: string;
    adherence_pct: number | null;
  } | null;
  recent_insights: {
    id: string;
    type: string;
    title: string;
    explanation: string;
    status: string;
    created_at: string;
  }[];
  generated_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_KEY = 'coach_dashboard_cache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const STATUS_COLORS: Record<string, string> = {
  on_track: '#10B981',
  ahead: '#3B82F6',
  behind: '#EF4444',
  plateau: '#F59E0B',
  low_adherence: '#F59E0B',
  insufficient_data: '#6B7280',
};

const INSIGHT_TYPE_COLORS: Record<InsightType, string> = {
  pattern_detected: '#8B5CF6',
  positive_reinforcement: '#10B981',
  risk: '#EF4444',
  missing_data: '#6B7280',
  milestone: '#F59E0B',
  behavior_correlation: '#3B82F6',
};

const INSIGHT_TYPE_LABELS: Record<InsightType, string> = {
  pattern_detected: 'Pattern',
  positive_reinforcement: 'Win',
  risk: 'Risk',
  missing_data: 'Missing Data',
  milestone: 'Milestone',
  behavior_correlation: 'Correlation',
};

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  high: '#10B981',
  moderate: '#F59E0B',
  low: '#6B7280',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

function getStatusColor(status: string): string {
  const key = status.toLowerCase().replace(/\s+/g, '_');
  return STATUS_COLORS[key] ?? '#6B7280';
}

function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatVariableName(variable: string): string {
  return variable
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function calcExperimentProgress(startedAt: string, reviewAt: string): number {
  const start = new Date(startedAt).getTime();
  const end = new Date(reviewAt).getTime();
  const now = Date.now();
  if (end <= start) return 0;
  return Math.min(Math.max((now - start) / (end - start), 0), 1);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// ─── SkeletonBlock ────────────────────────────────────────────────────────────

function SkeletonBlock({
  width,
  height,
  isDark,
  style,
}: {
  width?: number | string;
  height: number;
  isDark: boolean;
  style?: object;
}) {
  return (
    <View
      style={[
        {
          width: width ?? '100%',
          height,
          borderRadius: borderRadius.md,
          backgroundColor: isDark ? '#3A3C52' : '#D4D6DA',
          opacity: 0.4,
        },
        style,
      ]}
    />
  );
}

// ─── MacroProgressBar ─────────────────────────────────────────────────────────

function MacroProgressBar({
  label,
  logged,
  goal,
  remaining,
  barColor,
  isDark,
}: {
  label: string;
  logged: number;
  goal: number;
  remaining: number;
  barColor: string;
  isDark: boolean;
}) {
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const trackColor = isDark ? '#3A3C52' : '#E5E7EB';
  const safeGoal = goal > 0 ? goal : 1;
  const pct = Math.min(logged / safeGoal, 1);
  const pctDisplay = Math.round(pct * 100);
  const remainingDisplay = Math.max(remaining, 0);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: textColor }}>{label}</Text>
        <Text style={{ fontSize: 11, color: subColor }}>{pctDisplay}%</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: trackColor, overflow: 'hidden' }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: barColor, width: `${pctDisplay}%` }} />
      </View>
      <Text style={{ fontSize: 11, color: subColor, marginTop: 3 }}>
        {logged}
        {' / '}
        {goal}
        {' · '}
        {remainingDisplay}
        {' left'}
      </Text>
    </View>
  );
}

// ─── ScoreBreakdownRow ────────────────────────────────────────────────────────

function ScoreBreakdownRow({
  label,
  pts,
  color,
  isDark,
}: {
  label: string;
  pts: number;
  color: string;
  isDark: boolean;
}) {
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 12, color: subColor, flex: 1 }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: '600', color: textColor }}>{pts}pts</Text>
    </View>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ text, isDark }: { text: string; isDark: boolean }) {
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: subColor, marginBottom: spacing.sm }}>
      {text}
    </Text>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function Card({
  children,
  isDark,
  style,
  onPress,
}: {
  children: React.ReactNode;
  isDark: boolean;
  style?: object;
  onPress?: () => void;
}) {
  const cardBg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  const inner = (
    <View
      style={[
        {
          backgroundColor: cardBg,
          borderRadius: 16,
          padding: spacing.md,
          borderWidth: 1,
          borderColor,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.2 : 0.06,
          shadowRadius: 8,
          elevation: 2,
          marginHorizontal: spacing.md,
          marginBottom: spacing.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

// ─── SkeletonHub ──────────────────────────────────────────────────────────────

function SkeletonHub({ isDark }: { isDark: boolean }) {
  const cardBg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  const skCard = (children: React.ReactNode) => (
    <View
      style={{
        backgroundColor: cardBg,
        borderRadius: 16,
        padding: spacing.md,
        borderWidth: 1,
        borderColor,
        marginHorizontal: spacing.md,
        marginBottom: spacing.md,
      }}
    >
      {children}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* Greeting */}
      <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 8 }}>
        <SkeletonBlock height={22} width="55%" isDark={isDark} />
        <SkeletonBlock height={14} width="30%" isDark={isDark} />
      </View>

      {/* Coach Focus */}
      {skCard(
        <View style={{ gap: 10 }}>
          <SkeletonBlock height={11} width="35%" isDark={isDark} />
          <SkeletonBlock height={28} isDark={isDark} />
          <SkeletonBlock height={18} width="80%" isDark={isDark} />
          <SkeletonBlock height={14} isDark={isDark} />
        </View>
      )}

      {/* Today's Plan */}
      {skCard(
        <View style={{ gap: 10 }}>
          <SkeletonBlock height={11} width="30%" isDark={isDark} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <SkeletonBlock height={60} isDark={isDark} style={{ flex: 1 }} />
            <SkeletonBlock height={60} isDark={isDark} style={{ flex: 1 }} />
          </View>
          <SkeletonBlock height={14} isDark={isDark} />
          <SkeletonBlock height={40} isDark={isDark} />
        </View>
      )}

      {/* Score + Trend */}
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.sm, marginBottom: spacing.md }}>
        <View style={{ flex: 1, backgroundColor: cardBg, borderRadius: 16, padding: spacing.md, borderWidth: 1, borderColor, gap: 8 }}>
          <SkeletonBlock height={11} width="70%" isDark={isDark} />
          <SkeletonBlock height={40} width={60} isDark={isDark} />
          <SkeletonBlock height={12} isDark={isDark} />
          <SkeletonBlock height={12} isDark={isDark} />
        </View>
        <View style={{ flex: 1, backgroundColor: cardBg, borderRadius: 16, padding: spacing.md, borderWidth: 1, borderColor, gap: 8 }}>
          <SkeletonBlock height={11} width="60%" isDark={isDark} />
          <SkeletonBlock height={32} width={80} isDark={isDark} />
          <SkeletonBlock height={12} isDark={isDark} />
        </View>
      </View>

      {/* Quick Actions */}
      <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.md, gap: 8 }}>
        <SkeletonBlock height={11} width="30%" isDark={isDark} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} height={72} width={88} isDark={isDark} style={{ borderRadius: 12 }} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CoachScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<CoachDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weightUnit, setWeightUnit] = useState<string>('lb');
  const [focusExpanded, setFocusExpanded] = useState(false);
  const [dismissedRecommendation, setDismissedRecommendation] = useState(false);
  const isMountedRef = useRef(true);

  // ── Colors ────────────────────────────────────────────────────────────────
  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;

  // ── Load dashboard ────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async (showSkeleton = false) => {
    console.log('[CoachHub] loadDashboard called, showSkeleton:', showSkeleton);
    if (showSkeleton) setLoading(true);
    setError(null);

    try {
      // Resolve weight unit
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[CoachHub] No authenticated user');
        if (isMountedRef.current) setLoading(false);
        return;
      }

      const { data: prefData } = await supabase
        .from('users')
        .select('preferred_units')
        .eq('id', user.id)
        .maybeSingle();
      const resolvedUnit = prefData?.preferred_units === 'metric' ? 'kg' : 'lb';
      if (isMountedRef.current) setWeightUnit(resolvedUnit);

      // Check cache
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed: CoachDashboard = JSON.parse(cached);
          const age = Date.now() - new Date(parsed.generated_at).getTime();
          if (age < CACHE_TTL_MS) {
            console.log('[CoachHub] Cache hit, age:', Math.round(age / 1000), 's');
            if (isMountedRef.current) {
              setDashboard(parsed);
              setLoading(false);
            }
            // Still fetch fresh in background
            fetchFreshDashboard(resolvedUnit);
            return;
          } else {
            console.log('[CoachHub] Cache expired, age:', Math.round(age / 1000), 's');
          }
        }
      } catch (cacheErr) {
        console.warn('[CoachHub] Cache read error:', cacheErr);
      }

      // No valid cache — fetch fresh and show skeleton
      if (isMountedRef.current) setLoading(true);
      await fetchFreshDashboard(resolvedUnit);
    } catch (err: any) {
      console.error('[CoachHub] loadDashboard error:', err?.message ?? err);
      if (isMountedRef.current) {
        setError('Couldn\'t load your coaching data');
        setLoading(false);
      }
    }
  }, []);

  const fetchFreshDashboard = async (unit: string) => {
    console.log('[CoachHub] fetchFreshDashboard, weight_unit:', unit);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const jwt = session?.access_token;

      console.log('[CoachHub] POST /functions/v1/get-coach-dashboard');
      const response = await fetch(`${SUPABASE_URL}/functions/v1/get-coach-dashboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt ?? SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ weight_unit: unit }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[CoachHub] get-coach-dashboard HTTP error:', response.status, errText.slice(0, 200));
        throw new Error(`HTTP ${response.status}`);
      }

      const data: CoachDashboard = await response.json();
      console.log('[CoachHub] Dashboard received, generated_at:', data.generated_at);

      // Cache it
      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch (cacheErr) {
        console.warn('[CoachHub] Cache write error:', cacheErr);
      }

      if (isMountedRef.current) {
        setDashboard(data);
        setLoading(false);
        setError(null);
      }
    } catch (err: any) {
      console.error('[CoachHub] fetchFreshDashboard error:', err?.message ?? err);
      if (isMountedRef.current) {
        setError('Couldn\'t load your coaching data');
        setLoading(false);
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      console.log('[CoachHub] Tab focused — reloading dashboard');
      setDismissedRecommendation(false);
      loadDashboard(true);
      return () => {
        isMountedRef.current = false;
      };
    }, [loadDashboard])
  );

  // ── Accept Recommendation ─────────────────────────────────────────────────

  const handleAcceptRecommendation = useCallback(async (rec: NonNullable<CoachDashboard['recommendation']>) => {
    console.log('[CoachHub] Accept recommendation pressed, action_type:', rec.action_type, 'proposed_numeric:', rec.proposed_numeric);
    try {
      if (rec.action_type === 'update_goal') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        console.log('[CoachHub] Updating goals table for user:', user.id);
        // Deactivate current active goal
        await supabase
          .from('goals')
          .update({ is_active: false })
          .eq('user_id', user.id)
          .eq('is_active', true);

        // Insert new goal
        const { error: insertErr } = await supabase
          .from('goals')
          .insert({
            user_id: user.id,
            calories: rec.proposed_numeric,
            is_active: true,
            created_at: new Date().toISOString(),
          });

        if (insertErr) {
          console.error('[CoachHub] Goal insert error:', insertErr.message);
          Alert.alert('Error', 'Could not update your goal. Please try again.');
          return;
        }

        console.log('[CoachHub] Goal updated successfully');
      }

      Alert.alert('Done!', 'Recommendation accepted. Your coach will track the results.');
      setDismissedRecommendation(true);

      // Invalidate cache and reload
      await AsyncStorage.removeItem(CACHE_KEY);
      loadDashboard(false);
    } catch (err: any) {
      console.error('[CoachHub] handleAcceptRecommendation error:', err?.message ?? err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  }, [loadDashboard]);

  // ── Navigate to chat ──────────────────────────────────────────────────────

  const openChat = useCallback((prompt?: string) => {
    if (prompt) {
      console.log('[CoachHub] Opening chat with prompt:', prompt.slice(0, 60));
      router.push(`/ai-coach?prompt=${encodeURIComponent(prompt)}`);
    } else {
      console.log('[CoachHub] Opening chat (no prompt)');
      router.push('/ai-coach');
    }
  }, [router]);

  // ── Render sections ───────────────────────────────────────────────────────

  const renderGreeting = (d: CoachDashboard) => {
    const statusColor = getStatusColor(d.computed.status);
    const statusLabel = formatStatusLabel(d.computed.status);
    const confidenceText = d.computed.confidence === 'high'
      ? '(high confidence)'
      : d.computed.confidence === 'moderate'
        ? '(moderate confidence)'
        : '(limited data)';

    return (
      <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.md }}>
        <Text style={{ ...typography.h3, color: textColor, marginBottom: 6 }}>{d.greeting}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: statusColor + '22', borderRadius: borderRadius.full, paddingHorizontal: 10, paddingVertical: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
          </View>
          <Text style={{ fontSize: 12, color: subColor }}>{confidenceText}</Text>
        </View>
      </View>
    );
  };

  const renderCoachFocus = (d: CoachDashboard) => {
    const conf = d.coach_focus.confidence;
    const confColor = CONFIDENCE_COLORS[conf] ?? '#6B7280';
    const confLabel = conf.charAt(0).toUpperCase() + conf.slice(1);

    return (
      <Card isDark={isDark} style={{ borderWidth: 2, borderColor: colors.primary + '40' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
          <SectionLabel text="YOUR FOCUS TODAY" isDark={isDark} />
          <View style={{ backgroundColor: confColor + '22', borderRadius: borderRadius.full, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: confColor }}>{confLabel}</Text>
          </View>
        </View>

        {!d.computed.data_sufficient && (
          <View style={{ backgroundColor: '#F59E0B22', borderRadius: borderRadius.sm, padding: spacing.sm, marginBottom: spacing.sm }}>
            <Text style={{ fontSize: 13, color: '#F59E0B', fontWeight: '600' }}>Keep logging to unlock personalized coaching</Text>
            <Text style={{ fontSize: 12, color: subColor, marginTop: 2 }}>Log your meals and weight daily for the best insights.</Text>
          </View>
        )}

        <Text style={{ ...typography.h2, color: textColor, marginBottom: spacing.sm }}>{d.coach_focus.headline}</Text>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.primary, lineHeight: 22, marginBottom: spacing.sm }}>{d.coach_focus.instruction}</Text>

        <TouchableOpacity
          onPress={() => {
            console.log('[CoachHub] Coach Focus "Why?" toggled, expanded:', !focusExpanded);
            setFocusExpanded((v) => !v);
          }}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: subColor }}>Why?</Text>
          <IconSymbol
            ios_icon_name={focusExpanded ? 'chevron.up' : 'chevron.down'}
            android_material_icon_name={focusExpanded ? 'expand-less' : 'expand-more'}
            size={14}
            color={subColor}
          />
        </TouchableOpacity>

        {focusExpanded && (
          <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
            <Text style={{ fontSize: 14, color: textColor, lineHeight: 20 }}>{d.coach_focus.why}</Text>
            {d.coach_focus.do_not_change ? (
              <View style={{ backgroundColor: isDark ? '#3A3C52' : '#F3F4F6', borderRadius: borderRadius.sm, padding: spacing.sm }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: subColor, marginBottom: 2 }}>DO NOT CHANGE</Text>
                <Text style={{ fontSize: 13, color: textColor }}>{d.coach_focus.do_not_change}</Text>
              </View>
            ) : null}
            {d.coach_focus.next_review ? (
              <Text style={{ fontSize: 12, color: subColor }}>Next review: {d.coach_focus.next_review}</Text>
            ) : null}
          </View>
        )}
      </Card>
    );
  };

  const renderTodayPlan = (d: CoachDashboard) => {
    const c = d.computed;
    return (
      <Card isDark={isDark}>
        <SectionLabel text="TODAY'S PLAN" isDark={isDark} />

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
          <MacroProgressBar
            label="Calories"
            logged={c.calories_logged}
            goal={c.calories_goal}
            remaining={c.calories_remaining}
            barColor={colors.calories}
            isDark={isDark}
          />
          <MacroProgressBar
            label="Protein"
            logged={c.protein_logged}
            goal={c.protein_goal}
            remaining={c.protein_remaining}
            barColor={colors.protein}
            isDark={isDark}
          />
        </View>

        <Text style={{ fontSize: 14, color: textColor, lineHeight: 20, marginBottom: spacing.sm }}>{d.today_plan.summary}</Text>

        {d.today_plan.biggest_opportunity ? (
          <View style={{ backgroundColor: colors.primary + '18', borderRadius: borderRadius.sm, padding: spacing.sm, marginBottom: spacing.md }}>
            <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600', lineHeight: 18 }}>{d.today_plan.biggest_opportunity}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={{ backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingVertical: spacing.sm + 2, alignItems: 'center' }}
          onPress={() => {
            console.log('[CoachHub] Today Plan CTA pressed:', d.today_plan.cta_label);
            openChat(d.today_plan.cta_prompt);
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{d.today_plan.cta_label}</Text>
        </TouchableOpacity>
      </Card>
    );
  };

  const renderExecutionAndTrend = (d: CoachDashboard) => {
    const score = d.weekly_execution.score;
    const scoreColor = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';
    const breakdown = d.computed.score_breakdown;

    const directionIcon = d.progress_trend.direction === 'losing'
      ? '↓'
      : d.progress_trend.direction === 'gaining'
        ? '↑'
        : '→';
    const directionColor = d.progress_trend.direction === 'losing'
      ? '#10B981'
      : d.progress_trend.direction === 'gaining'
        ? '#EF4444'
        : '#F59E0B';

    return (
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.sm, marginBottom: spacing.md }}>
        {/* Execution Score */}
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: cardBg,
            borderRadius: 16,
            padding: spacing.md,
            borderWidth: 1,
            borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.2 : 0.06,
            shadowRadius: 8,
            elevation: 2,
          }}
          onPress={() => {
            console.log('[CoachHub] Execution Score card tapped');
            openChat('Explain my weekly execution score in detail');
          }}
          activeOpacity={0.8}
        >
          <SectionLabel text="EXECUTION SCORE" isDark={isDark} />
          <Text style={{ fontSize: 44, fontWeight: '800', color: scoreColor, lineHeight: 50 }}>{score}</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: scoreColor, marginBottom: spacing.sm }}>{d.weekly_execution.score_label}</Text>

          <ScoreBreakdownRow label="Calories" pts={breakdown.calories} color={colors.calories} isDark={isDark} />
          <ScoreBreakdownRow label="Protein" pts={breakdown.protein} color={colors.protein} isDark={isDark} />
          <ScoreBreakdownRow label="Steps" pts={breakdown.steps} color="#10B981" isDark={isDark} />
          <ScoreBreakdownRow label="Logging" pts={breakdown.logging} color={colors.primary} isDark={isDark} />
          <ScoreBreakdownRow label="Weigh-ins" pts={breakdown.weighins} color="#8B5CF6" isDark={isDark} />

          {d.weekly_execution.vs_last_week ? (
            <Text style={{ fontSize: 11, color: subColor, marginTop: spacing.xs }}>{d.weekly_execution.vs_last_week}</Text>
          ) : null}
        </TouchableOpacity>

        {/* Progress Trend */}
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: cardBg,
            borderRadius: 16,
            padding: spacing.md,
            borderWidth: 1,
            borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.2 : 0.06,
            shadowRadius: 8,
            elevation: 2,
          }}
          onPress={() => {
            console.log('[CoachHub] Progress Trend card tapped');
            openChat('Analyze my weight trend and progress');
          }}
          activeOpacity={0.8}
        >
          <SectionLabel text="WEIGHT TREND" isDark={isDark} />
          <Text style={{ fontSize: 36, fontWeight: '800', color: directionColor, lineHeight: 44 }}>{directionIcon}</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: textColor, marginBottom: 4 }}>{d.progress_trend.weekly_rate_display}</Text>

          {d.progress_trend.vs_expected ? (
            <View style={{ backgroundColor: directionColor + '22', borderRadius: borderRadius.sm, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: spacing.sm }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: directionColor }}>{d.progress_trend.vs_expected}</Text>
            </View>
          ) : null}

          <Text style={{ fontSize: 12, color: textColor, lineHeight: 17, marginBottom: spacing.xs }}>{d.progress_trend.interpretation}</Text>

          {d.progress_trend.data_note ? (
            <Text style={{ fontSize: 11, color: subColor, lineHeight: 15 }}>{d.progress_trend.data_note}</Text>
          ) : null}
        </TouchableOpacity>
      </View>
    );
  };

  const renderActiveExperiment = (exp: NonNullable<CoachDashboard['active_experiment']>) => {
    const progress = calcExperimentProgress(exp.started_at, exp.review_at);
    const pctDisplay = Math.round(progress * 100);
    const trackColor = isDark ? '#3A3C52' : '#E5E7EB';
    const varLabel = formatVariableName(exp.variable);
    const reviewDate = formatDate(exp.review_at);

    return (
      <Card
        isDark={isDark}
        onPress={() => {
          console.log('[CoachHub] Active Experiment card tapped, id:', exp.id);
          openChat('How is my current experiment going?');
        }}
      >
        <SectionLabel text="ACTIVE EXPERIMENT" isDark={isDark} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: textColor, marginBottom: 4 }}>{varLabel}</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: subColor }}>{exp.previous_value}</Text>
          <IconSymbol ios_icon_name="arrow.right" android_material_icon_name="arrow-forward" size={16} color={colors.primary} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#10B981' }}>{exp.new_value}</Text>
        </View>

        {exp.reason ? (
          <Text style={{ fontSize: 13, color: subColor, lineHeight: 18, marginBottom: spacing.sm }}>{exp.reason}</Text>
        ) : null}

        <View style={{ height: 6, borderRadius: 3, backgroundColor: trackColor, overflow: 'hidden', marginBottom: 4 }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.primary, width: `${pctDisplay}%` }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 11, color: subColor }}>{pctDisplay}% complete</Text>
          <Text style={{ fontSize: 11, color: subColor }}>Review: {reviewDate}</Text>
        </View>
      </Card>
    );
  };

  const renderInsight = (insight: NonNullable<CoachDashboard['insight']>) => {
    const typeColor = INSIGHT_TYPE_COLORS[insight.type] ?? '#6B7280';
    const typeLabel = INSIGHT_TYPE_LABELS[insight.type] ?? insight.type;

    return (
      <Card isDark={isDark}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm }}>
          <SectionLabel text="COACH INSIGHT" isDark={isDark} />
          <View style={{ backgroundColor: typeColor + '22', borderRadius: borderRadius.full, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: typeColor }}>{typeLabel}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 16, fontWeight: '700', color: textColor, marginBottom: spacing.xs }}>{insight.title}</Text>
        <Text style={{ fontSize: 14, color: textColor, lineHeight: 20, marginBottom: spacing.xs }}>{insight.explanation}</Text>

        {insight.evidence ? (
          <Text style={{ fontSize: 12, color: subColor, lineHeight: 17, marginBottom: spacing.md }}>{insight.evidence}</Text>
        ) : null}

        <TouchableOpacity
          style={{ backgroundColor: typeColor, borderRadius: borderRadius.lg, paddingVertical: spacing.sm + 2, alignItems: 'center' }}
          onPress={() => {
            console.log('[CoachHub] Insight CTA pressed:', insight.cta_label);
            openChat(insight.cta_prompt);
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{insight.cta_label}</Text>
        </TouchableOpacity>
      </Card>
    );
  };

  const renderRecommendation = (rec: NonNullable<CoachDashboard['recommendation']>) => {
    if (dismissedRecommendation) return null;

    return (
      <Card isDark={isDark}>
        <SectionLabel text="RECOMMENDED CHANGE" isDark={isDark} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: textColor, marginBottom: 4 }}>{rec.title}</Text>
        <Text style={{ fontSize: 14, color: textColor, lineHeight: 20, marginBottom: spacing.sm }}>{rec.what}</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: subColor, marginBottom: 2 }}>Current</Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: textColor }}>{rec.current_value}</Text>
          </View>
          <IconSymbol ios_icon_name="arrow.right" android_material_icon_name="arrow-forward" size={18} color={colors.primary} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: subColor, marginBottom: 2 }}>Proposed</Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#10B981' }}>{rec.proposed_value}</Text>
          </View>
        </View>

        {rec.expected_impact ? (
          <View style={{ backgroundColor: '#10B98118', borderRadius: borderRadius.sm, padding: spacing.sm, marginBottom: spacing.sm }}>
            <Text style={{ fontSize: 13, color: '#10B981', fontWeight: '600', lineHeight: 18 }}>{rec.expected_impact}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 4, marginBottom: spacing.md }}>
          {rec.trial_duration ? (
            <Text style={{ fontSize: 12, color: subColor }}>Trial: {rec.trial_duration}</Text>
          ) : null}
          {rec.trial_duration && rec.review_date ? (
            <Text style={{ fontSize: 12, color: subColor }}> · </Text>
          ) : null}
          {rec.review_date ? (
            <Text style={{ fontSize: 12, color: subColor }}>Review: {rec.review_date}</Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingVertical: spacing.sm + 2, alignItems: 'center' }}
            onPress={() => {
              console.log('[CoachHub] Accept recommendation pressed:', rec.title);
              handleAcceptRecommendation(rec);
            }}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Accept</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flex: 1, borderWidth: 1, borderColor: colors.primary, borderRadius: borderRadius.lg, paddingVertical: spacing.sm + 2, alignItems: 'center' }}
            onPress={() => {
              console.log('[CoachHub] Ask Why pressed for recommendation:', rec.title);
              openChat(`Why are you recommending ${rec.what}?`);
            }}
            activeOpacity={0.85}
          >
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>Ask Why</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => {
              console.log('[CoachHub] Not Now pressed for recommendation:', rec.title);
              setDismissedRecommendation(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={{ color: subColor, fontSize: 13, fontWeight: '600' }}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  const renderQuickActions = (d: CoachDashboard) => {
    const actions = d.quick_actions ?? [];
    if (actions.length === 0) return null;

    return (
      <View style={{ marginBottom: spacing.md }}>
        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: subColor, paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
          QUICK ACTIONS
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
          {actions.map((action, idx) => (
            <TouchableOpacity
              key={idx}
              style={{
                width: 96,
                backgroundColor: cardBg,
                borderRadius: 14,
                padding: spacing.sm + 4,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 1,
                gap: 6,
              }}
              onPress={() => {
                console.log('[CoachHub] Quick action tapped:', action.label);
                openChat(action.prompt);
              }}
              activeOpacity={0.75}
            >
              <IconSymbol
                ios_icon_name={action.ios_icon}
                android_material_icon_name={action.android_icon}
                size={22}
                color={colors.primary}
              />
              <Text style={{ fontSize: 11, fontWeight: '600', color: textColor, textAlign: 'center', lineHeight: 15 }}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderSettingsRow = () => {
    const items = [
      { label: 'Memory', ios_icon: 'brain.head.profile', android_icon: 'psychology', route: '/coach-memory' as const },
      { label: 'Permissions', ios_icon: 'lock.shield', android_icon: 'security', route: '/coach-permissions' as const },
      { label: 'History', ios_icon: 'clock.arrow.circlepath', android_icon: 'history', route: '/coach-action-history' as const },
    ];

    return (
      <Card isDark={isDark}>
        <SectionLabel text="COACH SETTINGS" isDark={isDark} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor,
                borderRadius: borderRadius.md,
                paddingVertical: spacing.md,
                alignItems: 'center',
                gap: spacing.xs,
              }}
              onPress={() => {
                console.log('[CoachHub] Settings item pressed:', item.label);
                router.push(item.route);
              }}
              activeOpacity={0.75}
            >
              <IconSymbol ios_icon_name={item.ios_icon} android_material_icon_name={item.android_icon} size={20} color={colors.primary} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: textColor }}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bgColor }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.md,
          paddingTop: Platform.OS === 'android' ? spacing.lg : spacing.sm,
          paddingBottom: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Image
            source={resolveImageSource(require('../../assets/images/ff4ef6e4-805c-4f79-a014-9784ebe735d9.jpeg'))}
            style={{ width: 36, height: 36, borderRadius: 18 }}
          />
          <Text style={{ ...typography.h3, color: textColor }}>Coach</Text>
        </View>

        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            backgroundColor: colors.primary,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: borderRadius.full,
          }}
          onPress={() => {
            console.log('[CoachHub] Chat button pressed from header');
            openChat();
          }}
          activeOpacity={0.8}
        >
          <IconSymbol ios_icon_name="bubble.left.and.bubble.right" android_material_icon_name="chat" size={15} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Chat</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      {loading ? (
        <SkeletonHub isDark={isDark} />
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <IconSymbol ios_icon_name="exclamationmark.triangle" android_material_icon_name="warning" size={40} color={subColor} />
          <Text style={{ ...typography.h3, color: textColor, marginTop: spacing.md, textAlign: 'center' }}>Couldn't load your coaching data</Text>
          <Text style={{ fontSize: 14, color: subColor, marginTop: spacing.sm, textAlign: 'center' }}>Check your connection and try again.</Text>
          <TouchableOpacity
            style={{ marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.xl }}
            onPress={() => {
              console.log('[CoachHub] Retry button pressed');
              loadDashboard(true);
            }}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : dashboard ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {renderGreeting(dashboard)}
          {renderCoachFocus(dashboard)}
          {renderTodayPlan(dashboard)}
          {renderExecutionAndTrend(dashboard)}
          {dashboard.active_experiment ? renderActiveExperiment(dashboard.active_experiment) : null}
          {dashboard.insight ? renderInsight(dashboard.insight) : null}
          {dashboard.recommendation && !dismissedRecommendation ? renderRecommendation(dashboard.recommendation) : null}
          {renderQuickActions(dashboard)}
          {renderSettingsRow()}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}


import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';
import { useAICoach, type CoachMessage, type ActionProposal } from '@/hooks/useAICoach';

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  'On Track': '#10B981',
  'Low Adherence': '#F59E0B',
  'Possible Plateau': '#EAB308',
  'Insufficient Data': '#6B7280',
  'Progressing Faster': '#3B82F6',
};

function parseStatusLabel(text: string): string {
  const match = text.match(/\[([^\]]+)\]/);
  if (match) return match[1];
  return 'Insufficient Data';
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator({ isDark }: { isDark: boolean }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.delay(600),
        ])
      );
    const a1 = animateDot(dot1, 0);
    const a2 = animateDot(dot2, 150);
    const a3 = animateDot(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  const dotStyle = {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: isDark ? colors.textSecondaryDark : colors.textSecondary,
    marginHorizontal: 3,
  };

  return (
    <View style={[typingStyles.bubble, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
      <Animated.View style={[dotStyle, { transform: [{ translateY: dot1 }] }]} />
      <Animated.View style={[dotStyle, { transform: [{ translateY: dot2 }] }]} />
      <Animated.View style={[dotStyle, { transform: [{ translateY: dot3 }] }]} />
    </View>
  );
}

const typingStyles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
});

// ─── Circular Progress Ring ───────────────────────────────────────────────────

function CircularProgress({ score, isDark }: { score: number; isDark: boolean }) {
  const scoreColor = score >= 80 ? '#10B981' : score >= 60 ? '#EAB308' : score >= 40 ? '#F59E0B' : '#EF4444';
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score, 0), 100) / 100;

  // Two-half-circle approach using Views
  const rotation = progress * 360;
  const bgColor = isDark ? colors.cardDark : colors.card;
  const trackColor = isDark ? '#3A3C52' : '#E5E7EB';

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Track ring */}
      <View style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: strokeWidth,
        borderColor: trackColor,
      }} />
      {/* Progress arc — left half */}
      <View style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: strokeWidth,
        borderColor: 'transparent',
        borderLeftColor: rotation > 180 ? scoreColor : 'transparent',
        borderBottomColor: rotation > 90 ? scoreColor : 'transparent',
        transform: [{ rotate: '0deg' }],
      }} />
      {/* Progress arc — right half */}
      <View style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: strokeWidth,
        borderColor: 'transparent',
        borderRightColor: rotation > 0 ? scoreColor : 'transparent',
        borderTopColor: rotation > 270 ? scoreColor : 'transparent',
        transform: [{ rotate: `${Math.min(rotation, 180) - 180}deg` }],
      }} />
      {/* Score text */}
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: scoreColor }}>{score}</Text>
        <Text style={{ fontSize: 11, color: isDark ? colors.textSecondaryDark : colors.textSecondary, fontWeight: '500' }}>/ 100</Text>
      </View>
    </View>
  );
}

// ─── Skeleton Block ───────────────────────────────────────────────────────────

function SkeletonBlock({ width, height, isDark, style }: { width?: number | string; height: number; isDark: boolean; style?: object }) {
  return (
    <View style={[{
      width: width ?? '100%',
      height,
      borderRadius: borderRadius.md,
      backgroundColor: isDark ? '#3A3C52' : '#D4D6DA',
      opacity: 0.4,
    }, style]} />
  );
}

// ─── Confirmation Sheet ───────────────────────────────────────────────────────

function ConfirmationSheet({
  action,
  isDark,
  onConfirm,
  onReject,
}: {
  action: ActionProposal;
  isDark: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;

  const actionType = action.proposal?.action_type ?? action.proposal?.goal_type ?? 'Update';
  const currentVal = action.proposal?.current_value;
  const proposedVal = action.proposal?.proposed_value;
  const reason = action.proposal?.reason ?? '';

  return (
    <View style={[confirmStyles.sheet, { backgroundColor: cardBg, borderTopColor: borderColor }]}>
      <View style={confirmStyles.handle} />
      <Text style={[confirmStyles.title, { color: textColor }]}>Coach Recommendation</Text>
      <Text style={[confirmStyles.actionType, { color: colors.primary }]}>{String(actionType).replace(/_/g, ' ').toUpperCase()}</Text>

      {(currentVal !== undefined || proposedVal !== undefined) && (
        <View style={confirmStyles.valuesRow}>
          {currentVal !== undefined && (
            <View style={confirmStyles.valueBox}>
              <Text style={[confirmStyles.valueLabel, { color: subColor }]}>Current</Text>
              <Text style={[confirmStyles.valueNum, { color: textColor }]}>{String(currentVal)}</Text>
            </View>
          )}
          <IconSymbol ios_icon_name="arrow.right" android_material_icon_name="arrow-forward" size={20} color={colors.primary} />
          {proposedVal !== undefined && (
            <View style={confirmStyles.valueBox}>
              <Text style={[confirmStyles.valueLabel, { color: subColor }]}>Proposed</Text>
              <Text style={[confirmStyles.valueNum, { color: '#10B981' }]}>{String(proposedVal)}</Text>
            </View>
          )}
        </View>
      )}

      {reason ? (
        <Text style={[confirmStyles.reason, { color: subColor }]}>{reason}</Text>
      ) : null}

      <View style={confirmStyles.buttonRow}>
        <TouchableOpacity
          style={[confirmStyles.rejectBtn, { borderColor }]}
          onPress={() => {
            console.log('[Coach] Action rejected, action_id:', action.action_id);
            onReject();
          }}
          activeOpacity={0.8}
        >
          <Text style={[confirmStyles.rejectText, { color: textColor }]}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={confirmStyles.confirmBtn}
          onPress={() => {
            console.log('[Coach] Action confirmed, action_id:', action.action_id);
            onConfirm();
          }}
          activeOpacity={0.8}
        >
          <Text style={confirmStyles.confirmText}>Confirm</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const confirmStyles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderTopWidth: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.h3, marginBottom: spacing.xs },
  actionType: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.md },
  valuesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  valueBox: { alignItems: 'center', flex: 1 },
  valueLabel: { fontSize: 12, marginBottom: 2 },
  valueNum: { fontSize: 22, fontWeight: '700' },
  reason: { ...typography.caption, lineHeight: 20, marginBottom: spacing.lg },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  rejectBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  rejectText: { fontSize: 16, fontWeight: '600' },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ─── Quick Action Card ────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { emoji: '📊', label: 'Daily Check-in', prompt: 'Give me my daily check-in — how am I doing today?' },
  { emoji: '📅', label: 'Weekly Review', prompt: 'Give me my weekly review — what went well and what can I improve?' },
  { emoji: '🍽️', label: 'What can I eat?', prompt: 'What can I eat right now that fits my remaining macros?' },
  { emoji: '💪', label: 'Am I on track?', prompt: 'Am I on track to hit my goals this week?' },
  { emoji: '🔍', label: 'Analyze patterns', prompt: 'Analyze my nutrition and weight patterns over the past 2 weeks' },
  { emoji: '🧠', label: 'My Memory', prompt: null, route: '/coach-memory' as const },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CoachScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { prompt: incomingPrompt } = useLocalSearchParams<{ prompt?: string }>();

  // ── Mode: 'hub' | 'chat' ──────────────────────────────────────────────────
  const [mode, setMode] = useState<'hub' | 'chat'>('hub');

  // ── Hub state ─────────────────────────────────────────────────────────────
  const [assessmentLoading, setAssessmentLoading] = useState(true);
  const [assessmentStatus, setAssessmentStatus] = useState('Insufficient Data');
  const [assessmentPriority, setAssessmentPriority] = useState('');
  const [assessmentFullText, setAssessmentFullText] = useState('');

  const [scoreLoading, setScoreLoading] = useState(true);
  const [weeklyScore, setWeeklyScore] = useState(0);
  const [scoreBars, setScoreBars] = useState<{ label: string; pts: number; color: string }[]>([]);

  const [pendingActions, setPendingActions] = useState<any[]>([]);
  const [recentMessages, setRecentMessages] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [weightUnit, setWeightUnit] = useState<string>('lb');

  // ── Chat state ────────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<CoachMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);
  const isMountedRef = useRef(true);
  const { sendMessage, loading: coachLoading, pendingAction, clearPendingAction, confirmAction } = useAICoach({ weightUnit });

  // ── Derived colors ────────────────────────────────────────────────────────
  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Handle incoming prompt param
  useEffect(() => {
    if (incomingPrompt) {
      console.log('[Coach] Incoming prompt param detected:', incomingPrompt.slice(0, 60));
      switchToChat(incomingPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingPrompt]);

  useFocusEffect(
    useCallback(() => {
      console.log('[Coach] Tab focused — refreshing hub data');
      loadHubData();
    }, [loadHubData])
  );

  // Scroll to bottom when chat messages change
  useEffect(() => {
    if (mode === 'chat') {
      setTimeout(() => {
        if (isMountedRef.current && scrollViewRef.current) {
          try { scrollViewRef.current.scrollToEnd({ animated: true }); } catch (_) {}
        }
      }, 120);
    }
  }, [chatMessages.length, coachLoading, mode]);

  // ── Hub data loading ──────────────────────────────────────────────────────

  const loadHubData = useCallback(async () => {
    console.log('[Coach] loadHubData: fetching user');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (isMountedRef.current) setUserId(user.id);

      console.log('[Coach] loadHubData: user id =', user.id);

      // Fetch preferred_units for weight display
      const { data: prefData } = await supabase
        .from('users')
        .select('preferred_units')
        .eq('id', user.id)
        .maybeSingle();
      const resolvedUnit = prefData?.preferred_units === 'metric' ? 'kg' : 'lb';
      console.log('[Coach] loadHubData: preferred_units =', prefData?.preferred_units, '→ weightUnit =', resolvedUnit);
      if (isMountedRef.current) setWeightUnit(resolvedUnit);

      // Parallel: pending actions + recent messages
      const [pendingResult, messagesResult] = await Promise.all([
        supabase
          .from('coach_action_log')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('coach_messages')
          .select('*')
          .eq('user_id', user.id)
          .eq('type', 'proactive')
          .order('sent_at', { ascending: false })
          .limit(3),
      ]);

      if (!isMountedRef.current) return;

      console.log('[Coach] loadHubData: pending actions =', pendingResult.data?.length ?? 0);
      console.log('[Coach] loadHubData: recent messages =', messagesResult.data?.length ?? 0);

      setPendingActions(pendingResult.data ?? []);
      setRecentMessages(messagesResult.data ?? []);

      // Load assessment + score in parallel (edge function calls)
      loadAssessment(user.id, resolvedUnit);
      loadWeeklyScore(user.id, resolvedUnit);
    } catch (err) {
      console.error('[Coach] loadHubData error:', err);
    }
  }, []);

  const loadAssessment = async (uid: string, unit: string) => {
    console.log('[Coach] loadAssessment: invoking ai-coach for status check, weight_unit:', unit);
    setAssessmentLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-coach', {
        body: {
          messages: [{
            role: 'user',
            content: 'Give me a one-sentence status: am I on track? Start with my status label in brackets like [On Track] or [Low Adherence] then one sentence.',
          }],
          user_id: uid,
          weight_unit: unit,
        },
      });

      if (!isMountedRef.current) return;

      if (error) {
        console.error('[Coach] loadAssessment error:', error);
        return;
      }

      const message: string = data?.message ?? '';
      console.log('[Coach] loadAssessment response:', message.slice(0, 80));

      const status = parseStatusLabel(message);
      const priority = message.replace(/\[[^\]]+\]\s*/, '').trim();

      setAssessmentStatus(status);
      setAssessmentPriority(priority);
      setAssessmentFullText(message);
    } catch (err) {
      console.error('[Coach] loadAssessment catch:', err);
    } finally {
      if (isMountedRef.current) setAssessmentLoading(false);
    }
  };

  const loadWeeklyScore = async (uid: string, unit: string) => {
    console.log('[Coach] loadWeeklyScore: invoking ai-coach for score, weight_unit:', unit);
    setScoreLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-coach', {
        body: {
          messages: [{
            role: 'user',
            content: 'Calculate my weekly transformation score as a number 0-100. Reply ONLY with JSON like: {"score":72,"calories":15,"protein":18,"steps":12,"logging":14,"weighins":13}',
          }],
          user_id: uid,
          weight_unit: unit,
        },
      });

      if (!isMountedRef.current) return;

      if (error) {
        console.error('[Coach] loadWeeklyScore error:', error);
        return;
      }

      const message: string = data?.message ?? '';
      console.log('[Coach] loadWeeklyScore response:', message.slice(0, 120));

      // Try to parse JSON from response
      try {
        const jsonMatch = message.match(/\{[^}]+\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const score = Number(parsed.score) || 0;
          setWeeklyScore(score);
          setScoreBars([
            { label: 'Calories', pts: Number(parsed.calories) || 0, color: colors.calories },
            { label: 'Protein', pts: Number(parsed.protein) || 0, color: colors.protein },
            { label: 'Steps', pts: Number(parsed.steps) || 0, color: '#10B981' },
            { label: 'Logging', pts: Number(parsed.logging) || 0, color: colors.primary },
            { label: 'Weigh-ins', pts: Number(parsed.weighins) || 0, color: '#8B5CF6' },
          ]);
          console.log('[Coach] loadWeeklyScore parsed score:', score);
        }
      } catch (parseErr) {
        console.warn('[Coach] loadWeeklyScore JSON parse failed:', parseErr);
      }
    } catch (err) {
      console.error('[Coach] loadWeeklyScore catch:', err);
    } finally {
      if (isMountedRef.current) setScoreLoading(false);
    }
  };

  // ── Chat helpers ──────────────────────────────────────────────────────────

  const switchToChat = useCallback((initialPrompt?: string) => {
    console.log('[Coach] Switching to chat mode, initialPrompt:', initialPrompt?.slice(0, 60) ?? 'none');
    setMode('chat');
    if (initialPrompt) {
      const userMsg: CoachMessage = { role: 'user', content: initialPrompt, timestamp: Date.now() };
      setChatMessages([userMsg]);
      sendChatMessage([userMsg]);
    }
  }, [sendChatMessage]);

  const sendChatMessage = useCallback(async (msgs: CoachMessage[]) => {
    console.log('[Coach] sendChatMessage: sending', msgs.length, 'messages');
    try {
      const reply = await sendMessage(msgs);
      if (!isMountedRef.current) return;
      if (reply) {
        const assistantMsg: CoachMessage = { role: 'assistant', content: reply, timestamp: Date.now() };
        setChatMessages(prev => [...prev, assistantMsg]);
        console.log('[Coach] sendChatMessage: reply received, length:', reply.length);
      }
    } catch (err: any) {
      console.error('[Coach] sendChatMessage error:', err?.message);
      if (!isMountedRef.current) return;
      const errMsg: CoachMessage = {
        role: 'assistant',
        content: "Sorry, something went wrong. Please try again.",
        timestamp: Date.now(),
      };
      setChatMessages(prev => [...prev, errMsg]);
    }
  }, [sendMessage]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || coachLoading) return;
    console.log('[Coach] Send button pressed, message:', text.slice(0, 60));
    const userMsg: CoachMessage = { role: 'user', content: text, timestamp: Date.now() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setInputText('');
    sendChatMessage(newMessages);
  }, [inputText, coachLoading, chatMessages, sendChatMessage]);

  const handleConfirmAction = useCallback(async () => {
    if (!pendingAction) return;
    console.log('[Coach] Confirming action:', pendingAction.action_id);
    try {
      const reply = await confirmAction(
        pendingAction.action_id,
        pendingAction.confirmation_token,
        sendMessage,
        chatMessages,
      );
      if (reply && isMountedRef.current) {
        const assistantMsg: CoachMessage = { role: 'assistant', content: reply, timestamp: Date.now() };
        setChatMessages(prev => [...prev, assistantMsg]);
      }
    } catch (err) {
      console.error('[Coach] confirmAction error:', err);
    }
  }, [pendingAction, confirmAction, sendMessage, chatMessages]);

  const handleRejectAction = useCallback(() => {
    console.log('[Coach] Rejecting action:', pendingAction?.action_id);
    clearPendingAction();
    const rejectMsg: CoachMessage = { role: 'user', content: 'No thanks, I will keep my current settings.', timestamp: Date.now() };
    const newMessages = [...chatMessages, rejectMsg];
    setChatMessages(newMessages);
    sendChatMessage(newMessages);
  }, [pendingAction, clearPendingAction, chatMessages, sendChatMessage]);

  // ── Render Hub ────────────────────────────────────────────────────────────

  const renderHub = () => {
    const statusColor = STATUS_COLORS[assessmentStatus] ?? '#6B7280';

    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={hubStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Today's Assessment Card */}
        <View style={[hubStyles.card, { backgroundColor: cardBg, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}>
          <Text style={[hubStyles.sectionLabel, { color: subColor }]}>TODAY'S ASSESSMENT</Text>
          {assessmentLoading ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <SkeletonBlock height={24} width="40%" isDark={isDark} />
              <SkeletonBlock height={16} isDark={isDark} />
              <SkeletonBlock height={16} width="80%" isDark={isDark} />
            </View>
          ) : (
            <>
              <View style={[hubStyles.statusBadge, { backgroundColor: statusColor + '22' }]}>
                <View style={[hubStyles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[hubStyles.statusText, { color: statusColor }]}>{assessmentStatus}</Text>
              </View>
              {assessmentPriority ? (
                <Text style={[hubStyles.priorityText, { color: textColor }]}>{assessmentPriority}</Text>
              ) : null}
              <TouchableOpacity
                style={[hubStyles.viewAnalysisBtn, { borderColor: colors.primary }]}
                onPress={() => {
                  console.log('[Coach] View Full Analysis pressed');
                  switchToChat('Give me my full assessment');
                }}
                activeOpacity={0.8}
              >
                <Text style={[hubStyles.viewAnalysisBtnText, { color: colors.primary }]}>View Full Analysis →</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* 2. Weekly Transformation Score */}
        <View style={[hubStyles.card, { backgroundColor: cardBg, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}>
          <Text style={[hubStyles.sectionLabel, { color: subColor }]}>WEEKLY TRANSFORMATION SCORE</Text>
          {scoreLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm }}>
              <SkeletonBlock height={120} width={120} isDark={isDark} style={{ borderRadius: 60 }} />
              <SkeletonBlock height={14} width="60%" isDark={isDark} />
            </View>
          ) : (
            <>
              <View style={{ alignItems: 'center', marginVertical: spacing.md }}>
                <CircularProgress score={weeklyScore} isDark={isDark} />
              </View>
              {scoreBars.length > 0 && (
                <View style={hubStyles.scoreBarsRow}>
                  {scoreBars.map((bar) => (
                    <View key={bar.label} style={hubStyles.scoreBarItem}>
                      <View style={[hubStyles.scoreBarDot, { backgroundColor: bar.color }]} />
                      <Text style={[hubStyles.scoreBarLabel, { color: subColor }]}>{bar.label}</Text>
                      <Text style={[hubStyles.scoreBarPts, { color: textColor }]}>{bar.pts}pts</Text>
                    </View>
                  ))}
                </View>
              )}
              <TouchableOpacity
                onPress={() => {
                  console.log('[Coach] Why this score? tapped');
                  switchToChat('Explain my weekly transformation score in detail');
                }}
                activeOpacity={0.7}
              >
                <Text style={[hubStyles.whyScoreText, { color: colors.primary }]}>Why this score? →</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* 3. Pending Actions (only if count > 0) */}
        {pendingActions.length > 0 && (
          <View style={[hubStyles.card, { backgroundColor: cardBg, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}>
            <View style={hubStyles.pendingHeader}>
              <Text style={[hubStyles.sectionLabel, { color: subColor }]}>PENDING ACTIONS</Text>
              <View style={hubStyles.pendingBadge}>
                <Text style={hubStyles.pendingBadgeText}>{pendingActions.length}</Text>
              </View>
            </View>
            <Text style={[hubStyles.pendingSubtitle, { color: textColor }]}>
              {pendingActions.length}
              {' action'}
              {pendingActions.length !== 1 ? 's' : ''}
              {' need your approval'}
            </Text>
            {pendingActions.slice(0, 2).map((action: any) => {
              const actionType = String(action.action_type ?? '').replace(/_/g, ' ');
              const proposedVal = action.proposed_value;
              return (
                <View key={action.id} style={[hubStyles.pendingItem, { borderColor }]}>
                  <Text style={[hubStyles.pendingItemType, { color: colors.primary }]}>{actionType}</Text>
                  {proposedVal !== undefined && proposedVal !== null ? (
                    <Text style={[hubStyles.pendingItemVal, { color: subColor }]}>
                      {'→ '}
                      {String(proposedVal)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            <TouchableOpacity
              style={[hubStyles.reviewBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                console.log('[Coach] Review pending actions pressed');
                router.push('/coach-action-history');
              }}
              activeOpacity={0.8}
            >
              <Text style={hubStyles.reviewBtnText}>Review</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 4. Quick Coach Actions */}
        <View style={{ marginBottom: spacing.md }}>
          <Text style={[hubStyles.sectionLabel, { color: subColor, paddingHorizontal: spacing.md, marginBottom: spacing.sm }]}>QUICK ACTIONS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={hubStyles.quickActionsScroll}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={[hubStyles.quickActionCard, { backgroundColor: cardBg, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}
                onPress={() => {
                  console.log('[Coach] Quick action tapped:', action.label);
                  if (action.route) {
                    router.push(action.route);
                  } else if (action.prompt) {
                    switchToChat(action.prompt);
                  }
                }}
                activeOpacity={0.75}
              >
                <Text style={hubStyles.quickActionEmoji}>{action.emoji}</Text>
                <Text style={[hubStyles.quickActionLabel, { color: textColor }]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* 5. Recent Coach Insights */}
        {recentMessages.length > 0 && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[hubStyles.sectionLabel, { color: subColor, paddingHorizontal: spacing.md, marginBottom: spacing.sm }]}>RECENT INSIGHTS</Text>
            {recentMessages.map((msg: any) => {
              const preview = String(msg.content ?? '').slice(0, 100);
              const sentAt = msg.sent_at ? new Date(msg.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
              return (
                <TouchableOpacity
                  key={msg.id}
                  style={[hubStyles.insightCard, { backgroundColor: cardBg, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}
                  onPress={() => {
                    console.log('[Coach] Recent insight tapped, id:', msg.id);
                    switchToChat(msg.content);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={hubStyles.insightRow}>
                    <Text style={[hubStyles.insightPreview, { color: textColor }]}>
                      {preview}
                      {String(msg.content ?? '').length > 100 ? '…' : ''}
                    </Text>
                    <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={subColor} />
                  </View>
                  {sentAt ? (
                    <Text style={[hubStyles.insightDate, { color: subColor }]}>{sentAt}</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* 6. Coach Settings Row */}
        <View style={[hubStyles.card, { backgroundColor: cardBg, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}>
          <Text style={[hubStyles.sectionLabel, { color: subColor, marginBottom: spacing.sm }]}>COACH SETTINGS</Text>
          <View style={hubStyles.settingsRow}>
            {[
              { label: 'Memory', icon: 'brain.head.profile', route: '/coach-memory' as const },
              { label: 'Permissions', icon: 'lock.shield', route: '/coach-permissions' as const },
              { label: 'History', icon: 'clock.arrow.circlepath', route: '/coach-action-history' as const },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                style={[hubStyles.settingsItem, { borderColor }]}
                onPress={() => {
                  console.log('[Coach] Settings item pressed:', item.label);
                  router.push(item.route);
                }}
                activeOpacity={0.75}
              >
                <IconSymbol ios_icon_name={item.icon} android_material_icon_name="settings" size={20} color={colors.primary} />
                <Text style={[hubStyles.settingsLabel, { color: textColor }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  // ── Render Chat ───────────────────────────────────────────────────────────

  const renderChat = () => {
    const canSend = inputText.trim().length > 0 && !coachLoading;
    const sendBtnBg = canSend ? colors.primary : (isDark ? colors.borderDark : colors.border);

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={chatStyles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {chatMessages.length === 0 && (
            <View style={[chatStyles.emptyChat, { backgroundColor: cardBg }]}>
              <Text style={chatStyles.emptyChatEmoji}>🧠</Text>
              <Text style={[chatStyles.emptyChatTitle, { color: textColor }]}>Ask me anything</Text>
              <Text style={[chatStyles.emptyChatSub, { color: subColor }]}>I have access to your nutrition, weight, and activity data.</Text>
            </View>
          )}

          {chatMessages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const bubbleBg = isUser ? colors.primary : cardBg;
            const bubbleTextColor = isUser ? '#FFFFFF' : textColor;
            return (
              <View
                key={idx}
                style={[
                  chatStyles.messageWrapper,
                  isUser ? chatStyles.userWrapper : chatStyles.assistantWrapper,
                ]}
              >
                {!isUser && (
                  <View style={[chatStyles.avatarSmall, { backgroundColor: colors.primary }]}>
                    <Text style={chatStyles.avatarEmoji}>🧠</Text>
                  </View>
                )}
                <View style={[chatStyles.bubble, { backgroundColor: bubbleBg }]}>
                  <Text style={[chatStyles.bubbleText, { color: bubbleTextColor }]}>{msg.content}</Text>
                </View>
              </View>
            );
          })}

          {coachLoading && <TypingIndicator isDark={isDark} />}
        </ScrollView>

        {/* Input bar */}
        <View style={[chatStyles.inputContainer, { backgroundColor: cardBg, borderTopColor: borderColor }]}>
          <TextInput
            style={[chatStyles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, color: textColor }]}
            placeholder="Ask your coach anything..."
            placeholderTextColor={subColor}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={600}
            editable={!coachLoading}
            returnKeyType="send"
            onSubmitEditing={() => {
              if (canSend) {
                console.log('[Coach] Send via keyboard return key');
                handleSend();
              }
            }}
          />
          <TouchableOpacity
            style={[chatStyles.sendButton, { backgroundColor: sendBtnBg }]}
            onPress={() => {
              console.log('[Coach] Send button pressed');
              handleSend();
            }}
            disabled={!canSend}
            activeOpacity={0.8}
          >
            <IconSymbol ios_icon_name="arrow.up" android_material_icon_name="send" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Confirmation sheet overlay */}
        {pendingAction && (
          <ConfirmationSheet
            action={pendingAction}
            isDark={isDark}
            onConfirm={handleConfirmAction}
            onReject={handleRejectAction}
          />
        )}
      </KeyboardAvoidingView>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        {mode === 'chat' ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              console.log('[Coach] Back to Hub pressed');
              setMode('hub');
              setChatMessages([]);
              setInputText('');
            }}
            activeOpacity={0.7}
          >
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={20} color={colors.primary} />
            <Text style={[styles.backText, { color: colors.primary }]}>Hub</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerLeft}>
            <View style={[styles.coachAvatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.coachAvatarEmoji}>🧠</Text>
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: textColor }]}>AI Coach</Text>
              <Text style={[styles.headerSub, { color: subColor }]}>Powered by GPT-4o</Text>
            </View>
          </View>
        )}

        {mode === 'hub' && (
          <TouchableOpacity
            style={[styles.chatButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              console.log('[Coach] Open chat button pressed from hub');
              switchToChat();
            }}
            activeOpacity={0.8}
          >
            <IconSymbol ios_icon_name="bubble.left.and.bubble.right" android_material_icon_name="chat" size={16} color="#fff" />
            <Text style={styles.chatButtonText}>Chat</Text>
          </TouchableOpacity>
        )}
      </View>

      {mode === 'hub' ? renderHub() : renderChat()}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  coachAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  coachAvatarEmoji: { fontSize: 18 },
  headerTitle: { ...typography.h3 },
  headerSub: { fontSize: 12, marginTop: 1 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 16, fontWeight: '600' },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  chatButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

const hubStyles = StyleSheet.create({
  scrollContent: { paddingBottom: spacing.xl },
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  // Assessment
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 14, fontWeight: '700' },
  priorityText: { ...typography.body, lineHeight: 22, marginBottom: spacing.md },
  viewAnalysisBtn: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  viewAnalysisBtnText: { fontSize: 14, fontWeight: '600' },
  // Score
  scoreBarsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  scoreBarItem: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: '30%' },
  scoreBarDot: { width: 8, height: 8, borderRadius: 4 },
  scoreBarLabel: { fontSize: 12 },
  scoreBarPts: { fontSize: 12, fontWeight: '600' },
  whyScoreText: { fontSize: 14, fontWeight: '600', marginTop: spacing.xs },
  // Pending
  pendingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  pendingBadge: {
    backgroundColor: '#EF4444',
    borderRadius: borderRadius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pendingBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  pendingSubtitle: { ...typography.body, marginBottom: spacing.sm },
  pendingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    marginBottom: spacing.xs,
  },
  pendingItemType: { fontSize: 14, fontWeight: '600', textTransform: 'capitalize', flex: 1 },
  pendingItemVal: { fontSize: 14 },
  reviewBtn: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  reviewBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Quick actions
  quickActionsScroll: { paddingHorizontal: spacing.md, gap: spacing.sm },
  quickActionCard: {
    width: 100,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  quickActionEmoji: { fontSize: 28, marginBottom: spacing.xs },
  quickActionLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 16 },
  // Insights
  insightCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
  },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  insightPreview: { ...typography.caption, flex: 1, lineHeight: 20 },
  insightDate: { fontSize: 11, marginTop: spacing.xs },
  // Settings
  settingsRow: { flexDirection: 'row', gap: spacing.sm },
  settingsItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  settingsLabel: { fontSize: 12, fontWeight: '600' },
});

const chatStyles = StyleSheet.create({
  messagesContent: { padding: spacing.md, paddingBottom: spacing.lg },
  emptyChat: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyChatEmoji: { fontSize: 40, marginBottom: spacing.md },
  emptyChatTitle: { ...typography.h3, marginBottom: spacing.xs, textAlign: 'center' },
  emptyChatSub: { ...typography.caption, textAlign: 'center', lineHeight: 20 },
  messageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
    maxWidth: '85%',
  },
  userWrapper: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  assistantWrapper: { alignSelf: 'flex-start' },
  avatarSmall: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.xs, marginBottom: 2, flexShrink: 0,
  },
  avatarEmoji: { fontSize: 14 },
  bubble: {
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleText: { ...typography.body, lineHeight: 21 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    ...typography.body,
  },
  sendButton: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
});

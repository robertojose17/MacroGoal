
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { useAICoach, CoachMessage, ActionProposal } from '@/hooks/useAICoach';

// ── ID generator ────────────────────────────────────────────────────────────
let msgCounter = 0;
const genId = () => {
  msgCounter += 1;
  return `coach-${Date.now()}-${msgCounter}`;
};

type MessageWithId = CoachMessage & { id: string };

const WELCOME_MESSAGE: MessageWithId = {
  id: genId(),
  role: 'assistant',
  content:
    "Hi! I'm your AI Body Transformation Coach. I have access to your nutrition logs, weight history, and step data. Ask me anything about your progress — I'll analyze your real data to give you honest, specific feedback.",
  timestamp: Date.now(),
};

const SUGGESTED_PROMPTS = [
  'Give me my daily check-in',
  'Am I on track this week?',
  'What can I eat right now?',
  'Analyze my last 14 days',
];

const QUICK_ACTION_CARDS = [
  {
    emoji: '📊',
    title: 'Daily Check-in',
    subtitle: 'How am I doing today?',
    message: 'Give me my daily check-in for today',
  },
  {
    emoji: '📅',
    title: 'Weekly Review',
    subtitle: 'Full week summary',
    message: 'Give me my weekly progress review',
  },
  {
    emoji: '🍽️',
    title: 'What can I eat?',
    subtitle: 'Remaining macros',
    message: 'What can I eat with my remaining macros today?',
  },
  {
    emoji: '💪',
    title: 'Am I on track?',
    subtitle: 'Weekly progress check',
    message: 'Am I on track this week?',
  },
  {
    emoji: '🔍',
    title: 'Analyze patterns',
    subtitle: 'Last 14 days',
    message: 'Detect any patterns in my last 14 days',
  },
  {
    emoji: '🏪',
    title: 'Find at Store',
    subtitle: 'Walmart macro picks',
    message: 'What can I buy at Walmart that fits my macros?',
  },
  {
    emoji: '🍔',
    title: 'Restaurant Menu',
    subtitle: 'Under 500 cal options',
    message: "What can I order at McDonald's under 500 calories?",
  },
];

const CRAVING_CHIPS = [
  'I want something sweet 🍫',
  'High protein option 💪',
  'Quick meal under 400 cal ⚡',
  'I need a snack 🥜',
];

// ── Store badge detection ────────────────────────────────────────────────────
const STORE_COLORS: Record<string, { bg: string; text: string }> = {
  walmart: { bg: '#0071CE', text: '#FFFFFF' },
  publix: { bg: '#007A33', text: '#FFFFFF' },
  "mcdonald's": { bg: '#DA291C', text: '#FFFFFF' },
  mcdonalds: { bg: '#DA291C', text: '#FFFFFF' },
  "burger king": { bg: '#F5821F', text: '#FFFFFF' },
  subway: { bg: '#009B48', text: '#FFFFFF' },
  target: { bg: '#CC0000', text: '#FFFFFF' },
  costco: { bg: '#005DAA', text: '#FFFFFF' },
  kroger: { bg: '#003087', text: '#FFFFFF' },
  "whole foods": { bg: '#00674B', text: '#FFFFFF' },
  chipotle: { bg: '#A81612', text: '#FFFFFF' },
  starbucks: { bg: '#00704A', text: '#FFFFFF' },
};

function detectStore(line: string): { name: string; colors: { bg: string; text: string } } | null {
  const lower = line.toLowerCase();
  for (const [store, storeColors] of Object.entries(STORE_COLORS)) {
    if (lower.includes(store)) {
      const displayName = store.charAt(0).toUpperCase() + store.slice(1);
      return { name: displayName, colors: storeColors };
    }
  }
  return null;
}

// ── Product card detection ───────────────────────────────────────────────────
function isProductLine(line: string): boolean {
  return /^-\s+\*\*/.test(line.trim());
}

function parseProductLine(line: string): { name: string; details: string } {
  const trimmed = line.trim().replace(/^-\s+/, '');
  // Match **Name** — details or **Name**: details
  const match = trimmed.match(/^\*\*([^*]+)\*\*\s*[—:-]\s*(.*)/);
  if (match) {
    return { name: match[1].trim(), details: match[2].trim() };
  }
  // Fallback: strip bold markers
  const nameOnly = trimmed.replace(/\*\*/g, '');
  return { name: nameOnly, details: '' };
}

function countProductLines(lines: string[]): number {
  return lines.filter(isProductLine).length;
}

// ── Action type formatting ───────────────────────────────────────────────────
function formatActionType(actionType: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    update_goal: { label: 'Goal Change', color: '#3B82F6' },
    add_food_to_diary: { label: 'Add Food', color: '#10B981' },
    create_meal: { label: 'Create Meal', color: '#8B5CF6' },
    create_meal_plan: { label: 'Meal Plan', color: '#F59E0B' },
    schedule_reminder: { label: 'Reminder', color: '#EC4899' },
    update_preferences: { label: 'Preferences', color: '#6B7280' },
  };
  const key = (actionType || '').toLowerCase().replace(/\s+/g, '_');
  return map[key] || { label: actionType || 'Action', color: colors.primary };
}

// ── Markdown-like inline parser ──────────────────────────────────────────────
function renderStructuredText(
  content: string,
  baseTextStyle: object,
  secondaryColor: string,
  isDark: boolean
): React.ReactNode[] {
  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];

  // Check if this message has 3+ product lines → render product cards
  const productLineCount = countProductLines(lines);
  const useProductCards = productLineCount >= 3;

  lines.forEach((line, lineIdx) => {
    const key = `line-${lineIdx}`;

    // ### Header
    if (line.startsWith('### ')) {
      const headerText = line.replace(/^###\s*/, '');
      nodes.push(
        <Text key={key} style={[baseTextStyle, styles.mdHeader]}>
          {headerText}
        </Text>
      );
      return;
    }

    // Numbered list item: "1. " "2. " etc.
    const numberedMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) {
      const num = numberedMatch[1];
      const rest = numberedMatch[2];
      nodes.push(
        <View key={key} style={styles.mdListRow}>
          <Text style={[baseTextStyle, styles.mdListNum]}>{num}.</Text>
          <Text style={[baseTextStyle, styles.mdListText]}>{renderBoldInline(rest, baseTextStyle)}</Text>
        </View>
      );
      return;
    }

    // Product card lines
    if (useProductCards && isProductLine(line)) {
      const { name, details } = parseProductLine(line);
      const store = detectStore(line);
      nodes.push(
        <View
          key={key}
          style={[
            styles.productCard,
            { backgroundColor: isDark ? '#2A2C40' : '#FFFFFF' },
          ]}
        >
          <View style={styles.productCardHeader}>
            <Text style={[styles.productCardName, { color: isDark ? colors.textDark : colors.text }]}>
              {name}
            </Text>
            {store && (
              <View style={[styles.storeBadge, { backgroundColor: store.colors.bg }]}>
                <Text style={[styles.storeBadgeText, { color: store.colors.text }]}>
                  {store.name}
                </Text>
              </View>
            )}
          </View>
          {details.length > 0 && (
            <Text style={[styles.productCardDetails, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {details}
            </Text>
          )}
        </View>
      );
      return;
    }

    // Empty line → small spacer
    if (line.trim() === '') {
      nodes.push(<View key={key} style={styles.mdSpacer} />);
      return;
    }

    // Regular line — handle **bold** inline
    nodes.push(
      <Text key={key} style={[baseTextStyle, styles.mdLine]}>
        {renderBoldInline(line, baseTextStyle)}
      </Text>
    );
  });

  return nodes;
}

function renderBoldInline(text: string, baseTextStyle: object): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      return (
        <Text key={i} style={[baseTextStyle, styles.mdBold]}>
          {inner}
        </Text>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

// ── Typing indicator dots ────────────────────────────────────────────────────
function TypingIndicator({ isDark }: { isDark: boolean }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ])
      );

    const a1 = animateDot(dot1, 0);
    const a2 = animateDot(dot2, 200);
    const a3 = animateDot(dot3, 400);
    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  const dotStyle = (anim: Animated.Value) => ({
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: isDark ? colors.textSecondaryDark : colors.textSecondary,
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [
      {
        translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }),
      },
    ],
  });

  return (
    <View style={[styles.typingBubble, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
      <View style={[styles.coachAvatarSmall, { backgroundColor: colors.primary + '20' }]}>
        <IconSymbol
          ios_icon_name="brain.head.profile"
          android_material_icon_name="psychology"
          size={14}
          color={colors.primary}
        />
      </View>
      <View style={styles.typingDots}>
        <Animated.View style={dotStyle(dot1)} />
        <Animated.View style={dotStyle(dot2)} />
        <Animated.View style={dotStyle(dot3)} />
      </View>
    </View>
  );
}

// ── Quick Action Card ────────────────────────────────────────────────────────
function QuickActionCard({
  emoji,
  title,
  subtitle,
  onPress,
  isDark,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.quickCard,
        {
          backgroundColor: isDark ? colors.cardDark : '#FFFFFF',
          shadowColor: isDark ? '#000' : '#000',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={styles.quickCardEmoji}>{emoji}</Text>
      <Text style={[styles.quickCardTitle, { color: isDark ? colors.textDark : colors.text }]}>
        {title}
      </Text>
      <Text style={[styles.quickCardSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
}

// ── Action Confirmation Bottom Sheet ────────────────────────────────────────
function ActionConfirmSheet({
  visible,
  action,
  isDark,
  onConfirm,
  onReject,
}: {
  visible: boolean;
  action: ActionProposal | null;
  isDark: boolean;
  onConfirm: (action_id: string, confirmation_token: string) => void;
  onReject: () => void;
}) {
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);

  useEffect(() => {
    if (visible) setEvidenceExpanded(false);
  }, [visible]);

  if (!action) return null;

  const proposal = action.proposal;
  const actionTypeInfo = formatActionType(proposal.action_type || proposal.goal_type || '');
  const isReversible = proposal.is_reversible !== false;

  const currentVal = proposal.current_value !== undefined ? String(proposal.current_value) : null;
  const proposedVal = proposal.proposed_value !== undefined ? String(proposal.proposed_value) : null;
  const goalType = proposal.goal_type || proposal.action_type || '';
  const unitLabel = goalType.toLowerCase().includes('calorie') ? ' cal' : '';

  const evidenceText = proposal.data_evidence
    ? JSON.stringify(proposal.data_evidence, null, 2)
    : null;

  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryText = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        console.log('[AICoach] Action sheet dismissed via back button');
        onReject();
      }}
    >
      <View style={styles.sheetBackdrop}>
        <TouchableOpacity style={styles.sheetBackdropTouch} activeOpacity={1} onPress={onReject} />
        <View style={[styles.sheetContainer, { backgroundColor: cardBg }]}>
          {/* Header */}
          <View style={[styles.sheetHeader, { borderBottomColor: borderColor }]}>
            <Text style={[styles.sheetTitle, { color: textColor }]}>
              Coach Recommendation
            </Text>
            <TouchableOpacity
              onPress={() => {
                console.log('[AICoach] Action sheet close button pressed');
                onReject();
              }}
              style={styles.sheetCloseBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.sheetCloseX, { color: secondaryText }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Action type badge */}
            <View style={styles.sheetBadgeRow}>
              <View style={[styles.sheetBadge, { backgroundColor: actionTypeInfo.color + '22' }]}>
                <Text style={[styles.sheetBadgeText, { color: actionTypeInfo.color }]}>
                  {actionTypeInfo.label}
                </Text>
              </View>
            </View>

            {/* Proposed change */}
            {currentVal && proposedVal && (
              <View style={[styles.sheetChangeCard, { backgroundColor: isDark ? '#1A1C2E' : '#F7F8FC', borderColor }]}>
                <Text style={[styles.sheetChangeLabel, { color: secondaryText }]}>
                  Proposed Change
                </Text>
                <View style={styles.sheetChangeRow}>
                  <Text style={[styles.sheetChangeValue, { color: textColor }]}>
                    {currentVal}
                    {unitLabel}
                  </Text>
                  <Text style={[styles.sheetChangeArrow, { color: actionTypeInfo.color }]}>
                    →
                  </Text>
                  <Text style={[styles.sheetChangeValue, { color: actionTypeInfo.color }]}>
                    {proposedVal}
                    {unitLabel}
                  </Text>
                </View>
              </View>
            )}

            {/* Reason */}
            {proposal.reason ? (
              <View style={styles.sheetSection}>
                <Text style={[styles.sheetSectionTitle, { color: textColor }]}>
                  Reason
                </Text>
                <Text style={[styles.sheetSectionBody, { color: secondaryText }]}>
                  {proposal.reason}
                </Text>
              </View>
            ) : null}

            {/* Expected effect */}
            {proposal.expected_effect ? (
              <View style={styles.sheetSection}>
                <Text style={[styles.sheetSectionTitle, { color: textColor }]}>
                  Expected Effect
                </Text>
                <Text style={[styles.sheetSectionBody, { color: secondaryText }]}>
                  {proposal.expected_effect}
                </Text>
              </View>
            ) : null}

            {/* Data evidence (collapsible) */}
            {evidenceText ? (
              <View style={styles.sheetSection}>
                <TouchableOpacity
                  style={styles.sheetEvidenceToggle}
                  onPress={() => {
                    const next = !evidenceExpanded;
                    console.log('[AICoach] Evidence section toggled:', next ? 'expanded' : 'collapsed');
                    setEvidenceExpanded(next);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sheetSectionTitle, { color: textColor }]}>
                    Data Used
                  </Text>
                  <Text style={[styles.sheetEvidenceChevron, { color: secondaryText }]}>
                    {evidenceExpanded ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>
                {evidenceExpanded && (
                  <View style={[styles.sheetEvidenceBox, { backgroundColor: isDark ? '#1A1C2E' : '#F7F8FC', borderColor }]}>
                    <Text style={[styles.sheetEvidenceText, { color: secondaryText }]}>
                      {evidenceText}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            {/* Reversible badge */}
            <View style={[styles.sheetReversibleBadge, { backgroundColor: isReversible ? '#10B98122' : '#F59E0B22' }]}>
              <Text style={[styles.sheetReversibleText, { color: isReversible ? '#10B981' : '#F59E0B' }]}>
                {isReversible ? '✓ This change can be undone' : '⚠ This change cannot be undone'}
              </Text>
            </View>
          </ScrollView>

          {/* Buttons */}
          <View style={[styles.sheetButtons, { borderTopColor: borderColor }]}>
            <TouchableOpacity
              style={[styles.sheetConfirmBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                console.log('[AICoach] Confirm action pressed, action_id:', action.action_id);
                onConfirm(action.action_id, action.confirmation_token);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.sheetConfirmBtnText}>
                Confirm
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetRejectBtn, { borderColor }]}
              onPress={() => {
                console.log('[AICoach] Reject action pressed, action_id:', action.action_id);
                onReject();
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.sheetRejectBtnText, { color: secondaryText }]}>
                Reject
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function AICoachScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const scrollViewRef = useRef<ScrollView>(null);
  const isMountedRef = useRef(true);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [messages, setMessages] = useState<MessageWithId[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');

  const { sendMessage, loading, pendingAction, clearPendingAction, confirmAction } = useAICoach();

  useEffect(() => {
    isMountedRef.current = true;
    console.log('[AICoach] Screen mounted');
    return () => {
      isMountedRef.current = false;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    if (!isMountedRef.current) return;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && scrollViewRef.current) {
        try {
          scrollViewRef.current.scrollToEnd({ animated: true });
        } catch (_) {}
      }
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, loading, scrollToBottom]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      console.log('[AICoach] Send button pressed, message:', trimmed.slice(0, 80));

      const userMsg: MessageWithId = {
        id: genId(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputText('');

      // Build conversation history (exclude welcome id, keep role/content/timestamp)
      const history: CoachMessage[] = [...messages, userMsg].map(({ role, content, timestamp }) => ({
        role,
        content,
        timestamp,
      }));

      console.log('[AICoach] Invoking ai-coach edge function with', history.length, 'messages');

      try {
        const reply = await sendMessage(history);

        if (!isMountedRef.current) return;

        if (reply) {
          console.log('[AICoach] Received reply, length:', reply.length);
          const assistantMsg: MessageWithId = {
            id: genId(),
            role: 'assistant',
            content: reply,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        } else {
          console.warn('[AICoach] Empty reply from edge function');
          const errMsg: MessageWithId = {
            id: genId(),
            role: 'assistant',
            content: 'Something went wrong. Please try again.',
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errMsg]);
        }
      } catch (e: any) {
        if (!isMountedRef.current) return;
        console.error('[AICoach] Error from sendMessage:', e?.message);

        if (e?.isSubscriptionError) {
          Alert.alert('Subscription Required', 'AI Coach requires an active subscription.');
        } else {
          Alert.alert('Error', 'Something went wrong. Please try again.');
        }

        const errMsg: MessageWithId = {
          id: genId(),
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errMsg]);
      }
    },
    [loading, messages, sendMessage]
  );

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      console.log('[AICoach] Suggested prompt tapped:', prompt);
      handleSend(prompt);
    },
    [handleSend]
  );

  const handleQuickAction = useCallback(
    (card: typeof QUICK_ACTION_CARDS[number]) => {
      console.log('[AICoach] Quick action card tapped:', card.title, '→', card.message);
      handleSend(card.message);
    },
    [handleSend]
  );

  const handleCravingChip = useCallback(
    (chip: string) => {
      console.log('[AICoach] Craving chip tapped:', chip);
      handleSend(chip);
    },
    [handleSend]
  );

  const handleSendPress = useCallback(() => {
    console.log('[AICoach] Send button pressed');
    handleSend(inputText);
  }, [handleSend, inputText]);

  const handleConfirmAction = useCallback(
    async (action_id: string, confirmation_token: string) => {
      console.log('[AICoach] Confirming action:', action_id);
      const confirmText = `Confirmed. Please execute action_id: ${action_id} with confirmation_token: ${confirmation_token}`;

      const userMsg: MessageWithId = {
        id: genId(),
        role: 'user',
        content: confirmText,
        timestamp: Date.now(),
      };

      clearPendingAction();
      setMessages((prev) => [...prev, userMsg]);

      const history: CoachMessage[] = [...messages, userMsg].map(({ role, content, timestamp }) => ({
        role,
        content,
        timestamp,
      }));

      console.log('[AICoach] Sending confirmation to ai-coach, history length:', history.length);

      try {
        const reply = await sendMessage(history);
        if (!isMountedRef.current) return;
        if (reply) {
          const assistantMsg: MessageWithId = {
            id: genId(),
            role: 'assistant',
            content: reply,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
      } catch (e: any) {
        console.error('[AICoach] Error confirming action:', e?.message);
      }
    },
    [clearPendingAction, messages, sendMessage]
  );

  const formatTime = useCallback((timestamp: number): string => {
    try {
      const d = new Date(timestamp);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, []);

  const isOnlyWelcome = messages.length === 1 && messages[0].id === WELCOME_MESSAGE.id;
  const showCravingChips = !isOnlyWelcome && inputText.length === 0 && !loading;
  const canSend = inputText.trim().length > 0 && !loading;

  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const baseAssistantTextStyle = { ...(typography.body as object), lineHeight: 22, color: isDark ? colors.textDark : colors.text };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
        <TouchableOpacity
          onPress={() => {
            console.log('[AICoach] Back button pressed');
            router.back();
          }}
          style={styles.backButton}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={[styles.headerIconWrap, { backgroundColor: colors.primary + '18' }]}>
            <IconSymbol
              ios_icon_name="brain.head.profile"
              android_material_icon_name="psychology"
              size={22}
              color={colors.primary}
            />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: isDark ? colors.textDark : colors.text }]}>
              AI Coach
            </Text>
            <Text style={[styles.headerSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Body Transformation Coach
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => {
              console.log('[AICoach] Action history button pressed');
              router.push('/coach-action-history');
            }}
            style={styles.headerIconBtn}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <IconSymbol
              ios_icon_name="clock"
              android_material_icon_name="history"
              size={20}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              console.log('[AICoach] Permissions settings button pressed');
              router.push('/coach-permissions');
            }}
            style={styles.headerIconBtn}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <IconSymbol
              ios_icon_name="gearshape"
              android_material_icon_name="settings"
              size={20}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Chat area ── */}
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Quick Action Cards — welcome state only ── */}
          {isOnlyWelcome && !loading && (
            <View style={styles.quickActionsSection}>
              <Text style={[styles.quickActionsLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                What would you like to do?
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickActionsRow}
              >
                {QUICK_ACTION_CARDS.map((card) => (
                  <QuickActionCard
                    key={card.title}
                    emoji={card.emoji}
                    title={card.title}
                    subtitle={card.subtitle}
                    isDark={isDark}
                    onPress={() => handleQuickAction(card)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {messages.map((message) => {
            const isUser = message.role === 'user';
            const timeText = formatTime(message.timestamp);

            if (isUser) {
              return (
                <View key={message.id} style={styles.userMessageWrapper}>
                  <View style={[styles.userBubble, { backgroundColor: colors.primary }]}>
                    <Text style={styles.userBubbleText}>{message.content}</Text>
                    {timeText ? (
                      <Text style={styles.userBubbleTime}>{timeText}</Text>
                    ) : null}
                  </View>
                </View>
              );
            }

            const structuredNodes = renderStructuredText(message.content, baseAssistantTextStyle, secondaryColor, isDark);

            return (
              <View key={message.id} style={styles.assistantMessageWrapper}>
                <View style={[styles.coachAvatarSmall, { backgroundColor: colors.primary + '20' }]}>
                  <IconSymbol
                    ios_icon_name="brain.head.profile"
                    android_material_icon_name="psychology"
                    size={14}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.assistantBubbleColumn}>
                  <Text style={[styles.coachLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    Coach
                  </Text>
                  <View style={[styles.assistantBubble, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
                    <View>{structuredNodes}</View>
                    {timeText ? (
                      <Text style={[styles.assistantBubbleTime, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {timeText}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}

          {/* Typing indicator */}
          {loading && (
            <View style={styles.typingWrapper}>
              <TypingIndicator isDark={isDark} />
            </View>
          )}

          {/* Suggested prompts — only when conversation is at welcome state */}
          {isOnlyWelcome && !loading && (
            <View style={styles.suggestedContainer}>
              <Text style={[styles.suggestedLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Try asking...
              </Text>
              <View style={styles.suggestedChips}>
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <TouchableOpacity
                    key={prompt}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isDark ? colors.cardDark : colors.card,
                        borderColor: isDark ? colors.borderDark : colors.border,
                      },
                    ]}
                    onPress={() => handleSuggestedPrompt(prompt)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, { color: isDark ? colors.textDark : colors.text }]}>
                      {prompt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* ── Craving chips — above input bar, non-welcome state ── */}
        {showCravingChips && (
          <View style={[styles.cravingRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cravingChipsContent}
              keyboardShouldPersistTaps="handled"
            >
              {CRAVING_CHIPS.map((chip) => (
                <TouchableOpacity
                  key={chip}
                  style={[
                    styles.cravingChip,
                    {
                      backgroundColor: isDark ? colors.cardDark : colors.card,
                      borderColor: isDark ? colors.borderDark : colors.border,
                    },
                  ]}
                  onPress={() => handleCravingChip(chip)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.cravingChipText, { color: isDark ? colors.textDark : colors.text }]}>
                    {chip}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Input bar ── */}
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: isDark ? colors.cardDark : colors.card,
              borderTopColor: isDark ? colors.borderDark : colors.border,
            },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? colors.backgroundDark : colors.background,
                color: isDark ? colors.textDark : colors.text,
              },
            ]}
            placeholder="Ask your coach anything..."
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            value={inputText}
            onChangeText={(t) => {
              setInputText(t);
            }}
            multiline
            maxLength={1000}
            editable={!loading}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: canSend ? colors.primary : colors.border }]}
            onPress={handleSendPress}
            disabled={!canSend}
            activeOpacity={0.8}
          >
            <IconSymbol
              ios_icon_name="arrow.up"
              android_material_icon_name="send"
              size={20}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Action Confirmation Bottom Sheet ── */}
      <ActionConfirmSheet
        visible={pendingAction !== null}
        action={pendingAction}
        isDark={isDark}
        onConfirm={handleConfirmAction}
        onReject={() => {
          console.log('[AICoach] Action rejected by user');
          clearPendingAction();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    justifyContent: 'center',
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Layout ──────────────────────────────────────────────────────────────
  keyboardView: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  // ── Quick Action Cards ───────────────────────────────────────────────────
  quickActionsSection: {
    marginBottom: spacing.lg,
  },
  quickActionsLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.sm,
    letterSpacing: 0.2,
  },
  quickActionsRow: {
    paddingHorizontal: 0,
    paddingVertical: 12,
    gap: 10,
    flexDirection: 'row',
  },
  quickCard: {
    width: 110,
    borderRadius: 12,
    padding: 12,
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    alignItems: 'flex-start',
  },
  quickCardEmoji: {
    fontSize: 22,
    marginBottom: 6,
  },
  quickCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
    lineHeight: 17,
  },
  quickCardSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
  },
  // ── User bubble ─────────────────────────────────────────────────────────
  userMessageWrapper: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    marginBottom: spacing.md,
  },
  userBubble: {
    borderRadius: borderRadius.lg,
    borderBottomRightRadius: 4,
    padding: spacing.md,
    elevation: 1,
  },
  userBubbleText: {
    ...typography.body,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  userBubbleTime: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
  },
  // ── Assistant bubble ────────────────────────────────────────────────────
  assistantMessageWrapper: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    maxWidth: '85%',
    marginBottom: spacing.md,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  coachAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    flexShrink: 0,
  },
  assistantBubbleColumn: {
    flex: 1,
  },
  coachLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  assistantBubble: {
    borderRadius: borderRadius.lg,
    borderBottomLeftRadius: 4,
    padding: spacing.md,
    elevation: 1,
  },
  assistantBubbleTime: {
    fontSize: 11,
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
  },
  // ── Markdown rendering ───────────────────────────────────────────────────
  mdHeader: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 2,
  },
  mdBold: {
    fontWeight: '700',
  },
  mdLine: {
    lineHeight: 22,
  },
  mdSpacer: {
    height: 6,
  },
  mdListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
    paddingLeft: 4,
  },
  mdListNum: {
    fontWeight: '700',
    marginRight: 6,
    minWidth: 18,
  },
  mdListText: {
    flex: 1,
    lineHeight: 22,
  },
  // ── Product cards ────────────────────────────────────────────────────────
  productCard: {
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  productCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 3,
  },
  productCardName: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  productCardDetails: {
    fontSize: 12,
    lineHeight: 17,
  },
  storeBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  storeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  // ── Typing indicator ────────────────────────────────────────────────────
  typingWrapper: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderBottomLeftRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    elevation: 1,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  // ── Suggested prompts ───────────────────────────────────────────────────
  suggestedContainer: {
    marginTop: spacing.md,
  },
  suggestedLabel: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  suggestedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  // ── Craving chips ────────────────────────────────────────────────────────
  cravingRow: {
    borderTopWidth: 1,
    paddingVertical: 8,
  },
  cravingChipsContent: {
    paddingHorizontal: spacing.md,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cravingChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  cravingChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  // ── Input bar ───────────────────────────────────────────────────────────
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 120,
    ...typography.body,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Action Confirmation Sheet ────────────────────────────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetBackdropTouch: {
    flex: 1,
  },
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseX: {
    fontSize: 18,
    fontWeight: '400',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetBadgeRow: {
    flexDirection: 'row',
  },
  sheetBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  sheetBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sheetChangeCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  sheetChangeLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  sheetChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sheetChangeValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  sheetChangeArrow: {
    fontSize: 22,
    fontWeight: '700',
  },
  sheetSection: {
    gap: 6,
  },
  sheetSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sheetSectionBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  sheetEvidenceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetEvidenceChevron: {
    fontSize: 12,
  },
  sheetEvidenceBox: {
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    marginTop: 6,
  },
  sheetEvidenceText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  sheetReversibleBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  sheetReversibleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sheetButtons: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  sheetConfirmBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  sheetRejectBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  sheetRejectBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

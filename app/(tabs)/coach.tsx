
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
  Image,
  Modal,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { useAICoach, Message, ActionProposal } from '@/hooks/useAICoach';
import { usePremium } from '@/hooks/usePremium';
import { supabase } from '@/lib/supabase/client';
import { createMealPlan, addMealPlanItem } from '@/utils/mealPlansApi';

// ── ID generator ────────────────────────────────────────────────────────────
let msgCounter = 0;
const genId = () => {
  msgCounter += 1;
  return `coach-${Date.now()}-${msgCounter}`;
};

type MessageWithId = Message & { showUpgradeButton?: boolean; isPremiumGate?: boolean; isTyping?: boolean };

const SUGGESTED_PROMPTS = [
  'Analyze my last 14 days',
];

const QUICK_ACTION_CARDS = [
  { iosIcon: 'calendar', androidIcon: 'calendar_month', title: 'Weekly Review', subtitle: 'Full week summary', message: 'Give me my weekly progress review' },
  { iosIcon: 'fork.knife', androidIcon: 'restaurant', title: 'What can I eat?', subtitle: 'Remaining macros', message: 'What can I eat with my remaining macros today?' },
  { iosIcon: 'target', androidIcon: 'track_changes', title: 'Am I on track?', subtitle: 'Weekly progress check', message: 'Am I on track this week?' },
  { iosIcon: 'magnifyingglass', androidIcon: 'search', title: 'Analyze patterns', subtitle: 'Last 14 days', message: 'Detect any patterns in my last 14 days' },
  { iosIcon: 'menucard.fill', androidIcon: 'menu_book', title: 'Restaurant Menu', subtitle: 'Under 500 cal options', message: "What can I order at McDonald's under 500 calories?" },
  { iosIcon: 'brain', androidIcon: 'psychology', title: 'My Profile', subtitle: "Coach's memory", message: 'What have you learned about me so far?' },
];

const CRAVING_CHIPS = [
  { label: "I don't know where to start", iosIcon: 'questionmark.circle.fill', androidIcon: 'help', message: "I don't know where to start" },
  { label: "I eat out a lot and can't stay on track", iosIcon: 'fork.knife', androidIcon: 'restaurant', message: "I eat out a lot and can't stay on track" },
  { label: "I have no energy", iosIcon: 'battery.25', androidIcon: 'battery_alert', message: "I have no energy lately" },
  { label: "I've tried before but nothing sticks", iosIcon: 'arrow.counterclockwise', androidIcon: 'replay', message: "I've tried before but nothing sticks" },
  { label: "I can't control my cravings", iosIcon: 'flame.fill', androidIcon: 'local_fire_department', message: "I can't control my cravings" },
  { label: "I want a meal plan", iosIcon: 'menucard.fill', androidIcon: 'menu_book', message: "Can you build me a meal plan?" },
];

// ── New user quick actions (shown after first proactive message for new users) ──
const NEW_USER_QUICK_ACTIONS = [
  { iosIcon: 'house.fill', androidIcon: 'home', title: 'I cook at home', subtitle: 'Mostly home-cooked meals', message: 'I mostly cook at home' },
  { iosIcon: 'fork.knife', androidIcon: 'restaurant', title: 'I eat out a lot', subtitle: 'Restaurants & takeout', message: 'I eat out a lot, mostly restaurants and takeout' },
  { iosIcon: 'arrow.left.arrow.right', androidIcon: 'sync_alt', title: 'Mix of both', subtitle: 'Home & eating out', message: 'I do a mix of cooking at home and eating out' },
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
  const match = trimmed.match(/^\*\*([^*]+)\*\*\s*[—:-]\s*(.*)/);
  if (match) {
    return { name: match[1].trim(), details: match[2].trim() };
  }
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
  // Strip ACTION_PROPOSAL block from displayed text
  const actionProposalIndex = content.indexOf('ACTION_PROPOSAL:');
  const cleanContent = actionProposalIndex !== -1 ? content.slice(0, actionProposalIndex).trimEnd() : content;
  const lines = cleanContent.split('\n');
  const nodes: React.ReactNode[] = [];

  const productLineCount = countProductLines(lines);
  const useProductCards = productLineCount >= 3;

  type LineTag =
    | { type: 'header'; text: string }
    | { type: 'numbered'; num: string; text: string }
    | { type: 'bullet'; text: string }
    | { type: 'product'; raw: string }
    | { type: 'empty' }
    | { type: 'text'; raw: string };

  const tagged: LineTag[] = lines.map((line) => {
    if (line.startsWith('### ')) return { type: 'header', text: line.replace(/^###\s*/, '') };
    const numberedMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) return { type: 'numbered', num: numberedMatch[1], text: numberedMatch[2] };
    if (useProductCards && isProductLine(line)) return { type: 'product', raw: line };
    if (line.trim() === '') return { type: 'empty' };
    const bulletMatch = line.match(/^[-•]\s+(.*)/);
    if (bulletMatch) return { type: 'bullet', text: bulletMatch[1] };
    return { type: 'text', raw: line };
  });

  type ResolvedTag =
    | { type: 'header'; text: string }
    | { type: 'numbered'; num: string; text: string }
    | { type: 'auto-numbered'; num: number; text: string }
    | { type: 'bullet-single'; text: string }
    | { type: 'product'; raw: string }
    | { type: 'empty' }
    | { type: 'text'; raw: string };

  const resolved: ResolvedTag[] = [];
  let i = 0;
  while (i < tagged.length) {
    const tag = tagged[i];
    if (tag.type === 'bullet') {
      const group: string[] = [];
      let j = i;
      while (j < tagged.length && tagged[j].type === 'bullet') {
        group.push((tagged[j] as { type: 'bullet'; text: string }).text);
        j++;
      }
      if (group.length >= 2) {
        group.forEach((text, idx) => {
          resolved.push({ type: 'auto-numbered', num: idx + 1, text });
        });
      } else {
        resolved.push({ type: 'bullet-single', text: group[0] });
      }
      i = j;
    } else {
      resolved.push(tag as ResolvedTag);
      i++;
    }
  }

  resolved.forEach((tag, lineIdx) => {
    const key = `line-${lineIdx}`;

    if (tag.type === 'header') {
      nodes.push(
        <Text key={key} style={[baseTextStyle, styles.mdHeader]}>
          {tag.text}
        </Text>
      );
      return;
    }

    if (tag.type === 'numbered') {
      nodes.push(
        <View key={key} style={styles.mdListRow}>
          <Text style={[baseTextStyle, styles.mdListNum]}>{tag.num}.</Text>
          <Text style={[baseTextStyle, styles.mdListText]}>{renderBoldInline(tag.text, baseTextStyle)}</Text>
        </View>
      );
      return;
    }

    if (tag.type === 'auto-numbered') {
      nodes.push(
        <View key={key} style={styles.mdListRow}>
          <Text style={[baseTextStyle, styles.mdListNum]}>{tag.num}.</Text>
          <Text style={[baseTextStyle, styles.mdListText]}>{renderBoldInline(tag.text, baseTextStyle)}</Text>
        </View>
      );
      return;
    }

    if (tag.type === 'bullet-single') {
      nodes.push(
        <View key={key} style={styles.mdListRow}>
          <Text style={[baseTextStyle, styles.mdListNum]}>•</Text>
          <Text style={[baseTextStyle, styles.mdListText]}>{renderBoldInline(tag.text, baseTextStyle)}</Text>
        </View>
      );
      return;
    }

    if (tag.type === 'product') {
      const line = tag.raw;
      const { name, details } = parseProductLine(line);
      const store = detectStore(line);
      nodes.push(
        <View
          key={key}
          style={[styles.productCard, { backgroundColor: isDark ? '#2A2C40' : '#FFFFFF' }]}
        >
          <View style={styles.productCardHeader}>
            <Text style={[styles.productCardName, { color: isDark ? colors.textDark : colors.text }]}>
              {name}
            </Text>
            {store && (
              <View style={[styles.storeBadge, { backgroundColor: store.colors.bg }]}>
                <Text style={[styles.storeBadgeText, { color: store.colors.text }]}>{store.name}</Text>
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

    if (tag.type === 'empty') {
      nodes.push(<View key={key} style={styles.mdSpacer} />);
      return;
    }

    nodes.push(
      <Text key={key} style={[baseTextStyle, styles.mdLine]}>
        {renderBoldInline(tag.raw, baseTextStyle)}
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
      <View style={styles.typingDots}>
        <Animated.View style={dotStyle(dot1)} />
        <Animated.View style={dotStyle(dot2)} />
        <Animated.View style={dotStyle(dot3)} />
      </View>
    </View>
  );
}

// ── Blinking cursor for streaming messages ───────────────────────────────────
function StreamingCursor({ isDark }: { isDark: boolean }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible((v) => !v);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const cursorColor = isDark ? colors.textDark : colors.text;
  const cursorOpacity = visible ? 1 : 0;

  return (
    <Text style={[styles.streamingCursor, { color: cursorColor, opacity: cursorOpacity }]}>
      {'|'}
    </Text>
  );
}

// ── Quick Action Card ────────────────────────────────────────────────────────
function QuickActionCard({
  iosIcon,
  androidIcon,
  title,
  subtitle,
  onPress,
  isDark,
  disabled,
}: {
  iosIcon: string;
  androidIcon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  isDark: boolean;
  disabled?: boolean;
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
      disabled={disabled}
    >
      <View style={[styles.quickCardIconWrap, { backgroundColor: colors.primary + '18' }]}>
        <IconSymbol
          ios_icon_name={iosIcon}
          android_material_icon_name={androidIcon}
          size={20}
          color={colors.primary}
        />
      </View>
      <Text style={[styles.quickCardTitle, { color: isDark ? colors.textDark : colors.text }]}>
        {title}
      </Text>
      <Text style={[styles.quickCardSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
}

// ── Inline Action Card ───────────────────────────────────────────────────────
function InlineActionCard({
  messageId,
  action,
  actionStatus,
  isDark,
  onConfirm,
  onDecline,
}: {
  messageId: string;
  action: ActionProposal;
  actionStatus: 'pending' | 'confirming' | 'confirmed' | 'declined';
  isDark: boolean;
  onConfirm: (messageId: string) => void;
  onDecline: (messageId: string) => void;
}) {
  const proposal = action.proposal;
  const actionTypeInfo = formatActionType(action.action_type || proposal.action_type || proposal.goal_type || '');
  const borderColor = isDark ? colors.borderDark : colors.border;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryText = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? '#1E2035' : '#F7F8FC';

  const currentVal = proposal.current_value !== undefined ? String(proposal.current_value) : null;
  const proposedVal = proposal.proposed_value !== undefined ? String(proposal.proposed_value) : null;
  const goalType = proposal.goal_type || proposal.action_type || '';
  const unitLabel = goalType.toLowerCase().includes('calorie') ? ' cal' : '';

  const isMealPlan = (action.action_type === 'create_meal_plan' || proposal.action_type === 'create_meal_plan') && proposal.days && proposal.days.length > 0;
  const isAddFood = (action.action_type === 'add_food_to_diary' || proposal.action_type === 'add_food_to_diary');
  const mealPlanDays = proposal.days || [];
  const totalMealPlanMeals = mealPlanDays.reduce((sum, d) => sum + d.meals.length, 0);
  const mealsPerDay = mealPlanDays.length > 0 ? Math.round(totalMealPlanMeals / mealPlanDays.length) : 0;
  const totalCalories = mealPlanDays.reduce((sum, d) => sum + d.meals.reduce((s, m) => s + (m.calories || 0), 0), 0);
  const avgCalPerDay = mealPlanDays.length > 0 ? Math.round(totalCalories / mealPlanDays.length) : 0;
  const confirmBtnText = isAddFood ? 'Yes, add it' : isMealPlan ? 'Accept' : 'Confirm';
  const declineBtnText = isAddFood ? 'No thanks' : 'Decline';

  // ── add_food_to_diary: special compact card ──────────────────────────────
  if (isAddFood) {
    const foodCalories = proposal.calories !== undefined ? Number(proposal.calories) : null;
    const foodProtein = proposal.protein !== undefined ? Number(proposal.protein) : null;
    const foodMealType = proposal.meal_type ? String(proposal.meal_type) : null;

    const macroCalText = foodCalories !== null ? `${foodCalories} cal` : '';
    const macroProteinText = foodProtein !== null ? `${foodProtein}g protein` : '';
    const macroMealText = foodMealType ?? '';

    const macroParts = [macroCalText, macroProteinText, macroMealText].filter(Boolean);
    const macroLine = macroParts.join('  •  ');

    if (actionStatus === 'confirmed') {
      return (
        <View style={[styles.inlineActionStatusBadge]}>
          <Text style={[styles.inlineActionStatusText, { color: '#10B981' }]}>
            {'✅ Added to your meals'}
          </Text>
        </View>
      );
    }

    if (actionStatus === 'declined') {
      return (
        <View style={[styles.inlineActionStatusBadge]}>
          <Text style={[styles.inlineActionStatusText, { color: secondaryText }]}>
            {'❌ Not added'}
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.inlineActionCard, { backgroundColor: cardBg, borderColor }]}>
        <Text style={[styles.inlineAddFoodTitle, { color: textColor }]}>
          {'🍽  Add to today\'s meals?'}
        </Text>
        {proposal.food_name ? (
          <Text style={[styles.inlineAddFoodName, { color: textColor }]}>
            {String(proposal.food_name)}
          </Text>
        ) : null}
        {macroLine.length > 0 ? (
          <Text style={[styles.inlineAddFoodMacros, { color: secondaryText }]}>
            {macroLine}
          </Text>
        ) : null}
        <View style={styles.inlineActionButtons}>
          <TouchableOpacity
            style={[styles.inlineActionConfirmBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              console.log('[AICoach] add_food_to_diary confirm pressed, messageId:', messageId, 'food:', proposal.food_name, 'calories:', proposal.calories);
              onConfirm(messageId);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.inlineActionConfirmText}>
              {confirmBtnText}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.inlineActionDeclineBtn, { borderColor }]}
            onPress={() => {
              console.log('[AICoach] add_food_to_diary decline pressed, messageId:', messageId, 'food:', proposal.food_name);
              onDecline(messageId);
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.inlineActionDeclineText, { color: secondaryText }]}>
              {declineBtnText}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isConfirming = actionStatus === 'confirming';

  if (actionStatus === 'confirmed') {
    return (
      <View style={[styles.inlineActionStatusBadge]}>
        <Text style={[styles.inlineActionStatusText, { color: '#10B981' }]}>
          {'✅ Action confirmed'}
        </Text>
      </View>
    );
  }

  if (actionStatus === 'declined') {
    return (
      <View style={[styles.inlineActionStatusBadge]}>
        <Text style={[styles.inlineActionStatusText, { color: secondaryText }]}>
          {'❌ Declined'}
        </Text>
      </View>
    );
  }

  const planName = proposal.plan_name || 'AI Meal Plan';
  const daysCount = String(mealPlanDays.length);
  const mealsPerDayStr = String(mealsPerDay);
  const avgCalStr = '~' + String(avgCalPerDay);

  return (
    <View style={[styles.inlineActionCard, { backgroundColor: isDark ? '#1E2035' : '#FFFFFF', borderColor: isDark ? colors.borderDark : colors.border }]}>
      {/* Header badge — centered */}
      <View style={styles.inlineActionBadgeRow}>
        <View style={[styles.inlineActionBadge, { backgroundColor: colors.primary }]}>
          <Text style={styles.inlineActionBadgeText}>
            {actionTypeInfo.label}
          </Text>
        </View>
      </View>

      {/* Meal plan layout */}
      {isMealPlan ? (
        <>
          {/* Plan name */}
          <Text style={[styles.inlineActionPlanName, { color: textColor }]}>
            {planName}
          </Text>

          {/* Stats row */}
          <View style={styles.inlineActionStatsRow}>
            <View style={[styles.inlineActionStatBox, { backgroundColor: isDark ? '#252740' : '#F0F2F7' }]}>
              <Text style={[styles.inlineActionStatNumber, { color: textColor }]}>
                {daysCount}
              </Text>
              <Text style={[styles.inlineActionStatLabel, { color: secondaryText }]}>
                {'days'}
              </Text>
            </View>
            <View style={[styles.inlineActionStatBox, { backgroundColor: isDark ? '#252740' : '#F0F2F7' }]}>
              <Text style={[styles.inlineActionStatNumber, { color: textColor }]}>
                {mealsPerDayStr}
              </Text>
              <Text style={[styles.inlineActionStatLabel, { color: secondaryText }]}>
                {'meals/day'}
              </Text>
            </View>
            <View style={[styles.inlineActionStatBox, { backgroundColor: isDark ? '#252740' : '#F0F2F7' }]}>
              <Text style={[styles.inlineActionStatNumber, { color: textColor }]}>
                {avgCalStr}
              </Text>
              <Text style={[styles.inlineActionStatLabel, { color: secondaryText }]}>
                {'cal/day'}
              </Text>
            </View>
          </View>

          {/* Description */}
          {proposal.reason ? (
            <Text style={[styles.inlineActionReason, { color: secondaryText, textAlign: 'center' }]}>
              {proposal.reason}
            </Text>
          ) : null}
        </>
      ) : currentVal && proposedVal ? (
        <>
          <View style={[styles.inlineActionChangeRow, { marginBottom: 8, justifyContent: 'center' }]}>
            <Text style={[styles.inlineActionValue, { color: textColor }]}>
              {currentVal}
              {unitLabel}
            </Text>
            <Text style={[styles.inlineActionArrow, { color: actionTypeInfo.color }]}>
              {'→'}
            </Text>
            <Text style={[styles.inlineActionValue, { color: actionTypeInfo.color }]}>
              {proposedVal}
              {unitLabel}
            </Text>
          </View>
          {proposal.reason ? (
            <Text style={[styles.inlineActionReason, { color: secondaryText, textAlign: 'center' }]}>
              {proposal.reason}
            </Text>
          ) : null}
        </>
      ) : proposal.food_name ? (
        <>
          <View style={[styles.inlineActionChangeRow, { marginBottom: 8, justifyContent: 'center' }]}>
            <Text style={[styles.inlineActionValue, { color: textColor }]}>
              {String(proposal.food_name)}
            </Text>
            {proposal.calories !== undefined ? (
              <Text style={[{ fontSize: 13 }, { color: secondaryText }]}>
                {'  '}
                {Number(proposal.calories)}
                {' cal'}
              </Text>
            ) : null}
          </View>
          {proposal.reason ? (
            <Text style={[styles.inlineActionReason, { color: secondaryText, textAlign: 'center' }]}>
              {proposal.reason}
            </Text>
          ) : null}
        </>
      ) : proposal.reason ? (
        <Text style={[styles.inlineActionReason, { color: secondaryText, textAlign: 'center' }]}>
          {proposal.reason}
        </Text>
      ) : null}

      {/* Buttons */}
      <View style={styles.inlineActionButtons}>
        <TouchableOpacity
          style={[styles.inlineActionConfirmBtn, { backgroundColor: colors.primary, opacity: isConfirming ? 0.7 : 1 }]}
          onPress={() => {
            if (isConfirming) return;
            console.log('[AICoach] Inline confirm pressed, messageId:', messageId, 'action_id:', action.action_id, 'type:', action.action_type || proposal.action_type);
            onConfirm(messageId);
          }}
          activeOpacity={0.85}
          disabled={isConfirming}
        >
          <Text style={styles.inlineActionConfirmText}>
            {isConfirming ? 'Creating...' : confirmBtnText}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.inlineActionDeclineBtn, { backgroundColor: isDark ? '#252740' : '#F0F2F7', borderColor: 'transparent' }]}
          onPress={() => {
            console.log('[AICoach] Inline decline pressed, messageId:', messageId, 'action_id:', action.action_id);
            onDecline(messageId);
          }}
          activeOpacity={0.85}
        >
          <Text style={[styles.inlineActionDeclineText, { color: textColor }]}>
            {declineBtnText}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Status card types ────────────────────────────────────────────────────────
type CoachRecommendation = {
  user_status: string;
  evidence_strength: string;
  created_at: string;
  recommendation_text: string;
};

function getStatusInfo(userStatus: string): { icon: string; label: string } {
  const map: Record<string, { icon: string; label: string }> = {
    on_track: { icon: '✅', label: 'On Track' },
    faster_than_expected: { icon: '🚀', label: 'Ahead of Schedule' },
    slower_than_expected: { icon: '📉', label: 'Below Target' },
    possible_plateau: { icon: '⚠️', label: 'Possible Plateau' },
    low_adherence: { icon: '📋', label: 'Low Adherence' },
    incomplete_logging: { icon: '📝', label: 'Incomplete Logging' },
    approaching_goal: { icon: '🎯', label: 'Approaching Goal' },
    goal_achieved: { icon: '🏆', label: 'Goal Achieved' },
    insufficient_data: { icon: '🔍', label: 'Gathering Data' },
    at_risk_of_quitting: { icon: '💪', label: "Let's Get Back on Track" },
  };
  return map[userStatus] ?? { icon: '📊', label: 'Status Unknown' };
}

function getEvidenceBadge(strength: string): { label: string; color: string; bg: string } {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    strong: { label: 'Strong data', color: '#059669', bg: '#D1FAE5' },
    moderate: { label: 'Moderate data', color: '#D97706', bg: '#FEF3C7' },
    limited: { label: 'Limited data', color: '#EA580C', bg: '#FFEDD5' },
    insufficient: { label: 'Insufficient data', color: '#DC2626', bg: '#FEE2E2' },
  };
  return map[(strength ?? '').toLowerCase()] ?? { label: 'Moderate data', color: '#D97706', bg: '#FEF3C7' };
}

function getRelativeTime(isoDate: string): string {
  try {
    const diff = Date.now() - new Date(isoDate).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `Updated ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Updated ${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Updated 1 day ago';
    return `Updated ${days} days ago`;
  } catch {
    return '';
  }
}

// ── Conversation date formatter ──────────────────────────────────────────────
function formatConvDate(isoDate: string): string {
  const d = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Status Card Component ────────────────────────────────────────────────────
function StatusCard({
  recommendation,
  isDark,
  onPress,
}: {
  recommendation: CoachRecommendation;
  isDark: boolean;
  onPress: () => void;
}) {
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';

  const statusInfo = getStatusInfo(recommendation.user_status);
  const evidenceBadge = getEvidenceBadge(recommendation.evidence_strength);
  const relativeTime = getRelativeTime(recommendation.created_at);

  return (
    <TouchableOpacity
      style={[styles.statusCard, { backgroundColor: cardBg }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.statusCardHeader}>
        <Text style={styles.statusCardIcon}>{statusInfo.icon}</Text>
        <View style={styles.statusCardTitleCol}>
          <Text style={[styles.statusCardTitle, { color: textColor }]}>{statusInfo.label}</Text>
          {relativeTime ? (
            <Text style={[styles.statusCardTime, { color: secondaryColor }]}>{relativeTime}</Text>
          ) : null}
        </View>
        <View style={[styles.evidenceBadge, { backgroundColor: evidenceBadge.bg }]}>
          <Text style={[styles.evidenceBadgeText, { color: evidenceBadge.color }]}>{evidenceBadge.label}</Text>
        </View>
      </View>
      <Text style={[styles.statusCardHint, { color: secondaryColor }]}>
        Tap for full assessment →
      </Text>
    </TouchableOpacity>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function CoachScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const scrollViewRef = useRef<ScrollView>(null);
  const isMountedRef = useRef(true);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [inputText, setInputText] = useState('');
  const [latestRecommendation, setLatestRecommendation] = useState<CoachRecommendation | null>(null);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [userWeightUnit, setUserWeightUnit] = useState<string>('lb');
  const [proactiveInsight, setProactiveInsight] = useState<{ text: string; cta: string; ctaMessage: string } | null>(null);

  // ── MGCS: Follow-up card ──────────────────────────────────────────────────
  type FollowUp = { id: string; title: string; reason: string | null; due_date: string | null };
  const [pendingFollowUp, setPendingFollowUp] = useState<FollowUp | null>(null);

  // ── MGCS: New user mode ───────────────────────────────────────────────────
  const [isNewUser, setIsNewUser] = useState(false);
  const [isFirstEverSession, setIsFirstEverSession] = useState(false);
  const [firstMessageReceived, setFirstMessageReceived] = useState(false);

  // ── MGCS: Proactive first message sent flag ───────────────────────────────
  const firstMessageSentRef = useRef(false);

  // ── Premium gate: track how many free user messages have been sent ──────
  const firstUserMessageSentRef = useRef(false);
  const freeMessageCountRef = useRef<number>(0);
  const [isGated, setIsGated] = useState(false);

  const { isPremium, loading: premiumLoading } = usePremium();

  const {
    sendMessage,
    loading,
    pendingAction,
    clearPendingAction,
    messages,
    setMessages,
    conversationId,
    setConversationId,
    initResult,
  } = useAICoach({ weightUnit: userWeightUnit });

  // ── History state ──────────────────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);
  const [historyConversations, setHistoryConversations] = useState<{
    id: string;
    title: string | null;
    created_at: string;
    last_message_at: string;
    preview?: string;
  }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    console.log('[AICoach] Loading conversation history');
    setLoadingHistory(true);
    try {
      const { data: convs } = await supabase
        .from('coach_conversations')
        .select('id, title, created_at, last_message_at')
        .order('last_message_at', { ascending: false })
        .limit(30);

      if (!convs) {
        console.log('[AICoach] No conversations found in history');
        return;
      }

      console.log('[AICoach] History conversations fetched, count:', convs.length);

      const withPreviews = await Promise.all(
        convs.map(async (conv) => {
          const { data: msgs } = await supabase
            .from('coach_messages')
            .select('content, role')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1);
          const lastMsg = msgs?.[0];
          const rawContent = lastMsg ? lastMsg.content : '';
          const prefix = lastMsg?.role === 'user' ? 'You: ' : '';
          const preview = lastMsg
            ? `${prefix}${rawContent.slice(0, 50)}${rawContent.length > 50 ? '...' : ''}`
            : 'No messages';
          return { ...conv, preview };
        })
      );
      setHistoryConversations(withPreviews);
    } catch (e: any) {
      console.warn('[AICoach] Error loading history:', e?.message);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadConversation = useCallback(async (convId: string) => {
    console.log('[AICoach] Loading conversation from history, id:', convId);
    try {
      const { data: msgs } = await supabase
        .from('coach_messages')
        .select('id, role, content, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (msgs && msgs.length > 0) {
        console.log('[AICoach] Conversation messages loaded, count:', msgs.length);
        const messageCount = msgs.length;
        const userMessageCount = msgs.filter((m: any) => m.role === 'user').length;
        console.log('[AICoach] loadConversation — total message count:', messageCount, 'user message count:', userMessageCount);

        // Check gate via AsyncStorage first (source of truth, avoids isPremium race condition)
        let gateActive = false;
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            if (isPremium) {
              // Premium users are never gated — clear any stale key and skip
              await AsyncStorage.removeItem('coach_gate_active_' + user.id);
              console.log('[AICoach] loadConversation — user is premium, skipping gate check');
            } else {
              const gateKey = 'coach_gate_active_' + user.id;
              const gateStored = await AsyncStorage.getItem(gateKey);
              if (gateStored === 'true') {
                gateActive = true;
                console.log('[AICoach] loadConversation — gate active from AsyncStorage');
              } else if (userMessageCount >= 2) {
                // Gate threshold reached — persist and activate regardless of isPremium load state
                gateActive = true;
                await AsyncStorage.setItem(gateKey, 'true');
                console.log('[AICoach] loadConversation — gate threshold reached (', userMessageCount, 'user messages), persisted to AsyncStorage');
              }
            }
          }
        } catch (e: any) {
          console.warn('[AICoach] Error checking gate in loadConversation:', e?.message);
        }

        let mapped: MessageWithId[] = msgs.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.created_at).getTime(),
        }));

        // If gate is active, mark the last assistant message with gate card flags
        if (gateActive) {
          firstUserMessageSentRef.current = true;
          freeMessageCountRef.current = 2;
          setIsGated(true);
          // Find last assistant message and attach gate card flags
          let lastAssistantIdx = -1;
          for (let i = mapped.length - 1; i >= 0; i--) {
            if (mapped[i].role === 'assistant') { lastAssistantIdx = i; break; }
          }
          if (lastAssistantIdx !== -1) {
            mapped = mapped.map((m, i) =>
              i === lastAssistantIdx
                ? { ...m, showUpgradeButton: true, isPremiumGate: true }
                : m
            );
            console.log('[AICoach] loadConversation — gate card flags applied to last assistant message at index', lastAssistantIdx);
          }
        } else if (mapped.some((m: MessageWithId) => m.role === 'user')) {
          firstUserMessageSentRef.current = true;
          const userMsgCount = mapped.filter((m: MessageWithId) => m.role === 'user').length;
          freeMessageCountRef.current = Math.min(userMsgCount, 2);
        }

        setMessages(mapped);
        setConversationId(convId);
      } else {
        console.log('[AICoach] No messages found for conversation:', convId);
      }
      setShowHistory(false);
    } catch (e: any) {
      console.warn('[AICoach] Error loading conversation:', e?.message);
    }
  }, [setMessages, setConversationId, setIsGated, isPremium]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ── Fix 1: Set firstMessageReceived when first assistant message arrives ──
  useEffect(() => {
    if (!isFirstEverSession || firstMessageReceived) return;
    const hasRealAssistantMsg = messages.some(
      (m) => m.role === 'assistant' && m.content !== '' && !m.isTyping
    );
    if (hasRealAssistantMsg) {
      console.log('[AICoach] First assistant message received — showing quick replies');
      setFirstMessageReceived(true);
    }
  }, [messages, isFirstEverSession, firstMessageReceived]);

  // ── Gate restoration: runs when useAICoach loads messages from the initial session ──
  // This handles the case where the hook loads today's conversation on mount and we need
  // to restore the gate state without relying on isPremium being loaded yet.
  const gateRestoredRef = useRef(false);
  useEffect(() => {
    // Only run once when messages are first populated by the hook (not by loadConversation)
    if (gateRestoredRef.current) return;
    if (messages.length === 0) return;
    // If messages were already set by loadConversation (which handles its own gate logic), skip
    // We detect this by checking if any message already has isPremiumGate set
    if (messages.some((m) => m.isPremiumGate)) {
      gateRestoredRef.current = true;
      return;
    }

    const messageCount = messages.length;
    const userMessageCount = messages.filter((m) => m.role === 'user').length;
    console.log('[AICoach] Gate restoration check — message count:', messageCount, 'user message count:', userMessageCount);

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Premium users are never gated
        if (isPremium) {
          await AsyncStorage.removeItem('coach_gate_active_' + user.id);
          console.log('[AICoach] Gate restoration — user is premium, skipping gate');
          gateRestoredRef.current = true;
          return;
        }

        const gateKey = 'coach_gate_active_' + user.id;
        const gateStored = await AsyncStorage.getItem(gateKey);

        let gateActive = false;
        if (gateStored === 'true') {
          gateActive = true;
          console.log('[AICoach] Gate restoration — gate active from AsyncStorage');
        } else if (userMessageCount >= 2) {
          gateActive = true;
          await AsyncStorage.setItem(gateKey, 'true');
          console.log('[AICoach] Gate restoration — threshold reached (', userMessageCount, 'user messages), persisted');
        }

        if (gateActive && isMountedRef.current) {
          firstUserMessageSentRef.current = true;
          freeMessageCountRef.current = 2;
          setIsGated(true);
          // Apply gate card flags to last assistant message
          setMessages((prev) => {
            let lastAssistantIdx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === 'assistant') { lastAssistantIdx = i; break; }
            }
            if (lastAssistantIdx === -1) return prev;
            console.log('[AICoach] Gate restoration — applying gate card flags to message at index', lastAssistantIdx);
            return prev.map((m, i) =>
              i === lastAssistantIdx
                ? { ...m, showUpgradeButton: true, isPremiumGate: true }
                : m
            );
          });
        } else if (messages.some((m) => m.role === 'user')) {
          firstUserMessageSentRef.current = true;
          const userMsgCount = messages.filter((m) => m.role === 'user').length;
          freeMessageCountRef.current = Math.min(userMsgCount, 2);
        }

        gateRestoredRef.current = true;
      } catch (e: any) {
        console.warn('[AICoach] Gate restoration error:', e?.message);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => {
    isMountedRef.current = true;
    console.log('[AICoach] Screen mounted');

    // Fetch latest recommendation for Phase 8 status card
    (async () => {
      try {
        console.log('[AICoach] Fetching latest coach recommendation');
        const { data, error } = await supabase
          .from('coach_recommendations')
          .select('user_status, evidence_strength, created_at, recommendation_text')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (error) {
          if (error.code !== 'PGRST116') {
            console.warn('[AICoach] Error fetching recommendation:', error.message);
          }
          return;
        }
        if (data) {
          console.log('[AICoach] Latest recommendation fetched, status:', data.user_status);
          if (isMountedRef.current) {
            setLatestRecommendation(data as CoachRecommendation);
          }
        }
      } catch (e: any) {
        console.warn('[AICoach] Recommendation fetch error:', e?.message);
      }
    })();

    // Fetch user weight unit preference
    (async () => {
      try {
        console.log('[AICoach] Fetching user weight unit preference');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from('users')
          .select('weight_unit')
          .eq('id', user.id)
          .single();
        if (error) {
          console.warn('[AICoach] Error fetching weight unit:', error.message);
          return;
        }
        if (data?.weight_unit) {
          console.log('[AICoach] User weight unit:', data.weight_unit);
          if (isMountedRef.current) {
            setUserWeightUnit(data.weight_unit);
          }
        }
      } catch (e: any) {
        console.warn('[AICoach] Weight unit fetch error:', e?.message);
      }
    })();

    // ── MGCS: Fetch pending follow-up card ────────────────────────────────
    (async () => {
      try {
        console.log('[AICoach] Fetching pending follow-up card');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: followUp, error } = await supabase
          .from('coach_followups')
          .select('id, title, reason, due_date')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .order('priority', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          console.warn('[AICoach] Error fetching follow-up:', error.message);
          return;
        }
        if (followUp && isMountedRef.current) {
          console.log('[AICoach] Pending follow-up found:', followUp.id, followUp.title);
          setPendingFollowUp(followUp as FollowUp);
        } else {
          console.log('[AICoach] No pending follow-ups');
        }
      } catch (e: any) {
        console.warn('[AICoach] Follow-up fetch error:', e?.message);
      }
    })();

    // Fetch today's nutrition context (proactive insight + new user detection)
    // The welcome/first-message logic is handled in a separate useEffect that
    // depends on isInitialized so there is no race condition.
    (async () => {
      try {
        console.log('[AICoach] Fetching today\'s nutrition context');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const todayStr = new Date().toISOString().split('T')[0];
        const { data: todayMeals } = await supabase
          .from('meals')
          .select('meal_items(calories, protein, carbs, fats)')
          .eq('user_id', user.id)
          .eq('date', todayStr);

        let todayCal = 0, todayProtein = 0, todayCarbs = 0, todayFats = 0;
        for (const meal of (todayMeals || [])) {
          for (const item of ((meal as any).meal_items || [])) {
            todayCal += Number(item.calories) || 0;
            todayProtein += Number(item.protein) || 0;
            todayCarbs += Number(item.carbs) || 0;
            todayFats += Number(item.fats) || 0;
          }
        }

        console.log('[AICoach] Today nutrition totals — cal:', Math.round(todayCal), 'protein:', Math.round(todayProtein), 'carbs:', Math.round(todayCarbs), 'fats:', Math.round(todayFats));

        // ── MGCS: New user detection ──────────────────────────────────────
        const { data: checkIns } = await supabase
          .from('check_ins')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        const hasNoData = todayCal === 0 && (!checkIns || checkIns.length === 0);
        if (hasNoData && isMountedRef.current) {
          console.log('[AICoach] New user detected — no nutrition data and no check-ins');
          setIsNewUser(true);
        }

        // ── MGCS: Check first-ever session flag ───────────────────────────
        const { data: { user: userForFlag } } = await supabase.auth.getUser();
        if (userForFlag) {
          const firstInteractionKey = 'coach_first_interaction_done_' + userForFlag.id;
          const firstInteractionDone = await AsyncStorage.getItem(firstInteractionKey);
          if (!firstInteractionDone) {
            console.log('[AICoach] First-ever session detected — will show welcome chips');
            if (isMountedRef.current) setIsFirstEverSession(true);
          } else {
            console.log('[AICoach] Returning user — welcome chips suppressed');
          }
        }

        // Proactive insight: last 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const { data: weekMeals } = await supabase
          .from('meals')
          .select('date, meal_items(calories, protein)')
          .eq('user_id', user.id)
          .gte('date', sevenDaysAgo)
          .lte('date', todayStr);

        const { data: goalData } = await supabase
          .from('goals')
          .select('protein_g, daily_calories')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Aggregate by date
        const dayMap: Record<string, { protein: number }> = {};
        for (const meal of (weekMeals || [])) {
          const d = (meal as any).date as string;
          if (!dayMap[d]) dayMap[d] = { protein: 0 };
          for (const item of ((meal as any).meal_items || [])) {
            dayMap[d].protein += Number(item.protein) || 0;
          }
        }
        const daysLogged = Object.keys(dayMap).length;
        console.log('[AICoach] Proactive insight — days logged this week:', daysLogged);

        if (daysLogged >= 3 && goalData) {
          const proteinGoal = goalData.protein_g || 0;
          const daysUnderProtein = Object.values(dayMap).filter((d) => proteinGoal > 0 && d.protein < proteinGoal * 0.8).length;

          if (daysUnderProtein >= 3 && proteinGoal > 0) {
            console.log('[AICoach] Proactive insight: under protein goal', daysUnderProtein, 'days');
            if (isMountedRef.current) {
              setProactiveInsight({
                text: `You've been under your protein goal ${daysUnderProtein} of the last ${daysLogged} days logged.`,
                cta: 'Fix my protein',
                ctaMessage: `I've been under my protein goal ${daysUnderProtein} days this week. Help me fix it.`,
              });
            }
          } else if (daysLogged >= 5) {
            console.log('[AICoach] Proactive insight: great consistency,', daysLogged, 'days logged');
            if (isMountedRef.current) {
              setProactiveInsight({
                text: `You've logged ${daysLogged} days this week. Great consistency!`,
                cta: 'See my weekly review',
                ctaMessage: 'Give me my weekly progress review',
              });
            }
          }
        }

        // Daily insights from coach_daily_insights table
        try {
          console.log('[AICoach] Fetching daily insights from coach_daily_insights');
          const { data: dailyInsight } = await supabase
            .from('coach_daily_insights')
            .select('insight_text, cta_message, is_read')
            .eq('user_id', user.id)
            .eq('is_read', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (dailyInsight && isMountedRef.current) {
            // Only set if no proactive insight was already set from nutrition analysis
            setProactiveInsight((prev) => {
              if (prev) return prev;
              console.log('[AICoach] Daily insight found, setting proactive insight');
              return {
                text: dailyInsight.insight_text,
                cta: dailyInsight.cta_message || 'Tell me more',
                ctaMessage: dailyInsight.cta_message || 'Give me my daily coaching insight',
              };
            });
            // Mark as read
            await supabase
              .from('coach_daily_insights')
              .update({ is_read: true })
              .eq('user_id', user.id)
              .eq('is_read', false);
            console.log('[AICoach] Daily insight marked as read');
          } else {
            console.log('[AICoach] No unread daily insights found');
          }
        } catch (e: any) {
          console.warn('[AICoach] Daily insights fetch error:', e?.message);
        }
      } catch (e: any) {
        console.warn('[AICoach] Nutrition context fetch error:', e?.message);
      }
    })();

    return () => {
      isMountedRef.current = false;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMessages]);

  // ── MGCS: Proactive first message — fires once useAICoach finishes init ─────
  // initResult is set atomically by useAICoach with BOTH conversationId and hasHistory
  // in a single setState call, so this effect always sees consistent values.
  useEffect(() => {
    if (!initResult) return;
    if (firstMessageSentRef.current) return;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (!isMountedRef.current) return;

        const firstInteractionKey = 'coach_first_interaction_done_' + user.id;

        // Use the atomically-captured hasHistory flag — avoids the race where
        // messagesRef.current hasn't been updated yet when this effect fires.
        const hasRealHistory = initResult.hasHistory;

        if (!hasRealHistory) {
          firstMessageSentRef.current = true;
          console.log('[AICoach] initResult.hasHistory=false — triggering proactive first message (MGCS First Interaction Protocol)');
          const triggerMsg = [{ role: 'user' as const, content: '__FIRST_INTERACTION__', timestamp: Date.now() }];
          try {
            await sendMessage(triggerMsg, user.id, true);
            console.log('[AICoach] Proactive first message delivered');
            await AsyncStorage.setItem(firstInteractionKey, 'true');
            console.log('[AICoach] First interaction flag persisted for user:', user.id);
          } catch (e: any) {
            console.warn('[AICoach] Proactive first message error:', e?.message);
            firstMessageSentRef.current = false;
          }
          // Reset so the welcome sentinel does NOT consume the free user's message slots
          firstUserMessageSentRef.current = false;
          freeMessageCountRef.current = 0;
          console.log('[AICoach] firstUserMessageSentRef and freeMessageCountRef reset after welcome sentinel');
          return;
        }

        // Legacy: inject local welcome snapshot if history already exists and todayCal > 0
        // (only when messages list is empty — i.e. history loaded but setMessages not yet called)
        if (messagesRef.current.length === 0) {
          // Fetch today's totals for the snapshot
          const todayStr = new Date().toISOString().split('T')[0];
          const { data: todayMeals } = await supabase
            .from('meals')
            .select('meal_items(calories, protein, carbs, fats)')
            .eq('user_id', user.id)
            .eq('date', todayStr);

          let todayCal = 0, todayProtein = 0, todayCarbs = 0, todayFats = 0;
          for (const meal of (todayMeals || [])) {
            for (const item of ((meal as any).meal_items || [])) {
              todayCal += Number(item.calories) || 0;
              todayProtein += Number(item.protein) || 0;
              todayCarbs += Number(item.carbs) || 0;
              todayFats += Number(item.fats) || 0;
            }
          }

          if (todayCal > 0 && isMountedRef.current) {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
            const todayCalRounded = Math.round(todayCal);
            const todayProteinRounded = Math.round(todayProtein);
            const todayCarbsRounded = Math.round(todayCarbs);
            const todayFatsRounded = Math.round(todayFats);
            const welcomeContent = `${greeting}! Here's your nutrition snapshot for today:\n\n**${todayCalRounded} cal** logged  •  **${todayProteinRounded}g** protein  •  **${todayCarbsRounded}g** carbs  •  **${todayFatsRounded}g** fats\n\nWhat can I help you with today?`;
            console.log('[AICoach] Injecting welcome nutrition message');
            setMessages([{
              id: genId(),
              role: 'assistant',
              content: welcomeContent,
              timestamp: Date.now(),
            }]);
          }
        }
      } catch (e: any) {
        console.warn('[AICoach] Welcome message effect error:', e?.message);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initResult]);

  // ── Persistent gate check: runs once premium status is resolved ───────────
  useEffect(() => {
    if (premiumLoading) return; // wait until premium status is known
    if (isPremium) {
      setIsGated(false); // explicitly clear any stale gate state
      return;
    }

    // Free user — check AsyncStorage first, then Supabase
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fast path: AsyncStorage check (avoids Supabase round-trip)
        const gateKey = 'coach_gate_active_' + user.id;
        const gateStored = await AsyncStorage.getItem(gateKey);
        if (gateStored === 'true') {
          // Double-check: if user is now premium, clear the stale gate key
          if (isPremium) {
            await AsyncStorage.removeItem(gateKey);
            console.log('[AICoach] Stale gate key cleared — user is premium');
            return;
          }
          // Also check users.user_type as fallback (source of truth for premium status)
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (currentUser) {
            const { data: userRow } = await supabase
              .from('users')
              .select('user_type')
              .eq('id', currentUser.id)
              .maybeSingle();
            if (userRow && userRow.user_type === 'premium') {
              await AsyncStorage.removeItem(gateKey);
              console.log('[AICoach] Stale gate key cleared — users.user_type confirms premium');
              return;
            }
          }
          firstUserMessageSentRef.current = true;
          setIsGated(true);
          console.log('[AICoach] Gate active from AsyncStorage — skipping Supabase check');
          return;
        }

        const { data: convs } = await supabase
          .from('coach_conversations')
          .select('id')
          .eq('user_id', user.id)
          .limit(10);

        if (!convs || convs.length === 0) return;

        for (const conv of convs) {
          const { count } = await supabase
            .from('coach_messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .eq('role', 'user');
          if ((count ?? 0) >= 2) {
            firstUserMessageSentRef.current = true;
            freeMessageCountRef.current = 2;
            setIsGated(true);
            await AsyncStorage.setItem(gateKey, 'true');
            console.log('[AICoach] Free user already used 2 free messages — gate active');
            return;
          }
        }
      } catch (e: any) {
        console.warn('[AICoach] Gate check error:', e?.message);
      }
    })();
  }, [isPremium, premiumLoading]);

  // ── Fix 3: Clear AsyncStorage gate when user upgrades to Premium ──────────
  useEffect(() => {
    if (!isPremium) return;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await AsyncStorage.removeItem('coach_gate_active_' + user.id);
          console.log('[AICoach] Premium upgrade detected — gate key cleared from AsyncStorage');
        }
      } catch (e: any) {
        console.warn('[AICoach] Error clearing gate key on premium upgrade:', e?.message);
      }
    })();
  }, [isPremium]);

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

  const handleConfirmInlineRef = useRef<(messageId: string) => void>(() => {});

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      // ── Intercept text confirmations for pending action proposals ──────────
      const CONFIRM_PHRASES = ['yes', 'sí', 'si', 'confirm', 'ok', 'sure', 'do it', 'go ahead', 'create it', 'save it', 'create plan', 'save plan', 'yep', 'yeah', 'yup'];
      const isConfirmIntent = CONFIRM_PHRASES.some(p => trimmed.toLowerCase() === p || trimmed.toLowerCase().startsWith(p + ' '));
      const pendingActionMsg = [...messages].reverse().find((m) => m.actionStatus === 'pending' && m.actionProposal);

      if (isConfirmIntent && pendingActionMsg) {
        console.log('[AICoach] Text confirmation detected for pending action, intercepting:', pendingActionMsg.id);
        const userMsg: MessageWithId = {
          id: genId(),
          role: 'user',
          content: trimmed,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInputText('');
        handleConfirmInlineRef.current(pendingActionMsg.id);
        return;
      }

      console.log('[AICoach] Send button pressed, message:', trimmed.slice(0, 80));

      // ── If user is premium, clear any stale gate state immediately ───────────
      if (isPremium) {
        setIsGated(false);
      }

      // ── Premium gate: allow first 2 messages through, gate from 3rd onwards ─
      // __FIRST_INTERACTION__ is a system sentinel — never subject to the gate
      if (!isPremium && trimmed !== '__FIRST_INTERACTION__') {
        if (freeMessageCountRef.current >= 2) {
          // Third message onwards — show premium gate
          console.log('[AICoach] Free user third+ message — showing premium gate');
          const lastMsg = messages[messages.length - 1];
          const alreadyGated = lastMsg?.isPremiumGate === true;
          if (alreadyGated) {
            console.log('[AICoach] Last message is already a premium gate — skipping duplicate');
            setInputText('');
            return;
          }
          const userMsg: MessageWithId = {
            id: genId(),
            role: 'user',
            content: trimmed,
            timestamp: Date.now(),
          };
          const typingMsg: MessageWithId = {
            id: genId(),
            role: 'assistant',
            content: '__TYPING__',
            timestamp: Date.now(),
            isTyping: true,
          };
          setMessages((prev) => [...prev, userMsg, typingMsg]);
          setInputText('');

          setTimeout(async () => {
            const userText = trimmed.toLowerCase();
            let coachFirstLine = '';

            if (userText.includes('sweet') || userText.includes('dessert') || userText.includes('craving') || userText.includes('chocolate') || userText.includes('sugar')) {
              coachFirstLine = "Cravings are almost never about willpower. There's usually something specific triggering them. Based on your goal, here's what I'd focus on first:";
            } else if (userText.includes('eat out') || userText.includes('restaurant') || userText.includes('fast food') || userText.includes('pizza') || userText.includes('burger')) {
              coachFirstLine = "Eating out doesn't have to be the problem. It's usually one specific habit that makes it hard. Based on your goal, I can already see where the real friction is:";
            } else if (userText.includes('energy') || userText.includes('tired') || userText.includes('fatigue') || userText.includes('exhausted')) {
              coachFirstLine = "Low energy is almost always a nutrition signal, not a willpower problem. Based on your profile, I can already see a few things worth looking at:";
            } else if (userText.includes('start') || userText.includes('begin') || userText.includes("don't know") || userText.includes('confused') || userText.includes('lost')) {
              coachFirstLine = "Not knowing where to start is actually the most honest place to be, and it tells me something useful. Based on your goal, here's where I'd begin:";
            } else if (userText.includes('stuck') || userText.includes('plateau') || userText.includes('not losing') || userText.includes('not working') || userText.includes('nothing works')) {
              coachFirstLine = "Plateaus almost always have a specific cause, and it's rarely what people think. After looking at your profile, I can already see what's most likely happening:";
            } else if (userText.includes('protein') || userText.includes('macro') || userText.includes('calorie') || userText.includes('carb') || userText.includes('fat')) {
              coachFirstLine = "Good question. Based on your current goals, I have a specific answer for your situation. Here's what I'd recommend:";
            } else if (userText.includes('meal plan') || userText.includes('what to eat') || userText.includes('plan')) {
              coachFirstLine = "I can build that around your exact goals and what you have available. Based on your profile, here's how I'd structure it:";
            } else if (userText.includes('weight') || userText.includes('lose') || userText.includes('slim') || userText.includes('thin')) {
              coachFirstLine = "Weight loss usually comes down to one or two specific things, and they're different for everyone. Based on your goal, I can already see what's most relevant for you:";
            } else {
              coachFirstLine = "Good question. Based on your goal, I actually have a specific answer for your situation. Here's what I'd focus on first:";
            }

            const gateMsg: MessageWithId = {
              id: genId(),
              role: 'assistant',
              content: coachFirstLine,
              timestamp: Date.now(),
              showUpgradeButton: true,
              isPremiumGate: true,
            };
            setMessages((prev) => prev.filter((m) => !m.isTyping).concat(gateMsg));
            setIsGated(true);

            // Persist gate to AsyncStorage so it survives app restarts
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                await AsyncStorage.setItem('coach_gate_active_' + user.id, 'true');
                console.log('[AICoach] Gate persisted to AsyncStorage for user:', user.id);
              }
            } catch (e: any) {
              console.warn('[AICoach] Error persisting gate to AsyncStorage:', e?.message);
            }

            // Save user reply #2 and gate message to Supabase
            try {
              if (conversationId) {
                await supabase.from('coach_messages').insert({
                  conversation_id: conversationId,
                  role: 'user',
                  content: trimmed,
                });
                await supabase.from('coach_messages').insert({
                  conversation_id: conversationId,
                  role: 'assistant',
                  content: coachFirstLine,
                });
                console.log('[AICoach] Gate messages saved to Supabase, conv_id:', conversationId);
              }
            } catch (saveErr: any) {
              console.warn('[AICoach] Error saving gate messages to Supabase:', saveErr?.message);
            }
          }, 1500);

          return;
        }
        // First or second message — let through, then increment
        freeMessageCountRef.current += 1;
        firstUserMessageSentRef.current = true;
        console.log('[AICoach] Free user message', freeMessageCountRef.current, '— allowing through');
      }

      const userMsg: MessageWithId = {
        id: genId(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputText('');

      // Build conversation history (role/content/timestamp only)
      const history = [...messages, userMsg].map(({ role, content, timestamp }) => ({
        role,
        content,
        timestamp,
      }));

      console.log('[AICoach] Invoking ai-coach SSE with', history.length, 'messages, conversation_id:', conversationId);

      try {
        await sendMessage(history);
      } catch (e: any) {
        if (!isMountedRef.current) return;
        console.error('[AICoach] Error from sendMessage:', e?.message);

        if (!e?.isSubscriptionError) {
          Alert.alert('Error', 'Something went wrong. Please try again.');
          const errMsg: MessageWithId = {
            id: genId(),
            role: 'assistant',
            content: 'Something went wrong. Please try again.',
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errMsg]);
        }
      }
    },
    [loading, messages, sendMessage, conversationId, setMessages, isPremium, premiumLoading, isGated, setIsGated]
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
    (chip: { label: string; iosIcon: string; androidIcon: string; message: string }) => {
      console.log('[AICoach] Craving chip tapped:', chip.label);
      handleSend(chip.message);
    },
    [handleSend]
  );

  const handleSendPress = useCallback(() => {
    console.log('[AICoach] Send button pressed');
    handleSend(inputText);
  }, [handleSend, inputText]);

  // ── Intercept pendingAction and attach it inline to the last assistant message ──
  useEffect(() => {
    if (!pendingAction) return;
    console.log('[AICoach] pendingAction received, attaching inline to last assistant message, action_id:', pendingAction.action_id);
    setMessages((prev) => {
      const reversedIdx = [...prev].reverse().findIndex((m) => m.role === 'assistant' && !m.actionProposal);
      if (reversedIdx === -1) {
        // No suitable assistant message — add a standalone proposal message
        return [
          ...prev,
          {
            id: genId(),
            role: 'assistant' as const,
            content: '',
            timestamp: Date.now(),
            actionProposal: pendingAction,
            actionStatus: 'pending' as const,
          },
        ];
      }
      const realIdx = prev.length - 1 - reversedIdx;
      return prev.map((m, i) =>
        i === realIdx ? { ...m, actionProposal: pendingAction, actionStatus: 'pending' as const } : m
      );
    });
    clearPendingAction();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction]);

  const handleConfirmInline = useCallback(
    async (messageId: string) => {
      console.log('[AICoach] handleConfirmInline called, messageId:', messageId);

      // Find the message to get its actionProposal
      const targetMsg = messages.find((m) => m.id === messageId);
      const actionProposal = targetMsg?.actionProposal;
      if (!actionProposal) {
        console.warn('[AICoach] handleConfirmInline: no actionProposal found for messageId:', messageId);
        return;
      }

      const action_id = actionProposal.action_id;
      const confirmation_token = actionProposal.confirmation_token;
      const proposal = actionProposal.proposal;

      const actionType = actionProposal.action_type || proposal.action_type || '';
      console.log('[AICoach] Confirming inline action:', action_id, 'type:', actionType);

      // Mark as confirming while async work runs
      setMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, actionStatus: 'confirming' as const } : m)
      );

      // ── create_meal_plan ──────────────────────────────────────────────────
      if (
        actionType === 'create_meal_plan' &&
        (
          (proposal.items && proposal.items.length > 0) ||
          (proposal.days && proposal.days.length > 0)
        )
      ) {
        const planName = proposal.plan_name || 'AI Meal Plan';
        const startDate = proposal.start_date || '';
        const endDate = proposal.end_date || '';

        console.log('[AICoach] create_meal_plan confirmed, plan_name:', planName, 'items format:', !!(proposal.items && proposal.items.length > 0));
        setCreatingPlan(true);

        try {
          console.log('[AICoach] Calling createMealPlan:', planName, startDate, endDate);
          const plan = await createMealPlan({ name: planName, start_date: startDate, end_date: endDate });
          console.log('[AICoach] Meal plan created, id:', plan.id);

          let flatItems: any[] = [];

          if (proposal.items && proposal.items.length > 0) {
            // New enriched format — items is already a flat array
            flatItems = proposal.items;
          } else if (proposal.days && proposal.days.length > 0) {
            // Old format — flatten days[].meals[]
            flatItems = proposal.days.flatMap((day: any) =>
              day.meals.map((meal: any) => ({
                date: day.date,
                meal_type: meal.meal_type,
                food_name: meal.food_name,
                calories: meal.calories,
                protein: meal.protein,
                carbs: meal.carbs,
                fats: meal.fats,
                fiber: meal.fiber,
                grams: meal.grams,
                quantity: meal.quantity,
                serving_unit: meal.serving_unit,
                dish_description: meal.dish_description,
              }))
            );
          }

          const totalMeals = flatItems.length;
          console.log('[AICoach] Adding', totalMeals, 'meal items in parallel');

          await Promise.all(
            flatItems.map((item: any) =>
              addMealPlanItem(plan.id, {
                date: item.date,
                meal_type: item.meal_type,
                food_name: item.food_name,
                brand: item.brand || undefined,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fats: item.fats,
                fiber: item.fiber,
                grams: item.grams,
                quantity: item.quantity || 1,
                serving_unit: item.serving_unit,
                serving_description: item.serving_description,
                food_item_id: item.food_item_id || undefined,
                dish_description: item.dish_description,
              })
            )
          );

          console.log('[AICoach] All meal items added successfully');

          const uniqueDays = new Set(flatItems.map((i: any) => i.date)).size;
          const successMsg: MessageWithId = {
            id: genId(),
            role: 'assistant',
            content: `✅ Your meal plan "${plan.name}" has been created! It covers ${uniqueDays} day${uniqueDays !== 1 ? 's' : ''} with ${totalMeals} meal${totalMeals !== 1 ? 's' : ''}. Opening it now...`,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, successMsg]);

          console.log('[AICoach] Navigating to meal-plan-detail, id:', plan.id);
          router.push(`/meal-plan-detail?planId=${plan.id}`);
          setMessages((prev) =>
            prev.map((m) => m.id === messageId ? { ...m, actionStatus: 'confirmed' as const } : m)
          );
        } catch (e: any) {
          console.error('[AICoach] Error creating meal plan:', e?.message);
          Alert.alert('Error', 'Could not create meal plan. Please try again.');
          setMessages((prev) =>
            prev.map((m) => m.id === messageId ? { ...m, actionStatus: 'pending' as const } : m)
          );
        } finally {
          if (isMountedRef.current) setCreatingPlan(false);
        }
        return;
      }

      // ── add_food_to_diary ─────────────────────────────────────────────────
      if (actionType === 'add_food_to_diary') {
        console.log('[AICoach] add_food_to_diary confirmed, food_name:', proposal.food_name);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.warn('[AICoach] No user for add_food_to_diary');
          return;
        }

        const date = (proposal.date as string | undefined) || new Date().toISOString().split('T')[0];
        const mealType = (proposal.meal_type as string | undefined) || 'snack';

        console.log('[AICoach] Upserting meal row, date:', date, 'meal_type:', mealType);

        let mealId: string | null = null;
        const { data: upsertData } = await supabase
          .from('meals')
          .upsert(
            { user_id: user.id, date, meal_type: mealType },
            { onConflict: 'user_id,date,meal_type' }
          )
          .select('id')
          .maybeSingle();

        if (upsertData) {
          mealId = upsertData.id;
        } else {
          const { data: existing } = await supabase
            .from('meals')
            .select('id')
            .eq('user_id', user.id)
            .eq('date', date)
            .eq('meal_type', mealType)
            .maybeSingle();
          mealId = existing?.id ?? null;
        }

        if (!mealId) {
          console.error('[AICoach] Could not get meal_id for add_food_to_diary');
          Alert.alert('Error', 'Could not add food to diary.');
          return;
        }

        console.log('[AICoach] Inserting meal_item, meal_id:', mealId, 'food:', proposal.food_name);
        const { error: insertError } = await supabase.from('meal_items').insert({
          meal_id: mealId,
          food_name: proposal.food_name,
          quantity: (proposal.quantity as number | undefined) ?? 1,
          grams: (proposal.grams as number | undefined) ?? null,
          serving_unit: (proposal.serving_unit as string | undefined) ?? null,
          calories: (proposal.calories as number | undefined) ?? 0,
          protein: (proposal.protein as number | undefined) ?? 0,
          carbs: (proposal.carbs as number | undefined) ?? 0,
          fats: (proposal.fats as number | undefined) ?? 0,
          fiber: (proposal.fiber as number | undefined) ?? 0,
        });

        if (insertError) {
          console.error('[AICoach] Error inserting meal_item:', insertError.message);
          Alert.alert('Error', 'Could not add food to diary.');
          return;
        }

        const foodName = String(proposal.food_name ?? 'food');
        const calories = Number(proposal.calories ?? 0);
        const successContent = `✅ Added **${foodName}** (${calories} cal) to your ${mealType} on ${date}.`;
        console.log('[AICoach] Food added to diary successfully:', foodName);
        setMessages((prev) => [
          ...prev,
          { id: genId(), role: 'assistant', content: successContent, timestamp: Date.now() },
        ]);
        return;
      }

      // ── update_goal ───────────────────────────────────────────────────────
      if (actionType === 'update_goal') {
        console.log('[AICoach] update_goal confirmed, proposed_value:', proposal.proposed_value);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.warn('[AICoach] No user for update_goal');
          setMessages((prev) =>
            prev.map((m) => m.id === messageId ? { ...m, actionStatus: 'pending' as const } : m)
          );
          return;
        }

        // Fetch current active goal to preserve all existing fields
        const { data: currentGoal } = await supabase
          .from('goals')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();

        console.log('[AICoach] Current active goal:', currentGoal);

        // Deactivate current goal
        await supabase
          .from('goals')
          .update({ is_active: false })
          .eq('user_id', user.id)
          .eq('is_active', true);

        const newCalories = Number(proposal.proposed_value ?? proposal.current_value ?? currentGoal?.daily_calories ?? 0);

        const newGoalData: Record<string, unknown> = {
          user_id: user.id,
          // Preserve existing fields
          goal_type: currentGoal?.goal_type ?? 'maintain',
          macro_preset: currentGoal?.macro_preset ?? null,
          start_date: currentGoal?.start_date ?? null,
          loss_rate_lbs_per_week: currentGoal?.loss_rate_lbs_per_week ?? null,
          goal_intensity: currentGoal?.goal_intensity ?? 1,
          // Apply new values (AI proposal overrides existing)
          daily_calories: newCalories,
          protein_g: (proposal.protein_g as number | undefined) ?? currentGoal?.protein_g ?? null,
          carbs_g: (proposal.carbs_g as number | undefined) ?? currentGoal?.carbs_g ?? null,
          fats_g: (proposal.fats_g as number | undefined) ?? currentGoal?.fats_g ?? null,
          fiber_g: (proposal.fiber_g as number | undefined) ?? currentGoal?.fiber_g ?? null,
          is_active: true,
        };

        console.log('[AICoach] Inserting new goal:', newGoalData);
        const { error: goalError } = await supabase.from('goals').insert(newGoalData);

        if (goalError) {
          console.error('[AICoach] Error inserting new goal:', goalError.message);
          Alert.alert('Error', 'Could not update your goals.');
          setMessages((prev) =>
            prev.map((m) => m.id === messageId ? { ...m, actionStatus: 'pending' as const } : m)
          );
          return;
        }

        const successContent = `✅ Your daily calorie goal has been updated to **${newCalories} kcal**.`;
        console.log('[AICoach] Goal updated successfully, new daily_calories:', newCalories);
        setMessages((prev) => [
          ...prev,
          { id: genId(), role: 'assistant', content: successContent, timestamp: Date.now() },
        ]);
        setMessages((prev) =>
          prev.map((m) => m.id === messageId ? { ...m, actionStatus: 'confirmed' as const } : m)
        );
        return;
      }

      // ── Default: unrecognized action_type — mark confirmed silently ──────────
      return;
    },
    [messages, router, setMessages]
  );

  // Keep ref in sync so handleSend can call handleConfirmInline without a circular dep
  useEffect(() => {
    handleConfirmInlineRef.current = handleConfirmInline;
  }, [handleConfirmInline]);

  const handleDeclineInline = useCallback(
    (messageId: string) => {
      console.log('[AICoach] handleDeclineInline called, messageId:', messageId);
      setMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, actionStatus: 'declined' as const } : m)
      );
      const followUp: MessageWithId = {
        id: genId(),
        role: 'assistant',
        content: "No problem! Let me know if you'd like to make any other changes.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, followUp]);
    },
    [setMessages]
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

  // Determine if we're in the "welcome" state (only the welcome message, no user messages)
  const hasUserMessages = messages.some((m) => m.role === 'user');
  // Filter out the hidden __FIRST_INTERACTION__ trigger from display
  const visibleMessages = messages.filter((m) => !(m.role === 'user' && m.content === '__FIRST_INTERACTION__'));
  const isOnlyWelcome = !hasUserMessages && messages.length <= 1;
  const effectivelyGated = isGated && !isPremium;
  const showCravingChips = !isOnlyWelcome && inputText.length === 0 && !loading && !effectivelyGated && isPremium;
  const canSend = inputText.trim().length > 0 && !loading && !premiumLoading && !effectivelyGated;
  // After first message arrives, show quick actions (new user gets simplified set)
  const quickActionsToShow = isNewUser ? NEW_USER_QUICK_ACTIONS : QUICK_ACTION_CARDS;

  // Find the last streaming message (for cursor)
  const lastStreamingMsgId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].isStreaming) return messages[i].id;
    }
    return null;
  })();

  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const baseAssistantTextStyle = { ...(typography.body as object), lineHeight: 22, color: isDark ? colors.textDark : colors.text };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
        <View style={styles.headerCenter}>
          <Image
            source={require('@/assets/images/ff4ef6e4-805c-4f79-a014-9784ebe735d9.jpeg')}
            style={styles.headerCoachImage}
            resizeMode="cover"
          />
          <View>
            <Text style={[styles.headerTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Coach
            </Text>
            <Text style={[styles.headerSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Body Transformation Coach
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => {
              console.log('[AICoach] Memory button pressed');
              router.push('/coach-memory');
            }}
            style={styles.headerIconBtn}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <IconSymbol
              ios_icon_name="brain"
              android_material_icon_name="psychology"
              size={20}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              console.log('[AICoach] Conversation history button pressed');
              loadHistory();
              setShowHistory(true);
            }}
            style={styles.headerIconBtn}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <IconSymbol
              ios_icon_name="clock.rotate.left"
              android_material_icon_name="manage_history"
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
          {/* ── Proactive insight card — welcome state only ── */}
          {isOnlyWelcome && isFirstEverSession && firstMessageReceived && !loading && proactiveInsight && (
            <View style={[styles.insightCard, { backgroundColor: isDark ? '#1E2035' : '#EEF2FF', borderColor: isDark ? '#3B4080' : '#C7D2FE' }]}>
              <View style={styles.insightCardRow}>
                <Text style={styles.insightCardEmoji}>
                  {'💡'}
                </Text>
                <Text style={[styles.insightCardText, { color: isDark ? colors.textDark : colors.text }]}>
                  {proactiveInsight.text}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.insightCardCta, { backgroundColor: colors.primary }]}
                onPress={() => {
                  console.log('[AICoach] Proactive insight CTA pressed:', proactiveInsight.cta);
                  handleSend(proactiveInsight.ctaMessage);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.insightCardCtaText}>
                  {proactiveInsight.cta}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── MGCS: Follow-up card — welcome state only ── */}
          {isOnlyWelcome && isFirstEverSession && firstMessageReceived && !loading && pendingFollowUp && (
            <View style={[styles.followUpCard, { backgroundColor: isDark ? colors.cardDark : '#FFFBEB', borderColor: isDark ? '#92400E' : '#FCD34D' }]}>
              <View style={styles.followUpCardHeader}>
                <View style={styles.followUpBadge}>
                  <Text style={styles.followUpBadgeText}>
                    {'Follow-up'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={async () => {
                    console.log('[AICoach] Follow-up card dismissed, id:', pendingFollowUp.id);
                    setPendingFollowUp(null);
                    try {
                      await supabase
                        .from('coach_followups')
                        .update({ status: 'dismissed' })
                        .eq('id', pendingFollowUp.id);
                      console.log('[AICoach] Follow-up marked as dismissed in DB');
                    } catch (e: any) {
                      console.warn('[AICoach] Error dismissing follow-up:', e?.message);
                    }
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol
                    ios_icon_name="xmark"
                    android_material_icon_name="close"
                    size={14}
                    color={isDark ? colors.textSecondaryDark : '#92400E'}
                  />
                </TouchableOpacity>
              </View>
              <Text style={[styles.followUpTitle, { color: isDark ? colors.textDark : colors.text }]}>
                {pendingFollowUp.title}
              </Text>
              <TouchableOpacity
                style={[styles.followUpCheckInBtn, { backgroundColor: '#F59E0B' }]}
                onPress={() => {
                  console.log('[AICoach] Follow-up check-in button pressed, title:', pendingFollowUp.title);
                  setPendingFollowUp(null);
                  handleSend(pendingFollowUp.title);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.followUpCheckInText}>
                  {'Check in'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Quick Action Cards — welcome state only ── */}
          {isOnlyWelcome && isFirstEverSession && firstMessageReceived && !loading && (
            <View style={styles.quickActionsSection}>
              <Text style={[styles.quickActionsLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                What would you like to do?
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickActionsRow}
              >
                {quickActionsToShow.map((card) => (
                  <QuickActionCard
                    key={card.title}
                    iosIcon={card.iosIcon}
                    androidIcon={card.androidIcon}
                    title={card.title}
                    subtitle={card.subtitle}
                    isDark={isDark}
                    onPress={() => handleQuickAction(card)}
                    disabled={premiumLoading}
                  />
                ))}
              </ScrollView>
            </View>
          )}



          {/* ── Phase 8 Status Card — welcome state only ── */}
          {isOnlyWelcome && isFirstEverSession && firstMessageReceived && !loading && latestRecommendation && (
            <View style={styles.statusCardSection}>
              <Text style={[styles.quickActionsLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Current Status
              </Text>
              <StatusCard
                recommendation={latestRecommendation}
                isDark={isDark}
                onPress={() => {
                  console.log('[AICoach] Status card tapped, sending status assessment request');
                  handleSend('Give me my current status assessment');
                }}
              />
            </View>
          )}

          {visibleMessages.map((message) => {
            const isUser = message.role === 'user';
            const timeText = formatTime(message.timestamp);
            const isThisStreaming = message.isStreaming === true && message.id === lastStreamingMsgId;

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

            const isGateTyping = message.isTyping === true;
            const structuredNodes = isGateTyping ? null : renderStructuredText(message.content, baseAssistantTextStyle, secondaryColor, isDark);
            const isWaitingForFirstToken = (isThisStreaming && message.content === '') || isGateTyping;

            return (
              <View key={message.id} style={styles.assistantMessageWrapper}>
                <Image
                  source={require('@/assets/images/ff4ef6e4-805c-4f79-a014-9784ebe735d9.jpeg')}
                  style={styles.coachAvatarImage}
                  resizeMode="cover"
                />
                <View style={styles.assistantBubbleColumn}>
                  <Text style={[styles.coachLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    Coach
                  </Text>
                  {isWaitingForFirstToken ? (
                    <TypingIndicator isDark={isDark} />
                  ) : (
                  <View style={[styles.assistantBubble, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
                    <View>
                      {structuredNodes}
                      {isThisStreaming && (
                        <StreamingCursor isDark={isDark} />
                      )}
                    </View>
                    {message.showUpgradeButton && (
                      <View style={{ marginTop: 16 }}>
                        <View style={{
                          backgroundColor: isDark ? '#1C1C1E' : '#F9F5FF',
                          borderRadius: 12,
                          padding: 16,
                          marginBottom: 10,
                          borderWidth: 1,
                          borderColor: isDark ? '#3A2E5A' : '#E5D9FF',
                        }}>
                          <Text style={{ color: isDark ? '#E2D9F3' : '#4B2D8A', fontWeight: '700', fontSize: 15, marginBottom: 4 }}>
                            Your coach has your answer.
                          </Text>
                          <Text style={{ color: isDark ? '#A89BC2' : '#6B5B95', fontSize: 13, lineHeight: 19 }}>
                            Every response is built around your specific goal — not generic advice.
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => {
                            console.log('[AICoach] See What My Coach Found button pressed');
                            router.push('/subscription');
                          }}
                          style={{
                            backgroundColor: '#7C3AED',
                            borderRadius: 12,
                            paddingVertical: 14,
                            paddingHorizontal: 20,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                            See What My Coach Found →
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {message.actionProposal && message.actionStatus ? (
                      <InlineActionCard
                        messageId={message.id}
                        action={message.actionProposal}
                        actionStatus={message.actionStatus}
                        isDark={isDark}
                        onConfirm={handleConfirmInline}
                        onDecline={handleDeclineInline}
                      />
                    ) : null}
                    {!isThisStreaming && timeText ? (
                      <Text style={[styles.assistantBubbleTime, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {timeText}
                      </Text>
                    ) : null}
                  </View>
                  )}
                </View>
              </View>
            );
          })}

          {/* ── Craving chips hub — welcome state only, premium only ── */}
          {isOnlyWelcome && isFirstEverSession && firstMessageReceived && !loading && !isNewUser && (
            <View style={styles.cravingHubSection}>
              <Text style={[styles.quickActionsLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Quick questions
              </Text>
              <View style={styles.cravingHubRow}>
                {CRAVING_CHIPS.map((chip) => (
                  <TouchableOpacity
                    key={chip.label}
                    style={[styles.cravingHubChip, { backgroundColor: isDark ? colors.cardDark : '#FFFFFF', borderColor: isDark ? colors.borderDark : colors.border }]}
                    onPress={() => handleCravingChip(chip)}
                    disabled={premiumLoading}
                    activeOpacity={0.75}
                  >
                    <IconSymbol ios_icon_name={chip.iosIcon} android_material_icon_name={chip.androidIcon} size={15} color={colors.primary} />
                    <Text style={[styles.cravingHubChipText, { color: isDark ? colors.textDark : colors.text }]}>{chip.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!isNewUser && (
                <View style={styles.suggestedInlineRow}>
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <TouchableOpacity
                      key={prompt}
                      style={[styles.suggestedInlineChip, { backgroundColor: isDark ? colors.cardDark : '#FFFFFF', borderColor: isDark ? colors.borderDark : colors.border }]}
                      onPress={() => {
                        console.log('[AICoach] Suggested prompt chip pressed:', prompt);
                        handleSuggestedPrompt(prompt);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.suggestedInlineChipText, { color: isDark ? colors.textDark : colors.text }]}>{prompt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

        </ScrollView>

        {/* ── Craving chips — rendered inside ScrollView after welcome message ── */}

        {/* ── Gated hint above input bar ── */}
        {isGated && !isPremium && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' }}>
            <Text style={{ color: isDark ? colors.textSecondaryDark : colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
              Unlock Premium to continue the conversation
            </Text>
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
            placeholder={premiumLoading ? "Loading..." : "Ask your coach anything..."}
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            value={inputText}
            onChangeText={(t) => {
              setInputText(t);
            }}
            multiline
            maxLength={1000}
            editable={!loading && !premiumLoading && !effectivelyGated}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: canSend ? colors.primary : colors.border }]}
            onPress={handleSendPress}
            disabled={!canSend || effectivelyGated}
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

      {/* ── Conversation History Modal ── */}
      <Modal
        visible={showHistory}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          console.log('[AICoach] History modal closed via back button');
          setShowHistory(false);
        }}
      >
        <SafeAreaView style={[styles.historyModal, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
          {/* Header */}
          <View style={[styles.historyHeader, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
            <Text style={[styles.historyTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Conversation History
            </Text>
            <TouchableOpacity
              onPress={() => {
                console.log('[AICoach] History modal close button pressed');
                setShowHistory(false);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={20}
                color={isDark ? colors.textSecondaryDark : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* List */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }}>
            {loadingHistory ? (
              <Text style={{ color: isDark ? colors.textSecondaryDark : colors.textSecondary, textAlign: 'center', marginTop: 40 }}>
                Loading...
              </Text>
            ) : historyConversations.length === 0 ? (
              <Text style={{ color: isDark ? colors.textSecondaryDark : colors.textSecondary, textAlign: 'center', marginTop: 40 }}>
                No conversations yet
              </Text>
            ) : (
              historyConversations.map((conv) => {
                const convDateLabel = formatConvDate(conv.last_message_at || conv.created_at);
                const convPreview = conv.preview || 'No messages';
                return (
                  <TouchableOpacity
                    key={conv.id}
                    style={[styles.historyItem, { backgroundColor: isDark ? colors.cardDark : '#FFFFFF', borderColor: isDark ? colors.borderDark : colors.border }]}
                    onPress={() => {
                      console.log('[AICoach] History conversation item pressed, id:', conv.id, 'date:', convDateLabel);
                      loadConversation(conv.id);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.historyItemDate, { color: colors.primary }]}>
                      {convDateLabel}
                    </Text>
                    <Text style={[styles.historyItemPreview, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]} numberOfLines={2}>
                      {convPreview}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}

            {/* View action history link */}
            <TouchableOpacity
              style={styles.historyActionLink}
              onPress={() => {
                console.log('[AICoach] View action history link pressed from history modal');
                setShowHistory(false);
                router.push('/coach-action-history');
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.historyActionLinkText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                View action history →
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* New conversation button */}
          <View style={{ padding: spacing.md }}>
            <TouchableOpacity
              style={[styles.newConvBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                console.log('[AICoach] New conversation button pressed');
                setMessages([]);
                setShowHistory(false);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.newConvBtnText}>
                + New Conversation
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

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
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    justifyContent: 'flex-start',
  },
  headerCoachImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  coachAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginTop: 18,
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 17,
    fontWeight: '700',
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
  quickCardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
  // ── Streaming cursor ─────────────────────────────────────────────────────
  streamingCursor: {
    fontSize: 16,
    fontWeight: '300',
    lineHeight: 22,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  cravingChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  // ── Craving hub (welcome state) ──────────────────────────────────────────
  cravingHubSection: {
    marginBottom: spacing.lg,
  },
  cravingHubRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cravingHubChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  cravingHubChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  suggestedInlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  suggestedInlineChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  suggestedInlineChipText: {
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
  // ── Inline Action Card ───────────────────────────────────────────────────
  inlineActionCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginTop: 10,
    marginHorizontal: 0,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  inlineActionBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  inlineActionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  inlineActionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  inlineActionPlanName: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  inlineActionStatsRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginBottom: 12,
  },
  inlineActionStatBox: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  inlineActionStatNumber: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  inlineActionStatLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  inlineActionChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  inlineActionValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  inlineActionArrow: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  inlineActionReason: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
    textAlign: 'center',
  },
  inlineActionButtons: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 4,
  },
  inlineActionConfirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineActionConfirmText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  inlineActionDeclineBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
  inlineActionDeclineText: {
    fontSize: 14,
    fontWeight: '600',
  },
  inlineActionStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
  },
  inlineActionStatusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  // ── Meal plan preview (in ActionConfirmSheet) ───────────────────────────────
  mealPlanPreviewCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    gap: 6,
  },
  mealPlanPreviewTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  mealPlanPreviewDateRange: {
    fontSize: 13,
    marginBottom: 4,
  },
  mealPlanPreviewSummaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  mealPlanPreviewSummary: {
    fontSize: 14,
    fontWeight: '700',
  },
  mealPlanPreviewSummaryLabel: {
    fontSize: 13,
  },
  mealPlanPreviewSummaryDot: {
    fontSize: 13,
  },
  mealPlanDayScroll: {
    maxHeight: 300,
  },
  mealPlanDayBlock: {
    marginBottom: 10,
  },
  mealPlanDayHeader: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  mealPlanMealRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    paddingLeft: 4,
    marginBottom: 1,
  },
  mealPlanMealDot: {
    fontSize: 12,
  },
  mealPlanMealType: {
    fontSize: 12,
    fontWeight: '600',
  },
  mealPlanMealName: {
    fontSize: 12,
    flex: 1,
    flexShrink: 1,
  },
  mealPlanMealCal: {
    fontSize: 12,
  },
  // ── Status card ──────────────────────────────────────────────────────────────
  statusCardSection: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  statusCard: {
    borderRadius: 12,
    padding: 14,
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    gap: 8,
  },
  statusCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusCardIcon: {
    fontSize: 22,
  },
  statusCardTitleCol: {
    flex: 1,
    gap: 2,
  },
  statusCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusCardTime: {
    fontSize: 12,
  },
  evidenceBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  evidenceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusCardHint: {
    fontSize: 12,
    fontWeight: '500',
  },
  // ── add_food_to_diary card ────────────────────────────────────────────────
  inlineAddFoodTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  inlineAddFoodName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  inlineAddFoodMacros: {
    fontSize: 12,
    marginBottom: 12,
  },
  // ── Proactive insight card ────────────────────────────────────────────────
  insightCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  insightCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  insightCardEmoji: {
    fontSize: 18,
    lineHeight: 24,
  },
  insightCardText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  insightCardCta: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  insightCardCtaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  // ── Follow-up card ────────────────────────────────────────────────────────
  followUpCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  followUpCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  followUpBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  followUpBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  followUpTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginBottom: 12,
  },
  followUpCheckInBtn: {
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  followUpCheckInText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  // ── History modal ─────────────────────────────────────────────────────────
  historyModal: {
    flex: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  historyTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  historyItem: {
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  historyItemDate: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  historyItemPreview: {
    fontSize: 13,
    lineHeight: 18,
  },
  historyActionLink: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  historyActionLinkText: {
    fontSize: 13,
    fontWeight: '500',
  },
  newConvBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  newConvBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});


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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { useAICoach, CoachMessage } from '@/hooks/useAICoach';

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
  'Am I on track this week?',
  'Why am I not losing weight?',
  'What should I focus on today?',
  'Analyze my last 7 days',
];

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

  const { sendMessage, loading } = useAICoach();

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

  const handleSendPress = useCallback(() => {
    console.log('[AICoach] Send button pressed');
    handleSend(inputText);
  }, [handleSend, inputText]);

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

  const canSend = inputText.trim().length > 0 && !loading;

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

        <View style={{ width: 40 }} />
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
                    <Text style={[styles.assistantBubbleText, { color: isDark ? colors.textDark : colors.text }]}>
                      {message.content}
                    </Text>
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
            onChangeText={setInputText}
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
  assistantBubbleText: {
    ...typography.body,
    lineHeight: 22,
  },
  assistantBubbleTime: {
    fontSize: 11,
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
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
});

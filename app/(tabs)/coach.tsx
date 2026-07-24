
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
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageRole = 'user' | 'assistant';

type ActionData = {
  type: string;
  summary: string;
};

type CoachMessage = {
  id: string;
  role: MessageRole;
  content: string;
  action?: ActionData;
  created_at?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

let msgCounter = 0;
function genId(): string {
  msgCounter += 1;
  return `coach-${Date.now()}-${msgCounter}`;
}

const SUGGESTED_PROMPTS = [
  "Why am I not losing weight?",
  "Analyze my nutrition this week",
  "How can I improve my macros?",
  "What should I eat today?",
];

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
    a1.start();
    a2.start();
    a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  const dotStyle = {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: isDark ? colors.textSecondaryDark : colors.textSecondary,
    marginHorizontal: 3,
  };

  return (
    <View style={[
      typingStyles.bubble,
      { backgroundColor: isDark ? colors.cardDark : colors.card },
    ]}>
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

// ─── Action Card ──────────────────────────────────────────────────────────────

function ActionCard({ summary }: { summary: string }) {
  return (
    <View style={actionStyles.card}>
      <Text style={actionStyles.text}>
        {'✅ '}
        {summary}
      </Text>
    </View>
  );
}

const actionStyles = StyleSheet.create({
  card: {
    backgroundColor: '#E8F5E9',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    maxWidth: '80%',
  },
  text: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '500' as const,
    lineHeight: 18,
  },
});

// ─── Locked State ─────────────────────────────────────────────────────────────

function LockedState({ isDark, onGoToPremium }: { isDark: boolean; onGoToPremium: () => void }) {
  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  return (
    <View style={[lockedStyles.container, { backgroundColor: bgColor }]}>
      <View style={[lockedStyles.card, { backgroundColor: cardBg }]}>
        <View style={lockedStyles.iconRow}>
          <Text style={lockedStyles.lockEmoji}>🔒</Text>
        </View>
        <Text style={[lockedStyles.title, { color: textColor }]}>AI Coach</Text>
        <Text style={[lockedStyles.subtitle, { color: subColor }]}>
          Get personalized coaching powered by GPT-4o. Your coach analyzes your nutrition, weight trends, and activity to give you real insights.
        </Text>
        <TouchableOpacity
          style={lockedStyles.button}
          onPress={() => {
            console.log('[Coach] Go Premium button pressed');
            onGoToPremium();
          }}
          activeOpacity={0.85}
        >
          <Text style={lockedStyles.buttonText}>Go Premium</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const lockedStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  iconRow: {
    marginBottom: spacing.md,
  },
  lockEmoji: {
    fontSize: 48,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700' as const,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CoachScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const scrollViewRef = useRef<ScrollView>(null);
  const isMountedRef = useRef(true);

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isPremium, setIsPremium] = useState<boolean | null>(null); // null = loading

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    console.log('[Coach] Screen mounted — loading session');
    loadSession();
    return () => { isMountedRef.current = false; };
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (isMountedRef.current && scrollViewRef.current) {
        try { scrollViewRef.current.scrollToEnd({ animated: true }); } catch (_) {}
      }
    }, 120);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, isTyping, scrollToBottom]);

  // ── Load session (premium check + history) ─────────────────────────────────

  const loadSession = async () => {
    console.log('[Coach] loadSession: fetching user');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[Coach] loadSession: no user found, treating as non-premium');
        if (isMountedRef.current) setIsPremium(false);
        return;
      }

      console.log('[Coach] loadSession: user id =', user.id);

      // Premium check + history in parallel
      const [subResult, historyResult] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('status')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle(),
        supabase
          .from('coach_conversations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(20),
      ]);

      if (!isMountedRef.current) return;

      const premium = !!subResult.data;
      console.log('[Coach] loadSession: isPremium =', premium);
      setIsPremium(premium);

      if (premium && historyResult.data && historyResult.data.length > 0) {
        console.log('[Coach] loadSession: loaded', historyResult.data.length, 'history messages');
        const loaded: CoachMessage[] = historyResult.data.map((row: any) => ({
          id: row.id ?? genId(),
          role: row.role as MessageRole,
          content: row.content,
          action: row.action_type
            ? { type: row.action_type, summary: row.action_summary ?? '' }
            : undefined,
          created_at: row.created_at,
        }));
        setMessages(loaded);
      }
    } catch (err) {
      console.error('[Coach] loadSession error:', err);
      if (isMountedRef.current) setIsPremium(false);
    }
  };

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = useCallback(async (text?: string) => {
    const messageText = (text ?? inputText).trim();
    if (!messageText || isTyping) return;

    console.log('[Coach] handleSend: user message =', messageText);

    const userMsg: CoachMessage = {
      id: genId(),
      role: 'user',
      content: messageText,
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Build last-10 history for context
      const history = [...messages, userMsg]
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      console.log('[Coach] Invoking ai-coach edge function with', history.length, 'messages');

      const { data, error } = await supabase.functions.invoke('ai-coach', {
        body: { messages: history, user_id: user.id },
      });

      if (!isMountedRef.current) return;

      if (error) {
        console.error('[Coach] Edge function error:', error);
        throw error;
      }

      console.log('[Coach] ai-coach response received, action:', data?.action?.type ?? 'none');

      const assistantMsg: CoachMessage = {
        id: genId(),
        role: 'assistant',
        content: data?.message ?? "I'm sorry, I couldn't process that. Please try again.",
        action: data?.action ?? undefined,
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Persist both messages to DB
      console.log('[Coach] Saving conversation to coach_conversations');
      await supabase.from('coach_conversations').insert([
        { user_id: user.id, role: 'user', content: messageText },
        {
          user_id: user.id,
          role: 'assistant',
          content: assistantMsg.content,
          action_type: data?.action?.type ?? null,
          action_summary: data?.action?.summary ?? null,
        },
      ]);
    } catch (err) {
      console.error('[Coach] handleSend error:', err);
      if (!isMountedRef.current) return;
      const errMsg: CoachMessage = {
        id: genId(),
        role: 'assistant',
        content: "Sorry, something went wrong. Please try again.",
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      if (isMountedRef.current) setIsTyping(false);
    }
  }, [inputText, isTyping, messages]);

  const handleSuggestedPrompt = useCallback((prompt: string) => {
    console.log('[Coach] Suggested prompt tapped:', prompt);
    handleSend(prompt);
  }, [handleSend]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const inputBg = isDark ? colors.backgroundDark : colors.background;

  const canSend = inputText.trim().length > 0 && !isTyping;
  const sendBtnBg = canSend ? colors.primary : (isDark ? colors.borderDark : colors.border);

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isPremium === null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: subColor }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Locked state ───────────────────────────────────────────────────────────

  if (!isPremium) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerBrainEmoji}>🧠</Text>
            <Text style={[styles.headerTitle, { color: textColor }]}>AI Coach</Text>
          </View>
        </View>
        <LockedState
          isDark={isDark}
          onGoToPremium={() => router.push('/subscription')}
        />
      </SafeAreaView>
    );
  }

  // ── Chat UI ────────────────────────────────────────────────────────────────

  const showWelcome = messages.length === 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.headerTitleContainer}>
          <View style={[styles.coachAvatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.coachAvatarEmoji}>🧠</Text>
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: textColor }]}>AI Coach</Text>
            <Text style={[styles.headerSubtitle, { color: subColor }]}>Powered by GPT-4o</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Welcome card */}
          {showWelcome && (
            <View style={[styles.welcomeCard, { backgroundColor: cardBg }]}>
              <View style={[styles.welcomeAvatarLarge, { backgroundColor: colors.primary }]}>
                <Text style={styles.welcomeAvatarEmoji}>🧠</Text>
              </View>
              <Text style={[styles.welcomeTitle, { color: textColor }]}>Your AI Coach</Text>
              <Text style={[styles.welcomeBody, { color: subColor }]}>
                I have access to all your nutrition data, weight history, and activity. Ask me anything about your progress, or let me analyze your patterns and suggest improvements.
              </Text>
            </View>
          )}

          {/* Suggested prompts */}
          {showWelcome && (
            <View style={styles.suggestionsContainer}>
              <Text style={[styles.suggestionsLabel, { color: subColor }]}>Try asking:</Text>
              <View style={styles.suggestionsGrid}>
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <TouchableOpacity
                    key={prompt}
                    style={[styles.suggestionChip, { borderColor: borderColor, backgroundColor: cardBg }]}
                    onPress={() => handleSuggestedPrompt(prompt)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.suggestionChipText, { color: textColor }]}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Message bubbles */}
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const bubbleBg = isUser ? colors.primary : cardBg;
            const bubbleTextColor = isUser ? '#FFFFFF' : textColor;

            return (
              <View
                key={msg.id}
                style={[
                  styles.messageWrapper,
                  isUser ? styles.userMessageWrapper : styles.assistantMessageWrapper,
                ]}
              >
                {!isUser && (
                  <View style={[styles.avatarSmall, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarSmallEmoji}>🧠</Text>
                  </View>
                )}
                <View style={styles.bubbleColumn}>
                  <View style={[styles.messageBubble, { backgroundColor: bubbleBg }]}>
                    <Text style={[styles.messageText, { color: bubbleTextColor }]}>
                      {msg.content}
                    </Text>
                  </View>
                  {msg.action && msg.action.summary ? (
                    <ActionCard summary={msg.action.summary} />
                  ) : null}
                </View>
              </View>
            );
          })}

          {/* Typing indicator */}
          {isTyping && <TypingIndicator isDark={isDark} />}
        </ScrollView>

        {/* Input bar */}
        <View style={[styles.inputContainer, { backgroundColor: cardBg, borderTopColor: borderColor }]}>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: textColor }]}
            placeholder="Ask your coach anything..."
            placeholderTextColor={subColor}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={600}
            editable={!isTyping}
            returnKeyType="send"
            onSubmitEditing={() => {
              if (canSend) {
                console.log('[Coach] Send via keyboard return key');
                handleSend();
              }
            }}
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: sendBtnBg }]}
            onPress={() => {
              console.log('[Coach] Send button pressed');
              handleSend();
            }}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerBrainEmoji: {
    fontSize: 24,
  },
  headerTitle: {
    ...typography.h3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  coachAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachAvatarEmoji: {
    fontSize: 18,
  },
  keyboardView: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  // Welcome card
  welcomeCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  welcomeAvatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  welcomeAvatarEmoji: {
    fontSize: 32,
  },
  welcomeTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  welcomeBody: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Suggestions
  suggestionsContainer: {
    marginBottom: spacing.lg,
  },
  suggestionsLabel: {
    ...typography.caption,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  suggestionChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    width: '47%',
  },
  suggestionChipText: {
    fontSize: 13,
    fontWeight: '500' as const,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Messages
  messageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
    maxWidth: '85%',
  },
  userMessageWrapper: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  assistantMessageWrapper: {
    alignSelf: 'flex-start',
  },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
    marginBottom: 2,
    flexShrink: 0,
  },
  avatarSmallEmoji: {
    fontSize: 14,
  },
  bubbleColumn: {
    flexShrink: 1,
  },
  messageBubble: {
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  messageText: {
    ...typography.body,
    lineHeight: 21,
  },
  // Input
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

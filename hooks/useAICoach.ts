
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, SUPABASE_PROJECT_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/client';
// expo/fetch supports SSE streaming in React Native
import { fetch as expoFetch } from 'expo/fetch';

export type CoachMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

// Message type used internally in the hook (with streaming flag)
export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
};

type State =
  | { status: 'idle'; error: null }
  | { status: 'loading'; error: null }
  | { status: 'success'; error: null }
  | { status: 'error'; error: string };

export type MealPlanMeal = {
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber?: number;
  grams?: number;
  quantity?: number;
  serving_unit?: string;
  dish_description?: string;
};

export type MealPlanDay = {
  date: string;
  meals: MealPlanMeal[];
};

export type ActionProposal = {
  action_id: string;
  confirmation_token: string;
  proposal: {
    goal_type?: string;
    current_value?: number | string;
    proposed_value?: number | string;
    reason?: string;
    expected_effect?: string;
    is_reversible?: boolean;
    data_evidence?: Record<string, unknown>;
    action_type?: string;
    plan_name?: string;
    start_date?: string;
    end_date?: string;
    days?: MealPlanDay[];
    // add_food_to_diary fields
    food_name?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fats?: number;
    fiber?: number;
    grams?: number;
    quantity?: number;
    serving_unit?: string;
    meal_type?: string;
    date?: string;
    // update_goal fields
    protein_g?: number;
    carbs_g?: number;
    fats_g?: number;
    fiber_g?: number;
    [key: string]: unknown;
  };
};

type UseAICoachOptions = {
  weightUnit?: string;
};

let msgCounter = 0;
function genMsgId() {
  msgCounter += 1;
  return `coach-${Date.now()}-${msgCounter}`;
}

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I'm your AI Body Transformation Coach. I have access to your nutrition logs, weight history, and step data. Ask me anything about your progress — I'll analyze your real data to give you honest, specific feedback.",
  timestamp: Date.now(),
};

export function useAICoach(options?: UseAICoachOptions) {
  const [state, setState] = useState<State>({ status: 'idle', error: null });
  const [pendingAction, setPendingAction] = useState<ActionProposal | null>(null);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const weightUnit = options?.weightUnit ?? 'lb';
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── On mount: load or create today's conversation ──────────────────────────
  useEffect(() => {
    (async () => {
      try {
        console.log('[useAICoach] Initializing conversation history');
        const { data: { session } } = await supabase.auth.getSession();
        const jwt = session?.access_token;
        if (!jwt) {
          console.log('[useAICoach] No session, skipping conversation load');
          return;
        }

        const authHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
          'apikey': SUPABASE_ANON_KEY,
        };

        // GET list of conversations
        console.log('[useAICoach] Fetching conversation list from coach-conversations');
        const listRes = await expoFetch(
          `${SUPABASE_PROJECT_URL}/functions/v1/coach-conversations`,
          { method: 'GET', headers: authHeaders }
        );

        if (!listRes.ok) {
          const errText = await listRes.text();
          console.warn('[useAICoach] Failed to fetch conversations:', listRes.status, errText.slice(0, 200));
          return;
        }

        const conversations: { id: string; last_message_at: string; created_at: string }[] = await listRes.json();
        console.log('[useAICoach] Conversations fetched, count:', conversations.length);

        const todayStr = new Date().toISOString().split('T')[0];
        const todayConv = conversations.find((c) => {
          const d = (c.last_message_at || c.created_at || '').split('T')[0];
          return d === todayStr;
        });

        if (todayConv) {
          console.log('[useAICoach] Found today\'s conversation, id:', todayConv.id);
          if (isMountedRef.current) setConversationId(todayConv.id);

          // Load messages for this conversation
          console.log('[useAICoach] Loading messages for conversation:', todayConv.id);
          const msgsRes = await expoFetch(
            `${SUPABASE_PROJECT_URL}/functions/v1/coach-conversations/${todayConv.id}/messages`,
            { method: 'GET', headers: authHeaders }
          );

          if (msgsRes.ok) {
            const rawMsgs: { id: string; role: string; content: string; created_at: string }[] = await msgsRes.json();
            console.log('[useAICoach] History messages loaded, count:', rawMsgs.length);
            if (rawMsgs.length > 0 && isMountedRef.current) {
              const mapped: Message[] = rawMsgs.map((m) => ({
                id: m.id,
                role: m.role as 'user' | 'assistant',
                content: m.content,
                timestamp: new Date(m.created_at).getTime(),
              }));
              setMessages(mapped);
            }
          } else {
            const errText = await msgsRes.text();
            console.warn('[useAICoach] Failed to load messages:', msgsRes.status, errText.slice(0, 200));
          }
        } else {
          // Create a new conversation for today
          console.log('[useAICoach] No conversation today, creating new one');
          const createRes = await expoFetch(
            `${SUPABASE_PROJECT_URL}/functions/v1/coach-conversations`,
            { method: 'POST', headers: authHeaders, body: JSON.stringify({}) }
          );

          if (createRes.ok) {
            const created: { id: string; created_at: string } = await createRes.json();
            console.log('[useAICoach] New conversation created, id:', created.id);
            if (isMountedRef.current) setConversationId(created.id);
          } else {
            const errText = await createRes.text();
            console.warn('[useAICoach] Failed to create conversation:', createRes.status, errText.slice(0, 200));
          }
        }
      } catch (e: any) {
        console.warn('[useAICoach] Conversation init error:', e?.message);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearPendingAction = useCallback(() => {
    console.log('[useAICoach] Clearing pending action');
    setPendingAction(null);
  }, []);

  // ── SSE streaming sendMessage ──────────────────────────────────────────────
  const sendMessage = useCallback(
    async (apiMessages: CoachMessage[], userId?: string): Promise<void> => {
      if (!apiMessages || apiMessages.length === 0) {
        console.log('[useAICoach] No messages to send');
        return;
      }

      setState({ status: 'loading', error: null });

      console.log('[useAICoach] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[useAICoach] 📤 Sending SSE request to ai-coach');
      console.log('[useAICoach] Message count:', apiMessages.length);
      console.log('[useAICoach] Last user message:', apiMessages[apiMessages.length - 1]?.content?.slice(0, 80));
      console.log('[useAICoach] weight_unit:', weightUnit);
      console.log('[useAICoach] conversation_id:', conversationId);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const jwt = session?.access_token;
        const resolvedUserId = userId ?? session?.user?.id ?? null;

        const response = await expoFetch(
          `${SUPABASE_PROJECT_URL}/functions/v1/ai-coach`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${jwt ?? SUPABASE_ANON_KEY}`,
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              messages: apiMessages,
              user_id: resolvedUserId,
              weight_unit: weightUnit,
              stream: true,
              conversation_id: conversationId ?? null,
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          console.error('[useAICoach] ❌ HTTP error:', response.status, errText.slice(0, 300));

          const isSubscriptionError = response.status === 403 || errText.includes('Subscription Required');
          setState({ status: 'error', error: errText });

          if (isSubscriptionError) {
            throw Object.assign(new Error('Subscription Required'), { isSubscriptionError: true });
          }
          throw new Error(`HTTP ${response.status}: ${errText.slice(0, 100)}`);
        }

        // Add placeholder streaming message
        const placeholderMsg: Message = {
          id: genMsgId(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
        };
        console.log('[useAICoach] Adding placeholder streaming message, id:', placeholderMsg.id);
        if (isMountedRef.current) {
          setMessages((prev) => [...prev, placeholderMsg]);
        }

        // Read SSE stream
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        console.log('[useAICoach] Starting SSE stream read');

        let streamDone = false;
        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) { streamDone = true; break; }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const event = JSON.parse(jsonStr);

              if (event.delta) {
                fullText += event.delta;
                if (isMountedRef.current) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === placeholderMsg.id ? { ...m, content: fullText } : m
                    )
                  );
                }
              }

              if (event.done) {
                const finalText = event.full_text || fullText;
                console.log('[useAICoach] ✅ Stream done, full_text length:', finalText.length);
                if (isMountedRef.current) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === placeholderMsg.id
                        ? { ...m, content: finalText, isStreaming: false }
                        : m
                    )
                  );
                }
                if (event.action_proposal) {
                  console.log('[useAICoach] Action proposal received:', event.action_proposal?.action_id);
                  if (isMountedRef.current) {
                    setPendingAction(event.action_proposal as ActionProposal);
                  }
                }
              }

              // Handle legacy non-streaming error in SSE body
              if (event.error) {
                console.error('[useAICoach] ❌ Error in SSE event:', event.error);
                const isSubscriptionError = String(event.error).includes('Subscription Required');
                setState({ status: 'error', error: String(event.error) });
                if (isMountedRef.current) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === placeholderMsg.id
                        ? { ...m, content: 'Something went wrong. Please try again.', isStreaming: false }
                        : m
                    )
                  );
                }
                if (isSubscriptionError) {
                  throw Object.assign(new Error('Subscription Required'), { isSubscriptionError: true });
                }
                throw new Error(String(event.error));
              }
            } catch (parseErr: any) {
              // Only rethrow if it's our own error, not a JSON parse error
              if (parseErr?.isSubscriptionError || parseErr?.message?.startsWith('HTTP ')) {
                throw parseErr;
              }
              // Silently skip malformed SSE lines
            }
          }
        }

        console.log('[useAICoach] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        setState({ status: 'success', error: null });
      } catch (e: any) {
        console.error('[useAICoach] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('[useAICoach] ❌ CATCH BLOCK ERROR');
        console.error('[useAICoach] Error type:', e?.constructor?.name);
        console.error('[useAICoach] Error message:', e?.message);
        console.error('[useAICoach] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        if (isMountedRef.current) {
          setState({ status: 'error', error: e?.message ?? 'Unexpected error' });
        }
        throw e;
      }
    },
    [weightUnit, conversationId]
  );

  const loading = state.status === 'loading';
  const error = state.status === 'error' ? state.error : null;

  return {
    sendMessage,
    loading,
    error,
    pendingAction,
    clearPendingAction,
    setPendingAction,
    messages,
    setMessages,
    conversationId,
  };
}

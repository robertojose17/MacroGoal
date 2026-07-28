
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, SUPABASE_PROJECT_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/client';
// expo/fetch supports SSE streaming in React Native
import { fetch as expoFetch } from 'expo/fetch';

export type CoachMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

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
  action_type?: string;  // root-level action_type from edge function
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

// Message type used internally in the hook (with streaming flag)
export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  actionProposal?: ActionProposal;
  actionStatus?: 'pending' | 'confirming' | 'confirmed' | 'declined';
};

type State =
  | { status: 'idle'; error: null }
  | { status: 'loading'; error: null }
  | { status: 'success'; error: null }
  | { status: 'error'; error: string };

type UseAICoachOptions = {
  weightUnit?: string;
};

const WEB_SEARCH_KEYWORDS = [
  // Restaurants
  "restaurant", "mcdonald", "chipotle", "subway", "burger king", "starbucks",
  "taco bell", "wendy's", "wendys", "chick-fil-a", "chickfila", "domino",
  "pizza hut", "olive garden", "applebee", "menu", "order at", "eat at",
  // Stores & products
  "walmart", "target", "costco", "whole foods", "wholefood", "kroger",
  "publix", "aldi", "trader joe", "grocery", "store", "where to buy",
  "where can i buy", "where can i find", "price", "how much does",
  // Real-time / local
  "near me", "nearby", "current", "latest", "right now", "available",
  "in stock", "open now",
  // Specific food lookups
  "nutrition facts for", "calories in", "ingredients of", "macros of",
  "how many calories in",
];

function needsWebSearch(message: string): boolean {
  const lower = message.toLowerCase();
  return WEB_SEARCH_KEYWORDS.some((kw) => lower.includes(kw));
}

let msgCounter = 0;
function genMsgId() {
  msgCounter += 1;
  return `coach-${Date.now()}-${msgCounter}`;
}

export function useAICoach(options?: UseAICoachOptions) {
  const [state, setState] = useState<State>({ status: 'idle', error: null });
  const [pendingAction, setPendingAction] = useState<ActionProposal | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
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

  // ── Non-streaming sendMessage ──────────────────────────────────────────────
  const sendMessage = useCallback(
    async (apiMessages: CoachMessage[], userId?: string): Promise<void> => {
      if (!apiMessages || apiMessages.length === 0) {
        console.log('[useAICoach] No messages to send');
        return;
      }

      setState({ status: 'loading', error: null });

      const lastUserContent = apiMessages[apiMessages.length - 1]?.content ?? '';
      const useWeb = needsWebSearch(lastUserContent);

      console.log('[useAICoach] Sending request to ai-coach');
      console.log('[useAICoach] Message count:', apiMessages.length);
      console.log('[useAICoach] Last user message:', lastUserContent.slice(0, 80));
      console.log('[useAICoach] weight_unit:', weightUnit);
      console.log('[useAICoach] conversation_id:', conversationId);
      console.log('[useAICoach] use_web:', useWeb);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const jwt = session?.access_token;

        // Add placeholder while waiting
        const placeholderMsg: Message = {
          id: genMsgId(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
        };
        if (isMountedRef.current) {
          setMessages((prev) => [...prev, placeholderMsg]);
        }

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
              weight_unit: weightUnit,
              conversation_id: conversationId ?? null,
              use_web: useWeb,
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          console.error('[useAICoach] HTTP error:', response.status, errText.slice(0, 300));
          const isSubscriptionError = response.status === 403 || errText.includes('Subscription Required');
          if (isMountedRef.current) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === placeholderMsg.id
                  ? { ...m, content: isSubscriptionError ? 'Subscription required to use the AI Coach.' : 'Something went wrong. Please try again.', isStreaming: false }
                  : m
              )
            );
            setState({ status: 'error', error: errText });
          }
          if (isSubscriptionError) {
            throw Object.assign(new Error('Subscription Required'), { isSubscriptionError: true });
          }
          throw new Error(`HTTP ${response.status}: ${errText.slice(0, 100)}`);
        }

        // Read SSE stream (with JSON fallback if body is null)
        let fullText = '';
        let actionProposal: ActionProposal | null = null;

        if (response.body) {
          console.log('[useAICoach] Reading SSE stream');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          try {
            let readerDone = false;
            while (!readerDone) {
              const { done, value } = await reader.read();
              readerDone = done;
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') break;

                try {
                  const parsed = JSON.parse(data);

                  if (parsed.done === true) {
                    // Final metadata event
                    if (parsed.action_proposal) {
                      actionProposal = parsed.action_proposal as ActionProposal;
                    }
                    continue;
                  }

                  if (parsed.token) {
                    fullText += parsed.token;
                    // Update message content in real-time
                    if (isMountedRef.current) {
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === placeholderMsg.id
                            ? { ...m, content: fullText, isStreaming: true }
                            : m
                        )
                      );
                    }
                  }
                } catch {
                  // ignore parse errors on partial chunks
                }
              }
            }
          } catch (streamErr: any) {
            console.warn('[useAICoach] SSE stream read error:', streamErr?.message);
          }
        } else {
          // Fallback: backend returned plain JSON (not SSE yet)
          console.log('[useAICoach] response.body is null, falling back to response.json()');
          try {
            const data = await (response as any).json();
            fullText = data.text || '';
            if (data.action_proposal) {
              actionProposal = data.action_proposal as ActionProposal;
            }
          } catch (jsonErr: any) {
            console.warn('[useAICoach] JSON fallback parse error:', jsonErr?.message);
          }
        }

        console.log('[useAICoach] Response received, length:', fullText.length);

        // Finalize message
        if (isMountedRef.current) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderMsg.id
                ? {
                    ...m,
                    content: fullText,
                    isStreaming: false,
                    ...(actionProposal
                      ? { actionProposal, actionStatus: 'pending' as const }
                      : {}),
                  }
                : m
            )
          );
        }

        if (actionProposal) {
          console.log('[useAICoach] Action proposal received:', actionProposal?.action_id);
        }

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

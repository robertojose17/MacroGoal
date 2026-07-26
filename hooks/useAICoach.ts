
import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export type CoachMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

type CoachResult = {
  message: string;
  model: string;
  duration_ms: number;
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
    [key: string]: unknown;
  };
};

const ACTION_PROPOSAL_MARKER = 'ACTION_PROPOSAL:';

function extractActionProposal(text: string): { cleanText: string; proposal: ActionProposal | null } {
  const markerIdx = text.indexOf(ACTION_PROPOSAL_MARKER);
  if (markerIdx === -1) {
    return { cleanText: text, proposal: null };
  }

  const cleanText = text.slice(0, markerIdx).trim();
  const jsonPart = text.slice(markerIdx + ACTION_PROPOSAL_MARKER.length).trim();

  try {
    // Find the JSON object boundaries
    const start = jsonPart.indexOf('{');
    if (start === -1) return { cleanText, proposal: null };

    let depth = 0;
    let end = -1;
    for (let i = start; i < jsonPart.length; i++) {
      if (jsonPart[i] === '{') depth++;
      else if (jsonPart[i] === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }

    if (end === -1) return { cleanText, proposal: null };

    const jsonStr = jsonPart.slice(start, end + 1);
    const parsed = JSON.parse(jsonStr) as ActionProposal;
    console.log('[useAICoach] ACTION_PROPOSAL detected, action_id:', parsed.action_id);
    return { cleanText, proposal: parsed };
  } catch (e) {
    console.warn('[useAICoach] Failed to parse ACTION_PROPOSAL JSON:', e);
    return { cleanText, proposal: null };
  }
}

type UseAICoachOptions = {
  weightUnit?: string;
};

export function useAICoach(options?: UseAICoachOptions) {
  const [state, setState] = useState<State>({ status: 'idle', error: null });
  const [pendingAction, setPendingAction] = useState<ActionProposal | null>(null);
  const weightUnit = options?.weightUnit ?? 'lb';

  const clearPendingAction = useCallback(() => {
    console.log('[useAICoach] Clearing pending action');
    setPendingAction(null);
  }, []);

  const sendMessage = useCallback(async (messages: CoachMessage[]): Promise<string | null> => {
    if (!messages || messages.length === 0) {
      console.log('[useAICoach] No messages to send');
      return null;
    }

    setState({ status: 'loading', error: null });

    console.log('[useAICoach] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[useAICoach] 📤 Sending messages to ai-coach function');
    console.log('[useAICoach] Message count:', messages.length);
    console.log('[useAICoach] Last user message:', messages[messages.length - 1]?.content?.slice(0, 80));
    console.log('[useAICoach] weight_unit:', weightUnit);

    try {
      const { data, error } = await supabase.functions.invoke('ai-coach', {
        body: { messages, weight_unit: weightUnit },
      });

      console.log('[useAICoach] 📥 Response received');

      if (error) {
        console.error('[useAICoach] ❌ Edge function error:', error);
        console.error('[useAICoach] Error message:', error.message);
        console.error('[useAICoach] Error context:', error.context);

        const isSubscriptionError =
          error.message?.includes('Subscription Required') ||
          (error.context && typeof error.context === 'object' && (error.context as any).status === 403);

        setState({ status: 'error', error: error.message || 'Unknown error' });

        if (isSubscriptionError) {
          throw Object.assign(new Error('Subscription Required'), { isSubscriptionError: true });
        }
        throw new Error(error.message || 'Something went wrong');
      }

      if (data && typeof data === 'object' && 'error' in data) {
        console.error('[useAICoach] ❌ Error in response body:', data.error, data.detail);

        const isSubscriptionError = String(data.error).includes('Subscription Required');
        setState({ status: 'error', error: String(data.error) });

        if (isSubscriptionError) {
          throw Object.assign(new Error('Subscription Required'), { isSubscriptionError: true });
        }
        throw new Error(String(data.detail || data.error));
      }

      const result = data as CoachResult;
      console.log('[useAICoach] ✅ Success');
      console.log('[useAICoach] Response length:', result.message?.length || 0, 'chars');
      console.log('[useAICoach] Model:', result.model);
      console.log('[useAICoach] Duration:', result.duration_ms, 'ms');
      console.log('[useAICoach] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Check for ACTION_PROPOSAL in the response
      const { cleanText, proposal } = extractActionProposal(result.message || '');
      if (proposal) {
        console.log('[useAICoach] Setting pending action:', proposal.action_id);
        setPendingAction(proposal);
      }

      setState({ status: 'success', error: null });
      return cleanText || result.message;
    } catch (e: any) {
      console.error('[useAICoach] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[useAICoach] ❌ CATCH BLOCK ERROR');
      console.error('[useAICoach] Error type:', e?.constructor?.name);
      console.error('[useAICoach] Error message:', e?.message);
      console.error('[useAICoach] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      setState({ status: 'error', error: e?.message ?? 'Unexpected error' });
      throw e;
    }
  }, [weightUnit]);

  const confirmAction = useCallback(
    async (
      action_id: string,
      confirmation_token: string,
      sendMessageFn: (messages: CoachMessage[]) => Promise<string | null>,
      currentMessages: CoachMessage[]
    ) => {
      console.log('[useAICoach] Confirming action:', action_id, 'token:', confirmation_token);
      const confirmMsg = `Confirmed. Please execute action_id: ${action_id} with confirmation_token: ${confirmation_token}`;
      const userMsg: CoachMessage = {
        role: 'user',
        content: confirmMsg,
        timestamp: Date.now(),
      };
      clearPendingAction();
      return sendMessageFn([...currentMessages, userMsg]);
    },
    [clearPendingAction]
  );

  const loading = state.status === 'loading';
  const error = state.status === 'error' ? state.error : null;

  return { sendMessage, loading, error, pendingAction, clearPendingAction, confirmAction };
}

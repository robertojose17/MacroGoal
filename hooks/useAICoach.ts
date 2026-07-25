
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

export function useAICoach() {
  const [state, setState] = useState<State>({ status: 'idle', error: null });

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

    try {
      const { data, error } = await supabase.functions.invoke('ai-coach', {
        body: { messages },
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

      setState({ status: 'success', error: null });
      return result.message;
    } catch (e: any) {
      console.error('[useAICoach] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[useAICoach] ❌ CATCH BLOCK ERROR');
      console.error('[useAICoach] Error type:', e?.constructor?.name);
      console.error('[useAICoach] Error message:', e?.message);
      console.error('[useAICoach] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      setState({ status: 'error', error: e?.message ?? 'Unexpected error' });
      throw e;
    }
  }, []);

  const loading = state.status === 'loading';
  const error = state.status === 'error' ? state.error : null;

  return { sendMessage, loading, error };
}

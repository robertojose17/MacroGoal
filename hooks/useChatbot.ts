
import { useCallback, useState, useRef } from 'react';
import { supabase } from '@/app/integrations/supabase/client';

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
};

export type ChatbotParams = {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
};

export type ChatbotResult = {
  message: string;
  model: string;
  duration_ms: number;
};

type State =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: ChatbotResult; error: null }
  | { status: 'error'; data: null; error: string };

export function useChatbot() {
  const [state, setState] = useState<State>({ status: 'idle', data: null, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setState({ status: 'idle', data: null, error: null });
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const sendMessage = useCallback(async (params: ChatbotParams): Promise<ChatbotResult | null> => {
    if (!params.messages || params.messages.length === 0) {
      setState({ status: 'error', data: null, error: 'Messages array is required' });
      return null;
    }

    setState({ status: 'loading', data: null, error: null });
    
    try {
      const controller = new AbortController();
      abortRef.current = controller;

      console.log('[useChatbot] Sending message to chatbot function');

      const { data, error } = await supabase.functions.invoke('chatbot', {
        body: {
          messages: params.messages,
          model: params.model,
          temperature: params.temperature,
          max_tokens: params.max_tokens,
        },
      });

      if (error) {
        console.error('[useChatbot] Error:', error);
        throw new Error(error.message || 'Function error');
      }

      const result = data as ChatbotResult;
      console.log('[useChatbot] Success, received response');
      setState({ status: 'success', data: result, error: null });
      return result;
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        console.log('[useChatbot] Request aborted');
        return null;
      }
      console.error('[useChatbot] Error:', e);
      setState({ status: 'error', data: null, error: e?.message ?? 'Unknown error' });
      return null;
    } finally {
      abortRef.current = null;
    }
  }, []);

  const loading = state.status === 'loading';
  const error = state.status === 'error' ? state.error : null;
  const data = state.status === 'success' ? state.data : null;

  return { sendMessage, loading, error, data, reset, abort };
}

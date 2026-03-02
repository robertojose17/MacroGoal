
import { useCallback, useState, useRef } from 'react';
import { supabase } from '@/app/integrations/supabase/client';

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
};

export type ChatbotParams = {
  messages: ChatMessage[];
  images?: string[]; // Array of base64 data URLs
  model?: string;
  temperature?: number;
  max_tokens?: number;
};

export type ChatbotResult = {
  message: string;
  mealData?: any; // Structured meal data (if available)
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

      console.log('[useChatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[useChatbot] 📤 Sending message to chatbot function');
      console.log('[useChatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[useChatbot] Messages:', params.messages.length);
      if (params.images && params.images.length > 0) {
        console.log('[useChatbot] Images:', params.images.length);
      }

      const { data, error } = await supabase.functions.invoke('chatbot', {
        body: {
          messages: params.messages,
          images: params.images || [],
          model: params.model,
          temperature: params.temperature,
          max_tokens: params.max_tokens,
        },
      });

      console.log('[useChatbot] 📥 Response received');

      if (error) {
        console.error('[useChatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('[useChatbot] ❌ ERROR FROM EDGE FUNCTION');
        console.error('[useChatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('[useChatbot] Error object:', error);
        console.error('[useChatbot] Error message:', error.message);
        console.error('[useChatbot] Error context:', error.context);
        console.error('[useChatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Parse error message to provide user-friendly feedback
        let userMessage = error.message || 'An error occurred while processing your request';
        
        // Check for specific error types
        if (error.message?.includes('Subscription Required')) {
          userMessage = 'An active subscription is required to use the AI chatbot. Please subscribe to continue.';
        } else if (error.message?.includes('Configuration Error')) {
          userMessage = 'The chatbot service is not properly configured. Please contact support.';
        } else if (error.message?.includes('OpenRouter API Error')) {
          userMessage = 'The AI service is temporarily unavailable. Please try again in a moment.';
        } else if (error.message?.includes('Network Error')) {
          userMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message?.includes('Unauthorized')) {
          userMessage = 'Authentication error. Please log out and log back in.';
        }
        
        throw new Error(userMessage);
      }

      // Check if data contains an error (Edge Function returned error in response body)
      if (data && typeof data === 'object' && 'error' in data) {
        console.error('[useChatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('[useChatbot] ❌ ERROR IN RESPONSE DATA');
        console.error('[useChatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('[useChatbot] Error:', data.error);
        console.error('[useChatbot] Detail:', data.detail);
        console.error('[useChatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        let userMessage = data.detail || data.error || 'An error occurred';
        
        // Check for specific error types
        if (data.error?.includes('Subscription Required')) {
          userMessage = 'An active subscription is required to use the AI chatbot. Please subscribe to continue.';
        } else if (data.error?.includes('Configuration Error')) {
          userMessage = 'The chatbot service is not properly configured. Please contact support.';
        } else if (data.error?.includes('OpenRouter API Error')) {
          userMessage = 'The AI service is temporarily unavailable. Please try again in a moment.';
        }
        
        throw new Error(userMessage);
      }

      const result = data as ChatbotResult;
      console.log('[useChatbot] ✅ Success, received response');
      console.log('[useChatbot] Response length:', result.message?.length || 0, 'characters');
      console.log('[useChatbot] Has meal data:', !!result.mealData);
      console.log('[useChatbot] Duration:', result.duration_ms, 'ms');
      console.log('[useChatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      setState({ status: 'success', data: result, error: null });
      return result;
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        console.log('[useChatbot] ⚠️ Request aborted by user');
        return null;
      }
      
      console.error('[useChatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[useChatbot] ❌ CATCH BLOCK ERROR');
      console.error('[useChatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[useChatbot] Error type:', e?.constructor?.name);
      console.error('[useChatbot] Error message:', e?.message);
      console.error('[useChatbot] Error stack:', e?.stack);
      console.error('[useChatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      const errorMessage = e?.message ?? 'An unexpected error occurred. Please try again.';
      setState({ status: 'error', data: null, error: errorMessage });
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

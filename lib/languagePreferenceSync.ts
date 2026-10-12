import { supabase } from '@/lib/supabase/client';
import { createLanguagePreferenceSync, type LanguagePreferenceSyncOptions } from './languagePreferenceSyncCore';

// Call only once languageReady has resolved. Return this cleanup from the root effect.
export function startLanguagePreferenceSync(options: LanguagePreferenceSyncOptions): () => void {
  return createLanguagePreferenceSync(options, {
    getSession: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    getUserId: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user?.id ?? null;
    },
    subscribeAuth: (listener) => {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(session));
      return () => data.subscription.unsubscribe();
    },
    update: async (id, language, signal) => {
      // Narrow compatibility cast until the generated Database type includes the
      // additive preferred_language column. Runtime validation lives in the core
      // and the database CHECK; RLS and this id filter both enforce ownership.
      const { data, error } = await supabase.from('users')
        .update({ preferred_language: language } as never)
        .eq('id', id).select('id').abortSignal(signal);
      return !error && data?.length === 1 && data[0].id === id;
    },
    warn: () => console.warn('[Language] Server preference not saved; it will retry on the next language/auth event.'),
  });
}

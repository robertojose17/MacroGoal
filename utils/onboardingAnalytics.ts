import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase/client';

const SESSION_KEY = 'onboarding_session_id';

function generateSessionId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function getOrCreateSessionId(): Promise<string> {
  try {
    let id = await AsyncStorage.getItem(SESSION_KEY);
    if (!id) {
      id = generateSessionId();
      await AsyncStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return generateSessionId();
  }
}

export async function clearOnboardingSession(): Promise<void> {
  try { await AsyncStorage.removeItem(SESSION_KEY); } catch {}
}

/**
 * Fire-and-forget event tracking.
 * Records screen views, button clicks, and step completions.
 * Never throws, never blocks the UI.
 */
export function trackOnboardingEvent(
  event: string,
  step?: number,
  properties?: Record<string, unknown>
): void {
  // Run async in background — never await this
  (async () => {
    try {
      const session_id = await getOrCreateSessionId();
      const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      const user_id = user?.id ?? null;

      console.log('[Analytics] trackOnboardingEvent:', event, { step, session_id, user_id });

      const { error } = await supabase.from('onboarding_events').insert({
        session_id,
        user_id,
        event,
        step: step ?? null,
        properties: properties ?? null,
      });

      if (error) {
        console.warn('[Analytics] onboarding insert error:', error.message);
      }

      // Also upsert funnel row for step tracking
      if (event === 'onboarding_step_viewed' && step !== undefined) {
        const { data: existing } = await supabase
          .from('onboarding_funnel')
          .select('max_step_reached')
          .eq('session_id', session_id)
          .maybeSingle();

        const newMax = Math.max(existing?.max_step_reached ?? 0, step);
        await supabase.from('onboarding_funnel').upsert(
          { session_id, user_id, max_step_reached: newMax, updated_at: new Date().toISOString() },
          { onConflict: 'session_id' }
        );
      }

      if (event === 'onboarding_completed') {
        await supabase.from('onboarding_funnel').upsert(
          { session_id, user_id, completed: true, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { onConflict: 'session_id' }
        );
      }

      if (event === 'onboarding_paywall_start_trial') {
        await supabase.from('onboarding_funnel').upsert(
          { session_id, user_id, paywall_shown: true, trial_started: true, updated_at: new Date().toISOString() },
          { onConflict: 'session_id' }
        );
      }

      if (event === 'onboarding_paywall_skip') {
        await supabase.from('onboarding_funnel').upsert(
          { session_id, user_id, paywall_shown: true, trial_skipped: true, updated_at: new Date().toISOString() },
          { onConflict: 'session_id' }
        );
      }
    } catch (e) {
      console.warn('[Analytics] trackOnboardingEvent failed silently:', e);
    }
  })();
}

const FIRST_MEAL_KEY = 'first_meal_tracked';

export async function trackFirstMealIfNeeded(): Promise<void> {
  try {
    const already = await AsyncStorage.getItem(FIRST_MEAL_KEY);
    if (already) return;
    await AsyncStorage.setItem(FIRST_MEAL_KEY, 'true');
    trackOnboardingEvent('first_meal_logged');
  } catch {}
}

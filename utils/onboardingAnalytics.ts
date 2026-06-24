import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase/client';

const SESSION_KEY = 'onboarding_session_id';

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function getOrCreateSessionId(): Promise<string> {
  try {
    let sessionId = await AsyncStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = generateId();
      await AsyncStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return generateId();
  }
}

export async function clearOnboardingSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {}
}

export async function trackOnboardingEvent(
  event: string,
  step?: number,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    const session_id = await getOrCreateSessionId();
    const { data: { user } } = await supabase.auth.getUser();
    const user_id = user?.id ?? null;

    console.log('[OnboardingAnalytics] Tracking event:', event, { step, session_id, userId: user_id });

    // Fire-and-forget: insert the raw event
    supabase.from('onboarding_events').insert({
      session_id,
      user_id,
      event,
      step: step ?? null,
      properties: properties ?? null,
    }).then(({ error }) => {
      if (error) console.warn('[OnboardingAnalytics] Insert error:', error.message);
    });

    // Upsert the funnel row (fire-and-forget)
    void (async () => {
      try {
        const isStepEvent =
          event === 'onboarding_step_viewed' || event === 'onboarding_step_completed';

        if (isStepEvent && step !== undefined && step !== null) {
          // Fetch current max_step_reached so we can take the max client-side
          const { data: existing } = await supabase
            .from('onboarding_funnel')
            .select('max_step_reached')
            .eq('session_id', session_id)
            .maybeSingle();

          const currentMax = existing?.max_step_reached ?? 0;
          const newMax = Math.max(currentMax, step);

          await supabase.from('onboarding_funnel').upsert(
            {
              session_id,
              user_id,
              max_step_reached: newMax,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'session_id' }
          );
        } else if (event === 'onboarding_completed') {
          await supabase.from('onboarding_funnel').upsert(
            {
              session_id,
              user_id,
              completed: true,
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'session_id' }
          );
        } else if (event === 'onboarding_paywall_start_trial') {
          await supabase.from('onboarding_funnel').upsert(
            {
              session_id,
              user_id,
              paywall_shown: true,
              trial_started: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'session_id' }
          );
        } else if (event === 'onboarding_paywall_skip') {
          await supabase.from('onboarding_funnel').upsert(
            {
              session_id,
              user_id,
              paywall_shown: true,
              trial_skipped: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'session_id' }
          );
        }
      } catch (funnelErr) {
        console.warn('[OnboardingAnalytics] Funnel upsert error:', funnelErr);
      }
    })();
  } catch (e) {
    // Never crash the app for analytics
    console.warn('[OnboardingAnalytics] Failed to track event:', e);
  }
}

const FIRST_MEAL_KEY = 'first_meal_tracked';

export async function trackFirstMealIfNeeded(): Promise<void> {
  try {
    const already = await AsyncStorage.getItem(FIRST_MEAL_KEY);
    if (already) return;
    await AsyncStorage.setItem(FIRST_MEAL_KEY, 'true');
    console.log('[OnboardingAnalytics] Firing first_meal_logged event');
    await trackOnboardingEvent('first_meal_logged');
  } catch (e) {
    console.warn('[OnboardingAnalytics] Failed to track first meal:', e);
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase/client';

const SESSION_KEY = 'onboarding_session_id';
const PAYWALL_ACTION_KEY = 'onboarding_paywall_action_recorded';

function generateSessionId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function getOrCreateSessionId(): Promise<string> {
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
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
    await AsyncStorage.removeItem(PAYWALL_ACTION_KEY);
  } catch {}
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
          .select('max_step_reached, paywall_shown_at')
          .eq('session_id', session_id)
          .maybeSingle();

        const newMax = Math.max(existing?.max_step_reached ?? 0, step);
        const upsertData: Record<string, unknown> = {
          session_id,
          user_id,
          max_step_reached: newMax,
          updated_at: new Date().toISOString(),
        };

        // Record paywall_shown_at once when step 10 is first seen
        if (step === 10 && !existing?.paywall_shown_at) {
          upsertData.paywall_shown_at = new Date().toISOString();
          upsertData.paywall_shown = true;
        }

        await supabase.from('onboarding_funnel').upsert(upsertData, { onConflict: 'session_id' });
      }

      if (event === 'onboarding_completed') {
        await supabase.from('onboarding_funnel').upsert(
          { session_id, user_id, completed: true, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { onConflict: 'session_id' }
        );
      }
    } catch (e) {
      console.warn('[Analytics] trackOnboardingEvent failed silently:', e);
    }
  })();
}

/**
 * Records the first paywall button the user pressed (trial or skip).
 * Subsequent calls for the same session are silently ignored.
 * Uses AsyncStorage as a fast local guard before hitting Supabase.
 * Accepts an optional sessionId so the caller can pass the ID captured at mount time,
 * preventing a new ID from being generated if AsyncStorage was cleared mid-session.
 */
export async function trackPaywallActionOnce(
  action: 'trial' | 'skip',
  sessionId?: string
): Promise<void> {
  try {
    // AsyncStorage guard — fast local check
    const already = await AsyncStorage.getItem(PAYWALL_ACTION_KEY);
    if (already) {
      console.log('[Analytics] trackPaywallActionOnce: already recorded as', already, '— ignoring', action);
      return;
    }

    // Mark locally FIRST (prevents race conditions)
    await AsyncStorage.setItem(PAYWALL_ACTION_KEY, action);

    const session_id = sessionId ?? await getOrCreateSessionId();
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const user_id = user?.id ?? null;
    const now = new Date().toISOString();

    console.log('[Analytics] trackPaywallActionOnce: recording first action:', action, { session_id, user_id });

    // Insert event into onboarding_events
    await supabase.from('onboarding_events').insert({
      session_id,
      user_id,
      event: action === 'trial' ? 'onboarding_paywall_start_trial' : 'onboarding_paywall_skip',
      step: 10,
      properties: { first_action: true },
    });

    // Upsert funnel row — DB-level guard: only write first_paywall_action if not already set
    // Uses a two-step approach: check then update, so we never overwrite an existing value
    const { data: existing } = await supabase
      .from('onboarding_funnel')
      .select('first_paywall_action')
      .eq('session_id', session_id)
      .maybeSingle();

    if (existing && existing.first_paywall_action) {
      // Already recorded at DB level — do nothing
      console.log('[Analytics] trackPaywallActionOnce: DB already has first_paywall_action, skipping upsert');
      return;
    }

    await supabase.from('onboarding_funnel').upsert(
      {
        session_id,
        user_id,
        paywall_shown: true,
        first_paywall_action: action,
        paywall_action_at: now,
        updated_at: now,
      },
      { onConflict: 'session_id' }
    );
  } catch (e) {
    console.warn('[Analytics] trackPaywallActionOnce failed silently:', e);
  }
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

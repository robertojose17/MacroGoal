import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase/client';

const SESSION_KEY = 'onboarding_session_id';
const PAYWALL_ACTION_KEY = 'onboarding_paywall_action_recorded';
const FIRST_MEAL_KEY = 'first_meal_tracked';

const EDGE_FN_URL = 'https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/track-onboarding';

async function callEdgeFn(body: Record<string, unknown>): Promise<void> {
  try {
    console.log('[Analytics] callEdgeFn:', body.action, body);
    const res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[Analytics] edge fn error:', res.status, text);
    }
  } catch (e) {
    console.warn('[Analytics] edge fn fetch failed:', e);
  }
}

/**
 * Get the cached session_id from AsyncStorage.
 * Returns a temporary client-side ID if none is cached yet.
 * The server-generated ID is stored on auth_signup_completed.
 */
export async function getOrCreateSessionId(): Promise<string> {
  try {
    const cached = await AsyncStorage.getItem(SESSION_KEY);
    if (cached) return cached;
    // No session yet — generate a temporary client-side ID for pre-auth events
    // This will be replaced by the server-generated ID on auth_signup_completed
    const tempId = 'tmp_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await AsyncStorage.setItem(SESSION_KEY, tempId);
    return tempId;
  } catch {
    return 'tmp_' + Math.random().toString(36).slice(2);
  }
}

export async function clearOnboardingSession(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const onboardingKeys = allKeys.filter(k => 
      k === SESSION_KEY || 
      k.startsWith(PAYWALL_ACTION_KEY) || 
      k.startsWith(FIRST_MEAL_KEY)
    );
    if (onboardingKeys.length > 0) {
      await AsyncStorage.multiRemove(onboardingKeys);
    }
  } catch {}
}

/**
 * Fire-and-forget event tracking.
 * Sends events to the Edge Function which writes to Supabase server-side.
 * Never throws, never blocks the UI.
 */
export function trackOnboardingEvent(
  event: string,
  step?: number,
  properties?: Record<string, unknown>
): void {
  (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      const user_id = user?.id ?? null;

      // On signup_completed: request a server-generated session_id tied to this user
      if (event === 'auth_signup_completed' && user_id) {
        console.log('[Analytics] auth_signup_completed — requesting server session_id for user:', user_id);
        try {
          const res = await fetch(EDGE_FN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start_session', user_id }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.session_id) {
              await AsyncStorage.setItem(SESSION_KEY, data.session_id);
              console.log('[Analytics] server session_id stored:', data.session_id);
              // Track the signup event with the new session_id
              await callEdgeFn({
                action: 'track_event',
                session_id: data.session_id,
                user_id,
                event,
                step: step ?? null,
                properties: properties ?? null,
              });
              return;
            }
          } else {
            const text = await res.text().catch(() => '');
            console.warn('[Analytics] start_session error:', res.status, text);
          }
        } catch (e) {
          console.warn('[Analytics] start_session failed:', e);
        }
      }

      const session_id = await getOrCreateSessionId();
      console.log('[Analytics] trackOnboardingEvent:', event, { step, session_id, user_id });

      await callEdgeFn({
        action: 'track_event',
        session_id,
        user_id,
        event,
        step: step ?? null,
        properties: properties ?? null,
      });
    } catch (e) {
      console.warn('[Analytics] trackOnboardingEvent failed silently:', e);
    }
  })();
}

/**
 * Records the first paywall button the user pressed (trial or skip).
 * AsyncStorage guard prevents double-recording on the client.
 * Server has its own DB-level guard as a second layer.
 * Accepts an optional sessionId so the caller can pass the ID captured at mount time.
 */
export async function trackPaywallActionOnce(
  action: 'trial' | 'skip',
  sessionId?: string
): Promise<void> {
  try {
    const session_id = sessionId ?? await getOrCreateSessionId();
    
    // Guard is keyed to session_id — resets automatically for new sessions
    const guardKey = `${PAYWALL_ACTION_KEY}_${session_id}`;
    const already = await AsyncStorage.getItem(guardKey);
    if (already) {
      console.log('[Analytics] trackPaywallActionOnce: already recorded for session', session_id, '— ignoring', action);
      return;
    }
    await AsyncStorage.setItem(guardKey, action);

    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const user_id = user?.id ?? null;

    console.log('[Analytics] trackPaywallActionOnce: recording first action:', action, { session_id, user_id });

    const event = action === 'trial' ? 'onboarding_paywall_start_trial' : 'onboarding_paywall_skip';
    await callEdgeFn({
      action: 'track_event',
      session_id,
      user_id,
      event,
      step: 10,
      properties: { first_action: true },
    });
  } catch (e) {
    console.warn('[Analytics] trackPaywallActionOnce failed silently:', e);
  }
}

export async function trackFirstMealIfNeeded(): Promise<void> {
  try {
    const session_id = await getOrCreateSessionId();
    const guardKey = `${FIRST_MEAL_KEY}_${session_id}`;
    const already = await AsyncStorage.getItem(guardKey);
    if (already) return;
    await AsyncStorage.setItem(guardKey, 'true');
    trackOnboardingEvent('first_meal_logged');
  } catch {}
}

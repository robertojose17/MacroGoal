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

    console.log('[OnboardingAnalytics] Tracking event:', event, { step, session_id, userId: user?.id ?? null });

    await supabase.from('onboarding_events').insert({
      session_id,
      user_id: user?.id ?? null,
      event,
      step: step ?? null,
      properties: properties ?? null,
    });
  } catch (e) {
    // Never crash the app for analytics
    console.warn('[OnboardingAnalytics] Failed to track event:', e);
  }
}

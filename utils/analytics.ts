import { supabase } from '@/lib/supabase/client';

export type AnalyticsEvent =
  | 'account_created'
  | 'onboarding_completed'
  | 'paywall_viewed'
  | 'trial_clicked';

export async function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    console.log('[Analytics] Tracking event:', event, properties ?? {});
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('analytics_events').insert({
      user_id: user?.id ?? null,
      event_name: event,
      properties: properties ?? null,
    });
    if (error) {
      console.warn('[Analytics] Insert error for event', event, error);
    } else {
      console.log('[Analytics] Event tracked successfully:', event);
    }
  } catch (err) {
    console.warn('[analytics] failed to track', event, err);
  }
}

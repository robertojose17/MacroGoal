import { supabase } from '@/lib/supabase/client';

const SYNC_URL = 'https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/sync-premium-membership';

/**
 * Calls the sync-premium-membership Supabase edge function to reconcile
 * RevenueCat entitlements with the Supabase users table.
 * Returns { is_premium: boolean } or null on error. Never throws.
 */
export async function syncPremiumMembership(): Promise<{ is_premium: boolean } | null> {
  try {
    console.log('[PremiumSync] Starting premium membership sync...');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token || !session?.user?.id) {
      console.log('[PremiumSync] No active session, skipping sync');
      return null;
    }

    console.log('[PremiumSync] POSTing to sync-premium-membership for user:', session.user.id);
    const response = await fetch(SYNC_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: session.user.id }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn('[PremiumSync] sync-premium-membership returned non-OK status:', response.status, text);
      return null;
    }

    const result = await response.json();
    console.log('[PremiumSync] Sync complete, is_premium:', result?.is_premium);
    return result as { is_premium: boolean };
  } catch (e) {
    console.warn('[PremiumSync] sync-premium-membership error (non-fatal):', e);
    return null;
  }
}

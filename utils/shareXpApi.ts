/**
 * Share XP API Client
 *
 * Fetches share stats from the share-stats edge function.
 * Mirrors the pattern from leaderboardApi.ts.
 */

import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';

export interface ShareStats {
  todayCount: number;
  userClaimedToday: boolean;
}

const EMPTY: ShareStats = { todayCount: 0, userClaimedToday: false };

export async function fetchShareStats(): Promise<ShareStats> {
  console.log('[shareXpApi] fetchShareStats called');
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      console.warn('[shareXpApi] fetchShareStats: no active session, returning empty');
      return EMPTY;
    }

    const url = `${SUPABASE_PROJECT_URL}/functions/v1/share-stats`;
    console.log('[shareXpApi] Fetching:', url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    console.log('[shareXpApi] Response status:', res.status);

    if (!res.ok) {
      const errText = await res.text();
      console.warn('[shareXpApi] Error response:', res.status, errText.slice(0, 200));
      return EMPTY;
    }

    const json = await res.json();
    console.log('[shareXpApi] Received:', json);

    return {
      todayCount: Number(json.todayCount) || 0,
      userClaimedToday: Boolean(json.userClaimedToday),
    };
  } catch (err) {
    console.warn('[shareXpApi] fetchShareStats failed', err);
    return EMPTY;
  }
}

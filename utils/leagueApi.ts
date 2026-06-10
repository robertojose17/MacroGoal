/**
 * League API Client
 *
 * Thin client for the Supabase Edge Function that powers the Weekly Leagues system.
 * All calls are authenticated via the current Supabase session JWT.
 *
 * Base URL: https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/league-weekly
 *
 * Mirrors the pattern from utils/xpApi.ts.
 */

import { supabase } from '@/lib/supabase/client';
import type { LeagueStatus } from '@/types/leagues';

const FUNCTIONS_BASE_URL =
  'https://esgptfiofoaeguslgvcq.supabase.co/functions/v1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getJwt(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error('[leagueApi] getSession error:', error.message);
    throw new Error(`[leagueApi] Auth error: ${error.message}`);
  }
  if (!session?.access_token) {
    throw new Error('[leagueApi] No active session — user must be signed in to use league features');
  }
  return session.access_token;
}

async function callFunction<T>(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown
): Promise<T> {
  const jwt = await getJwt();
  const url = `${FUNCTIONS_BASE_URL}/${path}`;

  console.log(`[leagueApi] ${method} ${path}`, body ?? '');

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[leagueApi] ${path} failed (${response.status}):`, text);
    throw new Error(`[leagueApi] ${path} returned ${response.status}: ${text}`);
  }

  const data = (await response.json()) as T;
  console.log(`[leagueApi] ${path} response:`, data);
  return data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch the caller's current league state.
 * Auto-assigns the user to a league room on first call.
 */
export async function getLeagueStatus(): Promise<LeagueStatus> {
  console.log('[leagueApi] getLeagueStatus called');
  return callFunction<LeagueStatus>('league-weekly', 'GET');
}

/**
 * Record XP earned this week for the league leaderboard.
 * Prefers the Supabase RPC (one less round trip); falls back to POST if the
 * RPC is not yet deployed. Swallows all errors — never throws.
 */
export async function recordWeeklyXp(xp: number): Promise<void> {
  console.log('[leagueApi] recordWeeklyXp called with xp:', xp);
  try {
    const { error } = await supabase.rpc('record_weekly_xp', { p_xp: xp });
    if (error) {
      console.warn('[leagueApi] RPC record_weekly_xp failed, falling back to POST:', error.message);
      // Fallback: POST to edge function
      await callFunction<{ ok: boolean; week_start: string; xp_earned: number }>(
        'league-weekly',
        'POST',
        { action: 'record_xp', xp }
      );
    } else {
      console.log('[leagueApi] recordWeeklyXp RPC succeeded for xp:', xp);
    }
  } catch (err) {
    // Swallow — league XP recording must never break the primary action
    console.warn('[leagueApi] recordWeeklyXp error (non-fatal):', (err as Error)?.message ?? err);
  }
}

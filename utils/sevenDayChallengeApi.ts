/**
 * 7-Day Challenge API Client
 *
 * Thin client for the Supabase Edge Functions that power the 7-Day Challenge.
 * All calls are authenticated via the current Supabase session JWT.
 *
 * Base URL: https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/
 */

import { supabase } from '@/lib/supabase/client';
import type { SevenDayChallenge } from '@/types/challenge';

const FUNCTIONS_BASE_URL =
  'https://esgptfiofoaeguslgvcq.supabase.co/functions/v1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getJwt(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error('[sevenDayChallengeApi] getSession error:', error.message);
    throw new Error(`[sevenDayChallengeApi] Auth error: ${error.message}`);
  }
  if (!session?.access_token) {
    throw new Error(
      '[sevenDayChallengeApi] No active session — user must be signed in'
    );
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

  console.log(`[sevenDayChallengeApi] ${method} ${path}`, body ?? '');

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
    console.error(
      `[sevenDayChallengeApi] ${path} failed (${response.status}):`,
      text
    );
    throw new Error(
      `[sevenDayChallengeApi] ${path} returned ${response.status}: ${text}`
    );
  }

  const data = (await response.json()) as T;
  console.log(`[sevenDayChallengeApi] ${path} response:`, data);
  return data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Accept the 7-Day Challenge. Creates a new challenge record for the user.
 * Returns the newly created challenge.
 */
export async function acceptChallenge(): Promise<{
  success: boolean;
  challenge: SevenDayChallenge;
}> {
  console.log('[sevenDayChallengeApi] acceptChallenge called');
  return callFunction<{ success: boolean; challenge: SevenDayChallenge }>(
    'accept-seven-day-challenge',
    'POST'
  );
}

/**
 * Fetch the current challenge state for the authenticated user.
 * Returns null if the user has never accepted a challenge.
 */
export async function getChallenge(): Promise<{
  challenge: SevenDayChallenge | null;
}> {
  console.log('[sevenDayChallengeApi] getChallenge called');
  return callFunction<{ challenge: SevenDayChallenge | null }>(
    'get-seven-day-challenge',
    'GET'
  );
}

/**
 * Mark today's challenge mission as complete.
 * The server validates progress and awards XP.
 * Returns whether the full challenge is completed and if a badge was earned.
 */
export async function completeChallengeDay(): Promise<{
  success: boolean;
  challenge: SevenDayChallenge;
  xp_awarded: number;
  completed: boolean;
  badge_earned: boolean;
}> {
  console.log('[sevenDayChallengeApi] completeChallengeDay called');
  return callFunction<{
    success: boolean;
    challenge: SevenDayChallenge;
    xp_awarded: number;
    completed: boolean;
    badge_earned: boolean;
  }>('complete-challenge-day', 'POST');
}

/**
 * XP API Client
 *
 * Thin client for the Supabase Edge Functions that power the Fitness XP system.
 * All calls are authenticated via the current Supabase session JWT.
 *
 * Base URL: https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/
 *
 * IMPORTANT: Never calculate XP on the client — only display values returned
 * by the server. The server is the source of truth.
 */

import { supabase } from '@/lib/supabase/client';
import type {
  AwardXpInput,
  AwardXpResult,
  XpStatus,
  UnlockedSlot,
} from '@/types/xp';

const FUNCTIONS_BASE_URL =
  'https://esgptfiofoaeguslgvcq.supabase.co/functions/v1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getJwt(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error('[xpApi] getSession error:', error.message);
    throw new Error(`[xpApi] Auth error: ${error.message}`);
  }
  if (!session?.access_token) {
    throw new Error('[xpApi] No active session — user must be signed in to use XP features');
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

  console.log(`[xpApi] ${method} ${path}`, body ?? '');

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
    console.error(`[xpApi] ${path} failed (${response.status}):`, text);
    throw new Error(`[xpApi] ${path} returned ${response.status}: ${text}`);
  }

  const data = (await response.json()) as T;
  console.log(`[xpApi] ${path} response:`, data);
  return data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Award XP for a user action.
 * The server handles idempotency via source_id — safe to call multiple times
 * with the same source_id for the same event_type.
 */
export async function awardXp(input: AwardXpInput): Promise<AwardXpResult> {
  console.log('[xpApi] awardXp called:', input);
  return callFunction<AwardXpResult>('award-xp', 'POST', input);
}

/**
 * Fetch the full XP state for cold-start sync.
 * Call this on app launch and after returning from background.
 */
export async function getXpStatus(): Promise<XpStatus> {
  console.log('[xpApi] getXpStatus called');
  return callFunction<XpStatus>('get-xp-status', 'GET');
}

/**
 * Acknowledge a pending level-up notification so it doesn't show again.
 */
export async function confirmLevelUpSeen(): Promise<void> {
  console.log('[xpApi] confirmLevelUpSeen called');
  await callFunction<unknown>('confirm-level-up-seen', 'POST');
}

/**
 * Unlock a mission slot for today by choosing a mission type.
 * Awards +50 XP unlock bonus immediately.
 * Call xp.refresh() after success to pull updated unlock_slot_status.slots.
 */
export async function unlockMissionSlot(missionType: string): Promise<{
  success: boolean;
  slot: UnlockedSlot;
  xp_awarded: number;
  remaining_slots: number;
}> {
  console.log('[xpApi] unlockMissionSlot called:', { missionType });
  return callFunction<{
    success: boolean;
    slot: UnlockedSlot;
    xp_awarded: number;
    remaining_slots: number;
  }>('unlock-mission-slot', 'POST', { mission_type: missionType });
}

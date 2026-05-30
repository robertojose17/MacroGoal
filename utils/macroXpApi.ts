/**
 * Macro XP API Client
 *
 * Thin wrappers over the Supabase Edge Functions for macro-tier XP and
 * user-timezone sync. Mirrors the structure of utils/xpApi.ts exactly.
 *
 * Base URL: https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/
 */

import { supabase } from '@/lib/supabase/client';
import type { MacroKey } from '@/utils/macroTier';

const FUNCTIONS_BASE_URL = 'https://esgptfiofoaeguslgvcq.supabase.co/functions/v1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getJwt(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error('[macroXpApi] getSession error:', error.message);
    throw new Error(`[macroXpApi] Auth error: ${error.message}`);
  }
  if (!session?.access_token) {
    throw new Error('[macroXpApi] No active session — user must be signed in');
  }
  return session.access_token;
}

async function callFunction<T>(path: string, body: unknown): Promise<T> {
  const jwt = await getJwt();
  const url = `${FUNCTIONS_BASE_URL}/${path}`;

  console.log(`[macroXpApi] POST ${path}`, body);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[macroXpApi] ${path} failed (${response.status}):`, text);
    throw new Error(`[macroXpApi] ${path} returned ${response.status}: ${text}`);
  }

  const data = (await response.json()) as T;
  console.log(`[macroXpApi] ${path} response:`, data);
  return data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SetMacroTierParams {
  date: string;    // YYYY-MM-DD in user's local timezone
  macro: MacroKey;
  current: number;
  goal: number;
}

export interface SetMacroTierResult {
  macro: MacroKey;
  tier: 0 | 1 | 2;
  xp_awarded: number;
  locked: boolean;
  xp_today: number;
  level_up: boolean;
}

/**
 * Sync a single macro's current value to the backend so it can award/revoke
 * tier XP for today. Safe to call repeatedly — the backend is idempotent.
 */
export async function setMacroTier(params: SetMacroTierParams): Promise<SetMacroTierResult> {
  console.log('[macroXpApi] setMacroTier(', params, ')');
  return callFunction<SetMacroTierResult>('set-macro-tier', params);
}

export interface SetUserTimezoneResult {
  timezone: string;
}

/**
 * Persist the user's IANA timezone to the backend so day-boundary calculations
 * use the correct local date.
 */
export async function setUserTimezone(timezone: string): Promise<SetUserTimezoneResult> {
  console.log('[macroXpApi] setUserTimezone(', timezone, ')');
  return callFunction<SetUserTimezoneResult>('set-user-timezone', { timezone });
}

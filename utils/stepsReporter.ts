/**
 * Steps Reporter
 *
 * Reads today's step count and reports it to the award-xp Edge Function.
 * This is the bridge between the health data layer and the XP system.
 *
 * Anti-abuse guards:
 * - Client sanity-checks: 0 ≤ steps ≤ 50 000 (server also caps at 50 000)
 * - Rate-limit: fires at most once per 30 minutes (stored in AsyncStorage)
 * - Never throws — all errors are caught and logged
 *
 * Call sites:
 * - app/_layout.tsx AppState foreground listener (wired in this phase)
 * - app/(tabs)/dashboard.tsx on mount (Phase 4)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTodaySteps } from '@/utils/healthKit';
import { awardXp } from '@/utils/xpApi';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'steps_reporter_last_report_ts';
const THROTTLE_MS = 30 * 60 * 1000; // 30 minutes
const MAX_STEPS = 50000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

async function isThrottled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const lastTs = Number(raw);
    const elapsed = Date.now() - lastTs;
    const throttled = elapsed < THROTTLE_MS;
    if (throttled) {
      console.log(
        '[stepsReporter] throttled — last report was',
        Math.round(elapsed / 1000 / 60),
        'min ago'
      );
    }
    return throttled;
  } catch {
    return false;
  }
}

async function markReported(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch (e) {
    console.warn('[stepsReporter] failed to persist last-report timestamp:', e);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type ReportResult = {
  reported: boolean;
  steps: number | null;
  reason?: string;
};

/**
 * Read today's steps and award XP if valid.
 * Safe to call from any context — never throws.
 */
export async function reportTodaySteps(): Promise<ReportResult> {
  console.log('[stepsReporter] reportTodaySteps called');

  try {
    // Rate-limit guard
    if (await isThrottled()) {
      return { reported: false, steps: null, reason: 'throttled' };
    }

    // Read steps
    const result = await getTodaySteps();
    console.log('[stepsReporter] getTodaySteps result:', result);

    if (!result.available) {
      return { reported: false, steps: null, reason: 'health_unavailable' };
    }
    if (result.permission !== 'granted') {
      return { reported: false, steps: null, reason: 'no_permission' };
    }
    if (result.steps === null) {
      return { reported: false, steps: null, reason: 'no_data' };
    }

    const steps = result.steps;

    // Client-side sanity check (server also enforces this)
    if (steps < 0 || steps > MAX_STEPS) {
      console.warn('[stepsReporter] step count out of range, skipping:', steps);
      return { reported: false, steps, reason: 'out_of_range' };
    }

    // Award XP — source_id is today's date for idempotency
    const sourceId = todayIsoDate();
    console.log('[stepsReporter] awarding XP for steps:', steps, 'source_id:', sourceId);

    const xpResult = await awardXp({
      event_type: 'steps',
      source_id: sourceId,
      metadata: { step_count: steps },
    });

    console.log('[stepsReporter] XP awarded:', xpResult.awarded, 'total_xp:', xpResult.total_xp);

    await markReported();
    return { reported: true, steps };
  } catch (e) {
    // Never let a reporting error crash the app
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[stepsReporter] reportTodaySteps error (non-fatal):', msg);
    return { reported: false, steps: null, reason: msg };
  }
}

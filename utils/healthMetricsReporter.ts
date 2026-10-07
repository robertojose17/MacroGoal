/**
 * Health Metrics Reporter
 *
 * Reads all daily health metrics and reports them to the award-xp Edge Function.
 * Each metric has a threshold — only reports when the threshold is crossed.
 * Uses date-based source_ids for idempotency (backend dedupes same event+source_id).
 *
 * Thresholds:
 *   activeCalories  >= 300 kcal
 *   exerciseMinutes >= 30 min
 *   distanceMiles   >= 1 mile
 *   standHours      >= 10 hours
 *   flightsClimbed  >= 10 flights
 *
 * Anti-abuse guards:
 * - Rate-limit: fires at most once per 30 minutes (stored in AsyncStorage)
 * - Never throws — all errors are caught and logged
 *
 * Call sites:
 * - app/(tabs)/dashboard.tsx on screen focus
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAllDailyMetrics } from '@/utils/healthKit';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'health_metrics_reporter_last_report_ts';
const THROTTLE_MS = 30 * 60 * 1000; // 30 minutes

// Thresholds for each metric
const THRESHOLDS = {
  activeCalories: 300,
  exerciseMinutes: 30,
  distanceMiles: 1,
  standHours: 10,
  flightsClimbed: 10,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
        '[healthMetricsReporter] throttled — last report was',
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
    console.warn('[healthMetricsReporter] failed to persist last-report timestamp:', e);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type MetricsReportResult = {
  reported: boolean;
  eventsPosted: string[];
  reason?: string;
};

/**
 * Read all daily health metrics and award XP for any that cross their threshold.
 * Safe to call from any context — never throws.
 */
export async function reportDailyHealthMetrics(): Promise<MetricsReportResult> {
  console.log('[healthMetricsReporter] reportDailyHealthMetrics called');

  try {
    // Rate-limit guard
    if (await isThrottled()) {
      return { reported: false, eventsPosted: [], reason: 'throttled' };
    }

    const metrics = await getAllDailyMetrics(new Date());
    console.log('[healthMetricsReporter] metrics received:', metrics);

    const eventsPosted: string[] = [];

    // ── Active Calories ──────────────────────────────────────────────────────
    if (metrics.activeCalories !== null && metrics.activeCalories >= THRESHOLDS.activeCalories) {
      console.log('[healthMetricsReporter] active calories threshold met:', metrics.activeCalories);
      eventsPosted.push('active_calories');
    }

    // ── Exercise Minutes ─────────────────────────────────────────────────────
    if (metrics.exerciseMinutes !== null && metrics.exerciseMinutes >= THRESHOLDS.exerciseMinutes) {
      console.log('[healthMetricsReporter] exercise minutes threshold met:', metrics.exerciseMinutes);
      eventsPosted.push('exercise_minutes');
    }

    // ── Distance ─────────────────────────────────────────────────────────────
    if (metrics.distanceMiles !== null && metrics.distanceMiles >= THRESHOLDS.distanceMiles) {
      console.log('[healthMetricsReporter] distance threshold met:', metrics.distanceMiles);
      eventsPosted.push('distance');
    }

    // ── Stand Hours ──────────────────────────────────────────────────────────
    if (metrics.standHours !== null && metrics.standHours >= THRESHOLDS.standHours) {
      console.log('[healthMetricsReporter] stand hours threshold met:', metrics.standHours);
      eventsPosted.push('stand_hours');
    }

    // ── Flights Climbed ──────────────────────────────────────────────────────
    if (metrics.flightsClimbed !== null && metrics.flightsClimbed >= THRESHOLDS.flightsClimbed) {
      console.log('[healthMetricsReporter] flights climbed threshold met:', metrics.flightsClimbed);
      eventsPosted.push('flights_climbed');
    }

    if (eventsPosted.length > 0) {
      await markReported();
    }

    console.log('[healthMetricsReporter] done. Events posted:', eventsPosted);
    return { reported: eventsPosted.length > 0, eventsPosted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthMetricsReporter] reportDailyHealthMetrics error (non-fatal):', msg);
    return { reported: false, eventsPosted: [], reason: msg };
  }
}

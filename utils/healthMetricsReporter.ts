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
import { awardXp } from '@/utils/xpApi';

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

    const dateStr = todayIsoDate();
    const eventsPosted: string[] = [];

    // ── Active Calories ──────────────────────────────────────────────────────
    if (
      metrics.activeCalories !== null &&
      metrics.activeCalories >= THRESHOLDS.activeCalories
    ) {
      console.log('[healthMetricsReporter] active calories threshold met:', metrics.activeCalories, '>=', THRESHOLDS.activeCalories);
      try {
        await awardXp({
          event_type: 'active_calories' as any,
          source_id: `active_calories_${dateStr}`,
          metadata: { calories: metrics.activeCalories },
        });
        eventsPosted.push('active_calories');
        console.log('[healthMetricsReporter] active_calories XP posted');
      } catch (e) {
        console.warn('[healthMetricsReporter] active_calories post failed (non-fatal):', e instanceof Error ? e.message : e);
      }
    } else {
      console.log('[healthMetricsReporter] active calories below threshold or null:', metrics.activeCalories);
    }

    // ── Exercise Minutes ─────────────────────────────────────────────────────
    if (
      metrics.exerciseMinutes !== null &&
      metrics.exerciseMinutes >= THRESHOLDS.exerciseMinutes
    ) {
      console.log('[healthMetricsReporter] exercise minutes threshold met:', metrics.exerciseMinutes, '>=', THRESHOLDS.exerciseMinutes);
      try {
        await awardXp({
          event_type: 'exercise_minutes' as any,
          source_id: `exercise_minutes_${dateStr}`,
          metadata: { minutes: metrics.exerciseMinutes },
        });
        eventsPosted.push('exercise_minutes');
        console.log('[healthMetricsReporter] exercise_minutes XP posted');
      } catch (e) {
        console.warn('[healthMetricsReporter] exercise_minutes post failed (non-fatal):', e instanceof Error ? e.message : e);
      }
    } else {
      console.log('[healthMetricsReporter] exercise minutes below threshold or null:', metrics.exerciseMinutes);
    }

    // ── Distance ─────────────────────────────────────────────────────────────
    if (
      metrics.distanceMiles !== null &&
      metrics.distanceMiles >= THRESHOLDS.distanceMiles
    ) {
      console.log('[healthMetricsReporter] distance threshold met:', metrics.distanceMiles, '>=', THRESHOLDS.distanceMiles);
      try {
        await awardXp({
          event_type: 'distance' as any,
          source_id: `distance_${dateStr}`,
          metadata: { miles: metrics.distanceMiles },
        });
        eventsPosted.push('distance');
        console.log('[healthMetricsReporter] distance XP posted');
      } catch (e) {
        console.warn('[healthMetricsReporter] distance post failed (non-fatal):', e instanceof Error ? e.message : e);
      }
    } else {
      console.log('[healthMetricsReporter] distance below threshold or null:', metrics.distanceMiles);
    }

    // ── Stand Hours ──────────────────────────────────────────────────────────
    if (
      metrics.standHours !== null &&
      metrics.standHours >= THRESHOLDS.standHours
    ) {
      console.log('[healthMetricsReporter] stand hours threshold met:', metrics.standHours, '>=', THRESHOLDS.standHours);
      try {
        await awardXp({
          event_type: 'stand_hours' as any,
          source_id: `stand_hours_${dateStr}`,
          metadata: { hours: metrics.standHours },
        });
        eventsPosted.push('stand_hours');
        console.log('[healthMetricsReporter] stand_hours XP posted');
      } catch (e) {
        console.warn('[healthMetricsReporter] stand_hours post failed (non-fatal):', e instanceof Error ? e.message : e);
      }
    } else {
      console.log('[healthMetricsReporter] stand hours below threshold or null:', metrics.standHours);
    }

    // ── Flights Climbed ──────────────────────────────────────────────────────
    if (
      metrics.flightsClimbed !== null &&
      metrics.flightsClimbed >= THRESHOLDS.flightsClimbed
    ) {
      console.log('[healthMetricsReporter] flights climbed threshold met:', metrics.flightsClimbed, '>=', THRESHOLDS.flightsClimbed);
      try {
        await awardXp({
          event_type: 'flights_climbed' as any,
          source_id: `flights_climbed_${dateStr}`,
          metadata: { flights: metrics.flightsClimbed },
        });
        eventsPosted.push('flights_climbed');
        console.log('[healthMetricsReporter] flights_climbed XP posted');
      } catch (e) {
        console.warn('[healthMetricsReporter] flights_climbed post failed (non-fatal):', e instanceof Error ? e.message : e);
      }
    } else {
      console.log('[healthMetricsReporter] flights climbed below threshold or null:', metrics.flightsClimbed);
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

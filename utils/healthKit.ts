/**
 * Health Data Wrapper — platform-agnostic step count reader
 *
 * iOS:     @kingstinct/react-native-healthkit (Nitro Modules, SDK 54 compatible)
 *          Uses queryStatisticsForQuantity with cumulativeSum so HealthKit
 *          deduplicates samples across sources (iPhone + Apple Watch).
 *          Chosen over react-native-health because react-native-health pins an
 *          old @expo/config-plugins version that conflicts with SDK 54.
 *
 * Android: react-native-health-connect + expo-health-connect config plugin
 *          The official Google Health Connect SDK for React Native.
 *
 * Web:     Returns { available: false } — no health data on web.
 *
 * IMPORTANT: Never import HealthKit or Health Connect directly from screens.
 *            Always go through this module.
 */

import { Platform } from 'react-native';

// ─── DEV MOCK ─────────────────────────────────────────────────────────────────
// Set MOCK_STEPS to a number to bypass HealthKit / Health Connect entirely.
// This lets you test the app in Expo Go without running a native build.
// Set to null to re-enable real health data (requires a native build).
const MOCK_STEPS: number | null = null;

// ─── Public types ─────────────────────────────────────────────────────────────

export type PermissionStatus = 'granted' | 'denied' | 'not_determined';

export type StepsResult = {
  /** true if HealthKit / Health Connect is available on this device */
  available: boolean;
  permission: PermissionStatus;
  /** null if no permission or unavailable; 0 if granted but no data */
  steps: number | null;
  error?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns midnight (00:00:00.000) of the given date in local time */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Returns 23:59:59.999 of the given date in local time */
function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Clamp step count to a sane range (server also caps at 50 000) */
function sanitizeSteps(raw: number): number {
  const n = Math.round(raw);
  if (n < 0) return 0;
  if (n > 50000) return 50000;
  return n;
}

// ─── Web stub ─────────────────────────────────────────────────────────────────

const WEB_UNAVAILABLE: StepsResult = {
  available: false,
  permission: 'denied',
  steps: null,
};

// ─── iOS — HealthKit via @kingstinct/react-native-healthkit ───────────────────

async function ios_initialize(): Promise<{ available: boolean }> {
  try {
    // Dynamic import so the module is never bundled on Android/web
    const { isHealthDataAvailable } = await import(
      '@kingstinct/react-native-healthkit'
    );
    const available = isHealthDataAvailable();
    console.log('[healthKit] iOS isHealthDataAvailable:', available);
    return { available };
  } catch (e) {
    console.warn('[healthKit] iOS initialize error:', e);
    return { available: false };
  }
}

async function ios_requestPermission(): Promise<PermissionStatus> {
  try {
    const { requestAuthorization, queryQuantitySamples } =
      await import('@kingstinct/react-native-healthkit');

    // Request authorization — shows the system dialog if not yet shown.
    // NOTE: We intentionally do NOT call getRequestStatusForAuthorization
    // after this. Apple's privacy model makes that API return 'shouldRequest'
    // even after the user grants READ access, so it is useless as a truth source.
    console.log('[healthKit] iOS calling requestAuthorization');
    await requestAuthorization({
      toRead: ['HKQuantityTypeIdentifierStepCount'],
    });
    console.log('[healthKit] iOS requestAuthorization resolved (no throw = sheet was shown or already handled)');

    // Probe: attempt an actual sample query for the last 24 hours.
    // This is the ONLY reliable way to know if read access was granted on iOS.
    // A successful query (even returning an empty array) means access is granted.
    // A throw with an authorization-related message means denied/restricted.
    const probeEnd = new Date();
    const probeStart = new Date(probeEnd.getTime() - 24 * 60 * 60 * 1000);
    console.log('[healthKit] iOS probing sample query to determine actual read permission');
    try {
      const probeSamples = await queryQuantitySamples(
        'HKQuantityTypeIdentifierStepCount',
        {
          limit: 1,
          unit: 'count',
          filter: { date: { startDate: probeStart, endDate: probeEnd } },
        }
      );
      // Query succeeded — read access is granted regardless of what
      // getRequestStatusForAuthorization would say.
      console.log('[healthKit] iOS probe succeeded — permission is GRANTED. Samples returned:', probeSamples.length);
      return 'granted';
    } catch (probeErr) {
      const probeMsg = probeErr instanceof Error ? probeErr.message : String(probeErr);
      console.warn('[healthKit] iOS probe query threw:', probeMsg);
      // Authorization-related errors mean the user denied or restricted access.
      const isAuthError = /authoriz|not authorized|denied|permission|restricted/i.test(probeMsg);
      if (isAuthError) {
        console.log('[healthKit] iOS probe error looks like auth denial → returning denied');
        return 'denied';
      }
      // Non-auth error (e.g. network, unexpected) — treat as not_determined so
      // the UI shows the Connect button again rather than a hard "denied" state.
      console.log('[healthKit] iOS probe error is non-auth → returning not_determined');
      return 'not_determined';
    }
  } catch (e) {
    // requestAuthorization itself threw — this typically means the user
    // cancelled the sheet or the system rejected the request outright.
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] iOS requestAuthorization threw:', msg);
    const isAuthError = /authoriz|not authorized|denied|permission|restricted|cancel/i.test(msg);
    return isAuthError ? 'denied' : 'not_determined';
  }
}

async function ios_getStepsForDate(date: Date): Promise<StepsResult> {
  try {
    const { isHealthDataAvailable, queryStatisticsForQuantity } =
      await import('@kingstinct/react-native-healthkit');

    if (!isHealthDataAvailable()) {
      console.log('[healthKit] iOS getStepsForDate: HealthKit not available on this device');
      return { available: false, permission: 'denied', steps: null };
    }

    const start = startOfDay(date);
    const end = endOfDay(date);
    console.log('[healthKit] iOS querying steps (statistics/cumulativeSum) for', start.toISOString(), '→', end.toISOString());

    // Use queryStatisticsForQuantity with cumulativeSum.
    // This is the API Apple recommends for cumulative quantities like step count —
    // HealthKit's statistics engine deduplicates and reconciles samples across all
    // sources (iPhone, Apple Watch, third-party apps) automatically. This is what
    // MyFitnessPal, Strava, and other professional fitness apps use.
    //
    // IMPORTANT: do NOT add a `metadata: { withMetadataKey: 'HKWasUserEntered' }`
    // filter here — that filter has a known bug in the underlying iOS API that
    // causes duplicated counts. Without it, the returned sumQuantity is the
    // correctly deduplicated daily total.
    // Ref: https://github.com/kingstinct/react-native-healthkit/issues/301
    const stats = await queryStatisticsForQuantity(
      'HKQuantityTypeIdentifierStepCount',
      ['cumulativeSum'],
      {
        unit: 'count',
        filter: {
          date: { startDate: start, endDate: end },
        },
      }
    );

    const total = stats.sumQuantity?.quantity ?? 0;
    const steps = sanitizeSteps(total);
    const sourceNames = stats.sources?.map((s: { name: string }) => s.name).join(', ') ?? '(none)';
    console.log('[healthKit] iOS steps total:', steps, '— sources:', sourceNames, '— permission confirmed GRANTED');

    return { available: true, permission: 'granted', steps };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] iOS getStepsForDate error:', msg);

    // Distinguish auth failures from other errors so the UI shows the right state
    const isAuthError = /authoriz|not authorized|denied|permission|restricted/i.test(msg);
    if (isAuthError) {
      console.log('[healthKit] iOS getStepsForDate: auth error → permission denied');
      return { available: true, permission: 'denied', steps: null, error: msg };
    }

    // Non-auth error — keep as not_determined so the UI shows the Connect button
    console.log('[healthKit] iOS getStepsForDate: non-auth error → not_determined');
    return { available: true, permission: 'not_determined', steps: null, error: msg };
  }
}

// ─── Android — Health Connect via react-native-health-connect ─────────────────

async function android_initialize(): Promise<{ available: boolean }> {
  try {
    const { initialize } = await import('react-native-health-connect');
    const initialized = await initialize();
    console.log('[healthKit] Android Health Connect initialized:', initialized);
    return { available: initialized };
  } catch (e) {
    // Health Connect not installed or not available on this device
    console.warn('[healthKit] Android initialize error (Health Connect may not be installed):', e);
    return { available: false };
  }
}

async function android_requestPermission(): Promise<PermissionStatus> {
  try {
    const { initialize, requestPermission, getGrantedPermissions } =
      await import('react-native-health-connect');

    const initialized = await initialize();
    if (!initialized) {
      console.log('[healthKit] Android Health Connect not available');
      return 'denied';
    }

    // Check existing grants first
    const granted = await getGrantedPermissions();
    const hasSteps = granted.some(
      (p: { recordType: string; accessType: string }) =>
        p.recordType === 'Steps' && p.accessType === 'read'
    );
    if (hasSteps) {
      console.log('[healthKit] Android steps permission already granted');
      return 'granted';
    }

    console.log('[healthKit] Android requesting Health Connect permission');
    const result = await requestPermission([
      { accessType: 'read', recordType: 'Steps' },
    ]);
    console.log('[healthKit] Android requestPermission result:', result);

    const nowGranted = result.some(
      (p: { recordType: string; accessType: string }) =>
        p.recordType === 'Steps' && p.accessType === 'read'
    );
    return nowGranted ? 'granted' : 'denied';
  } catch (e) {
    console.warn('[healthKit] Android requestPermission error:', e);
    return 'not_determined';
  }
}

async function android_getStepsForDate(date: Date): Promise<StepsResult> {
  try {
    const { initialize, getGrantedPermissions, readRecords } = await import(
      'react-native-health-connect'
    );

    const initialized = await initialize();
    if (!initialized) {
      return { available: false, permission: 'denied', steps: null };
    }

    // Check permission
    const granted = await getGrantedPermissions();
    const hasSteps = granted.some(
      (p: { recordType: string; accessType: string }) =>
        p.recordType === 'Steps' && p.accessType === 'read'
    );
    if (!hasSteps) {
      console.log('[healthKit] Android steps: no permission');
      return { available: true, permission: 'not_determined', steps: null };
    }

    const start = startOfDay(date);
    const end = endOfDay(date);

    console.log('[healthKit] Android querying steps for', start.toISOString(), '→', end.toISOString());

    const result = await readRecords('Steps', {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });

    const records = result?.records ?? [];
    const total = records.reduce(
      (sum: number, r: { count?: number }) => sum + (r.count ?? 0),
      0
    );
    const steps = sanitizeSteps(total);
    console.log('[healthKit] Android steps total:', steps, '(', records.length, 'records)');

    return { available: true, permission: 'granted', steps };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] Android getStepsForDate error:', msg);
    return { available: true, permission: 'not_determined', steps: null, error: msg };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the health data provider once at app start (or on demand).
 * Safe to call multiple times — subsequent calls are cheap.
 */
export async function initializeHealthData(): Promise<{ available: boolean }> {
  if (MOCK_STEPS !== null) {
    console.log('[healthKit] MOCK MODE — initializeHealthData returning available=true');
    return { available: true };
  }
  console.log('[healthKit] initializeHealthData, platform:', Platform.OS);
  if (Platform.OS === 'ios') return ios_initialize();
  if (Platform.OS === 'android') return android_initialize();
  return { available: false };
}

/**
 * Request step-count read permission.
 * Shows the OS permission dialog if not yet determined.
 * Safe to call multiple times.
 */
export async function requestStepsPermission(): Promise<PermissionStatus> {
  if (MOCK_STEPS !== null) {
    console.log('[healthKit] MOCK MODE — requestStepsPermission returning granted');
    return 'granted';
  }
  console.log('[healthKit] requestStepsPermission, platform:', Platform.OS);
  if (Platform.OS === 'ios') return ios_requestPermission();
  if (Platform.OS === 'android') return android_requestPermission();
  return 'denied';
}

/**
 * Read today's step count.
 * Returns steps: 0 if granted but no data, null if no permission or error.
 */
export async function getTodaySteps(): Promise<StepsResult> {
  console.log('[healthKit] getTodaySteps');
  return getStepsForDate(new Date());
}

/**
 * Read step count for a specific date (useful for backfilling missions).
 */
export async function getStepsForDate(date: Date): Promise<StepsResult> {
  if (MOCK_STEPS !== null) {
    console.log('[healthKit] MOCK MODE — returning', MOCK_STEPS, 'steps for', date.toISOString());
    return { available: true, permission: 'granted', steps: MOCK_STEPS };
  }
  console.log('[healthKit] getStepsForDate:', date.toISOString());
  if (Platform.OS === 'ios') return ios_getStepsForDate(date);
  if (Platform.OS === 'android') return android_getStepsForDate(date);
  return WEB_UNAVAILABLE;
}

/**
 * Health Data Wrapper — platform-agnostic health metrics reader
 *
 * iOS:     @kingstinct/react-native-healthkit (Nitro Modules, SDK 54 compatible)
 *          Uses queryStatisticsForQuantity with cumulativeSum so HealthKit
 *          deduplicates samples across sources (iPhone + Apple Watch).
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
// Set MOCK_METRICS to a non-null object to bypass HealthKit / Health Connect.
// This lets you test the app in Expo Go without running a native build.
// Set to null to re-enable real health data (requires a native build).
const MOCK_METRICS: DailyHealthMetrics | null = null;

// Keep legacy MOCK_STEPS alias for backward compat (used by getStepsForDate)
const MOCK_STEPS: number | null = MOCK_METRICS?.steps ?? null;

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

export type MetricResult = {
  available: boolean;
  permission: PermissionStatus;
  value: number | null;
  error?: string;
};

export type DailyHealthMetrics = {
  steps: number | null;
  activeCalories: number | null;   // kcal
  exerciseMinutes: number | null;
  distanceMiles: number | null;
  standHours: number | null;
  flightsClimbed: number | null;
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

/** Clamp a generic numeric metric to a non-negative value */
function sanitizeMetric(raw: number): number {
  const n = Math.round(raw * 100) / 100; // keep 2 decimal places
  return n < 0 ? 0 : n;
}

const METERS_PER_MILE = 1609.344;

// ─── Web stubs ────────────────────────────────────────────────────────────────

const WEB_UNAVAILABLE: StepsResult = {
  available: false,
  permission: 'denied',
  steps: null,
};

const WEB_METRIC_UNAVAILABLE: MetricResult = {
  available: false,
  permission: 'denied',
  value: null,
};

// ─── iOS — HealthKit via @kingstinct/react-native-healthkit ───────────────────

async function ios_initialize(): Promise<{ available: boolean }> {
  try {
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

    console.log('[healthKit] iOS calling requestAuthorization');
    await requestAuthorization({
      toRead: ['HKQuantityTypeIdentifierStepCount'],
    });
    console.log('[healthKit] iOS requestAuthorization resolved (no throw = sheet was shown or already handled)');

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
      console.log('[healthKit] iOS probe succeeded — permission is GRANTED. Samples returned:', probeSamples.length);
      return 'granted';
    } catch (probeErr) {
      const probeMsg = probeErr instanceof Error ? probeErr.message : String(probeErr);
      console.warn('[healthKit] iOS probe query threw:', probeMsg);
      const isAuthError = /authoriz|not authorized|denied|permission|restricted/i.test(probeMsg);
      if (isAuthError) {
        console.log('[healthKit] iOS probe error looks like auth denial → returning denied');
        return 'denied';
      }
      console.log('[healthKit] iOS probe error is non-auth → returning not_determined');
      return 'not_determined';
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] iOS requestAuthorization threw:', msg);
    const isAuthError = /authoriz|not authorized|denied|permission|restricted|cancel/i.test(msg);
    return isAuthError ? 'denied' : 'not_determined';
  }
}

/**
 * Request authorization for ALL health metrics at once.
 * Shows the system dialog once covering all identifiers.
 */
async function ios_requestAllPermissions(): Promise<PermissionStatus> {
  try {
    const { requestAuthorization, queryQuantitySamples } =
      await import('@kingstinct/react-native-healthkit');

    console.log('[healthKit] iOS calling requestAuthorization for all metrics');
    await requestAuthorization({
      toRead: [
        'HKQuantityTypeIdentifierStepCount',
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        'HKQuantityTypeIdentifierAppleExerciseTime',
        'HKQuantityTypeIdentifierDistanceWalkingRunning',
        'HKCategoryTypeIdentifierAppleStandHour',
        'HKQuantityTypeIdentifierFlightsClimbed',
      ],
    });
    console.log('[healthKit] iOS requestAuthorization (all) resolved');

    // Probe with steps as the representative type
    const probeEnd = new Date();
    const probeStart = new Date(probeEnd.getTime() - 24 * 60 * 60 * 1000);
    try {
      const probeSamples = await queryQuantitySamples(
        'HKQuantityTypeIdentifierStepCount',
        {
          limit: 1,
          unit: 'count',
          filter: { date: { startDate: probeStart, endDate: probeEnd } },
        }
      );
      console.log('[healthKit] iOS all-metrics probe succeeded. Samples:', probeSamples.length);
      return 'granted';
    } catch (probeErr) {
      const probeMsg = probeErr instanceof Error ? probeErr.message : String(probeErr);
      console.warn('[healthKit] iOS all-metrics probe threw:', probeMsg);
      const isAuthError = /authoriz|not authorized|denied|permission|restricted/i.test(probeMsg);
      return isAuthError ? 'denied' : 'not_determined';
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] iOS requestAllPermissions threw:', msg);
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
    console.log('[healthKit] iOS steps total:', steps, '— sources:', sourceNames);

    return { available: true, permission: 'granted', steps };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] iOS getStepsForDate error:', msg);
    const isAuthError = /authoriz|not authorized|denied|permission|restricted/i.test(msg);
    if (isAuthError) {
      return { available: true, permission: 'denied', steps: null, error: msg };
    }
    return { available: true, permission: 'not_determined', steps: null, error: msg };
  }
}

async function ios_getActiveCaloriesForDate(date: Date): Promise<MetricResult> {
  try {
    const { isHealthDataAvailable, queryStatisticsForQuantity } =
      await import('@kingstinct/react-native-healthkit');

    if (!isHealthDataAvailable()) {
      return { available: false, permission: 'denied', value: null };
    }

    const start = startOfDay(date);
    const end = endOfDay(date);
    console.log('[healthKit] iOS querying active calories for', start.toISOString(), '→', end.toISOString());

    const stats = await queryStatisticsForQuantity(
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      ['cumulativeSum'],
      {
        unit: 'kcal',
        filter: { date: { startDate: start, endDate: end } },
      }
    );

    const total = stats.sumQuantity?.quantity ?? 0;
    const value = sanitizeMetric(total);
    console.log('[healthKit] iOS active calories:', value);
    return { available: true, permission: 'granted', value };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] iOS getActiveCaloriesForDate error:', msg);
    const isAuthError = /authoriz|not authorized|denied|permission|restricted/i.test(msg);
    return { available: true, permission: isAuthError ? 'denied' : 'not_determined', value: null, error: msg };
  }
}

async function ios_getExerciseMinutesForDate(date: Date): Promise<MetricResult> {
  try {
    const { isHealthDataAvailable, queryStatisticsForQuantity } =
      await import('@kingstinct/react-native-healthkit');

    if (!isHealthDataAvailable()) {
      return { available: false, permission: 'denied', value: null };
    }

    const start = startOfDay(date);
    const end = endOfDay(date);
    console.log('[healthKit] iOS querying exercise minutes for', start.toISOString(), '→', end.toISOString());

    const stats = await queryStatisticsForQuantity(
      'HKQuantityTypeIdentifierAppleExerciseTime',
      ['cumulativeSum'],
      {
        unit: 'min',
        filter: { date: { startDate: start, endDate: end } },
      }
    );

    const total = stats.sumQuantity?.quantity ?? 0;
    const value = sanitizeMetric(total);
    console.log('[healthKit] iOS exercise minutes:', value);
    return { available: true, permission: 'granted', value };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] iOS getExerciseMinutesForDate error:', msg);
    const isAuthError = /authoriz|not authorized|denied|permission|restricted/i.test(msg);
    return { available: true, permission: isAuthError ? 'denied' : 'not_determined', value: null, error: msg };
  }
}

async function ios_getDistanceMilesForDate(date: Date): Promise<MetricResult> {
  try {
    const { isHealthDataAvailable, queryStatisticsForQuantity } =
      await import('@kingstinct/react-native-healthkit');

    if (!isHealthDataAvailable()) {
      return { available: false, permission: 'denied', value: null };
    }

    const start = startOfDay(date);
    const end = endOfDay(date);
    console.log('[healthKit] iOS querying distance (walking/running) for', start.toISOString(), '→', end.toISOString());

    const stats = await queryStatisticsForQuantity(
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      ['cumulativeSum'],
      {
        unit: 'm',
        filter: { date: { startDate: start, endDate: end } },
      }
    );

    const totalMeters = stats.sumQuantity?.quantity ?? 0;
    const miles = sanitizeMetric(totalMeters / METERS_PER_MILE);
    console.log('[healthKit] iOS distance:', miles, 'miles (', totalMeters, 'm)');
    return { available: true, permission: 'granted', value: miles };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] iOS getDistanceMilesForDate error:', msg);
    const isAuthError = /authoriz|not authorized|denied|permission|restricted/i.test(msg);
    return { available: true, permission: isAuthError ? 'denied' : 'not_determined', value: null, error: msg };
  }
}

async function ios_getStandHoursForDate(date: Date): Promise<MetricResult> {
  try {
    const { isHealthDataAvailable, queryCategorySamples } =
      await import('@kingstinct/react-native-healthkit');

    if (!isHealthDataAvailable()) {
      return { available: false, permission: 'denied', value: null };
    }

    const start = startOfDay(date);
    const end = endOfDay(date);
    console.log('[healthKit] iOS querying stand hours for', start.toISOString(), '→', end.toISOString());

    // HKCategoryValueAppleStandHourStood = 0 means the user stood during that hour
    const samples = await queryCategorySamples(
      'HKCategoryTypeIdentifierAppleStandHour',
      {
        filter: { date: { startDate: start, endDate: end } },
      }
    );

    // Count samples where value === 0 (stood) — each represents one hour
    const stoodCount = samples.filter((s: { value: number }) => s.value === 0).length;
    console.log('[healthKit] iOS stand hours:', stoodCount, '(', samples.length, 'total samples)');
    return { available: true, permission: 'granted', value: stoodCount };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] iOS getStandHoursForDate error:', msg);
    const isAuthError = /authoriz|not authorized|denied|permission|restricted/i.test(msg);
    return { available: true, permission: isAuthError ? 'denied' : 'not_determined', value: null, error: msg };
  }
}

async function ios_getFlightsClimbedForDate(date: Date): Promise<MetricResult> {
  try {
    const { isHealthDataAvailable, queryStatisticsForQuantity } =
      await import('@kingstinct/react-native-healthkit');

    if (!isHealthDataAvailable()) {
      return { available: false, permission: 'denied', value: null };
    }

    const start = startOfDay(date);
    const end = endOfDay(date);
    console.log('[healthKit] iOS querying flights climbed for', start.toISOString(), '→', end.toISOString());

    const stats = await queryStatisticsForQuantity(
      'HKQuantityTypeIdentifierFlightsClimbed',
      ['cumulativeSum'],
      {
        unit: 'count',
        filter: { date: { startDate: start, endDate: end } },
      }
    );

    const total = stats.sumQuantity?.quantity ?? 0;
    const value = sanitizeMetric(total);
    console.log('[healthKit] iOS flights climbed:', value);
    return { available: true, permission: 'granted', value };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] iOS getFlightsClimbedForDate error:', msg);
    const isAuthError = /authoriz|not authorized|denied|permission|restricted/i.test(msg);
    return { available: true, permission: isAuthError ? 'denied' : 'not_determined', value: null, error: msg };
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

/**
 * Request authorization for ALL health metrics on Android at once.
 */
async function android_requestAllPermissions(): Promise<PermissionStatus> {
  try {
    const { initialize, requestPermission, getGrantedPermissions } =
      await import('react-native-health-connect');

    const initialized = await initialize();
    if (!initialized) {
      console.log('[healthKit] Android Health Connect not available');
      return 'denied';
    }

    const granted = await getGrantedPermissions();
    const allTypes = ['Steps', 'ActiveCaloriesBurned', 'Distance', 'FloorsClimbed'];
    const allGranted = allTypes.every((type) =>
      granted.some(
        (p: { recordType: string; accessType: string }) =>
          p.recordType === type && p.accessType === 'read'
      )
    );
    if (allGranted) {
      console.log('[healthKit] Android all permissions already granted');
      return 'granted';
    }

    console.log('[healthKit] Android requesting all Health Connect permissions');
    const result = await requestPermission([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'Distance' },
      { accessType: 'read', recordType: 'FloorsClimbed' },
    ]);
    console.log('[healthKit] Android requestAllPermissions result:', result);

    const stepsGranted = result.some(
      (p: { recordType: string; accessType: string }) =>
        p.recordType === 'Steps' && p.accessType === 'read'
    );
    return stepsGranted ? 'granted' : 'denied';
  } catch (e) {
    console.warn('[healthKit] Android requestAllPermissions error:', e);
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

async function android_getActiveCaloriesForDate(date: Date): Promise<MetricResult> {
  try {
    const { initialize, getGrantedPermissions, readRecords } = await import(
      'react-native-health-connect'
    );

    const initialized = await initialize();
    if (!initialized) return { available: false, permission: 'denied', value: null };

    const granted = await getGrantedPermissions();
    const hasPerm = granted.some(
      (p: { recordType: string; accessType: string }) =>
        p.recordType === 'ActiveCaloriesBurned' && p.accessType === 'read'
    );
    if (!hasPerm) {
      return { available: true, permission: 'not_determined', value: null };
    }

    const start = startOfDay(date);
    const end = endOfDay(date);
    console.log('[healthKit] Android querying active calories for', start.toISOString(), '→', end.toISOString());

    const result = await readRecords('ActiveCaloriesBurned', {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });

    const records = result?.records ?? [];
    const total = records.reduce(
      (sum: number, r: { energy?: { inKilocalories?: number } }) =>
        sum + (r.energy?.inKilocalories ?? 0),
      0
    );
    const value = sanitizeMetric(total);
    console.log('[healthKit] Android active calories:', value, '(', records.length, 'records)');
    return { available: true, permission: 'granted', value };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] Android getActiveCaloriesForDate error:', msg);
    return { available: true, permission: 'not_determined', value: null, error: msg };
  }
}

async function android_getDistanceMilesForDate(date: Date): Promise<MetricResult> {
  try {
    const { initialize, getGrantedPermissions, readRecords } = await import(
      'react-native-health-connect'
    );

    const initialized = await initialize();
    if (!initialized) return { available: false, permission: 'denied', value: null };

    const granted = await getGrantedPermissions();
    const hasPerm = granted.some(
      (p: { recordType: string; accessType: string }) =>
        p.recordType === 'Distance' && p.accessType === 'read'
    );
    if (!hasPerm) {
      return { available: true, permission: 'not_determined', value: null };
    }

    const start = startOfDay(date);
    const end = endOfDay(date);
    console.log('[healthKit] Android querying distance for', start.toISOString(), '→', end.toISOString());

    const result = await readRecords('Distance', {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });

    const records = result?.records ?? [];
    const totalMeters = records.reduce(
      (sum: number, r: { distance?: { inMeters?: number } }) =>
        sum + (r.distance?.inMeters ?? 0),
      0
    );
    const miles = sanitizeMetric(totalMeters / METERS_PER_MILE);
    console.log('[healthKit] Android distance:', miles, 'miles (', totalMeters, 'm,', records.length, 'records)');
    return { available: true, permission: 'granted', value: miles };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] Android getDistanceMilesForDate error:', msg);
    return { available: true, permission: 'not_determined', value: null, error: msg };
  }
}

async function android_getFlightsClimbedForDate(date: Date): Promise<MetricResult> {
  try {
    const { initialize, getGrantedPermissions, readRecords } = await import(
      'react-native-health-connect'
    );

    const initialized = await initialize();
    if (!initialized) return { available: false, permission: 'denied', value: null };

    const granted = await getGrantedPermissions();
    const hasPerm = granted.some(
      (p: { recordType: string; accessType: string }) =>
        p.recordType === 'FloorsClimbed' && p.accessType === 'read'
    );
    if (!hasPerm) {
      return { available: true, permission: 'not_determined', value: null };
    }

    const start = startOfDay(date);
    const end = endOfDay(date);
    console.log('[healthKit] Android querying floors climbed for', start.toISOString(), '→', end.toISOString());

    const result = await readRecords('FloorsClimbed', {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });

    const records = result?.records ?? [];
    const total = records.reduce(
      (sum: number, r: { floors?: number }) => sum + (r.floors ?? 0),
      0
    );
    const value = sanitizeMetric(total);
    console.log('[healthKit] Android floors climbed:', value, '(', records.length, 'records)');
    return { available: true, permission: 'granted', value };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] Android getFlightsClimbedForDate error:', msg);
    return { available: true, permission: 'not_determined', value: null, error: msg };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the health data provider once at app start (or on demand).
 * Safe to call multiple times — subsequent calls are cheap.
 */
export async function initializeHealthData(): Promise<{ available: boolean }> {
  if (MOCK_METRICS !== null) {
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
  if (MOCK_METRICS !== null) {
    console.log('[healthKit] MOCK MODE — requestStepsPermission returning granted');
    return 'granted';
  }
  console.log('[healthKit] requestStepsPermission, platform:', Platform.OS);
  if (Platform.OS === 'ios') return ios_requestPermission();
  if (Platform.OS === 'android') return android_requestPermission();
  return 'denied';
}

/**
 * Request read permission for ALL health metrics in one shot.
 * Shows the OS permission dialog covering all identifiers.
 * Safe to call multiple times.
 */
export async function requestAllHealthPermissions(): Promise<PermissionStatus> {
  if (MOCK_METRICS !== null) {
    console.log('[healthKit] MOCK MODE — requestAllHealthPermissions returning granted');
    return 'granted';
  }
  console.log('[healthKit] requestAllHealthPermissions, platform:', Platform.OS);
  if (Platform.OS === 'ios') return ios_requestAllPermissions();
  if (Platform.OS === 'android') return android_requestAllPermissions();
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

/**
 * Read active calories burned for a specific date.
 * iOS: HKQuantityTypeIdentifierActiveEnergyBurned
 * Android: ActiveCaloriesBurned
 */
export async function getActiveCaloriesForDate(date: Date): Promise<MetricResult> {
  if (MOCK_METRICS !== null) {
    const value = MOCK_METRICS.activeCalories;
    console.log('[healthKit] MOCK MODE — active calories:', value);
    return { available: true, permission: 'granted', value };
  }
  console.log('[healthKit] getActiveCaloriesForDate:', date.toISOString());
  if (Platform.OS === 'ios') return ios_getActiveCaloriesForDate(date);
  if (Platform.OS === 'android') return android_getActiveCaloriesForDate(date);
  return WEB_METRIC_UNAVAILABLE;
}

/**
 * Read Apple Exercise Time (Move ring minutes) for a specific date.
 * iOS only — Android returns available: false (no equivalent in Health Connect).
 * iOS: HKQuantityTypeIdentifierAppleExerciseTime
 */
export async function getExerciseMinutesForDate(date: Date): Promise<MetricResult> {
  if (MOCK_METRICS !== null) {
    const value = MOCK_METRICS.exerciseMinutes;
    console.log('[healthKit] MOCK MODE — exercise minutes:', value);
    return { available: true, permission: 'granted', value };
  }
  console.log('[healthKit] getExerciseMinutesForDate:', date.toISOString());
  if (Platform.OS === 'ios') return ios_getExerciseMinutesForDate(date);
  // Android: no equivalent for Apple Exercise Time
  console.log('[healthKit] getExerciseMinutesForDate: not available on Android');
  return { available: false, permission: 'denied', value: null };
}

/**
 * Read walking + running distance for a specific date, converted to miles.
 * iOS: HKQuantityTypeIdentifierDistanceWalkingRunning (meters → miles)
 * Android: Distance (meters → miles)
 */
export async function getDistanceMilesForDate(date: Date): Promise<MetricResult> {
  if (MOCK_METRICS !== null) {
    const value = MOCK_METRICS.distanceMiles;
    console.log('[healthKit] MOCK MODE — distance miles:', value);
    return { available: true, permission: 'granted', value };
  }
  console.log('[healthKit] getDistanceMilesForDate:', date.toISOString());
  if (Platform.OS === 'ios') return ios_getDistanceMilesForDate(date);
  if (Platform.OS === 'android') return android_getDistanceMilesForDate(date);
  return WEB_METRIC_UNAVAILABLE;
}

/**
 * Read stand hours for a specific date.
 * iOS only — counts hours where the user stood (HKCategoryTypeIdentifierAppleStandHour).
 * Android returns available: false.
 */
export async function getStandHoursForDate(date: Date): Promise<MetricResult> {
  if (MOCK_METRICS !== null) {
    const value = MOCK_METRICS.standHours;
    console.log('[healthKit] MOCK MODE — stand hours:', value);
    return { available: true, permission: 'granted', value };
  }
  console.log('[healthKit] getStandHoursForDate:', date.toISOString());
  if (Platform.OS === 'ios') return ios_getStandHoursForDate(date);
  // Android: no equivalent for Apple Stand Hour
  console.log('[healthKit] getStandHoursForDate: not available on Android');
  return { available: false, permission: 'denied', value: null };
}

/**
 * Read flights of stairs climbed for a specific date.
 * iOS: HKQuantityTypeIdentifierFlightsClimbed
 * Android: FloorsClimbed
 */
export async function getFlightsClimbedForDate(date: Date): Promise<MetricResult> {
  if (MOCK_METRICS !== null) {
    const value = MOCK_METRICS.flightsClimbed;
    console.log('[healthKit] MOCK MODE — flights climbed:', value);
    return { available: true, permission: 'granted', value };
  }
  console.log('[healthKit] getFlightsClimbedForDate:', date.toISOString());
  if (Platform.OS === 'ios') return ios_getFlightsClimbedForDate(date);
  if (Platform.OS === 'android') return android_getFlightsClimbedForDate(date);
  return WEB_METRIC_UNAVAILABLE;
}

/**
 * Read all daily health metrics in parallel.
 * Returns nulls for metrics that are unavailable or lack permission.
 * Never throws — all errors are caught internally.
 */
export async function getAllDailyMetrics(date: Date): Promise<DailyHealthMetrics> {
  if (MOCK_METRICS !== null) {
    console.log('[healthKit] MOCK MODE — getAllDailyMetrics returning mock data');
    return MOCK_METRICS;
  }

  console.log('[healthKit] getAllDailyMetrics for', date.toISOString());

  const [stepsResult, caloriesResult, exerciseResult, distanceResult, standResult, flightsResult] =
    await Promise.all([
      getStepsForDate(date).catch((e) => {
        console.warn('[healthKit] getAllDailyMetrics steps error:', e);
        return { available: false, permission: 'denied' as PermissionStatus, steps: null };
      }),
      getActiveCaloriesForDate(date).catch((e) => {
        console.warn('[healthKit] getAllDailyMetrics calories error:', e);
        return { available: false, permission: 'denied' as PermissionStatus, value: null };
      }),
      getExerciseMinutesForDate(date).catch((e) => {
        console.warn('[healthKit] getAllDailyMetrics exercise error:', e);
        return { available: false, permission: 'denied' as PermissionStatus, value: null };
      }),
      getDistanceMilesForDate(date).catch((e) => {
        console.warn('[healthKit] getAllDailyMetrics distance error:', e);
        return { available: false, permission: 'denied' as PermissionStatus, value: null };
      }),
      getStandHoursForDate(date).catch((e) => {
        console.warn('[healthKit] getAllDailyMetrics stand error:', e);
        return { available: false, permission: 'denied' as PermissionStatus, value: null };
      }),
      getFlightsClimbedForDate(date).catch((e) => {
        console.warn('[healthKit] getAllDailyMetrics flights error:', e);
        return { available: false, permission: 'denied' as PermissionStatus, value: null };
      }),
    ]);

  const metrics: DailyHealthMetrics = {
    steps: stepsResult.permission === 'granted' ? (stepsResult.steps ?? null) : null,
    activeCalories: caloriesResult.permission === 'granted' ? (caloriesResult.value ?? null) : null,
    exerciseMinutes: exerciseResult.permission === 'granted' ? (exerciseResult.value ?? null) : null,
    distanceMiles: distanceResult.permission === 'granted' ? (distanceResult.value ?? null) : null,
    standHours: standResult.permission === 'granted' ? (standResult.value ?? null) : null,
    flightsClimbed: flightsResult.permission === 'granted' ? (flightsResult.value ?? null) : null,
  };

  console.log('[healthKit] getAllDailyMetrics result:', metrics);
  return metrics;
}

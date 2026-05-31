/**
 * Health Data Wrapper — platform-agnostic step count reader
 *
 * iOS:     @kingstinct/react-native-healthkit (Nitro Modules, SDK 54 compatible)
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
    const { requestAuthorization, getRequestStatusForAuthorization } =
      await import('@kingstinct/react-native-healthkit');

    // Check if we already have authorization
    const status = await getRequestStatusForAuthorization({
      toRead: ['HKQuantityTypeIdentifierStepCount'],
    });
    console.log('[healthKit] iOS getRequestStatusForAuthorization:', status);

    if (status === 'unnecessary') {
      return 'granted';
    }

    // Request authorization — shows the system dialog
    console.log('[healthKit] iOS requesting HealthKit authorization');
    await requestAuthorization({
      toRead: ['HKQuantityTypeIdentifierStepCount'],
    });

    // Re-check after request
    const statusAfter = await getRequestStatusForAuthorization({
      toRead: ['HKQuantityTypeIdentifierStepCount'],
    });
    console.log('[healthKit] iOS status after request:', statusAfter);

    // HealthKit never tells you if the user denied — 'shouldRequest' after
    // requesting means denied or restricted; 'unnecessary' means granted.
    if (statusAfter === 'unnecessary') return 'granted';
    if (statusAfter === 'shouldRequest') return 'denied';
    return 'not_determined';
  } catch (e) {
    console.warn('[healthKit] iOS requestPermission error:', e);
    return 'not_determined';
  }
}

async function ios_getStepsForDate(date: Date): Promise<StepsResult> {
  try {
    const { isHealthDataAvailable, queryQuantitySamples, getRequestStatusForAuthorization } =
      await import('@kingstinct/react-native-healthkit');

    if (!isHealthDataAvailable()) {
      return { available: false, permission: 'denied', steps: null };
    }

    // Determine permission status
    const status = await getRequestStatusForAuthorization({
      toRead: ['HKQuantityTypeIdentifierStepCount'],
    });
    const permission: PermissionStatus =
      status === 'unnecessary' ? 'granted' : 'not_determined';

    if (permission !== 'granted') {
      console.log('[healthKit] iOS steps: no permission, status:', status);
      return { available: true, permission, steps: null };
    }

    const start = startOfDay(date);
    const end = endOfDay(date);

    console.log('[healthKit] iOS querying steps for', start.toISOString(), '→', end.toISOString());

    const samples = await queryQuantitySamples(
      'HKQuantityTypeIdentifierStepCount',
      {
        limit: 0, // 0 = no limit — get all samples for the day
        unit: 'count',
        filter: {
          date: { startDate: start, endDate: end },
        },
      }
    );

    const total = samples.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
    const steps = sanitizeSteps(total);
    console.log('[healthKit] iOS steps total:', steps, '(', samples.length, 'samples)');

    return { available: true, permission: 'granted', steps };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[healthKit] iOS getStepsForDate error:', msg);
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

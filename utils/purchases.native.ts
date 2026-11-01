// Native RevenueCat identity has one owner and one serialized operation queue.
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase/client';

export default Purchases;
export { LOG_LEVEL };
export const isPurchasesAvailable = true;

let configured = false;
let owner: string | null = null;
let generation = 0;
let authRevision = 0;
let tail: Promise<unknown> = Promise.resolve();

function acceptOwner(next: string | null) {
  if (next !== owner) { owner = next; generation += 1; }
}
// Synchronous invalidation; never await Supabase inside its auth callback.
// Process-lifetime subscription, owned by this singleton rather than a component.
supabase.auth.onAuthStateChange((_event, session) => {
  authRevision += 1;
  acceptOwner(session?.user?.id ?? null);
});

export type RevenueCatLease = Readonly<{ userId: string; generation: number }>;
export function revenueCatLeaseCurrent(lease: RevenueCatLease): boolean {
  return owner === lease.userId && generation === lease.generation;
}
function requireCurrent(lease: RevenueCatLease) {
  if (!revenueCatLeaseCurrent(lease)) throw new Error('RC_ACCOUNT_CHANGED');
}
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work, work);
  // A failed operation cannot poison the queue. A pending SDK operation retains
  // the lock: a caller timeout must never permit a competing identity mutation.
  tail = result.then(() => undefined, () => undefined);
  return result;
}

/** Capture auth before enqueue, validate again before/after every SDK boundary. */
export async function withRevenueCatUser<T>(userId: string, work: (sdk: typeof Purchases, lease: RevenueCatLease) => Promise<T>, apiKeyOverride?: string): Promise<T> {
  const revision = authRevision;
  const { data, error } = await supabase.auth.getSession();
  if (error || !userId || data.session?.user.id !== userId) throw new Error('RC_AUTH_REQUIRED');
  if (revision === authRevision) acceptOwner(userId);
  if (owner !== userId) throw new Error('RC_ACCOUNT_CHANGED');
  const lease = Object.freeze({ userId, generation });
  return serialize(async () => {
    requireCurrent(lease);
    const config = Constants.expoConfig?.extra?.revenueCat;
    const apiKey = apiKeyOverride ?? Platform.select({ ios: config?.iosApiKey, android: config?.androidApiKey });
    if (!apiKey || apiKey.includes('YOUR')) throw new Error('RC_CONFIGURATION_UNAVAILABLE');
    if (!configured) {
      Purchases.configure({ apiKey, appUserID: userId });
      configured = true;
    }
    requireCurrent(lease);
    if (await Purchases.getAppUserID() !== userId) {
      requireCurrent(lease);
      await Purchases.logIn(userId);
    }
    requireCurrent(lease);
    if (await Purchases.getAppUserID() !== userId) throw new Error('RC_IDENTITY_MISMATCH');
    requireCurrent(lease);
    const value = await work(Purchases, lease);
    requireCurrent(lease);
    if (await Purchases.getAppUserID() !== userId) throw new Error('RC_IDENTITY_MISMATCH');
    requireCurrent(lease);
    return value;
  });
}

export async function loginRevenueCat(userId: string, apiKey: string, opts?: { email?: string }): Promise<void> {
  await withRevenueCatUser(userId, async (sdk, lease) => {
    if (opts?.email) {
      try { await sdk.setEmail(opts.email); } catch { /* attributes are non-fatal */ }
      requireCurrent(lease);
    }
    if (Platform.OS === 'ios') {
      sdk.enableAdServicesAttributionTokenCollection().catch(() => {});
    }
  }, apiKey);
}

/** A delayed sign-out must never log out a subsequently signed-in account. */
export async function logoutRevenueCat(): Promise<void> {
  const revision = authRevision;
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session) return;
  if (revision === authRevision) acceptOwner(null);
  const expectedGeneration = generation;
  await serialize(async () => {
    if (owner !== null || generation !== expectedGeneration || !configured) return;
    // logOut is rejected by the SDK when it is already anonymous.
    if (!(await Purchases.isAnonymous())) {
      if (owner !== null || generation !== expectedGeneration) return;
      await Purchases.logOut();
    }
  });
}

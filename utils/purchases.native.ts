// utils/purchases.native.ts
// On native (iOS/Android), use the real react-native-purchases SDK.
// Metro resolves '@/utils/purchases' → this file via the .native.ts extension.
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

export default Purchases;
export { LOG_LEVEL };
export const isPurchasesAvailable = true;

let isConfigured = false;
let currentAppUserID: string | null = null;

/**
 * Configure RevenueCat AND identify the user atomically.
 * - If not yet configured, calls `Purchases.configure({ apiKey, appUserID: userId })` so RevenueCat NEVER receives an anonymous ID for an authenticated user.
 * - If already configured under a different appUserID, calls `Purchases.logIn(userId)`.
 * - If already configured under the same appUserID, no-op.
 *
 * Safe to call repeatedly; subsequent calls reconcile state.
 */
export async function loginRevenueCat(userId: string, apiKey: string, opts?: { email?: string }): Promise<void> {
  try {
    if (!userId) {
      console.warn('[RC] loginRevenueCat called with empty userId — skipping');
      return;
    }
    if (!apiKey || apiKey.includes('YOUR')) {
      console.warn('[RC] loginRevenueCat called with invalid apiKey — skipping');
      return;
    }

    if (!isConfigured) {
      console.log('[RC] Configuring with appUserID:', userId);
      await Purchases.configure({ apiKey, appUserID: userId });
      isConfigured = true;
      currentAppUserID = userId;
    } else if (currentAppUserID !== userId) {
      console.log('[RC] Logging in (was:', currentAppUserID, '→ now:', userId, ')');
      const { customerInfo } = await Purchases.logIn(userId);
      currentAppUserID = userId;
      console.log('[RC] Active entitlements after logIn:', Object.keys(customerInfo.entitlements.active));
    } else {
      console.log('[RC] Already configured for user', userId, '— no-op');
    }

    if (opts?.email) {
      try { await Purchases.setEmail(opts.email); } catch (_) { /* non-fatal */ }
    }
  } catch (e) {
    console.warn('[RC] loginRevenueCat failed:', e);
  }
}

/**
 * Log the user out of RevenueCat. Safe to call when not configured (no-op).
 */
export async function logoutRevenueCat(): Promise<void> {
  try {
    if (!isConfigured || !currentAppUserID) {
      console.log('[RC] logoutRevenueCat — not configured, skipping');
      return;
    }
    console.log('[RC] Logging out current user:', currentAppUserID);
    await Purchases.logOut();
    currentAppUserID = null;
  } catch (e) {
    console.warn('[RC] logoutRevenueCat failed:', e);
  }
}

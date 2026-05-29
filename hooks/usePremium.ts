
import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase/client';
import Purchases, { isPurchasesAvailable } from '@/utils/purchases';

function loadPurchases(): any {
  return isPurchasesAvailable ? Purchases : null;
}
// Use `any` for CustomerInfo so we don't import the type from the native module
type CustomerInfo = any;

interface UsePremiumReturn {
  isPremium: boolean;
  loading: boolean;
  error: string | null;
  checkPremiumStatus: () => Promise<void>;
  refreshPremiumStatus: () => Promise<void>;
  customerInfo: CustomerInfo | null;
  expirationDate: string | null;
}

/**
 * Hook to check if the current user has an active premium subscription
 *
 * This hook uses RevenueCat as the primary source of truth for premium status,
 * with Supabase as a fallback for offline scenarios.
 *
 * Architecture:
 * 1. Primary: Check RevenueCat entitlements (real-time, authoritative)
 * 2. Fallback: Check Supabase users.user_type (derived state, synced via webhook)
 *
 * The hook re-checks on every SIGNED_IN auth event so that after a sign-out/sign-in
 * cycle the correct entitlements for the newly-identified RevenueCat user are loaded
 * immediately, without requiring the user to trigger a purchase or restore flow.
 *
 * @returns {UsePremiumReturn} Premium status, loading state, customer info, and refresh function
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isPremium, loading, expirationDate } = usePremium();
 *
 *   if (loading) return <ActivityIndicator />;
 *
 *   return (
 *     <View>
 *       {isPremium ? (
 *         <>
 *           <Text>Premium Feature</Text>
 *           {expirationDate && <Text>Expires: {expirationDate}</Text>}
 *         </>
 *       ) : (
 *         <Button title="Upgrade to Premium" onPress={() => router.push('/subscription')} />
 *       )}
 *     </View>
 *   );
 * }
 * ```
 */
export function usePremium(): UsePremiumReturn {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);

  // Track in-flight check to avoid concurrent duplicate calls
  const checkInProgress = useRef(false);

  const checkPremiumStatus = useCallback(async (force = false) => {
    if (!force && checkInProgress.current) {
      console.log('[usePremium] Check already in progress, skipping duplicate call');
      return;
    }
    checkInProgress.current = true;

    const Purchases = loadPurchases();

    try {
      console.log('[usePremium] ========== CHECKING PREMIUM STATUS ==========');
      setLoading(true);
      setError(null);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[usePremium] No user found');
        setIsPremium(false);
        setLoading(false);
        return;
      }

      console.log('[usePremium] User ID:', user.id);

      // On native platforms, check RevenueCat first (primary source of truth).
      // We retry once with a short delay to handle the case where RevenueCat
      // was just initialized (e.g. right after a SIGNED_IN event) and the SDK
      // hasn't fully identified the user yet.
      if (Platform.OS !== 'web' && Purchases) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`[usePremium] 🔍 Checking RevenueCat entitlements (attempt ${attempt})...`);

            // Wrap getCustomerInfo in a 5s timeout so a slow/uninitialized
            // RevenueCat never blocks the tab layout from rendering.
            const rcTimeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('RevenueCat getCustomerInfo timed out')), 5000)
            );
            const info = await Promise.race([Purchases.getCustomerInfo(), rcTimeout]);
            setCustomerInfo(info);

            console.log('[usePremium] RevenueCat Customer Info:');
            console.log('[usePremium] - Original App User ID:', info.originalAppUserId);
            console.log('[usePremium] - Active Entitlements:', Object.keys(info.entitlements.active));
            console.log('[usePremium] - All Entitlements:', Object.keys(info.entitlements.all));

            // If RevenueCat still has an anonymous user ID but we have a real
            // session, it means the SDK hasn't been identified yet (race with
            // _layout.tsx init). Log in now so we get the right entitlements.
            const isAnonymousUser = info.originalAppUserId.startsWith('$RCAnonymousID:');
            if (isAnonymousUser && user.id) {
              console.log('[usePremium] ⚠️ RevenueCat still anonymous, logging in user:', user.id);
              try {
                const { customerInfo: identifiedInfo } = await Purchases.logIn(user.id);
                console.log('[usePremium] ✅ RevenueCat user identified from hook:', user.id);
                console.log('[usePremium] Active entitlements after login:', Object.keys(identifiedInfo.entitlements.active));

                const premiumEntitlementAfterLogin =
                  identifiedInfo.entitlements.active['pro'] ||
                  identifiedInfo.entitlements.active['Macrogoal Pro'] ||
                  identifiedInfo.entitlements.active['macrogoal_pro'] ||
                  identifiedInfo.entitlements.active['premium'];
                const hasActiveAfterLogin = premiumEntitlementAfterLogin?.isActive || false;

                // If the just-logged-in customer info still has zero active entitlements
                // AND we have more attempts left, retry — RevenueCat sometimes needs a
                // moment after logIn to populate entitlements from the server.
                if (!hasActiveAfterLogin && Object.keys(identifiedInfo.entitlements.all).length === 0 && attempt < 3) {
                  console.log(`[usePremium] logIn returned empty entitlements, retrying (attempt ${attempt}/3)`);
                  await new Promise(resolve => setTimeout(resolve, 1500));
                  continue;
                }

                setCustomerInfo(identifiedInfo);
                setIsPremium(hasActiveAfterLogin);
                if (premiumEntitlementAfterLogin?.expirationDate) {
                  setExpirationDate(premiumEntitlementAfterLogin.expirationDate);
                }
                console.log('[usePremium] ✅ Premium status after login:', hasActiveAfterLogin);
                console.log('[usePremium] ========== PREMIUM STATUS CHECK COMPLETE ==========');
                return;
              } catch (loginErr) {
                console.warn('[usePremium] ⚠️ Could not log in to RevenueCat from hook:', loginErr);
                if (attempt < 3) {
                  console.log(`[usePremium] Retrying after logIn failure (attempt ${attempt}/3)`);
                  await new Promise(resolve => setTimeout(resolve, 1500));
                  continue;
                }
                // Final attempt — fall through to use the anonymous info we already have
              }
            }

            // Check for premium entitlement — try both possible keys used in the RevenueCat dashboard
            const premiumEntitlement =
              info.entitlements.active['pro'] ||
              info.entitlements.active['Macrogoal Pro'] ||
              info.entitlements.active['macrogoal_pro'] ||
              info.entitlements.active['premium'];
            const hasActiveEntitlement = premiumEntitlement?.isActive || false;

            console.log('[usePremium] Premium Entitlement Details:');
            console.log('[usePremium] - Is Active:', hasActiveEntitlement);
            console.log('[usePremium] - Matched entitlement key:', premiumEntitlement ? 'found' : 'none (checked: pro, Macrogoal Pro, macrogoal_pro, premium)');
            console.log('[usePremium] - Product Identifier:', premiumEntitlement?.productIdentifier);
            console.log('[usePremium] - Will Renew:', premiumEntitlement?.willRenew);
            console.log('[usePremium] - Period Type:', premiumEntitlement?.periodType);

            if (premiumEntitlement?.expirationDate) {
              setExpirationDate(premiumEntitlement.expirationDate);
              console.log('[usePremium] - Expiration Date:', premiumEntitlement.expirationDate);
            }

            console.log('[usePremium] ✅ RevenueCat premium status:', hasActiveEntitlement);
            setIsPremium(hasActiveEntitlement);
            setLoading(false);
            console.log('[usePremium] ========== PREMIUM STATUS CHECK COMPLETE ==========');
            return;
          } catch (revenueCatError) {
            if (attempt < 3) {
              console.warn(`[usePremium] ⚠️ RevenueCat attempt ${attempt} failed, retrying in 1.5s:`, revenueCatError);
              await new Promise(resolve => setTimeout(resolve, 1500));
            } else {
              console.warn('[usePremium] ⚠️ RevenueCat check failed after 3 attempts, falling back to Supabase:', revenueCatError);
            }
          }
        }
      }

      // Fallback: Check Supabase for premium status (derived state)
      console.log('[usePremium] 🔍 Checking Supabase for premium status...');
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('user_type')
        .eq('id', user.id)
        .single();

      if (fetchError) {
        console.error('[usePremium] ❌ Error fetching user data:', fetchError);
        throw fetchError;
      }

      const userIsPremium = userData?.user_type === 'premium';
      console.log('[usePremium] ✅ Supabase premium status:', userIsPremium);
      setIsPremium(userIsPremium);

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check premium status';
      console.error('[usePremium] ❌ Error checking premium status:', err);
      setError(errorMessage);
      setIsPremium(false);
    } finally {
      setLoading(false);
      checkInProgress.current = false;
      console.log('[usePremium] ========== PREMIUM STATUS CHECK COMPLETE ==========');
    }
  }, []);

  const refreshPremiumStatus = useCallback(async () => {
    console.log('[usePremium] 🔄 Manually refreshing premium status (forced)');
    await checkPremiumStatus(true);
  }, [checkPremiumStatus]);

  useEffect(() => {
    console.log('[usePremium] Hook mounted, starting initial check');
    checkPremiumStatus();

    const Purchases = loadPurchases();

    // Set up RevenueCat listener for real-time updates (native only).
    // This fires when a purchase completes or when RevenueCat pushes an update.
    if (Platform.OS !== 'web' && Purchases) {
      console.log('[usePremium] Setting up RevenueCat customer info listener');
      Purchases.addCustomerInfoUpdateListener((info) => {
        console.log('[usePremium] 🔔 RevenueCat customer info updated via listener');
        console.log('[usePremium] - Original App User ID:', info.originalAppUserId);
        console.log('[usePremium] - Active Entitlements:', Object.keys(info.entitlements.active));

        setCustomerInfo(info);
        const premiumEntitlement =
          info.entitlements.active['pro'] ||
          info.entitlements.active['Macrogoal Pro'] ||
          info.entitlements.active['macrogoal_pro'] ||
          info.entitlements.active['premium'];
        const hasActiveEntitlement = premiumEntitlement?.isActive || false;

        console.log('[usePremium] - Premium Status:', hasActiveEntitlement);
        setIsPremium(hasActiveEntitlement);

        if (premiumEntitlement?.expirationDate) {
          setExpirationDate(premiumEntitlement.expirationDate);
        }
      });
    }

    // Subscribe to Supabase auth state changes.
    // On SIGNED_IN (including after sign-out → sign-in), re-check premium status
    // so the Profile tab reflects the correct entitlements for the newly-logged-in
    // user without requiring a purchase or restore flow.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.id) {
        console.log('[usePremium] 🔐 SIGNED_IN event detected, refreshing premium status for user:', session.user.id);
        // Small delay to allow _layout.tsx to complete Purchases.logIn() first,
        // so getCustomerInfo() returns entitlements for the identified user.
        setTimeout(() => {
          console.log('[usePremium] ⏱️ Running post-login premium check');
          checkPremiumStatus();
        }, 1500);
      } else if (event === 'INITIAL_SESSION' && session?.user?.id) {
        console.log('[usePremium] 🔐 INITIAL_SESSION event detected, scheduling delayed premium check for user:', session.user.id);
        // Wait longer than SIGNED_IN because on cold start RevenueCat is still
        // initializing in parallel from _layout.tsx. We need to give configure()
        // and logIn() time to complete before we ask for customer info.
        setTimeout(() => {
          console.log('[usePremium] ⏱️ Running cold-start premium re-check');
          checkPremiumStatus(true); // force = true to bypass the in-progress guard
        }, 2500);
      } else if (event === 'SIGNED_OUT') {
        console.log('[usePremium] 🚪 SIGNED_OUT event detected, resetting premium status');
        setIsPremium(false);
        setCustomerInfo(null);
        setExpirationDate(null);
        setError(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkPremiumStatus]);

  return {
    isPremium,
    loading,
    error,
    checkPremiumStatus,
    refreshPremiumStatus,
    customerInfo,
    expirationDate,
  };
}

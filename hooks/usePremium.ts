import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase/client';
import Purchases, { isPurchasesAvailable, withRevenueCatUser } from '@/utils/purchases';
import { premiumEntitlement, premiumFallbackState } from '@/utils/premiumEntitlement';
import { syncPremiumMembership } from '@/utils/premiumSync';
import { usePremiumAuthorityShadow } from '@/hooks/usePremiumAuthorityShadow';

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

// Bound waiting at the consumer, never release the SDK identity lock on timeout.
async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('RC_STATUS_TIMEOUT')), 5000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** Same public gate contract; unknown is an error, not a subscription revocation. */
export function usePremium(): UsePremiumReturn {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const mounted = useRef(false);
  const knownPremium = useRef(false);
  const owner = useRef<string | null | undefined>(undefined);
  const request = useRef(0);
  const inFlight = useRef<number | null>(null);
  const followUp = useRef(false);
  const syncRequested = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Web-only shadow observation. Never feeds existing access, SDK or profile states.
  usePremiumAuthorityShadow(owner.current ?? null, Platform.OS === 'web');

  const reset = useCallback(() => {
    knownPremium.current = false;
    setIsPremium(false); setCustomerInfo(null); setExpirationDate(null); setError(null);
  }, []);

  const checkPremiumStatus = useCallback(async (force = false): Promise<void> => {
    if (!mounted.current) return;
    if (!force && inFlight.current !== null) { followUp.current = true; return; }
    const ticket = ++request.current;
    inFlight.current = ticket;
    const current = () => mounted.current && request.current === ticket;
    setLoading(true);
    setError(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!current()) return;
      if (sessionError) throw sessionError;
      const userId = data.session?.user.id ?? null;
      if (owner.current !== userId) { owner.current = userId; reset(); }
      if (!userId) return;

      if (Platform.OS !== 'web' && isPurchasesAvailable) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const info: CustomerInfo = await bounded(withRevenueCatUser(userId, sdk => sdk.getCustomerInfo()));
            if (!current() || owner.current !== userId) return;
            const entitlement = premiumEntitlement(info);
            // Preserve the existing short retry for an empty just-identified SDK response.
            if (!entitlement && Object.keys(info.entitlements.all).length === 0 && attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 1500));
              if (!current()) return;
              continue;
            }
            if (entitlement && syncRequested.current) {
              syncRequested.current = false;
              // Only a fresh identified read may trigger the existing server sync.
              void syncPremiumMembership();
            }
            setCustomerInfo(info);
            knownPremium.current = !!entitlement;
            setIsPremium(!!entitlement);
            setExpirationDate(entitlement?.expirationDate ?? null);
            return;
          } catch {
            if (!current() || owner.current !== userId) return;
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 1500));
              if (!current()) return;
            }
          }
        }
      }

      const { data: profile, error: profileError } = await supabase.from('users')
        .select('user_type').eq('id', userId).single();
      if (!current() || owner.current !== userId) return;
      if (profileError || !profile) throw new Error('PREMIUM_STATUS_UNAVAILABLE');
      const fallbackPremium = profile.user_type === 'premium';
      if (Platform.OS === 'web') {
        knownPremium.current = fallbackPremium;
        setIsPremium(fallbackPremium);
      } else {
        // A stale negative mirror after SDK/network failure must not revoke a
        // known paid session. A successful identified SDK response can revoke.
        const fallback = premiumFallbackState(knownPremium.current, fallbackPremium);
        knownPremium.current = fallback.isPremium;
        setIsPremium(fallback.isPremium);
        setError(fallback.error);
        console.warn('[usePremium] RC_STATUS_FALLBACK');
      }
    } catch {
      if (current()) {
        const fallback = premiumFallbackState(knownPremium.current);
        setIsPremium(fallback.isPremium);
        setError(fallback.error);
        console.warn('[usePremium] PREMIUM_STATUS_UNAVAILABLE');
      }
      // Keep same-account state on transient failure. Account changes reset above.
    } finally {
      if (current()) {
        setLoading(false);
        inFlight.current = null;
        if (followUp.current) {
          followUp.current = false;
          retryTimer.current = setTimeout(() => { void checkPremiumStatus(); }, 0);
        }
      }
    }
  }, [reset]);

  const refreshPremiumStatus = useCallback(async () => {
    await checkPremiumStatus(true);
  }, [checkPremiumStatus]);

  useEffect(() => {
    mounted.current = true;
    const schedule = () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => { void checkPremiumStatus(); }, 0);
    };
    // Treat SDK callbacks only as invalidation hints. Their payload may belong
    // to an old account; re-read through the identity coordinator instead.
    const onInfo = () => {
      if (!mounted.current || !owner.current) return;
      syncRequested.current = true;
      schedule();
    };
    if (Platform.OS !== 'web' && isPurchasesAvailable) Purchases.addCustomerInfoUpdateListener(onInfo);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted.current) return;
      const next = session?.user.id ?? null;
      if (next !== owner.current) {
        owner.current = next;
        request.current += 1;
        inFlight.current = null;
        followUp.current = false;
        syncRequested.current = false;
        reset();
        setLoading(!!next);
        if (next) schedule();
      } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') schedule();
    });
    void checkPremiumStatus();
    return () => {
      mounted.current = false;
      request.current += 1;
      inFlight.current = null;
      followUp.current = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      subscription.unsubscribe();
      if (Platform.OS !== 'web' && isPurchasesAvailable) Purchases.removeCustomerInfoUpdateListener(onInfo);
    };
  }, [checkPremiumStatus, reset]);

  return { isPremium, loading, error, checkPremiumStatus, refreshPremiumStatus, customerInfo, expirationDate };
}

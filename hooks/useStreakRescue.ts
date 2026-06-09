import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import Purchases, { isPurchasesAvailable } from '@/utils/purchases';

// Product IDs for streak rescue consumables
const PRODUCT_1_TO_6 = '1to6_Streak_Recover';
const PRODUCT_7_TO_29 = '7to29_Streak_Recover';
const PRODUCT_30_PLUS = '30_Streak_Recover';

function getProductForStreak(streakValue: number): { productId: string; priceLabel: string } | null {
  if (streakValue <= 0) return null;
  if (streakValue <= 6) return { productId: PRODUCT_1_TO_6, priceLabel: '$0.99' };
  if (streakValue <= 29) return { productId: PRODUCT_7_TO_29, priceLabel: '$1.99' };
  return { productId: PRODUCT_30_PLUS, priceLabel: '$2.99' };
}

export interface UseStreakRescueReturn {
  canRescue: boolean;
  lostStreakValue: number;
  productId: string | null;
  priceLabel: string;
  loading: boolean;
  purchasing: boolean;
  executePurchase: () => Promise<{ success: boolean; error?: string }>;
  dismissRescue: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useStreakRescue(): UseStreakRescueReturn {
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [lostStreakValue, setLostStreakValue] = useState(0);
  const [streakRescueUsed, setStreakRescueUsed] = useState(false);

  const fetchRescueState = useCallback(async () => {
    console.log('[useStreakRescue] Fetching rescue state');
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        console.warn('[useStreakRescue] No authenticated user');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('last_streak_value, last_streak_lost_at, streak_rescue_used')
        .eq('id', user.id)
        .single();

      if (error) {
        console.warn('[useStreakRescue] Error fetching user row:', error.message);
        setLoading(false);
        return;
      }

      const lastVal: number = data?.last_streak_value ?? 0;
      const rescueUsed: boolean = data?.streak_rescue_used ?? false;

      console.log('[useStreakRescue] State — last_streak_value:', lastVal, 'streak_rescue_used:', rescueUsed);
      setLostStreakValue(lastVal);
      setStreakRescueUsed(rescueUsed);
    } catch (e: any) {
      console.warn('[useStreakRescue] fetchRescueState error:', e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRescueState();
  }, [fetchRescueState]);

  // canRescue: true when there's a lost streak value and user hasn't dismissed/paid yet
  const canRescue = lostStreakValue > 0 && !streakRescueUsed;

  const productInfo = getProductForStreak(lostStreakValue);
  const productId = productInfo?.productId ?? null;
  const priceLabel = productInfo?.priceLabel ?? '';

  const executePurchase = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    console.log('[useStreakRescue] executePurchase called, productId:', productId);

    if (!isPurchasesAvailable) {
      console.log('[useStreakRescue] Purchases not available on this platform');
      return { success: false, error: 'Not available on web' };
    }

    if (!productId) {
      console.warn('[useStreakRescue] No productId available');
      return { success: false, error: 'No product available' };
    }

    setPurchasing(true);
    try {
      console.log('[useStreakRescue] Calling Purchases.purchaseProduct:', productId);
      await (Purchases as any).purchaseProduct(productId, null, 'CONSUMABLE');
      console.log('[useStreakRescue] Purchase successful for product:', productId);

      // Mark rescue as used — keep last_streak_value so getStats can add it to streak
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: updateErr } = await supabase
          .from('users')
          .update({ streak_rescue_used: true })
          .eq('id', user.id);
        if (updateErr) {
          console.warn('[useStreakRescue] Failed to update streak_rescue_used:', updateErr.message);
        } else {
          console.log('[useStreakRescue] streak_rescue_used set to true for user:', user.id);
        }
      }

      await fetchRescueState();
      return { success: true };
    } catch (e: any) {
      const code: string = e?.code ?? e?.userCancelled ? 'userCancelled' : '';
      if (code === 'userCancelled' || e?.userCancelled === true) {
        console.log('[useStreakRescue] Purchase cancelled by user');
        return { success: false };
      }
      console.error('[useStreakRescue] Purchase error:', e?.message ?? e);
      return { success: false, error: e?.message ?? 'Purchase failed' };
    } finally {
      setPurchasing(false);
    }
  }, [productId, fetchRescueState]);

  const dismissRescue = useCallback(async (): Promise<void> => {
    console.log('[useStreakRescue] dismissRescue called — user chose to start over');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('users')
        .update({ streak_rescue_used: true, last_streak_value: 0 })
        .eq('id', user.id);

      if (error) {
        console.warn('[useStreakRescue] dismissRescue update error:', error.message);
      } else {
        console.log('[useStreakRescue] Rescue dismissed, state cleared for user:', user.id);
      }

      await fetchRescueState();
    } catch (e: any) {
      console.warn('[useStreakRescue] dismissRescue error:', e?.message);
    }
  }, [fetchRescueState]);

  const refresh = useCallback(async (): Promise<void> => {
    console.log('[useStreakRescue] refresh called');
    setLoading(true);
    await fetchRescueState();
  }, [fetchRescueState]);

  return {
    canRescue,
    lostStreakValue,
    productId,
    priceLabel,
    loading,
    purchasing,
    executePurchase,
    dismissRescue,
    refresh,
  };
}

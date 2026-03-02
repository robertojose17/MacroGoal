
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Alert, Platform } from 'react-native';
import * as InAppPurchases from 'expo-in-app-purchases';
import { supabase } from '@/app/integrations/supabase/client';
import { IAP_PRODUCT_IDS } from '@/config/iapConfig';

// --- Types ---
type Product = {
  productId: string;
  title: string;
  description: string;
  price: string;
  currencyCode: string;
};

type UseSubscriptionHook = {
  products: Product[];
  purchaseProduct: (productId: string) => Promise<void>;
  restorePurchases: () => Promise<void>;
  isSubscribed: boolean;
  loading: boolean;
  error: string | null;
  storeConnected: boolean;
  diagnostics: string[];
};

const log = (tag: string, msg: string, data?: any) => {
  const ts = new Date().toISOString();
  console.log(`[IAP ${ts}] ${tag}: ${msg}`, data ?? '');
};

export const useSubscription = (): UseSubscriptionHook => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [storeConnected, setStoreConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);

  const initializedRef = useRef(false);
  const listenerRef = useRef<{ remove?: () => void } | null>(null);
  const isMountedRef = useRef(true);

  const productIds = useMemo(() => [IAP_PRODUCT_IDS.monthly, IAP_PRODUCT_IDS.yearly], []);

  // Helper to ensure state updates only happen if component is mounted
  const safeSet = useCallback((updateFn: () => void) => {
    if (isMountedRef.current) updateFn();
  }, []);

  const addDiagnostic = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    safeSet(() => setDiagnostics(prev => [...prev, `[${timestamp}] ${message}`]));
    log('DIAGNOSTIC', message);
  }, [safeSet]);

  // --- Subscription Verification Logic ---
  const fetchSubscriptionStatusFromDB = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        safeSet(() => setIsSubscribed(false));
        return;
      }

      const { data, error: dbError } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (dbError && dbError.code !== 'PGRST116') throw dbError;
      safeSet(() => setIsSubscribed(!!data));
    } catch (e) {
      log('DB_ERROR', 'Failed to fetch status', e);
      safeSet(() => setIsSubscribed(false));
    }
  }, [safeSet]);

  const verifyReceipt = useCallback(async (purchase: InAppPurchases.InAppPurchase) => {
    const finish = async () => {
      try {
        await InAppPurchases.finishTransactionAsync(purchase, false);
      } catch (e) {
        log('FINISH_ERROR', 'Failed to finish transaction', e);
      }
    };

    try {
      if (!purchase?.transactionReceipt) {
        addDiagnostic('❌ Purchase has no receipt');
        await finish();
        return { ok: false };
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      addDiagnostic(`📤 Verifying ${purchase.productId} with backend...`);

      const { data, error: fnError } = await supabase.functions.invoke('verify-apple-receipt', {
        body: {
          receipt: purchase.transactionReceipt,
          productId: purchase.productId,
          transactionId: purchase.transactionId,
          userId: user.id,
        },
      });

      if (fnError || !data?.success) {
        throw new Error(data?.error || fnError?.message || 'Verification failed');
      }

      addDiagnostic('✅ Receipt verified successfully!');
      safeSet(() => setIsSubscribed(true));
      await finish();
      return { ok: true };
    } catch (e: any) {
      addDiagnostic(`❌ Verification error: ${e.message}`);
      await finish();
      return { ok: false };
    }
  }, [addDiagnostic, safeSet]);

  // --- Initialization ---
  useEffect(() => {
    isMountedRef.current = true;

    if (Platform.OS !== 'ios') {
      safeSet(() => {
        setLoading(false);
        setError('IAP only available on iOS');
      });
      return;
    }

    if (initializedRef.current) return;
    initializedRef.current = true;

    const initIAP = async () => {
      safeSet(() => {
        setLoading(true);
        setError(null);
        setDiagnostics([]);
      });

      try {
        addDiagnostic('🚀 Initializing StoreKit 2 connection...');
        
        // CRITICAL: Clean connection to StoreKit 2
        // This is the ONLY place we connect - no previous code interferes
        const conn = await InAppPurchases.connectAsync();
        
        if (!conn) {
          throw new Error('StoreKit connection returned undefined. Ensure you have a valid Bundle ID and are testing on a real device or TestFlight.');
        }

        if (conn.responseCode !== InAppPurchases.IAPResponseCode.OK) {
          throw new Error(`StoreKit connection failed with code: ${conn.responseCode}. Make sure you are on a real device or TestFlight, not Simulator.`);
        }

        addDiagnostic('✅ StoreKit 2 connected successfully');
        safeSet(() => setStoreConnected(true));

        addDiagnostic('📦 Fetching product details from App Store...');
        const prodRes = await InAppPurchases.getProductsAsync(productIds);
        
        if (!prodRes || prodRes.responseCode !== InAppPurchases.IAPResponseCode.OK) {
          throw new Error('Failed to fetch products from Apple. Check App Store Connect configuration.');
        }

        const results = prodRes.results ?? [];
        if (results.length === 0) {
          addDiagnostic('⚠️ No products returned. Verify product IDs in App Store Connect match config/iapConfig.ts');
        } else {
          addDiagnostic(`✅ Found ${results.length} product(s): ${results.map(p => p.productId).join(', ')}`);
        }

        safeSet(() => {
          setProducts(results.map(p => ({
            productId: p.productId,
            title: p.title,
            description: p.description,
            price: p.price,
            currencyCode: p.currencyCode,
          })));
        });

        // Set up purchase listener
        addDiagnostic('🎧 Setting up purchase listener...');
        listenerRef.current = InAppPurchases.setPurchaseListener(async (update) => {
          if (!update) return;
          const code = update.responseCode;
          addDiagnostic(`📥 Purchase Update: ${code}`);

          if (code === InAppPurchases.IAPResponseCode.OK) {
            for (const p of (update.results ?? [])) {
              const res = await verifyReceipt(p);
              if (res.ok) Alert.alert('Success', 'Subscription active!');
            }
          } else if (code !== InAppPurchases.IAPResponseCode.USER_CANCELED) {
            Alert.alert('Purchase Error', `Error code: ${code}`);
          }
        });

        addDiagnostic('✅ Purchase listener active');

        // Check existing subscription status
        await fetchSubscriptionStatusFromDB();
        safeSet(() => setLoading(false));

      } catch (e: any) {
        const msg = e?.message || 'Unknown Initialization Error';
        addDiagnostic(`❌ FAILED: ${msg}`);
        safeSet(() => {
          setError(msg);
          setLoading(false);
          setStoreConnected(false);
        });
      }
    };

    initIAP();

    return () => {
      isMountedRef.current = false;
      if (listenerRef.current?.remove) {
        listenerRef.current.remove();
      }
      // Clean disconnect on unmount
      InAppPurchases.disconnectAsync().catch(() => {});
    };
  }, [productIds, fetchSubscriptionStatusFromDB, verifyReceipt, addDiagnostic, safeSet]);

  // --- Actions ---
  const purchaseProduct = useCallback(async (productId: string) => {
    if (!storeConnected) {
      Alert.alert('Error', 'Store not connected. Please restart the app.');
      return;
    }
    safeSet(() => setLoading(true));
    try {
      addDiagnostic(`🛒 Starting purchase for: ${productId}`);
      await InAppPurchases.purchaseItemAsync(productId);
    } catch (e: any) {
      addDiagnostic(`❌ Purchase failed: ${e.message}`);
      Alert.alert('Error', e.message);
    } finally {
      safeSet(() => setLoading(false));
    }
  }, [storeConnected, addDiagnostic, safeSet]);

  const restorePurchases = useCallback(async () => {
    if (!storeConnected) {
      Alert.alert('Error', 'Store not connected. Please restart the app.');
      return;
    }
    safeSet(() => setLoading(true));
    try {
      addDiagnostic('🔄 Restoring purchases...');
      const history = await InAppPurchases.getPurchaseHistoryAsync();
      if (history.responseCode === InAppPurchases.IAPResponseCode.OK) {
        const items = history.results ?? [];
        if (items.length === 0) {
          Alert.alert('Restore', 'No purchases found.');
          addDiagnostic('ℹ️ No purchase history found');
        } else {
          addDiagnostic(`✅ Found ${items.length} purchase(s) in history`);
        }
        for (const p of items) await verifyReceipt(p);
        await fetchSubscriptionStatusFromDB();
      } else {
        addDiagnostic(`❌ Restore failed with code: ${history.responseCode}`);
      }
    } catch (e: any) {
      addDiagnostic(`❌ Restore failed: ${e.message}`);
      Alert.alert('Error', e.message);
    } finally {
      safeSet(() => setLoading(false));
    }
  }, [storeConnected, verifyReceipt, fetchSubscriptionStatusFromDB, addDiagnostic, safeSet]);

  return { products, purchaseProduct, restorePurchases, isSubscribed, loading, error, storeConnected, diagnostics };
};

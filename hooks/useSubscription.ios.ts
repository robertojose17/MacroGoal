
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Alert, Platform } from 'react-native';
import * as InAppPurchases from 'expo-in-app-purchases';
import { supabase } from '@/app/integrations/supabase/client';
import { IAP_PRODUCT_IDS } from '@/config/iapConfig';

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
  if (data !== undefined) console.log(`[IAP ${ts}] ${tag}: ${msg}`, data);
  else console.log(`[IAP ${ts}] ${tag}: ${msg}`);
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

  // Memoize productIds to prevent unnecessary re-renders
  const productIds = useMemo(() => [IAP_PRODUCT_IDS.monthly, IAP_PRODUCT_IDS.yearly], []);

  const addDiagnostic = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDiagnostics(prev => [...prev, `[${timestamp}] ${message}`]);
    log('DIAGNOSTIC', message);
  }, []);

  const fetchSubscriptionStatusFromDB = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsSubscribed(false);
        return;
      }

      const { data, error: dbError } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (dbError && dbError.code !== 'PGRST116') {
        log('DB', 'Error reading subscription', dbError);
        setIsSubscribed(false);
        return;
      }

      setIsSubscribed(!!data);
    } catch (e) {
      log('DB', 'Unexpected error', e);
      setIsSubscribed(false);
    }
  }, []);

  const verifyReceipt = useCallback(
    async (purchase: InAppPurchases.InAppPurchase) => {
      const finish = async () => {
        try {
          await InAppPurchases.finishTransactionAsync(purchase, false);
        } catch (e) {
          log('FINISH', 'finishTransactionAsync failed', e);
        }
      };

      try {
        if (!purchase?.transactionReceipt) {
          log('VERIFY', 'No receipt on purchase', purchase);
          addDiagnostic('❌ Purchase has no receipt');
          await finish();
          return { ok: false, reason: 'no_receipt' as const };
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          log('VERIFY', 'No authenticated user');
          addDiagnostic('❌ No authenticated user for verification');
          await finish();
          return { ok: false, reason: 'no_user' as const };
        }

        log('VERIFY', 'Sending receipt to Edge Function', {
          productId: purchase.productId,
          transactionId: purchase.transactionId,
        });
        addDiagnostic(`📤 Verifying receipt with Apple (Product: ${purchase.productId})`);

        const { data, error: fnError } = await supabase.functions.invoke('verify-apple-receipt', {
          body: {
            receipt: purchase.transactionReceipt,
            productId: purchase.productId,
            transactionId: purchase.transactionId,
            userId: user.id,
          },
        });

        if (fnError) {
          log('VERIFY', 'Edge Function error', fnError);
          addDiagnostic(`❌ Verification failed: ${fnError.message}`);
          await finish();
          return { ok: false, reason: 'fn_error' as const };
        }

        if (data?.success) {
          addDiagnostic('✅ Receipt verified successfully!');
          setIsSubscribed(true);
          await finish();
          return { ok: true as const };
        }

        log('VERIFY', 'Verification failed response', data);
        addDiagnostic(`❌ Verification failed: ${data?.error || 'Unknown error'}`);
        await finish();
        return { ok: false, reason: 'verify_failed' as const };
      } catch (e: any) {
        log('VERIFY', 'Unexpected verify error', e);
        addDiagnostic(`❌ Verification error: ${e?.message || 'Unknown'}`);
        await finish();
        return { ok: false, reason: 'unexpected' as const };
      }
    },
    [addDiagnostic]
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setLoading(false);
      setError('IAP hook loaded on non-iOS platform');
      addDiagnostic('⚠️ Not running on iOS - IAP unavailable');
      return;
    }

    if (initializedRef.current) {
      log('INIT', 'Already initialized, skipping');
      return;
    }
    initializedRef.current = true;

    let cancelled = false;

    const init = async () => {
      log('INIT', 'Starting initialization sequence');
      setLoading(true);
      setError(null);
      setDiagnostics([]);

      try {
        addDiagnostic('🚀 Starting IAP initialization...');
        addDiagnostic(`📦 Product IDs: ${productIds.join(', ')}`);
        
        log('INIT', 'Connecting to StoreKit...');
        addDiagnostic('🔌 Connecting to Apple StoreKit...');
        
        const conn = await InAppPurchases.connectAsync();
        log('CONNECT', 'Result', conn);

        if (cancelled) {
          log('INIT', 'Cancelled after connect');
          return;
        }

        if (conn.responseCode !== InAppPurchases.IAPResponseCode.OK) {
          const errorMsg = conn.debugMessage || `connectAsync failed (${conn.responseCode})`;
          addDiagnostic(`❌ StoreKit connection failed: ${errorMsg}`);
          addDiagnostic('💡 Troubleshooting:');
          addDiagnostic('  1. Are you testing on a real iOS device or TestFlight?');
          addDiagnostic('  2. Is the device signed in to a valid Apple ID?');
          addDiagnostic('  3. Is the app properly configured in App Store Connect?');
          setError(errorMsg);
          setStoreConnected(false);
          setLoading(false);
          return;
        }

        addDiagnostic('✅ Connected to StoreKit successfully');
        setStoreConnected(true);

        if (cancelled) {
          log('INIT', 'Cancelled after setting storeConnected');
          return;
        }

        log('PRODUCTS', 'Fetching productIds', productIds);
        addDiagnostic('📦 Fetching product information from App Store...');
        
        const prodRes = await InAppPurchases.getProductsAsync(productIds);
        log('PRODUCTS', 'Result', prodRes);

        if (cancelled) {
          log('INIT', 'Cancelled after getProductsAsync');
          return;
        }

        const results = prodRes.results ?? [];
        
        if (prodRes.responseCode !== InAppPurchases.IAPResponseCode.OK) {
          addDiagnostic(`❌ Product fetch failed with code: ${prodRes.responseCode}`);
          setError('Failed to fetch products from App Store');
          setLoading(false);
          return;
        }

        if (results.length === 0) {
          addDiagnostic('❌ No products returned from App Store');
          addDiagnostic('💡 Common causes:');
          addDiagnostic('  1. Product IDs don\'t match App Store Connect exactly');
          addDiagnostic('  2. Products not in "Ready to Submit" status');
          addDiagnostic('  3. Bundle ID mismatch (app.json vs App Store Connect)');
          addDiagnostic('  4. Testing on Simulator (use real device/TestFlight)');
          addDiagnostic('  5. Products not configured as Auto-Renewable Subscriptions');
          addDiagnostic(`  6. Expected IDs: ${productIds.join(', ')}`);
          setError('No products returned. Check App Store Connect setup.');
          setProducts([]);
          setLoading(false);
          return;
        }

        addDiagnostic(`✅ Loaded ${results.length} product(s) successfully`);
        results.forEach((p, i) => {
          addDiagnostic(`  ${i + 1}. ${p.title} (${p.productId}) - ${p.price}`);
        });

        setProducts(
          results.map((p) => ({
            productId: p.productId,
            title: p.title,
            description: p.description,
            price: p.price,
            currencyCode: p.currencyCode,
          }))
        );

        if (cancelled) {
          log('INIT', 'Cancelled after setting products');
          return;
        }

        log('LISTENER', 'Setting purchase listener...');
        addDiagnostic('🎧 Setting up purchase listener...');
        
        listenerRef.current = InAppPurchases.setPurchaseListener(async (update) => {
          log('LISTENER', 'Update', update);

          if (!update) {
            addDiagnostic('⚠️ Received empty purchase update');
            return;
          }

          const code = update.responseCode;
          addDiagnostic(`📥 Purchase update received (code: ${code})`);

          if (code === InAppPurchases.IAPResponseCode.OK) {
            const purchases = update.results ?? [];
            addDiagnostic(`✅ Purchase successful (${purchases.length} transaction(s))`);
            
            for (const p of purchases) {
              addDiagnostic(`🔍 Verifying transaction: ${p.transactionId}`);
              const res = await verifyReceipt(p);
              if (!res.ok) {
                Alert.alert('Purchase verification failed', 'We could not verify your purchase. Try Restore Purchases.');
              } else {
                Alert.alert('Success', 'Subscription active!');
              }
            }
            return;
          }

          if (code === InAppPurchases.IAPResponseCode.USER_CANCELED) {
            addDiagnostic('ℹ️ User canceled the purchase');
            Alert.alert('Canceled', 'Purchase canceled.');
            return;
          }

          addDiagnostic(`❌ Purchase failed with code: ${code}`);
          Alert.alert('Purchase error', `Store error: ${InAppPurchases.IAPResponseCode[code]}`);
        });

        addDiagnostic('✅ Purchase listener active');
        addDiagnostic('🎉 IAP initialization complete!');

        await fetchSubscriptionStatusFromDB();
        
        // Ensure loading is set to false after everything completes successfully
        setLoading(false);
        log('INIT', 'Initialization complete, loading set to false');
      } catch (e: any) {
        log('INIT', 'Error', e);
        if (!cancelled) {
          const errorMessage = e?.message || 'Failed to init IAP';
          setError(errorMessage);
          addDiagnostic(`❌ Initialization failed: ${errorMessage}`);
          setStoreConnected(false);
          setProducts([]);
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      log('CLEANUP', 'Cleaning up IAP resources');
      cancelled = true;
      try {
        listenerRef.current?.remove?.();
        listenerRef.current = null;
      } catch (e) {
        log('CLEANUP', 'Error removing listener', e);
      }
      InAppPurchases.disconnectAsync().catch((e) => {
        log('CLEANUP', 'Error disconnecting', e);
      });
    };
  }, [fetchSubscriptionStatusFromDB, productIds, verifyReceipt, addDiagnostic]);

  const purchaseProduct = useCallback(
    async (productId: string) => {
      if (!storeConnected) {
        Alert.alert('Store not connected', 'IAP not connected.');
        addDiagnostic('❌ Purchase attempt failed: Store not connected');
        return;
      }

      const exists = products.some((p) => p.productId === productId);
      if (!exists) {
        Alert.alert('Product not loaded', `Product not found: ${productId}`);
        addDiagnostic(`❌ Purchase attempt failed: Product ${productId} not found`);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        log('PURCHASE', `purchaseItemAsync(${productId})`);
        addDiagnostic(`🛒 Initiating purchase for: ${productId}`);
        await InAppPurchases.purchaseItemAsync(productId);
        addDiagnostic('✅ Purchase initiated - waiting for App Store response...');
      } catch (e: any) {
        log('PURCHASE', 'Error', e);
        const errorMessage = e?.message || 'Purchase failed to start';
        setError(errorMessage);
        addDiagnostic(`❌ Purchase failed: ${errorMessage}`);
        Alert.alert('Purchase error', errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [products, storeConnected, addDiagnostic]
  );

  const restorePurchases = useCallback(async () => {
    if (!storeConnected) {
      Alert.alert('Store not connected', 'IAP not connected.');
      addDiagnostic('❌ Restore attempt failed: Store not connected');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      log('RESTORE', 'getPurchaseHistoryAsync()');
      addDiagnostic('🔄 Restoring purchases from Apple...');
      
      const history = await InAppPurchases.getPurchaseHistoryAsync();
      log('RESTORE', 'History result', history);

      if (history.responseCode !== InAppPurchases.IAPResponseCode.OK) {
        const errorMsg = `Restore failed: ${InAppPurchases.IAPResponseCode[history.responseCode]}`;
        addDiagnostic(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const items = history.results ?? [];
      addDiagnostic(`📦 Found ${items.length} previous purchase(s)`);
      
      if (items.length === 0) {
        addDiagnostic('ℹ️ No previous purchases found for this Apple ID');
        Alert.alert('No purchases', 'No previous purchases found for this Apple ID.');
        setIsSubscribed(false);
        return;
      }

      let activated = false;
      for (const p of items) {
        addDiagnostic(`🔍 Verifying restored transaction: ${p.transactionId}`);
        const res = await verifyReceipt(p);
        if (res.ok) activated = true;
      }

      await fetchSubscriptionStatusFromDB();

      const message = activated ? 'Subscription restored successfully!' : 'No active subscription found to restore.';
      addDiagnostic(activated ? '✅ Restore successful!' : 'ℹ️ No active subscription found');
      
      Alert.alert('Restore complete', message);
    } catch (e: any) {
      log('RESTORE', 'Error', e);
      const errorMessage = e?.message || 'Restore failed';
      setError(errorMessage);
      addDiagnostic(`❌ Restore failed: ${errorMessage}`);
      Alert.alert('Restore error', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [storeConnected, verifyReceipt, fetchSubscriptionStatusFromDB, addDiagnostic]);

  return {
    products,
    purchaseProduct,
    restorePurchases,
    isSubscribed,
    loading,
    error,
    storeConnected,
    diagnostics,
  };
};

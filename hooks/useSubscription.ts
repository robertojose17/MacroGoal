
import { useState, useCallback } from 'react';
import { Platform } from 'react-native';

// Fallback for non-iOS platforms
interface Product {
  productId: string;
  title: string;
  description: string;
  price: string;
  currencyCode: string;
}

interface UseSubscriptionHook {
  products: Product[];
  purchaseProduct: (productId: string) => Promise<void>;
  restorePurchases: () => Promise<void>;
  isSubscribed: boolean;
  loading: boolean;
  error: string | null;
  storeConnected: boolean;
  diagnostics: string[];
}

export const useSubscription = (): UseSubscriptionHook => {
  const [products] = useState<Product[]>([]);
  const [isSubscribed] = useState<boolean>(false);
  const [loading] = useState<boolean>(false);
  const [error] = useState<string | null>('In-App Purchases are only available on iOS');
  const [storeConnected] = useState<boolean>(false);
  const [diagnostics] = useState<string[]>([`[${new Date().toLocaleTimeString()}] ⚠️ IAP only available on iOS`]);

  const purchaseProduct = useCallback(async (productId: string) => {
    console.log(`[useSubscription] Purchase not available on ${Platform.OS}`);
  }, []);

  const restorePurchases = useCallback(async () => {
    console.log(`[useSubscription] Restore not available on ${Platform.OS}`);
  }, []);

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

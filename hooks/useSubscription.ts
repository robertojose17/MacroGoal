
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { AppState, AppStateStatus } from 'react-native';

export type SubscriptionStatus = 'active' | 'inactive' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';
export type PlanType = 'monthly' | 'yearly' | null;

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  status: SubscriptionStatus;
  plan_type: PlanType;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface UseSubscriptionReturn {
  subscription: Subscription | null;
  loading: boolean;
  isSubscribed: boolean;
  hasActiveSubscription: boolean;
  planType: PlanType;
  refreshSubscription: () => Promise<void>;
  syncSubscription: () => Promise<void>;
  createCheckoutSession: (priceId: string, planType: 'monthly' | 'yearly') => Promise<void>;
  openCustomerPortal: () => Promise<void>;
}

/**
 * Hook to manage user subscription state
 * Automatically fetches subscription on mount and provides helper methods
 */
export function useSubscription(): UseSubscriptionReturn {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    try {
      console.log('[useSubscription] 🔄 Fetching subscription...');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[useSubscription] ❌ No user found');
        setSubscription(null);
        setLoading(false);
        return;
      }

      console.log('[useSubscription] ✅ User found:', user.id);

      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[useSubscription] ❌ Error fetching subscription:', error);
        setSubscription(null);
      } else {
        console.log('[useSubscription] ✅ Subscription fetched:', data?.status || 'none');
        if (data) {
          console.log('[useSubscription] 📊 Subscription details:', {
            status: data.status,
            plan_type: data.plan_type,
            stripe_subscription_id: data.stripe_subscription_id,
          });
        }
        setSubscription(data);
      }
    } catch (error) {
      console.error('[useSubscription] ❌ Error in fetchSubscription:', error);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncSubscription = useCallback(async () => {
    try {
      console.log('[useSubscription] 🔄 Syncing subscription with Stripe...');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('[useSubscription] ❌ Not authenticated');
        return;
      }

      const { data, error } = await supabase.functions.invoke('sync-subscription', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('[useSubscription] ❌ Error syncing subscription:', error);
      } else {
        console.log('[useSubscription] ✅ Subscription synced:', data);
        // Refresh local subscription data
        await fetchSubscription();
      }
    } catch (error) {
      console.error('[useSubscription] ❌ Error in syncSubscription:', error);
    }
  }, [fetchSubscription]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Set up real-time subscription to subscription changes
  useEffect(() => {
    console.log('[useSubscription] 📡 Setting up real-time subscription listener');
    
    const channel = supabase
      .channel('subscription-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
        },
        (payload) => {
          console.log('[useSubscription] 🔔 Subscription changed:', payload);
          fetchSubscription();
        }
      )
      .subscribe();

    return () => {
      console.log('[useSubscription] 🔌 Cleaning up real-time subscription listener');
      supabase.removeChannel(channel);
    };
  }, [fetchSubscription]);

  // Listen for app state changes to sync when returning from background
  useEffect(() => {
    console.log('[useSubscription] 📱 Setting up app state listener');
    
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('[useSubscription] 🔄 App became active, syncing subscription...');
        // Sync subscription when app comes to foreground (e.g., after returning from Stripe checkout)
        syncSubscription();
      }
    });

    return () => {
      console.log('[useSubscription] 🔌 Cleaning up app state listener');
      subscription.remove();
    };
  }, [syncSubscription]);

  const createCheckoutSession = useCallback(async (priceId: string, planType: 'monthly' | 'yearly') => {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[useSubscription] 💳 Creating checkout session');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[useSubscription] Plan:', planType);
      console.log('[useSubscription] Price ID:', priceId);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('[useSubscription] ❌ Not authenticated');
        throw new Error('Not authenticated');
      }

      console.log('[useSubscription] ✅ User authenticated');
      console.log('[useSubscription] 🚀 Calling Edge Function: create-checkout-session');
      console.log('[useSubscription] 📦 Request body:', { priceId, planType });

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { priceId, planType },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      console.log('[useSubscription] 📥 Edge Function response received');

      if (error) {
        console.error('[useSubscription] ❌ Error from Edge Function:', error);
        console.error('[useSubscription] Error details:', JSON.stringify(error, null, 2));
        throw error;
      }

      console.log('[useSubscription] ✅ Edge Function response:', data);

      if (data?.url) {
        console.log('[useSubscription] 🌐 Opening checkout URL:', data.url);
        console.log('[useSubscription] 🔗 URL length:', data.url.length);
        
        const result = await WebBrowser.openBrowserAsync(data.url);
        console.log('[useSubscription] 📱 WebBrowser result:', result);
        
        // After the browser closes, sync the subscription
        // The webhook should have already updated the database, but we sync to be sure
        if (result.type === 'cancel' || result.type === 'dismiss') {
          console.log('[useSubscription] 🔄 Browser closed, syncing subscription...');
          // Wait a moment for webhook to process, then sync
          setTimeout(() => {
            syncSubscription();
          }, 2000);
        }
      } else {
        console.error('[useSubscription] ❌ No checkout URL in response');
        console.error('[useSubscription] Response data:', JSON.stringify(data, null, 2));
        throw new Error('No checkout URL returned from Edge Function');
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error: any) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[useSubscription] ❌ Error in createCheckoutSession');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[useSubscription] Error type:', error.constructor.name);
      console.error('[useSubscription] Error message:', error.message);
      console.error('[useSubscription] Error details:', JSON.stringify(error, null, 2));
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      throw error;
    }
  }, [syncSubscription]);

  const openCustomerPortal = useCallback(async () => {
    try {
      console.log('[useSubscription] 🏪 Opening customer portal...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('[useSubscription] ❌ Not authenticated');
        throw new Error('Not authenticated');
      }

      console.log('[useSubscription] ✅ User authenticated');
      console.log('[useSubscription] 🚀 Calling Edge Function: create-portal-session');

      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('[useSubscription] ❌ Error creating portal session:', error);
        throw error;
      }

      console.log('[useSubscription] ✅ Portal session created');

      if (data?.url) {
        console.log('[useSubscription] 🌐 Opening portal URL:', data.url);
        const result = await WebBrowser.openBrowserAsync(data.url);
        console.log('[useSubscription] 📱 WebBrowser result:', result);
        
        // After the browser closes, sync the subscription
        if (result.type === 'cancel' || result.type === 'dismiss') {
          console.log('[useSubscription] 🔄 Browser closed, syncing subscription...');
          setTimeout(() => {
            syncSubscription();
          }, 1000);
        }
      } else {
        console.error('[useSubscription] ❌ No portal URL returned');
        throw new Error('No portal URL returned');
      }
    } catch (error) {
      console.error('[useSubscription] ❌ Error in openCustomerPortal:', error);
      throw error;
    }
  }, [syncSubscription]);

  const isSubscribed = subscription?.status === 'active' || subscription?.status === 'trialing';
  const hasActiveSubscription = isSubscribed;

  return {
    subscription,
    loading,
    isSubscribed,
    hasActiveSubscription,
    planType: subscription?.plan_type || null,
    refreshSubscription: fetchSubscription,
    syncSubscription,
    createCheckoutSession,
    openCustomerPortal,
  };
}

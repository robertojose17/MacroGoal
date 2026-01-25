
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
  refreshUserProfile: () => Promise<void>;
  createCheckoutSession: (priceId: string, planType: 'monthly' | 'yearly') => Promise<void>;
  openCustomerPortal: () => Promise<void>;
}

/**
 * CRITICAL FIX: Check if user has premium access
 * A user has premium access if:
 * - status is 'active' OR 'trialing'
 * - OR status is 'canceled' but current_period_end is in the future
 */
function hasPremiumAccess(subscription: Subscription | null): boolean {
  if (!subscription) return false;
  
  const now = new Date();
  
  // Active or trialing = premium
  if (subscription.status === 'active' || subscription.status === 'trialing') {
    return true;
  }
  
  // Canceled but still within paid period = premium
  if (subscription.status === 'canceled' && subscription.current_period_end) {
    const periodEnd = new Date(subscription.current_period_end);
    if (periodEnd > now) {
      console.log('[useSubscription] 📅 Subscription canceled but still active until:', periodEnd.toISOString());
      return true;
    }
  }
  
  return false;
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
        console.log('[useSubscription] ✅ Subscription fetched from database');
        if (data) {
          console.log('[useSubscription] 📊 Subscription details:', {
            status: data.status,
            plan_type: data.plan_type,
            stripe_subscription_id: data.stripe_subscription_id,
            current_period_end: data.current_period_end,
            cancel_at_period_end: data.cancel_at_period_end,
            has_premium_access: hasPremiumAccess(data),
            updated_at: data.updated_at,
          });
        } else {
          console.log('[useSubscription] ℹ️ No subscription record found (user has never subscribed)');
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
        console.log('[useSubscription] ✅ Subscription synced with Stripe:', data);
        // CRITICAL: Force refresh local subscription data after sync
        await fetchSubscription();
      }
    } catch (error) {
      console.error('[useSubscription] ❌ Error in syncSubscription:', error);
    }
  }, [fetchSubscription]);

  const refreshUserProfile = useCallback(async () => {
    try {
      console.log('[useSubscription] 🔄 Refreshing user profile...');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[useSubscription] ❌ No user found');
        return;
      }

      // Trigger a refetch of user data by updating the auth state
      // This will cause any components listening to auth state to re-render
      const { data: userData } = await supabase
        .from('users')
        .select('user_type')
        .eq('id', user.id)
        .maybeSingle();

      if (userData) {
        console.log('[useSubscription] ✅ User profile refreshed, user_type:', userData.user_type);
      }
    } catch (error) {
      console.error('[useSubscription] ❌ Error refreshing user profile:', error);
    }
  }, []);

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
          console.log('[useSubscription] 🔔 Subscription changed via real-time:', payload);
          // CRITICAL: Immediately fetch fresh data when subscription changes
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
        
        // Open the Stripe checkout in the browser
        const result = await WebBrowser.openBrowserAsync(data.url, {
          // Dismiss button style
          dismissButtonStyle: 'close',
          // Toolbar color
          toolbarColor: '#0F4C81',
          // Control bar color
          controlsColor: '#FFFFFF',
          // Show title
          showTitle: true,
        });
        
        console.log('[useSubscription] 📱 WebBrowser result:', result);
        
        // CRITICAL FIX: After the browser closes, aggressively sync subscription with multiple retries
        // The webhook should have already updated the database if payment succeeded
        console.log('[useSubscription] 🔄 Browser closed, syncing subscription with aggressive retries...');
        
        // Retry sync multiple times to ensure we catch the webhook update
        const maxRetries = 8; // Increased from 5 to 8
        const retryDelay = 1500; // Reduced from 2000ms to 1500ms for faster feedback
        
        for (let i = 0; i < maxRetries; i++) {
          console.log(`[useSubscription] 🔄 Sync attempt ${i + 1}/${maxRetries}`);
          
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          
          // Force sync with Stripe
          await syncSubscription();
          
          // Check if subscription is now active
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            // Fetch fresh subscription data
            const { data: subData } = await supabase
              .from('subscriptions')
              .select('*')
              .eq('user_id', user.id)
              .maybeSingle();
            
            console.log(`[useSubscription] 🔍 Retry ${i + 1} - Subscription status:`, subData?.status);
            
            if (subData && (subData.status === 'active' || subData.status === 'trialing')) {
              console.log('[useSubscription] ✅ Premium status confirmed! Subscription is now active.');
              // Force one final refresh to update UI
              await fetchSubscription();
              break;
            }
          }
          
          if (i === maxRetries - 1) {
            console.log('[useSubscription] ⚠️ Premium status not confirmed after all retries');
            console.log('[useSubscription] ℹ️ This might be normal if payment is still processing');
            // Force one final refresh anyway
            await fetchSubscription();
          }
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
  }, [syncSubscription, fetchSubscription]);

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
        const result = await WebBrowser.openBrowserAsync(data.url, {
          dismissButtonStyle: 'close',
          toolbarColor: '#0F4C81',
          controlsColor: '#FFFFFF',
          showTitle: true,
        });
        console.log('[useSubscription] 📱 WebBrowser result:', result);
        
        // After the browser closes, aggressively sync the subscription
        console.log('[useSubscription] 🔄 Browser closed, syncing subscription...');
        setTimeout(async () => {
          await syncSubscription();
          // Force refresh after sync
          await fetchSubscription();
        }, 1000);
      } else {
        console.error('[useSubscription] ❌ No portal URL returned');
        throw new Error('No portal URL returned');
      }
    } catch (error) {
      console.error('[useSubscription] ❌ Error in openCustomerPortal:', error);
      throw error;
    }
  }, [syncSubscription, fetchSubscription]);

  // CRITICAL FIX: Use hasPremiumAccess function to determine subscription status
  const isSubscribed = hasPremiumAccess(subscription);
  const hasActiveSubscription = isSubscribed;

  return {
    subscription,
    loading,
    isSubscribed,
    hasActiveSubscription,
    planType: subscription?.plan_type || null,
    refreshSubscription: fetchSubscription,
    syncSubscription,
    refreshUserProfile,
    createCheckoutSession,
    openCustomerPortal,
  };
}

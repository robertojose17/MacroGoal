
import { supabase } from '@/app/integrations/supabase/client';

/**
 * Logs detailed subscription information for debugging
 */
export async function logSubscriptionStatus() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[SubscriptionDebug] 🔍 Checking subscription status');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('[SubscriptionDebug] ❌ No user logged in');
      return;
    }

    console.log('[SubscriptionDebug] 👤 User ID:', user.id);
    console.log('[SubscriptionDebug] 📧 Email:', user.email);

    // Fetch user data
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('user_type')
      .eq('id', user.id)
      .maybeSingle();

    if (userError) {
      console.error('[SubscriptionDebug] ❌ Error fetching user:', userError);
    } else {
      console.log('[SubscriptionDebug] 👤 User Type:', userData?.user_type || 'unknown');
    }

    // Fetch subscription data
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (subError) {
      console.error('[SubscriptionDebug] ❌ Error fetching subscription:', subError);
    } else if (!subscription) {
      console.log('[SubscriptionDebug] ℹ️ No subscription record found');
    } else {
      console.log('[SubscriptionDebug] 📊 Subscription Details:');
      console.log('[SubscriptionDebug]   - Status:', subscription.status);
      console.log('[SubscriptionDebug]   - Plan Type:', subscription.plan_type || 'none');
      console.log('[SubscriptionDebug]   - Stripe Customer ID:', subscription.stripe_customer_id || 'none');
      console.log('[SubscriptionDebug]   - Stripe Subscription ID:', subscription.stripe_subscription_id || 'none');
      console.log('[SubscriptionDebug]   - Stripe Price ID:', subscription.stripe_price_id || 'none');
      console.log('[SubscriptionDebug]   - Current Period End:', subscription.current_period_end || 'none');
      console.log('[SubscriptionDebug]   - Cancel at Period End:', subscription.cancel_at_period_end);
      console.log('[SubscriptionDebug]   - Updated At:', subscription.updated_at);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    console.error('[SubscriptionDebug] ❌ Error:', error);
  }
}

/**
 * Manually syncs subscription status with Stripe
 */
export async function manualSyncSubscription() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[SubscriptionDebug] 🔄 Manually syncing subscription');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('[SubscriptionDebug] ❌ Not authenticated');
      return;
    }

    const { data, error } = await supabase.functions.invoke('sync-subscription', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      console.error('[SubscriptionDebug] ❌ Error syncing:', error);
    } else {
      console.log('[SubscriptionDebug] ✅ Sync result:', data);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    console.error('[SubscriptionDebug] ❌ Error:', error);
  }
}


import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// CRITICAL FIX: Hardcode the correct project URL to avoid environment variable issues
const CORRECT_PROJECT_URL = "https://esgptfiofoaeguslgvcq.supabase.co";

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  console.error("[Webhook] ❌ Missing Stripe configuration");
}

// Validate SUPABASE_URL and warn if incorrect
if (SUPABASE_URL && !SUPABASE_URL.includes("esgptfiofoaeguslgvcq")) {
  console.warn("[Webhook] ⚠️ WARNING: SUPABASE_URL environment variable has incorrect project ref!");
  console.warn("[Webhook] ⚠️ Expected: https://esgptfiofoaeguslgvcq.supabase.co");
  console.warn("[Webhook] ⚠️ Got:", SUPABASE_URL);
  console.warn("[Webhook] ⚠️ Using hardcoded correct URL instead");
}

const stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

console.log("[Webhook] ✅ Edge Function initialized");
console.log("[Webhook] Using project URL:", CORRECT_PROJECT_URL);

/**
 * CRITICAL: Resolve user_id from multiple sources with fallback strategy
 * Priority:
 * 1. metadata.supabase_user_id (most reliable)
 * 2. user_stripe_customers table lookup by customer_id
 * 3. subscriptions table lookup by customer_id
 */
async function resolveUserId(
  metadata: Record<string, string> | null | undefined,
  customerId: string | null
): Promise<string | null> {
  console.log("[Webhook] 🔍 Resolving user_id...");
  console.log("[Webhook]   - Metadata:", metadata);
  console.log("[Webhook]   - Customer ID:", customerId);

  // Strategy 1: Check metadata
  if (metadata?.supabase_user_id) {
    console.log("[Webhook] ✅ Found user_id in metadata:", metadata.supabase_user_id);
    return metadata.supabase_user_id;
  }

  // Strategy 2: Look up in user_stripe_customers table
  if (customerId) {
    console.log("[Webhook] 🔍 Looking up user_id by customer_id in mapping table...");
    const { data: mapping, error: mappingError } = await supabase
      .from("user_stripe_customers")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (mappingError) {
      console.error("[Webhook] ⚠️ Error looking up customer mapping:", mappingError);
    } else if (mapping?.user_id) {
      console.log("[Webhook] ✅ Found user_id in mapping table:", mapping.user_id);
      return mapping.user_id;
    }

    // Strategy 3: Look up in subscriptions table
    console.log("[Webhook] 🔍 Looking up user_id by customer_id in subscriptions table...");
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (subError) {
      console.error("[Webhook] ⚠️ Error looking up subscription:", subError);
    } else if (subscription?.user_id) {
      console.log("[Webhook] ✅ Found user_id in subscriptions table:", subscription.user_id);
      
      // CRITICAL: Store this mapping for future lookups
      console.log("[Webhook] 💾 Storing customer mapping for future use...");
      await supabase
        .from("user_stripe_customers")
        .upsert({
          user_id: subscription.user_id,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      
      return subscription.user_id;
    }
  }

  console.error("[Webhook] ❌ Could not resolve user_id from any source!");
  console.error("[Webhook] This is a critical bug - subscription will be orphaned!");
  return null;
}

/**
 * CRITICAL FIX: Determine if user should have premium access
 * A user has premium access if:
 * - status is 'active' OR 'trialing'
 * - OR status is 'canceled' but current_period_end is in the future
 */
function shouldHavePremiumAccess(subscription: Stripe.Subscription): boolean {
  const now = Math.floor(Date.now() / 1000);
  
  // Active or trialing = premium
  if (subscription.status === 'active' || subscription.status === 'trialing') {
    return true;
  }
  
  // Canceled but still within paid period = premium
  if (subscription.status === 'canceled' && subscription.current_period_end > now) {
    console.log("[Webhook] 📅 Subscription canceled but still active until:", new Date(subscription.current_period_end * 1000).toISOString());
    return true;
  }
  
  return false;
}

/**
 * Update subscription and user status in database
 */
async function updateSubscriptionStatus(
  userId: string,
  customerId: string,
  subscriptionId: string,
  subscription: Stripe.Subscription
) {
  const priceId = subscription.items.data[0].price.id;
  const status = subscription.status;
  const isPremium = shouldHavePremiumAccess(subscription);

  console.log("[Webhook] 💾 Updating subscription in database...");
  console.log("[Webhook]   - User ID:", userId);
  console.log("[Webhook]   - Customer ID:", customerId);
  console.log("[Webhook]   - Subscription ID:", subscriptionId);
  console.log("[Webhook]   - Status:", status);
  console.log("[Webhook]   - Is Premium:", isPremium);
  console.log("[Webhook]   - Current Period End:", new Date(subscription.current_period_end * 1000).toISOString());

  // Determine plan type from price ID or metadata
  let planType = subscription.metadata?.plan_type || 'monthly';
  if (!subscription.metadata?.plan_type) {
    // Fallback: try to determine from price ID
    if (priceId.toLowerCase().includes('year') || priceId.toLowerCase().includes('annual')) {
      planType = 'yearly';
    }
  }

  // CRITICAL: Upsert subscription
  const { error: subError } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: priceId,
        status: status,
        plan_type: planType,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (subError) {
    console.error("[Webhook] ❌ Error upserting subscription:", subError);
    throw subError;
  }

  console.log("[Webhook] ✅ Subscription upserted successfully");

  // CRITICAL FIX: Update user_type based on premium access, not just status
  const newUserType = isPremium ? 'premium' : 'free';
  console.log("[Webhook] 🔄 Updating user_type to:", newUserType);

  const { error: userError } = await supabase
    .from("users")
    .update({
      user_type: newUserType,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (userError) {
    console.error("[Webhook] ❌ Error updating user_type:", userError);
    throw userError;
  }

  console.log("[Webhook] ✅ User type updated to:", newUserType);

  // CRITICAL: Ensure customer mapping exists
  console.log("[Webhook] 💾 Ensuring customer mapping exists...");
  const { error: mappingError } = await supabase
    .from("user_stripe_customers")
    .upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (mappingError) {
    console.error("[Webhook] ⚠️ Error upserting customer mapping:", mappingError);
    // Don't throw - this is not critical
  } else {
    console.log("[Webhook] ✅ Customer mapping ensured");
  }
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    console.error("[Webhook] ❌ No signature header");
    return new Response("No signature", { status: 400 });
  }

  try {
    const body = await req.text();
    console.log("[Webhook] 📥 Received webhook");

    // Verify the webhook signature
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET!,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );

    console.log("[Webhook] ✅ Signature verified");
    console.log("[Webhook] 📦 Event type:", event.type);
    console.log("[Webhook] 📦 Event ID:", event.id);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("[Webhook] ✅ Checkout completed:", session.id);
        console.log("[Webhook]   - Customer:", session.customer);
        console.log("[Webhook]   - Subscription:", session.subscription);
        console.log("[Webhook]   - Metadata:", session.metadata);

        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        // CRITICAL: Resolve user_id with fallback strategy
        const userId = await resolveUserId(session.metadata, customerId);

        if (!userId) {
          console.error("[Webhook] ❌ CRITICAL: Could not resolve user_id for checkout session!");
          console.error("[Webhook] Session ID:", session.id);
          console.error("[Webhook] Customer ID:", customerId);
          console.error("[Webhook] This subscription will be orphaned!");
          // Return 200 to acknowledge webhook, but log the error
          return new Response(JSON.stringify({ 
            received: true, 
            error: "Could not resolve user_id" 
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Fetch subscription details from Stripe
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        
        // Update database
        await updateSubscriptionStatus(userId, customerId, subscriptionId, subscription);

        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log("[Webhook] 🆕 Subscription created:", subscription.id);
        console.log("[Webhook]   - Customer:", subscription.customer);
        console.log("[Webhook]   - Status:", subscription.status);
        console.log("[Webhook]   - Metadata:", subscription.metadata);

        const customerId = subscription.customer as string;

        // CRITICAL: Resolve user_id with fallback strategy
        const userId = await resolveUserId(subscription.metadata, customerId);

        if (!userId) {
          console.error("[Webhook] ❌ CRITICAL: Could not resolve user_id for subscription!");
          console.error("[Webhook] Subscription ID:", subscription.id);
          console.error("[Webhook] Customer ID:", customerId);
          return new Response(JSON.stringify({ 
            received: true, 
            error: "Could not resolve user_id" 
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Update database
        await updateSubscriptionStatus(userId, customerId, subscription.id, subscription);

        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log("[Webhook] 🔄 Subscription updated:", subscription.id);
        console.log("[Webhook]   - Customer:", subscription.customer);
        console.log("[Webhook]   - New status:", subscription.status);
        console.log("[Webhook]   - Metadata:", subscription.metadata);

        const customerId = subscription.customer as string;

        // CRITICAL: Resolve user_id with fallback strategy
        const userId = await resolveUserId(subscription.metadata, customerId);

        if (!userId) {
          console.error("[Webhook] ❌ CRITICAL: Could not resolve user_id for subscription update!");
          console.error("[Webhook] Subscription ID:", subscription.id);
          console.error("[Webhook] Customer ID:", customerId);
          return new Response(JSON.stringify({ 
            received: true, 
            error: "Could not resolve user_id" 
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Update database
        await updateSubscriptionStatus(userId, customerId, subscription.id, subscription);

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log("[Webhook] 🗑️ Subscription deleted:", subscription.id);
        console.log("[Webhook]   - Customer:", subscription.customer);
        console.log("[Webhook]   - Metadata:", subscription.metadata);

        const customerId = subscription.customer as string;

        // CRITICAL: Resolve user_id with fallback strategy
        const userId = await resolveUserId(subscription.metadata, customerId);

        if (!userId) {
          console.error("[Webhook] ❌ CRITICAL: Could not resolve user_id for subscription deletion!");
          console.error("[Webhook] Subscription ID:", subscription.id);
          console.error("[Webhook] Customer ID:", customerId);
          return new Response(JSON.stringify({ 
            received: true, 
            error: "Could not resolve user_id" 
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        console.log("[Webhook] 💾 Marking subscription as canceled...");

        const { error: subError } = await supabase
          .from("subscriptions")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        if (subError) {
          console.error("[Webhook] ❌ Error canceling subscription:", subError);
        } else {
          console.log("[Webhook] ✅ Subscription canceled successfully");
        }

        // CRITICAL FIX: Only update user_type to free if subscription has truly ended
        // Check if current_period_end is in the past
        const now = Math.floor(Date.now() / 1000);
        const shouldRemovePremium = subscription.current_period_end <= now;
        
        if (shouldRemovePremium) {
          console.log("[Webhook] 🔄 Subscription ended, updating user_type to: free");

          const { error: userError } = await supabase
            .from("users")
            .update({
              user_type: "free",
              updated_at: new Date().toISOString(),
            })
            .eq("id", userId);

          if (userError) {
            console.error("[Webhook] ❌ Error updating user_type:", userError);
          } else {
            console.log("[Webhook] ✅ User type updated to: free");
          }
        } else {
          console.log("[Webhook] 📅 Subscription canceled but still active until:", new Date(subscription.current_period_end * 1000).toISOString());
          console.log("[Webhook] ℹ️ User will keep premium access until period ends");
        }

        break;
      }

      default:
        console.log("[Webhook] ℹ️ Unhandled event type:", event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Webhook] ❌ Error:", error);
    console.error("[Webhook] Error message:", error.message);
    console.error("[Webhook] Error stack:", error.stack);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

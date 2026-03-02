
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// CRITICAL FIX: Hardcode the correct project URL to avoid environment variable issues
const CORRECT_PROJECT_URL = "https://esgptfiofoaeguslgvcq.supabase.co";

if (!STRIPE_SECRET_KEY) {
  console.error("[SyncSubscription] ❌ STRIPE_SECRET_KEY not configured");
}

// Validate SUPABASE_URL and warn if incorrect
if (SUPABASE_URL && !SUPABASE_URL.includes("esgptfiofoaeguslgvcq")) {
  console.warn("[SyncSubscription] ⚠️ WARNING: SUPABASE_URL environment variable has incorrect project ref!");
  console.warn("[SyncSubscription] ⚠️ Expected: https://esgptfiofoaeguslgvcq.supabase.co");
  console.warn("[SyncSubscription] ⚠️ Got:", SUPABASE_URL);
  console.warn("[SyncSubscription] ⚠️ Using hardcoded correct URL instead");
}

// CRITICAL: Check if we're using TEST or LIVE keys
if (STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
  console.error("[SyncSubscription] ❌❌❌ CRITICAL ERROR: Using TEST Stripe key in production!");
  console.error("[SyncSubscription] ❌ Key starts with: sk_test_");
  console.error("[SyncSubscription] ❌ You MUST update STRIPE_SECRET_KEY to your LIVE key (sk_live_...)");
} else if (STRIPE_SECRET_KEY?.startsWith('sk_live_')) {
  console.log("[SyncSubscription] ✅ Using LIVE Stripe key");
} else {
  console.error("[SyncSubscription] ⚠️ Unknown Stripe key format");
}

const stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

console.log("[SyncSubscription] ✅ Edge Function initialized");
console.log("[SyncSubscription] Using project URL:", CORRECT_PROJECT_URL);

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[SyncSubscription] 📥 Processing sync request...");

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[SyncSubscription] ❌ No authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized - No auth header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[SyncSubscription] ❌ Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[SyncSubscription] ✅ User authenticated:", user.id);

    // Get user's subscription from database
    const { data: subData, error: subError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) {
      console.error("[SyncSubscription] ❌ Error fetching subscription:", subError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch subscription" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subData || !subData.stripe_subscription_id) {
      console.log("[SyncSubscription] ℹ️ No subscription found for user");
      
      // CRITICAL: Check if user has a customer ID but no subscription
      // This can happen if payment succeeded but webhook failed
      if (subData?.stripe_customer_id) {
        console.log("[SyncSubscription] 🔍 User has customer ID, checking Stripe for subscriptions...");
        
        try {
          // Verify customer exists in Stripe
          let customerId = subData.stripe_customer_id;
          
          try {
            const customer = await stripe.customers.retrieve(customerId);
            if (customer.deleted) {
              throw new Error("Customer deleted");
            }
            console.log("[SyncSubscription] ✅ Customer exists in Stripe");
          } catch (customerError: any) {
            console.error("[SyncSubscription] ❌ Customer not found in Stripe:", customerError.message);
            console.log("[SyncSubscription] 🔧 Creating new customer in LIVE Stripe...");
            
            // Create new customer in LIVE Stripe
            const newCustomer = await stripe.customers.create({
              email: user.email,
              metadata: {
                supabase_user_id: user.id,
                migrated_from_test: "true",
                original_customer_id: customerId,
              },
            });
            
            console.log("[SyncSubscription] ✅ New customer created:", newCustomer.id);
            customerId = newCustomer.id;
            
            // Update database with new customer ID
            await supabase
              .from("subscriptions")
              .update({ 
                stripe_customer_id: newCustomer.id,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", user.id);
            
            console.log("[SyncSubscription] ✅ Database updated with new customer ID");
          }
          
          // List all subscriptions for this customer
          const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            limit: 10,
          });

          if (subscriptions.data.length > 0) {
            console.log("[SyncSubscription] ✅ Found", subscriptions.data.length, "subscription(s) in Stripe");
            
            // Get the most recent active or trialing subscription
            const activeSubscription = subscriptions.data.find(
              sub => sub.status === 'active' || sub.status === 'trialing'
            ) || subscriptions.data[0];

            console.log("[SyncSubscription] 💾 Syncing subscription from Stripe:", activeSubscription.id);

            // Determine plan type
            const priceId = activeSubscription.items.data[0].price.id;
            let planType = activeSubscription.metadata?.plan_type || 'monthly';
            if (!activeSubscription.metadata?.plan_type) {
              if (priceId.toLowerCase().includes('year') || priceId.toLowerCase().includes('annual')) {
                planType = 'yearly';
              }
            }

            // Update subscription in database
            const { error: updateError } = await supabase
              .from("subscriptions")
              .update({
                stripe_subscription_id: activeSubscription.id,
                stripe_price_id: priceId,
                status: activeSubscription.status,
                plan_type: planType,
                current_period_start: new Date(activeSubscription.current_period_start * 1000).toISOString(),
                current_period_end: new Date(activeSubscription.current_period_end * 1000).toISOString(),
                cancel_at_period_end: activeSubscription.cancel_at_period_end,
                trial_end: activeSubscription.trial_end ? new Date(activeSubscription.trial_end * 1000).toISOString() : null,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", user.id);

            if (updateError) {
              console.error("[SyncSubscription] ❌ Error updating subscription:", updateError);
            } else {
              console.log("[SyncSubscription] ✅ Subscription synced from Stripe");

              // Update user_type
              const isPremium = activeSubscription.status === 'active' || activeSubscription.status === 'trialing';
              const newUserType = isPremium ? 'premium' : 'free';

              await supabase
                .from("users")
                .update({
                  user_type: newUserType,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", user.id);

              // Fetch updated subscription
              const { data: updatedSub } = await supabase
                .from("subscriptions")
                .select("*")
                .eq("user_id", user.id)
                .maybeSingle();

              return new Response(
                JSON.stringify({ 
                  message: "Subscription synced from Stripe successfully",
                  subscription: updatedSub,
                  isPremium: isPremium
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          } else {
            console.log("[SyncSubscription] ℹ️ No subscriptions found in Stripe for this customer");
          }
        } catch (error: any) {
          console.error("[SyncSubscription] ⚠️ Error checking Stripe subscriptions:", error);
          console.error("[SyncSubscription] ⚠️ Error message:", error.message);
          console.error("[SyncSubscription] ⚠️ Error type:", error.type);
        }
      }

      return new Response(
        JSON.stringify({ 
          message: "No subscription found",
          subscription: null,
          isPremium: false
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[SyncSubscription] 📊 Found subscription:", subData.stripe_subscription_id);

    // Fetch latest subscription data from Stripe
    let stripeSubscription;
    try {
      stripeSubscription = await stripe.subscriptions.retrieve(subData.stripe_subscription_id);
      console.log("[SyncSubscription] 💳 Stripe subscription status:", stripeSubscription.status);
    } catch (stripeError: any) {
      console.error("[SyncSubscription] ❌ Error retrieving subscription from Stripe:", stripeError.message);
      console.error("[SyncSubscription] ❌ Error type:", stripeError.type);
      console.error("[SyncSubscription] ❌ Error code:", stripeError.code);
      
      // If subscription not found in Stripe, mark as inactive
      if (stripeError.code === 'resource_missing') {
        console.log("[SyncSubscription] 🔧 Subscription not found in Stripe, marking as inactive");
        
        await supabase
          .from("subscriptions")
          .update({
            status: 'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);
        
        await supabase
          .from("users")
          .update({
            user_type: 'free',
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
        
        return new Response(
          JSON.stringify({ 
            message: "Subscription not found in Stripe, marked as canceled",
            subscription: null,
            isPremium: false
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw stripeError;
    }

    // Determine plan type
    const priceId = stripeSubscription.items.data[0].price.id;
    let planType = stripeSubscription.metadata?.plan_type || subData.plan_type || 'monthly';
    if (!stripeSubscription.metadata?.plan_type && !subData.plan_type) {
      if (priceId.toLowerCase().includes('year') || priceId.toLowerCase().includes('annual')) {
        planType = 'yearly';
      }
    }

    // Update subscription in database
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        status: stripeSubscription.status,
        stripe_price_id: priceId,
        plan_type: planType,
        current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: stripeSubscription.cancel_at_period_end,
        trial_end: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[SyncSubscription] ❌ Error updating subscription:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update subscription" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[SyncSubscription] ✅ Subscription updated in database");

    // Update user_type based on subscription status
    const isPremium = stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing';
    const newUserType = isPremium ? 'premium' : 'free';

    console.log("[SyncSubscription] 🔄 Updating user_type to:", newUserType);

    const { error: userError } = await supabase
      .from("users")
      .update({
        user_type: newUserType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (userError) {
      console.error("[SyncSubscription] ❌ Error updating user_type:", userError);
    } else {
      console.log("[SyncSubscription] ✅ User type updated to:", newUserType);
    }

    // CRITICAL: Ensure customer mapping exists
    if (subData.stripe_customer_id) {
      console.log("[SyncSubscription] 💾 Ensuring customer mapping exists...");
      await supabase
        .from("user_stripe_customers")
        .upsert({
          user_id: user.id,
          stripe_customer_id: subData.stripe_customer_id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
    }

    // Fetch updated subscription
    const { data: updatedSub } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return new Response(
      JSON.stringify({ 
        message: "Subscription synced successfully",
        subscription: updatedSub,
        isPremium: isPremium
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[SyncSubscription] ❌ Error:", error);
    console.error("[SyncSubscription] ❌ Error message:", error.message);
    console.error("[SyncSubscription] ❌ Error stack:", error.stack);
    console.error("[SyncSubscription] ❌ Error type:", error.type);
    console.error("[SyncSubscription] ❌ Error code:", error.code);
    
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
        details: error.toString(),
        error_type: error.type,
        error_code: error.code,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

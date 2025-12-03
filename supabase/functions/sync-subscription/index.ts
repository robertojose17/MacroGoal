
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

console.log("[Sync] ✅ Edge Function initialized");

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[Sync] 📥 Processing sync request...");

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[Sync] ❌ No authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized - No auth header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[Sync] ❌ Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Sync] ✅ User authenticated:", user.id);

    // Get user's subscription from database
    const { data: subData, error: subError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) {
      console.error("[Sync] ❌ Error fetching subscription:", subError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch subscription" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subData || !subData.stripe_subscription_id) {
      console.log("[Sync] ℹ️ No active subscription found in database");
      
      // Update user_type to free if no subscription
      await supabase
        .from("users")
        .update({ user_type: "free", updated_at: new Date().toISOString() })
        .eq("id", user.id);

      return new Response(
        JSON.stringify({ 
          message: "No active subscription found",
          subscription: null,
          user_type: "free"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Sync] 🔍 Fetching subscription from Stripe:", subData.stripe_subscription_id);

    // Fetch latest subscription data from Stripe
    const subscription = await stripe.subscriptions.retrieve(subData.stripe_subscription_id);

    console.log("[Sync] 📊 Stripe subscription status:", subscription.status);

    // Update subscription in database
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        status: subscription.status,
        stripe_price_id: subscription.items.data[0].price.id,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[Sync] ❌ Error updating subscription:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update subscription" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Sync] ✅ Subscription updated in database");

    // Update user_type based on subscription status
    const isPremium = subscription.status === 'active' || subscription.status === 'trialing';
    const newUserType = isPremium ? 'premium' : 'free';

    console.log("[Sync] 🔄 Updating user_type to:", newUserType);

    const { error: userError } = await supabase
      .from("users")
      .update({
        user_type: newUserType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (userError) {
      console.error("[Sync] ❌ Error updating user_type:", userError);
    } else {
      console.log("[Sync] ✅ User type updated to:", newUserType);
    }

    return new Response(
      JSON.stringify({
        message: "Subscription synced successfully",
        subscription: {
          status: subscription.status,
          plan_type: subData.plan_type,
          current_period_end: subscription.current_period_end,
        },
        user_type: newUserType,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Sync] ❌ Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

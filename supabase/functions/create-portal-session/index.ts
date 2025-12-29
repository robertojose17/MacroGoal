
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// CRITICAL FIX: Hardcode the correct project URL to avoid environment variable issues
const CORRECT_PROJECT_URL = "https://esgptfiofoaeguslgvcq.supabase.co";

if (!STRIPE_SECRET_KEY) {
  console.error("[Portal] ❌ STRIPE_SECRET_KEY not configured");
}

// Validate SUPABASE_URL and warn if incorrect
if (SUPABASE_URL && !SUPABASE_URL.includes("esgptfiofoaeguslgvcq")) {
  console.warn("[Portal] ⚠️ WARNING: SUPABASE_URL environment variable has incorrect project ref!");
  console.warn("[Portal] ⚠️ Expected: https://esgptfiofoaeguslgvcq.supabase.co");
  console.warn("[Portal] ⚠️ Got:", SUPABASE_URL);
  console.warn("[Portal] ⚠️ Using hardcoded correct URL instead");
}

// CRITICAL: Check if we're using TEST or LIVE keys
if (STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
  console.error("[Portal] ❌❌❌ CRITICAL ERROR: Using TEST Stripe key in production!");
  console.error("[Portal] ❌ Key starts with: sk_test_");
  console.error("[Portal] ❌ You MUST update STRIPE_SECRET_KEY to your LIVE key (sk_live_...)");
} else if (STRIPE_SECRET_KEY?.startsWith('sk_live_')) {
  console.log("[Portal] ✅ Using LIVE Stripe key");
} else {
  console.error("[Portal] ⚠️ Unknown Stripe key format");
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

console.log("[Portal] ✅ Edge Function initialized");
console.log("[Portal] Using project URL:", CORRECT_PROJECT_URL);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[Portal] 📥 Processing request...");

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[Portal] ❌ No authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[Portal] ❌ Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Portal] ✅ User authenticated:", user.id);
    console.log("[Portal] User email:", user.email);

    // Get user's Stripe customer ID
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("user_id", user.id)
      .maybeSingle();

    console.log("[Portal] 📊 Subscription data:", subscription);

    if (!subscription?.stripe_customer_id) {
      console.error("[Portal] ❌ No Stripe customer ID found in database");
      console.error("[Portal] ❌ User needs to complete checkout first");
      return new Response(
        JSON.stringify({ 
          error: "No subscription found. Please subscribe first.",
          details: "No stripe_customer_id in database"
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Portal] 💳 Found customer ID:", subscription.stripe_customer_id);

    // CRITICAL FIX: Verify customer exists in Stripe LIVE
    // If customer doesn't exist (e.g., was created in TEST mode), create a new one
    let customerId = subscription.stripe_customer_id;
    
    try {
      console.log("[Portal] 🔍 Verifying customer exists in Stripe...");
      const customer = await stripe.customers.retrieve(customerId);
      
      if (customer.deleted) {
        console.error("[Portal] ❌ Customer was deleted in Stripe");
        throw new Error("Customer deleted");
      }
      
      console.log("[Portal] ✅ Customer exists in Stripe:", customer.id);
    } catch (error: any) {
      console.error("[Portal] ❌ Customer not found in Stripe:", error.message);
      console.log("[Portal] 🔧 Creating new customer in LIVE Stripe...");
      
      // Create new customer in LIVE Stripe
      try {
        const newCustomer = await stripe.customers.create({
          email: user.email,
          metadata: {
            supabase_user_id: user.id,
            migrated_from_test: "true",
            original_customer_id: customerId,
          },
        });
        
        console.log("[Portal] ✅ New customer created:", newCustomer.id);
        customerId = newCustomer.id;
        
        // Update database with new customer ID
        await supabase
          .from("subscriptions")
          .update({ 
            stripe_customer_id: newCustomer.id,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);
        
        console.log("[Portal] ✅ Database updated with new customer ID");
      } catch (createError: any) {
        console.error("[Portal] ❌ Failed to create new customer:", createError);
        return new Response(
          JSON.stringify({ 
            error: "Failed to create customer in Stripe",
            details: createError.message,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check if customer has any active subscriptions
    console.log("[Portal] 🔍 Checking for active subscriptions...");
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 10,
    });
    
    console.log("[Portal] 📊 Found", subscriptions.data.length, "subscription(s)");
    
    if (subscriptions.data.length === 0) {
      console.error("[Portal] ❌ No subscriptions found in Stripe");
      return new Response(
        JSON.stringify({ 
          error: "No active subscription found. Please subscribe first.",
          details: "Customer exists but has no subscriptions"
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For mobile apps, use deep link for return URL
    const appScheme = "elitemacrotracker://";
    const returnUrl = `${appScheme}profile?portal_return=true`;

    console.log("[Portal] 🔗 Return URL:", returnUrl);
    console.log("[Portal] 💳 Creating portal session for customer:", customerId);

    // Create portal session
    let session;
    try {
      session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      
      console.log("[Portal] ✅ Session created:", session.id);
      console.log("[Portal] 🔗 Portal URL:", session.url);
    } catch (stripeError: any) {
      console.error("[Portal] ❌ Stripe API error:", stripeError.message);
      console.error("[Portal] ❌ Error type:", stripeError.type);
      console.error("[Portal] ❌ Error code:", stripeError.code);
      console.error("[Portal] ❌ Full error:", JSON.stringify(stripeError, null, 2));
      
      return new Response(
        JSON.stringify({
          error: "Failed to create portal session",
          details: stripeError.message,
          stripe_error_type: stripeError.type,
          stripe_error_code: stripeError.code,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[Portal] ❌ Unexpected error:", error);
    console.error("[Portal] ❌ Error message:", error.message);
    console.error("[Portal] ❌ Error stack:", error.stack);
    
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
        details: error.toString(),
        stack: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

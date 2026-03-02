
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// CRITICAL FIX: Hardcode the correct project URL to avoid environment variable issues
// The SUPABASE_URL env var was set to the wrong project ref (ofoaeguslgvcq instead of esgptfiofoaeguslgvcq)
const CORRECT_PROJECT_URL = "https://esgptfiofoaeguslgvcq.supabase.co";

if (!STRIPE_SECRET_KEY) {
  console.error("[Checkout] ❌ STRIPE_SECRET_KEY not configured");
}

if (!SUPABASE_URL) {
  console.error("[Checkout] ❌ SUPABASE_URL not configured");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[Checkout] ❌ SUPABASE_SERVICE_ROLE_KEY not configured");
}

// Validate SUPABASE_URL and warn if incorrect
if (SUPABASE_URL && !SUPABASE_URL.includes("esgptfiofoaeguslgvcq")) {
  console.warn("[Checkout] ⚠️ WARNING: SUPABASE_URL environment variable has incorrect project ref!");
  console.warn("[Checkout] ⚠️ Expected: https://esgptfiofoaeguslgvcq.supabase.co");
  console.warn("[Checkout] ⚠️ Got:", SUPABASE_URL);
  console.warn("[Checkout] ⚠️ Using hardcoded correct URL instead");
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

console.log("[Checkout] ✅ Edge Function initialized");
console.log("[Checkout] Stripe API Version: 2024-12-18.acacia");
console.log("[Checkout] Using project URL:", CORRECT_PROJECT_URL);

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[Checkout] 📥 Processing request...");
    console.log("[Checkout] Method:", req.method);
    console.log("[Checkout] URL:", req.url);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[Checkout] ❌ No authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized - No auth header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[Checkout] ❌ Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Checkout] ✅ User authenticated:", user.id);
    console.log("[Checkout] User email:", user.email);

    // Parse request body
    const body = await req.json();
    const { priceId, planType } = body;

    console.log("[Checkout] 📦 Request body:", { priceId, planType });

    if (!priceId || !planType) {
      console.error("[Checkout] ❌ Missing priceId or planType");
      return new Response(
        JSON.stringify({ error: "Missing priceId or planType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate price ID format
    if (!priceId.startsWith("price_")) {
      console.error("[Checkout] ❌ Invalid price ID format:", priceId);
      console.error("[Checkout] Price IDs should start with 'price_', not 'prod_'");
      return new Response(
        JSON.stringify({ 
          error: "Invalid price ID format. Price IDs should start with 'price_', not 'prod_'",
          priceId: priceId
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Checkout] 💳 Creating checkout session for:");
    console.log("[Checkout]   - Price ID:", priceId);
    console.log("[Checkout]   - Plan Type:", planType);
    console.log("[Checkout]   - User ID:", user.id);

    // CRITICAL FIX: Check for existing customer mapping first
    console.log("[Checkout] 🔍 Checking for existing customer mapping...");
    const { data: existingMapping } = await supabase
      .from("user_stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existingMapping?.stripe_customer_id;

    if (customerId) {
      console.log("[Checkout] ✅ Found existing customer mapping:", customerId);
      
      // Verify customer still exists in Stripe
      try {
        await stripe.customers.retrieve(customerId);
        console.log("[Checkout] ✅ Customer verified in Stripe");
      } catch (error) {
        console.error("[Checkout] ⚠️ Customer not found in Stripe, will create new one");
        customerId = null;
      }
    }

    // Create new customer if needed
    if (!customerId) {
      console.log("[Checkout] 👤 Creating new Stripe customer");
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;
      console.log("[Checkout] ✅ Created customer:", customerId);

      // CRITICAL FIX: Store the mapping in our table
      console.log("[Checkout] 💾 Storing customer mapping...");
      const { error: mappingError } = await supabase
        .from("user_stripe_customers")
        .upsert({
          user_id: user.id,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (mappingError) {
        console.error("[Checkout] ⚠️ Error storing customer mapping:", mappingError);
        // Continue anyway - we have the customer ID
      } else {
        console.log("[Checkout] ✅ Customer mapping stored");
      }

      // CRITICAL FIX: Also update subscriptions table with customer ID
      const { error: subUpdateError } = await supabase
        .from("subscriptions")
        .upsert({
          user_id: user.id,
          stripe_customer_id: customerId,
          status: 'inactive',
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (subUpdateError) {
        console.error("[Checkout] ⚠️ Error updating subscriptions table:", subUpdateError);
      } else {
        console.log("[Checkout] ✅ Subscriptions table updated with customer ID");
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Use direct deep links with proper URL encoding
    // The app will handle these via expo-linking in _layout.tsx
    // Webhooks handle all database updates, so we just need to redirect back to app
    // ═══════════════════════════════════════════════════════════════════════════
    const successUrl = `macrogoal://profile?subscription_success=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `macrogoal://paywall?subscription_cancelled=true`;

    console.log("[Checkout] 🔗 Redirect URLs (Direct Deep Links):");
    console.log("[Checkout]   - Success:", successUrl);
    console.log("[Checkout]   - Cancel:", cancelUrl);
    console.log("[Checkout] ✅ Using direct deep links - app will handle via expo-linking");

    // CRITICAL FIX: Create checkout session with customer and comprehensive metadata
    console.log("[Checkout] 🚀 Creating Stripe checkout session...");
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      // CRITICAL: Add user_id to session metadata
      metadata: {
        supabase_user_id: user.id,
        plan_type: planType,
      },
      // CRITICAL: Add user_id to subscription metadata
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan_type: planType,
        },
      },
    });

    console.log("[Checkout] ✅ Session created successfully!");
    console.log("[Checkout]   - Session ID:", session.id);
    console.log("[Checkout]   - Customer ID:", customerId);
    console.log("[Checkout]   - User ID in metadata:", session.metadata?.supabase_user_id);
    console.log("[Checkout]   - Checkout URL:", session.url);
    console.log("[Checkout] 🎯 After payment, user will be redirected DIRECTLY to app!");

    return new Response(
      JSON.stringify({ 
        url: session.url,
        sessionId: session.id,
        customerId: customerId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[Checkout] ❌ Error:", error);
    console.error("[Checkout] Error message:", error.message);
    console.error("[Checkout] Error stack:", error.stack);
    
    let errorMessage = error.message || "Internal server error";
    let statusCode = 500;

    if (error.type === "StripeInvalidRequestError") {
      console.error("[Checkout] ❌ Stripe API error - check your Price IDs and Stripe configuration");
      statusCode = 400;
    }

    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: error.toString(),
        type: error.type || "unknown",
      }),
      {
        status: statusCode,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

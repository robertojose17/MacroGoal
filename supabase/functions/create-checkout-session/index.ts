
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!STRIPE_SECRET_KEY) {
  console.error("[Checkout] ❌ STRIPE_SECRET_KEY not configured");
}

if (!SUPABASE_URL) {
  console.error("[Checkout] ❌ SUPABASE_URL not configured");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[Checkout] ❌ SUPABASE_SERVICE_ROLE_KEY not configured");
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

    // Check if user already has a Stripe customer ID
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id;

    // Create or retrieve Stripe customer
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
    } else {
      console.log("[Checkout] ✅ Using existing customer:", customerId);
    }

    // For mobile apps, we need to use deep links or a web URL that can redirect
    // Using the app's deep link scheme: elitemacrotracker://
    const appScheme = "elitemacrotracker://";
    const successUrl = `${appScheme}profile?session_id={CHECKOUT_SESSION_ID}&subscription_success=true`;
    const cancelUrl = `${appScheme}paywall?subscription_cancelled=true`;

    console.log("[Checkout] 🔗 Redirect URLs:");
    console.log("[Checkout]   - Success:", successUrl);
    console.log("[Checkout]   - Cancel:", cancelUrl);

    // Create checkout session
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
      metadata: {
        supabase_user_id: user.id,
        plan_type: planType,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan_type: planType,
        },
      },
    });

    console.log("[Checkout] ✅ Session created successfully!");
    console.log("[Checkout]   - Session ID:", session.id);
    console.log("[Checkout]   - Checkout URL:", session.url);

    return new Response(
      JSON.stringify({ 
        url: session.url,
        sessionId: session.id
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
    
    // Provide more specific error messages
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


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

    // Get user's Stripe customer ID
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!subscription?.stripe_customer_id) {
      console.error("[Portal] ❌ No Stripe customer ID found");
      return new Response(
        JSON.stringify({ error: "No subscription found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Portal] 💳 Creating portal session for customer:", subscription.stripe_customer_id);

    // For mobile apps, use deep link for return URL
    const appScheme = "elitemacrotracker://";
    const returnUrl = `${appScheme}profile?portal_return=true`;

    console.log("[Portal] 🔗 Return URL:", returnUrl);

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl,
    });

    console.log("[Portal] ✅ Session created:", session.id);
    console.log("[Portal] 🔗 Portal URL:", session.url);

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[Portal] ❌ Error:", error);
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

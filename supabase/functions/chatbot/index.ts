
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Use a vision-capable model for multimodal support
const DEFAULT_MODEL = "openai/gpt-4o-mini";

console.log("[Chatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("[Chatbot] Edge Function initializing...");
console.log("[Chatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// CRITICAL: Validate environment variables on startup
if (!SUPABASE_URL) {
  console.error("[Chatbot] ❌ CRITICAL: SUPABASE_URL environment variable is missing!");
} else {
  console.log("[Chatbot] ✅ SUPABASE_URL:", SUPABASE_URL);
}

if (!SERVICE_ROLE) {
  console.error("[Chatbot] ❌ CRITICAL: SUPABASE_SERVICE_ROLE_KEY environment variable is missing!");
} else {
  console.log("[Chatbot] ✅ SUPABASE_SERVICE_ROLE_KEY: [REDACTED]");
}

if (!OPENROUTER_API_KEY) {
  console.error("[Chatbot] ❌ CRITICAL: OPENROUTER_API_KEY environment variable is missing!");
  console.error("[Chatbot] ❌ The chatbot will not work without this key!");
  console.error("[Chatbot] ❌ Please set it in Supabase Dashboard → Settings → Edge Functions → Secrets");
} else {
  console.log("[Chatbot] ✅ OPENROUTER_API_KEY: [REDACTED - length:", OPENROUTER_API_KEY.length, "]");
}

console.log("[Chatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
  auth: {
    persistSession: false
  }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

/**
 * Extract JSON from AI response and separate it from natural language
 */
function extractJsonAndDescription(content: string): { json: any | null; description: string } {
  try {
    // Try to find JSON in code block
    const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      try {
        const json = JSON.parse(jsonBlockMatch[1].trim());
        // Remove the JSON block from the content to get the description
        const description = content.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
        return { json, description: description || 'Meal estimate complete.' };
      } catch (e) {
        console.log('[Chatbot] Failed to parse JSON from code block');
      }
    }
    
    // Try to find raw JSON object
    const jsonMatch = content.match(/\{[\s\S]*"ingredients"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const json = JSON.parse(jsonMatch[0]);
        // Remove the JSON from the content to get the description
        const description = content.replace(/\{[\s\S]*"ingredients"[\s\S]*\}/, '').trim();
        return { json, description: description || 'Meal estimate complete.' };
      } catch (e) {
        console.log('[Chatbot] Failed to parse raw JSON');
      }
    }
    
    // No JSON found, return the whole content as description
    return { json: null, description: content };
  } catch (error) {
    console.error('[Chatbot] Error extracting JSON:', error);
    return { json: null, description: content };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log("[Chatbot] 📋 CORS preflight request");
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log("[Chatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("[Chatbot] 📥 New request:", requestId);
  console.log("[Chatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    if (req.method !== "POST") {
      console.error("[Chatbot] ❌ Method not allowed:", req.method);
      return new Response(JSON.stringify({
        error: "Method Not Allowed",
        detail: `Expected POST, got ${req.method}`
      }), {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // CRITICAL: Check if OPENROUTER_API_KEY is configured
    if (!OPENROUTER_API_KEY) {
      console.error("[Chatbot] ❌ OPENROUTER_API_KEY not configured!");
      return new Response(JSON.stringify({
        error: "Configuration Error",
        detail: "OPENROUTER_API_KEY environment variable is not set. Please configure it in Supabase Dashboard."
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // Auth check
    const auth = req.headers.get("Authorization") || "";
    console.log("[Chatbot] 🔐 Checking authorization...");
    
    if (!auth) {
      console.error("[Chatbot] ❌ No authorization header");
      return new Response(JSON.stringify({
        error: "Unauthorized",
        detail: "No authorization header provided"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    const token = auth.replace("Bearer ", "");
    const { data: user, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user?.user) {
      console.error("[Chatbot] ❌ Authentication failed:", authError?.message);
      return new Response(JSON.stringify({
        error: "Unauthorized",
        detail: authError?.message || "Invalid authentication token"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    console.log("[Chatbot] ✅ User authenticated:", user.user.id);

    // CRITICAL: Check subscription status
    console.log("[Chatbot] 🔍 Checking subscription status...");
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.user.id)
      .maybeSingle();

    if (subError) {
      console.error("[Chatbot] ⚠️ Error checking subscription:", subError);
      // Continue anyway - don't block on subscription check errors
    } else if (!subscription || (subscription.status !== 'active' && subscription.status !== 'trialing')) {
      console.error("[Chatbot] ❌ User does not have active subscription");
      console.error("[Chatbot] User ID:", user.user.id);
      console.error("[Chatbot] Subscription status:", subscription?.status || 'none');
      return new Response(JSON.stringify({
        error: "Subscription Required",
        detail: "An active subscription is required to use the AI chatbot. Please subscribe to continue.",
        subscription_status: subscription?.status || 'none'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    console.log("[Chatbot] ✅ Subscription verified:", subscription.status);

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error("[Chatbot] ❌ Invalid JSON in request body:", e);
      return new Response(JSON.stringify({
        error: "Invalid Request",
        detail: "Request body must be valid JSON"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    const messages = body.messages || [];
    const images = body.images || []; // Array of base64 data URLs
    const model = body.model || DEFAULT_MODEL;
    const temperature = body.temperature ?? 0.7;
    const max_tokens = body.max_tokens ?? 1500;

    console.log("[Chatbot] 📦 Request parameters:");
    console.log("[Chatbot]   - Messages:", messages.length);
    console.log("[Chatbot]   - Images:", images.length);
    console.log("[Chatbot]   - Model:", model);
    console.log("[Chatbot]   - Temperature:", temperature);
    console.log("[Chatbot]   - Max tokens:", max_tokens);

    if (!messages || messages.length === 0) {
      console.error("[Chatbot] ❌ No messages provided");
      return new Response(JSON.stringify({
        error: "Invalid Request",
        detail: "Messages array is required and cannot be empty"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    console.log("[Chatbot] 🤖 Calling OpenRouter API...");
    console.log("[Chatbot]   - URL:", `${OPENROUTER_BASE_URL}/chat/completions`);
    console.log("[Chatbot]   - Model:", model);
    const started = performance.now();

    // Build messages array with multimodal support
    // Convert messages to OpenRouter format, adding images to the last user message
    const apiMessages = messages.map((msg: any, index: number) => {
      // If this is the last user message and we have images, make it multimodal
      if (msg.role === "user" && index === messages.length - 1 && images.length > 0) {
        const content: any[] = [
          { type: "text", text: msg.content }
        ];
        
        // Add all images
        images.forEach((imageUrl: string) => {
          content.push({
            type: "image_url",
            image_url: {
              url: imageUrl
            }
          });
        });
        
        return {
          role: msg.role,
          content: content
        };
      }
      
      // Regular text message
      return {
        role: msg.role,
        content: msg.content
      };
    });

    console.log("[Chatbot] 📤 Sending request to OpenRouter...");

    // Call OpenRouter API
    let chatRes;
    try {
      chatRes = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": SUPABASE_URL!,
          "X-Title": "Elite Macro Tracker"
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          temperature,
          max_tokens
        })
      });
    } catch (fetchError: any) {
      console.error("[Chatbot] ❌ Network error calling OpenRouter:", fetchError);
      console.error("[Chatbot] Error type:", fetchError.constructor.name);
      console.error("[Chatbot] Error message:", fetchError.message);
      return new Response(JSON.stringify({
        error: "Network Error",
        detail: `Failed to connect to OpenRouter API: ${fetchError.message}`,
        request_id: requestId
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    console.log("[Chatbot] 📥 OpenRouter response received");
    console.log("[Chatbot]   - Status:", chatRes.status);
    console.log("[Chatbot]   - Status text:", chatRes.statusText);

    if (!chatRes.ok) {
      const errorText = await chatRes.text();
      console.error("[Chatbot] ❌ OpenRouter API error:");
      console.error("[Chatbot]   - Status:", chatRes.status);
      console.error("[Chatbot]   - Status text:", chatRes.statusText);
      console.error("[Chatbot]   - Response body:", errorText);
      
      // Try to parse error as JSON
      let errorDetail = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.error?.message || errorJson.message || errorText;
      } catch (e) {
        // Not JSON, use raw text
      }

      return new Response(JSON.stringify({
        error: "OpenRouter API Error",
        detail: errorDetail,
        status_code: chatRes.status,
        request_id: requestId
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    let json;
    try {
      json = await chatRes.json();
    } catch (e) {
      console.error("[Chatbot] ❌ Failed to parse OpenRouter response as JSON:", e);
      return new Response(JSON.stringify({
        error: "Invalid Response",
        detail: "OpenRouter returned invalid JSON",
        request_id: requestId
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    console.log("[Chatbot] ✅ OpenRouter response parsed");

    const rawMessage = json?.choices?.[0]?.message?.content ?? "";
    if (!rawMessage) {
      console.error("[Chatbot] ❌ Empty response from OpenRouter");
      console.error("[Chatbot] Response structure:", JSON.stringify(json, null, 2));
      return new Response(JSON.stringify({
        error: "Empty Response",
        detail: "OpenRouter returned an empty completion",
        request_id: requestId
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // Extract JSON and description from the AI response
    const { json: mealData, description } = extractJsonAndDescription(rawMessage);
    
    console.log("[Chatbot] 📊 Extracted data:");
    console.log("[Chatbot]   - Has meal data:", !!mealData);
    console.log("[Chatbot]   - Description length:", description.length);

    const duration_ms = Math.round(performance.now() - started);
    console.log("[Chatbot] ✅ Request completed successfully");
    console.log("[Chatbot]   - Duration:", duration_ms, "ms");
    console.log("[Chatbot]   - Response length:", rawMessage.length, "characters");
    console.log("[Chatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Return both the display message and the structured data
    const response = {
      message: description, // Only the natural language description
      mealData: mealData, // The structured JSON data (null if not found)
      model,
      duration_ms
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (e: any) {
    console.error("[Chatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("[Chatbot] ❌ UNHANDLED ERROR");
    console.error("[Chatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("[Chatbot] Error type:", e.constructor.name);
    console.error("[Chatbot] Error message:", e.message);
    console.error("[Chatbot] Error stack:", e.stack);
    console.error("[Chatbot] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    return new Response(JSON.stringify({
      error: "Internal Server Error",
      detail: String(e.message || e),
      type: e.constructor.name,
      request_id: requestId
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});

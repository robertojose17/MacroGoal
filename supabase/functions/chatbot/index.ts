
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Default model - you can change this to any OpenRouter supported model
const DEFAULT_MODEL = "openai/gpt-4o-mini";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: {
    persistSession: false
  }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

console.log("[Chatbot] Edge Function initialized");

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({
        error: "Method Not Allowed"
      }), {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // Auth check
    const auth = req.headers.get("Authorization") || "";
    const { data: user } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user?.user) {
      console.log("[Chatbot] Unauthorized request");
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    console.log("[Chatbot] Processing request for user:", user.user.id);

    // Parse request body
    const body = await req.json();
    const messages = body.messages || [];
    const model = body.model || DEFAULT_MODEL;
    const temperature = body.temperature ?? 0.7;
    const max_tokens = body.max_tokens ?? 1500;

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({
        error: "Messages array is required"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    console.log("[Chatbot] Calling OpenRouter with model:", model);
    const started = performance.now();

    // Call OpenRouter API
    const chatRes = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SUPABASE_URL,
        "X-Title": "Elite Macro Tracker"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens
      })
    });

    if (!chatRes.ok) {
      const errorText = await chatRes.text();
      console.error("[Chatbot] OpenRouter error:", errorText);
      return new Response(JSON.stringify({
        error: "OpenRouter request failed",
        detail: errorText
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    const json = await chatRes.json();
    console.log("[Chatbot] OpenRouter response received");

    const message = json?.choices?.[0]?.message?.content ?? "";
    if (!message) {
      console.error("[Chatbot] Empty response from OpenRouter");
      return new Response(JSON.stringify({
        error: "Empty completion from provider"
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    const duration_ms = Math.round(performance.now() - started);
    console.log("[Chatbot] Request completed in", duration_ms, "ms");

    const response = {
      message,
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
  } catch (e) {
    console.error("[Chatbot] Unhandled error:", e);
    return new Response(JSON.stringify({
      error: "Unhandled error",
      detail: String(e)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildSystemPrompt } from "./prompt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openai/gpt-4o-mini";

const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
  auth: { persistSession: false }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

interface UserPreferences {
  dietary_restrictions?: string[];
  protein_preferences?: string[];
  carb_preferences?: string[];
  fat_preferences?: string[];
  disliked_foods?: string;
  cooking_level?: string;
}

async function fetchRecipePool(preferences: UserPreferences | null): Promise<any[]> {
  try {
    let query = supabase.from("meal_recipes").select("*");

    // Filter by dietary restrictions
    if (preferences?.dietary_restrictions && preferences.dietary_restrictions.length > 0) {
      // Include recipes that have ALL required dietary tags OR have empty tags (flexible)
      // We do a soft filter: prefer matching but don't hard-exclude
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      console.log("[MealPlan] No recipes in pool, using defaults");
      return [];
    }

    // Filter out disliked foods
    let filtered = data;
    if (preferences?.disliked_foods) {
      const dislikes = preferences.disliked_foods.toLowerCase().split(/[,\s]+/).filter(Boolean);
      filtered = data.filter((r: any) => {
        const nameAndDesc = (r.name + " " + r.description).toLowerCase();
        return !dislikes.some((d: string) => nameAndDesc.includes(d));
      });
    }

    // Filter by dietary restrictions (hard filter)
    if (preferences?.dietary_restrictions && preferences.dietary_restrictions.length > 0) {
      const restrictions = preferences.dietary_restrictions;
      const strictFiltered = filtered.filter((r: any) => {
        const tags: string[] = r.dietary_tags || [];
        return restrictions.every((restriction: string) => tags.includes(restriction));
      });
      // Only apply strict filter if it leaves enough recipes
      if (strictFiltered.length >= 12) {
        filtered = strictFiltered;
      }
    }

    // No cuisine_preferences anymore — use all filtered recipes
    let preferred = filtered;

    // Shuffle and pick a diverse subset
    const shuffled = shuffle(preferred);

    // Pick 5-6 per meal type for variety
    const byType: Record<string, any[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const r of shuffled) {
      const type = r.meal_type as string;
      if (byType[type] && byType[type].length < 6) {
        byType[type].push(r);
      }
    }

    return [
      ...byType.breakfast,
      ...byType.lunch,
      ...byType.dinner,
      ...byType.snack,
    ];
  } catch (err) {
    console.error("[MealPlan] Error fetching recipe pool:", err);
    return [];
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchSkinnytasteInspiration(
  userGoals: { daily_calories: number; daily_protein: number; daily_carbs: number; daily_fats: number },
  preferences: UserPreferences | null
): Promise<string> {
  try {
    // Build targeted Skinnytaste URLs based on meal types and calorie range
    const mealCalories = Math.round(userGoals.daily_calories / 3); // approx per-meal calories

    // Pick a random category page to get variety each time
    const categories = [
      'https://www.skinnytaste.com/recipes/dinner-recipes/',
      'https://www.skinnytaste.com/recipes/lunch-recipes/',
      'https://www.skinnytaste.com/recipes/breakfast-recipes/',
      'https://www.skinnytaste.com/recipes/chicken-recipes/',
      'https://www.skinnytaste.com/recipes/fish-recipes/',
      'https://www.skinnytaste.com/recipes/vegetarian-recipes/',
      'https://www.skinnytaste.com/recipes/meal-prep/',
      'https://www.skinnytaste.com/recipes/high-protein-recipes/',
    ];

    // Filter categories based on dietary preferences
    let availableCategories = [...categories];
    if (preferences?.dietary_restrictions?.includes('vegetarian') || preferences?.dietary_restrictions?.includes('vegan')) {
      availableCategories = availableCategories.filter(u => u.includes('vegetarian') || u.includes('breakfast') || u.includes('lunch'));
    }

    // Pick 2 random categories for variety
    const shuffled = availableCategories.sort(() => Math.random() - 0.5);
    const selectedUrls = shuffled.slice(0, 2);

    const results: string[] = [];

    for (const url of selectedUrls) {
      try {
        const jinaUrl = `https://r.jina.ai/${url}`;
        const response = await fetch(jinaUrl, {
          headers: {
            'Accept': 'text/plain',
            'X-Return-Format': 'text',
            'User-Agent': 'Mozilla/5.0 (compatible; MacroGoalApp/1.0)',
            'X-No-Cache': 'true',
          },
          signal: AbortSignal.timeout(15000), // increased to 15 seconds
        });

        if (!response.ok) {
          console.log('[MealPlan] Jina returned', response.status, 'for', url);
          continue;
        }

        const text = await response.text();
        console.log('[MealPlan] Jina fetched', url, '- content length:', text.length);

        const truncated = text.slice(0, 5000);
        results.push(truncated);
      } catch (err) {
        console.log('[MealPlan] Jina fetch failed for', url, '- skipping:', err);
        continue;
      }
    }

    if (results.length === 0) return '';

    return `SKINNYTASTE LIVE CONTENT (scraped right now from skinnytaste.com):\n\n` + results.join('\n\n---\n\n');
  } catch (err) {
    console.log('[MealPlan] fetchSkinnytasteInspiration failed - continuing without it');
    return '';
  }
}


function parseMealPlanResponse(content: string): {
  message: string;
  planData: any | null;
  readyToSave: boolean;
  summary: string | null;
} {
  const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = jsonBlockMatch ? jsonBlockMatch[1].trim() : content.trim();

  const attempts = [candidate, content.trim()];
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (parsed.ready_to_save === true && parsed.plan) {
        return {
          message: parsed.summary || "Your meal plan is ready!",
          planData: parsed.plan,
          readyToSave: true,
          summary: parsed.summary || null
        };
      }
    } catch (_) {}
  }

  const jsonObjectMatch = content.match(/\{[\s\S]*"ready_to_save"[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      const parsed = JSON.parse(jsonObjectMatch[0]);
      if (parsed.ready_to_save === true && parsed.plan) {
        return {
          message: parsed.summary || "Your meal plan is ready!",
          planData: parsed.plan,
          readyToSave: true,
          summary: parsed.summary || null
        };
      }
    } catch (_) {}
  }

  return {
    message: content,
    planData: null,
    readyToSave: false,
    summary: null
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log("[MealPlan] New request:", requestId);

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({
        error: "Configuration Error",
        detail: "OPENROUTER_API_KEY is not configured."
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const auth = req.headers.get("Authorization") || "";
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized", detail: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const token = auth.replace("Bearer ", "");
    const { data: user, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized", detail: authError?.message || "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log("[MealPlan] User authenticated:", user.user.id);

    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid Request", detail: "Request body must be valid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const messages: Array<{ role: string; content: string }> = body.messages || [];
    const userGoals = body.userGoals || {
      daily_calories: 2000,
      daily_protein: 150,
      daily_carbs: 200,
      daily_fats: 65
    };
    const userPreferences: UserPreferences | null = body.userPreferences || null;

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid Request", detail: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fetch recipe pool from DB (only on first message / GENERATE_PLAN)
    const isFirstMessage = messages.length === 1;
    const [recipePool, skinnytasteContent] = isFirstMessage
      ? await Promise.all([
          Promise.resolve([]), // local recipe pool disabled — using Skinnytaste only
          fetchSkinnytasteInspiration(userGoals, userPreferences),
        ])
      : [[], ''];
    console.log('[MealPlan] Recipe pool size:', recipePool.length, '| Skinnytaste content length:', skinnytasteContent.length);

    const systemPrompt = buildSystemPrompt(userGoals, recipePool, userPreferences, skinnytasteContent);
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg: any) => ({ role: msg.role, content: msg.content }))
    ];

    console.log("[MealPlan] Calling OpenRouter with", apiMessages.length, "messages");
    const started = performance.now();

    let chatRes;
    try {
      chatRes = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": SUPABASE_URL!,
          "X-Title": "Macro Goal Meal Planner"
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: apiMessages,
          temperature: 0.95,
          max_tokens: 2000
        })
      });
    } catch (fetchError: any) {
      return new Response(JSON.stringify({
        error: "Network Error",
        detail: `Failed to connect to OpenRouter: ${fetchError.message}`,
        request_id: requestId
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!chatRes.ok) {
      const errorText = await chatRes.text();
      let errorDetail = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.error?.message || errorJson.message || errorText;
      } catch (_) {}
      return new Response(JSON.stringify({
        error: "OpenRouter API Error",
        detail: errorDetail,
        status_code: chatRes.status,
        request_id: requestId
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let jsonResp: any;
    try {
      jsonResp = await chatRes.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid Response", detail: "OpenRouter returned invalid JSON" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const rawMessage: string = jsonResp?.choices?.[0]?.message?.content ?? "";
    if (!rawMessage) {
      return new Response(JSON.stringify({ error: "Empty Response", detail: "OpenRouter returned an empty completion" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const duration_ms = Math.round(performance.now() - started);
    console.log("[MealPlan] Response received in", duration_ms, "ms");

    const { message, planData, readyToSave, summary } = parseMealPlanResponse(rawMessage);

    return new Response(JSON.stringify({
      message,
      planData,
      readyToSave,
      summary,
      duration_ms
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e: any) {
    console.error("[MealPlan] Unhandled error:", e.message);
    return new Response(JSON.stringify({
      error: "Internal Server Error",
      detail: String(e.message || e),
      request_id: requestId
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

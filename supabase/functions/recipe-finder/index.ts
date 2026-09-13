import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const RECIPE_MODEL = "google/gemini-2.0-flash-001";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseRecipes(text: string): any[] {
  try {
    const blockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (blockMatch) {
      const parsed = JSON.parse(blockMatch[1].trim());
      return parsed.recipes || [];
    }
    const rawMatch = text.match(/\{[\s\S]*"recipes"[\s\S]*\}/);
    if (rawMatch) {
      const parsed = JSON.parse(rawMatch[0]);
      return parsed.recipes || [];
    }
  } catch (e) {
    console.error("[recipe-finder] JSON parse error:", e);
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = req.headers.get("Authorization") || "";
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = auth.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!subscription || (subscription.status !== "active" && subscription.status !== "trialing")) {
      return new Response(JSON.stringify({ error: "Subscription Required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { query, type, userGoals } = body;

    let prompt = "";
    if (type === "suggestions" && userGoals) {
      const remainingCal = userGoals.remainingCalories || 500;
      const remainingProt = userGoals.remainingProtein || 30;
      prompt = `Find 3 real recipes from the web that fit these nutritional goals:
- Remaining calories today: ${remainingCal} kcal
- Remaining protein today: ${remainingProt}g
- Daily protein goal: ${userGoals.protein || 150}g
- Daily calorie goal: ${userGoals.calories || 2000} kcal

Search for recipes where calories_per_serving is close to ${Math.round(remainingCal / 2)} kcal and protein_per_serving is at least ${Math.round(remainingProt * 0.4)}g.

Return ONLY a JSON code block:
\`\`\`json
{
  "recipes": [
    {
      "id": "unique-id-1",
      "name": "Recipe Name",
      "description": "One sentence description",
      "image_url": "https://... or null",
      "source_name": "AllRecipes",
      "source_url": "https://...",
      "prep_time_minutes": 25,
      "servings": 4,
      "calories_per_serving": 487,
      "protein_per_serving": 42,
      "carbs_per_serving": 38,
      "fat_per_serving": 12,
      "fiber_per_serving": 3,
      "ingredients": [{ "name": "chicken breast", "amount": "200g", "calories": 220, "protein": 41, "carbs": 0, "fat": 5 }],
      "instructions": ["Step 1: ...", "Step 2: ..."],
      "reviews": [{ "text": "Amazing recipe!", "author": "user123", "rating": 5 }],
      "tags": ["high-protein"]
    }
  ]
}
\`\`\`
Return exactly 3 recipes. Use real data from actual websites. Return ONLY the JSON block, no other text.`;
    } else {
      prompt = `Search the web for real recipes matching: "${query || "healthy recipes"}"

Find 5 real recipes from authoritative cooking websites (AllRecipes, Serious Eats, Food Network, NYT Cooking, Bon Appetit).

Return ONLY a JSON code block:
\`\`\`json
{
  "recipes": [
    {
      "id": "unique-id-1",
      "name": "Recipe Name",
      "description": "One sentence description",
      "image_url": "https://... or null",
      "source_name": "AllRecipes",
      "source_url": "https://...",
      "prep_time_minutes": 25,
      "servings": 4,
      "calories_per_serving": 487,
      "protein_per_serving": 42,
      "carbs_per_serving": 38,
      "fat_per_serving": 12,
      "fiber_per_serving": 3,
      "ingredients": [{ "name": "chicken breast", "amount": "200g", "calories": 220, "protein": 41, "carbs": 0, "fat": 5 }],
      "instructions": ["Step 1: ...", "Step 2: ..."],
      "reviews": [{ "text": "Amazing recipe!", "author": "user123", "rating": 5 }],
      "tags": ["high-protein", "low-carb"]
    }
  ]
}
\`\`\`
Return exactly 5 recipes. Use real nutrition data. Include real image URLs from source pages when available. Include 2-3 real user reviews. Tags from: high-protein, low-carb, low-calorie, quick, vegetarian, vegan, keto, high-fiber, meal-prep. Return ONLY the JSON block, no other text.`;
    }

    const started = performance.now();
    const chatRes = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SUPABASE_URL,
        "X-Title": "Macro Goal Recipe Finder",
      },
      body: JSON.stringify({
        model: RECIPE_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      console.error("[recipe-finder] OpenRouter error:", chatRes.status, errText);
      return new Response(JSON.stringify({ error: "OpenRouter error", detail: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await chatRes.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    console.log("[recipe-finder] Response length:", text.length);

    const recipes = parseRecipes(text);
    recipes.forEach((r: any, i: number) => {
      if (!r.id) r.id = `recipe-${Date.now()}-${i}`;
    });

    const duration_ms = Math.round(performance.now() - started);
    console.log("[recipe-finder] Parsed", recipes.length, "recipes in", duration_ms, "ms");

    return new Response(JSON.stringify({ recipes, duration_ms }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[recipe-finder] Unhandled error:", e.message);
    return new Response(JSON.stringify({ error: "Internal Server Error", detail: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

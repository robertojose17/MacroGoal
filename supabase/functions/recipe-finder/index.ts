import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const started = performance.now();

  try {
    // 1. Check API key
    if (!OPENROUTER_API_KEY) {
      console.error("[recipe-finder] OPENROUTER_API_KEY is not set");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Auth check
    const auth = req.headers.get("Authorization") || "";
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = auth.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      console.error("[recipe-finder] Auth error:", authError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Parse body
    const body = await req.json();
    const { query, type, userGoals } = body;

    console.log("[recipe-finder] Request — type:", type, "query:", query, "user:", userData.user.id);

    // 4. Build prompt
    let userMessage = "";
    if (type === "suggestions" && userGoals) {
      userMessage = `Generate 3 personalized recipe suggestions for a user with these daily macro goals:
- Calories: ${userGoals.calories} kcal (${userGoals.remainingCalories} remaining today)
- Protein: ${userGoals.protein}g (${userGoals.remainingProtein ?? Math.round(userGoals.protein * 0.5)}g remaining)
- Carbs: ${userGoals.carbs}g
- Fat: ${userGoals.fat}g

Current time context: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}

Return recipes that fit their remaining macros. Focus on popular, well-reviewed recipes from AllRecipes, Serious Eats, or Food Network.`;
    } else {
      userMessage = `Search for 5 real recipes matching: "${query}"

Find recipes from popular cooking websites like AllRecipes, Serious Eats, Food Network, Epicurious, or similar authoritative sources.`;
    }

    const systemPrompt = `You are a recipe search assistant. When given a query, find real recipes from popular cooking websites and return them as structured JSON.

IMPORTANT: Return ONLY a valid JSON object. No markdown, no code blocks, no explanation text. Just the raw JSON.

The JSON must have this exact structure:
{
  "recipes": [
    {
      "id": "unique-string-id",
      "name": "Recipe Name",
      "description": "Brief description",
      "image_url": "https://example.com/image.jpg or null",
      "source_name": "AllRecipes",
      "source_url": "https://allrecipes.com/recipe/... or null",
      "prep_time_minutes": 30,
      "servings": 4,
      "calories_per_serving": 450,
      "protein_per_serving": 35,
      "carbs_per_serving": 40,
      "fat_per_serving": 12,
      "fiber_per_serving": 5,
      "ingredients": [
        { "name": "chicken breast", "amount": "2 lbs", "calories": 220, "protein": 42, "carbs": 0, "fat": 5 }
      ],
      "instructions": [
        "Step 1: ...",
        "Step 2: ..."
      ],
      "reviews": [
        { "text": "Amazing recipe!", "author": "John D.", "rating": 5 }
      ],
      "tags": ["high-protein", "quick"]
    }
  ]
}

Include 2-3 real user reviews per recipe from the source website. Make macros realistic and accurate.`;

    // 5. Call OpenRouter
    console.log("[recipe-finder] Calling OpenRouter with model google/gemini-2.0-flash-exp");
    const chatRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://macro-goal.app",
        "X-Title": "Macro Goal Recipe Finder",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    console.log("[recipe-finder] OpenRouter response status:", chatRes.status);

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      console.error("[recipe-finder] OpenRouter error:", chatRes.status, errText);
      return new Response(JSON.stringify({ error: "OpenRouter error", detail: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatData = await chatRes.json();
    const rawContent = chatData.choices?.[0]?.message?.content || "";
    console.log("[recipe-finder] Raw response length:", rawContent.length);

    // 6. Parse JSON from response
    let recipes: any[] = [];
    try {
      // Try direct parse first (response_format json_object)
      const parsed = JSON.parse(rawContent);
      recipes = parsed.recipes || [];
    } catch {
      // Fallback: extract JSON block
      try {
        const blockMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
        if (blockMatch) {
          const parsed = JSON.parse(blockMatch[1].trim());
          recipes = parsed.recipes || [];
        } else {
          const objMatch = rawContent.match(/\{[\s\S]*"recipes"[\s\S]*\}/);
          if (objMatch) {
            const parsed = JSON.parse(objMatch[0]);
            recipes = parsed.recipes || [];
          }
        }
      } catch (e2) {
        console.error("[recipe-finder] JSON parse fallback failed:", e2);
      }
    }

    console.log("[recipe-finder] Parsed", recipes.length, "recipes");

    const duration_ms = Math.round(performance.now() - started);
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

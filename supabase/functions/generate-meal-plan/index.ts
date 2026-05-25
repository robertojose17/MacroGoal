import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

function buildSystemPrompt(
  userGoals: { daily_calories: number; daily_protein: number; daily_carbs: number; daily_fats: number },
  recipePool: any[],
  preferences: UserPreferences | null,
  skinnytasteContent: string
): string {
  const recipeSection = recipePool.length > 0
    ? `\nINSPIRATION RECIPES — Base the meal plan on these. Adapt portions to hit the user's exact macro targets:\n${recipePool.map(r =>
        `- [${r.meal_type.toUpperCase()}] ${r.name} (${r.cuisine}) — ~${r.calories} cal, ${r.protein}g protein, ${r.carbs}g carbs, ${r.fat}g fat`
      ).join("\n")}\n`
    : "";

  const skinnytasteSection = skinnytasteContent
    ? `\nSKINNYTASTE RECIPES — You MUST base the meal plan exclusively on recipes found in this content from skinnytaste.com. Pick meal names and flavor profiles directly from these recipes. Adapt portions to match the user's exact macro targets. Do NOT invent generic meals — use what is listed here:\n${skinnytasteContent.slice(0, 2000)}\n`
    : `\nNote: No external recipe source available this request — use creative healthy recipes inspired by skinnytaste.com style (low calorie, high protein, globally diverse).\n`;

  const prefsSection = preferences
    ? `\nUSER FOOD PREFERENCES — HARD RULES:
${preferences.dietary_restrictions?.length ? `- Dietary restrictions: ${preferences.dietary_restrictions.join(", ")} — STRICTLY FORBIDDEN to violate` : ""}
${preferences.protein_preferences?.length ? `- ALLOWED proteins ONLY: ${preferences.protein_preferences.join(", ")} — any other protein is FORBIDDEN` : "- No protein restrictions"}
${preferences.carb_preferences?.length ? `- ALLOWED carbs ONLY: ${preferences.carb_preferences.join(", ")} — any other carb is FORBIDDEN` : "- No carb restrictions"}
${preferences.fat_preferences?.length ? `- ALLOWED fats ONLY: ${preferences.fat_preferences.join(", ")} — any other fat is FORBIDDEN` : "- No fat restrictions"}
${preferences.disliked_foods ? `- Disliked foods: ${preferences.disliked_foods} — NEVER include` : ""}
${preferences.cooking_level ? `- Cooking level: ${preferences.cooking_level}` : ""}
Before outputting, scan every item — replace any forbidden protein/carb/fat with an allowed one.
`
    : "";

  const calMin = userGoals.daily_calories - 100;
  const calMax = userGoals.daily_calories + 10;
  const protMin = userGoals.daily_protein - 10;
  const protMax = userGoals.daily_protein + 10;

  return `You are a world-class nutritionist building a precise calorie-deficit meal plan.

DAILY TARGETS: Calories ${calMin}–${calMax} kcal | Protein ${protMin}–${protMax}g | Carbs ~${userGoals.daily_carbs}g | Fats ~${userGoals.daily_fats}g
${prefsSection}${recipeSection}${skinnytasteSection}
MACRO RULES — NON-NEGOTIABLE:
- Calories: ${calMin}–${calMax} kcal | Protein: ${protMin}–${protMax}g | Carbs: ${userGoals.daily_carbs - 10}–${userGoals.daily_carbs + 10}g | Fats: ${userGoals.daily_fats - 10}–${userGoals.daily_fats + 10}g
- Priority: calories hard cap first → protein second → adjust carbs → adjust fats. NEVER sacrifice protein.

SELF-CHECK before outputting (mandatory):
1. Sum calories → ${calMin}–${calMax}. Sum protein → ${protMin}–${protMax}g. Sum carbs → ${userGoals.daily_carbs - 10}–${userGoals.daily_carbs + 10}g. Sum fats → ${userGoals.daily_fats - 10}–${userGoals.daily_fats + 10}g.
2. Every serving_size for gram-measured foods must be > 1.
3. Every serving_description must be a cooking method only — no ingredient names.

FOOD ITEM RULES — STRICT:
- serving_description = cooking method ONLY: "cooked"/"raw"/"grilled"/"toasted"/"scrambled"/"steamed"/"baked"/"boiled". NEVER include ingredient names, quantities, or "with X". BAD: "scrambled with butter" → "scrambled". BAD: "cooked with olive oil" → "cooked".
- Caloric toppings/fats (butter, olive oil, honey, nut butter, cheese, sauce) MUST be listed as separate items with correct macros — or not mentioned at all.
- serving_size = real gram amount for gram-measured foods (e.g. 80, 150, 200). NEVER use 1 for gram-measured foods.
- serving_unit: "g" solids | "ml" liquids | "slice" bread | "unit" whole items (eggs, bananas, tortillas)

CORRECT EXAMPLE (oatmeal breakfast — each topping is its own item):
items: [{"name":"Rolled Oats","brand":null,"serving_size":80,"serving_unit":"g","serving_description":"cooked","calories":311,"protein":11,"carbs":54,"fats":5,"fiber":8},{"name":"Honey","brand":null,"serving_size":15,"serving_unit":"g","serving_description":"raw","calories":46,"protein":0,"carbs":12,"fats":0,"fiber":0},{"name":"Almond Butter","brand":null,"serving_size":16,"serving_unit":"g","serving_description":"raw","calories":98,"protein":3,"carbs":3,"fats":9,"fiber":1}]

CORRECT EXAMPLE (eggs with butter — butter is a separate item):
items: [{"name":"Whole Eggs","brand":null,"serving_size":3,"serving_unit":"unit","serving_description":"scrambled","calories":210,"protein":18,"carbs":2,"fats":14,"fiber":0},{"name":"Butter","brand":null,"serving_size":5,"serving_unit":"g","serving_description":"cooked","calories":36,"protein":0,"carbs":0,"fats":4,"fiber":0}]

CORRECT EXAMPLE (Greek yogurt with brand swap — Chobani Zero Sugar Vanilla):
items: [{"name":"Greek Yogurt","brand":"Chobani Zero Sugar Vanilla","serving_size":150,"serving_unit":"g","serving_description":"raw","calories":90,"protein":15,"carbs":6,"fats":0,"fiber":0},{"name":"Mixed Berries","brand":null,"serving_size":80,"serving_unit":"g","serving_description":"raw","calories":46,"protein":1,"carbs":11,"fats":0,"fiber":2}]
WRONG: {"name":"Greek Yogurt","serving_description":"with berries"} — berries have calories and MUST be a separate item.

BRAND RECOMMENDATIONS — Apply to EVERY meal for consistency:
- Add a "brand" field ONLY for packaged/processed foods where brand significantly affects macros. Whole foods (chicken, eggs, rice, oats, fruits, vegetables, olive oil, butter, nuts) → brand: null.
- For packaged foods, ALWAYS prefer high-protein or low-calorie brands:
  Greek yogurt → "Chobani Zero Sugar"/"Fage 0%"/"Oikos Pro" | Cottage cheese → "Good Culture"/"Fage" | Ice cream → "Halo Top"/"Yasso"/"Arctic Zero" | Protein bars → "Quest"/"RXBar"/"Barebells" | Protein cookies → "Lenny & Larry's"/"Quest" | Protein chips → "Quest Protein Chips"/"Popchips" | Pasta → "Banza Chickpea Pasta"/"Barilla Protein+" | Bread → "Dave's Killer Bread"/"Ezekiel 4:9" | Tortillas → "Mission Carb Balance"/"Ole Xtreme Wellness" | Cereal → "Magic Spoon"/"Catalina Crunch" | Granola → "Purely Elizabeth"/"Bear Naked" | Protein powder → "Optimum Nutrition Gold Standard"/"Dymatize ISO100" | Plant milk → "Silk Protein"/"Kirkland Almond" | Diet soda → "Zevia"/"Olipop" | Frozen pizza → "Caulipower" | Burger patties → "Beyond Burger"/"Impossible Burger"
- The brand name MUST be the exact product line (e.g. "Halo Top Vanilla Bean" not just "Halo Top").

MEAL TIPS — When a brand swap meaningfully helps macros, append a short tip (under 25 words) to dish_description. Example: "Tip: Halo Top has ~90 kcal/serving vs 250 kcal for regular ice cream." NEVER add tips for whole foods.

VARIETY RULES — STRICTLY ENFORCED:
BANNED: scrambled eggs (standalone), oatmeal with berries, avocado toast, grilled chicken salad, chicken and rice bowl, tuna salad, baked salmon, grilled chicken with vegetables, chicken stir fry, Greek yogurt with berries, apple with peanut butter, protein shake.
USE INSTEAD — Breakfast: shakshuka, Korean egg toast, breakfast burrito, congee, masala omelette, acai bowl, huevos rancheros, tamagoyaki, chilaquiles. Lunch: bibimbap, tacos al pastor, pad thai, falafel wrap, butter chicken, ramen, bulgogi bowl, poke bowl, lamb shawarma. Dinner: miso-glazed cod, lamb tagine, chicken mole, beef rendang, seafood paella, jerk pork, chicken katsu curry, dakgalbi, cochinita pibil. Snack: edamame with togarashi, guacamole with plantain chips, hummus with pita, onigiri, samosa, kimchi pancake, elote, labneh.
- NEVER repeat the same cuisine twice in one day. NEVER use the same protein source more than once per day.

SAVE TRIGGER: When the message starts with "GENERATE_PLAN:" or the user says they're satisfied, respond with ONLY this raw JSON (no markdown, no backticks):
{"ready_to_save":true,"plan":{"breakfast":{"dish_description":"...","items":[...]},"lunch":{"dish_description":"...","items":[...]},"dinner":{"dish_description":"...","items":[...]},"snack":{"dish_description":"...","items":[...]}},"summary":"..."}

Each item fields: name, brand (string or null), calories, protein, carbs, fats, fiber, serving_size, serving_unit, serving_description.

When message starts with "GENERATE_PLAN:", immediately return the full plan JSON. No conversational text.`;
}



async function fetchSkinnytasteInspiration(
  _userGoals: { daily_calories: number; daily_protein: number; daily_carbs: number; daily_fats: number },
  preferences: UserPreferences | null
): Promise<string> {
  try {
    let cats = [
      'https://www.skinnytaste.com/recipes/dinner-recipes/',
      'https://www.skinnytaste.com/recipes/lunch-recipes/',
      'https://www.skinnytaste.com/recipes/breakfast-recipes/',
      'https://www.skinnytaste.com/recipes/chicken-recipes/',
      'https://www.skinnytaste.com/recipes/fish-recipes/',
      'https://www.skinnytaste.com/recipes/vegetarian-recipes/',
      'https://www.skinnytaste.com/recipes/meal-prep/',
      'https://www.skinnytaste.com/recipes/high-protein-recipes/',
    ];
    const isVeg = preferences?.dietary_restrictions?.includes('vegetarian') || preferences?.dietary_restrictions?.includes('vegan');
    if (isVeg) cats = cats.filter(u => u.includes('vegetarian') || u.includes('breakfast') || u.includes('lunch'));
    const selected = cats.sort(() => Math.random() - 0.5).slice(0, 2);
    const results: string[] = [];
    for (const url of selected) {
      try {
        const res = await fetch(`https://r.jina.ai/${url}`, {
          headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text', 'User-Agent': 'Mozilla/5.0', 'X-No-Cache': 'true' },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) { console.log('[MealPlan] Jina returned', res.status, 'for', url); continue; }
        const text = await res.text();
        console.log('[MealPlan] Jina fetched', url, '- content length:', text.length);
        results.push(text.slice(0, 5000));
      } catch (err) {
        console.log('[MealPlan] Jina fetch failed for', url, '- skipping:', err);
      }
    }
    if (results.length === 0) return '';
    return `SKINNYTASTE LIVE CONTENT (scraped right now from skinnytaste.com):\n\n` + results.join('\n\n---\n\n');
  } catch (_err) {
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

  console.error("[MealPlan] parseMealPlanResponse: all parse attempts failed. Raw content (first 500 chars):", String(content).slice(0, 500));
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

    const isFirstMessage = messages.length === 1;
    const [recipePool, skinnytasteContent] = isFirstMessage
      ? await Promise.all([
          Promise.resolve([]),
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
          max_tokens: 4000
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
      if (jsonResp?.choices?.[0]?.finish_reason === "length") {
        console.error("[MealPlan] Model output truncated due to length");
      }
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

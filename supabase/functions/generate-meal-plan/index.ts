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
    ? `\nUSER FOOD PREFERENCES — THESE ARE HARD RULES, NOT SUGGESTIONS:
${preferences.dietary_restrictions?.length ? `- Dietary restrictions: ${preferences.dietary_restrictions.join(", ")} — STRICTLY FORBIDDEN to violate these` : ""}
${preferences.protein_preferences?.length ? `- ALLOWED proteins ONLY: ${preferences.protein_preferences.join(", ")} — You MUST ONLY use proteins from this exact list. Any protein NOT in this list is STRICTLY FORBIDDEN. If chicken is not listed, never use chicken. If beef is not listed, never use beef. If eggs are not listed, never use eggs. Zero exceptions.` : "- No protein preferences set — you may use any protein"}
${preferences.carb_preferences?.length ? `- ALLOWED carbs ONLY: ${preferences.carb_preferences.join(", ")} — You MUST ONLY use carb sources from this exact list. Any carb NOT in this list is STRICTLY FORBIDDEN.` : "- No carb preferences set — you may use any carb"}
${preferences.fat_preferences?.length ? `- ALLOWED fats ONLY: ${preferences.fat_preferences.join(", ")} — You MUST ONLY use fat sources from this exact list. Any fat NOT in this list is STRICTLY FORBIDDEN.` : "- No fat preferences set — you may use any fat"}
${preferences.disliked_foods ? `- Disliked foods: ${preferences.disliked_foods} — NEVER include these under any circumstances` : ""}
${preferences.cooking_level ? `- Cooking level: ${preferences.cooking_level}` : ""}
PREFERENCE ENFORCEMENT CHECK: Before outputting the final plan, scan every single food item. If any item uses a protein, carb, or fat not in the allowed lists above, replace it immediately with one that IS in the allowed list. This check is mandatory.
`
    : "";

  const calMin = userGoals.daily_calories - 100;
  const calMax = userGoals.daily_calories + 10;
  const protMin = userGoals.daily_protein - 10;
  const protMax = userGoals.daily_protein + 10;

  return `You are a world-class nutritionist building a precise calorie-deficit meal plan.

DAILY TARGETS:
- Calories: ${userGoals.daily_calories} kcal → plan MUST be between ${calMin} and ${calMax} kcal total
- Protein: ${userGoals.daily_protein}g → plan MUST be between ${protMin}g and ${protMax}g total
- Carbs: ${userGoals.daily_carbs}g (flexible — sacrifice carbs first to hit calorie/protein targets)
- Fats: ${userGoals.daily_fats}g (flexible — sacrifice fats second)
${prefsSection}${recipeSection}${skinnytasteSection}
MACRO RULES — NON-NEGOTIABLE, NEVER BREAK THESE:
- Calories: total MUST be between ${calMin} and ${calMax} kcal (${userGoals.daily_calories} -100/+10)
- Protein: total MUST be between ${protMin}g and ${protMax}g (${userGoals.daily_protein}g ±10g)
- Carbs: total MUST be between ${userGoals.daily_carbs - 10}g and ${userGoals.daily_carbs + 10}g (${userGoals.daily_carbs}g ±10g)
- Fats: total MUST be between ${userGoals.daily_fats - 10}g and ${userGoals.daily_fats + 10}g (${userGoals.daily_fats}g ±10g)

PRIORITY ORDER when adjusting portions to fit targets:
1. Never go over ${calMax} kcal or under ${calMin} kcal — calories are the hard cap
2. Keep protein between ${protMin}g and ${protMax}g — highest priority macro
3. Adjust carbs first to hit calorie budget
4. Adjust fats second if still over budget
5. Never sacrifice protein to hit calorie or carb targets

SELF-CHECK before outputting (mandatory):
1. Sum all item calories → must be ${calMin}–${calMax} kcal. If not, adjust carb/fat portions.
2. Sum all protein → must be ${protMin}g–${protMax}g. If not, add or increase a protein source.
3. Sum all carbs → must be ${userGoals.daily_carbs - 10}g–${userGoals.daily_carbs + 10}g.
4. Sum all fats → must be ${userGoals.daily_fats - 10}g–${userGoals.daily_fats + 10}g.
5. Every serving_size for gram-measured foods must be > 1.
6. Every serving_description must be a cooking method only — no ingredient names.

FOOD ITEM RULES — STRICT:
- serving_description = cooking method ONLY: "cooked", "raw", "grilled", "toasted", "scrambled", "steamed", "baked", "boiled"
- serving_description must NEVER contain: ingredient names, quantities, "with", "topped with", "drizzled with", "cooked in", or any mention of other foods
- BAD: "scrambled with butter" → just say "scrambled"
- BAD: "cooked with olive oil" → just say "cooked"  
- BAD: "topped with honey and almond butter" → just say "cooked"
- BAD: "sautéed with 1 tsp olive oil" → just say "sautéed"
- GOOD: "grilled", "steamed", "raw", "cooked", "toasted", "scrambled"
- If a caloric topping or cooking fat is important to the meal (butter, olive oil, honey, nut butter, cheese, sauce), list it as its own separate item with correct macros. If you are not going to list it as a separate item, do NOT mention it anywhere — not in serving_description, not in dish_description, nowhere.
- serving_size = actual quantity number. For gram-measured foods: use the real gram amount (e.g. 80, 150, 200). NEVER use 1 as serving_size for a food measured in grams.
- serving_unit = "g" for solids, "ml" for liquids, "slice" for bread slices, "unit" for whole countable items (eggs, bananas, tortillas)

CORRECT EXAMPLE for a breakfast with oatmeal:
items: [
  { "name": "Rolled Oats", "serving_size": 80, "serving_unit": "g", "serving_description": "cooked", "calories": 311, "protein": 11, "carbs": 54, "fats": 5, "fiber": 8 },
  { "name": "Honey", "serving_size": 15, "serving_unit": "g", "serving_description": "raw", "calories": 46, "protein": 0, "carbs": 12, "fats": 0, "fiber": 0 },
  { "name": "Almond Butter", "serving_size": 16, "serving_unit": "g", "serving_description": "raw", "calories": 98, "protein": 3, "carbs": 3, "fats": 9, "fiber": 1 }
]

CORRECT EXAMPLE for eggs with butter:
items: [
  { "name": "Whole Eggs", "serving_size": 3, "serving_unit": "unit", "serving_description": "scrambled", "calories": 210, "protein": 18, "carbs": 2, "fats": 14, "fiber": 0 },
  { "name": "Butter", "serving_size": 5, "serving_unit": "g", "serving_description": "cooked", "calories": 36, "protein": 0, "carbs": 0, "fats": 4, "fiber": 0 }
]

CORRECT EXAMPLE for Greek yogurt snack (every topping is a separate item):
items: [
  { "name": "Greek Yogurt", "serving_size": 150, "serving_unit": "g", "serving_description": "raw", "calories": 89, "protein": 15, "carbs": 5, "fats": 1, "fiber": 0 },
  { "name": "Mixed Berries", "serving_size": 80, "serving_unit": "g", "serving_description": "raw", "calories": 46, "protein": 1, "carbs": 11, "fats": 0, "fiber": 2 }
]
WRONG (do NOT do this): { "name": "Greek Yogurt", "serving_description": "with berries" } — berries have calories and MUST be a separate item.

SELF-CHECK before outputting (do this mentally):
1. Add up all item calories → must be between ${calMin} and ${calMax}
2. Add up all protein → must be between ${protMin}g and ${protMax}g
3. Check every item: does serving_size > 1 for gram-measured foods? If not, fix it.
4. Check every item: is serving_description free of ingredient names and quantities? If not, fix it.
5. Are all caloric toppings/oils/butters listed as separate items? If not, add them.

VARIETY RULES — STRICTLY ENFORCED:
BANNED MEALS — NEVER suggest these, not even as a variation:
- Breakfast: scrambled eggs (standalone), oatmeal with berries (standalone), avocado toast (standalone)
- Lunch: grilled chicken salad, chicken and rice bowl, tuna salad
- Dinner: baked salmon, grilled chicken with vegetables, chicken stir fry
- Snack: Greek yogurt with berries, apple with peanut butter, protein shake

Instead use creative alternatives:
- Breakfast: shakshuka, Korean egg toast, breakfast burrito, congee, masala omelette, acai bowl, huevos rancheros, bircher muesli, tamagoyaki, chilaquiles
- Lunch: bibimbap, tacos al pastor, pad thai, falafel wrap, butter chicken, ramen, bulgogi bowl, poke bowl, lamb shawarma, pozole
- Dinner: miso-glazed cod, lamb tagine, chicken mole, beef rendang, seafood paella, osso buco, jerk pork, chicken katsu curry, dakgalbi, cochinita pibil
- Snack: edamame with togarashi, guacamole with plantain chips, hummus with pita, onigiri, samosa, kimchi pancake, elote, labneh, spanakopita

- NEVER repeat the same cuisine twice in one day
- NEVER use the same protein source (chicken, beef, fish, eggs) more than once per day

SAVE TRIGGER: When the message starts with "GENERATE_PLAN:" or the user says they're satisfied, respond with ONLY this raw JSON (no markdown, no backticks):
{"ready_to_save":true,"plan":{"breakfast":{"dish_description":"...","items":[...]},"lunch":{"dish_description":"...","items":[...]},"dinner":{"dish_description":"...","items":[...]},"snack":{"dish_description":"...","items":[...]}},"summary":"..."}

Each item fields: name, calories, protein, carbs, fats, fiber, serving_size, serving_unit, serving_description.

When message starts with "GENERATE_PLAN:", immediately return the full plan JSON. No conversational text.`;
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

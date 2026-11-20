import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const USDA_API_KEY = Deno.env.get("USDA_SEARCH_API_KEY")?.trim();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function lookupUSDA(name: string): Promise<{ calories: number; protein: number; carbs: number; fat: number } | null> {
  try {
    if (!USDA_API_KEY) return null;
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(name)}&pageSize=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error", headers: { "X-Api-Key": USDA_API_KEY } });
    if (!res.ok) return null;
    const data = await res.json();
    const food = data?.foods?.[0];
    if (!food) return null;
    const nutrients = food.foodNutrients ?? [];
    const get = (keyword: string) => nutrients.find((n: any) => n.nutrientName?.toLowerCase().includes(keyword))?.value ?? 0;
    const calories = get("energy") || get("calorie");
    if (calories === 0) return null;
    return { calories, protein: get("protein"), carbs: get("carbohydrate"), fat: get("total lipid") || get("fat") };
  } catch { return null; }
}

async function lookupYummly(name: string): Promise<{ calories: number; protein: number; carbs: number; fat: number } | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://macro-goal.app", "X-Title": "Macro Goal Cron" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash:online",
        messages: [{ role: "user", content: `Search Yummly or Nutritionix for nutritional values per 100g of: "${name}". Return ONLY JSON: {"calories":0,"protein":0,"carbs":0,"fat":0}` }],
        temperature: 0, max_tokens: 100,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[^}]+\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.calories || parsed.calories === 0) return null;
    return { calories: parsed.calories, protein: parsed.protein ?? 0, carbs: parsed.carbs ?? 0, fat: parsed.fat ?? 0 };
  } catch { return null; }
}

async function findGenericEquivalent(name: string): Promise<string | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://macro-goal.app", "X-Title": "Macro Goal Cron" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: `What is the closest generic English ingredient equivalent for "${name}" found in USDA? Return ONLY the name or "NONE".` }],
        temperature: 0, max_tokens: 20,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const eq = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!eq || eq === "NONE" || eq.length > 50) return null;
    return eq;
  } catch { return null; }
}

function parseAmountToGrams(amountStr: string): number {
  const s = amountStr.toLowerCase().trim();
  const num = parseFloat(s) || 1;
  if (s.includes("cup")) return num * 240;
  if (s.includes("tbsp") || s.includes("tablespoon")) return num * 15;
  if (s.includes("tsp") || s.includes("teaspoon")) return num * 5;
  if (s.includes("oz") || s.includes("ounce")) return num * 28.35;
  if (s.includes("lb") || s.includes("pound")) return num * 453.6;
  if (s.includes("kg")) return num * 1000;
  if (s.includes("g") || s.includes("gram")) return num;
  return num * 100;
}

async function verifyIngredient(ing: any): Promise<{ enriched: any; verified: boolean }> {
  const grams = parseAmountToGrams(String(ing.amount ?? "100g"));
  const factor = grams / 100;
  let macros = await lookupUSDA(ing.name ?? "");
  if (macros) {
    return { enriched: { ...ing, calories: Math.round(macros.calories * factor), protein: Math.round(macros.protein * factor), carbs: Math.round(macros.carbs * factor), fat: Math.round(macros.fat * factor), usda_verified: true, verification_source: "usda" }, verified: true };
  }
  const generic = await findGenericEquivalent(ing.name ?? "");
  if (generic) {
    macros = await lookupUSDA(generic);
    if (macros) {
      return { enriched: { ...ing, calories: Math.round(macros.calories * factor), protein: Math.round(macros.protein * factor), carbs: Math.round(macros.carbs * factor), fat: Math.round(macros.fat * factor), usda_verified: true, verification_source: "usda_generic", generic_name: generic }, verified: true };
    }
  }
  macros = await lookupYummly(ing.name ?? "");
  if (macros) {
    return { enriched: { ...ing, calories: Math.round(macros.calories * factor), protein: Math.round(macros.protein * factor), carbs: Math.round(macros.carbs * factor), fat: Math.round(macros.fat * factor), usda_verified: true, verification_source: "yummly" }, verified: true };
  }
  return { enriched: { ...ing, usda_verified: false }, verified: false };
}

async function verifyAllIngredients(recipe: any): Promise<any | null> {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  if (ingredients.length === 0) return null;
  const enriched: any[] = [];
  for (let i = 0; i < ingredients.length; i += 3) {
    const batch = ingredients.slice(i, i + 3);
    const results = await Promise.all(batch.map(verifyIngredient));
    for (const r of results) {
      if (!r.verified) { console.log(`[cron] Discarding "${recipe.name}" — unverifiable: ${r.enriched.name}`); return null; }
      enriched.push(r.enriched);
    }
    if (i + 3 < ingredients.length) await new Promise(r => setTimeout(r, 100));
  }
  const servings = recipe.servings ?? 1;
  const totalCalories = enriched.reduce((s, i) => s + (i.calories ?? 0), 0);
  const totalProtein = enriched.reduce((s, i) => s + (i.protein ?? 0), 0);
  const totalCarbs = enriched.reduce((s, i) => s + (i.carbs ?? 0), 0);
  const totalFat = enriched.reduce((s, i) => s + (i.fat ?? 0), 0);
  return { ...recipe, ingredients: enriched, calories_per_serving: Math.round(totalCalories / servings), protein_per_serving: Math.round(totalProtein / servings), carbs_per_serving: Math.round(totalCarbs / servings), fat_per_serving: Math.round(totalFat / servings), usda_verified: true };
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

async function findDuplicate(title: string): Promise<boolean> {
  const normalized = normalizeTitle(title);
  const words = normalized.split(" ").filter((w) => w.length > 3);
  if (words.length === 0) return false;
  const { data } = await supabase.from("recipes").select("id, title").textSearch("search_vector", words.slice(0, 3).join(" & ")).limit(5);
  if (!data || data.length === 0) return false;
  for (const row of data) {
    const existingWords = new Set(normalizeTitle(row.title ?? "").split(" "));
    const matchCount = words.filter((w) => existingWords.has(w)).length;
    if (matchCount / words.length >= 0.7) return true;
  }
  return false;
}

async function saveToLibrary(recipe: any): Promise<boolean> {
  try {
    if (await findDuplicate(recipe.name ?? "")) { console.log("[cron] Duplicate, skipping:", recipe.name); return false; }
    const { error } = await supabase.from("recipes").insert({
      title: recipe.name,
      description: recipe.description ?? null,
      image_url: recipe.image_url ?? null,
      source_name: recipe.source_name ?? null,
      source_url: recipe.source_url ?? null,
      url_verified: recipe.url_verified ?? false,
      prep_time_minutes: recipe.prep_time_minutes ?? null,
      servings: recipe.servings ?? 1,
      calories_per_serving: recipe.calories_per_serving ?? null,
      protein_per_serving: recipe.protein_per_serving ?? null,
      carbs_per_serving: recipe.carbs_per_serving ?? null,
      fat_per_serving: recipe.fat_per_serving ?? null,
      fiber_per_serving: recipe.fiber_per_serving ?? null,
      ingredients: recipe.ingredients ?? [],
      instructions: recipe.instructions ?? [],
      reviews: recipe.reviews ?? [],
      tags: recipe.tags ?? [],
      usda_verified: true,
      search_count: 0,
      last_searched_at: new Date().toISOString(),
    });
    if (error) { console.error("[cron] Save error:", error.message); return false; }
    console.log("[cron] Saved:", recipe.name);
    return true;
  } catch (e: any) { console.error("[cron] saveToLibrary error:", e.message); return false; }
}

// Pick a random meal category to keep variety across cycles
const MEAL_CATEGORIES = [
  "high protein breakfast",
  "low calorie lunch",
  "high protein dinner",
  "healthy snacks high protein",
  "fit desserts low calorie",
  "high protein meal prep",
  "low calorie bowl",
  "protein smoothie bowl",
  "healthy stir fry high protein",
  "low calorie soup high protein",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: corsHeaders });
  if (!SERVICE_ROLE || req.headers.get("authorization") !== `Bearer ${SERVICE_ROLE}`) {
    return new Response(null, { status: 401, headers: corsHeaders });
  }
  const started = performance.now();
  console.log("[recipe-trending-cron] Starting 4-day cycle");

  try {
    // Pick 3 random categories for variety
    const shuffled = [...MEAL_CATEGORIES].sort(() => Math.random() - 0.5);
    const categories = shuffled.slice(0, 3).join(", ");

    const searchRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://macro-goal.app",
        "X-Title": "Macro Goal Trending Cron",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash:online",
        messages: [{
          role: "system",
          content: `You are a fitness recipe curator. Find REAL recipes from cooking websites. Return ONLY valid JSON, no markdown.`,
        }, {
          role: "user",
          content: `Search the web for 10 real fitness recipes across these categories: ${categories}.

Requirements:
- Under 500 calories per serving
- At least 25g protein per serving  
- Any cuisine, any style — variety is key
- Real recipes from: allrecipes.com, skinnytaste.com, eatingwell.com, fitfoodiefinds.com, yummly.com, tasty.co, delish.com, minimalistbaker.com, halfbakedharvest.com

Return ONLY valid JSON:
{"recipes":[{"name":"Recipe Name","description":"Brief description","image_url":"https://real.com/photo.jpg","source_name":"Site Name","source_url":"https://real-url.com/recipe","prep_time_minutes":30,"servings":4,"calories_per_serving":350,"protein_per_serving":35,"carbs_per_serving":25,"fat_per_serving":8,"fiber_per_serving":5,"ingredients":[{"name":"chicken breast","amount":"200g","calories":330,"protein":62,"carbs":0,"fat":7}],"instructions":["Step 1","Step 2","Step 3","Step 4","Step 5"],"reviews":[],"tags":["high-protein","low-calorie"]}]}`,
        }],
        temperature: 0.5,
        max_tokens: 10000,
      }),
    });

    if (!searchRes.ok) {
      console.error("[cron] OpenRouter error:", searchRes.status);
      return new Response(JSON.stringify({ error: "AI search failed" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const searchData = await searchRes.json();
    const rawContent = searchData.choices?.[0]?.message?.content ?? "";

    let recipes: any[] = [];
    try {
      recipes = JSON.parse(rawContent).recipes ?? [];
    } catch {
      const match = rawContent.match(/\{[\s\S]*"recipes"[\s\S]*\}/);
      if (match) { try { recipes = JSON.parse(match[0]).recipes ?? []; } catch {} }
    }

    console.log(`[cron] Got ${recipes.length} recipes from AI, verifying all ingredients...`);

    const verified: any[] = [];
    for (const recipe of recipes) {
      const result = await verifyAllIngredients(recipe);
      if (result) verified.push(result);
    }

    console.log(`[cron] ${verified.length}/${recipes.length} passed 100% verification`);

    let saved = 0;
    for (const recipe of verified) {
      const ok = await saveToLibrary(recipe);
      if (ok) saved++;
    }

    const duration_ms = Math.round(performance.now() - started);
    console.log(`[cron] Done in ${duration_ms}ms — saved ${saved} new recipes`);

    return new Response(JSON.stringify({ processed: recipes.length, verified: verified.length, saved, duration_ms }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[cron] Unhandled error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

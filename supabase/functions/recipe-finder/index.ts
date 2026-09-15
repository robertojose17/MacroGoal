import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const USDA_API_KEY = Deno.env.get("USDA_API_KEY") ?? "DEMO_KEY";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function lookupUSDA(ingredientName: string): Promise<{ calories: number; protein: number; carbs: number; fat: number } | null> {
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(ingredientName)}&pageSize=1&api_key=${USDA_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const food = data?.foods?.[0];
    if (!food) return null;
    const nutrients = food.foodNutrients ?? [];
    const get = (name: string) => nutrients.find((n: any) => n.nutrientName?.toLowerCase().includes(name))?.value ?? 0;
    return {
      calories: get("energy") || get("calorie"),
      protein: get("protein"),
      carbs: get("carbohydrate"),
      fat: get("total lipid") || get("fat"),
    };
  } catch { return null; }
}

async function verifyMacros(recipe: any): Promise<any> {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  if (ingredients.length === 0) return recipe;
  const toVerify = ingredients.slice(0, 5);
  const verified = await Promise.all(
    toVerify.map(async (ing: any) => {
      const usdaData = await lookupUSDA(ing.name ?? "");
      if (!usdaData || usdaData.calories === 0) return ing;
      const amountStr = String(ing.amount ?? "100g");
      const grams = parseFloat(amountStr) || 100;
      const factor = grams / 100;
      return {
        ...ing,
        calories: Math.round(usdaData.calories * factor),
        protein: Math.round(usdaData.protein * factor),
        carbs: Math.round(usdaData.carbs * factor),
        fat: Math.round(usdaData.fat * factor),
        usda_verified: true,
      };
    })
  );
  const allIngredients = [...verified, ...ingredients.slice(5)];
  const totalCalories = allIngredients.reduce((sum: number, ing: any) => sum + (ing.calories ?? 0), 0);
  const servings = recipe.servings ?? 1;
  const recalcCalories = totalCalories > 0 ? Math.round(totalCalories / servings) : recipe.calories_per_serving;
  return {
    ...recipe,
    ingredients: allIngredients,
    calories_per_serving: recalcCalories,
    usda_verified: verified.some((ing: any) => ing.usda_verified),
  };
}

const CATEGORY_IMAGES: Record<string, string> = {
  chicken: "https://images.pexels.com/photos/2338407/pexels-photo-2338407.jpeg?w=800",
  beef: "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?w=800",
  pork: "https://images.pexels.com/photos/3535383/pexels-photo-3535383.jpeg?w=800",
  fish: "https://images.pexels.com/photos/3655916/pexels-photo-3655916.jpeg?w=800",
  salmon: "https://images.pexels.com/photos/3655916/pexels-photo-3655916.jpeg?w=800",
  pasta: "https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?w=800",
  pizza: "https://images.pexels.com/photos/2147491/pexels-photo-2147491.jpeg?w=800",
  burger: "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?w=800",
  salad: "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?w=800",
  soup: "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?w=800",
  taco: "https://images.pexels.com/photos/2087748/pexels-photo-2087748.jpeg?w=800",
  rice: "https://images.pexels.com/photos/723198/pexels-photo-723198.jpeg?w=800",
  steak: "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?w=800",
  shrimp: "https://images.pexels.com/photos/3655916/pexels-photo-3655916.jpeg?w=800",
  default: "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?w=800",
};

function getCategoryImage(name: string): string {
  const lower = name.toLowerCase();
  for (const key of Object.keys(CATEGORY_IMAGES)) {
    if (key !== "default" && lower.includes(key)) return CATEGORY_IMAGES[key];
  }
  return CATEGORY_IMAGES.default;
}

async function fetchMealDbImage(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.meals?.[0]?.strMealThumb) return data.meals[0].strMealThumb;
    const firstWord = name.split(" ")[0];
    if (firstWord.length > 3) {
      const res2 = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(firstWord)}`);
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2?.meals?.[0]?.strMealThumb) return data2.meals[0].strMealThumb;
      }
    }
    return null;
  } catch { return null; }
}

function isRealImageUrl(url: string | null | undefined): boolean {
  if (!url || url.includes("picsum.photos")) return false;
  if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) return true;
  if (/\/(images?|img|cdn|media|photos?|static|assets?|uploads?)\//i.test(url)) return true;
  return false;
}

async function resolveImage(recipeName: string, providedUrl: string | null): Promise<string> {
  if (isRealImageUrl(providedUrl)) return providedUrl!;
  const mealDb = await fetchMealDbImage(recipeName);
  if (mealDb) return mealDb;
  return getCategoryImage(recipeName);
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

async function findDuplicate(title: string): Promise<string | null> {
  const normalized = normalizeTitle(title);
  const words = normalized.split(" ").filter((w) => w.length > 3);
  if (words.length === 0) return null;
  const { data } = await supabase
    .from("recipes")
    .select("id, title")
    .textSearch("search_vector", words.slice(0, 3).join(" & "))
    .limit(5);
  if (!data || data.length === 0) return null;
  for (const row of data) {
    const existingNorm = normalizeTitle(row.title ?? "");
    const existingWords = new Set(existingNorm.split(" "));
    const matchCount = words.filter((w) => existingWords.has(w)).length;
    if (matchCount / words.length >= 0.7) return row.id;
  }
  return null;
}

async function saveToLibrary(recipe: any): Promise<string | null> {
  try {
    const duplicateId = await findDuplicate(recipe.name ?? recipe.title ?? "");
    if (duplicateId) {
      console.log("[recipe-finder] Duplicate found, skipping save:", recipe.name);
      await supabase.rpc("increment_recipe_search", { recipe_id: duplicateId });
      return duplicateId;
    }
    const { data, error } = await supabase
      .from("recipes")
      .insert({
        title: recipe.name ?? recipe.title,
        description: recipe.description ?? null,
        image_url: recipe.image_url ?? null,
        source_name: recipe.source_name ?? null,
        source_url: recipe.source_url ?? null,
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
        usda_verified: recipe.usda_verified ?? false,
        search_count: 1,
        last_searched_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) { console.error("[recipe-finder] Save error:", error.message); return null; }
    console.log("[recipe-finder] Saved new recipe:", recipe.name, "id:", data.id);
    return data.id;
  } catch (e: any) {
    console.error("[recipe-finder] saveToLibrary error:", e.message);
    return null;
  }
}

async function searchLibrary(query: string): Promise<any[]> {
  try {
    const words = query.trim().split(/\s+/).filter((w) => w.length > 2);
    if (words.length === 0) return [];
    const tsQuery = words.map((w) => w + ":*").join(" & ");
    const { data } = await supabase
      .from("recipes")
      .select("*")
      .textSearch("search_vector", tsQuery)
      .order("click_count", { ascending: false })
      .limit(10);
    return data ?? [];
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = performance.now();

  try {
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { query, type, userGoals } = body;
    console.log("[recipe-finder] Request — type:", type, "query:", query, "user:", userData.user.id);

    if (type === "search" && query?.trim()) {
      const cached = await searchLibrary(query);
      if (cached.length >= 3) {
        console.log("[recipe-finder] Cache HIT —", cached.length, "recipes from library");
        cached.forEach((r: any) => {
          supabase.rpc("increment_recipe_search", { recipe_id: r.id }).catch(() => {});
        });
        const recipes = cached.map((r: any) => ({
          id: r.id,
          name: r.title,
          description: r.description,
          image_url: r.image_url,
          source_name: r.source_name,
          source_url: r.source_url,
          prep_time_minutes: r.prep_time_minutes,
          servings: r.servings,
          calories_per_serving: r.calories_per_serving,
          protein_per_serving: r.protein_per_serving,
          carbs_per_serving: r.carbs_per_serving,
          fat_per_serving: r.fat_per_serving,
          fiber_per_serving: r.fiber_per_serving,
          ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
          instructions: Array.isArray(r.instructions)
            ? r.instructions.map((s: any) => typeof s === "string" ? s : String(s?.text ?? s?.description ?? JSON.stringify(s)))
            : [],
          reviews: Array.isArray(r.reviews) ? r.reviews : [],
          tags: Array.isArray(r.tags) ? r.tags : [],
          click_count: r.click_count ?? 0,
          from_cache: true,
        }));
        return new Response(JSON.stringify({ recipes, duration_ms: Math.round(performance.now() - started), from_cache: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("[recipe-finder] Cache MISS — only", cached.length, "results, calling AI");
    }

    let userMessage = "";
    if (type === "suggestions" && userGoals) {
      userMessage = `Generate 3 personalized recipe suggestions for a user with these daily macro goals:
- Calories: ${userGoals.calories} kcal (${userGoals.remainingCalories} remaining today)
- Protein: ${userGoals.protein}g
- Carbs: ${userGoals.carbs}g
- Fat: ${userGoals.fat}g
Current time: ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
Find real recipes from AllRecipes, Serious Eats, Food Network, or Epicurious that fit their remaining macros.`;
    } else {
      userMessage = `Search the web for 5 real recipes matching: "${query}"
Search these websites: allrecipes.com, seriouseats.com, foodnetwork.com, epicurious.com, bonappetit.com, tasty.co, delish.com, skinnytaste.com, halfbakedharvest.com, minimalistbaker.com
Return REAL recipe data from actual pages — real source URLs and real image URLs.`;
    }

    const systemPrompt = `You are a recipe search assistant with real-time web access. Find REAL recipes from cooking websites.

CRITICAL RULES:
1. calories_per_serving MUST be > 0. Calculate from ingredients using USDA data.
2. instructions MUST have at least 5 steps.
3. image_url: return the REAL image URL from the recipe page (.jpg/.jpeg/.png/.webp). If unavailable, return null.
4. source_url: return the REAL URL of the recipe page.
5. DO NOT invent recipes. Find real ones from real websites.

Return ONLY valid JSON, no markdown:
{"recipes":[{"id":"uuid","name":"Recipe Name","description":"Brief description","image_url":"https://real.com/photo.jpg","source_name":"AllRecipes","source_url":"https://allrecipes.com/recipe/...","prep_time_minutes":30,"servings":4,"calories_per_serving":450,"protein_per_serving":35,"carbs_per_serving":40,"fat_per_serving":12,"fiber_per_serving":5,"ingredients":[{"name":"chicken breast","amount":"200g","calories":330,"protein":62,"carbs":0,"fat":7}],"instructions":["Step 1: ...","Step 2: ...","Step 3: ...","Step 4: ...","Step 5: ..."],"reviews":[{"text":"Amazing!","author":"John D.","rating":5}],"tags":["high-protein","quick"]}]}`;

    console.log("[recipe-finder] Calling OpenRouter gemini-2.5-flash:online");
    const chatRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://macro-goal.app",
        "X-Title": "Macro Goal Recipe Finder",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash:online",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 6000,
      }),
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      console.error("[recipe-finder] OpenRouter error:", chatRes.status, errText);
      return new Response(JSON.stringify({ error: "AI search failed", detail: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatData = await chatRes.json();
    const rawContent = chatData.choices?.[0]?.message?.content ?? "";

    let recipes: any[] = [];
    try {
      recipes = JSON.parse(rawContent).recipes ?? [];
    } catch {
      try {
        const blockMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
        if (blockMatch) recipes = JSON.parse(blockMatch[1].trim()).recipes ?? [];
        else {
          const objMatch = rawContent.match(/\{[\s\S]*"recipes"[\s\S]*\}/);
          if (objMatch) recipes = JSON.parse(objMatch[0]).recipes ?? [];
        }
      } catch (e2) { console.error("[recipe-finder] JSON parse failed:", e2); }
    }

    recipes = recipes.filter((r: any) => r.calories_per_serving > 0 && r.instructions?.length >= 3);
    recipes = await Promise.all(recipes.map(async (r: any) => ({ ...r, image_url: await resolveImage(r.name ?? "", r.image_url) })));
    recipes = await Promise.all(recipes.map(verifyMacros));
    Promise.all(recipes.map(saveToLibrary)).catch(() => {});

    const duration_ms = Math.round(performance.now() - started);
    console.log("[recipe-finder] Done in", duration_ms, "ms, returning", recipes.length, "recipes");

    return new Response(JSON.stringify({ recipes, duration_ms, from_cache: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[recipe-finder] Unhandled error:", e.message);
    return new Response(JSON.stringify({ error: "Internal Server Error", detail: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

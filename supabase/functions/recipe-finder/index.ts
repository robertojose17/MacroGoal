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

    const systemPrompt = `You are a recipe search assistant with web access. Find real recipes and return structured JSON.

CRITICAL RULES — violating any of these makes the response invalid:
1. calories_per_serving MUST be > 0. Never return 0 calories. A real recipe always has calories.
2. Every ingredient MUST have calories > 0. Use USDA data: chicken breast ~165 cal/100g, olive oil ~884 cal/100g, pasta ~371 cal/100g, rice ~130 cal/100g cooked, egg ~155 cal/100g. Calculate calories for the EXACT amount listed (e.g. 200g chicken = 330 cal).
3. instructions MUST have at least 5 steps. Never return an empty or short instructions array.
4. image_url: search the web for the REAL photo of this specific dish from the recipe source. Return the direct image URL (must end in .jpg, .jpeg, .png, or .webp). If you cannot find a real image, return null — do NOT return a placeholder or picsum URL.
5. Sum of ingredient calories should approximately equal calories_per_serving × servings (within 20%).

RETURN ONLY valid JSON. No markdown, no code blocks.

{
  "recipes": [
    {
      "id": "unique-string-id",
      "name": "Recipe Name",
      "description": "Brief description",
      "image_url": "https://real-source.com/real-dish-photo.jpg",
      "source_name": "AllRecipes",
      "source_url": "https://allrecipes.com/recipe/...",
      "prep_time_minutes": 30,
      "servings": 4,
      "calories_per_serving": 450,
      "protein_per_serving": 35,
      "carbs_per_serving": 40,
      "fat_per_serving": 12,
      "fiber_per_serving": 5,
      "ingredients": [
        { "name": "chicken breast", "amount": "200g", "calories": 330, "protein": 62, "carbs": 0, "fat": 7 }
      ],
      "instructions": [
        "Step 1: Preheat oven to 400°F (200°C).",
        "Step 2: Season chicken with salt, pepper, and garlic powder.",
        "Step 3: Heat olive oil in an oven-safe skillet over medium-high heat.",
        "Step 4: Sear chicken 3 minutes per side until golden brown.",
        "Step 5: Transfer skillet to oven and bake 15-20 minutes until internal temperature reaches 165°F.",
        "Step 6: Rest 5 minutes before serving."
      ],
      "reviews": [
        { "text": "Amazing recipe!", "author": "John D.", "rating": 5 }
      ],
      "tags": ["high-protein", "quick"]
    }
  ]
}`;

    // 5. Call OpenRouter
    console.log("[recipe-finder] Calling OpenRouter with model google/gemini-2.5-flash:online");
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

    // ── Image resolution: real URL → TheMealDB → category Pexels ──────────────
    const CATEGORY_IMAGES: Record<string, string> = {
      chicken: 'https://images.pexels.com/photos/2338407/pexels-photo-2338407.jpeg?w=800',
      beef: 'https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?w=800',
      pork: 'https://images.pexels.com/photos/3535383/pexels-photo-3535383.jpeg?w=800',
      fish: 'https://images.pexels.com/photos/3655916/pexels-photo-3655916.jpeg?w=800',
      salmon: 'https://images.pexels.com/photos/3655916/pexels-photo-3655916.jpeg?w=800',
      pasta: 'https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?w=800',
      pizza: 'https://images.pexels.com/photos/2147491/pexels-photo-2147491.jpeg?w=800',
      burger: 'https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?w=800',
      salad: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?w=800',
      soup: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?w=800',
      taco: 'https://images.pexels.com/photos/2087748/pexels-photo-2087748.jpeg?w=800',
      burrito: 'https://images.pexels.com/photos/2087748/pexels-photo-2087748.jpeg?w=800',
      rice: 'https://images.pexels.com/photos/723198/pexels-photo-723198.jpeg?w=800',
      steak: 'https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?w=800',
      shrimp: 'https://images.pexels.com/photos/3655916/pexels-photo-3655916.jpeg?w=800',
      default: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?w=800',
    };

    function getCategoryImage(name: string): string {
      const lower = name.toLowerCase();
      for (const key of Object.keys(CATEGORY_IMAGES)) {
        if (key !== 'default' && lower.includes(key)) return CATEGORY_IMAGES[key];
      }
      return CATEGORY_IMAGES.default;
    }

    function isRealImageUrl(url: string | null | undefined): boolean {
      if (!url || url.includes('picsum.photos')) return false;
      if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) return true;
      if (/\/(images?|img|cdn|media|photos?|static|assets?|uploads?)\//i.test(url)) return true;
      return false;
    }

    async function fetchMealDbImage(name: string): Promise<string | null> {
      try {
        const encoded = encodeURIComponent(name);
        const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encoded}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.meals?.[0]?.strMealThumb) return data.meals[0].strMealThumb;
        // Try first word
        const firstWord = name.split(' ')[0];
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

    recipes = await Promise.all(recipes.map(async (r: any) => {
      let imageUrl: string | null = r.image_url;
      if (!isRealImageUrl(imageUrl)) {
        const mealDbImg = await fetchMealDbImage(r.name || '');
        imageUrl = mealDbImg ?? getCategoryImage(r.name || '');
      }
      return { ...r, image_url: imageUrl };
    }));
    console.log("[recipe-finder] Resolved images for", recipes.length, "recipes");

    // Filter out recipes with 0 calories or no steps
    recipes = recipes.filter((r: any) => {
      if (!r.calories_per_serving || r.calories_per_serving <= 0) {
        console.warn('[recipe-finder] Dropping recipe with 0 calories:', r.name);
        return false;
      }
      if (!r.instructions || r.instructions.length < 3) {
        console.warn('[recipe-finder] Dropping recipe with no steps:', r.name);
        return false;
      }
      return true;
    });
    // Fix ingredient calories: if any ingredient has 0 calories, estimate from name
    recipes = recipes.map((r: any) => ({
      ...r,
      ingredients: (r.ingredients || []).map((ing: any) => {
        if (!ing.calories || ing.calories <= 0) {
          // Rough estimate: 50 cal per ingredient as absolute minimum fallback
          return { ...ing, calories: 50 };
        }
        return ing;
      }),
    }));

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

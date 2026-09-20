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

async function generateAIImage(recipe: { id: string; title: string; description?: string | null; ingredients?: any[]; instructions?: any[] }): Promise<string | null> {
  try {
    const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
      .slice(0, 5).map((i: any) => i.name ?? i.ingredient ?? String(i)).filter(Boolean).join(", ");
    const steps = (Array.isArray(recipe.instructions) ? recipe.instructions : [])
      .slice(0, 2).map((s: any) => typeof s === "string" ? s : s.text ?? s.description ?? String(s)).filter(Boolean).join(". ");
    const t = recipe.title.toLowerCase();
    let visualGuide = "served on a white ceramic plate";
    if (/smoothie|frappe|shake|drink|juice|latte|coffee|tea/.test(t)) visualGuide = "served in a tall glass with a straw, showing the liquid drink";
    else if (/salad/.test(t)) visualGuide = "served in a bowl, showing the mixed salad with all ingredients visible";
    else if (/soup|stew|chili|broth/.test(t)) visualGuide = "served in a deep bowl, showing the liquid broth with ingredients";
    else if (/bowl/.test(t)) visualGuide = "served in a bowl, showing all components arranged";
    else if (/cake|cookie|brownie|ice cream|dessert|pudding|pie/.test(t)) visualGuide = "plated on a white dessert plate";
    const prompt = `Professional food photography of the FINAL PREPARED DISH: "${recipe.title}". ${recipe.description ?? ""}. Main ingredients: ${ingredients}. The dish is ${visualGuide}. Cooking context: ${steps.slice(0, 150)}. Shot from above or 45-degree angle, natural window lighting, appetizing, Michelin star quality, photorealistic. IMPORTANT: Show the COMPLETE FINISHED DISH as served, not raw ingredients.`;
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash-image", messages: [{ role: "user", content: prompt }], modalities: ["image"], max_tokens: 500 }),
    });
    if (!res.ok) { console.error("[generateAIImage] error:", res.status); return null; }
    const data = await res.json();
    let b64: string | null = null;
    const content = data?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "image_url") { b64 = part.image_url?.url; break; }
        if (part.type === "image") { b64 = part.image?.url ?? part.image?.data; break; }
      }
    }
    const images = data?.choices?.[0]?.message?.images;
    if (!b64 && Array.isArray(images) && images[0]) b64 = images[0]?.image_url?.url ?? images[0]?.url;
    if (!b64) { console.error("[generateAIImage] no image for:", recipe.title); return null; }
    const base64Data = b64.includes(",") ? b64.split(",")[1] : b64;
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    await supabase.storage.from("recipe-images").upload(`recipes/${recipe.id}.png`, imageBytes, { contentType: "image/png", upsert: true });
    const { data: { publicUrl } } = supabase.storage.from("recipe-images").getPublicUrl(`recipes/${recipe.id}.png`);
    await supabase.from("recipes").update({ image_url: publicUrl }).eq("id", recipe.id);
    console.log("[generateAIImage] done:", recipe.title);
    return publicUrl;
  } catch (e: any) { console.error("[generateAIImage] error:", e.message); return null; }
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

async function findDuplicate(title: string): Promise<string | null> {
  const normalized = normalizeTitle(title);
  const words = normalized.split(" ").filter((w) => w.length > 3);
  if (words.length === 0) return null;
  const { data } = await supabase.from("recipes").select("id, title")
    .textSearch("search_vector", words.slice(0, 3).join(" & ")).limit(5);
  if (!data?.length) return null;
  for (const row of data) {
    const existingWords = new Set(normalizeTitle(row.title ?? "").split(" "));
    const matchCount = words.filter((w) => existingWords.has(w)).length;
    if (matchCount / words.length >= 0.7) return row.id;
  }
  return null;
}

async function saveToLibrary(recipe: any): Promise<string | null> {
  try {
    const duplicateId = await findDuplicate(recipe.name ?? recipe.title ?? "");
    if (duplicateId) {
      supabase.rpc("increment_recipe_search", { recipe_id: duplicateId }).catch(() => {});
      return duplicateId;
    }
    const { data, error } = await supabase.from("recipes").insert({
      title: recipe.name ?? recipe.title,
      description: recipe.description ?? null,
      image_url: null,
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
      search_count: 1,
      last_searched_at: new Date().toISOString(),
    }).select("id").single();
    if (error) { console.error("[saveToLibrary] error:", error.message); return null; }
    return data.id;
  } catch (e: any) { console.error("[saveToLibrary] error:", e.message); return null; }
}

function mapRow(r: any) {
  return {
    id: r.id, name: r.title, description: r.description, image_url: r.image_url,
    source_name: r.source_name, source_url: r.source_url, prep_time_minutes: r.prep_time_minutes,
    servings: r.servings, calories_per_serving: r.calories_per_serving, protein_per_serving: r.protein_per_serving,
    carbs_per_serving: r.carbs_per_serving, fat_per_serving: r.fat_per_serving, fiber_per_serving: r.fiber_per_serving,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    instructions: Array.isArray(r.instructions) ? r.instructions.map((s: any) => typeof s === "string" ? s : String(s?.text ?? s?.description ?? JSON.stringify(s))) : [],
    reviews: Array.isArray(r.reviews) ? r.reviews : [],
    tags: Array.isArray(r.tags) ? r.tags : [],
    click_count: r.click_count ?? 0,
  };
}

async function searchLibrary(query: string): Promise<any[]> {
  try {
    const words = query.trim().split(/\s+/).filter((w) => w.length > 2);
    if (words.length === 0) return [];
    const { data } = await supabase.from("recipes").select("*")
      .textSearch("search_vector", words.map((w) => w + ":*").join(" & "))
      .order("click_count", { ascending: false }).limit(10);
    return data ?? [];
  } catch { return []; }
}

async function auditImage(recipe: any): Promise<{ match: boolean; confidence: string; what_image_shows: string; reason: string }> {
  const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).slice(0, 8).map((i: any) => i.name ?? i.ingredient ?? String(i)).filter(Boolean).join(", ");
  const steps = (Array.isArray(recipe.instructions) ? recipe.instructions : []).slice(0, 3).map((s: any) => typeof s === "string" ? s : s.text ?? s.description ?? String(s)).filter(Boolean).join(" | ");
  const prompt = `Strict food image auditor. Recipe: "${recipe.title}". Ingredients: ${ingredients}. Steps: ${steps}. Does image show FINAL PREPARED DISH? DRINK→glass, SALAD→mixed bowl, COOKED→cooked version. Reply ONLY JSON: {"match":true/false,"confidence":"high/medium/low","what_image_shows":"desc","reason":"reason"}`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: recipe.image_url } }, { type: "text", text: prompt }] }], max_tokens: 300 }),
    });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch { return { match: false, confidence: "low", what_image_shows: "error", reason: "audit failed" }; }
}

async function runWeeklyAudit(offset = 0, limit = 63) {
  const { data: recipes } = await supabase.rpc("get_unaudited_recipes");
  if (!recipes?.length) { console.log("[weekly-audit] nothing to audit"); return { audited: 0, regenerated: 0 }; }
  const batch = recipes.slice(offset, offset + limit);
  let audited = 0, regenerated = 0;
  for (let i = 0; i < batch.length; i += 5) {
    await Promise.all(batch.slice(i, i + 5).map(async (recipe: any) => {
      try {
        let auditResult = { match: false, confidence: "low", what_image_shows: "no image", reason: "no image_url" };
        if (recipe.image_url) auditResult = await auditImage(recipe);
        const needsRegen = !recipe.image_url || !auditResult.match || auditResult.confidence === "low";
        let newImageUrl: string | null = null;
        if (needsRegen) { newImageUrl = await generateAIImage(recipe); if (newImageUrl) regenerated++; }
        await supabase.from("recipe_image_audits").upsert({ recipe_id: recipe.id, recipe_title: recipe.title, image_url: recipe.image_url, match: auditResult.match, confidence: auditResult.confidence, what_image_shows: auditResult.what_image_shows, reason: auditResult.reason, regenerated: needsRegen && !!newImageUrl, new_image_url: newImageUrl, audited_at: new Date().toISOString() }, { onConflict: "recipe_id" });
        audited++;
      } catch (e: any) { console.error("[audit] error:", recipe.title, e.message); }
    }));
    if (i + 5 < batch.length) await new Promise(r => setTimeout(r, 500));
  }
  return { audited, regenerated };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = performance.now();

  if (req.method === "GET") {
    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const id = url.searchParams.get("id");
    if (type === "generate-image" && id) {
      const { data: recipe } = await supabase.from("recipes").select("id, title, description, ingredients, instructions, image_url").eq("id", id).single();
      if (!recipe) return new Response(JSON.stringify({ image_url: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (recipe.image_url) return new Response(JSON.stringify({ image_url: recipe.image_url }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const imageUrl = await generateAIImage(recipe);
      return new Response(JSON.stringify({ image_url: imageUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (type === "weekly-audit") {
      const offset = parseInt(url.searchParams.get("offset") ?? "0");
      const limit = parseInt(url.searchParams.get("limit") ?? "63");
      const result = await runWeeklyAudit(offset, limit);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    if (!OPENROUTER_API_KEY) return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Parse body first so we can check type before enforcing auth
    const body = await req.json();
    const { query, type, userGoals } = body;
    console.log("[recipe-finder] POST type:", type, "query:", query);

    // ── Browse: public, no auth required ──────────────────────────────────────
    if (type === "browse") {
      const page = Number(body.page ?? 0);
      const limit = 12;
      const offset = page * limit;
      console.log("[recipe-finder] browse page:", page, "offset:", offset);
      const { data: rows, error } = await supabase
        .from("recipes")
        .select("*")
        .order("click_count", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);
      const recipes = (rows ?? []).map(mapRow);
      const hasMore = recipes.length === limit;
      console.log("[recipe-finder] browse — returned:", recipes.length, "has_more:", hasMore);
      return new Response(
        JSON.stringify({ recipes, has_more: hasMore, total: recipes.length, page }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── All other types require auth ──────────────────────────────────────────
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    console.log("[recipe-finder] authed user:", userData.user.id);
    if (type === "search" && query?.trim()) {
      const cached = await searchLibrary(query);
      if (cached.length >= 3) {
        cached.forEach((r: any) => supabase.rpc("increment_recipe_search", { recipe_id: r.id }).catch(() => {}));
        return new Response(JSON.stringify({ recipes: cached.map(mapRow), duration_ms: Math.round(performance.now() - started), from_cache: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    let userMessage = "";
    if (type === "suggestions" && userGoals) {
      userMessage = `Generate 3 personalized recipe suggestions for a user with these daily macro goals: Calories: ${userGoals.calories} kcal (${userGoals.remainingCalories} remaining today), Protein: ${userGoals.protein}g, Carbs: ${userGoals.carbs}g, Fat: ${userGoals.fat}g. Current time: ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}. Find real recipes from AllRecipes, Serious Eats, Food Network, or Epicurious.`;
    } else {
      userMessage = `Search the web for 5 real recipes matching: "${query}". Search: allrecipes.com, seriouseats.com, foodnetwork.com, epicurious.com, bonappetit.com, tasty.co, delish.com, skinnytaste.com, halfbakedharvest.com, minimalistbaker.com. Return REAL recipe data with real source URLs. Set image_url to null.`;
    }
    const systemPrompt = `You are a recipe search assistant with real-time web access. Find REAL recipes from cooking websites. CRITICAL RULES: 1. calories_per_serving MUST be > 0. 2. instructions MUST have at least 5 steps. 3. image_url: always return null. 4. source_url: return the REAL URL. 5. DO NOT invent recipes. Return ONLY valid JSON, no markdown: {"recipes":[{"id":"uuid","name":"Recipe Name","description":"Brief description","image_url":null,"source_name":"AllRecipes","source_url":"https://allrecipes.com/recipe/...","prep_time_minutes":30,"servings":4,"calories_per_serving":450,"protein_per_serving":35,"carbs_per_serving":40,"fat_per_serving":12,"fiber_per_serving":5,"ingredients":[{"name":"chicken breast","amount":"200g","calories":330,"protein":62,"carbs":0,"fat":7}],"instructions":["Step 1: ...","Step 2: ...","Step 3: ...","Step 4: ...","Step 5: ..."],"reviews":[{"text":"Amazing!","author":"John D.","rating":5}],"tags":["high-protein","quick"]}]}`;
    const chatRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://macro-goal.app", "X-Title": "Macro Goal Recipe Finder" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash:online", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }], temperature: 0.2, max_tokens: 6000 }),
    });
    if (!chatRes.ok) {
      const errText = await chatRes.text();
      console.error("[recipe-finder] OpenRouter error:", chatRes.status, errText);
      return new Response(JSON.stringify({ error: "AI search failed" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const chatData = await chatRes.json();
    const rawContent = chatData.choices?.[0]?.message?.content ?? "";
    let recipes: any[] = [];
    try { recipes = JSON.parse(rawContent).recipes ?? []; }
    catch {
      try {
        const blockMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
        if (blockMatch) recipes = JSON.parse(blockMatch[1].trim()).recipes ?? [];
        else { const objMatch = rawContent.match(/\{[\s\S]*"recipes"[\s\S]*\}/); if (objMatch) recipes = JSON.parse(objMatch[0]).recipes ?? []; }
      } catch (e2) { console.error("[recipe-finder] JSON parse failed:", e2); }
    }
    recipes = recipes.filter((r: any) => r.calories_per_serving > 0 && r.instructions?.length >= 3);
    const savedIds = await Promise.all(recipes.map(saveToLibrary));
    recipes = recipes.map((r: any, i: number) => ({ ...r, id: savedIds[i] ?? r.id, image_url: null }));
    const response = new Response(JSON.stringify({ recipes, duration_ms: Math.round(performance.now() - started), from_cache: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    EdgeRuntime.waitUntil(Promise.all(recipes.filter((r: any) => r.id).map((r: any) => generateAIImage(r))));
    return response;
  } catch (e: any) {
    console.error("[recipe-finder] error:", e.message);
    return new Response(JSON.stringify({ error: "Internal Server Error", detail: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

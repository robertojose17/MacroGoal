import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Nutrition DB: [name, cal/100g, protein/100g, carbs/100g, fats/100g]
const NDB: [string, number, number, number, number][] = [
  ["chicken breast", 165, 31, 0, 3.6],
  ["chicken thigh", 209, 26, 0, 11],
  ["ground beef", 152, 22, 0, 7],
  ["ground turkey", 150, 22, 0, 7],
  ["beef steak", 271, 26, 0, 19],
  ["pork tenderloin", 143, 26, 0, 3.5],
  ["salmon", 208, 22, 0, 13],
  ["tuna", 132, 28, 0, 1],
  ["shrimp", 99, 24, 0, 0.3],
  ["tilapia", 128, 26, 0, 2.7],
  ["cod", 105, 23, 0, 0.9],
  ["egg", 155, 13, 1.1, 11],
  ["egg white", 52, 11, 0.7, 0.2],
  ["greek yogurt", 59, 10, 3.6, 0.4],
  ["cottage cheese", 98, 11, 3.4, 4.3],
  ["tofu", 144, 17, 2.8, 9],
  ["tempeh", 192, 20, 7.6, 11],
  ["lentils", 116, 9, 20, 0.4],
  ["black beans", 132, 9, 24, 0.5],
  ["chickpeas", 164, 9, 27, 2.6],
  ["white rice", 130, 2.7, 28, 0.3],
  ["brown rice", 112, 2.6, 24, 0.9],
  ["quinoa", 120, 4.4, 21, 1.9],
  ["oats", 379, 13, 68, 7],
  ["pasta", 131, 5, 25, 1.1],
  ["sweet potato", 86, 1.6, 20, 0.1],
  ["potato", 87, 1.9, 20, 0.1],
  ["bread", 265, 9, 49, 3.2],
  ["whole wheat bread", 247, 13, 41, 4.2],
  ["tortilla", 218, 6, 36, 5],
  ["broccoli", 35, 2.4, 7, 0.4],
  ["spinach", 23, 2.9, 3.6, 0.4],
  ["cauliflower", 25, 1.9, 5, 0.3],
  ["carrots", 41, 0.9, 10, 0.2],
  ["asparagus", 20, 2.2, 3.9, 0.1],
  ["bell pepper", 31, 1, 6, 0.3],
  ["banana", 89, 1.1, 23, 0.3],
  ["apple", 52, 0.3, 14, 0.2],
  ["blueberries", 57, 0.7, 14, 0.3],
  ["strawberries", 32, 0.7, 7.7, 0.3],
  ["orange", 47, 0.9, 12, 0.1],
  ["almonds", 579, 21, 22, 50],
  ["walnuts", 654, 15, 14, 65],
  ["peanut butter", 588, 25, 20, 50],
  ["olive oil", 884, 0, 0, 100],
  ["butter", 717, 0.9, 0.1, 81],
  ["avocado", 160, 2, 9, 15],
  ["cheese", 402, 25, 1.3, 33],
  ["mozzarella", 280, 28, 3.1, 17],
  ["milk", 42, 3.4, 5, 1],
  ["honey", 304, 0.3, 82, 0],
  ["whey protein", 370, 80, 8, 4],
];

type Macros = { cal: number; p: number; c: number; f: number };

function findInDB(name: string): Macros | null {
  const l = (name || "").toLowerCase();
  for (const [k, cal, p, c, f] of NDB) {
    if (l.includes(k) || k.includes(l)) return { cal, p, c, f };
  }
  return null;
}

function getAllItems(plan: any): any[] {
  const items: any[] = [];
  for (const key of ["breakfast", "lunch", "dinner", "snack"]) {
    const meal = plan[key];
    if (meal?.items) for (const it of meal.items) items.push(it);
  }
  return items;
}

function sumPlan(plan: any): { cal: number; p: number; c: number; f: number } {
  let cal = 0, p = 0, c = 0, f = 0;
  for (const it of getAllItems(plan)) {
    cal += Number(it.calories) || 0;
    p += Number(it.protein) || 0;
    c += Number(it.carbs) || 0;
    f += Number(it.fats) || 0;
  }
  return {
    cal: Math.round(cal),
    p: Math.round(p * 10) / 10,
    c: Math.round(c * 10) / 10,
    f: Math.round(f * 10) / 10,
  };
}

function recalcItem(item: any): void {
  const m = findInDB(item.name || "");
  if (!m) return;
  const sz = Number(item.serving_size) || 100;
  const fac = sz / 100;
  item.calories = Math.round(m.cal * fac);
  item.protein = Math.round(m.p * fac * 10) / 10;
  item.carbs = Math.round(m.c * fac * 10) / 10;
  item.fats = Math.round(m.f * fac * 10) / 10;
}

function scalePlan(
  plan: any,
  goals: { daily_calories: number; daily_protein: number; daily_fats: number }
): void {
  const allItems = getAllItems(plan);
  for (const it of allItems) recalcItem(it);

  // STEP 1: Scale protein
  for (let iter = 0; iter < 12; iter++) {
    const tot = sumPlan(plan);
    const gap = goals.daily_protein - tot.p;
    if (Math.abs(gap) <= 5) break;

    const protItems = allItems.filter((it) => {
      const m = findInDB(it.name || "");
      return m && m.p > 10;
    });
    if (!protItems.length) break;

    const totalProt = protItems.reduce((s, it) => s + (Number(it.protein) || 0), 0);
    if (totalProt <= 0) break;

    for (const it of protItems) {
      const itemProt = Number(it.protein) || 0;
      if (itemProt <= 0) continue;
      const share = itemProt / totalProt;
      const itemGap = gap * share;
      const m = findInDB(it.name || "")!;
      const currentSz = Number(it.serving_size) || 100;
      const deltaSz = (itemGap / m.p) * 100;
      it.serving_size = Math.max(30, Math.min(500, Math.round(currentSz + deltaSz)));
      recalcItem(it);
    }
  }

  // STEP 2: Scale fats
  for (let iter = 0; iter < 12; iter++) {
    const tot = sumPlan(plan);
    const gap = goals.daily_fats - tot.f;
    if (Math.abs(gap) <= 5) break;

    const fatItems = allItems.filter((it) => {
      const m = findInDB(it.name || "");
      return m && m.f > 10 && m.p < 15;
    });
    if (!fatItems.length) break;

    const totalFat = fatItems.reduce((s, it) => s + (Number(it.fats) || 0), 0);
    if (totalFat <= 0) break;

    for (const it of fatItems) {
      const itemFat = Number(it.fats) || 0;
      if (itemFat <= 0) continue;
      const share = itemFat / totalFat;
      const itemGap = gap * share;
      const m = findInDB(it.name || "")!;
      const currentSz = Number(it.serving_size) || 100;
      const deltaSz = (itemGap / m.f) * 100;
      it.serving_size = Math.max(5, Math.min(300, Math.round(currentSz + deltaSz)));
      recalcItem(it);
    }
  }

  // STEP 3: Adjust calories aggressively
  for (let iter = 0; iter < 15; iter++) {
    const tot = sumPlan(plan);
    const calMin = goals.daily_calories - 100;
    const calMax = goals.daily_calories + 10;
    if (tot.cal >= calMin && tot.cal <= calMax) break;

    const target = goals.daily_calories - 30;
    const gap = target - tot.cal;

    let scalable = allItems.filter((it) => {
      const m = findInDB(it.name || "");
      return m && m.c > 5;
    });
    if (!scalable.length) {
      scalable = allItems.filter((it) => findInDB(it.name || ""));
    }
    if (!scalable.length) break;

    const totalCal = scalable.reduce((s, it) => s + (Number(it.calories) || 0), 0);
    if (totalCal <= 0) break;

    for (const it of scalable) {
      const itemCal = Number(it.calories) || 0;
      if (itemCal <= 0) continue;
      const share = itemCal / totalCal;
      const itemGap = gap * share;
      const m = findInDB(it.name || "")!;
      const currentSz = Number(it.serving_size) || 100;
      const deltaSz = (itemGap / m.cal) * 100;
      it.serving_size = Math.max(20, Math.min(500, Math.round(currentSz + deltaSz)));
      recalcItem(it);
    }
  }

  const final = sumPlan(plan);
  console.log("[MealPlan] scaler result:", final, "goals:", goals);
}

function buildPrompt(goals: any, prefs: any): string {
  const calMin = goals.daily_calories - 100;
  const calMax = goals.daily_calories + 10;
  const pMin = goals.daily_protein - 10;
  const pMax = goals.daily_protein + 10;
  const fMin = goals.daily_fats - 10;
  const fMax = goals.daily_fats + 10;

  const dietLine = prefs?.dietary_restrictions?.length
    ? `DIETARY RESTRICTIONS (HARD): ${prefs.dietary_restrictions.join(", ")} — never include these.\n`
    : "";
  const protLine = prefs?.protein_preferences?.length
    ? `PREFERRED PROTEINS: ${prefs.protein_preferences.join(", ")}\n`
    : "";
  const dislikedLine = prefs?.disliked_foods
    ? `DISLIKED FOODS: ${prefs.disliked_foods} — avoid these.\n`
    : "";
  const styleLine = prefs?.recipe_styles?.length
    ? `COOKING STYLE: ${prefs.recipe_styles.join(", ")}\n`
    : "";

  return `You are an expert chef and nutritionist coach. Create a full-day meal plan that helps the user reach their fitness goals.

DAILY MACRO TARGETS:
- Calories: ${calMin}–${calMax} kcal (PRIORITY 1)
- Protein: ${pMin}–${pMax}g (PRIORITY 2)
- Fats: ${fMin}–${fMax}g (PRIORITY 3)
- Carbs: flexible — use carbs to fill remaining calories

${dietLine}${protLine}${dislikedLine}${styleLine}
RULES:
- Include breakfast, lunch, dinner, and snack
- Each meal should be delicious, realistic, and easy to prepare
- Use real foods with accurate serving sizes (in grams or ml)
- serving_description = cooking method only (e.g. "grilled", "steamed", "raw", "baked")
- brand = null for whole foods; use brand name for packaged foods
- Make the plan diverse — different proteins, cuisines, and flavors across meals
- Use exact field names: "protein", "carbs", "fats" (with s), "calories"

OUTPUT: Valid JSON only, no markdown fences, no extra text.

{
  "breakfast": {
    "meal_name": "string",
    "dish_description": "string",
    "items": [
      {
        "name": "string",
        "brand": null,
        "serving_size": 150,
        "serving_unit": "g",
        "serving_description": "grilled",
        "calories": 248,
        "protein": 46,
        "carbs": 0,
        "fats": 5,
        "fiber": 0
      }
    ]
  },
  "lunch": { "meal_name": "string", "dish_description": "string", "items": [...] },
  "dinner": { "meal_name": "string", "dish_description": "string", "items": [...] },
  "snack": { "meal_name": "string", "dish_description": "string", "items": [...] }
}`;
}

function jsonResp(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method !== "POST") return jsonResp({ error: "Method Not Allowed" }, 405);
    if (!OPENROUTER_API_KEY) return jsonResp({ error: "No OPENROUTER_API_KEY" }, 500);

    const auth = req.headers.get("Authorization") || "";
    if (!auth) return jsonResp({ error: "Unauthorized" }, 401);
    const { data: user, error: authErr } = await supabase.auth.getUser(
      auth.replace("Bearer ", "")
    );
    if (authErr || !user?.user) return jsonResp({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    if (!body) return jsonResp({ error: "Invalid JSON" }, 400);

    const messages: any[] = body.messages || [];
    const userGoals = body.userGoals || {
      daily_calories: 2000,
      daily_protein: 150,
      daily_carbs: 200,
      daily_fats: 65,
    };
    const userPreferences = body.userPreferences || null;

    if (!messages.length) return jsonResp({ error: "messages required" }, 400);

    const systemPrompt = buildPrompt(userGoals, userPreferences);
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    console.log("[MealPlan] calling OpenRouter, goals:", userGoals);
    const started = performance.now();

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SUPABASE_URL,
        "X-Title": "Macro Goal Meal Planner",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: apiMessages,
        temperature: 0.85,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[MealPlan] OpenRouter error:", res.status, err);
      return jsonResp({ error: "OpenRouter Error", detail: err }, 502);
    }

    const json = await res.json();
    if (json?.choices?.[0]?.finish_reason === "length") {
      console.error("[MealPlan] output truncated");
    }

    const raw = json?.choices?.[0]?.message?.content ?? "";
    if (!raw) return jsonResp({ error: "Empty response" }, 502);

    let planData: any;
    try {
      planData = JSON.parse(raw);
    } catch {
      console.error("[MealPlan] JSON parse failed:", raw.slice(0, 200));
      return jsonResp({ error: "Invalid JSON from AI" }, 502);
    }

    const duration_ms = Math.round(performance.now() - started);
    console.log("[MealPlan] GPT done in", duration_ms, "ms");

    scalePlan(planData, userGoals);

    const final = sumPlan(planData);
    const calOk = final.cal >= userGoals.daily_calories - 100 && final.cal <= userGoals.daily_calories + 10;
    const pOk = Math.abs(final.p - userGoals.daily_protein) <= 10;
    const fOk = Math.abs(final.f - userGoals.daily_fats) <= 10;
    const validation_passed = calOk && pOk && fOk;

    console.log("[MealPlan] final:", final, "validation_passed:", validation_passed);

    return jsonResp({
      readyToSave: true,
      message: "Your meal plan is ready!",
      planData,
      validation_passed,
      duration_ms,
    });
  } catch (e: any) {
    console.error("[MealPlan] unhandled error:", e.message);
    return jsonResp({ error: "Internal Server Error", detail: String(e.message) }, 500);
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function mapRow(row: any) {
  return {
    id: row.id,
    name: row.title ?? row.name,
    description: row.description ?? null,
    image_url: row.image_url ?? null,
    source_name: row.source_name ?? null,
    source_url: row.source_url ?? null,
    prep_time_minutes: row.prep_time_minutes ?? null,
    servings: row.servings ?? null,
    calories_per_serving: row.calories_per_serving ?? null,
    protein_per_serving: row.protein_per_serving ?? null,
    carbs_per_serving: row.carbs_per_serving ?? null,
    fat_per_serving: row.fat_per_serving ?? null,
    fiber_per_serving: row.fiber_per_serving ?? null,
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    instructions: Array.isArray(row.instructions)
      ? row.instructions.map((s: any) => typeof s === "string" ? s : String(s?.text ?? s?.description ?? s?.instruction ?? JSON.stringify(s)))
      : [],
    reviews: Array.isArray(row.reviews) ? row.reviews : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    click_count: row.click_count ?? 0,
    generated_at: row.created_at ?? null,
    last_clicked_at: row.last_clicked_at ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = body?.id;
      if (id) {
        await supabase.rpc("increment_recipe_click", { recipe_id: id });
        console.log("[popular-recipes] Click tracked for:", id);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: trendingRows } = await supabase
      .from("recipes")
      .select("*")
      .gte("last_clicked_at", sevenDaysAgo)
      .order("click_count", { ascending: false })
      .limit(5);

    let trending = (trendingRows ?? []).map(mapRow);

    if (trending.length < 5) {
      const existingIds = trending.map((r: any) => r.id);
      const { data: fallbackRows } = await supabase
        .from("recipes")
        .select("*")
        .order("click_count", { ascending: false })
        .limit(10);
      const fallback = (fallbackRows ?? [])
        .filter((r: any) => !existingIds.includes(r.id))
        .slice(0, 5 - trending.length)
        .map(mapRow);
      trending = [...trending, ...fallback];
    }

    const trendingIds = trending.map((r: any) => r.id);
    const { data: popularRows } = await supabase
      .from("recipes")
      .select("*")
      .order("click_count", { ascending: false })
      .limit(40);

    const popularThisWeek = (popularRows ?? [])
      .filter((r: any) => !trendingIds.includes(r.id))
      .slice(0, 20)
      .map(mapRow);

    console.log("[popular-recipes] GET — trending:", trending.length, "popular_this_week:", popularThisWeek.length);

    return new Response(JSON.stringify({ trending, popular_this_week: popularThisWeek }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[popular-recipes] Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

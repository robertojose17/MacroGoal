import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { query, limit = 30, user_id } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({ products: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const q = query.trim().toLowerCase();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Stage 1: Our food_items DB + Stage 2: USDA — run in parallel
    const [dbResult, usdaResult] = await Promise.allSettled([
      searchOurDB(supabase, q, 25),
      searchUSDA(q, 15),
    ]);

    const dbProducts = dbResult.status === 'fulfilled' ? dbResult.value : [];
    const usdaProducts = usdaResult.status === 'fulfilled' ? usdaResult.value : [];

    const combined = [...dbProducts, ...usdaProducts];

    // Stage 3: Open Food Facts — only if we have fewer than 10 results
    let offProducts: any[] = [];
    if (combined.length < 10) {
      try {
        offProducts = await searchOpenFoodFacts(q, 20);
      } catch (_) {}
    }

    // Deduplicate by barcode/fdcId
    const seen = new Set<string>();
    const merged: any[] = [];

    for (const p of [...dbProducts, ...usdaProducts, ...offProducts]) {
      const key = p.code || p._usda_fdc_id?.toString() || p.product_name;
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(p);
    }

    return new Response(JSON.stringify({ products: merged.slice(0, limit) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('search-foods error:', err);
    return new Response(JSON.stringify({ products: [], error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function searchOurDB(supabase: any, query: string, limit: number): Promise<any[]> {
  const { data, error } = await supabase
    .from('food_items')
    .select('*')
    .or(`name.ilike.%${query}%,brand.ilike.%${query}%`)
    .limit(limit * 2);

  if (error || !data) return [];

  const scored = data.map((item: any) => {
    const name = (item.name || '').toLowerCase();
    const brand = (item.brand || '').toLowerCase();
    let score = 0;
    if (name === query) score += 1000;
    else if (name.startsWith(query)) score += 500;
    else if (name.includes(query)) score += 200;
    if (brand.includes(query)) score += 100;
    score += (item.logs_last_30d || 0) * 3;
    score += item.popularity_score || 0;
    score += item.data_quality_score || 0;
    return { ...item, _score: score, _source: 'db' };
  });

  scored.sort((a: any, b: any) => b._score - a._score);

  return scored.slice(0, limit).map((item: any) => ({
    code: item.barcode || item.id,
    product_name: item.name || '',
    generic_name: item.generic_name || '',
    brands: item.brand || '',
    serving_size: item.serving_size || '100g',
    serving_quantity: item.serving_quantity || 100,
    image_url: item.image_url || '',
    _source: 'db',
    _score: item._score,
    popularity_score: item.popularity_score || 0,
    logs_last_30d: item.logs_last_30d || 0,
    nutriments: {
      'energy-kcal_100g': item.calories_per_100g || 0,
      proteins_100g: item.protein_per_100g || 0,
      carbohydrates_100g: item.carbs_per_100g || 0,
      fat_100g: item.fat_per_100g || 0,
      fiber_100g: item.fiber_per_100g || 0,
      sugars_100g: item.sugars_per_100g || 0,
      sodium_100g: item.sodium_per_100g || 0,
    },
  }));
}

async function searchUSDA(query: string, limit: number): Promise<any[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=${limit}&api_key=DEMO_KEY`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    const foods = data.foods || [];

    return foods
      .filter((f: any) => f.description && f.description.trim().length > 0)
      .map((f: any) => {
        const nutrients = f.foodNutrients || [];
        const getNutrient = (name: string) =>
          nutrients.find((n: any) =>
            (n.nutrientName || '').toLowerCase().includes(name.toLowerCase())
          )?.value || 0;

        const isPerServing = f.dataType === 'Branded';
        const servingSize = f.servingSize || 100;
        const factor = isPerServing && servingSize > 0 ? (100 / servingSize) : 1;

        const sodium = getNutrient('sodium');

        return {
          code: String(f.fdcId),
          product_name: f.description || '',
          generic_name: '',
          brands: f.brandOwner || f.brandName || '',
          serving_size: f.servingSize ? `${f.servingSize}${f.servingSizeUnit || 'g'}` : '100g',
          serving_quantity: f.servingSize || 100,
          image_url: '',
          _source: 'usda',
          _usda_fdc_id: f.fdcId,
          nutriments: {
            'energy-kcal_100g': getNutrient('energy') * factor,
            proteins_100g: getNutrient('protein') * factor,
            carbohydrates_100g: getNutrient('carbohydrate') * factor,
            fat_100g: getNutrient('total lipid') * factor,
            fiber_100g: getNutrient('fiber') * factor,
            sugars_100g: getNutrient('sugars') * factor,
            sodium_100g: (sodium * factor) / 1000,
          },
        };
      });
  } catch (_) {
    clearTimeout(timeout);
    return [];
  }
}

async function searchOpenFoodFacts(query: string, limit: number): Promise<any[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${limit}&sort_by=unique_scans_n&fields=code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments,image_url`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const products = data.products || [];

  return products
    .filter((p: any) => p.product_name && p.product_name.trim().length > 0)
    .map((p: any) => ({ ...p, _source: 'off' }));
}

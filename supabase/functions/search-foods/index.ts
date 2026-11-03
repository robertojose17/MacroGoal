import { decorateCachedProducts } from '../_shared/portionCache.mjs';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { firstText, normalizeQuery, queryVariants, searchCatalog, ProviderHttpError } from './searchCore.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Data-quality scoring (0–13 pts)
// ---------------------------------------------------------------------------
function scoreProduct(p: Record<string, unknown>): number {
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  let score = 0;
  const kcal = Number(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0);
  if (kcal > 0) score += 3;
  const protein = Number(n['proteins_100g'] ?? n['proteins'] ?? 0);
  if (protein > 0) score += 2;
  const carbs = Number(n['carbohydrates_100g'] ?? n['carbohydrates'] ?? 0);
  if (carbs > 0) score += 2;
  const fat = Number(n['fat_100g'] ?? n['fat'] ?? 0);
  if (fat > 0) score += 2;
  const fiberRaw = n['fiber_100g'] ?? n['fiber'];
  if (fiberRaw !== undefined && fiberRaw !== null && Number(fiberRaw) >= 0) score += 1;
  const sq = Number(p.serving_quantity ?? 0);
  if (sq > 0) score += 1;
  const name = String(p.product_name ?? '').trim();
  if (name.length > 0) score += 1;
  const grade = String(p.nutriscore_grade ?? '').trim().toLowerCase();
  if (grade && grade !== 'unknown') score += 1;
  return score;
}

// ---------------------------------------------------------------------------
// Composite relevance score for Supabase DB results
// ---------------------------------------------------------------------------
function compositeScore(
  row: Record<string, unknown>,
  query: string,
): number {
  const q = query.toLowerCase().trim();
  const name = firstText(row.product_name, row.name, row.generic_name).toLowerCase();
  const brand = String(row.brands ?? row.brand ?? '').toLowerCase().trim();

  let score = 0;

  // Name match bonuses
  if (name === q) score += 1000;
  else if (name.startsWith(q)) score += 500;
  else if (name.includes(q)) score += 200;

  // Brand match bonus
  if (brand && brand.includes(q)) score += 100;

  // Popularity signals
  const logs30 = Number(row.logs_last_30d ?? 0);
  score += logs30 * 3;

  const popularity = Number(row.popularity_score ?? 0);
  score += popularity;

  const dataQuality = Number(row.data_quality_score ?? 0);
  score += dataQuality;

  return score;
}

// ---------------------------------------------------------------------------
// Map a food_items DB row → OpenFoodFactsProduct shape
// ---------------------------------------------------------------------------
export function mapDbRowToOff(
  row: Record<string, unknown>,
  query: string,
): Record<string, unknown> {
  const calories = Number(row.calories ?? 0);
  const protein = Number(row.protein ?? 0);
  const carbs = Number(row.carbs ?? 0);
  const fat = Number(row.fat ?? 0);
  const fiber = Number(row.fiber ?? 0);

  const macrosPer = String(row.macros_per ?? '100g');
  const servingSize = Number(row.serving_size ?? 100) || 100;
  const multiplier = macrosPer === '100g' ? 1 : (servingSize > 0 ? 100 / servingSize : 1);

  const nutriments: Record<string, number> = {
    'energy-kcal_100g': calories * multiplier,
    'proteins_100g': protein * multiplier,
    'carbohydrates_100g': carbs * multiplier,
    'fat_100g': fat * multiplier,
    'fiber_100g': fiber * multiplier,
  };

  const extraNutriments = (row.nutriments ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(extraNutriments)) {
    if (!(k in nutriments)) {
      nutriments[k] = Number(v);
    }
  }

  return {
    code: String(row.barcode ?? row.id ?? ''),
    product_name: firstText(row.product_name, row.name, row.generic_name),
    generic_name: String(row.generic_name ?? '').trim(),
    brands: firstText(row.brands, row.brand),
    serving_size: String(row.serving_unit ? `${servingSize} ${row.serving_unit}` : `${servingSize} g`),
    serving_quantity: String(row.serving_quantity ?? servingSize),
    nutriments,
    nutriscore_grade: row.nutriscore_grade ?? null,
    unique_scans_n: Number(row.popularity_score ?? row.search_count ?? 0),
    _source: 'supabase',
    _composite_score: compositeScore(row, query),
    _data_quality_score: scoreProduct({
      product_name: firstText(row.product_name, row.name, row.generic_name),
      serving_quantity: row.serving_quantity ?? servingSize,
      nutriscore_grade: row.nutriscore_grade,
      nutriments,
    }),
    _db_id: String(row.id ?? ''),
    _usda_fdc_id: row.usda_fdc_id ? String(row.usda_fdc_id) : undefined,
    _db_row: row,
  };
}

// ---------------------------------------------------------------------------
// Map USDA FoodData Central result → OpenFoodFactsProduct shape
// ---------------------------------------------------------------------------
export function mapUsdaToOff(item: Record<string, unknown>): Record<string, unknown> | null {
  const description = String(item.description ?? '').trim();
  if (!description) return null;

  const fdcId = item.fdcId ?? item.fdcid;
  const dataType = String(item.dataType ?? item.datatype ?? '').toLowerCase();
  const isBranded = dataType === 'branded';

  // Parse serving size for branded items (needed to normalize to per-100g)
  const servingSizeRaw = Number(item.servingSize ?? 0);
  const servingSizeUnit = String(item.servingSizeUnit ?? 'g').toLowerCase();
  // Convert oz to g if needed
  const servingSizeG = servingSizeUnit === 'oz' ? servingSizeRaw * 28.3495 : servingSizeRaw;
  const normFactor = (isBranded && servingSizeG > 0) ? (100 / servingSizeG) : 1;

  const nutrients = Array.isArray(item.foodNutrients)
    ? (item.foodNutrients as Record<string, unknown>[])
    : [];

  function getNutrient(names: string[]): number {
    for (const n of nutrients) {
      const nutrientName = String(
        (n.nutrientName ?? (n.nutrient as Record<string, unknown>)?.name ?? ''),
      ).toLowerCase();
      for (const target of names) {
        if (nutrientName.includes(target.toLowerCase())) {
          const val = Number(n.value ?? (n as Record<string, unknown>).amount ?? 0);
          return val * normFactor;
        }
      }
    }
    return 0;
  }

  const kcal = getNutrient(['energy', 'calories']);
  const proteinG = getNutrient(['protein']);
  const carbsG = getNutrient(['carbohydrate, by difference', 'carbohydrate']);
  const fatG = getNutrient(['total lipid (fat)', 'total fat', 'fat']);
  const fiberG = getNutrient(['fiber, total dietary', 'dietary fiber', 'fiber']);
  const sugarsG = getNutrient(['sugars, total', 'total sugars', 'sugars']);
  const sodiumMg = getNutrient(['sodium']);

  const nutriments: Record<string, number> = {
    'energy-kcal_100g': kcal,
    'proteins_100g': proteinG,
    'carbohydrates_100g': carbsG,
    'fat_100g': fatG,
    'fiber_100g': fiberG,
    'sugars_100g': sugarsG,
    'sodium_100g': sodiumMg / 1000, // mg → g
  };

  const brandOwner = String(item.brandOwner ?? item.brandName ?? '').trim();
  const servingDisplay = servingSizeG > 0
    ? `${Math.round(servingSizeG)} g`
    : '100 g';

  return {
    code: String(fdcId ?? ''),
    product_name: description,
    generic_name: '',
    brands: brandOwner,
    serving_size: servingDisplay,
    serving_quantity: servingSizeG > 0 ? String(Math.round(servingSizeG)) : '100',
    nutriments,
    nutriscore_grade: null,
    unique_scans_n: 0,
    _source: 'usda',
    _usda_fdc_id: String(fdcId ?? ''),
    _data_quality_score: scoreProduct({ product_name: description, nutriments }),
  };
}

// ---------------------------------------------------------------------------
// Map OFacts product → OpenFoodFactsProduct shape
// ---------------------------------------------------------------------------
function mapOffProduct(
  p: Record<string, unknown>,
  score: number,
): Record<string, unknown> {
  return {
    code: String(p.code ?? '').trim(),
    product_name: firstText(p.product_name, p.generic_name),
    generic_name: String(p.generic_name ?? '').trim(),
    brands: String(p.brands ?? '').trim(),
    serving_size: p.serving_size ?? null,
    serving_quantity: p.serving_quantity ?? null,
    nutriments: (p.nutriments ?? {}) as Record<string, unknown>,
    nutriscore_grade: p.nutriscore_grade ?? null,
    unique_scans_n: Number(p.unique_scans_n ?? 0),
    _source: 'openfoodfacts',
    _data_quality_score: score,
  };
}

// Database macro/serving mapping above is retained from deployed v32.
// The indexed RPC is a separately reviewed, service-only read dependency.
export async function handleSearch(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' },405);
  let query: string; let limit: number;
  try {
    const body = await req.json();
    if (typeof body?.query !== 'string' || body.query.length > 160) throw new Error('Invalid query');
    query = body.query.trim(); limit = body.limit ?? 30;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || normalizeQuery(query).length < 2
      || normalizeQuery(query).split(' ').length > 12) throw new Error('Invalid query');
  } catch { return jsonResponse({ products: [],count: 0,error: 'Invalid search request' },400); }
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const result = await searchCatalog(query,limit,{
    db: async (normalized,signal) => {
      const { data,error } = await supabase.rpc('search_food_catalog_v2',{ p_queries: queryVariants(normalized),p_limit: limit }).abortSignal(signal);
      if (error || !Array.isArray(data)) throw new Error('CATALOG_UNAVAILABLE');
      return data.map(row => mapDbRowToOff(row as Record<string,unknown>,normalized));
    },
    usda: async (normalized,signal) => {
      const url = 'https://api.nal.usda.gov/fdc/v1/foods/search?query=' + encodeURIComponent(normalizeQuery(normalized)) + '&pageSize=30&api_key=DEMO_KEY';
      const response = await fetch(url,{ signal });
      if (!response.ok) throw new ProviderHttpError('USDA_UNAVAILABLE',response.status);
      const body = await response.json();
      if (!Array.isArray(body.foods)) throw new Error('USDA_INVALID_RESPONSE');
      return body.foods.map(mapUsdaToOff).filter((p: Record<string,unknown> | null): p is Record<string,unknown> => p !== null);
    },
    off: async (normalized,signal) => {
      const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' + encodeURIComponent(normalized)
        + '&search_simple=1&action=process&json=1&page_size=20&sort_by=unique_scans_n'
        + '&fields=code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments,image_url';
      const response = await fetch(url,{ signal,headers: { 'User-Agent': 'MacroGoal/1.0 (contact@macrogoal.app)' } });
      if (!response.ok) throw new ProviderHttpError('OFF_UNAVAILABLE',response.status);
      const body = await response.json();
      if (!Array.isArray(body.products)) throw new Error('OFF_INVALID_RESPONSE');
      return body.products.map((p: Record<string,unknown>) => mapOffProduct(p,scoreProduct(p)));
    },
  });
  result.products = await decorateCachedProducts(result.products,supabase,150);
  // Empty + unavailable is not an authoritative no-results response.
  return jsonResponse(result,result.count === 0 && result.status === 'partial' ? 503 : 200);
}
Deno.serve(handleSearch);

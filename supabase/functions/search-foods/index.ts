import {attachCatalogPortionSources} from '../_shared/catalogPortionBatch.mjs';
import {createSearchNutritionBatch,scheduleSearchNutritionBatch} from '../_shared/searchNutritionCapture.mjs';
// @ts-types="../_shared/searchHydration.d.mts"
import { hydrateSearchRows, hasCanonicalGramServing, normalizeSearchNutrition, searchNutritionIssue, serializeSearchProduct } from '../_shared/searchHydration.mjs';
import {usdaSearchNutriments} from '../_shared/nutritionProvider.mjs';
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
  preserveServing = false,
): Record<string, unknown> {
  const normalized = normalizeSearchNutrition(row);
  if (!normalized.valid) {
    // Keep identity visible, but never send unsafe nutrient/serving numbers as selectable food.
    return {
      code: String(row.barcode ?? row.id ?? ''),
      product_name: firstText(row.product_name, row.name, row.generic_name),
      generic_name: firstText(row.generic_name), brands: firstText(row.brands, row.brand),
      _source: 'supabase', _db_id: String(row.id ?? ''),
      _usda_fdc_id: row.usda_fdc_id ? String(row.usda_fdc_id) : undefined,
      requires_label_confirmation: true,
      nutrition_issue: searchNutritionIssue(row, normalized.reason),
    };
  }
  const { nutriments, servingSize, hasCanonicalServing } = normalized;

  const servingCount = Number(row.serving_count ?? 1);
  const servingDescription = typeof row.serving_description === 'string' ? row.serving_description.trim() : '';
  const canonicalServing = servingDescription
    ? `${servingCount} ${servingDescription} (${servingSize} g)`
    : `${servingSize} g`;
  return {
    ...(preserveServing ? { _serving_authority: 'confirmed_correction' } : {}),
    code: String(row.barcode ?? row.id ?? ''),
    product_name: firstText(row.product_name, row.name, row.generic_name),
    generic_name: String(row.generic_name ?? '').trim(),
    brands: firstText(row.brands, row.brand),
    serving_size: !hasCanonicalServing ? '100 g' : preserveServing ? canonicalServing : String(row.serving_unit ? `${servingSize} ${row.serving_unit}` : `${servingSize} g`),
    serving_quantity: !hasCanonicalServing ? '100' : preserveServing ? String(servingSize) : String(row.serving_quantity ?? servingSize),
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

  // USDA already reports per100g. Exact IDs/units avoid double normalization.
  const nutriments = usdaSearchNutriments(item);

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
  _score: number,
): Record<string, unknown> {
  // OFF *_100g may describe 100 ml. Search projection alone cannot prove a gram basis.
  // Keep the visible result and original label as explicitly unconfirmed text only.
  const rawLabel = typeof p.serving_size === 'string' ? p.serving_size.trim() : '';
  const label = rawLabel.length <= 160 && !/[\x00-\x1f<>]/.test(rawLabel) ? rawLabel : '';
  const hasVolume = /\b(?:ml|millilit(?:er|re)s?|lit(?:er|re)s?|fl[ .]*oz|fluid ounces?)\b|\d\s*l\b/i.test(label);
  const hasGrams = /\d(?:[.,]\d+)?\s*(?:g|grams?|kg|kilograms?)\b/i.test(label);
  return {
    code: String(p.code ?? '').trim(),
    product_name: firstText(p.product_name, p.generic_name),
    generic_name: firstText(p.generic_name),
    brands: firstText(p.brands),
    _source: 'openfoodfacts',
    requires_label_confirmation: true,
    nutrition_issue: hasVolume && !hasGrams ? 'volume_basis_requires_confirmation' : 'external_food_requires_confirmation',
    ...(label ? { unconfirmed_serving_label: label } : {}),
  };
}

// Ranking RPC is unchanged. Hydration is a separately reviewed service-only read.
// A failed hydration preserves the coherent ranking snapshot and disables enrichment.
export async function handleSearch(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' },405);
  let query: string; let limit: number;
  let supportsLabelConfirmation = false;
  try {
    const body = await req.json();
    supportsLabelConfirmation = body?.review_capability === 'label_confirmation_v1';
    if (typeof body?.query !== 'string' || body.query.length > 160) throw new Error('Invalid query');
    query = body.query.trim(); limit = body.limit ?? 30;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || normalizeQuery(query).length < 2
      || normalizeQuery(query).split(' ').length > 12) throw new Error('Invalid query');
  } catch { return jsonResponse({ products: [],count: 0,error: 'Invalid search request' },400); }
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const nutritionBatch=createSearchNutritionBatch();
  const uncertainProducts = new WeakSet<object>();
  let hydrationPartial = false;
  let requiresLabelConfirmation = false;
  const result = await searchCatalog(query,limit,{
    skipFallback: () => requiresLabelConfirmation,
    db: async (normalized,signal,deadlineMs) => {
      const { data,error } = await supabase.rpc('search_food_catalog_v2',{ p_queries: queryVariants(normalized),p_limit: limit }).abortSignal(signal);
      if (error || !Array.isArray(data)) throw new Error('CATALOG_UNAVAILABLE');
      // Optional authority hydration shares the DB stage's existing deadline.
      // Preserve already-returned ranking rows rather than lose them while waiting
      // for enrichment. Reserve a small window for projection/ranking; do not
      // reduce the ranking RPC or any provider's search budget.
      const hydrationMs = deadlineMs === undefined ? 150 : Math.min(150, Math.max(0, deadlineMs - Date.now() - 25));
      const hydrated = await hydrateSearchRows(data, supabase, signal, hydrationMs);
      return hydrated.map(({ row, authority }) => {
        const product = mapDbRowToOff(row, normalized, authority === 'confirmed_correction');
        if (product.requires_label_confirmation === true) requiresLabelConfirmation = true;
        if (authority === 'unknown' || product.requires_label_confirmation === true || !hasCanonicalGramServing(row)) {
          uncertainProducts.add(product); hydrationPartial = true;
        }
        return product;
      });
    },
    usda: async (normalized,signal) => {
      const url = 'https://api.nal.usda.gov/fdc/v1/foods/search?query=' + encodeURIComponent(normalizeQuery(normalized)) + '&pageSize=30&api_key=DEMO_KEY';
      const response = await fetch(url,{ signal });
      if (!response.ok) throw new ProviderHttpError('USDA_UNAVAILABLE',response.status);
      const body = await response.json();
      if (!Array.isArray(body.foods)) throw new Error('USDA_INVALID_RESPONSE');
      nutritionBatch.add('usda',body.foods);
      return body.foods.map(mapUsdaToOff).filter((p: Record<string,unknown> | null): p is Record<string,unknown> => p !== null);
    },
    off: async (normalized,signal) => {
      const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' + encodeURIComponent(normalized)
        + '&search_simple=1&action=process&json=1&page_size=20&sort_by=unique_scans_n'
        + '&fields=code,product_name,generic_name,brands,serving_size,serving_quantity,serving_quantity_unit,nutriments,nutrition_data_per,nutrition_data_prepared_per,nutrition,preparation,nutrient_levels,last_modified_t,image_url';
      const response = await fetch(url,{ signal,headers: { 'User-Agent': 'MacroGoal/1.0 (contact@macrogoal.app)' } });
      if (!response.ok) throw new ProviderHttpError('OFF_UNAVAILABLE',response.status);
      const body = await response.json();
      if (!Array.isArray(body.products)) throw new Error('OFF_INVALID_RESPONSE');
      nutritionBatch.add('openfoodfacts',body.products);
      return body.products.map((p: Record<string,unknown>) => mapOffProduct(p,scoreProduct(p)));
    },
  });
  // Preserve received nutrition without extra provider calls or query/user history.
  const nutritionRuntime=(globalThis as typeof globalThis & {EdgeRuntime?:{waitUntil?:(promise:Promise<unknown>)=>void}}).EdgeRuntime;
  const nutrition_capture=scheduleSearchNutritionBatch(supabase,nutritionBatch,{waitUntil:typeof nutritionRuntime?.waitUntil==='function'?nutritionRuntime.waitUntil.bind(nutritionRuntime):undefined});
  result.products = await attachCatalogPortionSources(result.products,supabase,
    (row:Record<string,unknown>,protectedRow:boolean)=>mapDbRowToOff(row,query,protectedRow),300);
  // Old clients default absent nutrition to zero and cannot safely consume review-only rows.
  // Gate only responses that actually contain confirmation-required results.
  const responseRequiresConfirmation = result.products.some(product => product.requires_label_confirmation === true);
  if (responseRequiresConfirmation) hydrationPartial = true;
  if (!supportsLabelConfirmation && responseRequiresConfirmation) {
    return jsonResponse({ products: [], count: 0, status: 'update_required',
      error: 'SEARCH_REVIEW_UPDATE_REQUIRED',
      message: 'Update MacroGoal to review this food safely. No food was added.' }, 409);
  }
  // Keep FDC identity through searchCore dedupe, then omit uncertain enrichment handles.
  const eligible = result.products.filter(product => !uncertainProducts.has(product));
  const decorated = await decorateCachedProducts(eligible, supabase, 150);
  let decoratedIndex = 0;
  result.products = result.products.map(product => uncertainProducts.has(product)
    ? serializeSearchProduct(product, true)
    : serializeSearchProduct(decorated[decoratedIndex++]));
  if (hydrationPartial) result.status = 'partial';
  // Empty + unavailable is not an authoritative no-results response.
  return jsonResponse({...result,nutrition_capture},result.count === 0 && result.status === 'partial' ? 503 : 200);
}
Deno.serve(handleSearch);



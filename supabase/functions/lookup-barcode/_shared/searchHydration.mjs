/** Trusted catalog hydration only. Inputs are server RPC rows, never request products.
 * One service-only SQL snapshot binds private protection to the current nutrition tuple.
 * Unknown authority preserves the original coherent projection without enrichment.
 */
export const SEARCH_SNAPSHOT_FIELDS = Object.freeze([
  'id', 'barcode', 'name', 'product_name', 'generic_name', 'brand', 'brands',
  'source', 'usda_fdc_id', 'calories', 'protein', 'carbs', 'fat', 'fiber',
  'macros_per', 'serving_size', 'serving_unit', 'serving_quantity',
  'serving_description', 'serving_count', 'nutriments', 'nutriscore_grade',
  'popularity_score', 'search_count', 'logs_last_30d', 'data_quality_score',
]);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const numeric = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) && Number(value) >= 0;
const positive = value => numeric(value) && Number(value) > 0;
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const project = row => Object.fromEntries(SEARCH_SNAPSHOT_FIELDS.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
function validSnapshot(row) {
  if (!object(row) || !SEARCH_SNAPSHOT_FIELDS.every(key => Object.hasOwn(row, key))) return false;
  if (!uuid(row.id) || !['100g', 'serving'].includes(row.macros_per)) return false;
  if (!['calories', 'protein', 'carbs', 'fat'].every(key => numeric(row[key]))) return false;
  if (row.fiber !== null && !numeric(row.fiber)) return false;
  if (!positive(row.serving_size) || (row.serving_count !== null && !positive(row.serving_count))) return false;
  if (row.nutriments !== null && !object(row.nutriments)) return false;
  return ['name', 'product_name', 'generic_name'].some(key => typeof row[key] === 'string' && row[key].trim());
}

export async function hydrateSearchRows(rows, admin, signal, milliseconds = 150) {
  const projected = rows.slice(0, 100).map(row => ({ row: project(object(row) ? row : {}), authority: 'unknown' }));
  const ids = [...new Set(projected.map(entry => entry.row.id).filter(uuid))];
  if (!ids.length || signal?.aborted || milliseconds <= 0) return projected;
  const controller = new AbortController();
  let timer;
  let cancel;
  const expired = new Promise(resolve => { cancel = () => { controller.abort(); resolve([]); }; });
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  timer = setTimeout(cancel, Math.min(300, Math.max(1, milliseconds)));
  let hydrated = [];
  try {
    hydrated = await Promise.race([(async () => {
      if (controller.signal.aborted) return [];
      const { data, error } = await admin.rpc('read_food_search_snapshots_v1', { p_food_ids: ids }).abortSignal(controller.signal);
      return !error && Array.isArray(data) && data.length <= 100 ? data : [];
    })(), expired]);
  } catch { /* Preserve original projection; never retry or call providers here. */ }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.abort(); }
  const requested = new Set(ids);
  const byId = new Map();
  const duplicate = new Set();
  for (const entry of hydrated) {
    if (!object(entry) || !requested.has(entry.id)) continue;
    if (byId.has(entry.id)) duplicate.add(entry.id);
    byId.set(entry.id, entry);
  }
  return projected.map(original => {
    const entry = byId.get(original.row.id);
    if (!entry || duplicate.has(original.row.id) || typeof entry.protected !== 'boolean' ||
        !validSnapshot(entry.snapshot) || entry.snapshot.id !== original.row.id) return original;
    return { row: project(entry.snapshot), authority: entry.protected ? 'confirmed_correction' : 'known' };
  });
}

/** Only an explicit gram unit can make a canonical serving_size a gram mass. */
export function hasCanonicalGramServing(row) {
  return typeof row?.serving_unit === 'string' && /^(g|gram|grams)$/i.test(row.serving_unit.trim()) && positive(row.serving_size);
}

/** Normalize the canonical basis without JS coercion or nonfinite JSON values.
 * Failure is explicit: never clamp a correction or manufacture a missing macro.
 */
export function normalizeSearchNutrition(row) {
  const core = { calories: 'energy-kcal_100g', protein: 'proteins_100g', carbs: 'carbohydrates_100g', fat: 'fat_100g' };
  if (!Object.keys(core).every(key => numeric(row?.[key]))) return { valid: false, reason: 'core_nutrition_requires_confirmation' };
  const unit = typeof row?.serving_unit === 'string' ? row.serving_unit.trim().toLowerCase()
    : row?.serving_unit == null ? '' : null;
  // Explicit volume/unsupported units never become grams. Missing units establish
  // no serving mass; only an already valid per100g basis may use exact100g display.
  if (unit === null || (unit !== '' && !/^(g|gram|grams)$/.test(unit))) {
    return { valid: false, reason: 'nutrition_basis_requires_confirmation' };
  }
  if (!['100g', 'serving'].includes(row.macros_per) || (row.macros_per === 'serving' && !hasCanonicalGramServing(row))) {
    return { valid: false, reason: 'nutrition_basis_requires_confirmation' };
  }
  // A proven per100g basis needs no optional household-serving evidence.
  // Keep it usable as exactly 100 g rather than inventing an arbitrary portion.
  const hasCanonicalServing = hasCanonicalGramServing(row);
  const grams = hasCanonicalServing ? Number(row.serving_size) : 100;
  const scale = value => {
    const n = Number(value);
    if (row.macros_per === '100g' || n === 0) return n;
    // Alternate operation order avoids avoidable intermediate overflow/underflow.
    return [n * (100 / grams), (n / grams) * 100, (n * 100) / grams]
      .find(result => Number.isFinite(result) && result > 0);
  };
  const nutriments = {};
  for (const [field, key] of Object.entries(core)) {
    const result = scale(row[field]);
    if (!Number.isFinite(result) || result < 0) return { valid: false, reason: 'normalized_nutrition_requires_confirmation' };
    nutriments[key] = result;
  }
  if (row.fiber != null) {
    if (!numeric(row.fiber)) return { valid: false, reason: 'optional_nutrition_requires_confirmation' };
    const fiber = scale(row.fiber);
    if (!Number.isFinite(fiber) || fiber < 0) return { valid: false, reason: 'normalized_nutrition_requires_confirmation' };
    nutriments.fiber_100g = fiber;
  }
  // Explicit macro columns win; missing core cannot be backfilled from arbitrary JSON.
  for (const [key, value] of Object.entries(searchNutriments(row.nutriments))) {
    if (!(key in nutriments)) nutriments[key] = value;
  }
  if (!Object.values(nutriments).every(value => Number.isFinite(value) && value >= 0)) {
    return { valid: false, reason: 'normalized_nutrition_requires_confirmation' };
  }
  return { valid: true, nutriments, servingSize: grams, hasCanonicalServing };
}

/** Display-only issue vocabulary, never caller-supplied authority. */
export function searchNutritionIssue(row, reason) {
  const unit = typeof row?.serving_unit === 'string' ? row.serving_unit.trim().toLowerCase() : '';
  if (row?.macros_per === '100ml' || /^(ml|milliliters?|millilitres?|l|liters?|litres?|fl[ .]*oz|fluid ounces?)$/.test(unit)) {
    return 'volume_basis_requires_confirmation';
  }
  return ['core_nutrition_requires_confirmation', 'nutrition_basis_requires_confirmation',
    'optional_nutrition_requires_confirmation', 'normalized_nutrition_requires_confirmation'].includes(reason)
    ? reason : 'nutrition_basis_requires_confirmation';
}

/** Only finite numeric catalog nutrition reaches the response. Null is not zero. */
export function searchNutriments(value) {
  if (!object(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, amount]) =>
    /^[a-z][a-z0-9-]{0,63}_100g$/.test(key) && numeric(amount)
  ).map(([key, amount]) => [key, Number(amount)]));
}

/** The raw catalog row is for ranking/dedupe only, never a client data contract.
 * An unknown row keeps _db_id, but no handle that client v2 would auto-enrich.
 */
export function serializeSearchProduct(product, uncertain = false) {
  const { _db_row, ...publicProduct } = product;
  if (uncertain) {
    delete publicProduct._usda_fdc_id;
    delete publicProduct._portion_evidence;
    delete publicProduct._serving_authority;
  }
  return publicProduct;
}

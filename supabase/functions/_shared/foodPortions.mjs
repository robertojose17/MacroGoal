/** Exact-FDC portion contract. No food-name heuristics or assumed cup/ml density.
 * Only server-fetched USDA detail responses may create persisted envelopes.
 * Consumers must validate again against the row FDC ID. This module does not write data.
 */
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100000;
const text = value => typeof value === 'string' ? value.trim() : '';
const id = value => /^\d+$/.test(String(value ?? '')) ? String(value) : null;
const label = value => { const s = text(value); return s && s.length <= 160 && !/[\x00-\x1f<>]/.test(s) ? s : null; };

export function captureUsdaPortions(food, expectedFdcId, retrievedAt) {
  const fdcId = id(expectedFdcId);
  if (!fdcId || id(food?.fdcId) !== fdcId || !label(food?.description) ||
      !Number.isFinite(Date.parse(retrievedAt))) return null;
  const portions = [];
  const seen = new Set();
  for (const p of (Array.isArray(food.foodPortions) ? food.foodPortions : []).slice(0, 64)) {
    if (!positive(p?.amount) || !positive(p?.gramWeight)) continue;
    const modifier = label(p.modifier) || label(p.portionDescription);
    const unit = label(p.measureUnit?.name);
    const description = modifier || (unit && unit !== 'undetermined' ? unit : null);
    if (!description) continue;
    const key = JSON.stringify([p.amount, p.gramWeight, description]);
    if (seen.has(key)) continue;
    seen.add(key);
    portions.push({ key: String(portions.length), amount: p.amount, grams: p.gramWeight,
      description, sourcePortionId: id(p.id) });
  }
  if (!portions.length) return null;
  return { version: 1, provider: 'usda', fdcId, foodDescription: food.description.trim(),
    dataType: text(food.dataType), retrievedAt: new Date(retrievedAt).toISOString(), portions };
}

export function readUsdaPortions(envelope, expectedFdcId) {
  if (!envelope || envelope.version !== 1 || envelope.provider !== 'usda' ||
      !id(expectedFdcId) || envelope.fdcId !== id(expectedFdcId) ||
      !label(envelope.foodDescription) || !Number.isFinite(Date.parse(envelope.retrievedAt)) ||
      !Array.isArray(envelope.portions) || envelope.portions.length > 64) return [];
  if (!envelope.portions.every(p => positive(p?.amount) && positive(p?.grams) && label(p?.description))) return [];
  return envelope.portions.map((p, index) => ({ key: String(index), amount: p.amount,
    grams: p.grams, description: p.description, sourcePortionId: id(p.sourcePortionId) }));
}

/** Multiple valid measures are choices, not evidence that the first is standard. */
export function defaultUsdaPortion(envelope, expectedFdcId) {
  const options = readUsdaPortions(envelope, expectedFdcId);
  return options.length === 1 ? options[0] : { key: '100g', amount: 100, grams: 100, description: 'g', sourcePortionId: null };
}

export function portionGrams(portion, quantity) {
  if (!positive(portion?.amount) || !positive(portion?.grams) || !positive(quantity)) return null;
  const grams = portion.grams * quantity / portion.amount;
  return positive(grams) ? grams : null;
}

/** Always scale the immutable 100g basis, never old per-serving totals. */
export function nutritionForGrams(per100, grams) {
  if (!positive(grams)) return null;
  const result = {};
  for (const name of ['calories', 'protein', 'carbs', 'fat', 'fiber']) {
    const value = per100?.[name];
    if (value == null) { result[name] = null; continue; }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    result[name] = value * grams / 100;
  }
  return result;
}

/** Normalize only new catalog/search products, never historical diary snapshots.
 * Original nutrient values/IDs remain unchanged. Conflicting per-serving overrides
 * cannot override the immutable per100 basis when choosing another portion.
 */
export function applyUsdaPortion(product, envelope) {
  const fdcId = product?._usda_fdc_id;
  if (!id(fdcId)) return product;
  const chosen = defaultUsdaPortion(envelope, fdcId);
  const grams = chosen.grams / chosen.amount;
  const fallback = chosen.key === '100g';
  const nutriments = Object.fromEntries(Object.entries(product.nutriments ?? {}).filter(([key]) => !key.endsWith('_serving')));
  return { ...product, nutriments, serving_quantity: fallback ? 100 : grams,
    serving_size: fallback ? '100 g' : '1 ' + chosen.description + ' (' + grams + ' g)',
    _portion_evidence: readUsdaPortions(envelope, fdcId).length ? envelope : null };
}

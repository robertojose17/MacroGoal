import { NUTRIENTS, validMealEvidence, type MealEvidence, type MealReviewContext, type PreparedMealEntry } from './coachMealReview';

// DTO boundary for the documented meal_explore_v1 option. Transport admission,
// receipt ownership and recovery are deliberately NOT implemented here.
export function mealEvidenceFromOption(row: any, mode: 'cook' | 'quick' | 'eat_out'): MealEvidence | null {
  if (!row || row.review_required !== true || !row.provenance || !row.nutrition || !Array.isArray(row.ingredients) || !Array.isArray(row.instructions)) return null;
  const p = row.provenance;
  if (row.physical_portion && (!Number.isFinite(row.physical_portion.grams) || row.physical_portion.grams <= 0 || !['source_reported','estimated'].includes(row.physical_portion.authority))) return null;
  if (row.identity && (typeof row.identity.kind !== 'string' || ['entity','variant','portion_label'].some(k => row.identity[k] !== undefined && typeof row.identity[k] !== 'string'))) return null;
  let url: string | undefined;
  if (p.source_url !== undefined) {
    try { const u = new URL(p.source_url); if (u.protocol !== 'https:' || u.username || u.password || u.port || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(u.hostname) || /^(?:\d+\.){3}\d+$/.test(u.hostname) || /\.(local|internal|test)$/i.test(u.hostname)) return null; url = u.href; } catch { return null; }
  }
  if (p.kind === 'gallery' && (typeof p.gallery_id !== 'string' || !p.gallery_id.trim())) return null;
  const value: MealEvidence = { id: row.id, name: row.name, kind: mode === 'eat_out' ? 'restaurant' : p.kind === 'gallery' ? 'gallery' : 'recipe',
    provenance: { kind: p.kind, label: url ? new URL(url).hostname : p.kind === 'gallery' ? 'Macro Goal gallery' : p.kind === 'official' ? 'Official menu' : 'Meal source', ...(url ? { url } : {}), ...(p.gallery_id ? { galleryId: p.gallery_id } : {}) },
    nutrition: { authority: row.nutrition.authority, basis: row.nutrition.basis, values: row.nutrition.values, assumptions: row.nutrition.assumptions },
    ...(row.source_nutrition ? { sourceNutrition: row.source_nutrition } : {}),
    ...(row.identity ? { identity: row.identity } : {}),
    ...(row.physical_portion ? { physicalPortion: row.physical_portion } : {}),
    allergyStatus: row.allergy_status, ingredients: row.ingredients, instructions: row.instructions };
  return validMealEvidence(value) && (!value.sourceNutrition || validMealEvidence({...value, nutrition:value.sourceNutrition})) ? JSON.parse(JSON.stringify(value)) : null;
}

// Invoked only by the final explicit Add adapter. No RPC, new foods row, inferred
// meal/date or zero-fill. Existing meal_items.fiber requires a known number.
export function existingMealLogPayload(context: MealReviewContext, entry: PreparedMealEntry) {
  if (entry.owner !== context.owner || entry.date !== context.date || entry.meal !== context.meal || entry.sourceReceiptId !== context.sourceReceiptId || entry.optionId !== context.option.id || entry.name !== context.option.name || !Number.isFinite(entry.multiplier) || entry.multiplier <= 0 || entry.multiplier > 20 || !NUTRIENTS.every(k => typeof entry.nutrition[k] === 'number' && Number.isFinite(entry.nutrition[k]) && entry.nutrition[k]! >= 0) || !entry.nutrition.calories || entry.nutrition.calories > 99999) throw Error('review_inputs_required');
  const p = context.option.provenance;
  const estimated = ['estimated','user_edited','unknown'].includes(entry.authority);
  const description = [estimated ? 'ESTIMATE' : 'SOURCE-REPORTED', entry.portionLabel, entry.physicalPortion ? `${entry.physicalPortion.total_grams} g (${entry.physicalPortion.authority})` : null, p.url ?? `gallery:${p.galleryId ?? context.option.id}`, ...entry.assumptions].filter(Boolean).join(' | ').slice(0,1000);
  return { p_user_id: entry.owner, p_date: entry.date, p_meal_type: entry.meal, p_food_id: null, p_food_item_id: null,
    p_food_name: entry.name, p_food_brand: null, p_quantity: entry.multiplier, p_grams: entry.physicalPortion?.total_grams ?? null, p_serving_description: description,
    p_calories: entry.nutrition.calories, p_protein: entry.nutrition.protein, p_carbs: entry.nutrition.carbs, p_fats: entry.nutrition.fats, p_fiber: entry.nutrition.fiber };
}

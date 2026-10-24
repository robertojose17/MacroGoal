import {parseMealComponents} from './coachMealComponents';
import {parseConstraints} from './coachDietaryConstraints';
import { NUTRIENTS, validMealEvidence, type MealEvidence, type MealReviewContext, type PreparedMealEntry } from './coachMealReview';



// DTO boundary for the documented meal_explore_v1 option. Transport admission,

// receipt ownership and recovery are deliberately NOT implemented here.

export function mealEvidenceFromOption(row: any, mode: 'cook' | 'quick' | 'eat_out'): MealEvidence | null {

  if (!row || row.review_required !== true || !row.provenance || !row.nutrition || !Array.isArray(row.ingredients) || !Array.isArray(row.instructions)) return null;

  const dietary=row.dietary_constraints?parseConstraints(row.dietary_constraints):null;if(row.dietary_constraints&&!dietary)return null;
  const components=row.components===undefined?undefined:parseMealComponents(row.components);if(components===null)return null;
  const p = row.provenance;
  let match:MealEvidence['match'];
  if(row.match!==undefined){const m=row.match;if(!m||m.kind!=='similar'||Object.keys(m).some(k=>!['kind','requested_food','differences'].includes(k))||typeof m.requested_food!=='string'||!m.requested_food.trim()||m.requested_food.length>160||!Array.isArray(m.differences)||!m.differences.length||m.differences.length>12||m.differences.some((d:any)=>typeof d!=='string'||!d.trim()||d.length>300))return null;match={kind:'similar',requestedFood:m.requested_food,differences:[...m.differences]};}

  const general=row.identity?.kind==='general_meal';
  if(general&&(p.kind!=='estimate'||p.source_url!==undefined||p.gallery_id!==undefined||row.venue!=null||row.identity.entity!==undefined||row.identity.variant!==undefined||typeof row.identity.portion_label!=='string'||!row.identity.portion_label.trim()||row.identity.portion_label.length>160||!['unknown','estimated','user_edited'].includes(row.nutrition.authority)))return null;

  if (row.physical_portion && (!Number.isFinite(row.physical_portion.grams) || row.physical_portion.grams <= 0 || !['source_reported','estimated'].includes(row.physical_portion.authority))) return null;

  if (row.identity && (typeof row.identity.kind !== 'string' || ['entity','variant','portion_label'].some(k => row.identity[k] !== undefined && typeof row.identity[k] !== 'string'))) return null;

  let url: string | undefined;

  if (p.source_url !== undefined) {

    try { const u = new URL(p.source_url); if (u.protocol !== 'https:' || u.username || u.password || u.port || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(u.hostname) || /^(?:\d+\.){3}\d+$/.test(u.hostname) || /\.(local|internal|test)$/i.test(u.hostname)) return null; url = u.href; } catch { return null; }

  }

  if (p.kind === 'gallery' && (typeof p.gallery_id !== 'string' || !p.gallery_id.trim())) return null;

  let venue:MealEvidence['venue'];
  if(row.venue){const v=row.venue;const publicURL=(x:unknown)=>{try{const u=new URL(String(x));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(u.hostname)&&!/(?:^\d+\.|\.(?:local|internal|test)$)/i.test(u.hostname)?u.href:null;}catch{return null;}};const source=publicURL(v.source_url);if(typeof v.name!=='string'||!v.name.trim()||!source)return null;const addressSource=publicURL(v.address_source_url);venue={name:v.name,sourceUrl:source,...(typeof v.address==='string'&&v.address.trim()&&addressSource?{address:v.address,addressSourceUrl:addressSource}:{})};}
  const value: MealEvidence = { id: row.id, name: row.name, kind: general ? 'general' : mode === 'eat_out' ? 'restaurant' : p.kind === 'gallery' ? 'gallery' : 'recipe',

    provenance: { kind: p.kind, label: general ? 'General meal estimate' : url ? new URL(url).hostname : p.kind === 'gallery' ? 'Macro Goal gallery' : p.kind === 'official' ? 'Official menu' : 'Meal source', ...(url ? { url } : {}), ...(p.gallery_id ? { galleryId: p.gallery_id } : {}) },

    ...(mode!=='eat_out'&&row.identity?.kind==='recipe'&&url&&row.total_time?.authority==='source_reported'&&row.total_time.source_url===url&&Number.isInteger(row.total_time.minutes)&&row.total_time.minutes>0&&row.total_time.minutes<=1440?{totalTime:{minutes:row.total_time.minutes,authority:'source_reported',sourceUrl:url}}:{}),
    nutrition: { authority: row.nutrition.authority, basis: row.nutrition.basis, values: row.nutrition.values, assumptions: row.nutrition.assumptions,...(['low','medium','high'].includes(row.nutrition.confidence)?{confidence:row.nutrition.confidence}:{}) },

    ...(components?{components}:{}),
    ...(venue?{venue}:{}),
    ...(match?{match}:{}),
    ...(dietary?{dietaryConstraints:dietary}:{}),
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

  const description = [estimated ? 'ESTIMATE' : 'SOURCE-REPORTED', entry.portionLabel, entry.physicalPortion ? `${entry.physicalPortion.total_grams} g (${entry.physicalPortion.authority})` : null, context.option.kind==='general'?'General meal; not restaurant-specific':p.url ?? `gallery:${p.galleryId ?? context.option.id}`, ...entry.assumptions].filter(Boolean).join(' | ').slice(0,1000);

  return { p_user_id: entry.owner, p_date: entry.date, p_meal_type: entry.meal, p_food_id: null, p_food_item_id: null,

    p_food_name: entry.name, p_food_brand: null, p_quantity: entry.multiplier, p_grams: entry.physicalPortion?.total_grams ?? null, p_serving_description: description,

    p_calories: entry.nutrition.calories, p_protein: entry.nutrition.protein, p_carbs: entry.nutrition.carbs, p_fats: entry.nutrition.fats, p_fiber: entry.nutrition.fiber };

}


export function coachRecipeTimeLabel(option:MealEvidence,es:boolean):string|null {
  if(!['recipe','gallery'].includes(option.kind))return null;
  return option.kind==='recipe'&&option.totalTime?.authority==='source_reported'&&option.totalTime.sourceUrl===option.provenance.url&&Number.isInteger(option.totalTime.minutes)&&option.totalTime.minutes>0&&option.totalTime.minutes<=1440
    ? (es?'Tiempo total publicado: ':'Published total time: ')+option.totalTime!.minutes+' min'
    : es?'Tiempo total desconocido; comprueba la fuente antes de planificar.':'Total time unknown; check the source before planning.';
}

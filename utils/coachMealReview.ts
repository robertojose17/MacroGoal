import {parseMealComponents,validComponentChanges,validateReviewedComposition,type MealComponent,type ComponentEdit,type ComponentAddition} from './coachMealComponents';
import type {CatalogConsent} from './coachCatalogIdentity';
import type {DietaryConstraints} from './coachDietaryConstraints';
import { dailyAccess, type DailyAccess, type DailyMealSlot } from './coachDailyAction';

import { addReviewedSavedMeal } from './manualSavedMealAdd';



// Local UI model, deliberately independent of backend field names. The final

// transport adapter must map an admitted, owned receipt into this model.

export const NUTRIENTS = ['calories', 'protein', 'carbs', 'fats', 'fiber'] as const;

export type Nutrient = typeof NUTRIENTS[number];

export type MealNutrition = Record<Nutrient, number | null>;

export type MealEvidence = {

  id: string; name: string; kind: 'gallery' | 'restaurant' | 'recipe' | 'general';

  provenance: { kind: 'gallery' | 'official' | 'publisher' | 'estimate'; label: string; url?: string; galleryId?: string };

  nutrition: { authority: 'official' | 'publisher_reported' | 'estimated' | 'user_edited' | 'unknown';

    basis: { amount: number; unit: string; label: string }; values: MealNutrition; assumptions: string[]; confidence?:'low'|'medium'|'high' };

  match?: {kind:'similar';requestedFood:string;differences:string[]};
  dietaryConstraints?:DietaryConstraints;
  venue?: {name:string;sourceUrl:string;address?:string;addressSourceUrl?:string};
  totalTime?:{minutes:number;authority:"source_reported";sourceUrl:string}; // Independent of nutrition authority.
  sourceNutrition?: MealEvidence['nutrition'];

  identity?: { kind: string; entity?: string; variant?: string; portion_label?: string };

  physicalPortion?: { grams: number; authority: 'source_reported' | 'estimated' };

  allergyStatus: 'unknown' | 'contains_declared_allergen' | 'requires_review';

  components?:MealComponent[];
  ingredients?: string[]; instructions?: string[];

};

export type MealReviewEdit = { componentEdits?:ComponentEdit[];componentAdditions?:ComponentAddition[];additionPreviews?:MealComponent[]; multiplier: number; values: MealNutrition; changed: Nutrient[]; estimateAcknowledged?: boolean; ingredientAcknowledged?: boolean };

export type PreparedMealEntry = {

  confirmationId: string; owner: string; date: string; meal: DailyMealSlot;

  sourceReceiptId: string; optionId: string; name: string; multiplier: number;

  portionLabel: string; nutrition: MealNutrition; authority: MealEvidence['nutrition']['authority']; assumptions: string[];

  physicalPortion?: { grams: number; authority: string; total_grams: number };

  components?:MealComponent[];
  readyForConfirmation?: boolean;

};

export type MealReviewContext = { owner: string; date: string; meal: DailyMealSlot; sourceReceiptId: string; option: MealEvidence };

export type MealReviewDependencies = {

  owner(): Promise<string | undefined>; today(): string; access(): DailyAccess;

  subscribeInvalidation(onInvalidate: () => void): () => void;

  store: Parameters<typeof addReviewedSavedMeal>[0]['store'];

  // prepare MUST NOT log. confirm must bind the existing reviewed durable write

  // contract. Neither callback has a live default or a guessed endpoint.

  prepare(context: MealReviewContext, edit: MealReviewEdit): Promise<PreparedMealEntry>;

  searchIngredients?(query:string):Promise<MealComponent[]>;
  prepareIdentity?(prepared:PreparedMealEntry,consent:CatalogConsent,current:()=>boolean):Promise<string>;
  confirm(prepared: PreparedMealEntry,identityId?:string,consent?:CatalogConsent): Promise<void>;
};

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 99999;

const validValues = (x: MealNutrition) => x && NUTRIENTS.every(k => x[k] === null || finite(x[k]));

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export function validMealEvidence(o: MealEvidence): boolean {

  return !!o && typeof o.id === 'string' && !!o.id && typeof o.name === 'string' && !!o.name.trim() &&

    ['gallery','restaurant','recipe','general'].includes(o.kind) && ['gallery','official','publisher','estimate'].includes(o.provenance?.kind) &&

    typeof o.provenance.label === 'string' && !!o.provenance.label.trim() &&

    ['official','publisher_reported','estimated','user_edited','unknown'].includes(o.nutrition?.authority) &&

    finite(o.nutrition.basis?.amount) && o.nutrition.basis.amount > 0 && typeof o.nutrition.basis.label === 'string' && !!o.nutrition.basis.label &&

    typeof o.nutrition.basis.unit === 'string' && !!o.nutrition.basis.unit && validValues(o.nutrition.values) &&

    Array.isArray(o.nutrition.assumptions) && o.nutrition.assumptions.every(s => typeof s === 'string' && s.length <= 2000) &&

    ['unknown','contains_declared_allergen','requires_review'].includes(o.allergyStatus) &&

    (o.components===undefined||parseMealComponents(o.components)!==null)&&
    [o.ingredients,o.instructions].every(xs => xs === undefined || Array.isArray(xs) && xs.every(s => typeof s === 'string'));

}

export function scaleMealNutrition(option: MealEvidence, multiplier: number): MealNutrition | null {

  if (!validMealEvidence(option) || !Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 20) return null;

  const values = Object.fromEntries(NUTRIENTS.map(k => [k, option.nutrition.values[k] === null ? null : Math.round(option.nutrition.values[k]! * multiplier * 10) / 10])) as MealNutrition;

  return validValues(values) ? values : null;

}

export function editMealNutrition(option: MealEvidence, multiplier: number, entries: Partial<Record<Nutrient, string>>): MealReviewEdit | null {

  const values = scaleMealNutrition(option, multiplier); if (!values) return null;

  const changed: Nutrient[] = [];

  for (const key of NUTRIENTS) {

    if (entries[key] === undefined) continue;

    const input = entries[key]!.trim();

    // Decimal comma is accepted for ES; no parseFloat truncation or NaN -> zero.

    if (input && !/^\d+(?:[.,]\d+)?$/.test(input)) return null;

    const next = input ? Number(input.replace(',', '.')) : null;

    if (next !== null && !finite(next)) return null;

    if (next !== values[key]) changed.push(key);

    values[key] = next;

  }

  return { multiplier, values, changed };

}

export const needsEstimateAcknowledgement = (entry: PreparedMealEntry) => !['official','publisher_reported'].includes(entry.authority);

export const hasLoggableNutrition = (entry: PreparedMealEntry) => entry.readyForConfirmation !== false && NUTRIENTS.every(k => finite(entry.nutrition[k])) && entry.nutrition.calories! > 0;

const sameValues = (a: MealNutrition, b: MealNutrition) => NUTRIENTS.every(k => a[k] === b[k]);



export function createMealReviewSession(context: MealReviewContext, deps: MealReviewDependencies, initialEdit?: MealReviewEdit) {

  if (!validMealEvidence(context.option) || !context.owner || !context.sourceReceiptId || !/^\d{4}-\d{2}-\d{2}$/.test(context.date) || !['breakfast','lunch','dinner','snack'].includes(context.meal)) throw Error('invalid_review');

  const source = copy(context); let active = true, busy = false, stopped = false, prepared: PreparedMealEntry | null = null;

  const current = () => active && !stopped && deps.today() === source.date && dailyAccess(deps.access()) === 'ready';

  const authorized = async () => current() && await deps.owner() === source.owner && current();

  return {

    context: copy(source),
    async searchIngredients(query:string){if(!await authorized()||!deps.searchIngredients)return [];const rows=await deps.searchIngredients(query);return await authorized()?rows:[];},
    catalogRequired: !!deps.prepareIdentity,
    initialEdit: initialEdit ? copy(initialEdit) : undefined,

    watch(onInvalidate: () => void) { return deps.subscribeInvalidation(() => { active = false; prepared = null; onInvalidate(); }); },

    async valid() { try { return active && deps.today() === source.date && dailyAccess(deps.access()) === 'ready' && await deps.owner() === source.owner && active && deps.today() === source.date && dailyAccess(deps.access()) === 'ready'; } catch { return false; } },

    invalidate() { active = false; prepared = null; },

    clearPrepared() { prepared = null; },

    async prepare(edit: MealReviewEdit): Promise<PreparedMealEntry | null> {

      if (busy || !current()) return null;

      busy = true; prepared = null;

      try {

        const computed = scaleMealNutrition(source.option, edit.multiplier);

        if (!validComponentChanges(edit.componentEdits,edit.componentAdditions)||!source.option.components&&(edit.componentEdits!==undefined||edit.componentAdditions!==undefined)||source.option.components&&edit.changed.length||!computed || !validValues(edit.values) || !Array.isArray(edit.changed) || edit.changed.some(k => !NUTRIENTS.includes(k)) || NUTRIENTS.some(k => !edit.changed.includes(k) && edit.values[k] !== computed[k]) || !await authorized()) return null;

        const value = await deps.prepare(copy(source), copy(edit));

        if (!await authorized() || !value || typeof value.confirmationId !== 'string' || !value.confirmationId || value.owner !== source.owner || value.date !== source.date || value.meal !== source.meal || value.sourceReceiptId !== source.sourceReceiptId || value.optionId !== source.option.id || value.name !== source.option.name || value.multiplier !== edit.multiplier || !source.option.components&&!sameValues(value.nutrition, edit.values) || !validValues(value.nutrition) || !value.portionLabel || !Array.isArray(value.assumptions) || value.assumptions.some(s => typeof s !== 'string')) return null;

        const composition=source.option.components?validateReviewedComposition(source.option.components,edit.componentEdits,edit.componentAdditions,edit.multiplier,value.components):null;
        if(source.option.components&&(!composition||!sameValues(composition.nutrition,value.nutrition)))return null;
        const requiredAuthority = composition?(composition.components.some(c=>c.authority==='estimated')?'estimated':edit.componentEdits!==undefined||edit.componentAdditions?.length?'user_edited':source.option.nutrition.authority):edit.changed.length ? 'user_edited' : source.option.nutrition.authority;

        if (value.authority !== requiredAuthority) return null;

        prepared = copy(value); return copy(prepared);

      } catch { return null; } finally { busy = false; }

    },

    async confirm(value: PreparedMealEntry, estimateAcknowledged: boolean, catalogConsent?:CatalogConsent) {
      if (busy) return { status: 'busy' as const, completed: 0 };

      if (!prepared || !hasLoggableNutrition(prepared) || JSON.stringify(value) !== JSON.stringify(prepared) || needsEstimateAcknowledgement(prepared) && !estimateAcknowledged || !current()) return { status: 'blocked' as const, completed: 0 };

      busy = true;

      try {

        const entry = copy(prepared), confirmedCatalog = catalogConsent ? copy(catalogConsent) : undefined;
        const completedKey = `coach_meal_logged_v2:${JSON.stringify([source.owner,source.date,source.sourceReceiptId,source.option.id])}`;

        if (await deps.store.getItem(completedKey)) { stopped = true; prepared = null; return { status: 'complete' as const, completed: 0 }; }

        const pendingKey=`manual_saved_meal_pending_v1:${JSON.stringify([source.owner,source.date,source.meal,`coach-review:${source.sourceReceiptId}:${source.option.id}`])}`;
        if(await deps.store.getItem(pendingKey))return {status:'review' as const,completed:0};
        if(deps.prepareIdentity&&(!catalogConsent||!catalogConsent.massAcknowledged||!catalogConsent.publicAcknowledged))return {status:'blocked' as const,completed:0};
        const identityId=deps.prepareIdentity?await deps.prepareIdentity(entry,confirmedCatalog!,()=>current()&&prepared!==null&&JSON.stringify(prepared)===JSON.stringify(entry)):undefined;
        if(!await authorized()||!prepared||JSON.stringify(prepared)!==JSON.stringify(entry))return {status:'blocked' as const,completed:0};
        const result = await addReviewedSavedMeal({ owner: source.owner, date: source.date, mealType: source.meal,

          mealId: `coach-review:${source.sourceReceiptId}:${source.option.id}`, items: [entry], store: deps.store,

          currentOwner: deps.owner, isCurrent: current, write: async item => { await deps.confirm(item,identityId,confirmedCatalog); await deps.store.setItem(completedKey, 'confirmed'); } });
        if (result.status === 'complete' || result.status === 'review') { stopped = true; prepared = null; }

        return result;

      } catch { return { status: 'unavailable' as const, completed: 0 }; } finally { busy = false; }

    },

  };

}

export type MealReviewSession = ReturnType<typeof createMealReviewSession>;

let held: { key: string; session: MealReviewSession } | undefined;

let sequence = 0;

export function holdMealReview(session: MealReviewSession) {

  clearMealReview(); const key = `meal-review-${++sequence}`; held = { key, session }; return key;

}

export function readMealReview(key: unknown) { return held && held.key === key ? held.session : undefined; }

export function clearMealReview() { held?.session.invalidate(); held = undefined; }

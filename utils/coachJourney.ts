import type { DailyMealSlot } from './coachDailyAction';
import { toLocalDateString } from './dateUtils';

export function isSameCoachDay(timestamp: string, now = new Date()): boolean {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) && toLocalDateString(date) === toLocalDateString(now);
}

export type MealMode = 'cook' | 'eat_out' | 'quick' | 'favorite';
export type MealGuidance = { mode: 'cook' | 'eat_out' | 'quick' | 'saved'; meals_remaining: number; diary_complete: boolean; constraints: { allergens: string[]; exclude_ingredients: string[]; diet: 'unrestricted' | 'vegetarian' | 'vegan' }; preference: 'balanced' | 'protein' };
export type GuidedOption = {
  id: string; name: string; source: 'saved_meal' | 'recipe' | 'restaurant'; source_id: string;
  source_label: string; source_url?: string; portion_label: string;
  nutrition: { calories: number; protein: number; carbs: number; fats: number; fiber: number };
  recipe?: { source_servings: number; ingredients: string[]; instructions: string[] };
  source_servings: number;
  fit_explanation: string; review: { kind: 'saved_meal' | 'recipe' | 'source'; id: string };
};
export type GuidedResult = { kind: 'ready'; owner: string; date: string; meal: DailyMealSlot; options: GuidedOption[]; reason?: string } | { kind: 'blocked' | 'unavailable' | 'permission' | 'locked' };
export type JourneyDraft = { mode: MealMode; meal: DailyMealSlot; remaining: number; avoid: string; allergens: string; diet: 'unrestricted' | 'vegetarian' | 'vegan'; preference: 'balanced' | 'protein'; diaryComplete: boolean | null };
export const newJourney = (): JourneyDraft => ({ mode: 'cook', meal: 'lunch', remaining: 2, avoid: '', allergens: '', diet: 'unrestricted', preference: 'balanced', diaryComplete: null });

export function guidance(draft: JourneyDraft): MealGuidance | null {
  if (!['cook','eat_out','quick','favorite'].includes(draft.mode) || !Number.isInteger(draft.remaining) || draft.remaining < 1 || draft.remaining > 4 || !['breakfast','lunch','dinner','snack'].includes(draft.meal)) return null;
  if (typeof draft.diaryComplete !== 'boolean' || !['unrestricted','vegetarian','vegan'].includes(draft.diet) || !['balanced','protein'].includes(draft.preference) || typeof draft.avoid !== 'string' || typeof draft.allergens !== 'string' || draft.avoid.length > 240 || draft.allergens.length > 240) return null;
  const list = (text: string) => [...new Set(text.split(',').map(v => v.trim()).filter(Boolean))];
  const avoid = list(draft.avoid), allergens = list(draft.allergens);
  if (avoid.length > 10 || allergens.length > 10 || [...avoid, ...allergens].some(v => v.length > 60)) return null;
  return { mode: draft.mode === 'favorite' ? 'saved' : draft.mode, meals_remaining: draft.remaining,
    diary_complete: draft.diaryComplete, constraints: { allergens, exclude_ingredients: avoid, diet: draft.diet }, preference: draft.preference };
}

// Restore only the already-journaled request, not a second persisted preference profile.
export function restoreGuidedDraft(value: any): JourneyDraft | null {
  if (!value || !['cook','eat_out','quick','saved'].includes(value.mode) || !value.constraints ||
      ![value.constraints.allergens, value.constraints.exclude_ingredients].every(xs => Array.isArray(xs) && xs.every(x => typeof x === 'string' && !x.includes(',')))) return null;
  const draft: JourneyDraft = { mode: value.mode === 'saved' ? 'favorite' : value.mode, meal: value.meal_type,
    remaining: value.meals_remaining, diaryComplete: value.diary_complete, diet: value.constraints.diet,
    preference: value.preference, allergens: value.constraints.allergens.join(', '), avoid: value.constraints.exclude_ingredients.join(', ') };
  return guidance(draft) ? draft : null;
}

// Convenience routing only. Server enforcement must also redirect meal requests;
// this classifier is never a permission or nutrition-safety boundary.
export function isMealHelpRequest(text: string): boolean {
  const s = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\b(next meal|what (?:can|should|could) i eat|meal (?:ideas|plan)|recommend (?:a |some )?(?:meal|food)|give me (?:food |meal )?options|recipe|recipes|restaurant|takeout|no.cook)\b/.test(s)
    || /\b(que (?:puedo|debo|deberia) comer|proxima comida|siguiente comida|ideas? (?:de|para) comida|plan de comidas|recetas?|restaurantes?|dame opciones|sin cocinar)\b/.test(s);
}

// No account preferences, logs or result snapshots are persisted here.
const drafts = new Map<string, { step: 'mode' | 'context'; draft: JourneyDraft }>();
export const journeyScope = (owner: string, date: string) => JSON.stringify([owner, date]);
export function rememberJourney(scope: string, step: 'mode' | 'context', draft: JourneyDraft) {
  drafts.clear(); drafts.set(scope, { step, draft: { ...draft } });
}
export function resumeJourney(scope: string) { return drafts.get(scope); }
export function clearJourneys() { drafts.clear(); }

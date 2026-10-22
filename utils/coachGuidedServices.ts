import { dailyAccess, type DailyAccess, type DailyMealSlot } from './coachDailyAction';
import type { DailyRequestBody } from './coachDailyTransport';
import type { GuidedResult, GuidedOption, MealGuidance, JourneyDraft } from './coachJourney';

const text = (x: unknown, max: number): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const number = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
export function createGuidedServices(deps: {
  owner(): Promise<string | undefined>;
  today(): string;
  request(body: DailyRequestBody): Promise<Response>;
  recover(body: DailyRequestBody): Promise<Response>;
  pendingGuidance?(): Promise<JourneyDraft | null>;
}) {
  async function run(access: DailyAccess, date: string, meal: DailyMealSlot, input: MealGuidance, recover: boolean): Promise<GuidedResult> {
    if (dailyAccess(access) !== 'ready') return { kind: dailyAccess(access) === 'locked' ? 'locked' : 'blocked' };
    try {
      const owner = await deps.owner(); if (!owner || deps.today() !== date) return { kind: 'blocked' };
      const response = await (recover ? deps.recover : deps.request)({ intent: 'meal_choice', meal_type: meal, ...input });
      const body = await response.json();
      if (await deps.owner() !== owner || deps.today() !== date) return { kind: 'blocked' };
      if (!response.ok) return { kind: [401,403,429].includes(response.status) ? 'blocked' : 'unavailable' };
      if (body.schema !== 'guided_meal_choice_v1' || body.owner !== owner || body.date !== date || !Array.isArray(body.options) || body.options.length > 3) return { kind: 'unavailable' };
      if (['clarify','coverage_unavailable'].includes(body.status) && body.options.length === 0) return { kind: 'ready', owner, date, meal, options: [], reason: body.next_step ?? body.question?.key };
      if (body.status !== 'options' || !body.options.length || body.context?.coverage !== 'logged_only') return { kind: 'unavailable' };
      const options: GuidedOption[] = [];
      for (const row of body.options) {
        if (!text(row.id, 160) || options.some(o => o.id === row.id) || !text(row.name, 300) || !['retrieved_recipe','restaurant'].includes(row.source) || !text(row.source_ref, 2048) || row.nutrition_authority !== 'source_snapshot' || row.next_action !== 'review_source' || row.requires_explicit_add !== true || !row.nutrition || !['calories','protein','carbs','fats','fiber'].every(k => number(row.nutrition[k])) || row.nutrition.calories <= 0 || !number(row.portion?.source_servings) || row.portion.source_servings < 0.5 || row.portion.source_servings > 2 || !text(row.portion.source_label, 300) || !['near_planning_share','different_from_planning_share','budget_unknown','recorded_budget_exhausted'].includes(row.fit?.label)) return { kind: 'unavailable' };
        const url = new URL(row.source_ref);
        if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(url.hostname) || /^(?:\d+\.){3}\d+$/.test(url.hostname) || /\.(local|internal|test)$/i.test(url.hostname)) return { kind: 'unavailable' };
        const details = row.recipe_details;
        if (details && (row.source !== 'retrieved_recipe' || details.basis !== 'original_recipe_yield_not_scaled' || !number(details.source_servings) || details.source_servings <= 0 || details.source_servings > 100 || !['ingredients','instructions'].every(k => Array.isArray(details[k]) && details[k].length > 0 && details[k].length <= 100 && details[k].every((v: unknown) => text(v, 4000))))) return { kind: 'unavailable' };
        options.push({ id: row.id, name: row.name, source: row.source === 'retrieved_recipe' ? 'recipe' : 'restaurant', source_id: row.id,
          source_label: url.hostname, source_url: url.toString(), portion_label: `${row.portion.source_servings} × ${row.portion.source_label}`,
          nutrition: row.nutrition, source_servings: row.portion.source_servings, recipe: details, fit_explanation: row.fit.label,
          // This receipt carries no existing recipe-detail ID or full food draft.
          // Do not manufacture a diary route from its public URL.
          review: { kind: details ? 'recipe' : 'source', id: row.id } });
      }
      return { kind: 'ready', owner, date, meal, options };
    } catch { return { kind: 'unavailable' }; }
  }
  return {
    async pendingGuidance(access: DailyAccess, date: string): Promise<JourneyDraft | null> {
      try {
        if (dailyAccess(access) !== 'ready' || deps.today() !== date) return null;
        const owner = await deps.owner(); if (!owner) return null;
        const draft = await deps.pendingGuidance?.();
        return await deps.owner() === owner && deps.today() === date ? draft ?? null : null;
      } catch { return null; }
    },
    guided: (access: DailyAccess, date: string, meal: DailyMealSlot, input: MealGuidance) => run(access, date, meal, input, false),
    recoverGuided: (access: DailyAccess, date: string, meal: DailyMealSlot, input: MealGuidance) => run(access, date, meal, input, true),
  };
}

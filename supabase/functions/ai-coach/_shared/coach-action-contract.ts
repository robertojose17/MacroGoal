export type CoachMutation = { action_type: 'add_food_to_diary' | 'update_goal' | 'adjust_calories' | 'create_meal_plan'; proposal: Record<string, unknown> };
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const fail = (): never => { throw new Error('invalid_proposal'); };
const finite = (x: unknown, integer = false) => {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || (integer && !Number.isInteger(x))) return fail();
  return x;
};
export function normalizeCoachMutation(input: unknown): CoachMutation {
  if (!record(input) || !record(input.proposal)) return fail();
  const type = input.action_type;
  if (type !== 'create_meal_plan' && type !== 'add_food_to_diary' && type !== 'update_goal' && type !== 'adjust_calories') return fail();
  const p = input.proposal;
  if (type === 'create_meal_plan') {
    const date = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10) === x;
    if (typeof p.plan_name !== 'string' || !p.plan_name.trim() || p.plan_name.length > 200) return fail();
    let raw: unknown[];
    if (Array.isArray(p.items) && p.days === undefined) raw = p.items;
    else if (Array.isArray(p.days) && p.items === undefined) {
      raw = p.days.flatMap(d => {
        if (!record(d) || !date(d.date) || !Array.isArray(d.meals) || !d.meals.length) return fail();
        return d.meals.map(m => { if (!record(m)) return fail(); return {...m,date:d.date}; });
      });
    } else return fail();
    if (!raw.length || raw.length > 100) return fail();
    const items = raw.map(item => {
      if (!record(item)) return fail();
      const food = normalizeCoachMutation({action_type:'add_food_to_diary',proposal:item}).proposal;
      delete food.reason;
      for (const key of ['brand','serving_description','dish_description']) {
        if (item[key] != null) {
          if (typeof item[key] !== 'string' || item[key].length > (key === 'dish_description' ? 2000 : 300)) return fail();
          food[key] = item[key];
        }
      }
      return food;
    });
    const dates=items.map(i=>String(i.date)).sort();
    const start=p.start_date ?? dates[0],end=p.end_date ?? dates[dates.length-1];
    if (!date(start)||!date(end)||start>end||dates[0]<start||dates[dates.length-1]>end||(Date.parse(end)-Date.parse(start))/86400000>30) return fail();
    const plan: Record<string,unknown>={plan_name:p.plan_name,start_date:start,end_date:end,items};
    if(p.reason!==undefined){if(typeof p.reason!=='string'||p.reason.length>2000)return fail();plan.reason=p.reason;}
    if(new TextEncoder().encode(JSON.stringify(plan)).length>15000)return fail();
    return {action_type:type,proposal:plan};
  }

  const out: Record<string, string | number | null> = {};
  if (p.reason !== undefined) {
    if (typeof p.reason !== 'string' || p.reason.length > 2000) return fail();
    out.reason = p.reason;
  }
  if (type === 'add_food_to_diary') {
    if (typeof p.food_name !== 'string' || !p.food_name.trim() || p.food_name.length > 300) return fail();
    if (typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(Date.parse(p.date)) || new Date(p.date).toISOString().slice(0,10) !== p.date) return fail();
    if (!['breakfast','lunch','dinner','snack'].includes(String(p.meal_type))) return fail();
    Object.assign(out, {food_name:p.food_name, date:p.date, meal_type:String(p.meal_type)});
    for (const key of ['calories','protein','carbs','fats','fiber']) out[key] = finite(p[key] ?? (key === 'calories' ? undefined : 0));
    out.quantity = finite(p.quantity ?? 1);
    if (out.quantity === 0) return fail();
    if (p.grams != null) out.grams = finite(p.grams);
    if (p.serving_unit != null && (typeof p.serving_unit !== 'string' || p.serving_unit.length > 100)) return fail();
    if (p.serving_unit != null) out.serving_unit = String(p.serving_unit);
  } else {
    const key = type === 'update_goal' ? 'proposed_value' : 'proposed_calories';
    out[key] = finite(p[key], true);
    if (out[key] === 0) return fail();
    if (type === 'update_goal') for (const key of ['protein_g','carbs_g','fats_g','fiber_g']) if (p[key] !== undefined) out[key] = finite(p[key], true);
  }
  return { action_type:type, proposal:out };
}

export type ConfirmationDependencies = {
  authenticate: (authorization: string) => Promise<string | null>;
  execute: (userId: string, proposalId: string, expected: unknown) => Promise<unknown>;
};
/** Authenticate every request; user identity and mutation content never come from model authority. */
export async function confirmCoachAction(request: Request, deps: ConfirmationDependencies): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  if (request.method !== 'POST') return json({error:'method_not_allowed'},405);
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer \S+$/.test(authorization)) return json({error:'unauthorized'},401);
  let userId: string | null;
  try { userId = await deps.authenticate(authorization); } catch { return json({error:'auth_unavailable'},503); }
  if (!userId) return json({error:'unauthorized'},401);
  if (Number(request.headers.get('content-length') ?? 0) > 16384) return json({error:'request_too_large'},413);
  let body: unknown;
  try { const raw = await request.text(); if (raw.length > 16384) return json({error:'request_too_large'},413); body = JSON.parse(raw); } catch { return json({error:'invalid_request'},400); }
  if (!record(body) || Object.keys(body).some(k=>!['proposal_id','confirmed','expected'].includes(k)) || body.confirmed !== true || typeof body.proposal_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.proposal_id)) return json({error:'invalid_confirmation'},400);
  try {
    normalizeCoachMutation(body.expected);
  } catch { return json({error:'invalid_proposal'},400); }
  try {
    // Pass the EXACT reviewed object, not a normalized replacement. SQL compares jsonb equality.
    const result = await deps.execute(userId, body.proposal_id, body.expected);
    return json(result);
  } catch {
    return json({error:'confirmation_rejected'},409);
  }
}


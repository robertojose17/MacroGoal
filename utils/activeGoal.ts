import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
export type ActiveGoal = Database['public']['Tables']['goals']['Row'];
export type AcceptedGoalSnapshot = Pick<ActiveGoal, 'id' | 'updated_at' | 'daily_calories' | 'protein_g' | 'carbs_g' | 'fats_g' | 'fiber_g'> & { version: 'accepted-goal-v1' };
const keys = ['daily_calories', 'protein_g', 'carbs_g', 'fats_g', 'fiber_g'] as const;
export function acceptedGoalSnapshot(value: unknown): AcceptedGoalSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('active_goal_unavailable');
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id || !(row.updated_at === null || (typeof row.updated_at === 'string' && row.updated_at.trim() && Number.isFinite(Date.parse(row.updated_at))))
    || !keys.every(key => typeof row[key] === 'number' && Number.isFinite(row[key]) && row[key] >= 0) || !(typeof row.daily_calories === 'number' && row.daily_calories > 0)) throw Error('active_goal_unavailable');
  return {version:'accepted-goal-v1',id:row.id,updated_at:row.updated_at as string | null,daily_calories:row.daily_calories,protein_g:row.protein_g as number,carbs_g:row.carbs_g as number,fats_g:row.fats_g as number,fiber_g:row.fiber_g as number};
}
export function sameAcceptedGoal(left: AcceptedGoalSnapshot, right: AcceptedGoalSnapshot): boolean {
  return left.version === right.version && left.id === right.id && left.updated_at === right.updated_at && keys.every(key => left[key] === right[key]);
}
export async function readActiveGoal(userId: string): Promise<ActiveGoal> {
  if (!userId) throw Error('account_changed');
  const {data,error}=await supabase.from('goals').select('*').eq('user_id',userId).eq('is_active',true).maybeSingle();
  if(error) throw Error('goal_source_unavailable');
  if(!data || data.user_id!==userId || data.is_active!==true) throw Error('active_goal_unavailable');
  acceptedGoalSnapshot(data);
  return data;
}
export async function assertActiveGoal(userId: string, expected: AcceptedGoalSnapshot): Promise<void> {
  const goal=await readActiveGoal(userId);
  if(!sameAcceptedGoal(acceptedGoalSnapshot(goal),expected)) throw Error('goal_changed');
}

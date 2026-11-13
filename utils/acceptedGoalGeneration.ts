import { supabase } from '@/lib/supabase/client';
import { acceptedGoalSnapshot, assertActiveGoal, sameAcceptedGoal, type AcceptedGoalSnapshot } from './activeGoal';

/** One explicit request, bound to a reviewed goal. Never retries or refreshes that goal. */
export async function invokeAcceptedGoalGeneration(
  endpoint: 'recipe-finder' | 'generate-meal-plan',
  owner: string,
  expected: AcceptedGoalSnapshot,
  body: Record<string, unknown>,
  isCurrent: () => boolean,
): Promise<Record<string, unknown>> {
  const snapshot = acceptedGoalSnapshot(expected);
  const payload = JSON.parse(JSON.stringify(body));
  const check = () => { if (!isCurrent()) throw Error('generation_cancelled'); };
  const checkOwner = async () => {
    check();
    const session = await supabase.auth.getSession();
    check();
    if (session.error || !owner || session.data.session?.user.id !== owner) throw Error('account_changed');
  };
  await checkOwner();
  await assertActiveGoal(owner, snapshot);
  await checkOwner();
  check();
  const {data,error} = await supabase.functions.invoke(endpoint, {body:{...payload,expected_goal:snapshot}});
  check();
  if (error) throw Error(error.message);
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.goal_snapshot?.version !== 'accepted-goal-v1'
    || !sameAcceptedGoal(snapshot, acceptedGoalSnapshot(data.goal_snapshot))) throw Error('goal_changed');
  await assertActiveGoal(owner,snapshot);
  await checkOwner();
  return data;
}

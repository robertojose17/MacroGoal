import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientSession } from '../communityPrivacyV2/communityProfileApi';
import { createCommunityCompatibilityReader } from '../communityPrivacyV2Compatibility/communityCompatibility';
import { createSupabaseCompatibilityTransport } from '../communityPrivacyV2Compatibility/supabaseCompatibilityTransport';
import { createCommunityScopedQuery } from './communityScopedQuery';
import { UUID, identity, object, parseWeekly } from './communityReaderContracts';
import type { CommunityIdentity, CommunityReadPost, CommunityReadComment, CommunityReadCommitment,
  ReadResult, ReadScope, WeeklyTracking } from './communityReaderContracts';

export const FEED_POST_FIELDS = 'id,user_id,content,image_url,created_at,likes_count,comments_count,is_public,post_type,post_type_v2,meal_photo_url,meal_calories,meal_protein,meal_carbs,meal_fat,meal_servings,meal_recipe_id,meal_recipe_data,question_title,question_details,progress_stats,is_pinned,is_founder_post,saves_count,auto_post_type,auto_post_date,streak_days,milestone_type,weight_value,weight_unit,weekly_recap_score,weekly_recap_days_tracked,weekly_recap_week_start,weekly_recap_day_flags,weight_goal_pct,featured_recipe_id,featured_recipe_week,edu_headline,edu_body,edu_example,edu_week';
export const CLUB_POST_FIELDS = 'id,user_id,content,image_url,created_at,likes_count,comments_count,saves_count,is_public,is_pinned,is_founder_post,post_type,post_type_v2,meal_photo_url,meal_calories,meal_protein,meal_carbs,meal_fat,meal_servings,meal_recipe_id,meal_recipe_data,question_title,progress_stats,auto_post_type,streak_days,weekly_recap_score,weekly_recap_days_tracked,weekly_recap_week_start,weekly_recap_day_flags,weight_goal_pct,edu_headline,edu_body,edu_example,edu_week,section';
const COMMENT_FIELDS = 'id,post_id,user_id,content,created_at';
const fail = <T>(): ReadResult<T> => ({ ok: false });
const id = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const rows = (value: unknown, maximum: number): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.length <= maximum && value.every(object);

/** Fixed existing Community reads only. Owner tracking and explicit post writes
 * remain in the screen. No cross-user users/meals/goals read or identity join. */
export function createCommunityReaderClient({ client, getSession, allowAutomaticWrites = true }: {
  client: Pick<SupabaseClient, 'from' | 'rpc'>;
  getSession(): Promise<ClientSession | null>;
  allowAutomaticWrites?: boolean;
}) {
  const run = createCommunityScopedQuery(getSession);
  const rpc = createSupabaseCompatibilityTransport({ client, getSession });
  const reader = () => createCommunityCompatibilityReader({ getSession, rpc, onInvalidate() {} });
  async function discover(scope: ReadScope, signal: AbortSignal, ids: string[]): Promise<ReadResult<Map<string, CommunityIdentity>>> {
    const result = await reader().discover({ session: scope, signal, ids: [...new Set(ids)] });
    return result.ok ? { ok: true, value: new Map(result.value.items.map(row => [row.id, identity(row)])) } : fail();
  }
  async function ownMarks(scope: ReadScope, signal: AbortSignal, table: 'community_likes' | 'social_post_saves') {
    const result = await run<unknown>(scope, signal, (session, abort) => client.from(table).select('post_id')
      .eq('user_id', session.userId).setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(abort));
    if (!result.ok || !rows(result.value, 10000) || result.value.some(row => !id(row.post_id))) return null;
    return new Set(result.value.map(row => row.post_id as string));
  }
  async function comments(scope: ReadScope, signal: AbortSignal, postIds: string[]): Promise<ReadResult<CommunityReadComment[]>> {
    if (!postIds.length) return { ok: true, value: [] };
    if (postIds.length > 50 || postIds.some(value => !UUID.test(value))) return fail();
    const result = await run<unknown>(scope, signal, (session, abort) => client.from('community_comments').select(COMMENT_FIELDS)
      .in('post_id', postIds).order('created_at', { ascending: true }).limit(1001)
      .setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(abort));
    if (!result.ok || !rows(result.value, 1000) || result.value.some(row => !id(row.id) || !id(row.user_id) ||
      !id(row.post_id) || !postIds.includes(row.post_id) || typeof row.content !== 'string' || typeof row.created_at !== 'string')) return fail();
    const found = await discover(scope, signal, result.value.map(row => row.user_id as string));
    if (!found.ok) return fail();
    return { ok: true, value: result.value.flatMap(row => {
      const author = found.value.get(row.user_id as string);
      return author ? [{ id: row.id as string, post_id: row.post_id as string, user_id: row.user_id as string,
        content: row.content as string, created_at: row.created_at as string, author }] : [];
    }) };
  }
  async function posts(scope: ReadScope, signal: AbortSignal, section: 'feed' | 'club', allowClub: boolean): Promise<ReadResult<CommunityReadPost[]>> {
    if (section === 'club' && !allowClub) return fail();
    const fields: string = section === 'feed' ? FEED_POST_FIELDS : CLUB_POST_FIELDS;
    const result = await run<unknown>(scope, signal, (session, abort) => {
      let query = client.from('social_posts').select(fields).eq('section', section);
      if (section === 'feed') query = query.eq('is_public', true);
      return query.order('is_pinned', { ascending: false }).order('created_at', { ascending: false })
        .limit(section === 'feed' ? 50 : 30).setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(abort);
    });
    if (!result.ok || !rows(result.value, section === 'feed' ? 50 : 30) || result.value.some(row => !id(row.id) ||
      !id(row.user_id) || (row.content !== null && typeof row.content !== 'string') || typeof row.created_at !== 'string')) return fail();
    const found = await discover(scope, signal, result.value.map(row => row.user_id as string));
    if (!found.ok) return fail();
    const permitted = result.value.filter(row => found.value.has(row.user_id as string));
    const [liked, saved, topComments] = await Promise.all([ownMarks(scope, signal, 'community_likes'), ownMarks(scope, signal, 'social_post_saves'),
      section === 'club' ? comments(scope, signal, permitted.map(row => row.id as string)) : Promise.resolve({ ok: true as const, value: [] as CommunityReadComment[] })]);
    if (!liked || !saved || !topComments.ok) return fail();
    const top = new Map<string, CommunityReadComment>();
    for (const comment of topComments.value) if (!top.has(comment.post_id)) top.set(comment.post_id, comment);
    return { ok: true, value: permitted.map(row => ({
      ...Object.fromEntries(fields.split(',').map(key => [key, row[key]])),
      id: row.id as string, user_id: row.user_id as string, content: (row.content as string | null) ?? '', created_at: row.created_at as string,
      section, category: 'general', food_name: null, food_calories: null,
      author: found.value.get(row.user_id as string)!, liked_by_me: liked.has(row.id as string), saved_by_me: saved.has(row.id as string),
      top_comment: top.has(row.id as string) ? { id: top.get(row.id as string)!.id, content: top.get(row.id as string)!.content, author: top.get(row.id as string)!.author } : null,
    })) };
  }
  async function readComments(scope: ReadScope, signal: AbortSignal, postId: string, section: 'feed' | 'club', allowClub: boolean) {
    if (!UUID.test(postId) || (section === 'club' && !allowClub)) return fail<CommunityReadComment[]>();
    const result = await run<unknown>(scope, signal, (session, abort) => {
      let query = client.from('social_posts').select('id,user_id').eq('id', postId).eq('section', section);
      if (section === 'feed') query = query.eq('is_public', true);
      return query.limit(1).setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(abort);
    });
    if (!result.ok || !rows(result.value, 1) || result.value.length !== 1 || result.value[0].id !== postId || !id(result.value[0].user_id)) return fail<CommunityReadComment[]>();
    const author = await discover(scope, signal, [result.value[0].user_id]);
    if (!author.ok || !author.value.has(result.value[0].user_id)) return fail<CommunityReadComment[]>();
    return comments(scope, signal, [postId]);
  }
  async function commitment(scope: ReadScope, signal: AbortSignal, weekStart: string): Promise<ReadResult<CommunityReadCommitment | null>> {
    const result = await run<unknown>(scope, signal, (session, abort) => client.from('community_commitments')
      .select('id,user_id,partner_id,target_days,week_start,status').or(`user_id.eq.${session.userId},partner_id.eq.${session.userId}`)
      .eq('week_start', weekStart).in('status', ['active', 'pending']).limit(1)
      .setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(abort));
    if (!result.ok || !rows(result.value, 1)) return fail();
    if (!result.value.length) return { ok: true, value: null };
    const row = result.value[0];
    if (!id(row.id) || !id(row.user_id) || !id(row.partner_id) || ![row.user_id, row.partner_id].includes(scope.userId) ||
      row.week_start !== weekStart || !['active', 'pending'].includes(String(row.status)) || !Number.isSafeInteger(row.target_days) ||
      (row.target_days as number) < 1 || (row.target_days as number) > 7) return fail();
    const found = await discover(scope, signal, [row.user_id, row.partner_id]);
    if (!found.ok) return fail();
    const partner = found.value.get(row.partner_id), requester = found.value.get(row.user_id);
    if (!partner || !requester) return { ok: true, value: null };
    return { ok: true, value: { id: row.id, user_id: row.user_id, partner_id: row.partner_id, week_start: weekStart,
      target_days: row.target_days as number, status: row.status as 'active' | 'pending', partner, requester } };
  }
  async function weekly(scope: ReadScope, signal: AbortSignal, targetId: string, fromDate: string, toDate: string): Promise<ReadResult<WeeklyTracking>> {
    if (!UUID.test(targetId)) return fail();
    const result = await run<unknown>(scope, signal, (session, abort) => client.rpc('profile_weekly_tracking', {
      p_target_id: targetId, p_from: fromDate, p_to: toDate,
    }).setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(abort));
    const value = result.ok ? parseWeekly(result.value, targetId, fromDate, toDate) : null;
    return value ? { ok: true, value } : fail();
  }
  async function ownIdentity(scope: ReadScope, signal: AbortSignal) {
    const result = await run<unknown>(scope, signal, (session, abort) => client.from('users').select('id,username,full_name,avatar_url')
      .eq('id', session.userId).limit(1).setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(abort));
    if (!result.ok || !rows(result.value, 1) || result.value.length !== 1 || result.value[0].id !== scope.userId) return fail<CommunityIdentity>();
    const row = result.value[0];
    for (const key of ['username', 'full_name', 'avatar_url']) if (row[key] !== null && typeof row[key] !== 'string') return fail<CommunityIdentity>();
    return { ok: true as const, value: { id: scope.userId, username: (row.username as string | null) ?? '', name: row.full_name as string | null,
      full_name: row.full_name as string | null, avatar_url: row.avatar_url as string | null, user_type: null } };
  }
  async function founder(scope: ReadScope, signal: AbortSignal) {
    const result = await run<unknown>(scope, signal, (session, abort) => client.rpc('is_founder_user')
      .setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(abort));
    return result.ok && typeof result.value === 'boolean' ? result : fail<boolean>();
  }
  async function saveOwnWeekly(scope: ReadScope, signal: AbortSignal, weekStart: string, score: number) {
    if (!allowAutomaticWrites || !Number.isSafeInteger(score) || score < 0 || score > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return false;
    const result = await run<unknown>(scope, signal, async (session, abort) => {
      const response = await client.from('weekly_consistency_scores').upsert({ user_id: session.userId, week_start: weekStart, score },
        { onConflict: 'user_id,week_start' }).setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(abort);
      return { data: response.error ? null : true, error: response.error };
    });
    return result.ok;
  }
  async function premiumMembers(scope: ReadScope, signal: AbortSignal) {
    const [count, members] = await Promise.all([
      run<unknown>(scope, signal, (session, abort) => client.rpc('get_premium_member_count').setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(abort)),
      run<unknown>(scope, signal, (session, abort) => client.rpc('get_premium_members').setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(abort)),
    ]);
    if (!count.ok || !Number.isSafeInteger(count.value) || (count.value as number) < 0 || !members.ok ||
      !rows(members.value, 1000) || members.value.some(row => !id(row.id))) return fail<{ count: number; members: CommunityIdentity[] }>();
    const found = await discover(scope, signal, members.value.map(row => row.id as string));
    return found.ok ? { ok: true as const, value: { count: count.value as number, members: [...found.value.values()] } } : fail<{ count: number; members: CommunityIdentity[] }>();
  }
  return { posts, comments: readComments, commitment, weekly, ownIdentity, founder, saveOwnWeekly, premiumMembers,
    discover, search: (scope: ReadScope, signal: AbortSignal, query: string) => reader().search({ session: scope, signal, query }),
    connections: (scope: ReadScope, signal: AbortSignal) => reader().connections({ session: scope, signal, targetUserId: scope.userId, direction: 'following' }) };
}
export type CommunityReaderClient = ReturnType<typeof createCommunityReaderClient>;

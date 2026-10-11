import type { RemainingReadClient, RemainingReadContext } from './remainingReadSession';
import { withRemainingReadSession } from './remainingReadSession';
import type { DiscoveryIdentityDto, CompatibilityDirection } from './communityCompatibility';
import type { SocialPost, Comment } from '@/utils/socialApi';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = () => new Error('Community data is unavailable.');
const validId = (value: string) => { if (!UUID.test(value)) throw unavailable(); return value.toLowerCase(); };
// Existing Community selected-post fields only. Raw health tables and users joins are never read.
export const COMMUNITY_POST_FIELDS = 'id,user_id,content,image_url,calories,protein,carbs,fat,meal_ingredients,progress_photo_url,poll_options,poll_votes,audience,created_at,likes_count,comments_count,is_public,post_type,post_type_v2,meal_photo_url,meal_calories,meal_protein,meal_carbs,meal_fat,meal_servings,meal_recipe_id,meal_recipe_data,question_title,question_details,progress_stats,is_pinned,is_founder_post,saves_count,auto_post_type,auto_post_date,streak_days,milestone_type,weight_value,weight_unit,weekly_recap_score,weekly_recap_days_tracked,weekly_recap_week_start,weekly_recap_day_flags,weight_goal_pct,edu_headline,edu_body,edu_example,edu_week';
const POST_KEYS = COMMUNITY_POST_FIELDS.split(',');
const COMMENT_FIELDS = 'id,post_id,user_id,content,created_at';
function author(identity: DiscoveryIdentityDto) {
  return { ...identity, username: identity.username ?? '' };
}
async function query<T>(context: RemainingReadContext, builder: PromiseLike<{ data: T | null; error: unknown }> & {
  setHeader(name: string, value: string): { abortSignal(signal: AbortSignal): PromiseLike<{ data: T | null; error: unknown }> };
}): Promise<T> {
  await context.assertCurrent();
  const result = await builder.setHeader('Authorization', `Bearer ${context.session.accessToken}`).abortSignal(context.signal);
  await context.assertCurrent();
  if (result.error || result.data === null) throw unavailable();
  return result.data;
}
async function hydrate<T extends { user_id: string }>(context: RemainingReadContext, rows: T[]) {
  const ids = [...new Set(rows.map(row => validId(row.user_id)))];
  const result = await context.identities.discover({ session: context.session, signal: context.signal, ids });
  if (!result.ok) throw unavailable();
  const identities = new Map(result.value.items.map(item => [item.id, item]));
  // Missing and either-direction blocked authors are omitted, never backfilled from users/email/cache.
  return rows.flatMap(row => { const identity = identities.get(row.user_id.toLowerCase());
    return identity ? [{ ...row, author: author(identity) }] : []; });
}
function projectPosts(raw: unknown): (Record<string, unknown> & { id: string; user_id: string })[] {
  if (!Array.isArray(raw) || raw.length > 100) throw unavailable();
  return raw.map(row => {
    if (!row || typeof row !== 'object' || !UUID.test(row.id) || !UUID.test(row.user_id) ||
      typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)) ||
      typeof row.is_public !== 'boolean') throw unavailable();
    return Object.fromEntries(POST_KEYS.map(key => [key, row[key]])) as Record<string, unknown> & { id: string; user_id: string };
  });
}
async function postsWithPersonalState(client: RemainingReadClient, context: RemainingReadContext, raw: unknown): Promise<SocialPost[]> {
  const selected = projectPosts(raw);
  const projected = await context.identities.postAuthors({ session: context.session, signal: context.signal,
    postIds: selected.map(row => row.id) });
  if (!projected.ok) throw unavailable();
  const authors = new Map(projected.value.items.map(item => [item.postId, item.identity]));
  const rows = selected.flatMap(row => {
    const identity = authors.get(row.id);
    if (!identity) return [];
    if (identity.id !== row.user_id) throw unavailable();
    return [{ ...row, author: { ...author(identity), is_premium: identity.is_premium } }];
  });
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const [likes, saves] = await Promise.all([
    query(context, client.from('social_post_likes').select('post_id').eq('user_id', context.session.userId).in('post_id', ids)),
    query(context, client.from('social_post_saves').select('post_id').eq('user_id', context.session.userId).in('post_id', ids)),
  ]);
  if (!Array.isArray(likes) || !Array.isArray(saves)) throw unavailable();
  const liked = new Set(likes.map(row => row.post_id)), saved = new Set(saves.map(row => row.post_id));
  return rows.map(row => ({ ...row, liked_by_me: liked.has(row.id), saved_by_me: saved.has(row.id) })) as unknown as SocialPost[];
}
async function visiblePost(client: RemainingReadClient, context: RemainingReadContext, postId: string): Promise<SocialPost | null> {
  const data = await query(context, client.from('social_posts').select(COMMUNITY_POST_FIELDS).eq('id', validId(postId)).limit(1));
  const rows = projectPosts(data).filter(row => row.is_public === true || row.user_id === context.session.userId);
  return (await postsWithPersonalState(client, context, rows))[0] ?? null;
}

/** Inert factory. All operations independently verify current registered auth and pin requests. */
export function createRemainingCommunityReads(client: RemainingReadClient) {
  return {
    connections(targetUserId: string | undefined, direction: CompatibilityDirection, signal?: AbortSignal): Promise<DiscoveryIdentityDto[]> {
      return withRemainingReadSession(client, async context => {
        const result = await context.identities.connections({ session: context.session, signal: context.signal,
          targetUserId: targetUserId ? validId(targetUserId) : context.session.userId, direction });
        if (!result.ok) throw unavailable();
        return result.value.items;
      }, { signal });
    },
    search(search: string, signal?: AbortSignal): Promise<DiscoveryIdentityDto[]> {
      return withRemainingReadSession(client, async context => {
        const result = await context.identities.search({ session: context.session, signal: context.signal, query: search });
        if (!result.ok) throw unavailable();
        return result.value.items;
      }, { signal });
    },
    post(postId: string, signal?: AbortSignal): Promise<SocialPost | null> {
      return withRemainingReadSession(client, context => visiblePost(client, context, postId), { signal });
    },
    feed(mode: 'following' | 'discover', limit = 20, offset = 0, signal?: AbortSignal): Promise<SocialPost[]> {
      return withRemainingReadSession(client, async context => {
        if (!['following', 'discover'].includes(mode) || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
          !Number.isInteger(offset) || offset < 0 || offset > 10000) throw unavailable();
        let builder = client.from('social_posts').select(COMMUNITY_POST_FIELDS);
        if (mode === 'discover') builder = builder.eq('is_public', true);
        else builder = builder.or(`is_public.eq.true,user_id.eq.${context.session.userId}`);
        if (mode === 'following') {
          const result = await context.identities.connections({ session: context.session, signal: context.signal,
            targetUserId: context.session.userId, direction: 'following' });
          if (!result.ok) throw unavailable();
          builder = builder.in('user_id', [...new Set([context.session.userId, ...result.value.items.map(item => item.id)])]);
        }
        if (mode === 'following') builder = builder.order('is_pinned', { ascending: false });
        const data = await query(context, builder.order('created_at', { ascending: false })
          .order('id', { ascending: false }).range(offset, offset + limit - 1));
        return postsWithPersonalState(client, context, data);
      }, { signal });
    },
    comments(postId: string, signal?: AbortSignal): Promise<Comment[]> {
      return withRemainingReadSession(client, async context => {
        if (!await visiblePost(client, context, postId)) throw unavailable();
        const data = await query(context, client.from('community_comments').select(COMMENT_FIELDS)
          .eq('post_id', validId(postId)).order('created_at', { ascending: true }).order('id', { ascending: true }).limit(1001));
        if (!Array.isArray(data) || data.length > 1000 || data.some(row => !UUID.test(row.id) ||
          row.post_id !== postId.toLowerCase() || !UUID.test(row.user_id) || typeof row.content !== 'string' || typeof row.created_at !== 'string')) throw unavailable();
        const rows = data.map(row => ({ id: row.id, post_id: row.post_id, user_id: row.user_id,
          content: row.content, created_at: row.created_at }));
        return hydrate(context, rows);
      }, { signal });
    },
    toggleLike(postId: string, signal?: AbortSignal): Promise<{ liked: boolean; likes_count: number }> {
      return withRemainingReadSession(client, async context => {
        if (!await visiblePost(client, context, postId)) throw unavailable();
        await context.assertCurrent();
        const response = await client.rpc('toggle_post_like', { p_post_id: validId(postId), p_user_id: context.session.userId }, { get: false, head: false })
          .setHeader('Authorization', `Bearer ${context.session.accessToken}`).abortSignal(context.signal);
        await context.assertCurrent();
        if (response.error) throw unavailable();
        const result = Array.isArray(response.data) && response.data.length === 1 ? response.data[0] : response.data;
        if (!result || typeof result.liked !== 'boolean' || !Number.isSafeInteger(result.likes_count) || result.likes_count < 0) throw unavailable();
        return { liked: result.liked, likes_count: result.likes_count };
      }, { signal });
    },
    addComment(postId: string, content: string, signal?: AbortSignal): Promise<Comment> {
      return withRemainingReadSession(client, async context => {
        if (typeof content !== 'string' || !content.trim() || content.length > 300 || !await visiblePost(client, context, postId)) throw unavailable();
        // Resolve identity before the single write; a read failure can never trigger a write/retry.
        const identities = await context.identities.discover({ session: context.session, signal: context.signal, ids: [context.session.userId] });
        if (!identities.ok || identities.value.items.length !== 1) throw unavailable();
        const inserted = await query(context, client.from('community_comments').insert({ post_id: validId(postId),
          user_id: context.session.userId, content }).select(COMMENT_FIELDS));
        if (!Array.isArray(inserted) || inserted.length !== 1) throw unavailable();
        const data = inserted[0];
        if (!data || !UUID.test(data.id) || data.post_id !== postId.toLowerCase() || data.user_id !== context.session.userId || data.content !== content) throw unavailable();
        // Keep the original counter operation, pinned to the same verified session. Never retry either mutation.
        await context.assertCurrent();
        const count = await client.rpc('increment_comments', { post_id: postId.toLowerCase() }, { get: false, head: false })
          .setHeader('Authorization', `Bearer ${context.session.accessToken}`).abortSignal(context.signal);
        await context.assertCurrent();
        if (count.error) throw unavailable();
        return { id: data.id, post_id: data.post_id, user_id: data.user_id, content: data.content,
          created_at: data.created_at, author: author(identities.value.items[0]) };
      }, { signal });
    },
  };
}

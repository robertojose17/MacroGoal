import { supabase } from '@/lib/supabase/client';

const BASE = 'https://esgptfiofoaeguslgvcq.supabase.co/functions/v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SocialUser {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  is_private: boolean;
  followers_count: number;
  following_count: number;
  posts_count: number;
}

export type PostType = 'photo' | 'milestone' | 'streak' | 'stats' | 'meal' | 'text';
export type PostTypeV2 = 'update' | 'question' | 'meal' | 'progress' | 'auto';

export interface SocialPost {
  id: string;
  user_id: string;
  post_type: PostType;
  content: string | null;
  image_url: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  weight_value: number | null;
  weight_unit: string | null;
  streak_days: number | null;
  milestone_type: string | null;
  is_public: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  author: { id: string; username: string; name: string | null; user_type?: string | null; is_premium?: boolean | null };
  liked_by_me: boolean;
  saved_by_me?: boolean;
  // v2 fields
  post_type_v2?: PostTypeV2 | null;
  question_title?: string | null;
  question_details?: string | null;
  meal_photo_url?: string | null;
  meal_ingredients?: string[] | null;
  meal_servings?: number | null;
  meal_calories?: number | null;
  meal_protein?: number | null;
  meal_carbs?: number | null;
  meal_fat?: number | null;
  meal_recipe_id?: string | null;
  meal_recipe_data?: any | null;
  progress_stats?: Record<string, unknown> | null;
  progress_photo_url?: string | null;
  is_pinned?: boolean | null;
  poll_options?: string[] | null;
  poll_votes?: Record<string, unknown> | null;
  is_founder_post?: boolean | null;
  audience?: string | null;
  auto_post_type?: string | null;
  auto_post_date?: string | null;
  saves_count?: number | null;
}

export interface SocialProfile {
  user: SocialUser;
  is_following: boolean;
  is_mutual: boolean;
  is_own_profile: boolean;
  posts: SocialPost[];
  stats: {
    avg_calories: number | null;
    avg_protein: number | null;
    avg_carbs: number | null;
    avg_fat: number | null;
    weight_change: number | null;
    weight_logs: { date: string; weight: number }[];
    streak: number;
    consistency_score: number | null;
    preferred_units: string;
    check_in_photos: { id: string; photo_url: string; created_at: string; weight: number | null }[];
    days_tracked: number;
  } | null;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author: { id: string; username: string; name: string | null };
}

export interface SearchUser {
  id: string;
  username: string;
  name: string | null;
  is_following: boolean;
  followers_count: number;
  posts_count: number;
}

export interface CreatePostInput {
  post_type: PostType;
  content?: string;
  image_url?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  weight_value?: number;
  weight_unit?: string;
  streak_days?: number;
  milestone_type?: string;
  is_public?: boolean;
  // v2 fields
  post_type_v2?: PostTypeV2;
  question_title?: string;
  question_details?: string;
  meal_photo_url?: string;
  meal_ingredients?: string[];
  meal_servings?: number;
  meal_calories?: number;
  meal_protein?: number;
  meal_carbs?: number;
  meal_fat?: number;
  meal_recipe_id?: string;
  meal_recipe_data?: any;
  progress_stats?: Record<string, unknown>;
  progress_photo_url?: string;
  is_pinned?: boolean;
  poll_options?: string[];
  is_founder_post?: boolean;
  audience?: string;
  auto_post_type?: string;
  auto_post_date?: string;
  saves_count?: number;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ''}`,
    'Content-Type': 'application/json',
  };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await authHeaders();
  const url = `${BASE}${path}`;
  console.log(`[SocialApi] ${options.method ?? 'GET'} ${url}`);
  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[SocialApi] Error ${res.status} from ${path}:`, text);
    throw new Error(`Request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export async function fetchFeed(
  mode: 'following' | 'discover' = 'following',
  limit = 20,
  offset = 0
): Promise<SocialPost[]> {
  console.log('[SocialApi] fetchFeed — mode:', mode, 'limit:', limit, 'offset:', offset);
  const data = await apiFetch<SocialPost[]>(
    `/social-feed?mode=${mode}&limit=${limit}&offset=${offset}`
  );
  console.log('[SocialApi] fetchFeed — received', data?.length ?? 0, 'posts');
  return data ?? [];
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function fetchProfile(
  userId: string,
  fromDate?: string,
  toDate?: string
): Promise<SocialProfile> {
  console.log('[SocialApi] fetchProfile — user_id:', userId, 'from:', fromDate, 'to:', toDate);
  let path = `/social-profile?user_id=${encodeURIComponent(userId)}`;
  if (fromDate) path += `&from_date=${fromDate}`;
  if (toDate) path += `&to_date=${toDate}`;
  const data = await apiFetch<SocialProfile>(path);
  console.log('[SocialApi] fetchProfile — is_own:', data?.is_own_profile, 'is_mutual:', data?.is_mutual);
  return data;
}

// ─── Follows ──────────────────────────────────────────────────────────────────

export async function followUser(targetUserId: string): Promise<void> {
  console.log('[SocialApi] followUser — target_user_id:', targetUserId);
  await apiFetch('/social-follows', {
    method: 'POST',
    body: JSON.stringify({ target_user_id: targetUserId }),
  });
  console.log('[SocialApi] followUser — success');
}

export async function unfollowUser(targetUserId: string): Promise<void> {
  console.log('[SocialApi] unfollowUser — target_user_id:', targetUserId);
  await apiFetch(`/social-follows?target_user_id=${encodeURIComponent(targetUserId)}`, {
    method: 'DELETE',
  });
  console.log('[SocialApi] unfollowUser — success');
}

export async function fetchFollowing(userId?: string): Promise<SearchUser[]> {
  console.log('[SocialApi] fetchFollowing — user_id:', userId ?? 'self');
  let path = '/social-follows?type=following';
  if (userId) path += `&user_id=${encodeURIComponent(userId)}`;
  const data = await apiFetch<SearchUser[]>(path);
  console.log('[SocialApi] fetchFollowing — received', data?.length ?? 0, 'users');
  return data ?? [];
}

export async function fetchFollowers(userId?: string): Promise<SearchUser[]> {
  console.log('[SocialApi] fetchFollowers — user_id:', userId ?? 'self');
  let path = '/social-follows?type=followers';
  if (userId) path += `&user_id=${encodeURIComponent(userId)}`;
  const data = await apiFetch<SearchUser[]>(path);
  console.log('[SocialApi] fetchFollowers — received', data?.length ?? 0, 'users');
  return data ?? [];
}

// ─── Post Actions ─────────────────────────────────────────────────────────────

export async function toggleLike(
  post_id: string
): Promise<{ liked: boolean; likes_count: number }> {
  console.log('[SocialApi] toggleLike — post_id:', post_id);
  const data = await apiFetch<{ liked: boolean; likes_count: number }>(
    '/social-post-actions/like',
    { method: 'POST', body: JSON.stringify({ post_id }) }
  );
  console.log('[SocialApi] toggleLike — liked:', data.liked, 'count:', data.likes_count);
  return data;
}

export async function addComment(post_id: string, content: string): Promise<Comment> {
  console.log('[SocialApi] addComment — post_id:', post_id, 'content length:', content.length);
  const data = await apiFetch<Comment>('/social-post-actions/comment', {
    method: 'POST',
    body: JSON.stringify({ post_id, content }),
  });
  console.log('[SocialApi] addComment — comment id:', data.id);
  return data;
}

export async function fetchComments(post_id: string): Promise<Comment[]> {
  console.log('[SocialApi] fetchComments — post_id:', post_id);
  const data = await apiFetch<Comment[]>(
    `/social-post-actions/comments?post_id=${encodeURIComponent(post_id)}`
  );
  console.log('[SocialApi] fetchComments — received', data?.length ?? 0, 'comments');
  return data ?? [];
}

export async function createPost(post: CreatePostInput): Promise<SocialPost> {
  console.log('[SocialApi] createPost — type:', post.post_type, 'type_v2:', post.post_type_v2, 'public:', post.is_public);
  const data = await apiFetch<SocialPost>('/social-post-actions/create', {
    method: 'POST',
    body: JSON.stringify(post),
  });
  console.log('[SocialApi] createPost — success, id:', data?.id);
  return data;
}

export async function deletePost(postId: string): Promise<void> {
  console.log('[SocialApi] deletePost — post_id:', postId);
  await apiFetch(`/social-post-actions/delete?post_id=${encodeURIComponent(postId)}`, {
    method: 'DELETE',
  });
  console.log('[SocialApi] deletePost — success');
}

export async function savePost(post_id: string): Promise<{ saved: boolean; saves_count: number }> {
  console.log('[SocialApi] savePost — post_id:', post_id);
  const data = await apiFetch<{ saved: boolean; saves_count: number }>(
    '/social-post-actions/save',
    { method: 'POST', body: JSON.stringify({ post_id }) }
  );
  console.log('[SocialApi] savePost — saved:', data.saved, 'count:', data.saves_count);
  return data;
}

export async function unsavePost(post_id: string): Promise<{ saved: boolean; saves_count: number }> {
  console.log('[SocialApi] unsavePost — post_id:', post_id);
  const data = await apiFetch<{ saved: boolean; saves_count: number }>(
    `/social-post-actions/save?post_id=${encodeURIComponent(post_id)}`,
    { method: 'DELETE' }
  );
  console.log('[SocialApi] unsavePost — saved:', data.saved, 'count:', data.saves_count);
  return data;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchUsers(q: string): Promise<SearchUser[]> {
  console.log('[SocialApi] searchUsers — query:', q);
  const data = await apiFetch<SearchUser[]>(
    `/social-search-users?q=${encodeURIComponent(q)}`
  );
  console.log('[SocialApi] searchUsers — found', data?.length ?? 0, 'users');
  return data ?? [];
}

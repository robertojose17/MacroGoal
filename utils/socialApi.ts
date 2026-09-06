import { supabase } from '@/lib/supabase/client';

const BASE = 'https://esgptfiofoaeguslgvcq.supabase.co/functions/v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectionRole = 'friend' | 'coach' | 'partner';
export type ConnectionStatus = 'pending' | 'accepted' | 'blocked';
export type PostType = 'milestone' | 'streak' | 'photo' | 'custom';

export interface SocialPost {
  id: string;
  user_id: string;
  post_type: PostType;
  content: string | null;
  image_url: string | null;
  weight_value: number | null;
  weight_unit: 'lbs' | 'kg' | null;
  streak_days: number | null;
  milestone_type: string | null;
  is_public: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  author: { id: string; username: string; avatar_url: string | null };
  liked_by_me: boolean;
}

export interface Connection {
  id: string;
  role: ConnectionRole;
  status: ConnectionStatus;
  created_at: string;
  other_user: {
    id: string;
    username: string;
    avatar_url: string | null;
    preferred_units?: string;
  };
}

export interface UserStats {
  daily_weights?: { date: string; weight_lbs: number }[];
  daily_macros?: {
    day: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }[];
  adherence_pct?: number;
  trend_weight?: number;
  avg_calories?: number;
  avg_protein?: number;
  avg_carbs?: number;
  avg_fat?: number;
  streak?: number;
  latest_weight?: number;
  goal_weight?: number;
  start_weight?: number;
  preferred_units?: string;
  username?: string;
  avatar_url?: string | null;
  role?: ConnectionRole;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author: { id: string; username: string; avatar_url: string | null };
}

export interface SearchUser {
  id: string;
  username: string;
  avatar_url: string | null;
  connection_status: ConnectionStatus | null;
}

export interface CreatePostInput {
  post_type: PostType;
  content?: string;
  image_url?: string;
  weight_value?: number;
  weight_unit?: 'lbs' | 'kg';
  streak_days?: number;
  milestone_type?: string;
  is_public?: boolean;
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

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await authHeaders();
  const url = `${BASE}${path}`;
  console.log(`[SocialApi] ${options.method ?? 'GET'} ${url}`);
  const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[SocialApi] Error ${res.status} from ${path}:`, text);
    throw new Error(`Request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export async function fetchFeed(limit = 20, offset = 0): Promise<SocialPost[]> {
  console.log('[SocialApi] fetchFeed — limit:', limit, 'offset:', offset);
  const data = await apiFetch<SocialPost[]>(
    `/social-feed?limit=${limit}&offset=${offset}`
  );
  console.log('[SocialApi] fetchFeed — received', data?.length ?? 0, 'posts');
  return data ?? [];
}

// ─── Connections ──────────────────────────────────────────────────────────────

export async function fetchConnections(): Promise<Connection[]> {
  console.log('[SocialApi] fetchConnections');
  const data = await apiFetch<Connection[]>('/social-connections');
  console.log('[SocialApi] fetchConnections — received', data?.length ?? 0, 'connections');
  return data ?? [];
}

export async function sendConnectionRequest(
  addressee_id: string,
  role: ConnectionRole
): Promise<void> {
  console.log('[SocialApi] sendConnectionRequest — addressee_id:', addressee_id, 'role:', role);
  await apiFetch('/social-connections', {
    method: 'POST',
    body: JSON.stringify({ addressee_id, role }),
  });
  console.log('[SocialApi] sendConnectionRequest — success');
}

export async function acceptConnection(connection_id: string): Promise<void> {
  console.log('[SocialApi] acceptConnection — connection_id:', connection_id);
  await apiFetch('/social-connections', {
    method: 'PATCH',
    body: JSON.stringify({ connection_id, status: 'accepted' }),
  });
  console.log('[SocialApi] acceptConnection — success');
}

export async function declineConnection(connection_id: string): Promise<void> {
  console.log('[SocialApi] declineConnection — connection_id:', connection_id);
  await apiFetch('/social-connections', {
    method: 'PATCH',
    body: JSON.stringify({ connection_id, status: 'blocked' }),
  });
  console.log('[SocialApi] declineConnection — success');
}

export async function removeConnection(connection_id: string): Promise<void> {
  console.log('[SocialApi] removeConnection — connection_id:', connection_id);
  await apiFetch(`/social-connections?connection_id=${connection_id}`, {
    method: 'DELETE',
  });
  console.log('[SocialApi] removeConnection — success');
}

// ─── User Stats ───────────────────────────────────────────────────────────────

export async function fetchUserStats(
  target_user_id: string,
  from_date: string,
  to_date: string
): Promise<UserStats> {
  console.log('[SocialApi] fetchUserStats — user:', target_user_id, 'from:', from_date, 'to:', to_date);
  const data = await apiFetch<UserStats>(
    `/social-user-stats?target_user_id=${target_user_id}&from_date=${from_date}&to_date=${to_date}`
  );
  console.log('[SocialApi] fetchUserStats — received stats for:', data?.username);
  return data;
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

export async function addComment(
  post_id: string,
  content: string
): Promise<Comment> {
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
    `/social-post-actions/comments?post_id=${post_id}`
  );
  console.log('[SocialApi] fetchComments — received', data?.length ?? 0, 'comments');
  return data ?? [];
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

// ─── Create Post ──────────────────────────────────────────────────────────────

export async function createPost(post: CreatePostInput): Promise<void> {
  console.log('[SocialApi] createPost — type:', post.post_type, 'public:', post.is_public);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    console.error('[SocialApi] createPost — no session, aborting');
    throw new Error('Not authenticated');
  }
  const { error } = await supabase.from('social_posts').insert({
    user_id: session.user.id,
    post_type: post.post_type,
    content: post.content ?? null,
    image_url: post.image_url ?? null,
    weight_value: post.weight_value ?? null,
    weight_unit: post.weight_unit ?? null,
    streak_days: post.streak_days ?? null,
    milestone_type: post.milestone_type ?? null,
    is_public: post.is_public ?? true,
  });
  if (error) {
    console.error('[SocialApi] createPost — supabase error:', error.message);
    throw error;
  }
  console.log('[SocialApi] createPost — success');
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const url = new URL(req.url);
    const targetUserId = url.searchParams.get('user_id');
    if (!targetUserId) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: corsHeaders });

    const fromDate = url.searchParams.get('from_date') ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const toDate = url.searchParams.get('to_date') ?? new Date().toISOString().split('T')[0];

    // Get target user info — include user_type for premium badge
    const { data: targetUser } = await supabase
      .from('users')
      .select('id, username, name, avatar_url, user_type')
      .eq('id', targetUserId)
      .single();

    // Get social profile
    const { data: socialProfile } = await supabase
      .from('social_profiles')
      .select('*')
      .eq('user_id', targetUserId)
      .single();

    // Check follow relationships
    const [{ data: iFollowThem }, { data: theyFollowMe }] = await Promise.all([
      supabase.from('social_follows').select('id').eq('follower_id', user.id).eq('following_id', targetUserId).maybeSingle(),
      supabase.from('social_follows').select('id').eq('follower_id', targetUserId).eq('following_id', user.id).maybeSingle(),
    ]);

    const isMutual = !!iFollowThem && !!theyFollowMe;
    const isOwnProfile = user.id === targetUserId;

    // Get posts (public only unless mutual or own profile)
    const postsQuery = supabase
      .from('social_posts')
      .select('id, user_id, post_type, content, image_url, calories, protein, carbs, fat, weight_value, weight_unit, streak_days, milestone_type, is_public, likes_count, comments_count, created_at')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!isOwnProfile && !isMutual) {
      postsQuery.eq('is_public', true);
    }

    const { data: posts } = await postsQuery;

    // Enrich posts with liked_by_me and author (including user_type)
    const postIds = (posts ?? []).map((p: any) => p.id);
    let likedSet = new Set<string>();
    if (postIds.length > 0) {
      const { data: likes } = await supabase
        .from('social_post_likes')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', postIds);
      likedSet = new Set((likes ?? []).map((l: any) => l.post_id));
    }

    const enrichedPosts = (posts ?? []).map((p: any) => ({
      ...p,
      liked_by_me: likedSet.has(p.id),
      author: {
        id: targetUser?.id,
        username: targetUser?.username,
        name: targetUser?.name,
        avatar_url: targetUser?.avatar_url ?? null,
        user_type: targetUser?.user_type ?? null,
        is_premium: targetUser?.user_type === 'premium',
      },
    }));

    // Stats — only for mutual follows or own profile
    let stats = null;
    if (isMutual || isOwnProfile) {
      // Nutrition: join meal_items -> meals to get user_id
      const { data: nutritionData } = await supabase
        .from('meal_items')
        .select('calories, protein, carbs, fats, logged_at, meal:meals!meal_items_meal_id_fkey(user_id, date)')
        .gte('logged_at', fromDate)
        .lte('logged_at', toDate + 'T23:59:59');

      // Filter to target user's meals
      const userNutrition = (nutritionData ?? []).filter((item: any) => item.meal?.user_id === targetUserId);

      // Group by day and compute daily totals
      const byDay: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {};
      for (const item of userNutrition) {
        const day = item.logged_at?.split('T')[0] ?? item.meal?.date ?? '';
        if (!day) continue;
        if (!byDay[day]) byDay[day] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        byDay[day].calories += item.calories ?? 0;
        byDay[day].protein += item.protein ?? 0;
        byDay[day].carbs += item.carbs ?? 0;
        byDay[day].fat += item.fats ?? 0;
      }

      const days = Object.keys(byDay);
      const avgCalories = days.length > 0 ? days.reduce((s, d) => s + byDay[d].calories, 0) / days.length : null;
      const avgProtein = days.length > 0 ? days.reduce((s, d) => s + byDay[d].protein, 0) / days.length : null;
      const avgCarbs = days.length > 0 ? days.reduce((s, d) => s + byDay[d].carbs, 0) / days.length : null;
      const avgFat = days.length > 0 ? days.reduce((s, d) => s + byDay[d].fat, 0) / days.length : null;

      // Raw weight history is private to its owner.
      // A voluntary community post does not grant access to the full history.
      const { data: weightLogs } = isOwnProfile
        ? await supabase
            .from('check_ins')
            .select('weight, date')
            .eq('user_id', targetUserId)
            .not('weight', 'is', null)
            .gte('date', fromDate)
            .lte('date', toDate)
            .order('date', { ascending: true })
        : { data: [] };

      const firstWeight = weightLogs?.[0]?.weight ?? null;
      const lastWeight = weightLogs?.[weightLogs.length - 1]?.weight ?? null;
      const weightChange = firstWeight && lastWeight ? lastWeight - firstWeight : null;

      // User stats from users table
      const { data: userRow } = await supabase
        .from('users')
        .select('preferred_units, weight_unit, last_streak_value')
        .eq('id', targetUserId)
        .single();

      // The private check-in gallery is available only to its owner.
      // Explicit community posts are returned separately above.
      const { data: checkInPhotos } = isOwnProfile
        ? await supabase
            .from('check_ins')
            .select('id, photo_url, date, weight')
            .eq('user_id', targetUserId)
            .not('photo_url', 'is', null)
            .order('date', { ascending: false })
            .limit(12)
        : { data: [] };

      stats = {
        avg_calories: avgCalories,
        avg_protein: avgProtein,
        avg_carbs: avgCarbs,
        avg_fat: avgFat,
        weight_change: weightChange,
        weight_logs: (weightLogs ?? []).map((w: any) => ({ date: w.date, weight: w.weight })),
        streak: userRow?.last_streak_value ?? 0,
        preferred_units: userRow?.preferred_units ?? userRow?.weight_unit ?? 'imperial',
        check_in_photos: checkInPhotos ?? [],
        days_tracked: days.length,
      };
    }

    return new Response(JSON.stringify({
      user: {
        id: targetUser?.id,
        username: targetUser?.username,
        name: targetUser?.name,
        avatar_url: targetUser?.avatar_url ?? null,
        user_type: targetUser?.user_type ?? null,
        is_premium: targetUser?.user_type === 'premium',
        bio: socialProfile?.bio ?? null,
        is_private: socialProfile?.is_private ?? false,
        followers_count: socialProfile?.followers_count ?? 0,
        following_count: socialProfile?.following_count ?? 0,
        posts_count: socialProfile?.posts_count ?? 0,
      },
      is_following: !!iFollowThem,
      is_mutual: isMutual,
      is_own_profile: isOwnProfile,
      posts: enrichedPosts,
      stats,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('social-profile error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});

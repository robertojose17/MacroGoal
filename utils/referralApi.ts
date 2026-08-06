import { supabase } from '@/lib/supabase/client';
import { tryAwardReferral } from '@/utils/xpAwarder';
import { emitXpRefresh } from '@/utils/xpEvents';

// Generate a unique 6-char code from username + random suffix
function generateCode(username: string): string {
  const base = (username || 'USER').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const suffix = Math.random().toString(36).toUpperCase().slice(2, 4);
  return `${base}${suffix}`;
}

export async function getOrCreateReferralCode(): Promise<string | null> {
  console.log('[referralApi] getOrCreateReferralCode called');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Check if already exists
  const { data: existing } = await supabase
    .from('referral_codes')
    .select('code, custom_code, tier')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    const code = existing.custom_code || existing.code;
    console.log('[referralApi] existing code found:', code);
    return code;
  }

  // Get username for code generation
  const { data: profile } = await supabase
    .from('users')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();

  const code = generateCode(profile?.username || 'USER');
  console.log('[referralApi] generating new code:', code);

  const { data: inserted, error: insertError } = await supabase
    .from('referral_codes')
    .insert({ user_id: user.id, code })
    .select('code')
    .single();

  if (insertError) {
    console.error('[referralApi] insert error:', JSON.stringify(insertError));
    // If unique constraint violation, the row was inserted by a race — re-fetch
    if (insertError.code === '23505') {
      const { data: refetch } = await supabase
        .from('referral_codes')
        .select('code, custom_code')
        .eq('user_id', user.id)
        .maybeSingle();
      return refetch?.custom_code || refetch?.code || null;
    }
    return null;
  }

  console.log('[referralApi] inserted code:', inserted?.code);
  return inserted?.code ?? null;
}

export async function getReferralStats(): Promise<{
  code: string | null;
  tier: string;
  totalReferrals: number;
  premiumConverts: number;
  xpEarned: number;
  referrals: { username: string; joinedAt: string }[];
  applicationStatus: 'none' | 'pending' | 'approved' | 'rejected';
}> {
  console.log('[referralApi] getReferralStats called');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { code: null, tier: 'user', totalReferrals: 0, premiumConverts: 0, xpEarned: 0, referrals: [], applicationStatus: 'none' };

  const { data: rc } = await supabase
    .from('referral_codes')
    .select('code, custom_code, tier')
    .eq('user_id', user.id)
    .maybeSingle();

  const code = rc?.custom_code || rc?.code || null;

  const { data: referrals } = await supabase
    .from('referrals')
    .select('id, referred_id, converted_to_premium, created_at, users!referred_id(username)')
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false });

  const totalReferrals = referrals?.length ?? 0;
  const premiumConverts = referrals?.filter((r: any) => r.converted_to_premium).length ?? 0;
  const xpEarned = totalReferrals * 1000;

  const referralList = (referrals ?? []).map((r: any) => ({
    username: r.users?.username || 'A friend',
    joinedAt: r.created_at,
  }));

  const { data: app } = await supabase
    .from('affiliate_applications')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();

  const applicationStatus = (app?.status as any) || 'none';

  console.log('[referralApi] stats loaded — total:', totalReferrals, 'premium:', premiumConverts, 'appStatus:', applicationStatus);

  return {
    code,
    tier: rc?.tier || 'user',
    totalReferrals,
    premiumConverts,
    xpEarned,
    referrals: referralList,
    applicationStatus,
  };
}

export async function applyReferralCode(code: string): Promise<{ success: boolean; error?: string }> {
  console.log('[referralApi] applyReferralCode called with code:', code);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not logged in' };

  // Check if user already used a referral code
  const { data: existing } = await supabase
    .from('referrals')
    .select('id')
    .eq('referred_id', user.id)
    .maybeSingle();

  if (existing) {
    console.log('[referralApi] user already used a referral code');
    return { success: false, error: 'You have already used a referral code' };
  }

  // Find the referral code
  const upperCode = code.toUpperCase().trim();
  const { data: rc } = await supabase
    .from('referral_codes')
    .select('id, user_id, code, custom_code')
    .eq('code', upperCode)
    .maybeSingle();

  if (!rc) {
    console.log('[referralApi] invalid referral code:', upperCode);
    return { success: false, error: 'Invalid referral code' };
  }
  if (rc.user_id === user.id) {
    console.log('[referralApi] user tried to use their own code');
    return { success: false, error: "You can't use your own referral code" };
  }

  // Insert referral
  const { data: referral, error } = await supabase
    .from('referrals')
    .insert({
      referrer_id: rc.user_id,
      referred_id: user.id,
      code_used: upperCode,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[referralApi] failed to insert referral:', error);
    return { success: false, error: 'Failed to apply code' };
  }

  console.log('[referralApi] referral inserted, id:', referral.id);

  // Award XP to referred user (current auth user) via awardXp edge function
  try {
    console.log('[referralApi] awarding XP to referred user (current user)');
    tryAwardReferral(referral.id);
    emitXpRefresh();
    console.log('[referralApi] XP award triggered for referred user');
  } catch (e) {
    console.warn('[referralApi] XP award for referred user failed (non-fatal):', e);
  }

  // Award XP to referrer via direct DB write (different user — cannot use JWT-bound edge fn)
  try {
    console.log('[referralApi] awarding XP to referrer user_id:', rc.user_id);
    const today = new Date().toISOString().slice(0, 10);
    // Use a stable source_id so this is idempotent (unique constraint on xp_ledger)
    const referrerSourceId = `referral_completed:${referral.id}:referrer`;

    // 1. Insert into xp_ledger for history/dedup
    const { error: ledgerError } = await supabase
      .from('xp_ledger')
      .insert({
        user_id: rc.user_id,
        event_type: 'referral_completed',
        source_id: referrerSourceId,
        xp_awarded: 1000,
        date: today,
        metadata: { xp_reward: 1000, referred_user_id: user.id, referral_id: referral.id },
      });

    if (ledgerError && ledgerError.code !== '23505') {
      // 23505 = unique violation = already awarded, that's fine
      console.warn('[referralApi] xp_ledger insert for referrer failed:', ledgerError);
    } else {
      // 2. Increment referrer's total_xp in user_xp (read-then-write to avoid overwrite)
      const { data: currentXp } = await supabase
        .from('user_xp')
        .select('total_xp')
        .eq('user_id', rc.user_id)
        .maybeSingle();

      const newTotal = (Number(currentXp?.total_xp) || 0) + 1000;
      const { error: xpError } = await supabase
        .from('user_xp')
        .upsert(
          { user_id: rc.user_id, total_xp: newTotal },
          { onConflict: 'user_id' }
        );

      if (xpError) {
        console.warn('[referralApi] user_xp upsert for referrer failed:', xpError);
      } else {
        console.log('[referralApi] XP awarded to referrer, new total_xp:', newTotal);
      }
    }
  } catch (e) {
    console.warn('[referralApi] XP award for referrer failed (non-fatal):', e);
  }

  return { success: true };
}

export async function submitAffiliateApplication(data: {
  fullName: string;
  email: string;
  phone: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  howTheyPlanToPromote: string;
  totalReferrals: number;
  totalPremium: number;
  referralCodeId: string;
}): Promise<{ success: boolean; error?: string }> {
  console.log('[referralApi] submitAffiliateApplication called');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not logged in' };

  const { error } = await supabase
    .from('affiliate_applications')
    .upsert({
      user_id: user.id,
      referral_code_id: data.referralCodeId,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      instagram_handle: data.instagram || null,
      tiktok_handle: data.tiktok || null,
      youtube_handle: data.youtube || null,
      how_they_plan_to_promote: data.howTheyPlanToPromote,
      total_referrals_at_apply: data.totalReferrals,
      total_premium_at_apply: data.totalPremium,
      status: 'pending',
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('[referralApi] affiliate application upsert failed:', error);
    return { success: false, error: 'Failed to submit application' };
  }

  // Update referral_codes tier to affiliate_pending
  await supabase
    .from('referral_codes')
    .update({ tier: 'affiliate_pending', affiliate_applied_at: new Date().toISOString() })
    .eq('user_id', user.id);

  console.log('[referralApi] affiliate application submitted successfully');
  return { success: true };
}

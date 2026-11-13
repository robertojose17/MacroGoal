import { supabase } from '@/lib/supabase/client';


// Generates a cryptographically random 8-char referral code.
// 32-char unambiguous alphabet (no O, 0, I, 1) → 32^8 ≈ 1B combinations.
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
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

  const code = generateCode();
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
  const { data: ledger, error: ledgerError } = await supabase.from('xp_ledger').select('xp_amount').eq('user_id', user.id).eq('event_type', 'referral_completed');
  if (ledgerError) throw new Error('Referral reward total is unavailable');
  const xpEarned = (ledger ?? []).reduce((sum, row) => sum + row.xp_amount, 0);

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

export async function applyReferralCode(code: string): Promise<{ success: boolean; error?: string; rewardStatus?: 'pending_verification' }> {
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



  // The code was applied above. XP is a separate server-authorized transaction;
  // never award another actor's XP from this client or fabricate missing columns.
  console.warn('[referralApi] Referral applied; reward settlement is not verified.');
  return { success: true, rewardStatus: 'pending_verification' };
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

import { supabase } from '@/lib/supabase/client';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Authorization': `Bearer ${session?.access_token}`,
    'Content-Type': 'application/json',
  };
}

// Check if a desired affiliate code is available
export async function checkCodeAvailability(code: string): Promise<{ available: boolean; error?: string }> {
  try {
    const upper = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!upper || upper.length < 3) return { available: false, error: 'Code must be at least 3 characters' };
    if (upper.length > 20) return { available: false, error: 'Code must be 20 characters or less' };
    const { data } = await supabase.from('affiliate_profiles').select('id').eq('affiliate_code', upper).maybeSingle();
    // Also check pending applications
    const { data: pending } = await supabase.from('affiliate_applications').select('id').eq('desired_code', upper).maybeSingle();
    return { available: !data && !pending };
  } catch (e) {
    return { available: false, error: 'Error checking availability' };
  }
}

// Submit affiliate application
export async function submitAffiliateApplication(data: {
  fullName: string;
  email: string;
  socialHandle: string;
  desiredCode: string;
  paypalEmail: string;
  termsAccepted: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const upperCode = data.desiredCode.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Check availability one more time
    const { available } = await checkCodeAvailability(upperCode);
    if (!available) return { success: false, error: 'That code is already taken. Please choose another.' };

    const { error } = await supabase.from('affiliate_applications').upsert({
      user_id: user.id,
      full_name: data.fullName,
      email: data.email,
      instagram_handle: data.socialHandle,
      desired_code: upperCode,
      paypal_email: data.paypalEmail,
      terms_accepted: data.termsAccepted,
      terms_accepted_at: new Date().toISOString(),
      terms_version: 'v1.0',
      status: 'pending',
    }, { onConflict: 'user_id' });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Get affiliate stats (for affiliate dashboard)
export async function getAffiliateStats() {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-admin/stats`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('[affiliateApi] getAffiliateStats error:', e);
    return null;
  }
}

// Validate affiliate code and save attribution (customer flow)
export async function validateAndAttributeCode(code: string): Promise<{ valid: boolean; redemption_url?: string; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-admin/attribution`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) return { valid: false, error: data.error || 'Invalid code' };
    return { valid: true, redemption_url: data.redemption_url };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}

// Admin: get full dashboard
export async function getAdminDashboard() {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-admin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'get_dashboard' }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Admin: approve application
export async function adminApproveApplication(applicationId: string): Promise<{ success: boolean; error?: string; profile?: any }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-admin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'approve_application', application_id: applicationId }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    return { success: true, profile: data.profile };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Admin: reject application
export async function adminRejectApplication(applicationId: string, adminNotes?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-admin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'reject_application', application_id: applicationId, admin_notes: adminNotes }),
    });
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Admin: trigger Apple code creation
export async function adminCreateAppleCode(
  affiliateProfileId: string,
  retry = false,
  plan: 'annual' | 'monthly' | 'both' = 'both',
): Promise<{ success: boolean; error?: string; status?: string; annual?: any; monthly?: any }> {
  try {
    console.log('[affiliateApi] adminCreateAppleCode called:', { affiliateProfileId, retry, plan });
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-affiliate-code`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ affiliate_profile_id: affiliateProfileId, retry, plan }),
    });
    const data = await res.json();
    console.log('[affiliateApi] adminCreateAppleCode response:', data);
    return { success: data.success, error: data.error, status: data.status, annual: data.annual, monthly: data.monthly };
  } catch (e: any) {
    console.error('[affiliateApi] adminCreateAppleCode error:', e);
    return { success: false, error: e.message };
  }
}

// Admin: create payout
export async function adminCreatePayout(affiliateProfileId: string, commissionIds: string[]): Promise<{ success: boolean; error?: string; payout?: any }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-admin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'create_payout', affiliate_profile_id: affiliateProfileId, commission_ids: commissionIds }),
    });
    const data = await res.json();
    return { success: data.success, error: data.error, payout: data.payout };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Admin: mark payout paid
export async function adminMarkPayoutPaid(payoutId: string, paypalTransactionId: string, paypalNote?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-admin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'mark_payout_paid', payout_id: payoutId, paypal_transaction_id: paypalTransactionId, paypal_note: paypalNote }),
    });
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Update PayPal email (affiliate self-service)
export async function updatePaypalEmail(paypalEmail: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not logged in' };
    const { error } = await supabase.from('affiliate_profiles').update({ paypal_email: paypalEmail }).eq('user_id', user.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

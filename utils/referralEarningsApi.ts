import { supabase } from '@/lib/supabase/client';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Authorization': `Bearer ${session?.access_token}`,
    'Content-Type': 'application/json',
  };
}

export interface ReferralEarningsStats {
  earnings_pending: number;
  earnings_available: number;
  earnings_paid: number;
  earnings_total: number;
  premium_converts: number;
  paypal_email: string | null;
  recent_earnings: {
    referred_username: string;
    commission_amount: number;
    status: string;
    created_at: string;
    product_id: string;
  }[];
}

export async function getReferralEarningsStats(): Promise<ReferralEarningsStats | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/referral-stats`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('[referralEarningsApi] getReferralEarningsStats error:', e);
    return null;
  }
}

export async function savePaypalEmail(paypalEmail: string): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/referral-paypal`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ paypal_email: paypalEmail }),
    });
    if (!res.ok) return { success: false, error: 'Failed to save PayPal email' };
    return { success: true };
  } catch (e) {
    console.error('[referralEarningsApi] savePaypalEmail error:', e);
    return { success: false, error: 'Network error' };
  }
}

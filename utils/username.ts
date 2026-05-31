
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';

export interface UsernameAvailabilityResult {
  available: boolean;
  reason?: 'invalid_format' | 'reserved' | 'taken';
}

export interface SetUsernameResult {
  ok: boolean;
  username?: string;
  reason?: 'taken' | 'invalid_format' | 'reserved';
}

async function getBearerToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function checkUsernameAvailability(username: string): Promise<UsernameAvailabilityResult> {
  console.log('[Username] Checking availability for:', username);
  try {
    const token = await getBearerToken();
    if (!token) {
      console.warn('[Username] No auth token available for availability check');
      return { available: false, reason: 'taken' };
    }

    const response = await fetch(
      `${SUPABASE_PROJECT_URL}/functions/v1/check-username-availability`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.warn('[Username] check-username-availability returned', response.status, text);
      // Treat non-2xx as "couldn't verify" — surface as taken so user can retry
      return { available: false, reason: 'taken' };
    }

    const data = await response.json();
    console.log('[Username] Availability result:', data);
    return {
      available: data.available ?? false,
      reason: data.reason,
    };
  } catch (error) {
    console.error('[Username] Error checking availability:', error);
    // Network error — treat as "couldn't verify"
    return { available: false, reason: 'taken' };
  }
}

export async function setUsername(username: string): Promise<SetUsernameResult> {
  console.log('[Username] Setting username to:', username);
  try {
    const token = await getBearerToken();
    if (!token) {
      console.warn('[Username] No auth token available for set-username');
      return { ok: false, reason: 'taken' };
    }

    const response = await fetch(
      `${SUPABASE_PROJECT_URL}/functions/v1/set-username`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.warn('[Username] set-username returned', response.status, text);
      // Try to parse JSON error body
      try {
        const errData = JSON.parse(text);
        return { ok: false, reason: errData.reason ?? 'taken' };
      } catch {
        return { ok: false, reason: 'taken' };
      }
    }

    const data = await response.json();
    console.log('[Username] Set username result:', data);
    return {
      ok: true,
      username: data.username ?? username,
    };
  } catch (error) {
    console.error('[Username] Error setting username:', error);
    return { ok: false, reason: 'taken' };
  }
}

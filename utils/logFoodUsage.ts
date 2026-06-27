
import { supabase, SUPABASE_PROJECT_URL, supabasePublicKey } from '@/lib/supabase/client';

export type FoodLogSource = 'search' | 'barcode' | 'ai' | 'planner' | 'chatbot';

/**
 * Fire-and-forget call to log-food-usage edge function.
 * Never blocks the UI, never throws, silently skips if foodItemId is falsy.
 */
export function logFoodUsage(foodItemId: string | undefined | null, source: FoodLogSource): void {
  if (!foodItemId) return;
  console.log('[logFoodUsage] Logging food usage:', { foodItemId, source });
  supabase.auth.getSession().then(({ data }) => {
    const userId = data?.session?.user?.id;
    fetch(`${SUPABASE_PROJECT_URL}/functions/v1/log-food-usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabasePublicKey}`,
      },
      body: JSON.stringify({ food_item_id: foodItemId, user_id: userId, source }),
    }).then(res => {
      console.log('[logFoodUsage] Response status:', res.status, 'source:', source);
    }).catch(() => {}); // fire-and-forget, never throw
  }).catch(() => {});
}

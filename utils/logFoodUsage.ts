
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZ3B0ZmlvZm9hZWd1c2xndmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDI4NjcsImV4cCI6MjA3OTExODg2N30.iC4P3lp4fJHLsYNWBwHwFwGP-WZuJONETOYd2q1lQWA';

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
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ food_item_id: foodItemId, user_id: userId, source }),
    }).then(res => {
      console.log('[logFoodUsage] Response status:', res.status, 'source:', source);
    }).catch(() => {}); // fire-and-forget, never throw
  }).catch(() => {});
}


import { supabase } from '@/lib/supabase/client';

export interface TemplatePlan {
  id: string;
  name: string;
  description: string;
  emoji: string;
  goal_type: 'cut' | 'bulk' | 'maintain' | string;
  diet_type: string;
  is_published: boolean;
  created_at: string;
}

export interface ProteinOption {
  id: string;
  protein_name: string;
  emoji: string;
}

export interface TemplateMealItem {
  id: string;
  food_name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  protein_role: string | null;
}

// Legacy alias kept for createMealPlanFromTemplate compatibility
export type TemplateItem = TemplateMealItem;

export interface TemplatePlanDetail {
  id: string;
  name: string;
  description: string;
  emoji: string;
  goal_type: string;
  selected_protein: string;
  protein_options: { id: string; protein_name: string; emoji: string }[];
  user_calories_goal: number;
  user_protein_goal: number;
  user_carbs_goal: number;
  user_fats_goal: number;
  day: {
    id: string;
    day_number: number;
    meals: {
      breakfast: TemplateMealItem[];
      lunch: TemplateMealItem[];
      dinner: TemplateMealItem[];
      snack: TemplateMealItem[];
    };
  };
}

export async function listTemplatePlans(): Promise<TemplatePlan[]> {
  console.log('[templatePlansApi] Fetching published template plans');
  const { data, error } = await supabase
    .from('template_meal_plans')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[templatePlansApi] Error fetching template plans:', error.message);
    throw new Error(error.message);
  }
  console.log('[templatePlansApi] Template plans loaded:', data?.length ?? 0);
  return data || [];
}

export async function getTemplatePlanDetail(
  templateId: string,
  userId: string,
  preferredProtein?: string
): Promise<TemplatePlanDetail | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const { data, error } = await supabase.functions.invoke('get-template-plan', {
      body: { template_id: templateId, user_id: userId, preferred_protein: preferredProtein },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (error) {
      console.error('[templatePlansApi] get-template-plan error:', error);
      return null;
    }

    console.log('[templatePlansApi] raw response:', JSON.stringify(data).slice(0, 200));
    console.log('[templatePlansApi] Template plan detail loaded:', data?.name, 'protein:', data?.selected_protein);
    return data as TemplatePlanDetail;
  } catch (e) {
    console.error('[templatePlansApi] getTemplatePlanDetail exception:', e);
    return null;
  }
}

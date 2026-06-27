
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
  protein_name: string;
  emoji: string;
  sort_order: number;
}

export interface TemplateItem {
  food_name: string;
  scaled_calories: number;
  scaled_protein: number;
  scaled_carbs: number;
  scaled_fats: number;
  scaled_grams: number;
  is_protein?: boolean;
}

export interface TemplateDay {
  day_number: number;
  meals: {
    breakfast: TemplateItem[];
    lunch: TemplateItem[];
    dinner: TemplateItem[];
    snack: TemplateItem[];
  };
}

export interface TemplatePlanDetail {
  id: string;
  name: string;
  description: string;
  emoji: string;
  goal_type: string;
  is_template: true;
  selected_protein: string;
  protein_options: ProteinOption[];
  user_calories_goal: number;
  user_protein_goal: number;
  user_carbs_goal: number;
  user_fats_goal: number;
  day: {
    day_number: number;
    meals: {
      breakfast: TemplateItem[];
      lunch: TemplateItem[];
      dinner: TemplateItem[];
      snack: TemplateItem[];
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

    console.log('[templatePlansApi] Template plan detail loaded:', data?.template?.name, 'protein:', preferredProtein);
    return data as TemplatePlanDetail;
  } catch (e) {
    console.error('[templatePlansApi] getTemplatePlanDetail exception:', e);
    return null;
  }
}

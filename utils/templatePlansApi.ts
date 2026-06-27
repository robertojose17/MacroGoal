
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

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZ3B0ZmlvZm9hZWd1c2xndmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDI4NjcsImV4cCI6MjA3OTExODg2N30.iC4P3lp4fJHLsYNWBwHwFwGP-WZuJONETOYd2q1lQWA";
const SUPABASE_URL = "https://esgptfiofoaeguslgvcq.supabase.co";

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

export async function getTemplatePlanDetail(templateId: string, preferredProtein?: string): Promise<TemplatePlanDetail> {
  console.log('[templatePlansApi] Fetching template plan detail:', templateId, 'protein:', preferredProtein ?? 'Chicken');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/get-template-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      template_id: templateId,
      user_id: user.id,
      preferred_protein: preferredProtein || 'Chicken',
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    console.error('[templatePlansApi] get-template-plan error:', response.status, err.slice(0, 200));
    throw new Error(err);
  }
  const data = await response.json();
  console.log('[templatePlansApi] Template plan detail loaded:', data.name, 'protein:', data.selected_protein);
  return data;
}

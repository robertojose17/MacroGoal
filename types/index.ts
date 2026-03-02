
export type UserType = 'guest' | 'free' | 'premium';
export type Sex = 'male' | 'female';
export type GoalType = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type MacroPreference = 'high_protein' | 'balanced' | 'custom';
export type UnitSystem = 'metric' | 'imperial';

export interface User {
  id: string;
  email?: string;
  user_type: UserType;
  sex: Sex;
  dob: string;
  height: number; // cm (always stored in cm)
  weight: number; // kg (always stored in kg)
  activity_level: ActivityLevel;
  preferred_units?: UnitSystem;
  goal_weight?: number; // kg (always stored in kg)
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  goal_type: GoalType;
  daily_calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  fiber_g: number;
  is_active: boolean;
  loss_rate_lbs_per_week?: number;
  start_date?: string; // ISO date string
  created_at: string;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  serving_amount: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  barcode?: string;
  user_created: boolean;
  is_favorite?: boolean;
  fdc_id?: number; // FoodData Central ID
  data_type?: string; // FDC data type: 'Branded', 'Foundation', 'Survey (FNDDS)', 'SR Legacy'
  last_serving_description?: string; // Last used serving description for recent foods
}

export interface Meal {
  id: string;
  user_id: string;
  date: string;
  meal_type: MealType;
}

export interface MealItem {
  id: string;
  meal_id: string;
  food_id: string;
  food?: Food;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  serving_description?: string; // e.g., "1 cup (240 g)", "2 slices (28 g)", "35 g"
  grams?: number; // actual grams used for this entry
}

export interface DailySummary {
  id: string;
  user_id: string;
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fats: number;
  total_fiber: number;
  water_ml: number;
  weight?: number;
}

export interface WeightLog {
  user_id: string;
  date: string;
  weight: number;
}

export interface Habit {
  user_id: string;
  date: string;
  water_done: boolean;
  calories_target_hit: boolean;
  protein_hit: boolean;
}

export interface OnboardingData {
  sex?: Sex;
  age?: number;
  height?: number; // Always stored in cm
  weight?: number; // Always stored in kg
  activity_level?: ActivityLevel;
  goal_type?: GoalType;
  goal_intensity?: number; // 0.5 = mild, 1 = moderate, 1.5 = aggressive
  macro_preference?: MacroPreference;
  custom_protein?: number;
  custom_carbs?: number;
  custom_fats?: number;
  preferred_units?: UnitSystem;
  target_weight?: number;
}

export interface SavedMeal {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface SavedMealItem {
  id: string;
  saved_meal_id: string;
  food_id: string;
  serving_amount: number;
  serving_unit: string;
  servings_count: number;
  created_at: string;
}

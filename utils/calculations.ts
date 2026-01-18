
import { Sex, GoalType, ActivityLevel, MacroPreference, OnboardingData } from '@/types';

export function calculateAge(dob: string): number {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Calculate BMR using Mifflin-St Jeor Equation
 * @param weight - Weight in kg
 * @param height - Height in cm
 * @param age - Age in years
 * @param sex - Sex (male/female)
 * @returns BMR in calories
 */
export function calculateBMR(weight: number, height: number, age: number, sex: Sex): number {
  // Mifflin-St Jeor Equation (expects weight in kg, height in cm)
  if (sex === 'male') {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
}

export function getActivityMultiplier(activity: ActivityLevel): number {
  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };
  return multipliers[activity];
}

export function calculateTDEE(bmr: number, activity: ActivityLevel): number {
  return Math.round(bmr * getActivityMultiplier(activity));
}

/**
 * Calculate daily calorie deficit based on weight loss rate
 * @param lossRateLbsPerWeek - Desired weight loss rate in lbs per week (0.5, 1.0, 1.5, 2.0)
 * @returns Daily calorie deficit
 */
export function calculateDeficitFromLossRate(lossRateLbsPerWeek: number): number {
  // 1 lb of fat ≈ 3500 kcal
  // Daily deficit = (lbs per week * 3500) / 7 days
  return Math.round((lossRateLbsPerWeek * 3500) / 7);
}

/**
 * Calculate target calories based on goal type and weight loss rate
 * @param tdee - Total Daily Energy Expenditure
 * @param goalType - Goal type (lose/maintain/gain)
 * @param lossRateLbsPerWeek - Weight loss rate in lbs per week (only used for 'lose' goal)
 * @returns Target daily calories
 */
export function calculateTargetCalories(
  tdee: number,
  goalType: GoalType,
  lossRateLbsPerWeek?: number
): number {
  if (goalType === 'lose') {
    if (!lossRateLbsPerWeek) {
      // Default to 1 lb per week if not specified
      lossRateLbsPerWeek = 1.0;
    }
    const deficit = calculateDeficitFromLossRate(lossRateLbsPerWeek);
    return Math.round(tdee - deficit);
  } else if (goalType === 'gain') {
    // For weight gain, use a moderate surplus (not implemented yet, keeping old logic)
    return Math.round(tdee + 300);
  }
  // Maintain weight
  return tdee;
}

export function calculateMacros(
  targetCalories: number,
  weight: number,
  preference: MacroPreference,
  customProtein?: number,
  customCarbs?: number,
  customFats?: number
) {
  if (preference === 'custom' && customProtein && customCarbs && customFats) {
    return {
      protein: customProtein,
      carbs: customCarbs,
      fats: customFats,
      fiber: Math.round(targetCalories / 1000 * 14),
    };
  }

  let proteinGPerKg = 2.0;
  let fatPercentage = 0.25;

  if (preference === 'high_protein') {
    proteinGPerKg = 2.2;
    fatPercentage = 0.25;
  } else if (preference === 'balanced') {
    proteinGPerKg = 1.8;
    fatPercentage = 0.30;
  }

  const protein = Math.round(weight * proteinGPerKg);
  const proteinCalories = protein * 4;

  const fats = Math.round((targetCalories * fatPercentage) / 9);
  const fatCalories = fats * 9;

  const remainingCalories = targetCalories - proteinCalories - fatCalories;
  const carbs = Math.round(remainingCalories / 4);

  const fiber = Math.round(targetCalories / 1000 * 14);

  return { protein, carbs, fats, fiber };
}

/**
 * Calculate macros based on preset percentages
 * @param targetCalories - Target daily calories
 * @param weight - Weight in kg
 * @param preset - Macro preset name
 * @returns Macro breakdown in grams
 */
export function calculateMacrosWithPreset(
  targetCalories: number,
  weight: number,
  preset: 'balanced' | 'high_protein' | 'low_carb' | 'keto'
) {
  let proteinPercent = 0.30;
  let carbsPercent = 0.40;
  let fatsPercent = 0.30;

  switch (preset) {
    case 'balanced':
      proteinPercent = 0.30;
      carbsPercent = 0.40;
      fatsPercent = 0.30;
      break;
    case 'high_protein':
      proteinPercent = 0.40;
      carbsPercent = 0.35;
      fatsPercent = 0.25;
      break;
    case 'low_carb':
      proteinPercent = 0.35;
      carbsPercent = 0.25;
      fatsPercent = 0.40;
      break;
    case 'keto':
      proteinPercent = 0.25;
      carbsPercent = 0.05;
      fatsPercent = 0.70;
      break;
  }

  const protein = Math.round((targetCalories * proteinPercent) / 4);
  const carbs = Math.round((targetCalories * carbsPercent) / 4);
  const fats = Math.round((targetCalories * fatsPercent) / 9);
  const fiber = Math.round(targetCalories / 1000 * 14);

  return { protein, carbs, fats, fiber };
}

/**
 * Calculate goal from onboarding data
 * Note: Onboarding data should already have weight in kg and height in cm
 * @param data - OnboardingData with weight in kg and height in cm
 */
export function calculateGoalFromOnboarding(data: OnboardingData) {
  if (!data.age || !data.height || !data.weight || !data.sex || !data.activity_level || !data.goal_type) {
    throw new Error('Missing required onboarding data');
  }

  console.log('Calculating BMR with:', {
    weight: data.weight,
    height: data.height,
    age: data.age,
    sex: data.sex,
  });

  // Data is already in kg and cm from personal-info screen
  const bmr = calculateBMR(data.weight, data.height, data.age, data.sex);
  console.log('BMR:', bmr);
  
  const tdee = calculateTDEE(bmr, data.activity_level);
  console.log('TDEE:', tdee);
  
  const targetCalories = calculateTargetCalories(tdee, data.goal_type, data.goal_intensity || 1);
  console.log('Target Calories:', targetCalories);
  
  const macros = calculateMacros(
    targetCalories,
    data.weight,
    data.macro_preference || 'balanced',
    data.custom_protein,
    data.custom_carbs,
    data.custom_fats
  );
  console.log('Macros:', macros);

  return {
    daily_calories: targetCalories,
    protein_g: macros.protein,
    carbs_g: macros.carbs,
    fats_g: macros.fats,
    fiber_g: macros.fiber,
  };
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function getTodayString(): string {
  return formatDate(new Date());
}

/**
 * Convert pounds to kilograms
 */
export function lbsToKg(lbs: number): number {
  return lbs * 0.453592;
}

/**
 * Convert kilograms to pounds
 */
export function kgToLbs(kg: number): number {
  return kg / 0.453592;
}

/**
 * Convert inches to centimeters
 */
export function inchesToCm(inches: number): number {
  return inches * 2.54;
}

/**
 * Convert centimeters to inches
 */
export function cmToInches(cm: number): number {
  return cm / 2.54;
}

/**
 * Convert feet and inches to total centimeters
 */
export function feetInchesToCm(feet: number, inches: number): number {
  const totalInches = feet * 12 + inches;
  return inchesToCm(totalInches);
}

/**
 * Convert centimeters to feet and inches
 */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cmToInches(cm);
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { feet, inches };
}

/**
 * Get display text for weight loss rate
 */
export function getLossRateDisplayText(lossRateLbsPerWeek: number): string {
  const rateMap: { [key: number]: string } = {
    0.5: '0.5 lb/week (slow and steady)',
    1.0: '1 lb/week (moderate)',
    1.5: '1.5 lb/week (fast)',
    2.0: '2 lb/week (very aggressive)',
  };
  return rateMap[lossRateLbsPerWeek] || `${lossRateLbsPerWeek} lb/week`;
}

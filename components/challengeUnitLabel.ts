import i18n from '@/lib/i18n';

const UNIT_KEYS: Record<string, string> = {
  "meal": "localization.shared.unit_meal",
  "meals": "localization.shared.unit_meals",
  "steps": "localization.shared.unit_steps",
  "workout": "localization.shared.unit_workout",
  "workouts": "localization.shared.unit_workouts",
  "floors": "localization.shared.unit_floors",
  "min": "localization.shared.unit_min",
  "mi": "localization.shared.unit_mi",
  "cal": "localization.shared.unit_cal",
  "referrals": "localization.shared.unit_referrals",
  "minutes": "localization.shared.unit_minutes",
  "km": "localization.shared.unit_km",
  "min/mi": "localization.shared.unit_min_mi"
};

/** Display known unit IDs without changing stored challenge values. */
export function challengeUnitLabel(unit: string): string {
  return UNIT_KEYS[unit] ? i18n.t(UNIT_KEYS[unit]) : unit;
}

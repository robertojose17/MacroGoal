import { kgToLbs, lbsToKg } from './calculations';

export type WeightUnits = 'metric' | 'imperial';
export const validJourneyWeight = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 20 && value <= 500;

// Accepted target first; legacy profiles may still have a target with no goal column.
export const resolveGoalWeight = (goalTarget: unknown, profileTarget: unknown): number | null =>
  validJourneyWeight(goalTarget) ? goalTarget : validJourneyWeight(profileTarget) ? profileTarget : null;

export function journeyWeightInput(weight: unknown, units: WeightUnits): string {
  if (!validJourneyWeight(weight)) return '';
  const display = units === 'imperial' ? kgToLbs(weight) : weight;
  return String(Number(display.toFixed(4)));
}

export function parseJourneyWeight(text: string, units: WeightUnits, original: unknown): number | null {
  const clean = text.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean)) return null;
  const input = Number(clean);
  // Saving the existing displayed value must not change the exact stored kilograms.
  if (validJourneyWeight(original) && input === Number(journeyWeightInput(original, units))) return original;
  const kg = units === 'imperial' ? lbsToKg(input) : input;
  return validJourneyWeight(kg) ? kg : null;
}

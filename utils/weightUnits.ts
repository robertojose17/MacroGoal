/** Storage is tagged: profiles/check-ins kg; default weight tracker lb. Never migrate implicitly. */
export const KG_PER_LB = 0.45359237;
export type WeightUnit = 'kg' | 'lb';
export function weightUnit(unit: unknown): WeightUnit {
 if(unit === 'kg') return 'kg';
 if(unit === 'lb' || unit === 'lbs') return 'lb';
 throw new Error('Unsupported weight storage unit');
}
export function weightToKg(value: number, unit: unknown): number {
 if(!Number.isFinite(value) || value <= 0) throw new Error('Invalid weight');
 return weightUnit(unit) === 'kg' ? value : value * KG_PER_LB;
}
export function weightFromKg(value: number, unit: unknown): number {
 if(!Number.isFinite(value) || value <= 0) throw new Error('Invalid weight');
 return weightUnit(unit) === 'kg' ? value : value / KG_PER_LB;
}
export function weightDisplayUnit(preference: unknown): WeightUnit {
 if(preference === 'metric') return 'kg';
 if(preference === 'imperial') return 'lb';
 throw new Error('Weight preference unavailable');
}
export function metricLossRateLabel(lbsPerWeek: number): number {
 return Number((lbsPerWeek * KG_PER_LB).toFixed(2));
}

/** Decimal keyboard input only, never grouping or permissive parseFloat prefixes.
 * Two fraction digits make 1,000 / 1.000 invalid instead of guessing grouping.
 */
export function parseWeightInput(text: string): number {
 if(typeof text !== 'string' || !/^(?:0|[1-9]\d*)(?:[.,]\d{1,2})?$/.test(text.trim())) return NaN;
 const value=Number(text.trim().replace(',', '.'));
 return Number.isFinite(value) && value > 0 ? value : NaN;
}

/** Signed kg/week is not a positive body weight. Convert only for presentation. */
export function displaySignedRateKg(rateKg: number, unit: WeightUnit): number {
 if(!Number.isFinite(rateKg)) throw new Error('Invalid rate');
 return weightUnit(unit) === 'kg' ? rateKg : rateKg / KG_PER_LB;
}

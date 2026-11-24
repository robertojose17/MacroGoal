// Measured scanner nutrition is per printed serving. No density conversion.
export type ScanMeasure = { amount: number; unit: string };
export type ScannedPortion = {
  name: string; brand: string; label: string; basis: ScanMeasure;
  calories: number; protein: number; carbs: number; fat: number; fiber: number | null;
};
const record = (input: unknown): Record<string, unknown> | null =>
  input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : null;
const number = (input: unknown, max: number): input is number =>
  typeof input === 'number' && Number.isFinite(input) && input >= 0 && input <= max;
const measuredAmount = (input: unknown): input is number => number(input, 10000) && input > 0;
function label(input: unknown, max: number): string {
  return typeof input === 'string' && input.trim().length <= max ? input.trim() : '';
}
export function parseScannedPortion(input: unknown): ScannedPortion | null {
  const row = record(input);
  if (!row) return null;
  const { calories, protein, carbs, fat, fiber } = row;
  if (!number(calories, 100000) || !number(protein, 100000) || !number(carbs, 100000) ||
      !number(fat, 100000) || (fiber != null && !number(fiber, 100000))) return null;
  const name = label(row.name, 160), declared = label(row.label, 160);
  if (!name || !declared) return null;
  let basis: ScanMeasure;
  if (row.measure == null && measuredAmount(row.ml)) {
    basis = { amount: row.ml, unit: 'mL' };
  } else if (row.ml == null) {
    const measure = record(row.measure);
    const unit = label(measure?.unit, 40);
    if (!measure || !measuredAmount(measure.amount) ||
        !/^[\p{L}][\p{L}\p{M} .'-]*$/u.test(unit) ||
        /^(?:g|grams?|gramos?|servings?|porci[oó]n(?:es)?)$/i.test(unit)) return null;
    basis = { amount: measure.amount, unit };
  } else return null;
  return { name, brand:label(row.brand,100), label:declared, basis, calories, protein, carbs, fat, fiber:fiber ?? null };
}
export function scaleScannedPortion(portion: ScannedPortion, text: string, input: 'measure' | 'serving') {
  const raw=text.trim();
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(raw)) return null;
  const n=Number(raw.replace(',','.'));
  if (!measuredAmount(n)) return null;
  const amount=input==='measure'?n:n*portion.basis.amount;
  if (!measuredAmount(amount)) return null;
  const quantity=amount/portion.basis.amount;
  const scaled={calories:portion.calories*quantity,protein:portion.protein*quantity,
    carbs:portion.carbs*quantity,fats:portion.fat*quantity,fiber:portion.fiber==null?null:portion.fiber*quantity};
  if (!Object.values(scaled).every(x=>x===null||number(x,100000))) return null;
  return { amount, unit:portion.basis.unit, quantity, grams:null, ...scaled };
}

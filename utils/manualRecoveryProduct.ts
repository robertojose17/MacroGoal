// Manual values carry no scanned barcode, provider source, or verification authority.
export function manualRecoveryProduct(input: Record<string, string>) {
  const decimal = (value: string) => /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  const grams = decimal(input.servingAmount);
  if (!input.name.trim() || input.servingUnit !== 'g' || !Number.isFinite(grams) || grams <= 0) return null;
  const nutrient = (key: string) => input[key]?.trim() ? decimal(input[key]) : NaN;
  if (!['calories','protein','carbs','fats'].every(k => Number.isFinite(nutrient(k)) && nutrient(k) >= 0)) return null;
  const fiber = input.fiber.trim() ? decimal(input.fiber) : NaN;
  if (fiber !== null && (!Number.isFinite(fiber) || fiber < 0)) return null;
  if (!['calories','protein','carbs','fats'].every(k => Number.isFinite(nutrient(k) * 100 / grams)) || (fiber !== null && !Number.isFinite(fiber * 100 / grams))) return null;
  return {
    code: '', product_name: input.name.trim(), brands: input.brand.trim(),
    serving_quantity: grams, serving_size: grams + ' g',
    nutriments: {
      'energy-kcal_100g': nutrient('calories') * 100 / grams,
      proteins_100g: nutrient('protein') * 100 / grams,
      carbohydrates_100g: nutrient('carbs') * 100 / grams,
      fat_100g: nutrient('fats') * 100 / grams,
      ...(fiber === null ? {} : {fiber_100g: fiber * 100 / grams}),
    },
  };
}

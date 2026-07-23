
/**
 * Unified serving size display utilities.
 *
 * Every food item row must display serving size as:
 *   {quantity}  {label} ({grams}g)
 *
 * EXCEPT when the serving unit is a pure measurement unit (g, ml, oz, cup, etc.),
 * in which case it shows:
 *   {quantity} {unit}   (no parenthetical grams)
 *
 * Examples:
 *   "1 serving (63g)",  qty=1  → "1  serving (63g)"
 *   "1 piece (21g)",    qty=2  → "2  piece (21g)"
 *   "2 tbsp (32g)",     qty=1  → "1  tbsp (32g)"
 *   "63 g",             qty=1  → "1  serving (63g)"   ← pure-unit in desc → fallback label
 *   null,               qty=1  → "1  serving (100g)"
 *   "g",                qty=150 → "150 g"             ← raw pure unit
 *   "ml",               qty=250 → "250 ml"
 *   "oz",               qty=2   → "2 oz"
 *   "cup",              qty=1   → "1 cup"
 */

/** Units that are pure measurements — no parenthetical grams needed. */
const PURE_UNITS = ['g', 'ml', 'oz', 'cup', 'cups', 'tbsp', 'tsp', 'lb', 'lbs', 'kg', 'fl oz', 'floz'];

function isPureUnit(str: string): boolean {
  return PURE_UNITS.includes(str.trim().toLowerCase());
}

/**
 * Parses a serving description string and returns { label, grams }.
 *
 * Examples:
 *   "1 serving (63g)"  → { label: "serving", grams: 63 }
 *   "2 tbsp (32g)"     → { label: "tbsp", grams: 32 }
 *   "1 piece (21g)"    → { label: "piece", grams: 21 }
 *   "63 g"             → { label: "serving", grams: 63 }
 *   "100 g"            → { label: "serving", grams: 100 }
 *   null               → { label: "serving", grams: fallbackGrams ?? 100 }
 */
export function parseServingLabel(
  servingDescription: string | null | undefined,
  fallbackGrams?: number,
): { label: string; grams: number } {
  const fallback = fallbackGrams != null && fallbackGrams > 0 ? fallbackGrams : 100;

  if (!servingDescription || !servingDescription.trim()) {
    return { label: 'serving', grams: fallback };
  }

  const desc = servingDescription.trim();

  // Case: pure grams/ml string like "63 g", "100g", "30 ml"
  const justGramsMatch = desc.match(/^(\d+(?:\.\d+)?)\s*(g|ml)$/i);
  if (justGramsMatch) {
    const grams = parseFloat(justGramsMatch[1]);
    return { label: 'serving', grams: grams > 0 ? grams : fallback };
  }

  // Case: has parenthesised grams like "1 serving (63g)" or "2 tbsp (32g)"
  const withParensMatch = desc.match(/^(.*?)\s*\((\d+(?:\.\d+)?)\s*g\)$/i);
  if (withParensMatch) {
    const rawLabel = withParensMatch[1].trim();
    const grams = parseFloat(withParensMatch[2]);
    const label = stripLeadingNumber(rawLabel);
    return { label: label || 'serving', grams: grams > 0 ? grams : fallback };
  }

  // Case: no parens — strip leading number and use fallback grams
  const label = stripLeadingNumber(desc);
  return { label: label || 'serving', grams: fallback };
}

/**
 * Strips a leading number (and optional space) from a label string.
 * "1 serving" → "serving"
 * "2 tbsp"    → "tbsp"
 * "serving"   → "serving"
 */
function stripLeadingNumber(str: string): string {
  return str.replace(/^\d+(?:\.\d+)?\s*/, '').trim();
}

/**
 * Formats a food item row serving display string.
 *
 * - Pure unit (serving_description is just "g", "ml", "oz", "cup", etc.):
 *     Returns "{quantity} {unit}"  e.g. "150 g", "250 ml", "2 oz"
 * - Named serving (everything else):
 *     Returns "{quantity}  {label} ({grams}g)"  e.g. "1  serving (63g)"
 *
 * @param servingDescription  Raw serving_description from the DB (may be null/undefined)
 * @param quantity            The logged quantity / servings count (defaults to 1)
 * @param fallbackGrams       Gram weight to use when it cannot be parsed from the description
 */
export function formatFoodRowServing(
  servingDescription: string | null | undefined,
  quantity: number,
  fallbackGrams?: number,
): string {
  const qty = quantity != null && isFinite(quantity) && quantity > 0 ? quantity : 1;

  // Check if the raw serving_description itself is a pure unit word (e.g. "g", "ml", "oz", "cup")
  const rawDesc = servingDescription ? servingDescription.trim() : '';
  if (rawDesc && isPureUnit(rawDesc)) {
    console.log('[servingDisplay] formatFoodRowServing (pure unit)', { servingDescription, quantity: qty, unit: rawDesc });
    return `${qty} ${rawDesc}`;
  }

  const { label, grams } = parseServingLabel(servingDescription, fallbackGrams);

  // Check if the extracted label (after stripping leading number) is a pure unit
  // AND the original description did NOT have parenthetical grams (i.e. it was a bare label like "tbsp")
  const hasParens = rawDesc.includes('(') && rawDesc.includes(')');
  if (!hasParens && isPureUnit(label)) {
    console.log('[servingDisplay] formatFoodRowServing (pure unit label)', { servingDescription, quantity: qty, unit: label });
    return `${qty} ${label}`;
  }

  const gramsDisplay = Number.isInteger(grams) ? grams : parseFloat(grams.toFixed(1));
  console.log('[servingDisplay] formatFoodRowServing', { servingDescription, quantity: qty, fallbackGrams, label, grams: gramsDisplay });
  return `${qty}  ${label} (${gramsDisplay}g)`;
}

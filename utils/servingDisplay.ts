
/**
 * Unified serving size display utilities.
 *
 * Every food item row must display serving size as:
 *   {quantity}  {label} ({grams}g)
 *
 * Examples:
 *   "1 serving (63g)",  qty=1  → "1  serving (63g)"
 *   "1 piece (21g)",    qty=2  → "2  piece (21g)"
 *   "2 tbsp (32g)",     qty=1  → "1  tbsp (32g)"
 *   "63 g",             qty=1  → "1  serving (63g)"
 *   null,               qty=1  → "1  serving (100g)"
 */

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
 * Always returns: "{quantity}  {label} ({grams}g)"
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
  const { label, grams } = parseServingLabel(servingDescription, fallbackGrams);
  const gramsDisplay = Number.isInteger(grams) ? grams : parseFloat(grams.toFixed(1));
  console.log('[servingDisplay] formatFoodRowServing', { servingDescription, quantity: qty, fallbackGrams, label, grams: gramsDisplay });
  return `${qty}  ${label} (${gramsDisplay}g)`;
}

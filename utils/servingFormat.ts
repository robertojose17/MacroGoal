
const PLURAL_RULES: Record<string, string> = {
  slice: 'slices',
  piece: 'pieces',
  cup: 'cups',
  tbsp: 'tbsp',
  tsp: 'tsp',
  oz: 'oz',
  fl_oz: 'fl oz',
  serving: 'servings',
  scoop: 'scoops',
  bottle: 'bottles',
  can: 'cans',
  bar: 'bars',
  cookie: 'cookies',
  egg: 'eggs',
  banana: 'bananas',
  apple: 'apples',
  packet: 'packets',
  stick: 'sticks',
};

// Units that are already plural-invariant (mass / volume in metric)
const INVARIANT_UNITS = new Set(['g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb']);

function pluralizeUnit(amount: number, unit: string): string {
  const u = (unit || '').trim().toLowerCase();
  if (!u) return '';
  if (INVARIANT_UNITS.has(u)) return u;
  if (Math.abs(amount - 1) < 0.001) return u;
  return PLURAL_RULES[u] ?? `${u}s`;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
  return n.toFixed(1);
}

/**
 * Format a serving for display.
 * formatServing(1, 'slice') -> "1 slice"
 * formatServing(3, 'slice') -> "3 slices"
 * formatServing(500, 'g')   -> "500 g"
 * formatServing(1.5, 'cup') -> "1.5 cups"
 */
export function formatServing(amount: number, unit: string | null | undefined): string {
  const safeAmount = Number(amount) || 0;
  const safeUnit = pluralizeUnit(safeAmount, unit ?? 'g');
  return `${formatNumber(safeAmount)} ${safeUnit}`.trim();
}

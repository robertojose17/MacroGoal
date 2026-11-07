/** Local identity/display helpers. These fields never grant server write authority. */
export function exactFdcId(value: unknown): string | null {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const id = String(value);
  return /^\d{1,20}$/.test(id) ? id : null;
}

export function catalogPackageBarcode(product: { code?: unknown; _usda_fdc_id?: unknown }): string | null {
  const code = typeof product.code === 'string' ? product.code.trim() : '';
  if (![8, 12, 13, 14].includes(code.length) || !/^\d+$/.test(code)) return null;
  return code === exactFdcId(product._usda_fdc_id) ? null : code;
}

export type SavedPortion = { description: string; gramsPerUnit: number };
export function savedPortionSnapshot(description: string, quantity: number, grams: number) {
  if (!description.trim() || description.length > 160 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(grams) || grams <= 0) return null;
  return { version: 1, description, quantity, grams };
}
export function readSavedPortion(value: unknown, quantity: number, grams: number): SavedPortion | null {
  // PostgREST may decode unconstrained numeric columns as strings.
  quantity = typeof quantity === 'string' && /^[0-9.e+-]+$/i.test(quantity) ? Number(quantity) : quantity;
  grams = typeof grams === 'string' && /^[0-9.e+-]+$/i.test(grams) ? Number(grams) : grams;
  const v = value as ReturnType<typeof savedPortionSnapshot>;
  if (!v || v.version !== 1 || typeof v.description !== 'string' || !savedPortionSnapshot(v.description, quantity, grams)) return null;
  if (v.quantity !== quantity || v.grams !== grams) return null;
  return { description: v.description, gramsPerUnit: grams / quantity };
}

export function portionDescription(description: string, quantity: number, grams: number): string {
  // Grams are display-only. Saving and reloading use the unrounded numeric snapshot.
  return `${quantity} ${description} (${Number(grams.toFixed(4))} g)`;
}

/** Saved-meal rows already store exact mass and count, but have no new marker column.
 * A self-describing label restores only the display unit; its rounded mass never drives math.
 */
export function readSavedPortionLabel(value: unknown, quantity: number, grams: number): SavedPortion | null {
  quantity = typeof quantity === 'string' && /^[0-9.e+-]+$/i.test(quantity) ? Number(quantity) : quantity;
  grams = typeof grams === 'string' && /^[0-9.e+-]+$/i.test(grams) ? Number(grams) : grams;
  if (typeof value !== 'string') return null;
  const match = value.match(/^([\d.e+-]+) (.+) \(([\d.e+-]+) g\)$/);
  if (!match || Number(match[1]) !== quantity || Math.abs(Number(match[3]) - grams) > 0.000051) return null;
  const snapshot = savedPortionSnapshot(match[2],quantity,grams);
  return readSavedPortion(snapshot,quantity,grams);
}

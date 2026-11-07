import { exactFdcId } from './catalogSelection';
import { packageBarcodeInput } from './packageBarcodeInput';
import { recoveryRouteContext } from './recoveryRouteContext';

export type SearchConfirmationReason = 'mass_unverified' | 'volume_only';
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Search-wire shape validation only. Never grants server write authority or changes historical rows. */
export function searchSelectionNeedsConfirmation(value: unknown): boolean {
  if (!object(value)) return true;
  // A server safety flag wins over canonical source/ID. Malformed present flags fail closed.
  if (Object.prototype.hasOwnProperty.call(value, 'requires_label_confirmation') && value.requires_label_confirmation !== false) return true;
  // An explicit external source cannot be relaxed by copied IDs/verification markers.
  if (value._source === 'supabase' && uuid(value._db_id) && value._off_id == null) {
    return value._db_row != null && (!object(value._db_row) || value._db_row.id !== value._db_id);
  }
  if (value._source === 'usda' && value._db_id == null && value._off_id == null) {
    const id = exactFdcId(value._usda_fdc_id);
    return id === null || !/^[1-9]\d*$/.test(id) || String(value.code) !== id;
  }
  return true;
}

export function searchConfirmationReason(value: unknown): SearchConfirmationReason {
  const p = object(value) ? value : {};
  if (p.nutrition_issue === 'volume_basis_requires_confirmation') return 'volume_only';
  const label = typeof p.unconfirmed_serving_label === 'string' ? p.unconfirmed_serving_label.slice(0,240)
    : typeof p.serving_size === 'string' ? p.serving_size.slice(0,240) : '';
  const unit = typeof p.serving_quantity_unit === 'string' ? p.serving_quantity_unit : typeof p.serving_unit === 'string' ? p.serving_unit : '';
  const explicitGrams = [...label.matchAll(/(?<![\w.+\-−])(\d+(?:[.,]\d+)?)\s*(?:g|grams?|gramos?)\b/gi)]
    .some(match => { const grams = Number(match[1].replace(',', '.')); return Number.isFinite(grams) && grams > 0; });
  const volume = /(?:(?:^|[\s\d])ml\b|\bmillilit(?:er|re)s?\b|\bfl\s*oz\b|\bcups?\b|\btbsp\b|\btsp\b)/i.test(label+' '+unit);
  return volume && !explicitGrams ? 'volume_only' : 'mass_unverified';
}

export function searchPackageBarcode(value: unknown): string | null {
  const barcode = typeof value === 'string' ? packageBarcodeInput(value) : null;
  if (!barcode) return null;
  const digits = barcode.split('').map(Number);
  let sum = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += digits[i] * weight;
  return (10 - sum % 10) % 10 === digits[digits.length - 1] ? barcode : null;
}

export function searchConfirmationRoute(value: unknown, context: Record<string, unknown>) {
  const p = object(value) ? value : {};
  const barcode = String(p.code) === exactFdcId(p._usda_fdc_id) ? null : searchPackageBarcode(p.code);
  return { pathname: '/search-food-confirmation' as const, params: {
    ...recoveryRouteContext(context), ...(barcode ? { barcode } : {}),
    reason: searchConfirmationReason(p),
  } };
}

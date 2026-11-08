import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root = process.env.SEARCH_AUTHORITY_FUNCTIONS_ROOT || fileURLToPath(new URL('../integration/supabase/functions', import.meta.url));
export const { SEARCH_SNAPSHOT_FIELDS, hydrateSearchRows, searchNutriments, serializeSearchProduct } = await import(path.join(root, '_shared/searchHydration.mjs'));
export const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function snapshot(overrides = {}) {
  return { ...Object.fromEntries(SEARCH_SNAPSHOT_FIELDS.map(key => [key, null])),
    id: uuid(1), name: 'Banana, raw', product_name: 'Banana, raw', source: 'usda', usda_fdc_id: '123',
    calories: 89, protein: 1.1, carbs: 23, fat: 0, fiber: 2.6, macros_per: '100g',
    serving_size: 100, serving_quantity: '100', serving_unit: 'g', serving_count: 1,
    ...overrides };
}
export const row = (snapshotValue, protection = false) => ({ id: snapshotValue.id, snapshot: snapshotValue, protected: protection });
export function adminFor(rpcRows, hydrationRows, cacheRows = []) {
  const calls = [];
  return { calls, rpc(name, args) {
    calls.push({ name, args });
    return { abortSignal(signal) {
      calls.at(-1).signal = signal;
      if (name === 'search_food_catalog_v2') return Promise.resolve({ data: rpcRows, error: null });
      if (name === 'read_food_search_snapshots_v1') return typeof hydrationRows === 'function' ? hydrationRows(signal) : Promise.resolve({ data: hydrationRows, error: null });
      // New atomic read is intentionally empty in frozen fallback cases; dedicated actual-handler tests cover fresh recovery.
      if (name === 'read_catalog_portion_sources_v1') return Promise.resolve({ data: [], error: null });
      if (name === 'read_usda_portions_v1') return Promise.resolve({ data: cacheRows, error: null });
      throw new Error('Unexpected RPC ' + name);
    } };
  } };
}
export const envelope = { version: 1, provider: 'usda', fdcId: '123', foodDescription: 'Banana, raw',
  dataType: 'Foundation', retrievedAt: '2026-11-06T00:00:00.000Z',
  portions: [{ key: '0', amount: 1, grams: 118, description: 'medium banana', sourcePortionId: '1' }] };

/** Type contract for searchHydration.mjs. Validation remains in the runtime module. */
export type SearchSnapshotField =
  | 'id' | 'barcode' | 'name' | 'product_name' | 'generic_name' | 'brand' | 'brands'
  | 'source' | 'usda_fdc_id' | 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'
  | 'macros_per' | 'serving_size' | 'serving_unit' | 'serving_quantity'
  | 'serving_description' | 'serving_count' | 'nutriments' | 'nutriscore_grade'
  | 'popularity_score' | 'search_count' | 'logs_last_30d' | 'data_quality_score';

export const SEARCH_SNAPSHOT_FIELDS: readonly SearchSnapshotField[];
// Unknown-authority projections can be incomplete or malformed. Do not promise
// validated numbers or UUIDs to callers before normalizeSearchNutrition runs.
export type SearchSnapshot = Partial<Record<SearchSnapshotField, unknown>>;
export type SearchAuthority = 'unknown' | 'known' | 'confirmed_correction';
export interface HydratedSearchRow {
  row: SearchSnapshot;
  authority: SearchAuthority;
}
export interface SearchSnapshotReader {
  rpc(name: 'read_food_search_snapshots_v1', args: { p_food_ids: string[] }): {
    abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
  };
}
export function hydrateSearchRows(
  rows: readonly unknown[],
  admin: SearchSnapshotReader,
  signal?: AbortSignal,
  milliseconds?: number,
): Promise<HydratedSearchRow[]>;

export type SearchNutritionReason =
  | 'core_nutrition_requires_confirmation'
  | 'nutrition_basis_requires_confirmation'
  | 'optional_nutrition_requires_confirmation'
  | 'normalized_nutrition_requires_confirmation';
export type NormalizedSearchNutrition =
  | { valid: false; reason: SearchNutritionReason }
  | { valid: true; nutriments: Record<string, number>; servingSize: number; hasCanonicalServing: boolean };
export function hasCanonicalGramServing(row: unknown): boolean;
export function normalizeSearchNutrition(row: unknown): NormalizedSearchNutrition;
export function searchNutritionIssue(row: unknown, reason: unknown): SearchNutritionReason | 'volume_basis_requires_confirmation';
export function searchNutriments(value: unknown): Record<string, number>;
export function serializeSearchProduct(product: Record<string, unknown>, uncertain?: boolean): Record<string, unknown>;

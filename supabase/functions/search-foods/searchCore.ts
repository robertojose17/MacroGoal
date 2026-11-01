export type Product = Record<string, unknown>;
export type Provider = (query: string, signal: AbortSignal) => Promise<Product[]>;
export type ProviderState = 'ok' | 'unavailable' | 'skipped';
export const RANKING_VERSION = 'food-v2';
export function firstText(...values: unknown[]): string {
  return values.find(v => typeof v === 'string' && v.trim())?.toString().trim() ?? '';
}
export function words(value: unknown): string[] {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().match(/[a-z0-9]+/g) ?? [];
}
// Deliberate basic-food aliases, not automatic translation of brands or names.
const ALIASES: Record<string, string> = {
  manzana: 'apple', manzanas: 'apple', banana: 'banana', bananas: 'banana',
  pina: 'pineapple', pinas: 'pineapple', pollo: 'chicken',
  pechuga: 'chicken breast', pechugas: 'chicken breast',
  crudo: 'raw', cruda: 'raw', cocido: 'cooked', cocida: 'cooked',
  asado: 'roasted', asada: 'roasted', frito: 'fried', frita: 'fried',
};
export function normalizeQuery(query: string): string {
  const phrase = words(query).join(' ').replace(/\bpechugas? de pollo\b/g, 'chicken breast');
  return [...new Set(phrase.split(' ').flatMap(word => (ALIASES[word] ?? word).split(' ')))].filter(Boolean).join(' ');
}
export function queryVariants(query: string): string[] {
  const original = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');
  return [...new Set([original,normalizeQuery(query)])].filter(Boolean);
}
export function productName(p: Product): string { return firstText(p.product_name, p.name, p.generic_name); }
export function productBrand(p: Product): string { return firstText(p.brands, p.brand); }
export function matches(p: Product, query: string): boolean {
  const row = (p._db_row ?? {}) as Product;
  const haystack = words([productName(p),productBrand(p),p.generic_name,
    row.name,row.product_name,row.generic_name,row.brand,row.brands].filter(Boolean).join(' '));
  return queryVariants(query).some(variant => {
    const tokens = words(variant);
    return tokens.length > 0 && tokens.every(token => haystack.some(word => word.startsWith(token)));
  });
}
const COMPOSITE = /\b(fried|stuffed|powder|novelty|novelties|yogurt|sweetened|sauce|mix|smoothie|breaded|deli|roll|sandwich|soup|nuggets?|juice|pie|candy|baby|restaurant|luncheon|pizza|sausage|patties|patty)\b/;
const PREPARATION = new Set(['raw','cooked','roasted','fried','grilled','baked','boiled','breaded','dried','canned','smoked']);
export function isBasic(p: Product, query: string): boolean {
  // The DB has already evaluated the equivalent predicate before its LIMIT.
  const row = p._db_row as Product | undefined;
  if (typeof row?._search_basic === 'boolean') return row._search_basic;
  const singular = (word: string) => word.replace(/s$/, '');
  const variants = queryVariants(query).map(words);
  const heads = variants.map(tokens => singular(tokens[0] ?? ''));
  const allowed = new Set([...variants.flat().map(singular),'raw','fresh','plain','cooked','boneless','skinless','whole','white','brown','red','green']);
  const name = productName(p);
  const head = words(name.split(',')[0]);
  return !productBrand(p) && head.length > 0 && heads.includes(singular(head[0]))
    && head.every(word => allowed.has(singular(word))) && !COMPOSITE.test(words(name).join(' '));
}
export function hasNutrition(p: Product): boolean {
  const n = p.nutriments as Record<string, unknown> | undefined;
  const values = ['energy-kcal_100g','proteins_100g','carbohydrates_100g','fat_100g'].map(key => Number(n?.[key] ?? 0));
  return !!n && values.every(value => Number.isFinite(value) && value >= 0) && values.some(value => value > 0);
}
export function usable(products: Product[], query: string): Product[] {
  return products.filter(p => matches(p, query) && hasNutrition(p));
}
export function satisfiesIntent(products: Product[], query: string): boolean {
  const tokens = words(normalizeQuery(query));
  return products.some(p => isBasic(p,query)
    || tokens.some(t => PREPARATION.has(t))
    || tokens.some(t => words(productBrand(p)).some(b => b.startsWith(t))));
}
export function rankProducts(products: Product[], query: string): Product[] {
  return [...products].sort((a,b) => Number(isBasic(b,query)) - Number(isBasic(a,query))
    || Number(words(productName(b)).join(' ') === query) - Number(words(productName(a)).join(' ') === query)
    || productName(a).length - productName(b).length
    || productName(a).localeCompare(productName(b))
    || String(a.code ?? '').localeCompare(String(b.code ?? '')));
}
// Shared barcode/FDC identities use explicit canonical precedence: DB, USDA, OFF.
// Distinct identities and preparations are retained even when names are similar.
// Conservative display-only dedupe. Different preparation, brand, serving or
// nutritional values remain separate; no catalog records or log IDs are edited.
export function mergeProducts(groups: Product[][], limit: number): Product[] {
  const identities = new Set<string>();
  const fingerprints = new Set<string>();
  const output: Product[] = [];
  for (const group of groups) for (const p of group) {
    const row = p._db_row as Product | undefined;
    const keys = [p._db_id ? 'db:' + p._db_id : '', p._usda_fdc_id ? 'fdc:' + p._usda_fdc_id : '',
      row?.barcode ? 'barcode:' + row.barcode : p._source === 'openfoodfacts' && p.code ? 'barcode:' + p.code : ''].filter(Boolean);
    const n = p.nutriments as Product | undefined;
    const fingerprint = JSON.stringify([words(productName(p)),words(productBrand(p)),p.serving_size,p.serving_quantity,
      Object.entries(n ?? {}).sort(([a],[b]) => a.localeCompare(b))]);
    if (keys.some(key => identities.has(key)) || fingerprints.has(fingerprint)) continue;
    keys.forEach(key => identities.add(key)); fingerprints.add(fingerprint);
    output.push(p);
    if (output.length >= limit) return output;
  }
  return output;
}
async function bounded(provider: Provider, query: string, ms: number): Promise<{ products: Product[]; state: ProviderState }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const products = await Promise.race([
      Promise.resolve().then(() => provider(query,controller.signal)),
      new Promise<never>((_,reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('SEARCH_TIMEOUT')); },ms); }),
    ]);
    if (!Array.isArray(products)) throw new Error('SEARCH_INVALID_RESPONSE');
    return { products: usable(products,query), state: 'ok' };
  } catch { return { products: [], state: 'unavailable' }; }
  finally { if (timer) clearTimeout(timer); }
}
export async function searchCatalog(query: string, limit: number, providers: { db: Provider; usda: Provider; off: Provider }, budgets = { db: 1200, usda: 1800, off: 900 }) {
  // Preserve original-language intent; each provider chooses its request form.
  const states: Record<'db'|'usda'|'off',ProviderState> = { db: 'skipped',usda: 'skipped',off: 'skipped' };
  const db = await bounded(providers.db,query,budgets.db); states.db = db.state;
  let usda: Product[] = []; let off: Product[] = [];
  if (!satisfiesIntent(db.products,query)) {
    const result = await bounded(providers.usda,query,budgets.usda); states.usda = result.state;
    usda = rankProducts(result.products,query);
    // OFF is last resort, not a way to pad an already useful short result list.
    if (db.products.length + usda.length === 0) {
      const result = await bounded(providers.off,query,budgets.off); states.off = result.state;
      off = rankProducts(result.products,query);
    }
  }
  // A relevant USDA basic food may precede branded/composite DB matches.
  // Stable sort preserves SQL order and DB priority within the same intent tier.
  const primary = mergeProducts([db.products,usda],200).sort((a,b) => Number(isBasic(b,query)) - Number(isBasic(a,query)));
  const products = mergeProducts([primary,off],limit);
  const partial = Object.values(states).includes('unavailable');
  return { products,count: products.length,ranking_version: RANKING_VERSION,
    status: partial ? 'partial' : 'complete',providers: states };
}

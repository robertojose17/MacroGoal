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
  chiken: 'chicken',
  arroz: 'rice', avena: 'oats', huevos: 'eggs', huevo: 'egg', claras: 'egg whites',
  atun: 'tuna', salmon: 'salmon', papa: 'potato', papas: 'potato',
  manzana: 'apple', manzanas: 'apple', banana: 'banana', bananas: 'banana',
  pina: 'pineapple', pinas: 'pineapple', pollo: 'chicken',
  pechuga: 'chicken breast', pechugas: 'chicken breast',
  crudo: 'raw', cruda: 'raw', cocido: 'cooked', cocida: 'cooked',
  asado: 'roasted', asada: 'roasted', frito: 'fried', frita: 'fried',
};
export function normalizeQuery(query: string): string {
  const phrase = words(query).join(' ').replace(/\bpechugas? de pollo\b/g, 'chicken breast')
    .replace(/\bcarne molida\b/g, 'ground beef')
    .replace(/\byogur griego\b/g, 'greek yogurt')
    .replace(/\bproteina en polvo\b/g, 'protein powder');
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
// Shared descriptor vocabulary, independent of food identity. SQL candidate uses the same terms.
export const VARIANT_TERMS = ['fried','stuffed','powder','novelty','novelties','sweetened','sauce','mix','smoothie','breaded','deli','roll','sandwich','soup','nugget','nuggets','juice','pie','candy','baby','luncheon','pizza','sausage','patties','patty','salad','canned','smoked','oil','capsule','capsules','supplement','supplements','meatless','vegan','vegetarian','plant based','yolk','egg white','egg whites','acid','fluid'];
const PREPARATION = new Set(['raw','cooked','roasted','fried','grilled','baked','boiled','breaded','dried','canned','smoked']);
const containsPhrase = (text: string, term: string) => (' '+text+' ').includes(' '+term+' ');
export function intentPenalty(p: Product, query: string): number {
  const name=words(productName(p)).join(' '); const requested=words(normalizeQuery(query)).join(' ');
  return Number(VARIANT_TERMS.some(term=>containsPhrase(name,term)&&!containsPhrase(requested,term)));
}
export function isBasic(p: Product, query: string): boolean {
  if(productBrand(p)||intentPenalty(p,query)||!matches(p,query)) return false;
  const variants=queryVariants(query).map(v=>words(v).map(w=>w.replace(/s$/,'')));
  const allSegments=productName(p).split(',').slice(0,2).map(v=>words(v).map(w=>w.replace(/s$/,'')));
  // Only explicit taxonomy prefixes can delegate identity to the next segment.
  // An arbitrary composite (e.g. a baked product with a fruit ingredient) cannot.
  const taxonomyHeads=['fish','meat','poultry','fruit','vegetable','cereal'];
  const segments=taxonomyHeads.includes(allSegments[0]?.join(' ')) ? allSegments : allSegments.slice(0,1);
  return variants.some(tokens=>segments.some(segment=>tokens.includes(segment[0]) &&
    segment.every(word=>tokens.includes(word)||['raw','fresh','plain','cooked','boneless','skinless','whole','white','brown','red','green','ground'].includes(word))));
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
    || (tokens.some(t => PREPARATION.has(t)) && !intentPenalty(p,query))
    || tokens.some(t => words(productBrand(p)).includes(t) && !words(productName(p)).includes(t)));
}
// A known brand is a preference only when a query token identifies that brand,
// rather than merely repeating the food word contained in the brand name.
export function brandPenalty(p: Product, query: string): number {
  const brand=words(productBrand(p)); const name=words(productName(p));
  return Number(brand.length>0 && !words(normalizeQuery(query)).some(t=>brand.includes(t)&&!name.includes(t)));
}
export function rankProducts(products: Product[], query: string): Product[] {
  return [...products].sort((a,b) => intentPenalty(a,query) - intentPenalty(b,query) || Number(isBasic(b,query)) - Number(isBasic(a,query)) || brandPenalty(a,query) - brandPenalty(b,query)
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
export class ProviderHttpError extends Error {
  constructor(code: string, readonly status: number) { super(code); }
}
async function bounded(provider: Provider, query: string, ms: number, stage: 'db'|'usda'|'off'): Promise<{ products: Product[]; state: ProviderState }> {
  const started = Date.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const products = await Promise.race([
      Promise.resolve().then(() => provider(query,controller.signal)),
      new Promise<never>((_,reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('SEARCH_TIMEOUT')); },ms); }),
    ]);
    if (!Array.isArray(products)) throw new Error('SEARCH_INVALID_RESPONSE');
    return { products: usable(products,query), state: 'ok' };
   } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code = ['SEARCH_TIMEOUT','SEARCH_INVALID_RESPONSE','CATALOG_UNAVAILABLE','USDA_UNAVAILABLE','USDA_INVALID_RESPONSE','OFF_UNAVAILABLE','OFF_INVALID_RESPONSE'].includes(message) ? message : 'PROVIDER_FAILURE';
    // Never log the query, raw error, headers, URL, account or food data.
    const http_status = error instanceof ProviderHttpError && Number.isInteger(error.status) && error.status>=400 && error.status<=599 ? error.status : undefined;
    console.warn('[search-foods] provider unavailable', { stage, code, http_status, elapsed_ms: Date.now() - started, deadline_ms: ms });
    return { products: [], state: 'unavailable' };
  }
  finally { if (timer) clearTimeout(timer); }
}
export async function searchCatalog(query: string, limit: number, providers: { db: Provider; usda: Provider; off: Provider }, budgets = { db: 1800, usda: 1400, off: 600 }) {
  // Preserve original-language intent; each provider chooses its request form.
  const states: Record<'db'|'usda'|'off',ProviderState> = { db: 'skipped',usda: 'skipped',off: 'skipped' };
  const db = await bounded(providers.db,query,budgets.db,'db'); states.db = db.state;
  let usda: Product[] = []; let off: Product[] = [];
  if (!satisfiesIntent(db.products,query)) {
    const result = await bounded(providers.usda,query,budgets.usda,'usda'); states.usda = result.state;
    usda = rankProducts(result.products,query);
    // OFF is last resort, not a way to pad an already useful short result list.
    if (db.products.length + usda.length === 0) {
      const result = await bounded(providers.off,query,budgets.off,'off'); states.off = result.state;
      off = rankProducts(result.products,query);
    }
  }
  // A relevant USDA basic food may precede branded/composite DB matches.
  // Stable sort preserves SQL order and DB priority within the same intent tier.
  const primary = mergeProducts([db.products,usda],200).sort((a,b) => intentPenalty(a,query) - intentPenalty(b,query) || Number(isBasic(b,query)) - Number(isBasic(a,query)) || brandPenalty(a,query) - brandPenalty(b,query));
  const products = mergeProducts([primary,off],limit);
  const partial = Object.values(states).includes('unavailable');
  return { products,count: products.length,ranking_version: RANKING_VERSION,
    status: partial ? 'partial' : 'complete',providers: states };
}

import { type OpenFoodFactsProduct } from './openFoodFacts';
import { getLocalCache, setLocalCache } from './foodSearchCache';
import { SUPABASE_PROJECT_URL, supabasePublicKey } from '@/lib/supabase/client';
const SUPABASE_TIMEOUT_MS = 5000;

export interface HybridSearchCallbacks {
  onLocalCacheHit?: (products: OpenFoodFactsProduct[]) => void;
  onSupabaseHit?: (products: OpenFoodFactsProduct[]) => void;
  /** Compatibility only: the Edge function owns provider fallback. */
  onOpenFoodFactsHit?: (products: OpenFoodFactsProduct[]) => void;
  onError?: (stage: 'supabase' | 'off', error: Error) => void;
  onComplete?: () => void;
}
type SearchResponse = { products: OpenFoodFactsProduct[]; partial: boolean; cacheable: boolean };
function aborted(): Error { const error = new Error('SEARCH_ABORTED'); error.name = 'AbortError'; return error; }

export async function fetchSearchResponse(query: string, abortSignal?: AbortSignal, timeoutMs = SUPABASE_TIMEOUT_MS): Promise<SearchResponse> {
  if (abortSignal?.aborted) throw aborted();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectCancellation: (reason: Error) => void = () => {};
  const cancellation = new Promise<never>((_,reject) => { rejectCancellation = reject; });
  const onExternalAbort = () => { controller.abort(); rejectCancellation(aborted()); };
  abortSignal?.addEventListener('abort',onExternalAbort);
  if (abortSignal?.aborted) onExternalAbort();
  timer = setTimeout(() => { controller.abort(); rejectCancellation(new Error('SEARCH_TIMEOUT')); },timeoutMs);
  try {
    // Catalog ranking is global. Do not wait on Auth or send an unused user ID.
    // The deadline covers response decoding, even if fetch/JSON ignores abort.
    return await Promise.race([cancellation,(async () => {
      const response = await fetch(SUPABASE_PROJECT_URL + '/functions/v1/search-foods',{
        method: 'POST',signal: controller.signal,
        headers: { 'Content-Type': 'application/json','Authorization': 'Bearer ' + supabasePublicKey },
        body: JSON.stringify({ query,limit: 30,review_capability: 'label_confirmation_v1' }),
      });
      if (!response.ok) {
        if (response.status === 409 || response.status === 426) {
          const failure = await response.json().catch(() => null);
          if (response.status === 426 || (failure?.status === 'update_required' && failure?.error === 'SEARCH_REVIEW_UPDATE_REQUIRED')) throw new Error('SEARCH_REVIEW_UPDATE_REQUIRED');
        }
        throw new Error('SEARCH_HTTP_' + response.status);
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.products)) throw new Error('SEARCH_INVALID_RESPONSE');
      const partial = data.status === 'partial';
      if (partial && data.products.length === 0) throw new Error('SEARCH_UNAVAILABLE');
      return { products: data.products as OpenFoodFactsProduct[],partial,
        cacheable: !partial && data.ranking_version === 'food-v2' };
    })()]);
  } finally {
    if (timer) clearTimeout(timer);
    abortSignal?.removeEventListener('abort',onExternalAbort);
  }
}

export async function hybridSearch(query: string, callbacks: HybridSearchCallbacks, abortSignal?: AbortSignal): Promise<void> {
  const isAborted = () => abortSignal?.aborted === true;
  try {
    const localProducts = await getLocalCache(query);
    if (isAborted()) return;
    if (localProducts?.length) callbacks.onLocalCacheHit?.(localProducts);
    const result = await fetchSearchResponse(query,abortSignal);
    if (isAborted()) return;
    callbacks.onSupabaseHit?.(result.products);
    if (result.cacheable) setLocalCache(query,result.products).catch(() => {});
    if (result.partial) callbacks.onError?.('supabase',new Error('SEARCH_PARTIAL'));
  } catch (error) {
    if (!isAborted()) {
      if (error instanceof Error && error.message === 'SEARCH_REVIEW_UPDATE_REQUIRED') {
        // Do not leave provisional cached foods selectable after an explicit upgrade denial.
        callbacks.onSupabaseHit?.([]);
        setLocalCache(query,[]).catch(() => {});
      }
      callbacks.onError?.('supabase',error instanceof Error ? error : new Error('SEARCH_UNAVAILABLE'));
    }
  } finally { callbacks.onComplete?.(); }
}

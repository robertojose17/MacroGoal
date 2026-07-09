
import { type OpenFoodFactsProduct } from './openFoodFacts';
import { getLocalCache } from './foodSearchCache';
import { supabase, SUPABASE_PROJECT_URL, supabasePublicKey } from '@/lib/supabase/client';
const SUPABASE_TIMEOUT_MS = 5000;

export interface HybridSearchCallbacks {
  onLocalCacheHit?: (products: OpenFoodFactsProduct[]) => void;
  onSupabaseHit?: (products: OpenFoodFactsProduct[]) => void;
  /** Kept for backward compat — never called (edge function handles OFacts internally) */
  onOpenFoodFactsHit?: (products: OpenFoodFactsProduct[]) => void;
  onError?: (stage: 'supabase' | 'off', error: Error) => void;
  onComplete?: () => void;
}

async function fetchWithAbortAndTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('[HybridSearch] Timeout reached for:', url);
    controller.abort();
  }, timeoutMs);

  // Chain external abort signal
  const onExternalAbort = () => controller.abort();
  abortSignal?.addEventListener('abort', onExternalAbort);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
    abortSignal?.removeEventListener('abort', onExternalAbort);
  }
}

async function fetchSupabaseSearch(
  query: string,
  abortSignal?: AbortSignal,
): Promise<OpenFoodFactsProduct[] | null> {
  const url = `${SUPABASE_PROJECT_URL}/functions/v1/search-foods`;
  console.log('[HybridSearch] Supabase search-foods URL:', url);

  // Get user_id best-effort for personalized scoring
  let userId: string | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data?.session?.user?.id;
    console.log('[HybridSearch] user_id for personalized search:', userId ?? 'anonymous');
  } catch {
    // Non-blocking — fall back to global scoring
  }

  try {
    const response = await fetchWithAbortAndTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabasePublicKey}`,
        },
        body: JSON.stringify({ query, limit: 30, user_id: userId ?? undefined }),
      },
      SUPABASE_TIMEOUT_MS,
      abortSignal,
    );

    console.log('[HybridSearch] Supabase response status:', response.status);

    if (!response.ok) {
      const errText = await response.text();
      console.warn('[HybridSearch] Supabase search-foods error:', response.status, errText.slice(0, 200));
      return null;
    }

    const data = await response.json();
    const products: OpenFoodFactsProduct[] = Array.isArray(data?.products) ? data.products : [];
    console.log('[HybridSearch] Supabase returned', products.length, 'products');

    if (products.length < 1) {
      console.log('[HybridSearch] Supabase returned <3 products — skipping callback');
      return null;
    }

    return products;
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      console.log('[HybridSearch] Supabase fetch aborted');
    } else {
      console.warn('[HybridSearch] Supabase fetch error:', err);
    }
    return null;
  }
}

export async function hybridSearch(
  query: string,
  callbacks: HybridSearchCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  console.log('[HybridSearch] ========== HYBRID SEARCH START ==========');
  console.log('[HybridSearch] Query:', query);

  const isAborted = () => abortSignal?.aborted === true;

  // Stage 1: Local AsyncStorage cache — synchronous-ish, fires immediately
  const localProducts = await getLocalCache(query);
  if (isAborted()) {
    console.log('[HybridSearch] Aborted after local cache check');
    callbacks.onComplete?.();
    return;
  }
  if (localProducts && localProducts.length > 0) {
    console.log('[HybridSearch] Local cache HIT —', localProducts.length, 'products');
    callbacks.onLocalCacheHit?.(localProducts);
  }

  // Stage 2: Supabase edge function (handles OFacts internally as fallback)
  try {
    const products = await fetchSupabaseSearch(query, abortSignal);
    if (isAborted()) {
      console.log('[HybridSearch] Aborted after Supabase stage');
      callbacks.onComplete?.();
      return;
    }
    if (products && products.length >= 1) {
      console.log('[HybridSearch] Supabase HIT — emitting', products.length, 'products');
      callbacks.onSupabaseHit?.(products);
    }
  } catch (err) {
    console.warn('[HybridSearch] Supabase stage error:', err);
    if (!isAborted()) {
      callbacks.onError?.('supabase', err instanceof Error ? err : new Error(String(err)));
    }
  }

  console.log('[HybridSearch] All stages complete');
  callbacks.onComplete?.();
}

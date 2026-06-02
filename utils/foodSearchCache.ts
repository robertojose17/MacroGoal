
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OpenFoodFactsProduct } from './openFoodFacts';

const CACHE_KEY_PREFIX = '@food_search_cache:';
const CACHE_INDEX_KEY = '@food_search_cache_index';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES = 50;

interface CacheEntry {
  products: OpenFoodFactsProduct[];
  timestamp: number;
}

function normalizeKey(query: string): string {
  return query.trim().toLowerCase();
}

function storageKey(query: string): string {
  return `${CACHE_KEY_PREFIX}${normalizeKey(query)}`;
}

export async function getLocalCache(query: string): Promise<OpenFoodFactsProduct[] | null> {
  try {
    const key = storageKey(query);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      console.log('[FoodSearchCache] MISS for query:', query);
      return null;
    }
    const entry: CacheEntry = JSON.parse(raw);
    const age = Date.now() - entry.timestamp;
    if (age > TTL_MS) {
      console.log('[FoodSearchCache] EXPIRED for query:', query, '(age:', Math.round(age / 1000 / 60), 'min)');
      // Don't await — fire-and-forget cleanup
      AsyncStorage.removeItem(key).catch(() => {});
      return null;
    }
    console.log('[FoodSearchCache] HIT for query:', query, '(', entry.products.length, 'products, age:', Math.round(age / 1000), 's)');
    return entry.products;
  } catch (err) {
    console.warn('[FoodSearchCache] getLocalCache error (silent):', err);
    return null;
  }
}

export async function setLocalCache(query: string, products: OpenFoodFactsProduct[]): Promise<void> {
  try {
    const key = storageKey(query);
    const normalizedQuery = normalizeKey(query);
    const entry: CacheEntry = { products, timestamp: Date.now() };

    // Read current index
    let index: string[] = [];
    try {
      const rawIndex = await AsyncStorage.getItem(CACHE_INDEX_KEY);
      if (rawIndex) {
        index = JSON.parse(rawIndex);
      }
    } catch {
      index = [];
    }

    // Remove existing entry for this query (to re-insert at end = most recent)
    index = index.filter(q => q !== normalizedQuery);
    index.push(normalizedQuery);

    // Evict oldest entries if over limit
    const keysToDelete: string[] = [];
    while (index.length > MAX_ENTRIES) {
      const oldest = index.shift();
      if (oldest) {
        keysToDelete.push(`${CACHE_KEY_PREFIX}${oldest}`);
      }
    }

    // Write atomically
    const pairs: [string, string][] = [
      [key, JSON.stringify(entry)],
      [CACHE_INDEX_KEY, JSON.stringify(index)],
    ];
    await AsyncStorage.multiSet(pairs);

    if (keysToDelete.length > 0) {
      console.log('[FoodSearchCache] Evicting', keysToDelete.length, 'old entries');
      await AsyncStorage.multiRemove(keysToDelete);
    }

    console.log('[FoodSearchCache] Saved', products.length, 'products for query:', query, '(index size:', index.length, ')');
  } catch (err) {
    console.warn('[FoodSearchCache] setLocalCache error (silent):', err);
  }
}

export async function clearExpiredCache(): Promise<void> {
  try {
    const rawIndex = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    if (!rawIndex) return;

    const index: string[] = JSON.parse(rawIndex);
    const expiredKeys: string[] = [];
    const validQueries: string[] = [];

    for (const normalizedQuery of index) {
      try {
        const raw = await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}${normalizedQuery}`);
        if (!raw) continue;
        const entry: CacheEntry = JSON.parse(raw);
        if (Date.now() - entry.timestamp > TTL_MS) {
          expiredKeys.push(`${CACHE_KEY_PREFIX}${normalizedQuery}`);
        } else {
          validQueries.push(normalizedQuery);
        }
      } catch {
        // Skip corrupt entries
      }
    }

    if (expiredKeys.length > 0) {
      await AsyncStorage.multiRemove(expiredKeys);
      await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(validQueries));
      console.log('[FoodSearchCache] Cleared', expiredKeys.length, 'expired entries');
    }
  } catch (err) {
    console.warn('[FoodSearchCache] clearExpiredCache error (silent):', err);
  }
}

import { captureUsdaPortions, readUsdaPortions, applyUsdaPortion } from './foodPortions.mjs';

/** Dependencies are server-owned. Never pass a client supplied USDA response here.
 * Search calls readCachedPortions only. Detail/scan can resolve one exact FDC ID.
 * No user IDs, food queries, tokens or provider bodies are logged.
 */
export async function readCachedPortions(fdcId, cache, signal) {
  if (!/^[0-9]{1,20}$/.test(String(fdcId))) return null;
  try {
    const value = await cache.read(String(fdcId), signal);
    return readUsdaPortions(value, fdcId).length ? value : null;
  } catch { return null; }
}

export async function resolveExactPortions(fdcId, dependencies, signal) {
  const key = String(fdcId);
  if (!/^[0-9]{1,20}$/.test(key) || signal?.aborted) return { envelope: null, persisted: false };
  const cached = await readCachedPortions(key, dependencies.cache, signal);
  if (cached) return { envelope: cached, persisted: true };
  if (signal?.aborted) return { envelope: null, persisted: false };
  let body;
  try { body = await dependencies.fetchExactFood(key, signal); }
  catch { return { envelope: null, persisted: false }; }
  if (signal?.aborted) return { envelope: null, persisted: false };
  const envelope = captureUsdaPortions(body, key, dependencies.now());
  if (!envelope) return { envelope: null, persisted: false };
  try {
    await dependencies.cache.write(key, envelope, signal);
    return { envelope, persisted: true };
  } catch {
    // Valid fetched evidence may be displayed, but never claim the cache write succeeded.
    return { envelope, persisted: false };
  }
}

/** One bounded operation covers cache read, exact fetch, JSON decode and persistence.
 * A non-cooperative dependency cannot leave the request waiting forever.
 */
export async function resolvePortionsWithin(fdcId, dependencies, milliseconds = 1500) {
  const budget = Math.min(2000, Math.max(1, milliseconds));
  const controller = new AbortController();
  let timer;
  const expired = new Promise(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ envelope: null, persisted: false });
    }, budget);
  });
  try { return await Promise.race([resolveExactPortions(fdcId, dependencies, controller.signal), expired]); }
  finally { clearTimeout(timer); controller.abort(); }
}

/** Adapter for the separately reviewed service-only RPC boundary.
 * Existing clients cannot forge provenance by editing food_items.off_data.
 */
export function servicePortionCache(admin) {
  return {
    async read(fdcId, signal) {
      const request = admin.rpc('read_usda_portions_v1', { p_fdc_ids: [fdcId] });
      const { data, error } = await (signal ? request.abortSignal(signal) : request);
      if (error) throw new Error('PORTION_CACHE_READ');
      return Array.isArray(data) ? data.find(row => row.fdc_id === fdcId)?.payload ?? null : null;
    },
    async write(fdcId, envelope, signal) {
      if (!readUsdaPortions(envelope, fdcId).length) throw new Error('PORTION_INVALID');
      const request = admin.rpc('record_usda_portions_v1', { p_fdc_id: fdcId, p_payload: envelope });
      const { error } = await (signal ? request.abortSignal(signal) : request);
      if (error) throw new Error('PORTION_CACHE_WRITE');
    },
  };
}

/** Search never fetches provider details. One batch read, bounded independently. */
export async function decorateCachedProducts(products, admin, milliseconds = 150) {
 const ids=[...new Set(products.map(p=>p._usda_fdc_id).filter(v=>/^\d{1,20}$/.test(String(v))))];
 if(!ids.length)return products;
 const controller=new AbortController(); let timer;
 const expired=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve([]);},milliseconds);});
 let rows=[];
 try{
  rows=await Promise.race([(async()=>{const {data,error}=await admin.rpc('read_usda_portions_v1',{p_fdc_ids:ids.slice(0,100)}).abortSignal(controller.signal);return !error&&Array.isArray(data)?data:[];})(),expired]);
 }catch{}finally{clearTimeout(timer);controller.abort();}
 const evidence=new Map(rows.map(r=>[r.fdc_id,r.payload]));
 return products.map(p=>applyUsdaPortion(p,evidence.get(p._usda_fdc_id)));
}

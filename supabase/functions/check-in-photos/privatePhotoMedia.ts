/** Local candidate. No deployment authorization. Tokens never occur in media URLs. */
export type MediaKind = 'original' | 'shared';
export type MediaReference = { bucket: string; path: string; binding: string };
export interface MediaDependencies {
  authenticate(token: string): Promise<string | null>;
  // Must use server-owned mapping and current owner/post/block authorization.
  resolve(actor: string, kind: MediaKind, id: string): Promise<MediaReference | null>;
  download(ref: MediaReference, signal: AbortSignal): Promise<Response>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LIMIT = 12 * 1024 * 1024;
const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Pragma': 'no-cache',
  'Vary': 'Authorization',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
function deny(status: number): Response {
  return new Response(JSON.stringify({ error: status === 401 ? 'AUTH_REQUIRED' : 'MEDIA_UNAVAILABLE' }),
    { status, headers: { ...HEADERS, 'Content-Type': 'application/json' } });
}
function imageType(bytes: Uint8Array): string | null {
  if(bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if(bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)) return 'image/png';
  if(bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP') return 'image/webp';
  // Narrow HEIC identification only, not a full decoder or cross-platform guarantee.
  if(bytes.length>=24 && String.fromCharCode(...bytes.slice(4,8))==='ftyp'){
    const size=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0,false);
    const brand=String.fromCharCode(...bytes.slice(8,12));
    if(size>=24&&size<=4096&&size<=bytes.length&&(size-16)%4===0&&['heic','heix'].includes(brand))return 'image/heic';
  }
  return null; // SVG/HTML, generic BMFF/video and unreviewed formats fail closed.
}
async function boundedBody(response: Response): Promise<Uint8Array> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > LIMIT) throw Error('limit');
  const reader = response.body?.getReader();
  if (!reader) throw Error('empty');
  const chunks: Uint8Array[]=[]; let size=0;
  try {
    while(true) { const {done,value}=await reader.read(); if(done)break;
      size+=value.byteLength; if(size>LIMIT) throw Error('limit'); chunks.push(value); }
  } catch(e) { await reader.cancel().catch(()=>{}); throw e; }
  finally {reader.releaseLock();}
  const result=new Uint8Array(size); let cursor=0;
  for(const chunk of chunks){result.set(chunk,cursor);cursor+=chunk.byteLength;}
  return result;
}
export function createPrivatePhotoMedia(deps: MediaDependencies) {
  return async (req: Request): Promise<Response> => {
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
    if(req.method!=='GET')return deny(405);
    const url=new URL(req.url);
    // Native fetch may add `_` only when using cache options: client omits those.
    if(url.search || url.hash)return deny(400);
    const parts=url.pathname.split('/').filter(Boolean);
    const kind=parts[parts.length-2], id=parts[parts.length-1];
    const canonicalPrefix = parts.length===6 && parts.slice(0,4).join('/')==='functions/v1/check-in-photos/media' || parts.length===4 && parts.slice(0,2).join('/')==='check-in-photos/media';
    if(!canonicalPrefix || url.pathname.includes('//') || url.pathname.endsWith('/') || !['original','shared'].includes(kind)||!UUID.test(id))return deny(404);
    const auth=req.headers.get('authorization');
    if(!auth || auth.length>8192 || !/^Bearer [^\s]+$/.test(auth))return deny(401);
    const token=auth.slice(7);
    try {
      const actor=await deps.authenticate(token); if(!actor)return deny(401);
      const ref=await deps.resolve(actor,kind as MediaKind,id); if(!ref)return deny(404);
      const upstream=await deps.download(ref, AbortSignal.any([req.signal, AbortSignal.timeout(15000)]));
      // Never forward redirects, upstream headers, errors, cookies or cache metadata.
      if(!upstream.ok || upstream.redirected)return deny(404);
      const bytes=await boundedBody(upstream); if(req.signal.aborted)return deny(404); const type=imageType(bytes);
      if(!type)return deny(404);
      // Recheck after fetching to prevent a completed revocation during download leaking bytes.
      if(await deps.authenticate(token)!==actor)return deny(401);
      const current=await deps.resolve(actor,kind as MediaKind,id);
      if(!current || current.binding!==ref.binding || current.bucket!==ref.bucket || current.path!==ref.path)return deny(404);
      return new Response(bytes.buffer as ArrayBuffer,{headers:{...HEADERS,'Content-Type':type,'Content-Length':String(bytes.length)}});
    } catch { return deny(404); } // Do not log private names, URLs, tokens or upstream errors.
  };
}

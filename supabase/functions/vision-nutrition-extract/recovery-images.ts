/** New recovery actions use bounded, non-redirecting image reads. Legacy v19 remains separate. */
export async function recoveryImageDataUri(url: string, fetcher: typeof fetch = fetch, deadline=Date.now()+10000): Promise<string> {
  if(Date.now()>=deadline)throw Error('request_deadline');
  const response=await fetcher(url,{redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-Date.now())))});
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const max=6*1024*1024;
  if(response.status!==200||!['image/jpeg','image/png','image/webp'].includes(mime)||!response.body||Number(response.headers.get('content-length')||0)>max)throw Error('image_unavailable');
  const chunks:Uint8Array[]=[];let length=0;const reader=response.body.getReader();
  try{while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;
    if(length>max){await reader.cancel();throw Error('image_too_large');}chunks.push(next.value);}}
  finally{reader.releaseLock();}
  if(length<1000)throw Error('image_unreadable');
  let binary='';for(const chunk of chunks){for(let offset=0;offset<chunk.length;offset+=8192)binary+=String.fromCharCode(...chunk.subarray(offset,offset+8192));}
  return 'data:'+mime+';base64,'+btoa(binary);
}

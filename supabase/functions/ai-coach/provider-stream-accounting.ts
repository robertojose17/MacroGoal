// Private, per-dispatch accounting observer. Never serializes metadata to client SSE.
export type UsageRecorder=(cost:number|null,id:string|null)=>void;
const validId=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(x);
export function observeProviderAccounting(response:Response,record:UsageRecorder):Response{
 let id:string|null=null,idConflict=false,invalid=false,done=false,finished=false,usageSeen=false,cost:number|null=null;
 let pending='',lines:string[]=[],frameSize=0,total=0,lastAccounting=false,lastPublished='';
 const publish=(cost:number|null,id:string|null)=>{const key=JSON.stringify([cost,id]);if(key!==lastPublished){lastPublished=key;record(cost,id);}};
 const decoder=new TextDecoder('utf-8',{fatal:true});
 const identify=(value:unknown)=>{if(!validId(value)){invalid=true;return;}if(id&&id!==value){idConflict=true;invalid=true;id=null;}else if(!idConflict)id=value;publish(null,id);};
 const header=response.headers.get('X-Generation-Id');if(header!==null)identify(header);
 const event=()=>{const data=lines.join('\n');lines=[];frameSize=0;if(!data)return;if(data==='[DONE]'){done=true;return;}if(done){invalid=true;return;}
  let v:any;try{v=JSON.parse(data);}catch{invalid=true;return;}if(!v||typeof v!=='object'||Array.isArray(v)){invalid=true;return;}
  lastAccounting=false;if(Object.hasOwn(v,'id'))identify(v.id);
  if(Object.hasOwn(v,'error')){invalid=true;throw Error('provider_stream_error');}
  if(Object.hasOwn(v,'usage')&&v.usage!==null){const n=v.usage?.cost;if(typeof n!=='number'||!Number.isFinite(n)||n<0){invalid=true;return;}if(usageSeen&&cost!==n)invalid=true;usageSeen=true;cost=n;lastAccounting=true;}
 };
 const line=(s:string)=>{if(s===''){event();return;}if(s.startsWith(':'))return;if(s.startsWith('data:')){const v=s.slice(5).replace(/^ /,'');frameSize+=v.length;if(frameSize>65536)throw Error('provider_accounting_frame_too_large');lines.push(v);}};
 const feed=(text:string,eof=false)=>{pending+=text;let i=0,start=0;for(;i<pending.length;i++){if(pending[i]!=='\n'&&pending[i]!=='\r')continue;if(pending[i]==='\r'&&i===pending.length-1&&!eof)break;line(pending.slice(start,i));if(pending[i]==='\r'&&pending[i+1]==='\n')i++;start=i+1;}pending=pending.slice(start);if(pending.length>65536)throw Error('provider_accounting_line_too_large');};
 const finish=(complete:boolean)=>{if(finished)return;finished=true;publish(complete&&done&&lastAccounting&&!invalid&&usageSeen&&!idConflict&&id!==null?cost:null,idConflict?null:id);};
 if(!response.ok||!response.body){finish(false);return response;}
 const reader=response.body.getReader();
 const body=new ReadableStream<Uint8Array>({async pull(controller){try{const v=await reader.read();if(v.done){feed(decoder.decode(),true);if(pending.trim()||lines.length)invalid=true;finish(true);reader.releaseLock();controller.close();return;}total+=v.value.byteLength;if(total>1048576)throw Error('provider_accounting_stream_too_large');feed(decoder.decode(v.value,{stream:true}));controller.enqueue(v.value);}catch(error){invalid=true;finish(false);try{await reader.cancel(error);}catch{}controller.error(error);}},async cancel(reason){finish(false);await reader.cancel(reason);}});
 return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
}

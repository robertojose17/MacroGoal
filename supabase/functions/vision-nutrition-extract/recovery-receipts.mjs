const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value) ? value : null;
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

// Compare-and-swap prevents overwriting concurrent photo claims or confirmation.
export async function persistRecoveryReceipt(db, owner, submission, receipt) {
  const {data:row,error} = await db.from('food_submissions').select('extracted_data').eq('id',submission).eq('submitted_by_user_id',owner).eq('status','pending').maybeSingle();
  if(error || !row || row.extracted_data?.recovery_version !== 1) throw Error('receipt_store_unavailable');
  const old=row.extracted_data;
  const receipts=Array.isArray(old.provider_receipts)?old.provider_receipts:[];
  const index=receipts.findIndex(r=>r.attempt_id===receipt.attempt_id);
  if(index<0 && receipts.length>=13)throw Error('receipt_limit');
  const next=receipts.slice();if(index<0)next.push(receipt);else next[index]=receipt;
  const result=await db.from('food_submissions').update({extracted_data:{...old,provider_receipts:next}})
    .eq('id',submission).eq('submitted_by_user_id',owner).eq('status','pending')
    .eq('extracted_data',JSON.stringify(old)).select('id').maybeSingle();
  if(result.error || !result.data)throw Error('receipt_store_unavailable');
}

async function receiptBody(response) {
  const copy=response.clone();const reader=copy.body?.getReader();if(!reader)return null;
  let size=0,text='';const decoder=new TextDecoder();
  try {while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
    if(size>1024*1024){void reader.cancel().catch(()=>{});return null;}text+=decoder.decode(part.value,{stream:true});}
    return JSON.parse(text+decoder.decode());
  } catch{return null;} finally {reader.releaseLock();}
}

export function createReceiptFetch({fetcher=fetch,persist,submission,revision,deadline=Infinity,log=console.info}) {
  let blocked=false;
  return async (url,init) => {
    if(String(url)!==endpoint)return fetcher(url,init);
    if(blocked || Date.now()>=deadline)throw Error('receipt_store_unavailable');
    const request=JSON.parse(String(init?.body||'{}'));
    if(!['google/gemini-2.5-pro','google/gemini-2.5-flash'].includes(request.model))throw Error('unexpected_receipt_model');
    let receipt={attempt_id:crypto.randomUUID(),revision,model:request.model,
      stage:request.plugins?.some(p=>p.id==='web')?'discovery':'label_read',
      started_at:new Date().toISOString(),outcome:'started',cost_state:'unknown',cost_usd:null,generation_id:null};
    const save=async value=>{try{await persist(value);}catch{blocked=true;
      log('[BarcodeRecovery] provider_receipt_unpersisted',JSON.stringify({submission,...value}));throw Error('receipt_store_unavailable');}};
    await save(receipt); // Durable unknown receipt before potentially billable dispatch.
    if(Date.now()>=deadline)throw Error('request_deadline');
    let response;
    try{response=await fetcher(url,init);}catch(error){
      receipt={...receipt,outcome:'transport_error',finished_at:new Date().toISOString()};
      await save(receipt);throw error;
    }
    const data=await receiptBody(response);
    const cost=number(data?.usage?.cost);
    const id=safeId(data?.id)||safeId(response.headers.get('openrouter-generation-id'));
    receipt={...receipt,finished_at:new Date().toISOString(),http_status:response.status,
      outcome:!data?'invalid_json':!response.ok?'http_error':data.error?'provider_error':'response_received',
      cost_state:cost===null?'unknown':'reported',cost_usd:cost,generation_id:id,provider_request_id:safeId(response.headers.get('x-request-id')),
      prompt_tokens:number(data?.usage?.prompt_tokens),completion_tokens:number(data?.usage?.completion_tokens),
      finish_reason:safeId(data?.choices?.[0]?.finish_reason)};
    await save(receipt);
    log('[BarcodeRecovery] provider_receipt',JSON.stringify({submission,...receipt}));
    return response;
  };
}

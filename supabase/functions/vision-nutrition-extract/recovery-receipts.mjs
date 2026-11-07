const chatEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
const responsesEndpoint = 'https://openrouter.ai/api/v1/responses';
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

async function receiptBody(response,signal) {
  const copy=response.clone();const reader=copy.body?.getReader();if(!reader)return null;
  let size=0,text='';const decoder=new TextDecoder();
  try {while(true){if(signal?.aborted){void reader.cancel().catch(()=>{});return null;}let onAbort;const aborted=new Promise((_,reject)=>{onAbort=()=>reject(Error('receipt_body_aborted'));signal?.addEventListener('abort',onAbort,{once:true});});let part;try{part=await Promise.race([reader.read(),aborted]);}finally{signal?.removeEventListener('abort',onAbort);}if(part.done)break;size+=part.value.byteLength;
    if(size>1024*1024){void reader.cancel().catch(()=>{});return null;}text+=decoder.decode(part.value,{stream:true});}
    return JSON.parse(text+decoder.decode());
  } catch{void reader.cancel().catch(()=>{});return null;} finally {reader.releaseLock();}
}

export function createReceiptFetch({fetcher=fetch,persist,submission,revision,deadline=Infinity,log=console.info}) {
  let blocked=false;
  return async (url,init) => {
    const isResponses=String(url)===responsesEndpoint;
    if(String(url)!==chatEndpoint&&!isResponses)return fetcher(url,init);
    if(blocked || Date.now()>=deadline)throw Error('receipt_store_unavailable');
    const request=JSON.parse(String(init?.body||'{}'));
    if(!['google/gemini-2.5-pro','google/gemini-2.5-flash'].includes(request.model))throw Error('unexpected_receipt_model');
    const toolTypes=Array.isArray(request.tools)?request.tools.map(t=>t?.type):[];
    if(isResponses&&(!toolTypes.length||toolTypes.some(t=>!['openrouter:web_search','openrouter:web_fetch'].includes(t))))throw Error('unexpected_receipt_tool');
    let receipt={attempt_id:crypto.randomUUID(),revision,model:request.model,
      stage:isResponses?(toolTypes.includes('openrouter:web_search')?'discovery':'source_read'):request.plugins?.some(p=>p.id==='web')?'discovery':request.response_format?.json_schema?.name==='front_identity_hint_v1'?'identity_read':'label_read',
      started_at:new Date().toISOString(),outcome:'started',cost_state:'unknown',cost_usd:null,generation_id:null};
    const save=async value=>{try{await persist(value);}catch{blocked=true;
      log('[BarcodeRecovery] provider_receipt_unpersisted',JSON.stringify({submission,...value}));throw Error('receipt_store_unavailable');}};
    await save(receipt); // Durable unknown receipt before potentially billable dispatch.
    if(Date.now()>=deadline)throw Error('request_deadline');
    let response;
    const dispatchStarted=Date.now();
    const diagnostic=(phase)=>{const reason=init?.signal?.reason?.message;log('[BarcodeRecovery] transport_diagnostic',JSON.stringify({submission,attempt_id:receipt.attempt_id,stage:receipt.stage,phase,signal_aborted:!!init?.signal?.aborted,abort_reason:['source_stage_timeout','source_budget_deadline'].includes(reason)?reason:null,elapsed_ms:Math.max(0,Date.now()-dispatchStarted)}));};
    if(init?.signal?.aborted){diagnostic('before_dispatch');receipt={...receipt,outcome:'transport_error',finished_at:new Date().toISOString()};await save(receipt);throw Error('request_deadline');}
    try{response=await fetcher(url,init);}catch(error){
      diagnostic('fetch');
      receipt={...receipt,outcome:'transport_error',finished_at:new Date().toISOString()};
      await save(receipt);throw error;
    }
    const data=await receiptBody(response,init?.signal);
    if(!data)diagnostic('body');
    const cost=number(data?.usage?.cost);
    const id=safeId(data?.id)||safeId(response.headers.get('openrouter-generation-id'));
    receipt={...receipt,finished_at:new Date().toISOString(),http_status:response.status,
      outcome:!data?'invalid_json':!response.ok?'http_error':data.error?'provider_error':'response_received',
      cost_state:cost===null?'unknown':'reported',cost_usd:cost,generation_id:id,provider_request_id:safeId(response.headers.get('x-request-id')),
      prompt_tokens:number(isResponses?data?.usage?.input_tokens:data?.usage?.prompt_tokens),completion_tokens:number(isResponses?data?.usage?.output_tokens:data?.usage?.completion_tokens),
      finish_reason:safeId(isResponses?data?.status:data?.choices?.[0]?.finish_reason),
      ...(isResponses?{api:'responses',
        server_tool_cost_usd:number(data?.usage?.cost_details?.server_tool_cost),
        web_search_requests:number(data?.usage?.server_tool_use_details?.web_search_requests),
        tool_calls_requested:number(data?.usage?.server_tool_use_details?.tool_calls_requested),
        tool_calls_executed:number(data?.usage?.server_tool_use_details?.tool_calls_executed)}:{})};
    await save(receipt);
    log('[BarcodeRecovery] provider_receipt',JSON.stringify({submission,...receipt}));
    return response;
  };
}

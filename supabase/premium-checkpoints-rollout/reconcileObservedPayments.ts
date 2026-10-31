// Owner/service-only pure reconciliation. No database writes and no public endpoint.
// Supply the COMPLETE trusted provider mirror across ALL stores/environments, not client claims.
// verifiedAuthUserIds must come from a server-authorized auth.users snapshot/resolver, never checkpoints.
type Obj=Record<string,unknown>;
const obj=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown)=>typeof v==='string'&&v.length>0?v:null;
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)?v.toLowerCase():null;
const millis=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
const purchaseKinds=['INITIAL_PURCHASE','RENEWAL','NON_RENEWING_PURCHASE'];
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):obj(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export type ProviderRow={raw_event:unknown;event_data:unknown;user_id:string|null;created_at:string};
export type CheckpointRow={user_id:string;received_at:string;payload:unknown};
type Variant={event:Obj;vendorId:string;key:string|null;userId:string|null;receivedAt:number;signature:string;vendorSignature:string};
type Fact={key:string;vendorId:string;userId:string|null;productId:string;transactionId:string;store:string;environment:string;purchasedAt:number;price:number;currency:string;kind:string};
export function reconcileObservedPayments(providerRows:ProviderRow[],checkpoints:CheckpointRow[],captureStart:string,verifiedAuthUserIds:ReadonlySet<string>){
 const start=Date.parse(captureStart);if(!Number.isFinite(start))throw Error('reviewed_capture_start_required');
 const verified=new Set([...verifiedAuthUserIds].map(uuid).filter((id):id is string=>id!==null));
 const variants:Variant[]=[];let excluded=0;
 for(const row of providerRows){
  const raw=obj(row.raw_event)?row.raw_event:null,data=obj(row.event_data)?row.event_data:null;
  const event=raw?.event??data?.event??raw??data;
  if(!obj(event)||!str(event.id)){excluded++;continue;}
  const actor=uuid(event.app_user_id);
  // The existing webhook leaves row.user_id null. Bind only trusted raw UUIDs verified by Auth.
  const userId=actor&&verified.has(actor)?actor:null;
  const store=str(event.store),environment=str(event.environment),transactionId=str(event.transaction_id);
  const key=store&&environment&&transactionId?JSON.stringify([store,environment,transactionId]):null;
  const signature=JSON.stringify(canonical([event.app_user_id,event.product_id,event.transaction_id,event.store,event.environment,event.purchased_at_ms,event.price_in_purchased_currency,event.currency,event.type,event.period_type]));
  variants.push({event,vendorId:String(event.id),key,userId,receivedAt:Date.parse(row.created_at),signature,
   vendorSignature:JSON.stringify([signature,canonical(event.event_timestamp_ms)])});
 }
 // Inspect all variants BEFORE paid qualification: zero/trial/malformed duplicates cannot disappear.
 const vendors=new Map<string,Variant[]>(),keys=new Map<string,Variant[]>();
 for(const v of variants){vendors.set(v.vendorId,[...(vendors.get(v.vendorId)||[]),v]);
  if(v.key&&purchaseKinds.includes(String(v.event.type)))keys.set(v.key,[...(keys.get(v.key)||[]),v]);}
 const conflictingVendors=new Set<string>(),conflicted=new Set<string>();
 for(const [id,rows]of vendors)if(new Set(rows.map(v=>v.vendorSignature)).size!==1){conflictingVendors.add(id);for(const v of rows)if(v.key)conflicted.add(v.key);}
 for(const [key,rows]of keys)if(new Set(rows.map(v=>v.signature)).size!==1)conflicted.add(key);
 const facts:Fact[]=[];
 for(const [key,rows]of keys){
  if(conflicted.has(key))continue;
  // Identical retry deliveries can arrive on either side of capture start; require one in scope.
  const v=rows.find(v=>Number.isFinite(v.receivedAt)&&v.receivedAt>=start);
  if(!v){excluded+=rows.length;continue;}
  const e=v.event,productId=str(e.product_id),transactionId=str(e.transaction_id),store=str(e.store),environment=str(e.environment),currency=str(e.currency),kind=str(e.type);
  const purchasedAt=millis(e.purchased_at_ms),eventTime=millis(e.event_timestamp_ms),price=e.price_in_purchased_currency;
  if(!productId||!transactionId||!store||!environment||!currency||!kind||!purchasedAt||!eventTime||
   !['APP_STORE','PLAY_STORE'].includes(store)||!['PRODUCTION','SANDBOX'].includes(environment)||!/^[A-Z]{3}$/.test(currency)||
   e.period_type==='TRIAL'||typeof price!=='number'||!Number.isFinite(price)||price<=0||purchasedAt<start||eventTime<start){excluded+=rows.length;continue;}
  facts.push({key,vendorId:v.vendorId,userId:v.userId,productId,transactionId,store,environment,purchasedAt,price,currency,kind});
 }
 const candidates=new Map<string,Set<string>>(),attemptSource=new Map<string,{flowId:string;source:string}>();
 const ambiguousSources=new Set<string>();let unmatchedClaims=0;
 const usable=checkpoints.filter(row=>Number.isFinite(Date.parse(row.received_at))&&Date.parse(row.received_at)>=start&&obj(row.payload));
 for(const result of usable){
  const p=result.payload as Obj,d=p.detail,flow=p.flow;if(!obj(d)||!obj(flow)||d.name!=='purchase_result'||d.attribution!=='consistent'||
   !['sdk_returned_entitlement','sdk_returned_no_entitlement'].includes(String(d.outcome))||!obj(d.correlation))continue;
  const c=d.correlation,actor=uuid(result.user_id);if(!actor)continue;
  const matches=facts.filter(f=>f.userId===actor&&f.transactionId===c.transactionId&&f.productId===c.productId);
  const quarantinedMatch=variants.some(v=>v.key&&conflicted.has(v.key)&&v.userId===actor&&v.event.transaction_id===c.transactionId&&v.event.product_id===c.productId);
  // Optional dimensions cannot hide a second trusted key, including a quarantined conflicting key.
  if(matches.length!==1||quarantinedMatch){unmatchedClaims++;for(const f of matches)ambiguousSources.add(f.key);continue;}
  const fact=matches[0];
  if((c.store!==undefined&&c.store!==fact.store)||(c.environment!==undefined&&c.environment!==fact.environment)){ambiguousSources.add(fact.key);continue;}
  const attempts=usable.filter(a=>{const ap=a.payload as Obj,ad=ap.detail,af=ap.flow;
   return uuid(a.user_id)===actor&&obj(ad)&&obj(af)&&ad.name==='purchase_attempt'&&ad.attribution==='consistent'&&
    ad.attemptId===d.attemptId&&af.flowId===flow.flowId&&af.source===flow.source&&obj(ad.offer)&&ad.offer.productId===fact.productId;
  });
  if(attempts.length!==1){if(attempts.length>1)ambiguousSources.add(fact.key);unmatchedClaims++;continue;}
  const attemptTime=Date.parse(attempts[0].received_at),resultTime=Date.parse(result.received_at);
  if(attemptTime>resultTime||fact.purchasedAt<attemptTime-120000||fact.purchasedAt>attemptTime+1800000){unmatchedClaims++;continue;}
  const attemptKey=JSON.stringify([actor,flow.flowId,d.attemptId]);
  const set=candidates.get(fact.key)||new Set<string>();set.add(attemptKey);candidates.set(fact.key,set);
  attemptSource.set(attemptKey,{flowId:String(flow.flowId),source:String(flow.source)});
 }
 const payments=facts.map(f=>{const attempts=candidates.get(f.key)||new Set<string>();
  const status=ambiguousSources.has(f.key)||attempts.size>1?'ambiguous':attempts.size===1?'matched':'unattributed';
  return {...f,status,flow:status==='matched'?attemptSource.get([...attempts][0]):null,firstPaidStatus:'unknown' as const};
 });
 // Quarantine has NO chosen amount/product: it must never masquerade as a financial fact.
 const quarantined=[...conflicted].sort().map(key=>({key,vendorEventIds:[...new Set(variants.filter(v=>v.key===key).map(v=>v.vendorId))].sort(),reason:'conflicting_provider_variants' as const}));
 return {payments,quarantined,providerRowsInspected:providerRows.length,observedPaymentCount:payments.length,
  matchedPaymentCount:payments.filter(p=>p.status==='matched').length,unmappedPaymentCount:payments.filter(p=>!p.userId).length,
  excludedProviderRows:excluded,conflictingVendorIds:conflictingVendors.size,conflictingTransactionKeys:conflicted.size,unmatchedClaims,
  coverage:'provider_purchases_observed_only' as const,mirrorCompleteness:'unverified' as const};
}

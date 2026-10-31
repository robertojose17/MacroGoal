// Owner/service-only pure reconciliation. No database writes and no public endpoint.
// Input must be the COMPLETE authorized provider mirror since the reviewed trust boundary,
// across ALL stores/environments, plus checkpoints. Never prefilter by client dimensions.
type Obj=Record<string,unknown>;
const obj=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown)=>typeof v==='string'&&v.length>0?v:null;
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)?v.toLowerCase():null;
const millis=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
export type ProviderRow={raw_event:unknown;event_data:unknown;user_id:string|null;created_at:string};
export type CheckpointRow={user_id:string;received_at:string;payload:unknown};
type Fact={key:string;vendorId:string;userId:string|null;productId:string;transactionId:string;store:string;environment:string;purchasedAt:number;price:number;currency:string;kind:string};
export function reconcileObservedPayments(providerRows:ProviderRow[],checkpoints:CheckpointRow[],captureStart:string){
 const start=Date.parse(captureStart);if(!Number.isFinite(start))throw Error('reviewed_capture_start_required');
 const normalized:Fact[]=[];let excluded=0;
 for(const row of providerRows){
  const raw=obj(row.raw_event)?row.raw_event:null,data=obj(row.event_data)?row.event_data:null;
  const event=raw?.event??data?.event??raw??data;
  if(!obj(event)){excluded++;continue;}
  const vendorId=str(event.id),transactionId=str(event.transaction_id),productId=str(event.product_id);
  const store=str(event.store),environment=str(event.environment),currency=str(event.currency),kind=str(event.type);
  const purchasedAt=millis(event.purchased_at_ms),eventTime=millis(event.event_timestamp_ms),price=event.price_in_purchased_currency;
  if(!vendorId||!transactionId||!productId||!store||!environment||!currency||!kind||!purchasedAt||!eventTime||
   !['APP_STORE','PLAY_STORE'].includes(store)||!['PRODUCTION','SANDBOX'].includes(environment)||!/^[A-Z]{3}$/.test(currency)||
   !['INITIAL_PURCHASE','RENEWAL','NON_RENEWING_PURCHASE'].includes(kind)||event.period_type==='TRIAL'||
   typeof price!=='number'||!Number.isFinite(price)||price<=0||purchasedAt<start||eventTime<start||Date.parse(row.created_at)<start||!Number.isFinite(Date.parse(row.created_at))){excluded++;continue;}
  const actor=uuid(event.app_user_id),mapped=uuid(row.user_id);
  // Conservative account binding. Aliases/original IDs are never guessed.
  const userId=actor&&actor===mapped?actor:null;
  normalized.push({key:JSON.stringify([store,environment,transactionId]),vendorId,userId,productId,transactionId,store,environment,purchasedAt,price,currency,kind});
 }
 const signature=(f:Fact)=>JSON.stringify([f.userId,f.productId,f.transactionId,f.store,f.environment,f.purchasedAt,f.price,f.currency,f.kind]);
 const vendors=new Map<string,Fact[]>(),keys=new Map<string,Fact[]>();
 for(const f of normalized){vendors.set(f.vendorId,[...(vendors.get(f.vendorId)||[]),f]);keys.set(f.key,[...(keys.get(f.key)||[]),f]);}
 const conflicted=new Set<string>();
 for(const rows of vendors.values())if(new Set(rows.map(signature)).size!==1)for(const f of rows)conflicted.add(f.key);
 for(const [key,rows]of keys)if(new Set(rows.map(signature)).size!==1)conflicted.add(key);
 const facts=[...keys.values()].map(rows=>rows[0]);
 const candidates=new Map<string,Set<string>>();const attemptSource=new Map<string,{flowId:string;source:string}>();
 const ambiguousFacts=new Set(conflicted);let unmatchedClaims=0;
 const usable=checkpoints.filter(row=>Number.isFinite(Date.parse(row.received_at))&&Date.parse(row.received_at)>=start&&obj(row.payload));
 for(const result of usable){
  const p=result.payload as Obj,d=p.detail,flow=p.flow;if(!obj(d)||!obj(flow)||d.name!=='purchase_result'||d.attribution!=='consistent'||
   !['sdk_returned_entitlement','sdk_returned_no_entitlement'].includes(String(d.outcome))||!obj(d.correlation))continue;
  const c=d.correlation,actor=uuid(result.user_id);if(!actor)continue;
  // Resolve across all trusted store/environment keys BEFORE considering optional dimensions.
  const matches=facts.filter(f=>f.userId===actor&&f.transactionId===c.transactionId&&f.productId===c.productId);
  if(matches.length!==1){unmatchedClaims++;for(const f of matches)ambiguousFacts.add(f.key);continue;}
  const fact=matches[0];
  if(conflicted.has(fact.key)||(c.store!==undefined&&c.store!==fact.store)||(c.environment!==undefined&&c.environment!==fact.environment)){
   ambiguousFacts.add(fact.key);continue;
  }
  const attempts=usable.filter(a=>{const ap=a.payload as Obj,ad=ap.detail,af=ap.flow;
   return uuid(a.user_id)===actor&&obj(ad)&&obj(af)&&ad.name==='purchase_attempt'&&ad.attribution==='consistent'&&
    ad.attemptId===d.attemptId&&af.flowId===flow.flowId&&af.source===flow.source&&obj(ad.offer)&&ad.offer.productId===fact.productId;
  });
  if(attempts.length!==1){if(attempts.length>1)ambiguousFacts.add(fact.key);unmatchedClaims++;continue;}
  const attemptTime=Date.parse(attempts[0].received_at);
  if(fact.purchasedAt<attemptTime-120000||fact.purchasedAt>attemptTime+1800000){unmatchedClaims++;continue;}
  const attemptKey=JSON.stringify([actor,flow.flowId,d.attemptId]);
  const set=candidates.get(fact.key)||new Set<string>();set.add(attemptKey);candidates.set(fact.key,set);
  attemptSource.set(attemptKey,{flowId:String(flow.flowId),source:String(flow.source)});
 }
 const payments=facts.map(f=>{const attempts=candidates.get(f.key)||new Set<string>();
  const status=ambiguousFacts.has(f.key)||attempts.size>1?'ambiguous':attempts.size===1?'matched':'unattributed';
  return {...f,status,flow:status==='matched'?attemptSource.get([...attempts][0]):null,firstPaidStatus:'unknown' as const};
 });
 return {payments,excludedProviderRows:excluded,conflictingTransactionKeys:conflicted.size,unmatchedClaims,
  coverage:'provider_purchases_observed_only' as const,mirrorCompleteness:'unverified' as const};
}

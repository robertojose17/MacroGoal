import { dailyAccess, type DailyAccess, type DailyMealSlot } from './coachDailyAction';
import { mealEvidenceFromOption } from './coachMealReviewAdapter';

export type MealExploreInput = { food_query: string; mode: 'cook'|'quick'|'eat_out'; exclusions: string[]; allergens: string[]; available_minutes?: number; restaurant?: string; public_area?: string; preference?: 'balanced'|'high_protein'|'lower_calorie'|'preferred_food' };
export type MealRequest = ({ operation:'explore' } & MealExploreInput) | { operation:'discover'; source_request_id:string; consent:true } | { operation:'estimate'; source_request_id:string; option_id:string; consent:true; portion_label?:string } | { operation:'import_discovery'; source_request_id:string } | { operation:'review'; source_request_id:string; option_id:string; servings:number; edited_values?:Partial<Record<'calories'|'protein'|'carbs'|'fats'|'fiber',number>>; estimate_acknowledged:boolean; ingredient_review_acknowledged:boolean; modification?:string };
type Envelope = MealRequest & { intent:'meal_choice'; experience:'meal_v2'; request_id:string; time_zone:string };
export type MealPending = { owner:string; date:string; meal:DailyMealSlot; mode:MealExploreInput['mode']; envelope:Envelope; recovery:'daily'|'discovery'; completed?:boolean };
type Store = { getItem(k:string):Promise<string|null>; setItem(k:string,v:string):Promise<void>; removeItem(k:string):Promise<void> };
export type MealResponse = { kind:'ready'; requestId:string; owner:string; date:string; meal:DailyMealSlot; mode:MealExploreInput['mode']; body:any } | { kind:'blocked'|'unavailable'|'pending'; reason:string };
export type MealAccess = DailyAccess | (()=>DailyAccess);
const ready=(access:MealAccess)=>dailyAccess(typeof access==='function'?access():access)==='ready';
const canonical=(v:any):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function validEnvelope(e:any){
 if(!e||!uuid(e.request_id)||e.intent!=='meal_choice'||e.experience!=='meal_v2'||typeof e.time_zone!=='string'||e.time_zone.length>100)return false;
 const common=['intent','experience','operation','request_id','time_zone'];
 const fields=e.operation==='explore'?['food_query','mode','exclusions','allergens','available_minutes','restaurant','public_area','preference']:e.operation==='discover'?['source_request_id','consent']:e.operation==='estimate'?['source_request_id','option_id','consent','portion_label']:e.operation==='import_discovery'?['source_request_id']:e.operation==='review'?['source_request_id','option_id','servings','edited_values','estimate_acknowledged','ingredient_review_acknowledged','modification']:null;
 if(!fields||Object.keys(e).some(k=>![...common,...fields].includes(k)))return false;
 const short=(v:any,max=160)=>typeof v==='string'&&v.length<=max;
 if(e.operation==='explore')return short(e.food_query)&&['cook','quick','eat_out'].includes(e.mode)&&[e.exclusions,e.allergens].every(xs=>Array.isArray(xs)&&xs.length<=12&&xs.every(v=>short(v,60)))&&(e.restaurant===undefined||short(e.restaurant))&&(e.public_area===undefined||short(e.public_area))&&(e.available_minutes===undefined||Number.isInteger(e.available_minutes)&&e.available_minutes>=1&&e.available_minutes<=240)&&(e.preference===undefined||['balanced','high_protein','lower_calorie','preferred_food'].includes(e.preference));
 if(!uuid(e.source_request_id)||e.source_request_id===e.request_id)return false;
 if(e.operation==='discover')return e.consent===true;
 if(e.operation==='estimate')return e.consent===true&&short(e.option_id,200)&&e.option_id.length>0&&(e.portion_label===undefined||short(e.portion_label,160)&&e.portion_label.trim().length>0);
 if(e.operation==='review')return short(e.option_id,200)&&e.option_id.length>0&&typeof e.servings==='number'&&Number.isFinite(e.servings)&&e.servings>0&&e.servings<=20&&typeof e.estimate_acknowledged==='boolean'&&typeof e.ingredient_review_acknowledged==='boolean'&&(e.modification===undefined||short(e.modification,300))&&(e.edited_values===undefined||e.edited_values&&typeof e.edited_values==='object'&&!Array.isArray(e.edited_values)&&Object.entries(e.edited_values).every(([k,v])=>['calories','protein','carbs','fats','fiber'].includes(k)&&typeof v==='number'&&Number.isFinite(v)&&v>=0));
 return true;
}
const locks=new Set<string>();
export function createMealTransport(deps:{owner():Promise<string|undefined>;today():string;zone():string;newId():string;scope:string;store:Store;invoke(body:Record<string,unknown>):Promise<Response>}) {
 const key=(owner:string,date:string)=>'coach_meal_v2:'+JSON.stringify([deps.scope,owner,date]);
 const scopeOK=async(owner:string,date:string,zone:string)=>await deps.owner()===owner&&deps.today()===date&&deps.zone()===zone;
 const valid=(r:any,owner:string,date:string,zone:string):r is MealPending=>r?.owner===owner&&r.date===date&&['breakfast','lunch','dinner','snack'].includes(r.meal)&&['cook','quick','eat_out'].includes(r.mode)&&r.envelope?.time_zone===zone&&validEnvelope(r.envelope)&&r.recovery===(r.envelope.operation==='discover'?'discovery':'daily');
 async function pending(access:MealAccess):Promise<MealPending|null>{
  if(!ready(access))return null;
  try{const owner=await deps.owner(),date=deps.today(),zone=deps.zone();if(!owner)return null;const raw=await deps.store.getItem(key(owner,date));if(!raw)return null;const r=JSON.parse(raw);return valid(r,owner,date,zone)&&await scopeOK(owner,date,zone)&&ready(access)?r:null;}catch{return null;}
 }
 async function run(access:MealAccess,request:MealRequest,selection:{meal:DailyMealSlot;mode:MealExploreInput['mode']},recover=false):Promise<MealResponse>{
  if(!ready(access))return {kind:'blocked',reason:'access_unavailable'};
  let k:string|undefined,locked=false;
  try{
   const owner=await deps.owner(),date=deps.today(),zone=deps.zone();if(!owner)return {kind:'blocked',reason:'unauthorized'};
   k=key(owner,date);if(locks.has(k))return {kind:'pending',reason:'execution_active'};locks.add(k);locked=true;
   const raw=await deps.store.getItem(k),previous=raw?JSON.parse(raw):null;
   if(previous&&!valid(previous,owner,date,zone))return {kind:'blocked',reason:'journal_scope_mismatch'};
   const requestOf=(e:Envelope)=>Object.fromEntries(Object.entries(e).filter(([name])=>!['request_id','time_zone','intent','experience'].includes(name)));
   const identical=previous&&canonical(requestOf(previous.envelope))===canonical(request)&&previous.meal===selection.meal&&previous.mode===selection.mode;
   if(recover&&!identical)return {kind:'blocked',reason:'recovery_scope_mismatch'};
   if(previous&&!recover&&!(previous.completed&&previous.envelope.operation==='discover'&&request.operation==='import_discovery'&&request.source_request_id===previous.envelope.request_id))return {kind:'pending',reason:'recover_existing_request'};
   const record:MealPending=recover?previous:{owner,date,...selection,envelope:{intent:'meal_choice',experience:'meal_v2',...request,request_id:deps.newId(),time_zone:zone},recovery:request.operation==='discover'?'discovery':'daily'};
   if(!valid(record,owner,date,zone))return {kind:'blocked',reason:'invalid_envelope'};
   if(!recover)await deps.store.setItem(k,JSON.stringify(record));
   if(!await scopeOK(owner,date,zone)||!ready(access))return {kind:'blocked',reason:'scope_changed'};
   if(record.completed&&record.recovery==='discovery')return {kind:'ready',requestId:record.envelope.request_id,owner,date,meal:record.meal,mode:record.mode,body:{done:true,request_id:record.envelope.request_id,usage_status:'completed'}};
   const body=recover&&record.recovery==='daily'?{intent:'recover_daily',request_id:record.envelope.request_id,journey:'meal_explore_v1'}:record.envelope;
   const response=await deps.invoke(body);
   if(!response.ok){let error:any={};try{error=await response.json();}catch{}if(!await scopeOK(owner,date,zone))return {kind:'blocked',reason:'scope_changed'};if(error.request_id===record.envelope.request_id&&error.admission_state==='not_admitted')await deps.store.removeItem(k);return {kind:[401,403,429].includes(response.status)?'blocked':'pending',reason:typeof error.error==='string'?error.error:'request_unresolved'};}
   let output:any;
   if(record.recovery==='discovery'){
    if(!response.headers.get('content-type')?.includes('text/event-stream'))return {kind:'pending',reason:'discovery_stream_expected'};
    const parse=(line:string)=>{if(!line.startsWith('data:'))return;const text=line.slice(5).trim();if(!text||text==='[DONE]')return;const event=JSON.parse(text);if(event.done===true)output=event;};
    const reader=response.body?.getReader?.();
    const decoder=new TextDecoder();let buffer='',size=0;
    if(reader){try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1024*1024)throw Error('stream_too_large');buffer+=decoder.decode(part.value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()??'';for(const line of lines)parse(line);}buffer+=decoder.decode();if(buffer.trim())parse(buffer);}finally{reader.releaseLock();}}
    else{const text=await response.text();if(text.length>1024*1024)throw Error('stream_too_large');text.split('\n').forEach(parse);}
    if(output?.done&&output.request_id===record.envelope.request_id&&output.usage_status==='refunded'&&await scopeOK(owner,date,zone)&&ready(access)){await deps.store.removeItem(k);return {kind:'blocked',reason:'discovery_not_completed'};}
    if(!output?.done||output.request_id!==record.envelope.request_id||output.usage_status!=='completed')return {kind:'pending',reason:'discovery_unresolved'};
   }else{
    output=await response.json();if(output?.schema!=='meal_explore_v1'||output.owner!==owner||output.date!==date||!['options','clarify','discovery_available','review'].includes(output.status)||!Array.isArray(output.options)||output.options.length>3)return {kind:'pending',reason:'receipt_scope_mismatch'};
    if(output.options.some((o:any)=>!mealEvidenceFromOption(o,record.mode))||new Set(output.options.map((o:any)=>o.id)).size!==output.options.length||output.status==='options'&&!output.options.length)return {kind:'pending',reason:'invalid_meal_option'};
    if(record.envelope.operation==='review'&&(output.status!=='review'||output.review?.logged!==false||output.review.option_id!==record.envelope.option_id||output.review.servings!==record.envelope.servings))return {kind:'pending',reason:'review_scope_mismatch'};
    if(record.envelope.operation!=='review'&&output.status==='review')return {kind:'pending',reason:'unexpected_review'};
   }
   if(!await scopeOK(owner,date,zone)||!ready(access))return {kind:'blocked',reason:'scope_changed'};
   if(record.recovery==='discovery')await deps.store.setItem(k,JSON.stringify({...record,completed:true}));else await deps.store.removeItem(k);
   return {kind:'ready',requestId:record.envelope.request_id,owner,date,meal:record.meal,mode:record.mode,body:output};
  }catch{return {kind:'pending',reason:'dispatch_or_recovery_unknown'};}finally{if(k&&locked)locks.delete(k);}
 }
 return {pending,run,recover:async(access:MealAccess)=>{const record=await pending(access);if(!record)return {kind:'blocked',reason:'no_pending_request'} as MealResponse;const {intent,experience,request_id,time_zone,...request}=record.envelope;return run(access,request,{meal:record.meal,mode:record.mode},true);}};
}

import {evaluateCoachAccess,type Subscription} from '../_shared/coach-access.ts';
import {dailyContext,catalogOptions,localDay,type DailyData,type CatalogMeal,type MealType} from './daily.ts';

type Intent='today'|'recommend';
export type Dependencies={
 now:()=>number;
 authenticate:(authorization:string)=>Promise<string|null>;
 subscriptions:(ownerId:string)=>Promise<Subscription[]>;
 resolveAccess?:(ownerId:string,now:number)=>Promise<'premium'|'free'|'unknown'>;
 // REQUIRED: wire to the actual server admission/accounting/safety wrapper.
 // It must enforce existing policy, idempotency, usage/cost limits and settlement.
 // It may deny without calling work. This candidate has no permissive default.
 withExistingGates:(input:{ownerId:string;requestId:string;intent:Intent;fingerprint:string},work:()=>Promise<Response>)=>Promise<Response>;
 loadDaily:(ownerId:string,date:string)=>Promise<DailyData>;
 loadCatalog:(ownerId:string,mealType:MealType)=>Promise<CatalogMeal[]>;

};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const canonical=(value:unknown):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}':JSON.stringify(value);
const meal=(v:unknown):v is MealType=>['breakfast','lunch','dinner','snack'].includes(String(v));
async function currentAccess(d:Dependencies,owner:string){
 const projected=evaluateCoachAccess(await d.subscriptions(owner),d.now());
 return projected==='unknown'&&d.resolveAccess?await d.resolveAccess(owner,d.now()):projected;
}
function createReadHandler(d:Dependencies){return async(req:Request):Promise<Response>=>{
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 const authorization=req.headers.get('authorization')??'';if(!/^Bearer \S+$/.test(authorization))return json({error:'unauthorized'},401);
 let owner:string|null;try{owner=await d.authenticate(authorization);}catch{return json({error:'auth_unavailable'},503);}if(!owner)return json({error:'unauthorized'},401);
 let body:any;try{const raw=await req.text();if(new TextEncoder().encode(raw).length>8192)throw Error();body=JSON.parse(raw);}catch{return json({error:'invalid_request'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body)||!uuid(body.request_id)||!['today','recommend'].includes(body.intent))return json({error:'invalid_request'},400);
 const allowed=body.intent==='today'?['intent','request_id','time_zone']:['intent','request_id','time_zone','meal_type'];
 if(Object.keys(body).some(k=>!allowed.includes(k)))return json({error:'invalid_request'},400);
 if(typeof body.time_zone!=='string'||body.time_zone.length>100)return json({error:'time_zone_required'},400);
 let access;try{access=await currentAccess(d,owner);}catch{return json({error:'entitlement_unavailable'},503);}
 if(access!=='premium')return json({error:access==='free'?'premium_required':'entitlement_unavailable',admission_state:'not_admitted'},access==='free'?403:503);
 let date:string;try{date=localDay(d.now(),body.time_zone);}catch{return json({error:'invalid_time_zone'},400);}
 try{return await d.withExistingGates({ownerId:owner,requestId:body.request_id,intent:body.intent,fingerprint:canonical({...body,contract:'manual_v1'})},async()=>{
  let data:DailyData;try{data=await d.loadDaily(owner!,date);}catch{return json({status:'data_unavailable',next_action:'retry_context',message_key:'coach.daily.unavailable'},503);}
  const context=dailyContext(data,owner!,date);
  if(body.intent==='today')return json({...context,owner},context.status==='ready'?200:503);
  if(context.status!=='ready')return json(context,503);
  if(!meal(body.meal_type))return json({status:'clarify',question_key:'coach.meal.which_meal',choices:['breakfast','lunch','dinner','snack']});
  if(data.preferencesChecked!==true)return json({status:'needs_preferences',next_action:'review_preferences',message_key:'coach.meal.preferences_required'});
  let rows:CatalogMeal[];try{rows=await d.loadCatalog(owner!,body.meal_type);}catch{return json({status:'catalog_unavailable',next_action:'none',message_key:'coach.meal.catalog_unavailable'},503);}
  const options=catalogOptions(rows);
  if(body.intent==='recommend'){
   if(await d.authenticate(authorization)!==owner||await currentAccess(d,owner!)!=='premium')return json({error:'authorization_changed'},403);
   if(localDay(d.now(),body.time_zone)!==date)return json({error:'day_changed'},409);
   const saved=options.filter(o=>rows.some(r=>r.id===o.id&&r.version===o.version&&r.savedMealOwnerId===owner&&r.macrosPer==='meal'&&r.servingSize===1&&r.grams===undefined)).slice(0,3);
   return json({schema:'saved_meal_recommendations_v1',status:saved.length?'options':'no_options',owner,date,meal_type:body.meal_type,context,next_action:saved.length?'review_saved_meal':'none',options:saved.map(o=>({source:'saved_meal',meal_id:o.id,name:o.name,portion_basis:'1_saved_meal',nutrition:o.nutrition,nutrition_authority:'advisory_snapshot'}))});
  }
  return json({error:'invalid_request'},400);
 });}catch{return json({error:'journey_unavailable',next_action:'recover_existing_request'},503);}
};}

// Public v1 entry; proposal and confirmation remain a separate disabled candidate.
export function createManualHandoffV1Handler(d:Dependencies){
 const handler=createReadHandler(d);
 return async(req:Request)=>{
  const copy=req.clone();const response=await handler(req);if(!response.ok)return response;
  // Fence cached admission replays as well as freshly computed responses.
  try{
   const output=await response.clone().json();if(!output.owner)return response;
   const body=await copy.json();const current=await d.authenticate(req.headers.get('authorization')??'');
   if(current!==output.owner||await currentAccess(d,current!)!=='premium')return json({error:'authorization_changed'},403);
   if(localDay(d.now(),body.time_zone)!==output.date)return json({error:'day_changed'},409);
   return response;
  }catch{return json({error:'journey_unavailable'},503);}
 };
}




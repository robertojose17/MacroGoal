import {importedDiscoveryOutcome} from './meal-retrieval-outcome.ts';
import {confirmedMealDiscoveryRequest} from './confirmed-meal-discovery.ts';
import {dietaryConstraints,constrainMeals} from './dietary-constraints.ts';
import {currentMealCapabilities} from './meal-paid-capabilities.ts';
import {discoveryConsentMessage} from './meal-discovery-consent.ts';
import {createPaidMealAdmission} from './manual/paid-meal-admission.ts';
import {estimateMeal} from './meal-auto-estimate.ts';
import {guardedChat} from './chat-access.ts';
import {createV202Admission} from './manual/v202-admission.ts';
import {savedMealReviewPolicy} from './manual/saved-meal-policy.ts';
import {localDay} from './manual/daily.ts';
import {searchExistingGallery,type MealOption} from './gallery-meals.ts';
import {reviewMeal} from './meal-estimate-review.ts';
import {ownedDiscoveryMeals} from './discovery-meals.ts';
import {upgradeGallerySources} from './gallery-source-upgrade.ts';
import {containsExcludedIngredient,exclusionTerms} from './ingredient-constraints.ts';
import {WEB_PILOT_USER_IDS,WEB_SEARCH_APPROVED} from './coach-web-search.ts';
import type {Access} from './_shared/coach-access.ts';
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
const canonical=(v:any):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const short=(v:unknown,max=160)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export function createMealExploreRoute(db:any,modern:(req:Request)=>Promise<Response>,resolve?:(owner:string,now:number)=>Promise<Access>,now=Date.now,publicFetch:typeof fetch=fetch,estimator?:{key:()=>string;fetcher?:typeof fetch}){
 const policy={...savedMealReviewPolicy(db),async checkRequest(owner:string){const {data,error}=await db.from('coach_permissions').select('permission_level').eq('user_id',owner).maybeSingle();return !error&&[1,2,3,4].includes(data?.permission_level)?{allowed:true as const}:{allowed:false as const,reason:'safety_gate' as const};}};
 const admission=createV202Admission(db,policy,now,resolve);
 const run=guardedChat(db,async(req:Request)=>{
  let b:any;try{const text=await req.text();if(new TextEncoder().encode(text).length>8192)throw Error();b=JSON.parse(text);}catch{return json({error:'invalid_request'},400);}
  if(!uuid(b.request_id)||!short(b.time_zone,100))return json({error:'invalid_request'},400);
  let date:string;try{date=localDay(now(),b.time_zone);}catch{return json({error:'invalid_time_zone'},400);}
  const token=req.headers.get('authorization')!.slice(7),auth=await db.auth.getUser(token),owner=auth.data?.user?.id;if(auth.error||!owner)return json({error:'unauthorized'},401);
  const source=async(id:string)=>{const r=await db.rpc('coach_recover_requests_v1',{p_user_id:owner,p_request_id:id,p_offset:0});if(r.error||!Array.isArray(r.data))throw Error('source_unavailable');const row=r.data.find((x:any)=>x.request_id===id);const body=row?.result?.manual_handoff_v1?.body;if(row?.state!=='completed'||row?.request_payload?.journey!=='meal_explore_v1'||body?.owner!==owner||body?.date!==date||body?.schema!=='meal_explore_v1')throw Error('source_scope_mismatch');return body;};
  const freshResponse=async(result:Response)=>{
   let response=result;
   if(result.ok){const value=await result.clone().json();if(value.owner!==owner||value.date!==date)return json({error:'stale_receipt'},409);
    if(value.schema==='meal_explore_v1')response=json({...value,paid_capabilities:await currentMealCapabilities(db,owner,Boolean(estimator?.key()))},result.status);
   }
   if((await db.auth.getUser(token)).data?.user?.id!==owner||date!==localDay(now(),b.time_zone))return json({error:'authorization_changed'},403);
   return guardedChat(db,async()=>response,resolve,now)(new Request(req.url,{method:'POST',headers:req.headers,body:'{}'}));
  };
  if(b.operation==='estimate'){
   if(Object.keys(b).some(k=>!['intent','experience','operation','request_id','time_zone','source_request_id','option_id','portion_label','consent'].includes(k))||!uuid(b.source_request_id)||b.source_request_id===b.request_id||!short(b.option_id,200)||b.portion_label!==undefined&&!short(b.portion_label,160)||b.consent!==true)return json({error:'explicit_estimate_consent_required'},400);
   const prior=await source(b.source_request_id),option=prior.options?.find((o:MealOption)=>o.id===b.option_id);
   if(!option)return json({error:'option_not_found'},404);
   if(option.identity?.kind==='restaurant'&&!option.identity.variant&&!option.identity.portion_label&&!b.portion_label)return json({schema:'meal_explore_v1',owner,date,status:'clarify',question:{key:'portion_label'},options:[]});
   if(!WEB_SEARCH_APPROVED||!WEB_PILOT_USER_IDS.includes(owner))return json({error:'existing_search_pilot_required',admission_state:'not_admitted'},403);
   const opt=await db.rpc('coach_web_pilot_enabled_v1',{p_user_id:owner});if(opt.error||opt.data!==true)return json({error:'existing_search_opt_in_required',admission_state:'not_admitted'},403);
   const key=estimator?.key();if(!key)return json({error:'estimator_not_configured',admission_state:'not_admitted'},503);
   const payload={...b,contract:'manual_v1',intent:'recommend',journey:'meal_explore_v1'};
   const paid=createPaidMealAdmission(db,policy,now,resolve);
   const result=await paid.run({ownerId:owner,requestId:b.request_id,intent:'recommend',fingerprint:canonical(payload)},async context=>{
    const selected=b.portion_label?{...option,identity:{...option.identity,portion_label:b.portion_label}}:option;
    const estimated=await estimateMeal(selected,context,key,estimator?.fetcher);
    return json({schema:'meal_explore_v1',owner,date,status:'options',options:[estimated],next_action:'review_option',confirmation_transport:'existing_log_food',server_auto_logging:false});
   });
   if((await db.auth.getUser(token)).data?.user?.id!==owner||date!==localDay(now(),b.time_zone))return json({error:'authorization_changed'},403);
   return freshResponse(result);
  }
  if(b.operation==='discover'){
   if(Object.keys(b).some(k=>!['intent','experience','operation','request_id','time_zone','source_request_id','consent','retry_of_request_id','retry_consent'].includes(k))||!uuid(b.source_request_id)||b.request_id===b.source_request_id||b.consent!==true)return json({error:'explicit_discovery_consent_required'},400);
   if(b.retry_of_request_id!==undefined?(!uuid(b.retry_of_request_id)||b.retry_of_request_id.toLowerCase()===b.request_id.toLowerCase()||b.retry_consent!==true):b.retry_consent!==undefined)return json({error:'explicit_retry_consent_required'},400);
   const original=await source(b.source_request_id),query=original.discovery_request;
   if(!query||!short(query.food)||!['recipe','restaurant'].includes(query.mode))return json({error:'discovery_request_unavailable'},409);
   // No automatic pilot expansion or direct paid recipe-finder call. Modern still
   // owns reservation, phase authorization, paid bounds, persistence and replay.
   if(!WEB_SEARCH_APPROVED||!WEB_PILOT_USER_IDS.includes(owner))return json({error:'existing_search_pilot_required',admission_state:'not_admitted'},403);
   const opt=await db.rpc('coach_web_pilot_enabled_v1',{p_user_id:owner});if(opt.error||opt.data!==true)return json({error:'existing_search_opt_in_required',admission_state:'not_admitted'},403);
   let publicText:string;try{publicText=discoveryConsentMessage(query);}catch(e){return json({error:(e as Error).message,next_action:'clarify_public_search'},400);}
   return modern(confirmedMealDiscoveryRequest(req.url,req.headers,{request_id:b.request_id,...(b.retry_of_request_id!==undefined?{retry_of_request_id:b.retry_of_request_id,retry_consent:true}:{}),meal_source_request_id:b.source_request_id,messages:[{role:'user',content:publicText}],use_web:true,language:'en'},owner));
  }
  const allowed=b.operation==='explore'?['intent','experience','operation','request_id','time_zone','food_query','mode','available_minutes','restaurant','public_area','preference','exclusions','allergens','dietary_preferences']:b.operation==='import_discovery'?['intent','experience','operation','request_id','time_zone','source_request_id']:['intent','experience','operation','request_id','time_zone','source_request_id','option_id','servings','edited_values','estimate_acknowledged','ingredient_review_acknowledged','modification'];
  if(Object.keys(b).some(k=>!allowed.includes(k)))return json({error:'invalid_request'},400);
  if(b.operation==='explore'){
   try{dietaryConstraints(b);}catch{return json({error:'invalid_dietary_constraints'},400);}
   if(!['cook','quick','eat_out'].includes(b.mode)||!short(b.food_query))return json({schema:'meal_explore_v1',owner,date,status:'clarify',question:{key:!short(b.food_query)?'food_query':'mode'},options:[]});
   if(![b.exclusions,b.allergens].every(a=>Array.isArray(a)&&a.length<=12&&a.every((x:any)=>short(x,60)))||b.available_minutes!==undefined&&(!Number.isInteger(b.available_minutes)||b.available_minutes<1||b.available_minutes>240)||b.preference!==undefined&&!['balanced','high_protein','lower_calorie','preferred_food'].includes(b.preference)||b.restaurant!==undefined&&!short(b.restaurant)||b.public_area!==undefined&&!short(b.public_area))return json({error:'invalid_request'},400);
   if(b.mode==='eat_out'&&!short(b.public_area))return json({schema:'meal_explore_v1',owner,date,status:'clarify',question:{key:'public_area'},options:[]});
  }else if(!uuid(b.source_request_id)||b.operation==='review'&&!short(b.option_id,200))return json({error:'invalid_review'},400);
  const payload={...b,contract:'manual_v1',intent:'recommend',journey:'meal_explore_v1'};
  const result=await admission.run({ownerId:owner,requestId:b.request_id,intent:'recommend',fingerprint:canonical(payload)},async()=>{
   if(b.operation==='import_discovery'){
    const r=await db.rpc('coach_recover_requests_v1',{p_user_id:owner,p_request_id:b.source_request_id,p_offset:0});const row=Array.isArray(r.data)?r.data.find((x:any)=>x.request_id===b.source_request_id):null;
    if(r.error||row?.state!=='completed'||row.user_id!==undefined&&row.user_id!==owner||!Number.isFinite(Date.parse(row.created_at))||localDay(Date.parse(row.created_at),b.time_zone)!==date)return json({error:'discovery_receipt_unavailable'},409);
    const originId=row.request_payload?.meal_source_request_id;
    const origin=originId?await source(originId):null,constraints=origin?dietaryConstraints(origin.dietary_constraints):null;
    const validated=ownedDiscoveryMeals(row.result),options=constraints?constrainMeals(validated,constraints):validated;return json({schema:'meal_explore_v1',owner,date,...importedDiscoveryOutcome(options,validated.length>0),options,...(!options.length&&origin?{source_request_id:originId,discovery_request:origin.discovery_request,dietary_constraints:constraints}:{}),confirmation_transport:'existing_log_food',server_auto_logging:false});
   }
   if(b.operation==='review'){
    const prior=await source(b.source_request_id),option=prior.options?.find((o:MealOption)=>o.id===b.option_id);if(!option)return json({error:'option_not_found'},404);
    try{return json({schema:'meal_explore_v1',owner,date,status:'review',review:reviewMeal(option,b),options:[]});}catch(e){return json({error:e instanceof Error?e.message:'invalid_review'},400);}
   }
   const found=b.mode==='eat_out'?{options:[],coverage:'restaurant_requires_discovery'}:await searchExistingGallery(db,{...b,desired_food:b.food_query},owner);
   found.options=await upgradeGallerySources(found.options,publicFetch,now());
   if(exclusionTerms(b.exclusions).unsupported.length===0&&b.exclusions.length)found.options=found.options.filter((o:MealOption)=>!containsExcludedIngredient(o.ingredients,b.exclusions));
   const constraints=dietaryConstraints(b);found.options=constrainMeals(found.options,constraints);
   const discovery_request={dietary_constraints:constraints,mode:b.mode==='eat_out'?'restaurant':'recipe',food:b.food_query,...(b.restaurant?{restaurant:b.restaurant}:{}),...(b.public_area?{area:b.public_area}:{}),...(b.available_minutes?{max_minutes:b.available_minutes}:{}),...(b.preference?{preference:b.preference}:{})};
   return json({schema:'meal_explore_v1',owner,date,status:found.options.length?'options':'discovery_available',coverage:found.coverage,dietary_constraints:constraints,options:found.options,discovery_request,next_action:found.options.length?'review_option':'request_public_discovery_consent',confirmation_transport:'existing_log_food',server_auto_logging:false});
  });
  if((await db.auth.getUser(token)).data?.user?.id!==owner||date!==localDay(now(),b.time_zone))return json({error:'authorization_changed'},403);
  if(result.ok){const value=await result.clone().json();if(value.owner!==owner||value.date!==date)return json({error:'stale_receipt'},409);}
  return freshResponse(result);
 },resolve,now);
 return async(req:Request)=>{let b:any;try{b=await req.clone().json();}catch{return null;}if(b?.intent!=='meal_choice'||b?.experience!=='meal_v2')return null;if(!['explore','discover','review','import_discovery','estimate'].includes(b.operation))return json({error:'invalid_operation'},400);try{return await run(req);}catch{return json({error:'meal_exploration_unavailable',next_action:'recover_existing_request'},503);}};
}

import {guardedChat} from './chat-access.ts';
import {createV202Admission} from './manual/v202-admission.ts';
import {savedMealReviewPolicy} from './manual/saved-meal-policy.ts';
import {sourceDependencies} from './manual/source-adapter.ts';
import {localDay} from './manual/daily.ts';
import {chooseMeals,mealQuestion,validConstraints,type ChoiceInput} from './meal-choice.ts';
import {receiptCandidates} from './meal-choice-source.ts';
import {libraryCandidates} from './meal-choice-library.ts';
import type {Access} from './_shared/coach-access.ts';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const canonical=(x:any):string=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
export function createMealChoiceRoute(db:any,resolve?:(owner:string,now:number)=>Promise<Access>,now=Date.now,publicFetch:typeof fetch=fetch){
 const policy=savedMealReviewPolicy(db);
 const admission=createV202Admission(db,{...policy,async checkRequest(owner){const {data,error}=await db.from('coach_permissions').select('permission_level').eq('user_id',owner).maybeSingle();return !error&&[1,2,3,4].includes(data?.permission_level)?{allowed:true}:{allowed:false,reason:'safety_gate'};}},now,resolve);
 const deps=sourceDependencies(db,admission,now);
 const run=guardedChat(db,async req=>{
  let body:any;try{const raw=await req.text();if(new TextEncoder().encode(raw).length>8192)throw Error();body=JSON.parse(raw);}catch{return json({error:'invalid_request'},400);}
  const allowed=['intent','request_id','time_zone','mode','meal_type','constraints','preference','meals_remaining','diary_complete','source_request_id'];
  if(!body||Object.keys(body).some(k=>!allowed.includes(k))||!uuid(body.request_id)||typeof body.time_zone!=='string'||body.time_zone.length>100||body.source_request_id!==undefined&&!uuid(body.source_request_id)||body.constraints!==undefined&&!validConstraints(body.constraints)||body.preference!==undefined&&!['balanced','protein'].includes(body.preference))return json({error:'invalid_request'},400);
  let date:string;try{date=localDay(now(),body.time_zone);}catch{return json({error:'invalid_time_zone'},400);}
  const auth=req.headers.get('authorization')!;const owner=await deps.authenticate(auth);if(!owner)return json({error:'unauthorized'},401);
  const question=mealQuestion(body);if(question)return json({schema:'guided_meal_choice_v1',owner,date,status:'clarify',question,options:[],next_action:'answer_question'});
  const payload={...body,contract:'manual_v1',intent:'recommend',journey:'meal_choice_v1'};
  const response=await admission.run({ownerId:owner,requestId:body.request_id,intent:'recommend',fingerprint:canonical(payload)},async()=>{
   const data=await deps.loadDaily(owner,date);
   let rows=body.source_request_id?await receiptCandidates(db,owner,body.source_request_id,body.mode,now()):[];
   let source_coverage;
   if(!rows.length&&['cook','quick'].includes(body.mode)){const library=await libraryCandidates(db,owner,body.mode,publicFetch,now());rows=library.candidates;source_coverage=library.coverage;}
   const result=chooseMeals({...body,preference:body.preference??'balanced'} as ChoiceInput,data,rows,owner,date);
   return json({schema:'guided_meal_choice_v1',owner,date,...result,source_coverage});
  });
  // Fence both newly produced output and immutable replays through current auth,
  // entitlement and read permission, without rerunning admission/work.
  if(await deps.authenticate(auth)!==owner||localDay(now(),body.time_zone)!==date)return json({error:'authorization_changed'},403);
  if(response.ok){const output=await response.clone().json();if(output.owner!==owner||output.date!==date)return json({error:'stale_receipt'},409);}
  return guardedChat(db,async()=>response,resolve,now)(new Request(req.url,{method:'POST',headers:req.headers,body:'{}'}));
 },resolve,now);
 return async(req:Request):Promise<Response|null>=>{
  if(req.method!=='POST')return null;let b:any;try{b=await req.clone().json();}catch{return null;}
  if(b?.intent!=='meal_choice')return null;
  try{return await run(req);}catch{return json({error:'meal_choice_unavailable',next_action:'recover_existing_request'},503);}
 };
}

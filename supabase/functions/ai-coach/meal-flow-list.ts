import {evaluateCoachAccess} from './_shared/coach-access.ts';
import {localDay} from './manual/daily.ts';
import {withPersistenceDeadline,TOTAL_DEADLINE_MS} from './bounded-provider-phase.ts';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const operations=['explore','import_discovery','estimate','prepare_general_estimate'];
const authorities=['unknown','estimated','user_edited','official','publisher_reported'];
export function createMealFlowListRoute(db:any,now=Date.now){
 return async(req:Request):Promise<Response|null>=>{
  if(req.method!=='POST')return null;
  let b:any;try{b=await req.clone().json();}catch{return null;}
  if(b?.intent!=='list_meal_flows')return null;
  if(Object.keys(b).length!==1)return json({error:'invalid_request'},400);
  const authorization=req.headers.get('authorization')??'';
  if(!/^Bearer \S+$/.test(authorization))return json({error:'unauthorized'},401);
  const deadline=now()+TOTAL_DEADLINE_MS;
  const timed=(fn:()=>PromiseLike<any>)=>withPersistenceDeadline(fn,deadline);
  const authenticate=async()=>{const r=await timed(()=>db.auth.getUser(authorization.slice(7)));return !r.error&&uuid(r.data?.user?.id)?r.data.user.id:null;};
  const permitted=async(owner:string)=>{
   const s=await timed(()=>db.from('subscriptions').select('entitlement_ids,status,expiration_at,purchased_at,billing_issues_detected_at').eq('user_id',owner));
   if(s.error||!Array.isArray(s.data)||evaluateCoachAccess(s.data,now())!=='premium')return false;
   const p=await timed(()=>db.from('coach_permissions').select('permission_level').eq('user_id',owner).maybeSingle());
   return !p.error&&[1,2,3,4].includes(p.data?.permission_level);
  };
  try{
   const owner=await authenticate();if(!owner)return json({error:'unauthorized'},401);
   if(!await permitted(owner))return json({error:'meal_flow_access_unavailable'},403);
   const r=await timed(()=>db.rpc('coach_list_meal_flows_v1',{p_user_id:owner}));
   if(r.error||!r.data||!Array.isArray(r.data.flows)||r.data.flows.length>20||typeof r.data.truncated!=='boolean')return json({error:'meal_flow_history_unavailable'},503);
   if(await authenticate()!==owner||!await permitted(owner)||await authenticate()!==owner)return json({error:'authorization_changed'},403);
   const seen=new Set<string>(),flows=[];
   for(const f of r.data.flows){
    if(!f||f.owner!==owner||!uuid(f.receipt_id)||seen.has(f.receipt_id)||!operations.includes(f.operation)||!['cook','quick','eat_out'].includes(f.mode)||typeof f.time_zone!=='string'||f.date!==localDay(now(),f.time_zone)||!Number.isFinite(Date.parse(f.saved_at))||!Array.isArray(f.options)||!f.options.length||f.options.length>3||f.options.some((o:any)=>!o||typeof o.name!=='string'||!o.name.trim()||o.name.length>300||!authorities.includes(o.nutrition_authority)))return json({error:'meal_flow_history_unavailable'},503);
    seen.add(f.receipt_id);flows.push({receipt_id:f.receipt_id,operation:f.operation,mode:f.mode,date:f.date,saved_at:f.saved_at,options:f.options.map((o:any)=>({name:o.name,nutrition_authority:o.nutrition_authority}))});
   }
   return json({schema:'meal_flow_list_v1',flows,truncated:r.data.truncated});
  }catch{return json({error:'meal_flow_history_unavailable'},503);}
 };
}

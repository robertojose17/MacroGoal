/** Explicit review request. POST may prepare baseline/eligibility/proposal; never GET. */
export const RULES14_SAFE_HOLD_REASONS=Object.freeze(["observed_log_days_insufficient","observed_logs_unverified","weight_days_insufficient","weight_distribution_insufficient","initial_fourteen_days_not_elapsed","journey_start_unverified","baseline_reconfirmation_required", "review_cooldown", "within_product_tolerance", "coverage_insufficient", "target_or_trend_unavailable", "rate_sensitivity_uncertain", "intake_sensitivity_uncertain", "intake_target_adherence_gap", "total_deficit_limit", "profile_support_required", "logged_intake_mean_unavailable", "current_target_outside_policy", "policy_limit_or_subincrement", "unsupported_age", "protein_reference_unavailable", "underweight_review_required", "individual_reference_weight_required", "explicit_macro_choice_required", "macro_preference_unavailable", "protein_review_required", "macro_distribution_unavailable", "manual_percentage_distribution_unavailable"] as const);
export const SNAPSHOT_REVIEW_MODE='adaptive-review-v1';
type Runtime=(request:unknown)=>Promise<{reason:string;proposal:unknown;mayHaveWritten?:boolean;engineVersion?:string}>;
/** Incoming Deno HTTP POSTs expose an empty stream even with Content-Length: 0.
 * Accept only proven EOF, never JSON/client parameters; bound time and reads. */
async function hasNoPayload(request:Request):Promise<boolean>{
 const length=request.headers.get('Content-Length');
 if(length!==null&&!/^0+$/.test(length))return false;
 if(request.body===null)return true;
 const reader=request.body.getReader();let timer:ReturnType<typeof setTimeout>|undefined;
 const read=async()=>{for(let i=0;i<2;i++){const chunk=await reader.read();if(chunk.done)return true;if(chunk.value.byteLength!==0)return false;}return false;};
 try{return await Promise.race([read().catch(()=>false),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),1000);})]);}
 finally{if(timer!==undefined)clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
export function createSnapshotHttpHandler(runtime:Runtime,allowedOrigins:readonly string[]){
 const origins=new Set(allowedOrigins);
 return async(request:Request):Promise<Response>=>{
  const origin=request.headers.get('Origin');
  const headers=new Headers({'Cache-Control':'private, no-store','Pragma':'no-cache','Vary':'Origin',
   'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'});
  if(origin&&origins.has(origin))headers.set('Access-Control-Allow-Origin',origin);
  const reply=(status:number,reason:string,proposal:unknown=null,mayHaveWritten=false)=>new Response(JSON.stringify({reason,proposal,...(mayHaveWritten?{mayHaveWritten:true}:{})}),{status,headers});
  if(origin&&!origins.has(origin))return reply(403,'origin_not_allowed');
  const url=new URL(request.url),modes=url.searchParams.getAll('mode');
  if(modes.length!==1||modes[0]!==SNAPSHOT_REVIEW_MODE||
   [...url.searchParams.keys()].some(k=>k!=='mode'))return reply(400,'invalid_request');
  if(request.method==='OPTIONS'){
   headers.set('Access-Control-Allow-Methods','POST, OPTIONS');
   headers.set('Access-Control-Allow-Headers','authorization, apikey, x-client-info, content-type');
   return new Response(null,{status:204,headers});
  }
  if(request.method!=='POST'){headers.set('Allow','POST, OPTIONS');return reply(405,'method_not_allowed');}
  if(!await hasNoPayload(request))return reply(400,'invalid_request');
  const authorization=request.headers.get('Authorization');
  if(!authorization||authorization.length>16384||!/^Bearer [^\s]+$/.test(authorization))return reply(401,'authentication_required');
  try{
   const result=await runtime({authorization});
   if(result.reason==='review_available'&&result.proposal!==null){
    const rate=typeof result.proposal==='object'&&['rate-proposal-record-v1','rules14-proposal-record-v1'].includes(String((result.proposal as {version?:unknown}).version));
    if(rate&&result.mayHaveWritten!==true)return reply(503,'source_error');
    return reply(200,'review_available',result.proposal,rate&&result.mayHaveWritten===true);
   }
   if(result.engineVersion==='rules14-observed-v2'&&result.proposal===null&&result.mayHaveWritten!==true&&RULES14_SAFE_HOLD_REASONS.includes(result.reason as typeof RULES14_SAFE_HOLD_REASONS[number]))return new Response(JSON.stringify({reason:'rules14_hold',proposal:null,actionable:false,holdReason:result.reason,engineVersion:'rules14-observed-v2'}),{status:200,headers});
   // Explicit setup envelopes are never actionable proposals. A verified baseline
   // write remains disclosed; unavailable source does not assert a saved baseline.
   if(result.engineVersion==='rules14-observed-v2'&&result.proposal===null&&result.reason==='calibration_required'&&result.mayHaveWritten===true)return new Response(JSON.stringify({reason:'rules14_setup',proposal:null,actionable:false,setupReason:'calibration_required',mayHaveWritten:true,engineVersion:'rules14-observed-v2'}),{status:202,headers});
   if(result.engineVersion==='rules14-observed-v2'&&result.proposal===null&&result.reason==='rate_anchor_source_unavailable'&&result.mayHaveWritten===false)return new Response(JSON.stringify({reason:'rules14_setup',proposal:null,actionable:false,setupReason:'baseline_unavailable',mayHaveWritten:false,engineVersion:'rules14-observed-v2'}),{status:200,headers});
   // Preserve successful calibration and uncertain writes before auth/error mapping.
    if(result.reason==='calibration_required'&&result.proposal===null&&result.mayHaveWritten===true)return reply(202,'calibration_required',null,true);
    if(['same_anchored_target','policy_limit','same_rate_target','within_product_tolerance','coverage_insufficient','target_or_trend_unavailable','rate_uncertainty_unverified','rate_difference_uncertain'].includes(result.reason)&&result.proposal===null)return reply(200,'no_change',null,result.mayHaveWritten===true);
    if(result.mayHaveWritten===true)return reply(409,'reconciliation_required',null,true);
    if(result.reason==='authentication_required'||result.reason==='account_changed')return reply(401,result.reason);
   if(result.reason==='safety_review_required')return reply(503,'safety_review_required');
   return reply(503,result.reason==='source_error'?'source_error':'review_not_ready');
  }catch{return reply(503,'source_error');}
 };
}
/** null means not selected: caller's existing legacy dispatcher remains untouched. */
export async function dispatchSnapshotReview(request:Request,handler:(request:Request)=>Promise<Response>):Promise<Response|null>{
 const modes=new URL(request.url).searchParams.getAll('mode');
 if(!modes.includes(SNAPSHOT_REVIEW_MODE))return null;
 return handler(request);
}





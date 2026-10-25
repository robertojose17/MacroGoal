const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const numeric=(v:any)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
/** Read a private Coach review linked at save time through the existing owner-RLS meal_items.off_data. */
export function createSavedMealDetailsRoute(db:any){
 return async(req:Request):Promise<Response|null>=>{
  if(req.method!=='POST')return null;
  let body:any;try{body=await req.clone().json();}catch{return null;}
  if(body?.intent!=='get_saved_meal_details')return null;
  if(Object.keys(body).length!==2||!uuid(body.meal_item_id))return json({error:'invalid_request'},400);
  const token=req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!token)return json({error:'unauthorized'},401);
  try{
   const auth=await db.auth.getUser(token),owner=auth.data?.user?.id;if(auth.error||!uuid(owner))return json({error:'unauthorized'},401);
   // Service-role query repeats the diary ownership predicate explicitly. No name/food-ID matching.
   const item=await db.from('meal_items').select('id,off_data,meals!inner(user_id)').eq('id',body.meal_item_id).eq('meals.user_id',owner).maybeSingle();
   if(item.error||!item.data)return json({error:'saved_details_unavailable'},404);
   const link=item.data.off_data?.coach_private_details;
   if(!link||link.version!==1||!uuid(link.review_request_id)||typeof link.option_id!=='string'||!link.option_id.trim()||link.option_id.length>200||/[\u0000-\u001f\u007f]/.test(link.option_id))return json({error:'saved_details_unavailable'},404);
   const recovered=await db.rpc('coach_recover_requests_v1',{p_user_id:owner,p_request_id:link.review_request_id,p_offset:0});
   if(recovered.error||!Array.isArray(recovered.data))return json({error:'saved_details_unavailable'},503);
   const row=recovered.data.find((r:any)=>r.request_id===link.review_request_id);
   const savedReview=row?.result?.manual_handoff_v1?.body?.review,hasComponents=!!savedReview&&Object.prototype.hasOwnProperty.call(savedReview,'components');
   if(row?.state!=='completed'||row.execution_state!=='completed'||row.request_payload?.journey!=='meal_explore_v1'||row.request_payload?.operation!=='review'||row.request_payload?.intent!=='recommend'||row.request_payload?.option_id!==link.option_id||row.result?.request_id!==link.review_request_id||row.result?.manual_handoff_v1?.status!==200||row.result?.manual_handoff_v1?.body?.schema!=='meal_explore_v1'||row.result?.manual_handoff_v1?.body?.owner!==owner||savedReview?.option_id!==link.option_id||hasComponents&&(!Array.isArray(savedReview.components)||savedReview.components.length>24))return json({error:'saved_details_unavailable'},404);
   const components=[];
   for(const c of savedReview.components??[]){
    if(!c||typeof c.id!=='string'||typeof c.name!=='string'||!c.name.trim()||c.name.length>160||typeof c.unit!=='string'||c.unit.length>40||!numeric(c.quantity)||c.grams!==null&&!numeric(c.grams)||!['official','publisher_reported','estimated'].includes(c.authority)||!c.nutrition||!['calories','protein','carbs','fats','fiber'].every(k=>numeric(c.nutrition[k])))return json({error:'saved_details_unavailable'},404);
    components.push({id:c.id,name:c.name,quantity:c.quantity,unit:c.unit,grams:c.grams,nutrition:c.nutrition,authority:c.authority,...(typeof c.source_url==='string'?{source_url:c.source_url}:{})});
   }
   if((await db.auth.getUser(token)).data?.user?.id!==owner)return json({error:'authorization_changed'},403);
   if(typeof savedReview.name!=='string'||!savedReview.name.trim()||savedReview.name.length>300||!numeric(savedReview.servings)||savedReview.servings>20||!savedReview.values||!['calories','protein','carbs','fats','fiber'].every(k=>savedReview.values[k]===null||numeric(savedReview.values[k])))return json({error:'saved_details_unavailable'},404);
   const instructions=Array.isArray(savedReview.instructions)?savedReview.instructions.filter((x:any)=>typeof x==='string'&&x.trim().length>0&&x.length<=600&&!/[\u0000-\u001f\u007f]/.test(x)).slice(0,30):[];
   const originalSource=savedReview.original_source??null,sourceUrl=typeof originalSource?.source_url==='string'&&originalSource.source_url.length<=600?originalSource.source_url:null;
   const prep=savedReview.estimated_prep_minutes,estimatedPrepMinutes=originalSource?.kind==='estimate'&&Number.isInteger(prep)&&prep>=5&&prep<=240?prep:null;
   const rawTime=savedReview.total_time,totalTime=rawTime?.authority==='source_reported'&&Number.isInteger(rawTime.minutes)&&rawTime.minutes>0&&rawTime.minutes<=1440&&typeof rawTime.source_url==='string'&&rawTime.source_url===sourceUrl?{minutes:rawTime.minutes,authority:'source_reported',source_url:sourceUrl}:null;
   return json({schema:'saved_meal_details_v1',meal_item_id:body.meal_item_id,review_request_id:link.review_request_id,option_id:link.option_id,name:savedReview.name,servings:savedReview.servings,values:savedReview.values,authority:savedReview.authority,physical_portion:savedReview.physical_portion??null,components,assumptions:Array.isArray(savedReview.assumptions)?savedReview.assumptions.filter((x:any)=>typeof x==='string'&&x.length<=300).slice(0,12):[],original_source:originalSource,...(instructions.length?{instructions}:{}),...(estimatedPrepMinutes!==null?{estimated_prep_minutes:estimatedPrepMinutes}:{}),...(totalTime?{total_time:totalTime}:{}),logged:false});
  }catch{return json({error:'saved_details_unavailable'},503);}
 };
}

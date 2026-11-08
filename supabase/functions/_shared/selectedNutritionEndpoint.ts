import {selectedSourceEnvelope} from './selectedNutrition.mjs';
import {canonicalGTIN} from './offMass.mjs';
import {readProviderJSON,createSelectionCapture} from './nutritionRefresh.mjs';

const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
/** Explicit selection only. Source data never comes from the client. */
export async function handleSelectedNutrition(req:Request,admin:any,cors:Record<string,string>):Promise<Response> {
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
 try {
  if(Number(req.headers.get('content-length')??0)>2048)return reply({status:'ineligible'},400);
  const bearer=req.headers.get('authorization')?.match(/^Bearer ([^ ]+)$/i)?.[1];
  if(!bearer)return reply({status:'unauthorized'},401);
  const auth=await Promise.race([admin.auth.getUser(bearer),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true}))]);
  if(auth?.error||!auth?.data?.user)return reply({status:'unauthorized'},401);
  const requestText=await req.text();
  if(new TextEncoder().encode(requestText).length>2048)return reply({status:'ineligible'},400);
  const body=JSON.parse(requestText);
  if(body.operation!=='capture_selected_nutrition_v1'||!uuid(body.request_id)||Object.keys(body).some(k=>!['operation','request_id','food_item_id','provider','source_id'].includes(k)))return reply({status:'ineligible'},400);
  let foodId:string|null=null,provider:string,sourceId:string;
  if(body.food_item_id!==undefined) {
   if(!uuid(body.food_item_id)||body.provider!==undefined||body.source_id!==undefined)return reply({status:'ineligible'},400);
   const {data:food,error}=await admin.from('food_items').select('id,source,usda_fdc_id,barcode').eq('id',body.food_item_id).maybeSingle().abortSignal(controller.signal);
   if(error||!food)return reply({status:'unavailable',reason:'catalog_unavailable'},503);
   // Manual/photo corrections are not implicitly linked to an external variant.
   if(food.source==='usda'&&food.usda_fdc_id){provider='usda';sourceId=String(food.usda_fdc_id);}
   else if(food.source==='openfoodfacts'&&food.barcode){provider='openfoodfacts';sourceId=String(food.barcode);}
   else return reply({status:'ineligible',reason:'no_external_source'});
   foodId=food.id;
  } else {
   provider=body.provider;sourceId=body.source_id;
  }
  if(!['usda','openfoodfacts'].includes(provider)||typeof sourceId!=='string'||!/^\d{1,20}$/.test(sourceId))return reply({status:'ineligible'},400);
  const requestedSourceId=sourceId;
  if(provider==='openfoodfacts')sourceId=canonicalGTIN(sourceId)??sourceId;
  const enrich=async(raw:unknown)=>{
   if(!foodId||controller.signal.aborted||raw===undefined)return false;
   const capture=createSelectionCapture({admin,enabled:true,networkEnabled:true,timeoutMs:1500});
   const result=await capture({request:req,foodId,provider,sourceId,providerFood:raw,authenticated:true});
   return result.status==='applied';
  };
  const acknowledgment=(saved:any,status:string,applied:boolean)=>({status,snapshot_id:saved.snapshot_id,version:saved.version,revision:saved.revision,request_id:body.request_id,food_item_id:foodId,provider,source_id:requestedSourceId,captured_source_id:sourceId,complete:true,capture_scope:'detail_response',canonical_applied:applied});
  const {data:admission,error:admissionError}=await admin.rpc('claim_selected_nutrition_v1',{
   p_user_id:auth.data.user.id,p_request_id:body.request_id,p_food_id:foodId,p_provider:provider,p_source_id:sourceId
  }).abortSignal(controller.signal);
  if(admissionError||!admission)return reply({status:'unavailable',reason:'admission_unavailable'},503);
  if(['fresh','duplicate'].includes(admission.status))return reply(acknowledgment(admission,'duplicate',await enrich(admission.evidence?.raw_payload)));
  if(admission.status!=='claimed')return reply({status:'unavailable',reason:['busy','rate_limited'].includes(admission.status)?admission.status:'admission_rejected'},admission.status==='rate_limited'?429:503);
  const url=provider==='usda'?'https://api.nal.usda.gov/fdc/v1/food/'+sourceId+'?api_key='+encodeURIComponent(Deno.env.get('USDA_API_KEY')||'DEMO_KEY'):'https://world.openfoodfacts.org/api/v2/product/'+sourceId+'.json';
  const response=await fetch(url,{signal:controller.signal,headers:provider==='openfoodfacts'?{'User-Agent':'MacroGoal/1.0 (macro-goal.app)'}:{}});
  if(!response.ok)return reply({status:'unavailable',reason:'provider_unavailable'},502);
  const fetched=await readProviderJSON(response,{signal:controller.signal,maxBytes:provider==='usda'?1048576:262144});
  if(provider==='openfoodfacts'&&(fetched.status!==1||!fetched.product))return reply({status:'unavailable',reason:'provider_not_found'});
  const raw=provider==='usda'?fetched:fetched.product;
  const evidence=selectedSourceEnvelope(provider,sourceId,raw);
  const {data:saved,error}=await admin.rpc('record_selected_nutrition_v1',{p_food_id:foodId,p_request_id:body.request_id,p_evidence:evidence}).abortSignal(controller.signal);
  if(error||!saved||!['captured','duplicate'].includes(saved.status))return reply({status:'unavailable',reason:'persistence_unconfirmed'},503);
  // Reuse existing missing-only guards. Capturing evidence never authorizes
  // overwriting canonical values, changing units, or blending another variant.
  return reply(acknowledgment(saved,saved.status,await enrich(raw)));
 } catch(error) {
  const reason=error instanceof Error?error.message:'';
  return reply({status:'unavailable',complete:false,reason:['provider_body_too_large','source_payload_too_large','unsupported_nutrient_collection'].includes(reason)?'source_exceeds_capture_limit':'capture_failed'},503);
 } finally {clearTimeout(timer);controller.abort();}
}


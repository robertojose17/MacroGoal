import {selectedSourceEnvelope} from './selectedNutrition.mjs';
import {refreshCachedSelection,readProviderJSON} from './nutritionRefresh.mjs';
import {resolvePortionsWithin,servicePortionCache} from './portionCache.mjs';

// Called only by the explicit operation in the existing lookup-barcode function.
// No new function slot. A name or client nutrient/portion payload is never accepted.
export async function handlePortionRequest(req:Request,admin:any,cors:Record<string,string>):Promise<Response>{
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(Number(req.headers.get('content-length')??0)>1024)return reply({error:'Invalid request'},400);
 const authorization=req.headers.get('authorization')??'';
 const bearer=authorization.match(/^Bearer ([^ ]+)$/i)?.[1];
 if(!bearer)return reply({error:'Unauthorized'},401);
 let authTimer:ReturnType<typeof setTimeout>|undefined;
 let auth:any;
 try{auth=await Promise.race([admin.auth.getUser(bearer),new Promise(resolve=>{authTimer=setTimeout(()=>resolve(null),800);})]);}
 catch{return reply({error:'Verification unavailable'},503);}
 finally{if(authTimer)clearTimeout(authTimer);}
 if(!auth)return reply({error:'Verification unavailable'},503);
 if(auth.error||!auth.data?.user)return reply({error:'Unauthorized'},401);
 let body:any;
 try{body=await req.json();}catch{return reply({error:'Invalid request'},400);}
 const isUuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
 const uuidMode=body?.food_item_id!==undefined;
 const cachedOnly=body?.operation==='usda_portions_cached_v1';
 if((body?.operation!=='usda_portions_v1'&&!cachedOnly)||(cachedOnly&&!uuidMode)||Object.keys(body).some(k=>!['operation','fdc_id','food_item_id'].includes(k))||
  (uuidMode?(!isUuid(body.food_item_id)||body.fdc_id!==undefined):(typeof body.fdc_id!=='string'||!/^\d{1,20}$/.test(body.fdc_id))))return reply({error:'Invalid request'},400);
 const requestedFoodId=uuidMode?body.food_item_id as string:null;
 const normalizedName=(value:unknown)=>typeof value==='string'?value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' '):'';
 const identityAnchor=(row:any)=>JSON.stringify(['id','source','usda_fdc_id','name','macros_per','calories','protein','carbs','fat','fiber','serving_size','serving_unit','serving_quantity','serving_description','serving_count'].map(k=>row[k]??null));
 const readBinding=async()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const response:any=await Promise.race([admin.rpc('read_food_search_snapshots_v1',{p_food_ids:[requestedFoodId]}).abortSignal(controller.signal),
    new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('binding_timeout'));},400);})]);
   if(response.error||!Array.isArray(response.data)||response.data.length!==1)throw Error('binding_unavailable');
   const row=response.data[0],snapshot=row.snapshot;
   if(row.id!==requestedFoodId||snapshot?.id!==requestedFoodId||row.protected!==false)throw Error(row.protected===true?'protected_nutrition':'binding_unavailable');
   if(snapshot.source!=='usda'||typeof snapshot.usda_fdc_id!=='string'||!/^\d{1,20}$/.test(snapshot.usda_fdc_id)||snapshot.macros_per!=='100g'||!normalizedName(snapshot.name))throw Error('binding_ineligible');
   return snapshot;
  }finally{if(timer)clearTimeout(timer);controller.abort();}
 };
 let binding:any=null;
 if(uuidMode)try{binding=await readBinding();}catch(error){
  const code=error instanceof Error?error.message:'binding_unavailable';
  return reply({error:'Portion identity unavailable',code,food_item_id:requestedFoodId},code==='protected_nutrition'?409:503);
 }
 const key=uuidMode?binding.usda_fdc_id:body.fdc_id;
 let catalogId:string|null=requestedFoodId;
 let selectedProviderFood:unknown=undefined;
 let providerFetchAttempted=false;
 const cache=servicePortionCache(admin);
 const result=await resolvePortionsWithin(key,{
  now:()=>new Date().toISOString(),cache:{
   async read(fdcId:string,signal:AbortSignal){
    if(uuidMode)return await cache.read(fdcId,signal);
    const [value,row]=await Promise.all([cache.read(fdcId,signal),admin.from('food_items').select('id').eq('usda_fdc_id',fdcId).maybeSingle().abortSignal(signal)]);
    if(row.data)catalogId=row.data.id;
    return catalogId?value:null;
   },
   write:cache.write
  },
  fetchExactFood:async(fdcId:string,signal:AbortSignal)=>{
   if(cachedOnly)throw Error('cache_only_miss');
   providerFetchAttempted=true;
   const captureRequestId=crypto.randomUUID(),captureFoodId=catalogId;
   let admission:any=null;
   try{
    const claim=await admin.rpc('claim_selected_nutrition_v1',{p_user_id:auth.data.user.id,p_request_id:captureRequestId,p_food_id:captureFoodId,p_provider:'usda',p_source_id:fdcId}).abortSignal(signal);
    if(!claim.error)admission=claim.data;
   }catch{/* Existing portion resolution remains available if capture is unavailable. */}
   const cachedRaw=['fresh','duplicate'].includes(admission?.status)?admission.evidence?.raw_payload:null;
   if(uuidMode&&admission?.status!=='claimed'&&!cachedRaw)throw Error('USDA_PORTION_ADMISSION_UNAVAILABLE');
   let food:any=cachedRaw;
   if(!food){
    const apiKey=Deno.env.get('USDA_API_KEY')||'DEMO_KEY';
    const response=await fetch('https://api.nal.usda.gov/fdc/v1/food/'+fdcId+'?api_key='+encodeURIComponent(apiKey),{signal});
    if(!response.ok)throw Error('USDA_PORTION_UNAVAILABLE');
    food=await readProviderJSON(response,{signal,maxBytes:1048576});
   }
   if(String(food?.fdcId)!==fdcId)throw Error('USDA_IDENTITY_MISMATCH');
   if(uuidMode&&normalizedName(food?.description)!==normalizedName(binding.name))throw Error('USDA_DESCRIPTION_MISMATCH');
   // Persist exact provider food only when all core per100 nutrients are present.
   // The unique USDA-FDC constraint resolves concurrent insertions without overwrites.
   const values=new Map<number,number>();
   for(const item of food.foodNutrients??[]){
    const n=item?.nutrient;const amount=item?.amount;
    if(typeof amount==='number'&&Number.isFinite(amount)&&amount>=0&&
     (([1003,1004,1005,1079].includes(n?.id)&&String(n?.unitName).toLowerCase()==='g')||
     ([1008,2047,2048].includes(n?.id)&&String(n?.unitName).toLowerCase()==='kcal')))values.set(n.id,amount);
   }
   const calories=values.get(1008)??values.get(2048)??values.get(2047);
   if(!uuidMode&&['Foundation','SR Legacy','Survey (FNDDS)','Branded'].includes(food.dataType)&&typeof food.description==='string'&&food.description.trim()&&calories!==undefined&&[1003,1004,1005].every(n=>values.has(n))){
    const existing=await admin.from('food_items').select('id').eq('usda_fdc_id',fdcId).maybeSingle().abortSignal(signal);
    if(existing.data)catalogId=existing.data.id;
    else if(!existing.error){
     const inserted=await admin.from('food_items').insert({name:food.description,brand:food.brandOwner||food.brandName||'',source:'usda',usda_fdc_id:fdcId,
      calories,protein:values.get(1003),fat:values.get(1004),carbs:values.get(1005),fiber:values.get(1079)??null,
      macros_per:'100g',serving_size:100,serving_quantity:'100',serving_unit:'g'}).select('id').single().abortSignal(signal);
     if(inserted.data)catalogId=inserted.data.id;
     else if(inserted.error?.code==='23505'){
      const winner=await admin.from('food_items').select('id').eq('usda_fdc_id',fdcId).maybeSingle().abortSignal(signal);
      if(winner.data)catalogId=winner.data.id;
     }
    }
   }
   // Capture the already fetched full response before returning. The existing
   // operation signal (1500ms legacy, 8000ms authenticated UUID) bounds this
   // best-effort write; never refetch here.
   if(admission?.status==='claimed')try{
    const evidence=selectedSourceEnvelope('usda',fdcId,food);
    await admin.rpc('record_selected_nutrition_v1',{p_food_id:captureFoodId,p_request_id:captureRequestId,p_evidence:evidence}).abortSignal(signal);
   }catch{}
   selectedProviderFood=food; // Preserve the complete raw nutrient array before mapping.
   return food;
  }
 },uuidMode&&!cachedOnly?8000:1500,uuidMode&&!cachedOnly);
 if(uuidMode){
  try{
   const current=await readBinding();
   if(identityAnchor(current)!==identityAnchor(binding))throw Error('binding_changed');
   if(result.envelope&&(String(result.envelope.fdcId)!==key||normalizedName(result.envelope.foodDescription)!==normalizedName(binding.name)))throw Error('portion_identity_mismatch');
  }catch(error){return reply({error:'Portion identity changed',code:error instanceof Error?error.message:'binding_unavailable',food_item_id:requestedFoodId},409);}
 }
 if(!uuidMode&&catalogId&&(!providerFetchAttempted||selectedProviderFood!==undefined))await refreshCachedSelection(admin,req,{foodId:catalogId,provider:'usda',sourceId:key,providerFood:selectedProviderFood,authenticated:true});
 return reply({fdc_id:key,portion_evidence:result.envelope,portion_persisted:result.persisted,food_item_id:catalogId,...(cachedOnly?{cache_only:true,cached:!!result.envelope,...(!result.envelope?{code:'cache_miss'}:{})}:{}),...(uuidMode?{food_description:binding.name,binding_verified:true}:{})});
}

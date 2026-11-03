import {captureUsdaNutrition} from './nutritionEvidence.mjs';
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
 if(body?.operation!=='usda_portions_v1'||typeof body.fdc_id!=='string'||!/^\d{1,20}$/.test(body.fdc_id)||Object.keys(body).some(k=>!['operation','fdc_id'].includes(k)))return reply({error:'Invalid request'},400);
 const key=body.fdc_id;
 let catalogId:string|null=null;
 const cache=servicePortionCache(admin);
 const result=await resolvePortionsWithin(key,{
  now:()=>new Date().toISOString(),cache:{
   async read(fdcId:string,signal:AbortSignal){
    const [value,row]=await Promise.all([cache.read(fdcId,signal),admin.from('food_items').select('id').eq('usda_fdc_id',fdcId).maybeSingle().abortSignal(signal)]);
    if(row.data)catalogId=row.data.id;
    return catalogId?value:null;
   },
   write:cache.write
  },
  fetchExactFood:async(fdcId:string,signal:AbortSignal)=>{
   const apiKey=Deno.env.get('USDA_API_KEY')||'DEMO_KEY';
   const response=await fetch('https://api.nal.usda.gov/fdc/v1/food/'+fdcId+'?api_key='+encodeURIComponent(apiKey),{signal});
   if(!response.ok)throw Error('USDA_PORTION_UNAVAILABLE');
   const food=await response.json();
   if(String(food?.fdcId)!==fdcId)throw Error('USDA_IDENTITY_MISMATCH');
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
   if(['Foundation','SR Legacy','Survey (FNDDS)','Branded'].includes(food.dataType)&&typeof food.description==='string'&&food.description.trim()&&calories!==undefined&&[1003,1004,1005].every(n=>values.has(n))){
    const existing=await admin.from('food_items').select('id').eq('usda_fdc_id',fdcId).maybeSingle().abortSignal(signal);
    if(existing.data)catalogId=existing.data.id;
    else if(!existing.error){
     const inserted=await admin.from('food_items').insert({name:food.description,brand:food.brandOwner||food.brandName||'',source:'usda',usda_fdc_id:fdcId,
      calories,protein:values.get(1003),fat:values.get(1004),carbs:values.get(1005),fiber:values.get(1079)??null,
      macros_per:'100g',serving_size:100,serving_quantity:'100',serving_unit:'g',
      off_data:{nutrition_evidence:captureUsdaNutrition(food,fdcId,new Date().toISOString())}} ).select('id').single().abortSignal(signal);
     if(inserted.data)catalogId=inserted.data.id;
     else if(inserted.error?.code==='23505'){
      const winner=await admin.from('food_items').select('id').eq('usda_fdc_id',fdcId).maybeSingle().abortSignal(signal);
      if(winner.data)catalogId=winner.data.id;
     }
    }
   }
   return food;
  }
 },1500);
 return reply({fdc_id:key,portion_evidence:result.envelope,portion_persisted:result.persisted,food_item_id:catalogId});
}

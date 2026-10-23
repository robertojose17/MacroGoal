import {coachIdentityId} from './coachIdentityId';
import {NUTRIENTS,type PreparedMealEntry} from './coachMealReview';
export type CatalogConsent={grams:number;massAuthority:'estimated'|'source_reported';massBasis:string;name:string;massAcknowledged:boolean;publicAcknowledged:boolean};
export type PublicCoachFood={id:string;name:string;serving_amount:100;serving_unit:'g';calories:number;protein:number;carbs:number;fats:number;fiber:number;user_created:true;created_by:string};
const uuid=(x:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function coachCatalogPreview(entry:PreparedMealEntry,c:CatalogConsent){
 if(!Number.isFinite(c.grams)||c.grams<=0||c.grams>100000||!['estimated','source_reported'].includes(c.massAuthority)||!c.massBasis.trim()||c.massBasis.length>300||!c.name.trim()||c.name.length>160||/[\r\n\x00-\x1f@]|https?:\/\//i.test(c.name)||!uuid(entry.owner)||!NUTRIENTS.every(k=>typeof entry.nutrition[k]==='number'&&Number.isFinite(entry.nutrition[k])&&entry.nutrition[k]!>=0)||!entry.nutrition.calories)throw Error('catalog_review_required');
 if(c.massAuthority==='source_reported'&&(entry.physicalPortion?.authority!=='source_reported'||entry.physicalPortion.total_grams!==c.grams))throw Error('source_mass_mismatch');
 const estimated=c.massAuthority==='estimated'||!['official','publisher_reported'].includes(entry.authority);
 const name=c.name.trim().replace(/\s*\(estimated\)$/i,'')+(estimated?' (estimated)':'');
 const nutrition=Object.fromEntries(NUTRIENTS.map(k=>[k,entry.nutrition[k]!*100/c.grams])) as Pick<PublicCoachFood,'calories'|'protein'|'carbs'|'fats'|'fiber'>;
 if(!NUTRIENTS.every(k=>Number.isFinite(nutrition[k])))throw Error('invalid_catalog_values');
 return {name,serving_amount:100 as const,serving_unit:'g' as const,...nutrition,user_created:true as const,created_by:entry.owner};
}
export function coachCatalogDiaryPayload(entry:PreparedMealEntry,c:CatalogConsent,id:string){
 if(!uuid(id)||!c.massAcknowledged||!c.publicAcknowledged)throw Error('catalog_consent_required');
 const food=coachCatalogPreview(entry,c),estimated=food.name.endsWith(' (estimated)');
 return {p_user_id:entry.owner,p_date:entry.date,p_meal_type:entry.meal,p_food_id:id,p_food_item_id:null,p_food_name:food.name,p_food_brand:null,p_quantity:1,p_grams:c.grams,p_serving_description:`1 ${estimated?'estimated portion':'portion'} (${c.grams} g)`,p_calories:entry.nutrition.calories!,p_protein:entry.nutrition.protein!,p_carbs:entry.nutrition.carbs!,p_fats:entry.nutrition.fats!,p_fiber:entry.nutrition.fiber!};
}
const active=new Set<string>();
export function createCoachCatalogIdentity(deps:{store:{getItem(k:string):Promise<string|null>;setItem(k:string,v:string):Promise<void>};owner():Promise<string|undefined>;read(id:string):Promise<PublicCoachFood|null>;insert(row:PublicCoachFood):Promise<void>}){
 return async(entry:PreparedMealEntry,c:CatalogConsent,current:()=>boolean):Promise<string>=>{
  if(!c.massAcknowledged||!c.publicAcknowledged)throw Error('catalog_consent_required');
  const publicFood=coachCatalogPreview(entry,c),key=`coach_catalog_identity_v1:${JSON.stringify([entry.owner,entry.date,entry.sourceReceiptId,entry.optionId])}`,fingerprint=JSON.stringify([entry.owner,entry.date,entry.meal,entry.sourceReceiptId,entry.optionId,entry.name,entry.multiplier,entry.portionLabel,NUTRIENTS.map(k=>entry.nutrition[k]),entry.authority,entry.physicalPortion??null,c.grams,c.massAuthority,c.massBasis,c.name,c.massAcknowledged,c.publicAcknowledged]);
  if(active.has(key))throw Error('catalog_busy');active.add(key);
  const authorized=async()=>{if(!current()||await deps.owner()!==entry.owner||!current())throw Error('scope_changed');};
  try{
   await authorized();const raw=await deps.store.getItem(key);let journal:{fingerprint:string;row:PublicCoachFood;attempted:boolean;confirmed:boolean};
   if(raw){journal=JSON.parse(raw);if(journal.fingerprint!==fingerprint||journal.row?.id!==coachIdentityId(entry.owner,entry.sourceReceiptId,entry.optionId)||JSON.stringify({...journal.row,id:undefined})!==JSON.stringify({...publicFood,id:undefined}))throw Error('catalog_review_changed');}
   else{const id=coachIdentityId(entry.owner,entry.sourceReceiptId,entry.optionId);if(!uuid(id))throw Error('invalid_identity_id');journal={fingerprint,row:{...publicFood,id},attempted:false,confirmed:false};await deps.store.setItem(key,JSON.stringify(journal));}
   await authorized();let found=await deps.read(journal.row.id);await authorized();
   const matches=(row:PublicCoachFood)=>Object.keys(journal.row).every(k=>row[k as keyof PublicCoachFood]===journal.row[k as keyof PublicCoachFood]);
   if(found&&!matches(found))throw Error('catalog_identity_mismatch');
   if(!found){
    if(journal.confirmed)throw Error('catalog_identity_missing');
    if(journal.attempted)throw Error('catalog_insert_uncertain');
    journal.attempted=true;await deps.store.setItem(key,JSON.stringify(journal));await authorized();
    try{await deps.insert(journal.row);}catch{/* Read the same UUID after lost acknowledgement; never mint/reinsert. */}
    await authorized();found=await deps.read(journal.row.id);await authorized();if(!found||!matches(found))throw Error('catalog_insert_uncertain');
   }
   journal.confirmed=true;await deps.store.setItem(key,JSON.stringify(journal));await authorized();return journal.row.id;
  }finally{active.delete(key);}
 };
}

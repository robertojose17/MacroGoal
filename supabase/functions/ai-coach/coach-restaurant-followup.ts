import {lookupContext,lookupCancelled,type LookupContext} from './coach-lookup-intent.ts';
import {allowedEvidenceURL} from './coach-source-pages.ts';
import {foodCategory} from './coach-nutrition-evidence.ts';
import {broadRestaurantCategory} from './coach-restaurant-recovery.ts';
import {lookupOptionPortion,validatedSuggestedServings,type LookupOption} from './_shared/coach-recommendation-contract.ts';

const TTL=30*60*1000,MAX_POOL=12;
type Source={url:string;title:string;retrievedAt:string};
export type RestaurantPool={version:1;origin_request_id:string;origin_created_at:string;context:LookupContext;options:LookupOption[];sources:Source[];visited:string[]};
export type PublicRestaurantSummary={request:LookupContext;options:Array<{option_id:string;item_name:string;restaurant_name?:string}>;primary_option_id?:string};
const owned=new WeakMap<object,string>(),summaries=new WeakSet<object>();
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[.!?]+$/,'').replace(/\s+/g,' ');
const same=(a:LookupContext,b:LookupContext)=>a.mode===b.mode&&fold(a.area??'')===fold(b.area??'')&&(a.country??'')===(b.country??'');
export function restaurantFollowupAction(text:string):'another'|'protein'|'cancel'|null{
 const s=fold(text);if(lookupCancelled(text)||/^(?:olvida eso|olvidalo|forget that|drop that)$/.test(s))return 'cancel';
 if(/^(?:otra(?: opcion)?|otra alternativa|otras opciones|algo diferente|another(?: option)?|something else|other options|an alternative)$/.test(s))return 'another';
 if(/^(?:mas proteina|con mas proteina|prioriza(?:r)? proteina|more protein|higher protein|prioritize protein)$/.test(s))return 'protein';return null;
}
function validOption(o:any):o is LookupOption{
 return !!o&&o.kind==='restaurant'&&/^opt-[a-f0-9]{16}$/.test(o.option_id)&&typeof o.item_name==='string'&&o.item_name.length>0&&o.item_name.length<=160&&typeof o.restaurant_name==='string'&&o.restaurant_name.length<=160&&o.location?.evidence_status==='verified'&&typeof o.location.address==='string'&&o.location.address.length>0&&o.location.address.length<=240&&allowedEvidenceURL(o._source_url)===o._source_url&&validatedSuggestedServings(o.suggested_servings)!==null&&!!lookupOptionPortion(o,1);
}
/** Called only with current server-validated projected evidence; never client cards. */
export function makeRestaurantPool(context:unknown,options:LookupOption[],sources:unknown,requestId:string,createdAt:string,previous?:RestaurantPool):RestaurantPool|null{
 const c=lookupContext(context);if(!c||c.mode!=='restaurant'||!c.area)return null;
 const list=options.filter(validOption).slice(0,MAX_POOL);if(!list.length)return null;
 const refs=Array.isArray(sources)?sources.filter((s:any)=>s&&typeof s.url==='string'&&allowedEvidenceURL(s.url)===s.url&&typeof s.title==='string'&&typeof s.retrievedAt==='string').slice(0,12):[];
 if(list.some(o=>!refs.some(s=>s.url===o._source_url)))return null;
 const pool:RestaurantPool={version:1,origin_request_id:previous?.origin_request_id??requestId,origin_created_at:previous?.origin_created_at??createdAt,context:c,options:list,sources:refs,visited:[...new Set([...(previous&&previous.context.food===c.food?previous.visited.filter(id=>list.some(o=>o.option_id===id)):[]),list[0].option_id])]};
 return new TextEncoder().encode(JSON.stringify(pool)).byteLength<=48000?pool:null;
}
/** The existing service-only RPC enforces owner scope; no caller-provided receipt can gain this proof. */
export async function readOwnedRestaurantReceipt(db:any,userId:string,conversationId:string,now=Date.now()):Promise<any|null>{
 if(!conversationId||conversationId.length>200)return null;
 const {data,error}=await db.rpc('coach_recover_requests_v1',{p_user_id:userId,p_request_id:null,p_offset:0});
 if(error||!Array.isArray(data))return null;
 const latest=data.slice(0,50).filter((r:any)=>r?.request_payload?.conversation_id===conversationId).sort((a:any,b:any)=>Date.parse(b.created_at)-Date.parse(a.created_at)||String(b.request_id).localeCompare(String(a.request_id)))[0];
 if(!latest||latest.user_id!==undefined&&latest.user_id!==userId||latest.state!=='completed'||latest.execution_state&&latest.execution_state!=='completed')return null;
 const context=lookupContext(latest.result?.lookup_context),raw=latest.result?.private_restaurant_pool??makeRestaurantPool(context,latest.result?.lookup_options??[],latest.result?.sources,latest.request_id,latest.created_at);
 if(context?.mode==='restaurant'&&!raw){const receipt={...latest,pool:null,public_context:context};owned.set(receipt,userId);return receipt;}
 if(!raw||!lookupContext(raw.context)||typeof raw.origin_request_id!=='string'||raw.version!==1||!context||context.mode!=='restaurant'||!Array.isArray(raw.options)||!Array.isArray(raw.visited)||raw.visited.length>MAX_POOL||raw.visited.some((x:any)=>typeof x!=='string'))return null;
 const origin=Date.parse(raw.origin_created_at);if(!Number.isFinite(origin)||origin>now||now-origin>TTL||!same(raw.context,context)||raw.context.food!==context.food)return null;
 const restored=makeRestaurantPool(context,raw.options,raw.sources,raw.origin_request_id,raw.origin_created_at);if(!restored||restored.options.length!==raw.options.length||new Set(raw.options.map((o:any)=>o.option_id)).size!==raw.options.length||raw.visited.some((id:string)=>!raw.options.some((o:any)=>o.option_id===id)))return null;
 restored.visited=[...raw.visited];const receipt={...latest,pool:restored};owned.set(receipt,userId);return receipt;
}
export function ownedRestaurantPool(receipt:any,userId:string,conversationId:string):RestaurantPool|null{return receipt&&owned.get(receipt)===userId&&receipt.request_payload?.conversation_id===conversationId?receipt.pool:null;}
export function restaurantSummary(receipt:any,userId:string,conversationId:string):PublicRestaurantSummary|undefined{
 if(!receipt||owned.get(receipt)!==userId||receipt.request_payload?.conversation_id!==conversationId)return;
 const pool=receipt.pool as RestaurantPool|null,context=pool?.context??receipt.public_context;if(!context)return;
 const summary:PublicRestaurantSummary={request:context,options:(pool?.options??[]).slice(0,3).map(o=>({option_id:o.option_id,item_name:o.item_name,restaurant_name:o.restaurant_name})),primary_option_id:receipt.result?.lookup_options?.[0]?.option_id};summaries.add(summary);return summary;
}
export const isServerRestaurantSummary=(x:unknown):x is PublicRestaurantSummary=>!!x&&typeof x==='object'&&summaries.has(x as object);
/** Reuse only the same local scope. A changed category can filter proven source items, never invent new ones. */
export function retainedRestaurantOptions(pool:RestaurantPool,args:{food:string;mode:string;city?:string;region?:string;country?:string;restaurant?:string;product?:string;variant?:string}):LookupOption[]|null{
 const context={food:args.food,mode:args.mode,area:[args.city,args.region].filter(Boolean).join(', '),country:args.country} as LookupContext;
 if(!same(pool.context,context))return null;
 // A category suffix never authorizes dropping an explicit merchant, variant or restriction.
 const category=broadRestaurantCategory(args),wanted=fold(args.food);
 const generalMeal=wanted==='meal'&&!args.restaurant&&!args.product&&!args.variant;
 const selected=generalMeal?pool.options:pool.options.filter(o=>category?foodCategory(o.item_name)===category:!args.restaurant&&!args.product&&!args.variant&&fold(o.item_name)===wanted);
 if(!selected.length)return null;
 return selected.map(o=>{if(pool.context.food===args.food)return {...o};const {suggested_servings,...base}=o;return base;});
}
/** Keep the best ranked primary, then offer proven item/merchant diversity before duplicate variants. */
export function publicRestaurantChoices(ranked:LookupOption[]):LookupOption[]{
 if(!ranked.length)return [];
 const host=(o:LookupOption)=>{try{return new URL(o._source_url??'').hostname.replace(/^www\./,'');}catch{return '';}};
 const identity=(o:LookupOption)=>host(o)+'|'+fold(o.item_name),out=[ranked[0]];
 const other=ranked.find(o=>host(o)!==host(out[0]));if(other)out.push(other);
 for(const o of ranked){if(out.length===3)break;if(!out.some(x=>identity(x)===identity(o)))out.push(o);}
 for(const o of ranked){if(out.length===3)break;if(!out.some(x=>x.option_id===o.option_id))out.push(o);}
 return out;
}
export function nextRestaurantOptions(pool:RestaurantPool,ranked:LookupOption[],action:'another'|'protein'):{options:LookupOption[];pool:RestaurantPool;exhausted:boolean}{
 const candidate=action==='another'?ranked.find(o=>!pool.visited.includes(o.option_id)):ranked[0];
 if(!candidate)return {options:[],pool,exhausted:true};
 const options=publicRestaurantChoices([candidate,...ranked.filter(o=>o.option_id!==candidate.option_id&&(action==='protein'||!pool.visited.includes(o.option_id)))]);
 const visited=[...new Set([...pool.visited,candidate.option_id])].slice(0,MAX_POOL);
 return {options,pool:{...pool,context:{...pool.context,...(action==='protein'?{preference:'high_protein' as const}:{})},visited},exhausted:false};
}

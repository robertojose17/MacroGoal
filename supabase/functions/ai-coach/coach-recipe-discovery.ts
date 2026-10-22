import { findVerifiedFood, verifiedFoodReply, parseCompleteRecipe } from './coach-verified-food.ts';
import type { VerifiedFoodResult } from './coach-verified-food.ts';
import type { WebResult } from './coach-web-search.ts';
import { projectLookupOptions } from './_shared/coach-recommendation-contract.ts';
import { attachPageEvidence, allowedEvidenceURL, type SourceReadDiagnostic } from './coach-source-pages.ts';
import { officialMenuNutrition, officialProductNutrition } from './coach-nutrition-evidence.ts';
import { reissueDiscoveryOptionsForReceipt } from './coach-model-led-contract.ts';

/** Prefer a complete publisher panel among up to three bounded pages; otherwise try one recipe under one shared read budget. */
export async function verifyDiscoveredRecipe(discovery:WebResult,deps:{fetch:typeof fetch;retrievedAt:string;language:string}):Promise<{webEvidence:WebResult;verifiedFood:VerifiedFoodResult|null}> {
  const sourceCandidates=(discovery.evidence?.candidates??[]).filter((item:any)=>item.sourceKind==='retrieved_recipe').slice(0,3);
  const diagnostics=[...(discovery.privateSourceReadDiagnostics??[])];
  const candidates=sourceCandidates.flatMap((candidate:any,index:number)=>{
    const html=discovery.recipePageContent?.[candidate.url];if(typeof html!=='string'||html.length>1024*1024)return [];
    const parsed=parseCompleteRecipe(html,candidate.name,candidate.url,deps.retrievedAt);if(!parsed)diagnostics.push({slot:index+1,role:'nutrition',outcome:'recipe_incomplete',http_status:200});return parsed?[{candidate,html,parsed}]:[];
  });
  const webEvidence=diagnostics.length?{...discovery,privateSourceReadDiagnostics:diagnostics.slice(0,6)}:discovery;
  if(!candidates.length)return {webEvidence,verifiedFood:null};
  const selected=candidates.find(x=>x.parsed.publisherNutrition)??candidates[0];
  const budget={startedAt:Date.now(),reads:Object.keys(discovery.recipePageContent??{}).length,maxReads:21,maxDurationMs:20000};
  const verified=await findVerifiedFood({kind:'recipe',url:selected.candidate.url,name:selected.candidate.name},{fetch:deps.fetch,retrievedAt:deps.retrievedAt,recipeSourceHtml:selected.html,recipeBudget:budget});
  if(!verified.eligible)return {webEvidence,verifiedFood:null};
  return {verifiedFood:verified,webEvidence:{sources:verified.sources.map(source=>({...source,title:verified.name??'Nutrition evidence'})),context:JSON.stringify(verified),reply:verifiedFoodReply(verified,deps.language),lookup_context:verified.lookup_context??discovery.lookup_context,status:'ok',reportedCost:discovery.reportedCost,generationId:discovery.generationId,errorCode:discovery.errorCode,...(webEvidence.privateSourceReadDiagnostics?.length?{privateSourceReadDiagnostics:webEvidence.privateSourceReadDiagnostics}:{})}};
}

/** Reverify one receipt-bound candidate URL only; this path never starts a new name search. */
export async function verifySelectedDiscovery(selection:{binding:{source_url:string;kind:string;name:string};option:any},deps:{fetch:typeof fetch;retrievedAt:string}):Promise<{verifiedFood:VerifiedFoodResult|null;lookupOptions:any[];privateSourceReadDiagnostics:SourceReadDiagnostic[]}> {
  if(selection.binding.kind==='recipe'&&selection.option?.kind==='recipe'){
    const privateSourceReadDiagnostics:SourceReadDiagnostic[]=[];const verifiedFood=await findVerifiedFood({kind:'recipe',url:selection.binding.source_url,name:selection.binding.name},{fetch:deps.fetch,retrievedAt:deps.retrievedAt,onSourceReadDiagnostic:value=>privateSourceReadDiagnostics.push({slot:1,role:'nutrition',...value})});
    return {verifiedFood,lookupOptions:projectLookupOptions(undefined,verifiedFood),privateSourceReadDiagnostics:privateSourceReadDiagnostics.slice(0,3)};
  }
  if(!['restaurant','product'].includes(selection.binding.kind)||selection.option?.kind!==selection.binding.kind||!allowedEvidenceURL(selection.binding.source_url))return {verifiedFood:null,lookupOptions:[],privateSourceReadDiagnostics:[]};
  const captured=await attachPageEvidence({annotations:[{type:'url_citation',url_citation:{url:selection.binding.source_url,title:selection.binding.entity??selection.binding.name}}]},deps.fetch);
  const privateSourceReadDiagnostics:SourceReadDiagnostic[]=(captured.privateSourceReadDiagnostics??[]).slice(0,3);const annotation=captured.annotations?.[0]?.url_citation;if(annotation?.public_page_verified!==true||typeof annotation.page_content!=='string')return {verifiedFood:null,lookupOptions:[],privateSourceReadDiagnostics};
  let nutrition:any=null,variant=selection.binding.variant;
  if(selection.binding.kind==='product'){
    if(!variant&&new URL(selection.binding.source_url).hostname==='www.redbaron.com'&&new URL(selection.binding.source_url).pathname.toLowerCase()==='/products/red-baron%c2%ae-classic-crust-supreme-pizza')variant='Classic Crust Supreme';
    const redBaronPage=new URL(selection.binding.source_url).hostname==='www.redbaron.com';
    const productPage=redBaronPage&&typeof annotation.raw_page_content==='string'?annotation.raw_page_content:annotation.page_content;
    nutrition=officialProductNutrition(productPage,selection.binding.name,selection.binding.source_url,deps.retrievedAt,variant,'pizza');
  }else{
    const merchant=selection.option.restaurant_name??selection.binding.entity;
    if(merchant&&!annotation.page_content.normalize('NFKC').toLocaleLowerCase().includes(String(merchant).normalize('NFKC').toLocaleLowerCase()))return {verifiedFood:null,lookupOptions:[],privateSourceReadDiagnostics:privateSourceReadDiagnostics.slice(0,3)};
    nutrition=officialMenuNutrition(annotation.page_content,selection.binding.name,selection.binding.source_url,deps.retrievedAt,'pizza',variant);
  }
  if(!nutrition||nutrition.itemIntegrity!=='complete'||nutrition.missing.length||!['calories','protein','carbs','fat','fiber'].every((key:string)=>Number.isFinite(nutrition.fields[key]?.value))){privateSourceReadDiagnostics.push({slot:1,role:'nutrition',outcome:'nutrition_incomplete',http_status:200});return {verifiedFood:null,lookupOptions:[],privateSourceReadDiagnostics:privateSourceReadDiagnostics.slice(0,3)};}
  const kind=selection.binding.kind==='restaurant'?'menu':'product',evidence={status:'supported',dishes:[{url:selection.binding.source_url,name:selection.binding.name,variant,portion:nutrition.basis.label,nutrition,nutritionStatus:'verified',sourceKind:kind,itemCompleteness:kind==='menu'?'complete_menu_item':'complete_product',...(selection.option.restaurant_name?{restaurantName:selection.option.restaurant_name}:{})}]};
  return {verifiedFood:null,lookupOptions:projectLookupOptions(evidence),privateSourceReadDiagnostics:privateSourceReadDiagnostics.slice(0,3)};
}

export async function verifyAndProjectDiscoverySelection(selection:{binding:{source_url:string;kind:string;name:string;variant?:string;entity?:string};option:any;options:any[];lookup_context?:unknown;privateBindings?:unknown},input:{requestId:string;language:string;fetch:typeof fetch;retrievedAt:string}):Promise<Record<string,unknown>>{
  const checked=await verifySelectedDiscovery(selection,input);
  const option=checked.lookupOptions[0];
  const privateBindings=(selection as any).privateBindings??{};const retainedOptions=option?selection.options.filter((candidate:any)=>candidate?.id!==selection.option?.id):selection.options;const reissued=reissueDiscoveryOptionsForReceipt(retainedOptions,privateBindings,input.requestId);
  if(!option)return {done:true,request_id:input.requestId,usage_status:'completed',corrected_text:input.language.startsWith('es')?`No pude verificar nutrición para ${selection.option.name} desde una fuente compatible; no lo añadiré al registro. Puedes elegir otra opción o probar una fuente compatible.`:`I could not verify nutrition for ${selection.option.name} from a supported source, so I will not add it to your log. You can choose another option or try a supported source.`,choices:[],discovery_options:reissued.options,lookup_options:[],lookup_status:'not_verifiable',action_proposal:null,suggestions:null,...(checked.privateSourceReadDiagnostics.length?{private_source_read_diagnostics:checked.privateSourceReadDiagnostics}:{}),...(Object.keys(reissued.bindings).length?{discovery_option_bindings:reissued.bindings}:{}),...(selection.lookup_context?{lookup_context:selection.lookup_context}:{})};
  const kind=selection.binding.kind,detail=kind==='recipe'?'recipe':kind==='restaurant'?'official menu':'manufacturer product label';
  return {done:true,request_id:input.requestId,usage_status:'completed',corrected_text:input.language.startsWith('es')?`Verifiqué ${option.item_name} con la fuente seleccionada (${detail}). Revisa la opción antes de guardarla.`:`I verified ${option.item_name} from the selected ${detail}. Review the option before saving it.`,choices:[],discovery_options:reissued.options,lookup_options:checked.lookupOptions,lookup_status:'verified',action_proposal:null,suggestions:null,sources:checked.verifiedFood?.sources.map(s=>({title:checked.verifiedFood?.name??'Verified recipe',retrievedAt:s.retrievedAt}))??[],verified_food:checked.verifiedFood,...(checked.privateSourceReadDiagnostics.length?{private_source_read_diagnostics:checked.privateSourceReadDiagnostics}:{}),...(Object.keys(reissued.bindings).length?{discovery_option_bindings:reissued.bindings}:{}),...(selection.lookup_context?{lookup_context:selection.lookup_context}:{})};
}

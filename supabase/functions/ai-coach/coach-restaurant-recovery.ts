import {parseMcDonaldsNutrition,isVerifiedMcDonaldsBranch,type McDonaldsItemReceipt} from './coach-mcdonalds-api.ts';
import {publicFood,isFoodPreferenceExpression} from './coach-lookup-intent.ts';
import {parseDishJSON} from './coach-dish-json.ts';
import {officialMenuNutritionOptions,foodCategory} from './coach-nutrition-evidence.ts';
import {isOfficialRestaurantPlan,verifiedRegistryPages,sealRegistryCandidate,publicDiagnosticURL,type OfficialRestaurantPlan} from './coach-official-capabilities.ts';
import {parsePublishedRestaurantIdentity,parseRestaurantBranchAssociation} from './coach-public-metadata.ts';
import {sourceMarket} from './coach-dish-evidence.ts';
export type CitedRestaurantPair={url:string;association_url:string;association_kind:'branch'};
/** The whole food phrase must be a category plus optional nutrition intent; retain every named identity word. */
export function broadRestaurantCategory(intent:{food?:string;mode?:string;restaurant?:string;product?:string;variant?:string}):string|undefined {
 if(intent.mode!=='restaurant'||intent.restaurant||intent.product||intent.variant)return;
 const food=publicFood(intent.food);if(!food)return;
 const words=food.split(/\s+/);
 for(let start=0;start<words.length;start++)for(let end=start+1;end<=Math.min(words.length,start+2);end++){
  const core=words.slice(start,end).join(' ').toLowerCase(),category=foodCategory(core);
  if(!category||core!==category&&core!==category+'s')continue;
  const before=words.slice(0,start).join(' '),after=words.slice(end).join(' ');
  if((!before||isFoodPreferenceExpression(before))&&(!after||isFoodPreferenceExpression(after)))return category;
 }
}
export function isBroadRestaurantRequest(intent:Parameters<typeof broadRestaurantCategory>[0]){return !!broadRestaurantCategory(intent);}

/** Recovery may read only already cited, exact supported nutrition/branch pairs, within the existing six-read budget. */
export function citedRestaurantPairs(message:any):CitedRestaurantPair[]{
 const citations=(Array.isArray(message?.annotations)?message.annotations:[]).slice(0,20).filter((a:any)=>a?.type==='url_citation'&&typeof a.url_citation?.url==='string');
 const urls=[...new Set<string>(citations.map((a:any)=>a.url_citation.url))];const out:CitedRestaurantPair[]=[];
 for(const url of urls){let host:string;try{const u=new URL(url);if(u.username||u.password||u.port||u.search||u.hash||url.length>2000)continue;host=u.protocol==='https:'&&['papajohns.com','www.papajohns.com'].includes(u.hostname)&&u.pathname==='/company/nutritional-details/'?'locations.papajohns.com':'';}catch{continue;}if(!host)continue;
  const branches=urls.filter(value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname===host&&!u.username&&!u.password&&!u.port;}catch{return false;}});if(branches.length===1)out.push({url,association_url:branches[0],association_kind:'branch'});
 }
 return out.slice(0,3);
}
/** Source-listed names only. No new citation, URL, fabricated dish name or extra HTTP/provider request. */
export function recoverCitedRestaurantRows(message:any,pairs:CitedRestaurantPair[],food:string,retrievedAt:string):any{
 const original=(parseDishJSON(message?.content)?.dishes??[]).slice(0,3) as any[];const rows=[...original];
 for(const pair of pairs){const citation=(message.annotations??[]).find((a:any)=>a?.type==='url_citation'&&a.url_citation?.url===pair.url&&a.url_citation.public_page_verified===true)?.url_citation;if(!citation)continue;
  const names=[...new Set<string>(String(citation.page_content??'').split(/\r?\n/).flatMap(line=>/^#{1,6}\s+(.+)$/.exec(line)?.[1]??[]))];
  for(const name of names){if(rows.length>=6)break;if(rows.some(row=>row?.url===pair.url&&row?.name===name))continue;
   if(!officialMenuNutritionOptions(citation.page_content,name,pair.url,retrievedAt,food,1).some(o=>o.nutrition?.missing.length===0&&o.nutrition.itemIntegrity==='complete'))continue;
   rows.push({name,...pair});break;
  }
 }
 return rows.length===original.length?message:{...message,content:JSON.stringify({dishes:rows})};
}

/** Registry documents remain separate from provider annotations and model dishes. */
export function resolveRegisteredRestaurantRows(message:any,plan:OfficialRestaurantPlan,retrievedAt:string):any{
 if(!isOfficialRestaurantPlan(plan))return message;
 const pages=verifiedRegistryPages(message),reads=(Array.isArray(message.privateSourceReadDiagnostics)?message.privateSourceReadDiagnostics:[]).slice(0,6),rows:any[]=[],diagnostics:any[]=[];
 for(const entry of plan.entries){
  const capability=entry.capability,page=pages.find(p=>p.url===capability.nutritionUrl),branches:Array<{url:string}>=[],checks:any[]=[];
  for(const url of entry.branchURLs){const citation=(message.annotations??[]).find((a:any)=>a?.type==='url_citation'&&a.url_citation?.url===url)?.url_citation;let reason='branch_source_unverified';
   if(citation?.public_page_verified===true&&typeof citation.page_content==='string'){
    const branch=capability.parser==='mcdonaldsItemDetails'?(isVerifiedMcDonaldsBranch(citation.privateMcDonaldsBranch)?citation.privateMcDonaldsBranch:null):parseRestaurantBranchAssociation(citation.page_content,url,{restaurant:capability.merchant,area:plan.area},code=>{reason=code;});
    if(branch){reason=branch.country===capability.market?'verified':'branch_country_mismatch';if(reason==='verified')branches.push({url});}
   }
   checks.push({url:publicDiagnosticURL(url),origin:'provider',reason});
  }
  const found:Array<{name:string;variant?:string}>=[];
  let reason=!entry.branchURLs.length?'no_cited_branch':!page?'nutrition_source_unverified':!branches.length?'no_verified_local_branch':'nutrition_no_complete_items';
  if(page&&branches.length){
   if(capability.parser==='mcdonaldsItemDetails'){
    const receipt=page.privateMcDonaldsItemDetails as McDonaldsItemReceipt|undefined,name=(receipt?.payload as any)?.item?.item_name;
    if(typeof name==='string'&&parseMcDonaldsNutrition(receipt!,{candidateName:name,foodType:capability.category,retrievedAt,sourceUrl:page.url}))found.push({name});
   }else if(parsePublishedRestaurantIdentity(page.page_content,page.url)===capability.merchant){
    const names=[...new Set<string>(page.page_content.split(/\r?\n/).flatMap(line=>/^#{1,6}\s+(.+)$/.exec(line)?.[1]??[]))];
    const options:Array<{name:string;variant?:string}>=[];
    for(const name of names.slice(0,40)){if(foodCategory(name)!==capability.category||sourceMarket(page.url,page.page_content,name)!==capability.market)continue;const variants=officialMenuNutritionOptions(page.page_content,name,page.url,retrievedAt,capability.category,3).filter(o=>o.nutrition?.missing.length===0&&o.nutrition.itemIntegrity==='complete');options.push(...variants.map(o=>({name,variant:o.variant})));}
    for(const distinct of [true,false])for(const option of options){if(found.length>=12)break;if(found.some(row=>row.name===option.name&&(distinct||row.variant===option.variant)))continue;found.push(option);}
   }else reason='nutrition_publisher_unverified';
   for(const option of found)rows.push(sealRegistryCandidate(page,{name:option.name,url:page.url,association_url:branches[0].url,association_kind:'branch',...(option.variant?{__menuVariant:option.variant}:{})}));
   if(found.length)reason='verified';
  }
  diagnostics.push({capability:capability.id,parser:capability.parser,provider_rows:plan.providerRows,provider_citations:plan.providerCitations,cited_branches:entry.branchURLs.length,verified_branches:branches.length,registry_candidates:found.length,reads:reads.length,reason,nutrition:{url:capability.nutritionUrl,origin:'registry',status:page?'downloaded':reads.some((r:any)=>r.url===capability.nutritionUrl)?'failed':'not_attempted',...(page?{evidence_origin:'official_registry_fetch'}:{})},branches:checks});
 }
 // Round-robin the source-proven pool before the 12-item bound; one chain cannot crowd out another.
 const ordered:any[]=[];for(let i=0;i<12;i++)for(const page of pages){const row=rows.filter(r=>r.url===page.url)[i];if(row&&ordered.length<12)ordered.push(row);}
 return {...message,official_registry_candidates:ordered,privateOfficialSourceResolution:diagnostics.length===1?diagnostics[0]:{capabilities:diagnostics,registry_candidates:ordered.length,reads:reads.length,reason:ordered.length?'verified':'no_verified_options'}};
}

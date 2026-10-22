import {parseDishJSON} from './coach-dish-json.ts';
import {publicPlace} from './coach-lookup-intent.ts';
type Capability={id:string;category:'pizza'|'burger';market:'US';merchant:string;nutritionUrl:string;parser:'officialMenuNutritionOptions'|'mcdonaldsItemDetails';branchHost:string};
export const OFFICIAL_RESTAURANT_CAPABILITIES:readonly Capability[]=Object.freeze([
 Object.freeze({id:'papajohns_us_pizza',category:'pizza',market:'US',merchant:'Papa Johns',nutritionUrl:'https://www.papajohns.com/company/nutritional-details/',parser:'officialMenuNutritionOptions',branchHost:'locations.papajohns.com'}),
 Object.freeze({id:'mcdonalds_us_burger',category:'burger',market:'US',merchant:"McDonald's",nutritionUrl:'https://www.mcdonalds.com/us/en-us/product/hamburger.html',parser:'mcdonaldsItemDetails',branchHost:'www.mcdonalds.com'})
]);
type Entry={capability:Capability;branchURLs:readonly string[]};
export type OfficialRestaurantPlan={capability:Capability;entries:readonly Entry[];area:string;branchURLs:readonly string[];providerRows:number;providerCitations:number};
export type OfficialRegistryPage={url:string;title:string;page_content:string;raw_page_content?:string;privateMcDonaldsItemDetails?:unknown;public_page_verified:true;evidence_origin:'official_registry_fetch';parser:string;capability_id:string};
export type RegistryCandidate={name:string;url:string;association_url:string;association_kind:'branch';__menuVariant?:string};
const plans=new WeakSet<object>(),pages=new WeakSet<object>(),candidates=new WeakSet<object>();
export const publicDiagnosticURL=(raw:unknown):string|undefined=>{try{const u=new URL(String(raw));if(u.protocol!=='https:'||u.username||u.password||u.port||u.href.length>2000)return;u.search='';u.hash='';return u.href;}catch{return;}};
export function selectOfficialRestaurantCapability(category:string|undefined,area:string|undefined,market?:string,country?:string):{capability:Capability;capabilities:readonly Capability[];area:string}|undefined{
 if(!['pizza','burger','meal'].includes(category??'')||typeof area!=='string'||market&&market.toUpperCase()!=='US'||country&&country.toUpperCase()!=='US')return;
 const parts=area.split(',').map(s=>s.trim());if(parts.length===3){if(!/^(?:US|USA|United States)$/i.test(parts[2]))return;parts.pop();}
 const place=publicPlace(parts.join(', '),'area'),capabilities=OFFICIAL_RESTAURANT_CAPABILITIES.filter(c=>category==='meal'||c.category===category);
 return place&&capabilities.length?{capability:capabilities[0],capabilities,area:place}:undefined;
}
export function officialRestaurantSourcePlan(selection:ReturnType<typeof selectOfficialRestaurantCapability>,message:any):OfficialRestaurantPlan|undefined{
 if(!selection||selection.capabilities.some(c=>!OFFICIAL_RESTAURANT_CAPABILITIES.includes(c)))return;
 const citations=(Array.isArray(message?.annotations)?message.annotations:[]).slice(0,20).filter((a:any)=>a?.type==='url_citation');
 const entries=selection.capabilities.map(capability=>({capability,branchURLs:[...new Set<string>(citations.flatMap((a:any)=>{const raw=a.url_citation?.url;try{const u=new URL(raw);return typeof raw==='string'&&u.protocol==='https:'&&u.hostname===capability.branchHost&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.href.length<=2000&&u.href===raw&&(capability.parser!=='mcdonaldsItemDetails'||/^\/us\/en-us\/location\/[a-z]{2}\/[a-z0-9-]+\/[a-z0-9-]+\/\d{1,12}\.html$/i.test(u.pathname))?[raw]:[];}catch{return [];}}))].slice(0,selection.capabilities.length>1?2:3)}));
 // Reserve one useful branch per chain before spare branch reads, within six reads including the API.
 let remaining=3;
 const limited=entries.map(e=>({...e,branchURLs:e.branchURLs.slice(0,1)}));remaining-=limited.filter(e=>e.branchURLs.length).length;
 for(let i=0;i<limited.length&&remaining>0;i++){const extra=entries[i].branchURLs.slice(1,remaining+1);limited[i].branchURLs.push(...extra);remaining-=extra.length;}
 const rows=Math.min(12,(parseDishJSON(message?.content)?.dishes??[]).length),branchURLs=limited.flatMap(e=>e.branchURLs);
 const plan=Object.freeze({capability:selection.capability,entries:Object.freeze(limited.map(e=>Object.freeze({...e,branchURLs:Object.freeze(e.branchURLs)}))),area:selection.area,branchURLs:Object.freeze(branchURLs),providerRows:rows,providerCitations:citations.length});plans.add(plan);return plan;
}
export const isOfficialRestaurantPlan=(value:unknown):value is OfficialRestaurantPlan=>!!value&&typeof value==='object'&&plans.has(value as object);
export function sealOfficialRegistryPage(plan:OfficialRestaurantPlan,content:string,url=plan.capability.nutritionUrl,details?:unknown,raw?:string):OfficialRegistryPage{
 const entry=isOfficialRestaurantPlan(plan)?plan.entries.find(e=>e.capability.nutritionUrl===url&&e.branchURLs.length):undefined;
 if(!entry)throw Error('invalid_registry_plan');
 const titles=typeof raw==='string'?[...raw.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)].map(m=>m[1].replace(/<[^>]*>/g,' ').replace(/&#39;|&apos;/gi,"'").replace(/&amp;/gi,'&').trim()):[];
 const page=Object.freeze({url,title:titles.length===1?titles[0]:entry.capability.merchant+' official nutrition',page_content:content,...(entry.capability.parser==='mcdonaldsItemDetails'?{raw_page_content:raw,privateMcDonaldsItemDetails:details}:{}),public_page_verified:true as const,evidence_origin:'official_registry_fetch' as const,parser:entry.capability.parser,capability_id:entry.capability.id});pages.add(page);return page;
}
export function verifiedRegistryPages(message:any):OfficialRegistryPage[]{return (Array.isArray(message?.official_registry_sources)?message.official_registry_sources:[]).filter((p:any)=>p&&pages.has(p)).slice(0,2);}
export function sealRegistryCandidate(page:OfficialRegistryPage,row:RegistryCandidate):RegistryCandidate{if(!pages.has(page)||row.url!==page.url)throw Error('invalid_registry_candidate');const result=Object.freeze(row);candidates.add(result);return result;}
export const isRegistryCandidate=(row:unknown):row is RegistryCandidate=>!!row&&typeof row==='object'&&candidates.has(row as object);
export function verifiedRegistryCandidates(message:any):RegistryCandidate[]{return (Array.isArray(message?.official_registry_candidates)?message.official_registry_candidates:[]).filter(isRegistryCandidate).slice(0,12);}

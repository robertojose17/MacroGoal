import {isOfficialRestaurantPlan,sealOfficialRegistryPage,publicDiagnosticURL,type OfficialRestaurantPlan} from './coach-official-capabilities.ts';
import { fetchMcDonaldsItemDetails, parseMcDonaldsBranchPage, stripUntrustedMcDonaldsReceipt, type McDonaldsItemReceipt, type VerifiedMcDonaldsBranch } from './coach-mcdonalds-api.ts';

// Optional evidence fetch from existing public publisher sites; no search provider or credentials.
import { parseDishJSON } from './coach-dish-json.ts';
// Exact host allowlist, HTTPS only, no redirects, no cookies, no JavaScript/PDF execution.
const HOSTS = new Set(['dominos.com','www.dominos.com','mcdonalds.com','www.mcdonalds.com','baskinrobbins.com','www.baskinrobbins.com','dairyqueen.com','www.dairyqueen.com','haagendazs.com','www.haagendazs.com','icecream.com','www.icecream.com','allrecipes.com','www.allrecipes.com','seriouseats.com','www.seriouseats.com','foodnetwork.com','www.foodnetwork.com','epicurious.com','www.epicurious.com','newmansown.com','www.newmansown.com','tonys.com','www.tonys.com','us.grandospizza.com','papajohns.com','www.papajohns.com','goodnes.com','www.goodnes.com','eatcaulipower.com','www.eatcaulipower.com','target.com','www.target.com','locations.papajohns.com','www.redbaron.com']);
const MAX_EVIDENCE_PAGE_BYTES = 1024 * 1024;
const MAX_RESTAURANT_PAGES = 6;
const RESTAURANT_CONCURRENCY = 2;
const RESTAURANT_DEADLINE_MS = 12_000;
export type SourceReadDiagnostic={slot:number;role:'nutrition'|'branch';outcome:'http_ok'|'http_denied'|'http_redirect'|'http_error'|'unsupported_content_type'|'page_too_large'|'timeout'|'read_error'|'nutrition_incomplete'|'recipe_incomplete';http_status?:number;url?:string;origin?:'registry'|'provider';mime?:'text/html'|'text/plain'|'application/pdf'|'application/json'|'other'};
const diagnosticMIME=(value:string|null):NonNullable<SourceReadDiagnostic['mime']>=>{const mime=(value??'').split(';')[0].trim().toLowerCase();return ['text/html','text/plain','application/pdf','application/json'].includes(mime)?mime as any:'other';};
class PageReadError extends Error { readonly outcome:SourceReadDiagnostic['outcome']; readonly httpStatus?:number;readonly mime?:SourceReadDiagnostic['mime']; constructor(outcome:SourceReadDiagnostic['outcome'],httpStatus?:number,mime?:SourceReadDiagnostic['mime']){super(outcome);this.outcome=outcome;this.httpStatus=httpStatus;this.mime=mime;} }
export function allowedEvidenceURL(raw: unknown): string | null {
  try { const u = new URL(String(raw)); return u.protocol === 'https:' && !u.username && !u.password && !u.port && HOSTS.has(u.hostname) && u.href.length <= 2000 ? u.href : null; } catch { return null; }
}
function normalizePage(body:string,url:string):{content:string;links:string[]} {
  const pageUrl=new URL(url),pageLinks:string[]=[];
  for(const match of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
    const label=match[2].replace(/<[^>]*>/g,' ').replace(/\[\[ROW\]\]([\s\S]*?)\[\[\/ROW\]\]/gi,(_m,row)=>'\n'+row.replace(/\s*\n\s*/g,' ')+'\n').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
    if(!/(?:where\s+to\s+buy|find\s+(?:a\s+)?store|find\s+us|store\s+locator|locations?)/i.test(label))continue;
    const href=/\bhref\s*=\s*["']([^"']+)["']/i.exec(match[1])?.[1];if(!href)continue;
    try{const target=new URL(href,pageUrl);if(target.protocol==='https:'&&target.hostname===pageUrl.hostname&&!target.username&&!target.password&&!target.port&&target.href.length<=2000&&!pageLinks.includes(target.href))pageLinks.push(target.href);}catch{}
  }
  const content=body.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(_m,attrs,payload)=>/\btype\s*=\s*["']application\/(?:ld\+)?json["']/i.test(attrs)?'\n'+payload+'\n':' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<h([1-6])\b[^>]*>/gi,(_m,n)=>'\n'+'#'.repeat(Number(n))+' ').replace(/<tr\b[^>]*>/gi,'\n[[ROW]]').replace(/<\/tr\b[^>]*>/gi,'[[/ROW]]\n').replace(/<(?:br|\/p|\/div|\/section|\/article|\/h[1-6]|\/li|\/dt|\/dd)\b[^>]*>/gi,'\n').replace(/<(td|th)\b([^>]*)>/gi,(_m,tag,attrs)=>{const col=Number(/\bcolspan\s*=\s*["']?(\d+)/i.exec(attrs)?.[1]??1),row=Number(/\browspan\s*=\s*["']?(\d+)/i.exec(attrs)?.[1]??1);return ' | '+(col>1||row>1?'[['+tag.toUpperCase()+':'+col+':'+row+']] ':'');}).replace(/<\/(?:td|th)\b[^>]*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\[\[ROW\]\]([\s\S]*?)\[\[\/ROW\]\]/gi,(_m,row)=>'\n'+row.replace(/\s*\n\s*/g,' ')+'\n').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/[ \t\f\v]+/g,' ').replace(/ *\n */g,'\n').replace(/\n+(?=\|)/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  return{content,links:pageLinks};
}
async function readPage(url:string,fetchPage:typeof fetch,signal:AbortSignal):Promise<{content:string;raw:string;links:string[];mime:SourceReadDiagnostic['mime']}> {
  let response:Response;try{response=await fetchPage(url,{redirect:'manual',credentials:'omit',headers:{Accept:'text/html,text/plain'},signal});}catch(error){if(signal.aborted||error instanceof Error&&['AbortError','TimeoutError'].includes(error.name))throw new PageReadError('timeout');throw new PageReadError('read_error');}
  const mime=diagnosticMIME(response.headers.get('content-type'));
  if(response.status!==200)throw new PageReadError(response.status>=300&&response.status<400?'http_redirect':response.status===402||response.status===403?'http_denied':'http_error',response.status,mime);
  if(!/^(text\/html|text\/plain)\b/i.test(response.headers.get('content-type')??'')||!response.body)throw new PageReadError('unsupported_content_type',response.status,mime);
  if(Number(response.headers.get('content-length')??0)>MAX_EVIDENCE_PAGE_BYTES)throw new PageReadError('page_too_large',response.status,mime);
  const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,body='';
  try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>MAX_EVIDENCE_PAGE_BYTES){await reader.cancel();throw new PageReadError('page_too_large',response.status,mime);}body+=decoder.decode(next.value,{stream:true});}body+=decoder.decode();}catch(error){if(signal.aborted||error instanceof Error&&['AbortError','TimeoutError'].includes(error.name))throw new PageReadError('timeout',response.status,mime);throw error instanceof PageReadError?error:new PageReadError('read_error',response.status,mime);}finally{reader.releaseLock();}
  return{...normalizePage(body,url),raw:body,mime};
}
function timedSignal(parent?:AbortSignal):AbortSignal{return parent?AbortSignal.any([AbortSignal.timeout(4000),parent]):AbortSignal.timeout(4000);}
export async function attachPageEvidence(message:any,fetchPage:typeof fetch,scope:{area?:string;officialRestaurantPlan?:OfficialRestaurantPlan;additionalRestaurantPairs?:Array<{url:string;association_url:string;association_kind:'branch'}>}={}):Promise<any>{
  let annotations=Array.isArray(message?.annotations)?message.annotations.slice(0,20):[];
  const parsed=parseDishJSON(message?.content),rows=[...(parsed?.dishes??[]).slice(0,3),...(scope.additionalRestaurantPairs??[]).slice(0,3)] as any[];
  const registryPlan=isOfficialRestaurantPlan(scope.officialRestaurantPlan)?scope.officialRestaurantPlan:undefined;
  const registryURLs=registryPlan?registryPlan.entries.filter(e=>e.branchURLs.length).flatMap(e=>[e.capability.nutritionUrl,...e.branchURLs]):[];
  const priorities:string[]=[],retailerAssociationURLs=new Set<string>();
  for(const row of rows){if(typeof row?.url==='string'&&!priorities.includes(row.url))priorities.push(row.url);if(row?.association_kind==='branch'&&typeof row?.association_url==='string'&&!priorities.includes(row.association_url))priorities.push(row.association_url);if(row?.association_kind==='retailer'&&typeof row?.association_url==='string')retailerAssociationURLs.add(row.association_url);}
  const restaurantPairs=registryURLs.length>0||rows.some(row=>row?.association_kind==='branch'&&typeof row?.association_url==='string');
  const citedURLs=new Set(annotations.filter((value:any)=>value?.type==='url_citation').map((value:any)=>value?.url_citation?.url).filter((url:any)=>typeof url==='string'));
  // When dish candidates exist, only their cited primary URLs (and cited branch
  // associations) may enter the fetch queue. Citation-only recipe flows retain
  // their existing bounded behavior when no dish rows were parsed.
  const legacyCandidates=registryPlan?[]:rows.length?priorities.filter(url=>citedURLs.has(url)):annotations.filter((value:any)=>value?.type==='url_citation').map((value:any)=>value?.url_citation?.url).filter((url:any)=>typeof url==='string');
  const candidates=[...registryURLs,...legacyCandidates];
  const ordered=[...new Set((restaurantPairs?candidates.slice(0,MAX_RESTAURANT_PAGES):candidates.slice(0,3)).filter(url=>allowedEvidenceURL(url)===url))].slice(0,restaurantPairs?MAX_RESTAURANT_PAGES:3);
  const rank=new Map(ordered.map((url,index)=>[url,index]));
  if(ordered.length)annotations=annotations.map((value:any,index:number)=>({value,index})).sort((a:any,b:any)=>(rank.get(a.value?.url_citation?.url)??Number.MAX_SAFE_INTEGER)-(rank.get(b.value?.url_citation?.url)??Number.MAX_SAFE_INTEGER)||a.index-b.index).map((x:any)=>x.value);
  const cache=new Map<string,{content:string;raw:string;links:string[];mime?:SourceReadDiagnostic['mime'];mcdonaldsItemDetails?:McDonaldsItemReceipt;privateMcDonaldsBranch?:VerifiedMcDonaldsBranch}>(),verified:any[]=[],privateSourceReadDiagnostics:SourceReadDiagnostic[]=[];
let sourceReadCount=0;

  const overall=new AbortController(),timer=restaurantPairs?setTimeout(()=>overall.abort(),RESTAURANT_DEADLINE_MS):undefined;
  try {
    if(restaurantPairs){
      let cursor=0;
      const worker=async()=>{while(cursor<ordered.length&&!overall.signal.aborted){
  const url=ordered[cursor++];if(cache.has(url))continue;
  const rowIndex=rows.findIndex(row=>row?.url===url||row?.association_url===url),isNutrition=!!registryPlan?.entries.some(e=>e.capability.nutritionUrl===url)||rows.some(row=>row?.url===url),role=isNutrition?'nutrition':'branch',slot:number=registryPlan?(registryPlan.entries.some(e=>e.capability.nutritionUrl===url)?0:registryPlan.branchURLs.indexOf(url)+1):Math.max(1,rowIndex+1);
  try{
    if(sourceReadCount>=MAX_RESTAURANT_PAGES)break;
    sourceReadCount++;
    const page:any=await readPage(url,fetchPage,timedSignal(overall.signal));
    if(isNutrition&&sourceReadCount<MAX_RESTAURANT_PAGES&&['mcdonalds.com','www.mcdonalds.com'].includes(new URL(url).hostname)){
      sourceReadCount++;
      page.mcdonaldsItemDetails=await fetchMcDonaldsItemDetails({pageUrl:url,pageHtml:page.raw,fetchPage,signal:overall.signal})??undefined;
      if(privateSourceReadDiagnostics.length<6)privateSourceReadDiagnostics.push({slot,role:'nutrition',outcome:page.mcdonaldsItemDetails?'http_ok':'read_error',...(page.mcdonaldsItemDetails?{http_status:200}:{})});
    }
    if(!isNutrition){
      if(scope.area&&url.startsWith('https://www.mcdonalds.com/'))page.privateMcDonaldsBranch=parseMcDonaldsBranchPage(url,page.raw,scope.area)??undefined;
      if(!page.privateMcDonaldsBranch)page.raw='';
    }
    cache.set(url,page);
    if(privateSourceReadDiagnostics.length<6)privateSourceReadDiagnostics.push({slot,role,outcome:'http_ok',http_status:200,...(registryPlan?{url:publicDiagnosticURL(url),origin:registryPlan.entries.some(e=>e.capability.nutritionUrl===url)?'registry' as const:'provider' as const,mime:page.mime}: {})});
  }catch(error){const e=error as any;if(privateSourceReadDiagnostics.length<6)privateSourceReadDiagnostics.push({slot,role,...(registryPlan?{url:publicDiagnosticURL(url),origin:registryPlan.entries.some(e=>e.capability.nutritionUrl===url)?'registry' as const:'provider' as const,...(e instanceof PageReadError&&e.mime?{mime:e.mime}:{})}:{}),outcome:e instanceof PageReadError?e.outcome:overall.signal.aborted?'timeout':'read_error',...(e instanceof PageReadError&&e.httpStatus?{http_status:e.httpStatus}:{})});}
}};

      await Promise.all(Array.from({length:RESTAURANT_CONCURRENCY},worker));
    }
    let attempted=0;
    for(const annotation of annotations){
const raw=annotation?.url_citation,
  safeRaw=raw?stripUntrustedMcDonaldsReceipt(raw):undefined,
  url=allowedEvidenceURL(raw?.url);

const clean=safeRaw
  ?{...annotation,url_citation:{...safeRaw,page_content:undefined,page_links:undefined,raw_page_content:undefined,public_page_verified:false}}
  :annotation;

      if(annotation?.type!=='url_citation'||!url||retailerAssociationURLs.has(raw?.url)||!rank.has(raw?.url)||!restaurantPairs&&attempted>=3){verified.push(clean);continue;}
      try{
        let result=cache.get(url);
if(!result){
  attempted++;if(restaurantPairs)throw Error('source_unavailable');
  const slot=Math.max(1,priorities.indexOf(raw?.url)+1);
  try{
    if(sourceReadCount>=MAX_RESTAURANT_PAGES)throw Error('source_read_budget');
    sourceReadCount++;
    result=await readPage(url,fetchPage,AbortSignal.timeout(4000));
    if(['mcdonalds.com','www.mcdonalds.com'].includes(new URL(url).hostname)&&sourceReadCount<MAX_RESTAURANT_PAGES){
      sourceReadCount++;
      (result as any).mcdonaldsItemDetails=await fetchMcDonaldsItemDetails({pageUrl:url,pageHtml:result.raw,fetchPage})??undefined;
      if(privateSourceReadDiagnostics.length<6)privateSourceReadDiagnostics.push({slot,role:'nutrition',outcome:(result as any).mcdonaldsItemDetails?'http_ok':'read_error',...((result as any).mcdonaldsItemDetails?{http_status:200}:{})});
    }
    cache.set(url,result);
    if(privateSourceReadDiagnostics.length<6)privateSourceReadDiagnostics.push({slot,role:'nutrition',outcome:'http_ok',http_status:200});
  }catch(error){const e=error as any;if(privateSourceReadDiagnostics.length<6)privateSourceReadDiagnostics.push({slot,role:'nutrition',outcome:e instanceof PageReadError?e.outcome:e instanceof Error&&['AbortError','TimeoutError'].includes(e.name)?'timeout':'read_error',...(e instanceof PageReadError&&e.httpStatus?{http_status:e.httpStatus}:{})});throw error;}
}

verified.push({...annotation,url_citation:{
  ...safeRaw,
  content:raw.content??result.content,
  page_content:result.content,
  raw_page_content:result.raw,
  page_links:result.links,
  ...(result.mcdonaldsItemDetails
    ?{privateMcDonaldsItemDetails:result.mcdonaldsItemDetails}
    :{}),
  ...(result.privateMcDonaldsBranch?{privateMcDonaldsBranch:result.privateMcDonaldsBranch}:{}),
  public_page_verified:true
}});

      }catch{verified.push(clean);}
    }
  } finally {if(timer)clearTimeout(timer);}
  const registryPages=registryPlan?registryPlan.entries.flatMap(e=>{const page=cache.get(e.capability.nutritionUrl);return page?[sealOfficialRegistryPage(registryPlan,page.content,e.capability.nutritionUrl,page.mcdonaldsItemDetails,page.raw)]:[]}):[];
  return{...message,annotations:verified,official_restaurant_plan:registryPlan,official_registry_sources:registryPages,privateSourceReadDiagnostics:privateSourceReadDiagnostics.slice(0,6)};
}

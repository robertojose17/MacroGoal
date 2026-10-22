/** Bounded McDonald's official item-details adapter. It consumes only verified page HTML and the fixed same-origin JSON route. */
import { publicTypography } from './coach-lookup-intent.ts';
export type McDonaldsNutrition = {
  preparation: 'as_sold'; itemAssociation: 'menu_item'; itemIntegrity: 'complete';
  identity: string; basis: { amount: 1; unit: 'serving'; label: string };
  fields: Record<'calories'|'protein'|'carbs'|'fat'|'fiber', {value:number;unit:'kcal'|'g';method:'reported';source:{provider:string;id:string;url:string;field:string;retrievedAt:string}}>
  missing: [];
};
export type McDonaldsItemReceipt = { productId: string; apiUrl: string; pageUrl: string; payload: unknown };
export type VerifiedMcDonaldsBranch = {name:"McDonald's";address:string;evidence_status:'verified';source_url:string;source_field:string;city:string;region:string;country:'US'};

const MAX_API_BYTES=512*1024;
const EXPECTED_IDS={calories:2,protein:11,carbs:22,fat:21,fiber:32} as const;
const EXPECTED_CODES={calories:'calories',protein:'protein',carbs:'carbohydrate',fat:'fat',fiber:'fibre'} as const;
const exactHost=(hostname:string)=>hostname==='mcdonalds.com'||hostname==='www.mcdonalds.com';
const issuedReceipts=new WeakSet<object>();
const issuedBranches=new WeakSet<object>();

/** Remove a provider-supplied field that must only be populated after our own bounded fetch succeeds. */
export function stripUntrustedMcDonaldsReceipt<T extends Record<string,unknown>>(citation:T):Omit<T,'privateMcDonaldsItemDetails'>{
  const {privateMcDonaldsItemDetails:_untrusted,privateMcDonaldsBranch:_untrustedBranch,...safe}=citation as T&{privateMcDonaldsItemDetails?:unknown;privateMcDonaldsBranch?:unknown};
  return safe;
}
function validApiUrl(raw:string,productId:string):boolean{
  try{const u=new URL(raw);return u.protocol==='https:'&&exactHost(u.hostname)&&!u.username&&!u.password&&!u.port&&u.pathname==='/dnaapp/itemDetails'&&!u.hash&&u.searchParams.getAll('country').length===1&&u.searchParams.get('country')==='US'&&u.searchParams.getAll('language').length===1&&u.searchParams.get('language')==='en'&&u.searchParams.getAll('showLiveData').length===1&&u.searchParams.get('showLiveData')==='true'&&u.searchParams.getAll('item').length===1&&u.searchParams.get('item')===productId&&[...u.searchParams.keys()].length===4&&u.href.length<=2000;}catch{return false;}
}
const decoded=(value:string)=>value.replace(/&amp;/gi,'&').replace(/&#x2f;/gi,'/').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'");
const normalize=(value:string)=>value.normalize('NFKC').replace(/[\u00AE\u2122\u00A9]/gu,'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
// Comparison only: keep source names/labels and every identity word unchanged.
const itemIdentity=(value:string)=>publicTypography(value.replace(/[®™©]/gu,'')).trim().replace(/\s+/g,' ').toLocaleLowerCase();
// Only the official API marketing field may carry this attached editorial footnote.
// A bare, separated, repeated or word-internal asterisk remains part of the identity.
const marketingIdentity=(value:string)=>itemIdentity(value.replace(/([®™])\*(?=\s|$)/u,'$1'));
const numeric=(value:unknown):number|null=>{if(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value.trim()))return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;};
const plain=(value:string)=>normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const STATE_CODES:Record<string,string>={alabama:'al',alaska:'ak',arizona:'az',arkansas:'ar',california:'ca',colorado:'co',connecticut:'ct',delaware:'de',florida:'fl',georgia:'ga',hawaii:'hi',idaho:'id',illinois:'il',indiana:'in',iowa:'ia',kansas:'ks',kentucky:'ky',louisiana:'la',maine:'me',maryland:'md',massachusetts:'ma',michigan:'mi',minnesota:'mn',mississippi:'ms',missouri:'mo',montana:'mt',nebraska:'ne',nevada:'nv','new hampshire':'nh','new jersey':'nj','new mexico':'nm','new york':'ny','north carolina':'nc','north dakota':'nd',ohio:'oh',oklahoma:'ok',oregon:'or',pennsylvania:'pa','rhode island':'ri','south carolina':'sc','south dakota':'sd',tennessee:'tn',texas:'tx',utah:'ut',vermont:'vt',virginia:'va',washington:'wa','west virginia':'wv',wisconsin:'wi',wyoming:'wy'};
const stateCode=(value:string)=>{const v=plain(value);return v.length===2?v:STATE_CODES[v]??'';};

/** Parse exactly one official US McDonald's branch-details attribute; no annotations or model text are accepted. */
export function parseMcDonaldsBranchPage(sourceUrl:string,rawHtml:string,requestedArea:string):VerifiedMcDonaldsBranch|null{
  let page:URL;try{page=new URL(sourceUrl);}catch{return null;}
  if(page.protocol!=='https:'||page.hostname!=='www.mcdonalds.com'||page.username||page.password||page.port||page.search||page.hash||page.href.length>2000||typeof rawHtml!=='string'||new TextEncoder().encode(rawHtml).byteLength>1024*1024)return null;
  const match=/^\/us\/en-us\/location\/([a-z]{2})\/([a-z0-9-]+)\/([a-z0-9-]+)\/(\d{1,12})\.html$/i.exec(page.pathname);
  if(!match)return null;
  const [,urlState,urlCity,_streetSlug,urlId]=match;
  const attrs=[...rawHtml.matchAll(/\bdata-restaurant-details-resp\s*=\s*(["'])([\s\S]*?)\1/gi)];
  if(attrs.length!==1)return null;
  let encoded=attrs[0][2];for(let i=0;i<2;i++)encoded=encoded.replace(/&quot;/gi,'"').replace(/&#34;/gi,'"').replace(/&#x27;|&#39;|&apos;/gi,"'").replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
  if(new TextEncoder().encode(encoded).byteLength>512*1024)return null;
  let root:any;try{root=JSON.parse(encoded);}catch{return null;}
  const d=root?.restaurantDetails;if(!d||typeof d!=='object'||Array.isArray(d))return null;
  const str=(v:unknown,max=180)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max?v.trim():null;
  const street=str(d.addressLine1,160),city=str(d.addressLine3,80),countryText=str(d.addressLine4,80),state=str(d.subDivision,80),postal=str(d.postcode,20),branchId=String(d.identifierValue??'');
  if(!street||!city||!countryText||!state||!postal||!/^\d{1,12}$/.test(branchId)||branchId!==urlId||stateCode(state)!==urlState.toLowerCase()||plain(city)!==plain(urlCity.replace(/-/g,' '))||!['united states','us','usa'].includes(plain(countryText)))return null;
  const identifiers=d.identifiers?.storeIdentifier;
  if(!Array.isArray(identifiers))return null;
  const national=identifiers.filter((x:any)=>x?.identifierType==='NATLSTRNUMBER');
  if(national.length!==1||String(national[0]?.identifierValue??'')!==urlId)return null;
  const titles=[...rawHtml.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)].map(m=>m[1].replace(/<[^>]+>/g,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim());
  const metas=[...rawHtml.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]).filter(tag=>/\bname\s*=\s*(["'])description\1/i.test(tag));
  const metaValues=metas.map(tag=>{const c=[...tag.matchAll(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/gi)];return c.length===1?c[0][2].replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim():'';});
  if(titles.length!==1||metas.length!==1||!metaValues[0])return null;
  const titleMatch=/^fast food in (.+?), ([a-z]{2}) at (.+?) \| mcdonald's$/i.exec(titles[0]);
if(/\b(?:do not|don't|never|no)\s+visit\s+mcdonald's\b/i.test(metaValues[0]))return null;
  const descriptionMatch=/\bvisit mcdonald's in\s+([^,]+),\s*([^\s]+)\s+at\s+([^,]+),/i.exec(metaValues[0]);
  if(!titleMatch||!descriptionMatch)return null;
  const requested=requestedArea.split(',').map(plain).filter(Boolean);
  if(requested.length<1||requested.length>3)return null;
  if(requested[0]!==plain(city)||plain(titleMatch[1])!==plain(city)||plain(descriptionMatch[1])!==plain(city))return null;
  const requestedRegion=requested[1]??'',countrySlot=requested[2]??'';
  if(requestedRegion&&stateCode(requestedRegion)!==urlState.toLowerCase())return null;
  if(countrySlot&&!['us','usa','united states'].includes(countrySlot))return null;
  if(stateCode(titleMatch[2])!==urlState.toLowerCase()||stateCode(descriptionMatch[2])!==urlState.toLowerCase())return null;
  if(plain(titleMatch[3])!==plain(street)||plain(descriptionMatch[3])!==plain(street))return null;
  const branch:VerifiedMcDonaldsBranch={name:"McDonald's",address:[street,city,`${state} ${postal}`].join(', '),evidence_status:'verified',source_url:page.href,source_field:'data-restaurant-details-resp.restaurantDetails',city,region:state,country:'US'};
  issuedBranches.add(branch);return branch;
}

export function isVerifiedMcDonaldsBranch(value:unknown):value is VerifiedMcDonaldsBranch{
  return !!value&&typeof value==='object'&&issuedBranches.has(value as object);
}

/** Accept only one decimal ID and the exact relative API route from the already verified official product page. */
export function parseMcDonaldsProductReference(pageUrl:string,rawHtml:string):{productId:string;apiUrl:string}|null{
  let page:URL;try{page=new URL(pageUrl);}catch{return null;}
  if(page.protocol!=='https:'||!exactHost(page.hostname)||page.username||page.password||page.port||page.href.length>2000||typeof rawHtml!=='string'||rawHtml.length>1024*1024)return null;
  // Related-product cards can carry their own data-product-id attributes. Restrict
  // extraction to the single opening tag that identifies the page's PDP root.
  const roots=[...rawHtml.matchAll(/<[a-z][\w:-]*\b(?=[^>]*\bdata-component\s*=\s*(["'])pdp\1)[^>]*>/gi)];
  if(roots.length!==1)return null;
  const rootTag=roots[0][0];
  const attrs=(name:string)=>[...rootTag.matchAll(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`,'gi'))].map(m=>decoded(m[2]));
  const ids=attrs('data-product-id'),routes=attrs('data-product-api-url');
  const one=(name:string,expected:string)=>{const values=attrs(name);return values.length===1&&values[0]===expected;};
  if(ids.length!==1||!/^\d{1,12}$/.test(ids[0])||routes.length!==1||!one('data-country','us')||!one('data-language','en-us')||!one('data-site-country','US')||!one('data-site-language','en')||!one('data-show-live-data','true'))return null;
  let route:URL;try{route=new URL(routes[0],page.origin);}catch{return null;}
  if(route.origin!==page.origin||route.pathname!=='/dnaapp/itemDetails'||route.username||route.password||route.port||route.hash||route.search)return null;
  const api=new URL('/dnaapp/itemDetails',page.origin);api.searchParams.set('country','US');api.searchParams.set('language','en');api.searchParams.set('showLiveData','true');api.searchParams.set('item',ids[0]);
  return {productId:ids[0],apiUrl:api.href};
}

/** Bounded JSON read. Caller accounts this API read in the existing per-request source-read budget. */
export async function fetchMcDonaldsItemDetails(input:{pageUrl:string;pageHtml:string;fetchPage:typeof fetch;signal?:AbortSignal}):Promise<McDonaldsItemReceipt|null>{
  const ref=parseMcDonaldsProductReference(input.pageUrl,input.pageHtml);if(!ref)return null;
  const signal=input.signal?AbortSignal.any([AbortSignal.timeout(4000),input.signal]):AbortSignal.timeout(4000);
  let response:Response;try{response=await input.fetchPage(ref.apiUrl,{redirect:'manual',credentials:'omit',headers:{Accept:'application/json'},signal});}catch{return null;}
  if(response.status!==200||!/^application\/(?:json|[\w.+-]+\+json)\b/i.test(response.headers.get('content-type')??'')||!response.body)return null;
  const declared=Number(response.headers.get('content-length')??0);if(declared>MAX_API_BYTES)return null;
  const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,body='';
  try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>MAX_API_BYTES){await reader.cancel();return null;}body+=decoder.decode(next.value,{stream:true});}body+=decoder.decode();}catch{return null;}finally{reader.releaseLock();}
  try{const receipt:McDonaldsItemReceipt={productId:ref.productId,apiUrl:ref.apiUrl,pageUrl:input.pageUrl,payload:JSON.parse(body)};issuedReceipts.add(receipt);return receipt;}catch{return null;}
}

/** Interpret only item.nutrient_facts. Component nutrients and hundred_g_per_product are never read. */
export function parseMcDonaldsNutrition(receipt:McDonaldsItemReceipt,input:{candidateName:string;foodType?:string;retrievedAt:string;sourceUrl:string}):{nutrition:McDonaldsNutrition;restaurantName:"McDonald's"}|null{
  if(!receipt||!issuedReceipts.has(receipt)||receipt.pageUrl!==input.sourceUrl||!/^\d{1,12}$/.test(receipt.productId)||!validApiUrl(receipt.apiUrl,receipt.productId))return null;
  let page:URL;try{page=new URL(receipt.pageUrl);}catch{return null;}
  if(page.protocol!=='https:'||!exactHost(page.hostname)||page.username||page.password||page.port||page.origin!==new URL(receipt.apiUrl).origin)return null;
  const root=receipt.payload as any,item=root?.item;
  if(!item||typeof item!=='object'||Array.isArray(item)||String(item.id)!==receipt.productId||String(item.item_id)!==receipt.productId||item.item_type!=='Core Item')return null;
  const itemName=typeof item.item_name==='string'?item.item_name.trim():'';
  const marketing=typeof item.item_marketing_name==='string'?item.item_marketing_name.trim():'';
  if(!itemName||itemName.length>120||marketing&&marketingIdentity(marketing)!==itemIdentity(itemName)||itemIdentity(itemName)!==itemIdentity(input.candidateName))return null;
  const defaultCategory=item.default_category?.category?.name;
  if(typeof defaultCategory!=='string'||!defaultCategory.trim())return null;
  const food=itemIdentity(input.foodType??'').replace(/^(?:healthy|saludable)\s+/,'');
  const category=normalize(defaultCategory),normalizedItem=itemIdentity(itemName);
  if(!food)return null;
  // The receipt and candidate above already bind this item to the official merchant.
  // Accept only that merchant's prefix plus the complete item; retain every variant word.
  const exactItemRequest=food===normalizedItem||food===`mcdonald's ${normalizedItem}`;
  const burgerRequest=/^(?:burger|burgers|hamburger|hamburgers|cheeseburger|cheeseburgers|hamburguesa|hamburguesas)$/.test(food);
  const categoryCompatible=category==='burgers'&&(burgerRequest||exactItemRequest);
  if(!categoryCompatible)return null;
  const rows=item.nutrient_facts?.nutrient;
  if(!Array.isArray(rows)||rows.length>100)return null;
  const fields={} as McDonaldsNutrition['fields'];
  for(const key of Object.keys(EXPECTED_CODES) as Array<keyof typeof EXPECTED_CODES>){
    const found=rows.filter((row:any)=>row?.nutrient_name_id===EXPECTED_CODES[key]);
    if(found.length!==1||found[0].id!==EXPECTED_IDS[key])return null;
    const row=found[0],value=numeric(row.value);
    const actualUnit=String(row.uom??'').trim().replace(/\.$/,'');
    if(value===null||actualUnit.toLowerCase()!==(key==='calories'?'cal':'g')||typeof row.uom_description!=='string'||row.uom_description.trim().toLowerCase()!==(key==='calories'?'cal.':'grams'))return null;
    fields[key]={value,unit:key==='calories'?'kcal':'g',method:'reported',source:{provider:"McDonald's official menu API",id:receipt.productId,url:receipt.apiUrl,field:`item.nutrient_facts.nutrient[id=${EXPECTED_IDS[key]},nutrient_name_id=${EXPECTED_CODES[key]}].value`,retrievedAt:input.retrievedAt}};
  }
  if(Object.keys(fields).length!==5)return null;
  const nutrition:McDonaldsNutrition={preparation:'as_sold',itemAssociation:'menu_item',itemIntegrity:'complete',identity:itemName,basis:{amount:1,unit:'serving',label:`1 ${itemName}`},fields,missing:[]};
  return {nutrition,restaurantName:"McDonald's"};
}

/** Merchant identity comes from the cited official page title; require item mention in its verified HTML. */
export function verifiedMcDonaldsMerchant(pageUrl:string,title:unknown,pageHtml:unknown,itemName:string):"McDonald's"|null{
  let u:URL;try{u=new URL(pageUrl);}catch{return null;}
  if(u.protocol!=='https:'||!exactHost(u.hostname)||u.username||u.password||u.port)return null;
  if(typeof title!=='string'||typeof pageHtml!=='string'||!itemName||pageHtml.length>1024*1024||!itemIdentity(pageHtml).includes(itemIdentity(itemName)))return null;
  const suffix=/\|\s*McDonald's\s*$/i.exec(itemIdentity(title));return suffix?"McDonald's":null;
}

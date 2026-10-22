import { allowedEvidenceURL } from './coach-source-pages.ts';
import { publicPlace } from './coach-lookup-intent.ts';

export type ProductIdentity={itemName:string;brand:string;variant?:string;gtin?:string;packageDetails?:string[]};
export type VerifiedRetailer={name:string;evidence_status:'verified';source_url:string;source_field:string;product_name:string;brand:string;variant?:string};
export type VerifiedBranch={name:string;address:string;evidence_status:'verified';source_url:string;source_field:string;city:string;region:string;country:string};
const MAX_SOURCE_BYTES=512*1024,MAX_JSON_OBJECTS=30,MAX_NODES=250;
const plain=(value:string)=>value.normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
function objects(content:string):any[]{if(typeof content!=='string'||content.length>MAX_SOURCE_BYTES)return [];const out:any[]=[];let start=-1,depth=0,inString=false,escape=false;for(let i=0;i<content.length;i++){const c=content[i];if(depth===0){if(c==='{'){start=i;depth=1;inString=false;escape=false;}continue;}if(inString){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')inString=false;continue;}if(c==='"'){inString=true;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0){try{out.push(JSON.parse(content.slice(start,i+1)));}catch{}if(out.length>=MAX_JSON_OBJECTS)break;}}return out;}
const types=(o:any):string[]=>Array.isArray(o?.['@type'])?o['@type'].filter((x:any)=>typeof x==='string'):typeof o?.['@type']==='string'?[o['@type']]:[];
function nodes(content:string):any[]{const roots=objects(content),out:any[]=[],seen=new Set<any>();let count=0;const walk=(x:any,depth=0)=>{if(!x||typeof x!=='object'||depth>12||count++>MAX_NODES)return;if(Array.isArray(x)){for(const y of x)walk(y,depth+1);return;}if(seen.has(x))return;seen.add(x);out.push(x);for(const y of Object.values(x))walk(y,depth+1);};for(const root of roots)walk(root);return out;}
const text=(value:any,max=200)=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=max?value.trim():undefined;
const brandName=(value:any)=>typeof value==='string'?text(value):text(value?.name);
const hasType=(o:any,name:string)=>types(o).some(t=>t.toLowerCase()===name.toLowerCase());
const propertyValues=(product:any)=>{const values:string[]=[];for(const item of Array.isArray(product?.additionalProperty)?product.additionalProperty:[]){const key=plain(String(item?.name??''));if(/variant|flavou?r|crust|style|size/.test(key)){const value=text(item?.value);if(value)values.push(value);}}for(const key of ['variant','model','color','size']){const value=text(product?.[key]);if(value)values.push(value);}return values;};
const validGTIN=(value:unknown):value is string=>{if(typeof value!=='string'||!/^(?:\d{8}|\d{12,14})$/.test(value))return false;const digits=[...value].map(Number),check=digits.pop()!;let sum=0;for(let i=digits.length-1,pos=0;i>=0;i--,pos++)sum+=digits[i]*(pos%2===0?3:1);return (10-sum%10)%10===check;};
const GTIN_KEYS=['gtin','gtin8','gtin12','gtin13','gtin14'] as const;
const normalizeGTIN=(value:unknown):string|null=>validGTIN(value)?value.padStart(14,'0'):null;
function gtinValue(product:any):string|null|undefined{const values:string[]=[];for(const key of [...GTIN_KEYS,'sku']){if(product?.[key]===undefined)continue;const normalized=normalizeGTIN(String(product[key]).replace(/[-\s]/g,''));if(!normalized){if(GTIN_KEYS.includes(key))return null;continue;}values.push(normalized);}if(!values.length)return undefined;return new Set(values).size===1?values[0]:null;}
const phrasePresent=(haystack:string,needle:string)=>{const h=' '+plain(haystack)+' ',n=' '+plain(needle)+' ';return !!needle.trim()&&h.includes(n);};
function exactSource(raw:string,expectedHost:string):string|null{const safe=allowedEvidenceURL(raw);if(!safe)return null;try{return new URL(safe).hostname===expectedHost?safe:null;}catch{return null;}}
function canonicalPublicPage(raw:unknown):string|null{if(typeof raw!=='string')return null;const safe=allowedEvidenceURL(raw);if(!safe)return null;try{const u=new URL(safe);u.pathname=u.pathname.replace(/\/index\.html?$/i,'/').replace(/\/$/,'');return u.origin.toLowerCase()+u.pathname.toLowerCase()+u.search;}catch{return null;}}

export type CitedDiscoveryField={value:string;source_url:string;quote?:string;evidence_basis?:'quote'|'citation_title'|'page_header'};
export type CitedDiscoveryMetadata=Partial<Record<'restaurant_name'|'brand'|'retailer'|'address'|'variant',CitedDiscoveryField>>;
const METADATA_FIELDS=['restaurant_name','brand','retailer','address','variant'] as const;
const US_STATE_GROUPS=[
 ['alabama','al'],['alaska','ak'],['arizona','az'],['arkansas','ar'],['california','ca'],['colorado','co'],['connecticut','ct'],['delaware','de'],['florida','fl'],['georgia','ga'],['hawaii','hi'],['idaho','id'],['illinois','il'],['indiana','in'],['iowa','ia'],['kansas','ks'],['kentucky','ky'],['louisiana','la'],['maine','me'],['maryland','md'],['massachusetts','ma'],['michigan','mi'],['minnesota','mn'],['mississippi','ms'],['missouri','mo'],['montana','mt'],['nebraska','ne'],['nevada','nv'],['new hampshire','nh'],['new jersey','nj'],['new mexico','nm'],['new york','ny'],['north carolina','nc'],['north dakota','nd'],['ohio','oh'],['oklahoma','ok'],['oregon','or'],['pennsylvania','pa'],['rhode island','ri'],['south carolina','sc'],['south dakota','sd'],['tennessee','tn'],['texas','tx'],['utah','ut'],['vermont','vt'],['virginia','va'],['washington','wa'],['west virginia','wv'],['wisconsin','wi'],['wyoming','wy'],
].map(group=>group.map(plain));
const sameRegion=(a:string,b:string)=>plain(a)===plain(b)||US_STATE_GROUPS.some(group=>group.includes(plain(a))&&group.includes(plain(b)));
const COUNTRY_GROUPS=[['united states','usa','us'],['canada','ca'],['united kingdom','uk','gb'],['australia','au'],['new zealand','nz'],['mexico','mx'],['spain','es']].map(group=>group.map(plain));
function addressMatchesRequestedArea(address:string,area:string):boolean {
 const slots=area.split(',').map(plain).filter(Boolean),segments=address.split(',').map(plain).filter(Boolean);
 if(!slots.length)return false;const cityIndex=segments.findIndex(segment=>segment===slots[0]);if(cityIndex<0)return false;
 return slots.slice(1).every((slot,index)=>{const state=US_STATE_GROUPS.find(values=>values.includes(slot)),country=COUNTRY_GROUPS.find(values=>values.includes(slot)),group=index===0?(state??country??[slot]):(country??state??[slot]);return segments.slice(cityIndex+1).some(segment=>group.some(alias=>segment===alias||segment.startsWith(alias+' ')));});
}
const addressBoundToMerchant=(quote:string,address:string,merchant:string,area:string)=>{
 if(/[\[\]]|(?:\.{3,}|…)/u.test(quote))return false;
 const clauses=quote.split(/[;\n]+|(?<=[.!?])\s+/u);
 const matches=[...quote.matchAll(/\b\d{1,6}\s+[\p{L}\p{N}][^,;\n]{2,70}\b(?:st(?:reet)?|rd|road|ave(?:nue)?|blvd|boulevard|dr(?:ive)?|ln|lane|way)\b/giu)];
 if(matches.length!==1)return false;
 const street=matches[0],idx=street.index??-1,clause=clauses.find(x=>idx>=0&&quote.indexOf(x)<=idx&&quote.indexOf(x)+x.length>=idx+street[0].length);
 return !!clause&&phrasePresent(clause,address)&&phrasePresent(clause,merchant)&&addressMatchesRequestedArea(address,area);
};
const itemFieldBound=(quote:string,value:string,item:string)=>{
 if(/[\[\]]|(?:\.{3,}|…)/u.test(quote))return false;
 const clauses=quote.split(/[;\n]+|(?<=[.!?])\s+/u);
 return clauses.some(clause=>phrasePresent(clause,item)&&phrasePresent(clause,value));
};
function cleanSingleMerchantTitle(title:string,item:string):string|undefined {
 if(!text(title,240))return;const parts=title.split('|').map(part=>part.trim());if(parts.length>2)return;
 let candidate=parts[0];
 const framed=/^(.+?)\s*(?:[-–—:]\s*)?(?:online\s+menu|menu|order\s+online)\s*$/i.exec(candidate);if(!framed)return;
 candidate=framed[1].trim().replace(/[|:–—-]+$/,'').trim();
 if(parts.length===2&&!/^best\s+(?:pizza|pizzas|food|restaurants?)\s+in\s+(?:the\s+)?(?:town|city|your\s+area|[\p{L}][\p{L}\s'-]{1,48})$/iu.test(parts[1]))return;
 if(!candidate||candidate.length>120||/[,&/]/.test(candidate)||/\b(?:and|or|vs|versus|directory|list|top\s+\d+|best|top|guide|restaurant\s+finder|near\s+you)\b/i.test(candidate)||plain(candidate)===plain(item))return;
 return candidate;
}
function pageHeaderBindsItem(page:string,header:string,item:string):boolean {
 const lines=page.split(/\r?\n/),headings=lines.flatMap((line,index)=>{const m=/^\s*(#{1,6})\s+(.+?)\s*$/.exec(line);return m?[{index,level:m[1].length,text:m[2]}]:[];}),hits=headings.filter(h=>plain(h.text)===plain(header));
 if(hits.length!==1)return false;const hit=hits[0];
 const section=(heading:{index:number;level:number})=>{const end=headings.find(h=>h.index>heading.index&&h.level<=heading.level)?.index??lines.length;return lines.slice(heading.index+1,end).join(' ');};
 const itemSections=headings.filter(h=>h.level===hit.level&&phrasePresent(section(h),item));
 return itemSections.length===1&&phrasePresent(section(hit),item);
}
const safePublicCitation=(raw:unknown):string|null=>{if(typeof raw!=='string'||raw.length>2000)return null;try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.href===raw?u.href:null;}catch{return null;}};
/** Validate quoted identity fields against the exact provider citation; this does not fetch URLs. */
export function validateCitedDiscoveryMetadata(row:any,annotations:unknown,scope:{kind:'restaurant'|'product'|'recipe';area?:string}):CitedDiscoveryMetadata {
 const out:CitedDiscoveryMetadata={};if(!row||typeof row!=='object'||!Array.isArray(annotations)||typeof row.name!=='string')return out;
 const raw=row.metadata&&typeof row.metadata==='object'&&!Array.isArray(row.metadata)?row.metadata:{};
 const item=plain(row.name),area=scope.area?plain(scope.area.split(',')[0]):'';
 const field=(key:typeof METADATA_FIELDS[number]):CitedDiscoveryField|undefined=>{
  const v=raw[key];if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['value','source_url','quote','evidence_basis'].includes(k)))return;
  if(v.evidence_basis!==undefined&&!['quote','citation_title','page_header'].includes(v.evidence_basis))return;
   if(typeof v.value!=='string'||!text(v.value,key==='address'?180:120)||typeof v.source_url!=='string')return;
  const source=safePublicCitation(v.source_url);if(!source)return;
  const citation=(annotations as any[]).find((a:any)=>a?.type==='url_citation'&&a.url_citation?.url===source);if(!citation)return;
   const basis=v.evidence_basis==='citation_title'||v.evidence_basis==='page_header'?v.evidence_basis:'quote';
   if(key==='restaurant_name'&&scope.kind==='restaurant'&&basis==='citation_title'){
    if(source!==row.url||typeof citation.url_citation.title!=='string')return;
    const itemContent=[citation.url_citation.content,citation.url_citation.page_content].filter((x:any)=>typeof x==='string'&&x.length<=512*1024);
    if(!itemContent.some((x:string)=>phrasePresent(x,row.name)))return;
    const merchant=cleanSingleMerchantTitle(citation.url_citation.title,row.name);if(!merchant||plain(merchant)!==plain(v.value))return;
    return {value:merchant,source_url:source,evidence_basis:'citation_title'};
   }
   const quote=v.quote;if(typeof quote!=='string'||quote.length<4||quote.length>1000)return;
   const content=[citation.url_citation.content,citation.url_citation.page_content].filter((x:any)=>typeof x==='string'&&x.length<=512*1024);
   if(/[\[\]]|\.{3,}|…/u.test(quote)||!content.some((x:string)=>x.includes(quote)))return;
   if(key==='restaurant_name'&&scope.kind==='restaurant'&&basis==='page_header'){
    if(source!==row.url||plain(v.value)!==plain(quote)||citation.url_citation.public_page_verified!==true||typeof citation.url_citation.page_content!=='string'||!pageHeaderBindsItem(citation.url_citation.page_content,quote,row.name))return;
    return {value:v.value.trim(),source_url:source,quote,evidence_basis:'page_header'};
   }
  if(key==='address'&&basis!=='quote')return;
  if(key==='address'&&scope.kind==='restaurant')return {value:v.value.trim(),source_url:source,quote,evidence_basis:'quote'};
   if(basis!=='quote'||!itemFieldBound(quote,v.value,row.name))return;
   return {value:v.value.trim(),source_url:source,quote,evidence_basis:'quote'};
 };
 const brand=field('brand'),variant=field('variant');let restaurant=scope.kind==='restaurant'?field('restaurant_name'):undefined;
 if(scope.kind==='restaurant'&&!restaurant&&typeof row.url==='string'&&safePublicCitation(row.url)===row.url){
  const primary=(annotations as any[]).find((a:any)=>a?.type==='url_citation'&&a.url_citation?.url===row.url);
  const itemAppears=!!primary&&[primary.url_citation.content,primary.url_citation.page_content].some((part:any)=>typeof part==='string'&&part.length<=512*1024&&part.includes(row.name));
  const title=typeof primary?.url_citation?.title==='string'?cleanSingleMerchantTitle(primary.url_citation.title,row.name):undefined;
  if(itemAppears&&title)restaurant={value:title,source_url:row.url,evidence_basis:'citation_title'};
 }
 if(brand)out.brand=brand;if(variant)out.variant=variant;if(restaurant)out.restaurant_name=restaurant;
 if(scope.kind==='product'){
  const retailer=field('retailer');
  if(retailer&&brand&&variant&&[retailer,brand,variant].every(x=>x.source_url===retailer.source_url&&x.quote===retailer.quote))out.retailer=retailer;
 }
 if(scope.kind==='restaurant'){
  const address=field('address');
    if(address&&restaurant&&area&&address.quote&&addressMatchesRequestedArea(address.value,scope.area!)&&addressBoundToMerchant(address.quote,address.value,restaurant.value,scope.area!)){
   const streetLike=[...address.quote.matchAll(/\b\d{1,6}\s+[\p{L}\p{N}][^,;\n]{2,70}\b(?:st(?:reet)?|rd|road|ave(?:nue)?|blvd|boulevard|dr(?:ive)?|ln|lane|way)\b/giu)];
   if(streetLike.length===1)out.address=address;
  }
 }
 return out;
}

export type CandidateRejection={slot:number;stage:'source'|'identity'|'nutrition'|'locality'|'market';code:string};
const diagnosticURL=(raw:unknown):string|undefined=>{const safe=allowedEvidenceURL(raw);if(!safe)return;const u=new URL(safe);u.search='';u.hash='';return u.href;};
/** Private receipt-only diagnostic: safe official URLs without query/hash and fixed stage/reason codes. */
export function privateDiscoveryMetadataDiagnostics(message:any,acceptedRows:unknown,parsedRows:unknown,scope:{kind:'restaurant'|'product'|'recipe';area?:string},rejections:CandidateRejection[]=[]){
 const rawRows=Array.isArray(parsedRows)?parsedRows:[];
 const accepted=Array.isArray(acceptedRows)?acceptedRows:[];
 const fields=METADATA_FIELDS as readonly string[];
 const candidates=rawRows.slice(0,3).map((row:any,index:number)=>{
  const metadata=row?.metadata&&typeof row.metadata==='object'&&!Array.isArray(row.metadata)?row.metadata:{};
  const proposed_fields=fields.filter(key=>Object.hasOwn(metadata,key));
  const present_fields=proposed_fields.filter(key=>metadata[key]&&typeof metadata[key]==='object'&&typeof metadata[key].value==='string');
  const expectedFields=scope.kind==='restaurant'?['restaurant_name','address']:scope.kind==='product'?['brand','variant','retailer']:[];
  const matched=accepted.find((candidate:any)=>candidate.url===row?.url&&plain(candidate.name??'')===plain(typeof row?.name==='string'?row.name:''));
  const checked=matched?.discoveryMetadata&&typeof matched.discoveryMetadata==='object'?matched.discoveryMetadata:{};
  const recoveredTitleMerchant=scope.kind==='restaurant'&&!!checked.restaurant_name&&checked.restaurant_name.evidence_basis==='citation_title'&&checked.restaurant_name.source_url===row?.url;
  const structuredBranch=scope.kind==='restaurant'&&matched?.location?.evidence_status==='verified';
  const absent_fields=expectedFields.filter(key=>!present_fields.includes(key)&&!(key==='restaurant_name'&&recoveredTitleMerchant)&&!(structuredBranch&&['restaurant_name','address'].includes(key)));
  const accepted_fields=[...new Set([...present_fields.filter(key=>!!checked[key]),...(recoveredTitleMerchant?['restaurant_name']:[]),...(structuredBranch?['restaurant_name','address']:[])])];
  const reasons:Array<{field:string;code:string;stage?:CandidateRejection['stage']}>=[];
  const add=(field:string,code:string,stage?:CandidateRejection['stage'])=>{if(reasons.length<3&&!reasons.some(x=>x.field===field&&x.code===code))reasons.push({field,code,...(stage?{stage}:{})});};
  const failure=rejections.find(item=>item.slot===index+1);
  if(!matched&&failure)add('candidate',failure.code,failure.stage);
  if(structuredBranch)add('restaurant_name','official_branch_bound','identity');
  for(const key of absent_fields)add(key,'field_absent');
  if(typeof row?.url==='string'&&!allowedEvidenceURL(row.url))add('name','unsupported_host');
  for(const key of proposed_fields){
   if(checked[key]){if(checked[key].evidence_basis==='citation_title')add(key,'title_bound');continue;}
   const claim=metadata[key];
   if(!claim||typeof claim!=='object'){add(key,'field_absent');continue;}
   const basis=claim.evidence_basis;
   if(key==='restaurant_name'&&basis==='citation_title'){
    const title=(Array.isArray(message?.annotations)?message.annotations:[]).find((a:any)=>a?.type==='url_citation'&&a.url_citation?.url===claim.source_url)?.url_citation?.title;
    add(key,typeof title==='string'&&cleanSingleMerchantTitle(title,row?.name??'')?'merchant_not_corroborated':'entity_ambiguous');continue;
   }
   if(typeof claim.quote!=='string'||!claim.quote)add(key,'field_quote_missing');
   else if(/[\[\]]|\.{3,}|…/u.test(claim.quote))add(key,'cross_excerpt');
   else {
    const citation=(Array.isArray(message?.annotations)?message.annotations:[]).find((a:any)=>a?.type==='url_citation'&&a.url_citation?.url===claim.source_url);
    if(!citation)add(key,'missing_candidate_citation');
    else if(![citation.url_citation.content,citation.url_citation.page_content].some((part:any)=>typeof part==='string'&&part.includes(claim.quote)))add(key,'field_quote_not_in_citation');
    else add(key,key==='address'?'address_not_local':key==='restaurant_name'?'merchant_not_corroborated':'field_not_bound_to_item');
   }
  }
  if(!matched)add('name','candidate_rejected_by_validator');
  else if(!matched.nutrition)add('nutrition','nutrition_parse_failed','nutrition');
  else if(matched.nutrition.missing?.length)add('nutrition','nutrition_incomplete','nutrition');
  else if(matched.nutrition.itemIntegrity!=='complete')add('name','item_integrity_unverified','identity');
  else if(scope.kind==='restaurant'&&!matched.market)add('market','source_market_unverified','market');
  return {slot:index+1,kind:scope.kind,...(diagnosticURL(row?.url)?{source_url:diagnosticURL(row.url)}:{}),...(diagnosticURL(row?.association_url)?{association_url:diagnosticURL(row.association_url)}:{}),proposed_fields:proposed_fields.slice(0,5),present_fields:present_fields.slice(0,5),absent_fields:absent_fields.slice(0,5),accepted_fields:accepted_fields.slice(0,5),reject_reasons:reasons};
 });
 return {version:1,candidates};
}

/** Extract only a structured Product identity from the already fetched official nutrition page. */
export function parsePublishedProductIdentity(content:string,sourceUrl:string,expectedItem:string,expectedVariant?:string,expectedBrand?:string):ProductIdentity|null{
 const safe=allowedEvidenceURL(sourceUrl);if(!safe||!text(expectedItem,160))return null;const matches=nodes(content).filter(x=>hasType(x,'Product')&&plain(String(x.name??''))===plain(expectedItem));if(!matches.length)return null;
 const read=(product:any):ProductIdentity|null=>{const publishedBrand=brandName(product.brand),brand=publishedBrand??(expectedBrand&&phrasePresent(String(product.name??''),expectedBrand)?expectedBrand:undefined);if(!brand||expectedBrand&&plain(brand)!==plain(expectedBrand))return null;const variantValues=propertyValues(product),variant=expectedVariant&&variantValues.some(v=>plain(v)===plain(expectedVariant))?expectedVariant:expectedVariant&&phrasePresent(String(product.name),expectedVariant)?expectedVariant:variantValues[0];if(expectedVariant&&!variant)return null;const gtin=gtinValue(product);if(gtin===null)return null;const facts=[String(product.name??'')];for(const p of Array.isArray(product.additionalProperty)?product.additionalProperty:[]){const key=plain(String(p?.name??''));if(/package|net weight|net contents|pack size|package quantity|item weight/.test(key)){const value=typeof p?.value==='string'?p.value:typeof p?.value==='number'?String(p.value):'';if(value)facts.push(value);}}const packageDetails=[...new Set(facts.flatMap(value=>[...value.matchAll(/\b\d+(?:\.\d+)?\s*(?:oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|ct|count|pack)\b/giu)].map(m=>plain(m[0]))))];return {itemName:text(product.name,160)!,brand,...(variant?{variant}:{}),...(gtin?{gtin}:{}),...(packageDetails.length?{packageDetails}:{})};};
 const identities=matches.map(read);if(identities.some(x=>!x))return null;const first=identities[0]!,signature=(x:ProductIdentity)=>JSON.stringify([plain(x.itemName),plain(x.brand),plain(x.variant??''),x.gtin??'',(x.packageDetails??[]).slice().sort()]);if(identities.some(x=>signature(x!)!==signature(first)))return null;return first;
}

/** Read the restaurant identity published by the already fetched menu publisher. */
export function parsePublishedRestaurantIdentity(content:string,sourceUrl:string):string|null{
 const safe=allowedEvidenceURL(sourceUrl);if(!safe)return null;try{if(!['papajohns.com','www.papajohns.com'].includes(new URL(safe).hostname))return null;}catch{return null;}
 const all=nodes(content),matches=all.filter(x=>(hasType(x,'Restaurant')||hasType(x,'Organization'))&&text(x.name,120));
 const names=[...new Set(matches.map(x=>text(x.name,120)!).filter(Boolean))];if(names.length===1)return names[0];
 const pageUrl=canonicalPublicPage(sourceUrl),collections=all.filter(x=>hasType(x,'CollectionPage')&&canonicalPublicPage(x.url)===pageUrl&&/^Papa Johns\b/i.test(String(x.name??'')));return pageUrl&&collections.length===1?'Papa Johns':null;
}

/** Bind a Target Product/Offer listing to a fetched manufacturer product identity. Availability is deliberately ignored. */
export function parseRetailerAssociation(content:string,sourceUrl:string,expected:ProductIdentity):VerifiedRetailer|null{
 const safe=exactSource(sourceUrl,'www.target.com')??exactSource(sourceUrl,'target.com');if(!safe||!expected||!text(expected.itemName,160)||!text(expected.brand,100)||!normalizeGTIN(expected.gtin))return null;const matches=nodes(content).filter(x=>hasType(x,'Product')&&plain(String(x.name??''))===plain(expected.itemName)&&plain(brandName(x.brand)??'')===plain(expected.brand));if(matches.length!==1)return null;const product=matches[0],gtin=gtinValue(product),expectedGtin=normalizeGTIN(expected.gtin);if(!gtin||!expectedGtin||gtin!==expectedGtin)return null;if(expected.variant&&!propertyValues(product).some(v=>plain(v)===plain(expected.variant))&&!phrasePresent(String(product.name),expected.variant))return null;const offers=nodes(JSON.stringify(product.offers??[])).filter(x=>hasType(x,'Offer'));const sellers=offers.map(o=>brandName(o.seller)).filter((x):x is string=>!!x);if(!sellers.length)return null;const seller=[...new Set(sellers.map(s=>plain(s)))];if(seller.length!==1)return null;const name=sellers[0];return {name,evidence_status:'verified',source_url:safe,source_field:'Product.offers.seller',product_name:product.name,brand:brandName(product.brand)!,...(expected.variant?{variant:expected.variant}:{})};
}

/** Bind a provider-cited listing to an already verified manufacturer product. This parses only citation title/content; it never fetches or infers retailer from its host. */
export function parseCitedRetailerListing(input:{title?:unknown;content?:unknown;sourceUrl:unknown},expected:ProductIdentity):VerifiedRetailer|null{
 const source=safePublicCitation(input.sourceUrl),title=text(input.title,240),content=text(input.content,MAX_SOURCE_BYTES)??'';if(!source||!title||!expected||!text(expected.itemName,160)||!text(expected.brand,100))return null;
 const excerpt=/\[\s*(?:\.\.\.|…)[^\]]*\]|(?:^|\n)\s*(?:related|similar items?|you may also like)\s*:/i.exec(content),ownContent=excerpt?content.slice(0,excerpt.index):content;if(/\b(?:not|isn't|is not|never)\s+(?:sold|listed|offered)\s+by\s+[\p{L}\p{N}&.' -]{2,48}/iu.test(ownContent))return null;
 const wordTokens=(v:string)=>plain(v).split(/[^\p{L}\p{N}]+/u).filter(Boolean),titleProductPart=title.split(/\s*(?:\||:|\s[-–—]\s)\s*/u)[0],titleTokens=new Set(wordTokens(titleProductPart));const expectedTitleTokens=new Set([...wordTokens(expected.itemName),...wordTokens(expected.brand),...wordTokens(expected.variant??'')]);const titleExtras=[...titleTokens].filter(w=>!expectedTitleTokens.has(w)&&!/^\d+(?:\.\d+)?(?:oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|ct|count|pack)?$/u.test(w)&&!['frozen','food','product','pizza','item','pack','of','the','oz','ounce','ounces','lb','lbs','g','gram','grams','ct','count'].includes(w));const titleItemBinds=wordTokens(expected.itemName).every(w=>titleTokens.has(w))&&(!expected.variant||wordTokens(expected.variant).every(w=>titleTokens.has(w)))&&titleExtras.length===0;
 // Content-only seller claims must be inside one short, explicitly labelled own-product block.
 const productBlockMatch=/\b(?:product|item|product details)\s*[:\-]\s*/i.exec(ownContent);let productBlock='';if(productBlockMatch){const start=productBlockMatch.index+productBlockMatch[0].length,tail=ownContent.slice(start),end=tail.search(/(?:\n\s*\n|\b(?:related|similar items?|you may also like)\s*:)/i);productBlock=tail.slice(0,end<0?Math.min(tail.length,2400):Math.min(end,2400));}
 const contentBinds=!!productBlock&&phrasePresent(productBlock,expected.itemName)&&phrasePresent(productBlock,expected.brand)&&(!expected.variant||phrasePresent(productBlock,expected.variant));if(!titleItemBinds&&!contentBinds)return null;const titleBinds=titleItemBinds&&(phrasePresent(title,expected.brand)||phrasePresent(ownContent,expected.brand)&&(!expected.variant||phrasePresent(ownContent,expected.variant)));const all=(titleBinds?title+'\n':'')+ownContent;
 const explicitVariants=[...all.matchAll(/\b(?:variant|flavou?r|crust|style)\s*[:\-]\s*([^.;,|\n]{2,80})/giu)].map(match=>plain(match[1]));if(expected.variant&&explicitVariants.some(value=>value!==plain(expected.variant!)))return null;
 const titleStore=titleBinds?/(?:\||:|\s[--])\s*([\p{L}][\p{L}\p{N}&.' -]{1,48})\s*$/u.exec(title)?.[1]?.trim():undefined;
 const contentStores=contentBinds?[...productBlock.matchAll(/\b(?:sold by|seller|retailer|listed by)\s*[:\-]?\s*([\p{L}][\p{L}\p{N}&.' -]{1,48}?)(?=[.;,|\n]|$)/giu)].map(m=>m[1].trim()):[];
 const stores=[...(titleStore?[titleStore]:[]),...contentStores],uniqueStores=[...new Map(stores.map(name=>[plain(name),name])).values()];if(uniqueStores.length!==1||!uniqueStores[0]||/[.@/]/.test(uniqueStores[0])||uniqueStores[0]!=='Best Buy'&&/\b(?:pizza|menu|nutrition|official|order|online|restaurant|food|delivery|available|deal|sale|top)\b/i.test(uniqueStores[0]))return null;
 const expectedPackages=expected.packageDetails??[];const titlePackageFacts=[...title.matchAll(/\b\d+(?:\.\d+)?\s*(?:oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|ct|count|pack)\b/giu)].map(m=>plain(m[0]));const labeledPackageFacts=[...ownContent.matchAll(/\b(?:package size|net weight|net contents|pack size|package quantity|item weight)\s*[:\-]?\s*(\d+(?:\.\d+)?\s*(?:oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|ct|count|pack))\b/giu)].map(m=>plain(m[1]));const listedPackages=[...new Set([...titlePackageFacts,...labeledPackageFacts])];
 if(expectedPackages.length&&listedPackages.length&&(expectedPackages.some(size=>!listedPackages.includes(plain(size)))||listedPackages.some(size=>!expectedPackages.some(expectedSize=>plain(expectedSize)===size))))return null;
 const gtins:string[]=[];let invalidGTIN=false;for(const match of all.matchAll(/\b(?:gtin(?:-?\d{1,2})?|upc|ean)\s*(?:number\s*)?(?:[:#]\s*)?([\d -]{8,20})/giu)){const value=match[1].replace(/[ -]/g,'');if(!validGTIN(value))invalidGTIN=true;else gtins.push(value.padStart(14,'0'));}const expectedGTIN=expected.gtin?normalizeGTIN(expected.gtin):null;if(invalidGTIN||new Set(gtins).size>1||expectedGTIN&&gtins.length&&gtins.some(value=>value!==expectedGTIN))return null;
 return {name:uniqueStores[0],evidence_status:'verified',source_url:source,source_field:titleStore?'citation.title':'citation.content',product_name:expected.itemName,brand:expected.brand,...(expected.variant?{variant:expected.variant}:{})};
}

/** Bind a structured branch address to the explicitly requested public restaurant and city. */
export function parseRestaurantBranchAssociation(content:string,sourceUrl:string,expected:{restaurant:string;area:string},onReject?:(code:string)=>void):VerifiedBranch|null{
 const fail=(code:string):null=>{onReject?.(code);return null;};
 const safe=exactSource(sourceUrl,'locations.papajohns.com');if(!safe||!text(expected?.restaurant,100))return fail('unsupported_branch_source');
 const requested=publicPlace(expected.area,'area');if(!requested)return fail('invalid_requested_area');
 const [city,region]=requested.split(',').map(x=>x.trim()),wanted=plain(expected.restaurant);
 const candidates=nodes(content).filter(x=>(hasType(x,'Restaurant')||hasType(x,'LocalBusiness')||hasType(x,'FastFoodRestaurant'))&&(plain(String(x.name??''))===wanted||wanted==='papa johns'&&plain(String(x.name??'')).startsWith('papa johns pizza ')));
 if(candidates.length!==1)return fail(candidates.length?'branch_identity_ambiguous':'branch_identity_mismatch');
 const branch=candidates[0],a=branch.address;if(!a||!hasType(a,'PostalAddress'))return fail('branch_address_incomplete');
 const street=text(a.streetAddress,160),locality=text(a.addressLocality,80),state=text(a.addressRegion,80),postal=text(a.postalCode,20),countryRaw=text(typeof a.addressCountry==='object'?a.addressCountry.name??a.addressCountry.identifier:a.addressCountry,80);
 if(!street||!locality||!state||!postal||!countryRaw)return fail('branch_address_incomplete');
 if(plain(locality)!==plain(city))return fail('branch_city_mismatch');
 if(region&&!sameRegion(state,region))return fail('branch_region_mismatch');
 const countryToken=plain(countryRaw),country=countryToken==='us'||countryToken==='usa'||countryToken==='united states'?'US':countryToken==='ca'||countryToken==='canada'?'CA':countryToken==='gb'||countryToken==='uk'||countryToken==='united kingdom'?'GB':countryToken==='au'||countryToken==='australia'?'AU':countryToken==='nz'||countryToken==='new zealand'?'NZ':countryToken==='mx'||countryToken==='mexico'?'MX':countryToken==='es'||countryToken==='spain'?'ES':undefined;
 if(!country)return fail('branch_country_unrecognized');
 const address=[street,locality,state+' '+postal].join(', ');return {name:text(branch.name,120)!,address,evidence_status:'verified',source_url:safe,source_field:'Restaurant.address',city:locality,region:state,country};
}

/** Model-led Coach wire contracts. Validation is deliberately stricter than model output. */
import { publicFood,publicPlace } from './coach-lookup-intent.ts';
export type DiscoveryKind = 'restaurant' | 'product' | 'recipe';
export function discoveryOptionIdentity(input:{kind:unknown;sourceUrl:unknown;entity?:unknown;name:unknown;variant?:unknown}):string {
 let source='';try{const u=new URL(String(input.sourceUrl??''));u.hash='';source=u.href;}catch{}
 const norm=(v:unknown)=>String(v??'').normalize('NFKC').trim().toLocaleLowerCase();
 return [norm(input.kind),source,norm(input.entity),norm(input.name),norm(input.variant)].join('|');
}
/** Suppress a discovery card only when its canonical source/item and any stated product identity match a verified option. */
export function discoveryCandidateAlreadyVerified(candidate:{kind:unknown;sourceUrl:unknown;name:unknown;entity?:unknown;brand?:unknown;variant?:unknown},options:unknown):boolean {
 const norm=(value:unknown)=>String(value??'').normalize('NFKC').replace(/[®™©]/gu,'').trim().toLocaleLowerCase();
 const canonical=(value:unknown)=>{try{const u=new URL(String(value??''));u.hash='';u.hostname=u.hostname.toLowerCase();return u.href;}catch{return '';}};
 const contains=(value:unknown,needle:unknown)=>{const hay=' '+norm(value)+' ',part=' '+norm(needle)+' ';return !!norm(needle)&&hay.includes(part);};
 const source=canonical(candidate.sourceUrl),rawKind=norm(candidate.kind),kind=rawKind==='retrieved_recipe'?'recipe':rawKind,name=norm(candidate.name);if(!source||!kind||!name||!Array.isArray(options))return false;
 return options.some((raw:any)=>{
  const optionKind=norm(raw?.kind)==='retrieved_recipe'?'recipe':norm(raw?.kind);
  if(!raw||optionKind!==kind||canonical(raw._source_url)!==source||norm(raw.item_name)!==name)return false;
  if(kind==='restaurant'){
   const left=norm(candidate.entity),right=norm(raw.restaurant_name);return !left&&!right||!!left&&!!right&&left===right;
  }
  if(kind==='product'){
   const leftBrand=norm(candidate.brand),rightBrand=norm(raw.brand);
   if(leftBrand&&rightBrand&&leftBrand!==rightBrand)return false;
   if(leftBrand&&!rightBrand&&!contains(candidate.name,candidate.brand))return false;
   if(rightBrand&&!leftBrand&&!contains(candidate.name,raw.brand))return false;
   const leftVariant=norm(candidate.variant),rightVariant=norm(raw.variant);
   if(leftVariant&&rightVariant&&leftVariant!==rightVariant)return false;
   const onlyVariant=leftVariant||rightVariant;
   if(onlyVariant&&!contains(candidate.name,leftVariant||rightVariant))return false;
   return true;
  }
  return kind==='recipe';
 });
}
export type FoodPreference = 'high_protein' | 'lower_calorie' | 'balanced';
export type DiscoverFoodArgs = {
  food: string; mode: DiscoveryKind; city?: string; region?: string;
  country?: string; preference?: FoodPreference; restaurant?:string; max_minutes?:number;
};
export type CoachChoice = { id: string; label: string; value: string };
export type StructuredCoachReply = {
  text: string; choices: CoachChoice[];
  tool_request?: { name: 'discover_food'; args: DiscoverFoodArgs };
};
export type DiscoveryOption = {
  id: string; kind: DiscoveryKind; name: string; brand?: string; variant?:string;
  restaurant_name?: string; retailer?: string; address?: string;
  nutrition_status: 'not_checked' | 'partial' | 'unavailable';
  missing_fields: Array<'serving'|'calories'|'protein'|'carbs'|'fats'|'fiber'>;
  loggable: false;
};

const prefSet = new Set<FoodPreference>(['high_protein','lower_calorie','balanced']);
const kindSet = new Set<DiscoveryKind>(['restaurant','product','recipe']);
const missingSet = new Set(['serving','calories','protein','carbs','fats','fiber']);
const plain = (s: string, max: number) => s.length > 0 && s.length <= max && !/[\u0000-\u001f\u007f]/.test(s) && !/https?:\/\/|www\.|(?:SYSTEM|DEVELOPER)_PROMPT|public_lookup_confirmation/i.test(s);
const visibleText = (s:string,max:number) => s.trim().length>0&&s.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s)&&!/(?:SYSTEM|DEVELOPER)_PROMPT|public_lookup_confirmation/i.test(s);

export type ModelValidationDiagnostic={field:'$root'|'text'|'choices'|'tool_request'|'tool_request.name'|'tool_request.args'|'tool_request.args.food'|'tool_request.args.mode'|'tool_request.args.city'|'tool_request.args.region'|'tool_request.args.country'|'tool_request.args.preference'|`choices[${number}]`|`choices[${number}].id`|`choices[${number}].label`|`choices[${number}].value`;code:'type'|'missing'|'empty'|'enum'|'format'|'limit'|'unexpected'};

const nullableString={anyOf:[{type:'string'},{type:'null'}]};
const discoveryArgsSchema={type:'object',additionalProperties:false,properties:{food:{anyOf:[{type:'string',minLength:1,maxLength:72},{type:'null'}]},mode:{type:'string',enum:['restaurant','product','recipe']},city:nullableString,region:nullableString,country:{anyOf:[{type:'string',pattern:'^[A-Za-z]{2}$'},{type:'null'}]},preference:{anyOf:[{type:'string',enum:['high_protein','lower_calorie','balanced']},{type:'null'}]}},required:['food','mode','city','region','country','preference']};
const choiceSchema={type:'object',additionalProperties:false,properties:{id:{type:'string',pattern:'^[A-Za-z0-9_-]{1,64}$'},label:{type:'string',minLength:1,maxLength:80},value:{type:'string',minLength:1,maxLength:180}},required:['id','label','value']};

/** Exact server contract. Null is the wire representation for omitted public optional slots. */
export function structuredCoachResponseFormat(allowToolRequest=true){
  const properties:Record<string,unknown>={text:{type:'string',minLength:1,maxLength:4000},choices:{type:'array',items:choiceSchema,maxItems:5}};
  const required=['text','choices'];
  if(allowToolRequest){properties.tool_request={anyOf:[{type:'object',additionalProperties:false,properties:{name:{type:'string',enum:['discover_food']},args:discoveryArgsSchema},required:['name','args']},{type:'null'}]};required.push('tool_request');}
  return {type:'json_schema',json_schema:{name:allowToolRequest?'coach_planner_reply':'coach_final_reply',strict:true,schema:{type:'object',additionalProperties:false,properties,required}}};
}

const normalizeMode=(value:unknown):DiscoveryKind|undefined=>{
  if(typeof value!=='string')return;
  const normalized=value.trim().toLowerCase();
  if(kindSet.has(normalized as DiscoveryKind))return normalized as DiscoveryKind;
  if(['supermarket','grocery','groceries'].includes(normalized))return 'product';
};
const normalizeCountry=(value:unknown):string|undefined=>{
  if(value===undefined||value===null)return;
  if(typeof value!=='string')return;
  const s=value.trim();if(!s)return;
  const key=s.normalize('NFKC').toLowerCase().replace(/[.]/g,'').replace(/\s+/g,' ');
  const aliases:Record<string,string>={'united states':'US','united states of america':'US','usa':'US','us':'US','canada':'CA','ca':'CA','mexico':'MX','mx':'MX','united kingdom':'GB','uk':'GB','gb':'GB'};
  if(aliases[key])return aliases[key];
  return /^[A-Za-z]{2}$/.test(s)?s.toUpperCase():undefined;
};

export function validateDiscoverFoodArgs(value: unknown): DiscoverFoodArgs | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['food','mode','city','region','country','preference','restaurant','max_minutes'].includes(k))) return null;
  const mode=normalizeMode(v.mode);
  const food=(v.food===undefined||v.food===null)&&mode==='restaurant'?'meal':publicFood(v.food);
  if (!food || !mode) return null;
  for (const key of ['city','region'] as const) {
    if (v[key] !== undefined && v[key] !== null && v[key] !== '' && (typeof v[key] !== 'string' || !plain(v[key].trim(),48) || (key==='city'&&(/\d|\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|apartment|apt|suite|unit|address)\b/i.test(v[key] as string))))) return null;
  }
  const country=normalizeCountry(v.country);
  if(v.country!==undefined&&v.country!==null&&v.country!==''&&!country)return null;
  if (v.preference !== undefined && v.preference !== null && v.preference !== '' && !prefSet.has(v.preference as FoodPreference)) return null;
  const restaurant=v.restaurant===undefined?undefined:typeof v.restaurant==='string'?publicPlace(v.restaurant,'restaurant'):undefined;
  if(v.restaurant!==undefined&&(!restaurant||mode!=='restaurant'))return null;
  if(v.max_minutes!==undefined&&(mode!=='recipe'||!Number.isInteger(v.max_minutes)||Number(v.max_minutes)<1||Number(v.max_minutes)>240))return null;
  return {food,mode,...(v.max_minutes!==undefined?{max_minutes:Number(v.max_minutes)}:{}),...(restaurant?{restaurant}:{}),
    ...(typeof v.city==='string'&&v.city.trim()?{city:v.city.trim()}:{}),...(typeof v.region==='string'&&v.region.trim()?{region:v.region.trim()}:{}),
      ...(country?{country}:{}),...(v.preference?{preference:v.preference as FoodPreference}:{})};
}

export function validateStructuredCoachReply(value: unknown, allowToolRequest=true): StructuredCoachReply | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v=value as Record<string,unknown>;
  if (Object.keys(v).some(k=>!['text','choices','tool_request'].includes(k)) || typeof v.text!=='string' || !visibleText(v.text,4000)) return null;
  if (!Array.isArray(v.choices) || v.choices.length>5) return null;
  const ids=new Set<string>(); const choices:CoachChoice[]=[];
  for (const raw of v.choices) {
    if (!raw || typeof raw!=='object' || Array.isArray(raw)) return null;
    const c=raw as Record<string,unknown>;
    if (Object.keys(c).some(k=>!['id','label','value'].includes(k)) || typeof c.id!=='string' || !/^[A-Za-z0-9_-]{1,64}$/.test(c.id) || ids.has(c.id) || typeof c.label!=='string' || !plain(c.label.trim(),80) || typeof c.value!=='string' || !plain(c.value.trim(),180)) return null;
    ids.add(c.id); choices.push({id:c.id,label:c.label.trim(),value:c.value.trim()});
  }
  let tool_request:StructuredCoachReply['tool_request'];
  if (v.tool_request!==undefined&&v.tool_request!==null) {
    if(!allowToolRequest)return null;
    if (!v.tool_request || typeof v.tool_request!=='object' || Array.isArray(v.tool_request)) return null;
    const tr=v.tool_request as Record<string,unknown>;
    if (Object.keys(tr).some(k=>!['name','args'].includes(k)) || tr.name!=='discover_food') return null;
    const args=validateDiscoverFoodArgs(tr.args); if (!args) return null;
    tool_request={name:'discover_food',args};
  }
  return {text:v.text.trim(),choices,...(tool_request?{tool_request}:{})};
}

/** Safe internal diagnosis; never returns model-provided values or arbitrary object keys. */
export function diagnoseStructuredCoachReply(value:unknown,allowToolRequest=true):ModelValidationDiagnostic|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return {field:'$root',code:'type'};
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['text','choices','tool_request'].includes(k)))return {field:'$root',code:'unexpected'};
  if(!Object.prototype.hasOwnProperty.call(v,'text'))return {field:'text',code:'missing'};
  if(typeof v.text!=='string')return {field:'text',code:'type'};
  if(!v.text.trim())return {field:'text',code:'empty'};
  if(!visibleText(v.text,4000))return {field:'text',code:'format'};
  if(!Object.prototype.hasOwnProperty.call(v,'choices'))return {field:'choices',code:'missing'};
  if(!Array.isArray(v.choices))return {field:'choices',code:'type'};
  if(v.choices.length>5)return {field:'choices',code:'limit'};
  const ids=new Set<string>();
  for(let i=0;i<v.choices.length;i++){
    const path=`choices[${i}]` as const,raw=v.choices[i];
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return {field:path,code:'type'};
    const c=raw as Record<string,unknown>;
    if(Object.keys(c).some(k=>!['id','label','value'].includes(k)))return {field:path,code:'unexpected'};
    if(typeof c.id!=='string')return {field:`${path}.id`,code:Object.hasOwn(c,'id')?'type':'missing'};
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(c.id)||ids.has(c.id))return {field:`${path}.id`,code:'format'};ids.add(c.id);
    if(typeof c.label!=='string')return {field:`${path}.label`,code:Object.hasOwn(c,'label')?'type':'missing'};
    if(!plain(c.label.trim(),80))return {field:`${path}.label`,code:c.label.trim()?'format':'empty'};
    if(typeof c.value!=='string')return {field:`${path}.value`,code:Object.hasOwn(c,'value')?'type':'missing'};
    if(!plain(c.value.trim(),180))return {field:`${path}.value`,code:c.value.trim()?'format':'empty'};
  }
  if(v.tool_request!==undefined&&v.tool_request!==null){
    if(!allowToolRequest)return {field:'tool_request',code:'unexpected'};
    if(typeof v.tool_request!=='object'||Array.isArray(v.tool_request))return {field:'tool_request',code:'type'};
    const tr=v.tool_request as Record<string,unknown>;
    if(Object.keys(tr).some(k=>!['name','args'].includes(k)))return {field:'tool_request',code:'unexpected'};
    if(typeof tr.name!=='string')return {field:'tool_request.name',code:Object.hasOwn(tr,'name')?'type':'missing'};
    if(tr.name!=='discover_food')return {field:'tool_request.name',code:'enum'};
    if(!tr.args||typeof tr.args!=='object'||Array.isArray(tr.args))return {field:'tool_request.args',code:Object.hasOwn(tr,'args')?'type':'missing'};
    const a=tr.args as Record<string,unknown>;
    if(Object.keys(a).some(k=>!['food','mode','city','region','country','preference'].includes(k)))return {field:'tool_request.args',code:'unexpected'};
    if(!(normalizeMode(a.mode)==='restaurant'&&(a.food===null||a.food===undefined))){
      if(typeof a.food!=='string')return {field:'tool_request.args.food',code:Object.hasOwn(a,'food')?'type':'missing'};
      if(!a.food.trim())return {field:'tool_request.args.food',code:'empty'};
    }
    if(!normalizeMode(a.mode))return {field:'tool_request.args.mode',code:Object.hasOwn(a,'mode')?'enum':'missing'};
    for(const key of ['city','region'] as const)if(a[key]!==undefined&&a[key]!==null&&typeof a[key]!=='string')return {field:`tool_request.args.${key}`,code:'type'};
    if(a.country!==undefined&&a.country!==null&&!normalizeCountry(a.country))return {field:'tool_request.args.country',code:typeof a.country==='string'?'format':'type'};
    if(a.preference!==undefined&&a.preference!==null&&a.preference!==''&&!prefSet.has(a.preference as FoodPreference))return {field:'tool_request.args.preference',code:'enum'};
    if(!validateDiscoverFoodArgs(a))return {field:'tool_request.args',code:'format'};
  }
  if(validateStructuredCoachReply(value,allowToolRequest))return null;
  return {field:'$root',code:'format'};
}

/** Build a public search query solely from validated, user-approved public slots. */
export function publicDiscoveryQuery(args: DiscoverFoodArgs): string {
  const validated=validateDiscoverFoodArgs(args); if (!validated) throw new Error('invalid_discovery_args');
  const location=[validated.city,validated.region,validated.country].filter(Boolean).join(', ');
  const kind=validated.mode==='restaurant'?'restaurant official HTML nutrition table calories protein serving size restaurant branch address -filetype:pdf':validated.mode==='product'?'manufacturer official nutrition product packaged grocery product discovery where to buy retailer product listing':'recipe ingredients quantities servings published nutrition calories protein carbohydrates fat fiber prefer Food Network foodnetwork.com and Epicurious epicurious.com';
  const preference=validated.preference==='high_protein'?'prefer options likely to suit a high-protein preference':validated.preference==='lower_calorie'?'prefer options likely to suit a lower-calorie preference':validated.preference==='balanced'?'prefer balanced options':'';
  return [validated.food,validated.restaurant,kind,location,preference,validated.max_minutes!==undefined?`preparation time preference: at most ${validated.max_minutes} minutes; verify published duration, do not claim unverified time`:undefined].filter(Boolean).join(' ');
}

/** Discovery projection contains identity only. Evidence IDs/URLs remain on the private receipt. */
export function projectDiscoveryOptions(rows: unknown, requestId: string, trustedEvidenceIds: readonly string[]=[], privateBindings?:Record<string,{source_url:string;kind:DiscoveryKind;name:string;entity?:string;variant?:string;address?:string;address_source_url?:string}>): DiscoveryOption[] {
  if (!Array.isArray(rows)) return [];
  const out:DiscoveryOption[]=[]; const seen=new Set<string>();
  for (const item of rows.slice(0,12)) {
    if (!item || typeof item!=='object' || Array.isArray(item)) continue;
    const r=item as Record<string,unknown>;
    if (typeof r.name!=='string' || !plain(r.name.trim(),160) || !kindSet.has(r.kind as DiscoveryKind)) continue;
    const evidence=Array.isArray(r.evidence_ids)?r.evidence_ids.filter(x=>typeof x==='string'&&x.length<=2048):[];
    const fields=r.field_evidence&&typeof r.field_evidence==='object'&&!Array.isArray(r.field_evidence)?r.field_evidence as Record<string,unknown>:{};
    const trusted=new Set(trustedEvidenceIds);
    // Require this field's source ID to resolve to a citation retained privately in the receipt.
    if(typeof fields.name!=='string'||!evidence.includes(fields.name)||!trusted.has(fields.name))continue;
    const sourceKey=(()=>{try{const u=new URL(String(fields.name));u.hash='';u.hostname=u.hostname.toLowerCase();return u.href;}catch{return String(fields.name);}})();
    const verifiedMerchant=typeof r.restaurant_name==='string'&&plain(r.restaurant_name,120)&&typeof fields.restaurant_name==='string'&&evidence.includes(fields.restaurant_name)&&trusted.has(fields.restaurant_name);
    const variant=typeof r.variant==='string'&&plain(r.variant,120)&&typeof fields.variant==='string'&&evidence.includes(fields.variant)&&trusted.has(fields.variant)?r.variant.trim():'';
    // Keep distinct item and variant identities even when they come from one merchant; exact duplicates collapse.
    const entity=verifiedMerchant?(r.restaurant_name as string).trim().toLocaleLowerCase():typeof r.retailer==='string'&&typeof fields.retailer==='string'&&evidence.includes(fields.retailer)&&trusted.has(fields.retailer)?r.retailer.trim().toLocaleLowerCase():sourceKey;
    const key=`${r.kind}:${sourceKey}:${entity}:${r.name.trim().toLocaleLowerCase()}:${variant.toLocaleLowerCase()}`; if(seen.has(key))continue; seen.add(key);
    const id=`d-${requestId.replace(/[^A-Za-z0-9_-]/g,'').slice(0,40)}-${out.length+1}`;
    const option:DiscoveryOption={id,kind:r.kind as DiscoveryKind,name:r.name.trim(),nutrition_status:r.nutrition_status==='partial'?'partial':r.nutrition_status==='unavailable'?'unavailable':'not_checked',missing_fields:Array.isArray(r.missing_fields)?r.missing_fields.filter((x):x is DiscoveryOption['missing_fields'][number]=>typeof x==='string'&&missingSet.has(x)).slice(0,6):['serving','calories','protein','carbs','fats','fiber'],loggable:false};
    for(const keyName of ['brand','restaurant_name','retailer','address'] as const) if(typeof r[keyName]==='string'&&plain(r[keyName] as string,keyName==='address'?180:120)&&typeof fields[keyName]==='string'&&evidence.includes(fields[keyName] as string)&&trusted.has(fields[keyName] as string)) option[keyName]=r[keyName] as string;
    if(variant)option.variant=variant;
    out.push(option);if(privateBindings)privateBindings[id]={source_url:sourceKey,kind:option.kind,name:option.name,...(verifiedMerchant?{entity:(r.restaurant_name as string).trim()}:typeof r.retailer==='string'&&option.retailer?{entity:option.retailer}:{}),...(option.variant?{variant:option.variant}:{}),...(verifiedMerchant&&option.address&&typeof fields.address==='string'?{address:option.address,address_source_url:fields.address}:{})}; if(out.length===3)break;
  }
  return out;
}

/** Build the public-projection input from already validated provider citations; only source IDs remain private. */
export function discoveryRowsFromEvidence(evidence:any, lookupOptions:unknown):{rows:unknown[];trustedIds:string[]} {
  if(!evidence)return {rows:[],trustedIds:[]};
  const sources=Array.isArray(evidence.sources)?evidence.sources:[];
  const canonicalSource=(raw:string)=>{try{const u=new URL(raw);u.hash='';u.hostname=u.hostname.toLowerCase();return u.href;}catch{return '';}};
  const sourceId=(url:string|undefined,title?:string)=>{if(!url)return undefined;const s=sources.find((x:any)=>x.url===url&&(!title||x.title===title));return s?canonicalSource(s.url):undefined;};
  const trustedIds=sources.map((s:any)=>canonicalSource(s.url)).filter(Boolean);
  const entity=(o:any)=>o.restaurant_name??o.retailer??o.brand??'';
  const complete=new Set((Array.isArray(lookupOptions)?lookupOptions:[]).map((o:any)=>discoveryOptionIdentity({kind:o.kind,sourceUrl:o._source_url,entity:entity(o),name:o.item_name,variant:o.variant})));
  const rows=(evidence.candidates??[]).flatMap((d:any)=>{
    const kind=d.sourceKind==='menu'?'restaurant':d.sourceKind==='product'?'product':'recipe';
    const primary=sourceId(d.url,d.sourceTitle);if(!primary)return [];
    const meta=d.discoveryMetadata&&typeof d.discoveryMetadata==='object'?d.discoveryMetadata:{};
    const candidateEntity=d.location?.evidence_status==='verified'?d.location.name:meta.restaurant_name?.value??meta.retailer?.value??meta.brand?.value??'';
    const verifiedRetailerBrand=d.retailers?.find((retailer:any)=>retailer.evidence_status==='verified')?.brand;
    if(discoveryCandidateAlreadyVerified({kind,sourceUrl:primary,name:d.name,...(kind==='restaurant'&&candidateEntity?{entity:candidateEntity}:{}),...(kind==='product'&&(meta.brand?.value||verifiedRetailerBrand)?{brand:meta.brand?.value??verifiedRetailerBrand}:{}),...(kind==='product'?(d.variant??meta.variant?.value?{variant:d.variant??meta.variant.value}:{}) : {})},lookupOptions))return [];
    const key=discoveryOptionIdentity({kind,sourceUrl:primary,entity:candidateEntity,name:d.name,variant:d.variant??meta.variant?.value});if(complete.has(key))return [];
    const ids=[primary],fieldEvidence:Record<string,string>={name:primary};
    const locationId=d.location?.evidence_status==='verified'?sourceId(d.location.source_url):undefined;
    const restaurantMeta=meta.restaurant_name,brandMeta=meta.brand,retailerMeta=meta.retailer,addressMeta=meta.address,variantMeta=meta.variant;
    const metadataId=(value:any)=>value&&typeof value.source_url==='string'?sourceId(value.source_url):undefined;
    const restaurantId=locationId??metadataId(restaurantMeta),brandId=metadataId(brandMeta),retailerMetaId=metadataId(retailerMeta),addressMetaId=metadataId(addressMeta),variantMetaId=metadataId(variantMeta);
    for(const id of [restaurantId,brandId,retailerMetaId,addressMetaId,variantMetaId])if(id&&!ids.includes(id))ids.push(id);
    if(restaurantId)fieldEvidence.restaurant_name=restaurantId;
    if(addressMetaId)fieldEvidence.address=addressMetaId;
    if(brandId)fieldEvidence.brand=brandId;
    if(retailerMetaId)fieldEvidence.retailer=retailerMetaId;
    if(variantMetaId)fieldEvidence.variant=variantMetaId;
    const retailer=d.retailers?.find((r:any)=>r.evidence_status==='verified');const retailerId=retailer?sourceId(retailer.source_url):undefined;
    if(retailerId){ids.push(retailerId);fieldEvidence.retailer=retailerId;if(retailer.brand)fieldEvidence.brand=retailerId;}
    const restaurantName=d.location?.evidence_status==='verified'?d.location.name:restaurantMeta?.value;
    const address=d.location?.evidence_status==='verified'?d.location.address:addressMeta?.value;
    const retailerName=retailer?.name??retailerMeta?.value,brand=retailer?.brand??brandMeta?.value,variant=variantMeta?.value;
    return [{kind,name:d.name,evidence_ids:ids,field_evidence:fieldEvidence,nutrition_status:d.nutrition?'partial':'unavailable',missing_fields:[...(!d.portion?['serving']:[]),...(['calories','protein','carbs','fat','fiber'].filter((k:string)=>!Number.isFinite(d.nutrition?.fields?.[k]?.value)).map((k:string)=>k==='fat'?'fats':k))],...(restaurantName&&restaurantId?{restaurant_name:restaurantName}:{}),...(address&&addressMetaId?{address}:{}),...(retailerName&&retailerMetaId?{retailer:retailerName}:{}),...(brand&&brandId?{brand}:{}),...(variant&&variantMetaId?{variant}:{})}];
  });
  return {rows,trustedIds};
}

export function validateDiscoverySelection(value: unknown): {source_request_id:string;option_id:string}|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['source_request_id','option_id'].includes(k))||typeof v.source_request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.source_request_id)||typeof v.option_id!=='string'||!/^d-[A-Za-z0-9_-]{1,40}-[1-3]$/.test(v.option_id))return null;
  return {source_request_id:v.source_request_id,option_id:v.option_id};
}

/** Bind an ordinary-text discovery tap to a prior completed option and its private canonical source receipt. */
export function resolveDiscoverySelection(input:{source:any;sourceRequestId:string;optionId:string;conversationId:string|null;typedText:string}):{option:DiscoveryOption;options:DiscoveryOption[];lookup_context:unknown;source_request_id:string;binding:{source_url:string;kind:DiscoveryKind;name:string;entity?:string;variant?:string}}|null{
 const source=input.source;if(!source||source.request_id!==input.sourceRequestId||source.state!=='completed'||source.request_payload?.conversation_id!==(input.conversationId||null))return null;
 const options=Array.isArray(source.result?.discovery_options)?source.result.discovery_options:[];const option=options.find((o:any)=>o?.id===input.optionId&&o?.loggable===false);if(!option)return null;
 const binding=source.result?.discovery_option_bindings?.[input.optionId];if(!binding||binding.name!==option.name||binding.kind!==option.kind||typeof binding.source_url!=='string')return null;
 try{const u=new URL(binding.source_url);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.href!==binding.source_url||u.href.length>2000)return null;}catch{return null;}
 if(binding.entity&&binding.entity!==(option.restaurant_name??option.retailer)||binding.variant&&binding.variant!==option.variant)return null;
 const text=input.typedText.normalize('NFKC').trim().toLocaleLowerCase();if(!text||text.length>180)return null;
 const values=[option.name,option.brand,option.restaurant_name,option.retailer,option.variant,`${option.name} - ${option.restaurant_name??''}`.trim(),`${option.name} (${option.variant??''})`.trim()].filter((v:any)=>typeof v==='string') as string[];
 if(!values.some(v=>v.normalize('NFKC').trim().toLocaleLowerCase()===text))return null;
 return {option,options,lookup_context:source.result?.lookup_context??source.request_payload?.lookup_context??null,source_request_id:input.sourceRequestId,binding};
}

/** Reissue retained discovery cards under this receipt's request ID and copy only their server-validated private bindings. */
export function reissueDiscoveryOptionsForReceipt(options:unknown,bindings:unknown,requestId:string):{options:DiscoveryOption[];bindings:Record<string,{source_url:string;kind:DiscoveryKind;name:string;entity?:string;variant?:string}>}{
 const out:DiscoveryOption[]=[],privateBindings:Record<string,{source_url:string;kind:DiscoveryKind;name:string;entity?:string;variant?:string}>={};if(!Array.isArray(options)||!bindings||typeof bindings!=='object'||Array.isArray(bindings))return {options:out,bindings:privateBindings};
 const prefix=requestId.replace(/[^A-Za-z0-9_-]/g,'').slice(0,40);if(!prefix)return {options:out,bindings:privateBindings};
 for(const raw of options.slice(0,3)){if(!raw||typeof raw!=='object'||Array.isArray(raw))continue;const row=raw as DiscoveryOption,binding=(bindings as any)[row.id];if(!binding||binding.name!==row.name||binding.kind!==row.kind||typeof binding.source_url!=='string'||row.loggable!==false)continue;let safe:string;try{const u=new URL(binding.source_url);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.href!==binding.source_url||u.href.length>2000)continue;safe=u.href;}catch{continue;}
  const id=`d-${prefix}-${out.length+1}`;out.push({...row,id,loggable:false});privateBindings[id]={source_url:safe,kind:row.kind,name:row.name,...(typeof binding.entity==='string'?{entity:binding.entity}:{}),...(typeof binding.variant==='string'?{variant:binding.variant}:{})};
 }
 return {options:out,bindings:privateBindings};
}

/** Discovery selections never become loggable without a fresh, supported verification receipt. */
export function discoverySelectionNotVerifiableResult(selection:{option:DiscoveryOption;options:DiscoveryOption[];lookup_context:unknown},requestId:string,language:string){
 const es=language.startsWith('es');return {done:true,request_id:requestId,usage_status:'completed',corrected_text:es?`No pude verificar nutrición para ${selection.option.name} desde una fuente compatible; no lo añadiré al registro. Puedes elegir otra opción o probar una fuente compatible.`:`I could not verify nutrition for ${selection.option.name} from a supported source, so I will not add it to your log. You can choose another option or try a supported source.`,choices:[],discovery_options:selection.options,lookup_options:[],lookup_status:'not_verifiable',action_proposal:null,suggestions:null,...(selection.lookup_context?{lookup_context:selection.lookup_context}:{})};
}

/** A consent card points only to its server-owned proposal receipt. */
export function validatePublicLookupSelection(value: unknown): {source_request_id:string}|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  if(Object.keys(v).length!==1||Object.keys(v)[0]!=='source_request_id'||typeof v.source_request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.source_request_id))return null;
  return {source_request_id:v.source_request_id};
}

/** One bounded planner -> optional single discovery -> final-answer turn.
 * Costs are never defaulted: a missing cost settles as unknown and keeps reconciliation open. */
export async function runModelLedTurn<T>(deps:{
  reserve:(usd:number)=>Promise<boolean>;
  planner:()=>Promise<{output:unknown;cost:number|null;generationId:string|null;disposition?:'ordinary'|'clarify'|'lookup'}>;
  discover:(query:string,args:DiscoverFoodArgs)=>Promise<{output:T;cost:number|null;generationId:string|null}>;
  finalAnswer:(input:{plan:StructuredCoachReply;discovery?:T})=>Promise<{output:unknown;cost:number|null;generationId:string|null}>;
  settle:(cost:number|null, generationIds:string[], errorCode?:'provider_error'|'transport_error'|'truncated'|'invalid_response'|'uncertain')=>Promise<void>;
  reserveUSD:number;
  worstCaseUSD:{planner:number;discovery:number;final:number};
  authorizeDiscovery:(args:DiscoverFoodArgs)=>boolean;
  forcedDiscovery?:DiscoverFoodArgs;
  retainedDiscovery?:(args:DiscoverFoodArgs)=>T|undefined;
}):Promise<{reply:StructuredCoachReply;discovery?:T;proposal?:DiscoverFoodArgs;validationDiagnostic?:ModelValidationDiagnostic;status:'completed'|'needs_consent'|'budget_denied'|'invalid_plan'|'provider_error';generationIds:string[]}> {
  const ceilings=deps.worstCaseUSD;
  if(!Number.isFinite(deps.reserveUSD)||deps.reserveUSD<=0||deps.reserveUSD>5||!ceilings||![ceilings.planner,ceilings.discovery,ceilings.final].every(x=>Number.isFinite(x)&&x>=0)||ceilings.planner+ceilings.discovery+ceilings.final>deps.reserveUSD||!await deps.reserve(deps.reserveUSD))return {reply:{text:'',choices:[]},status:'budget_denied',generationIds:[]};
  const ids:string[]=[];let costs:number[]=[];let settlementAttempted=false;
  const settleOnce=async(cost:number|null,generationIds:string[],errorCode?:'provider_error'|'transport_error'|'truncated'|'invalid_response'|'uncertain')=>{if(settlementAttempted)return;settlementAttempted=true;await deps.settle(cost,generationIds,errorCode);};
  try {
    const p=await deps.planner(); if(p.generationId)ids.push(p.generationId); costs.push(p.cost as number);
    if(!Number.isFinite(p.cost)||p.cost!<0||p.cost!>ceilings.planner||costs.reduce((a,b)=>a+b,0)>deps.reserveUSD){await settleOnce(Number.isFinite(p.cost)&&p.cost!>=0?p.cost:null,ids);return {reply:{text:'',choices:[]},status:'provider_error',generationIds:ids};}
    const plan=validateStructuredCoachReply(p.output);if(!plan){await settleOnce(p.cost!,ids);return {reply:{text:'',choices:[]},status:'invalid_plan',validationDiagnostic:diagnoseStructuredCoachReply(p.output),generationIds:ids};}
    const requested=deps.forcedDiscovery??plan.tool_request?.args;
    if(!requested&&p.disposition==='clarify'){await settleOnce(p.cost,ids);return {reply:plan,status:'completed',generationIds:ids};}
    let discovery:T|undefined;
    if(requested){
    const requestedArgs=validateDiscoverFoodArgs(requested);if(!requestedArgs){await settleOnce(p.cost,ids);return {reply:{text:'',choices:[]},status:'invalid_plan',validationDiagnostic:{field:'tool_request.args',code:'format'},generationIds:ids};}
    const retained=deps.retainedDiscovery?.(requestedArgs);
    if(retained===undefined&&!deps.authorizeDiscovery(requestedArgs)){await settleOnce(p.cost,ids);return {reply:{text:plan.text,choices:plan.choices},proposal:requestedArgs,status:'needs_consent',generationIds:ids};}
    if(retained!==undefined)discovery=retained;else {
      const args=requestedArgs;
      if(deps.reserveUSD-p.cost!<ceilings.discovery+ceilings.final){await settleOnce(p.cost,ids);return {reply:{text:'',choices:[]},status:'budget_denied',generationIds:ids};}
      const result=await deps.discover(publicDiscoveryQuery(args),args);discovery=result.output;if(result.generationId)ids.push(result.generationId);costs.push(result.cost as number);
      if(!Number.isFinite(result.cost)||result.cost!<0||result.cost!>ceilings.discovery||costs.reduce((a,b)=>a+b,0)>deps.reserveUSD){await settleOnce(Number.isFinite(result.cost)&&result.cost!>=0?costs.reduce((a,b)=>a+b,0):null,ids);return {reply:{text:'',choices:[]},discovery,status:'provider_error',generationIds:ids};}
      if(deps.reserveUSD-costs.reduce((a,b)=>a+b,0)<ceilings.final){await settleOnce(costs.reduce((a,b)=>a+b,0),ids);return {reply:{text:'',choices:[]},discovery,status:'budget_denied',generationIds:ids};}
    }
    }
    if(deps.reserveUSD-costs.reduce((a,b)=>a+b,0)<ceilings.final){await settleOnce(costs.reduce((a,b)=>a+b,0),ids);return {reply:{text:'',choices:[]},discovery,status:'budget_denied',generationIds:ids};}
    const f=await deps.finalAnswer({plan,discovery});if(f.generationId)ids.push(f.generationId);costs.push(f.cost as number);
    const reply=validateStructuredCoachReply(f.output,false);
    const total=costs.reduce((a,b)=>a+b,0);
    await settleOnce(costs.every(x=>Number.isFinite(x)&&x>=0)?total:null,ids);
    return reply&&Number.isFinite(f.cost)&&f.cost!>=0&&f.cost!<=ceilings.final&&total<=deps.reserveUSD?{reply,discovery,status:'completed',generationIds:ids}:{reply:{text:'',choices:[]},discovery,status:'provider_error',validationDiagnostic:reply?undefined:diagnoseStructuredCoachReply(f.output,false)??undefined,generationIds:ids};
  } catch(error) {
    const receipt=error&&typeof error==='object'?error as {knownCost?:unknown;generationId?:unknown;errorCode?:unknown}:{};
    if(typeof receipt.generationId==='string'&&!ids.includes(receipt.generationId))ids.push(receipt.generationId);
    const failedCost=typeof receipt.knownCost==='number'&&Number.isFinite(receipt.knownCost)&&receipt.knownCost>=0?receipt.knownCost:null;
    const knownCost=failedCost!==null&&costs.every(x=>Number.isFinite(x)&&x>=0)?costs.reduce((sum,x)=>sum+x,0)+failedCost:null;
    const allowedCodes=new Set(['provider_error','transport_error','truncated','invalid_response','uncertain']);
    const errorCode=knownCost===null?'uncertain':typeof receipt.errorCode==='string'&&allowedCodes.has(receipt.errorCode)?receipt.errorCode:undefined;
    if(!settlementAttempted)await settleOnce(knownCost,ids,errorCode as 'provider_error'|'transport_error'|'truncated'|'invalid_response'|'uncertain'|undefined);
    return {reply:{text:'',choices:[]},status:'provider_error',generationIds:ids};
  }
}

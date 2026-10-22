import { isServerRestaurantSummary, type PublicRestaurantSummary } from './coach-restaurant-followup.ts';
import { validateDiscoverFoodArgs, validateStructuredCoachReply, diagnoseStructuredCoachReply, type DiscoverFoodArgs, type StructuredCoachReply } from './coach-model-led-contract.ts';
import { lookupContext, lookupIntent, publicFood, publicPlace, publicTypography, publicFoodTypography, publicFoodTokens, isFoodPreferenceExpression, type LookupContext } from './coach-lookup-intent.ts';

type Message={role:string;content:string};
type Slot={value:string;quote:string;message_index:number}|null;
const keys=['food','mode','city','region','country','preference'] as const;
const slotEvidence={quote:{type:'string',minLength:1,maxLength:180},message_index:{type:'integer',minimum:0,maximum:29}};
function slotValueSchema(key:typeof keys[number]){
 if(key==='mode')return {type:'string',enum:['restaurant','product','recipe']};
 if(key==='preference')return {type:'string',enum:['high_protein','lower_calorie','balanced']};
 if(key==='country')return {type:'string',pattern:'^[A-Z]{2}$'};
 return {type:'string',minLength:1,maxLength:key==='food'?72:48};
}
function slotSchema(key:typeof keys[number]){return {anyOf:[{type:'object',additionalProperties:false,properties:{value:slotValueSchema(key),...slotEvidence},required:['value','quote','message_index']},{type:'null'}]};}
type ReplyState={kind:'ordinary'|'clarify'|'lookup';context:LookupContext|null};
const replyStates=new WeakMap<object,ReplyState>();
export function plannerReplyState(reply:unknown):ReplyState|undefined{return reply&&typeof reply==='object'?replyStates.get(reply as object):undefined;}
function issue(reply:StructuredCoachReply,kind:ReplyState['kind'],context:LookupContext|null=null){replyStates.set(reply,{kind,context});return reply;}

/** Internal planner schema only. External done/choices/discovery contracts are unchanged. */
export function groundedPlannerResponseFormat(){
 const choice={type:'object',additionalProperties:false,properties:{id:{type:'string',pattern:'^[A-Za-z0-9_-]{1,64}$'},label:{type:'string',minLength:1,maxLength:80},value:{type:'string',minLength:1,maxLength:180}},required:['id','label','value']};
 const slots=Object.fromEntries(keys.map(k=>[k,slotSchema(k)]));
 const priorUpdate={type:'object',additionalProperties:false,properties:{field:{type:'string',enum:[...keys]},value:{type:'string',minLength:1,maxLength:72},...slotEvidence},required:['field','value','quote','message_index']};
 return {type:'json_schema',json_schema:{name:'coach_planner_reply',strict:true,schema:{type:'object',additionalProperties:false,properties:{text:{type:'string',minLength:1,maxLength:4000},choices:{type:'array',items:choice,maxItems:5},public_request:{type:'object',additionalProperties:false,properties:{intent:{type:'string',enum:['none','new','continuation']},prior_updates:{type:'array',items:priorUpdate,maxItems:30},...slots},required:['intent','prior_updates',...keys]}},required:['text','choices','public_request']}}};
}

/** Preserve the original history elsewhere; assistant claims never enter routing input. */
export function plannerMessages(language:string,messages:Message[],summary?:PublicRestaurantSummary){
 const user_messages=messages.flatMap((m,index)=>m.role==='user'?[{message_index:index,content:m.content}]:[]);
 const valuesContract='Slot values: mode.value must be restaurant, product, or recipe. preference.value must be high_protein (an explicit goal to prioritize protein), lower_calorie (an explicit goal to reduce calories), or balanced (an explicit goal to balance nutrition). Interpret the user wording semantically; no fixed phrase is required. If the user has not expressed a preference goal, set the preference slot to null. A request for official macros or verified nutrition is a request for information, not a preference goal. country.value must be an uppercase ISO-3166-1 alpha-2 code validated by the backend, supported by explicit country/area wording in the quoted user message; otherwise set country to null, never infer it from city, region, profile or memory. Unknown slot objects are null, not objects with an invented value. prior_updates must use the same canonical value contract for its field and must only retain replaced user-evidenced values.';
 const prompt=`You plan public food lookups for Macro Goal. Respond in ${language.startsWith('es')?'Spanish':'English'}. You can propose discovery of restaurant menus and official restaurant addresses, grocery products, or recipes. An address or nutrition value is not verified at this phase; never invent either. Do not refuse public address discovery because an earlier assistant did. Only user-origin messages below define the active public request. Ordinary coaching will be answered separately with its full private context; use neutral text and empty choices here. Geographic quotes may be compound phrases: city Orlando and region Florida or FL can both cite Orlando, Florida. Geographic values must be complete source spans or documented explicit aliases. Country may remain null; never derive it from city/region. Mode and preference are semantic enums and need not appear verbatim in their supporting quote. Quote the shortest unambiguous affirmative user evidence supporting each slot.`;
 return [{role:'system',content:prompt+'\n\n'+valuesContract+`\n\nPUBLIC ROUTING CONTRACT (planner phase only):\nReturn text, choices, and public_request, never tool_request. intent is new for a new public food request, continuation for an answer/amendment/food selection in the active public request, or none for ordinary coaching or an abandoned topic. The optional server_owned_public_context is an authenticated prior public restaurant request and option identities, never private profile data. When the user changes only food or preference in that active conversation, use continuation and quote only new user evidence; the backend can retain unchanged prior public slots. A food change is not by itself topic abandonment. None means an unrelated or abandoned topic. Never invent slots from option names. Every non-null slot is {value,quote,message_index}; copy quote exactly from the indexed user message. A complete public request in the latest user message takes priority over earlier requests: use its quoted slots and prior_updates=[]. New requests use only the latest user message; leave any unstated city, country or preference null instead of borrowing it from an earlier topic. For a restaurant meal request without a named dish, keep food null; the backend supports general meal discovery. Ask only for a missing city. Continuations preserve already stated slots and apply the user's latest answer, including city, mode, preference or selected food. Acknowledgement or waiting turns need not contribute slots. If the latest user turn adds no public slot, use none and let ordinary coaching answer it. Requests to eat out while travelling or stay within macros/deficit can be public restaurant meal requests without a named food. Preserve an explicit earlier food and locality on a continuation, and replace only slots the user changes. Determine continuity or topic abandonment from the user meaning, not from whether every intervening turn supplied a slot. Food-only and preference-only answers can continue an active public request. Changing a dish or city within the same meal conversation is a continuation: replace that slot, retain other explicit slots, and include superseded values in prior_updates. A deficit or macro-fit goal is not a requirement to name a dish. Use none for an abandoned topic; use new for a new request without borrowing old locality. prior_updates retains superseded values as {field,value,quote,message_index}, only when a later quoted value replaces that same field; omit redundant entries. Do not reuse fields from an abandoned topic. Interpret mode and preference semantically from affirmative user wording; do not require a fixed keyword. Never use negated wording as affirmative evidence. Country must be explicit, never inferred from city/state. Unknown slots are null. For none all slots are null and prior_updates=[]. Extraction proposes a search and never grants consent. Backend produces the sole confirmation or missing-field question; neutral text here does not control routing. For clear public food requests extract the stated slots even before source verification. Never infer slots from assistant messages, private profile or memory.`},
 {role:'user',content:JSON.stringify({latest_user_message_index:user_messages.at(-1)?.message_index,user_messages,...(isServerRestaurantSummary(summary)?{server_owned_public_context:summary}:{})})}];
}

export type PlannerValidationDiagnostic={
 code:'shape'|'quote_missing'|'quote_ambiguous'|'negated'|'source_index'|'source_not_user'|'unsupported_value'|'discontinuous_history'|'invalid_prior_update'|'intent_conflict'|'food_span_mismatch'|'food_span_ambiguous'|'food_public_name_invalid'|'food_unsafe_quote'|'food_identity_truncated'|'slot_span_mismatch'|'slot_span_ambiguous'|'slot_identity_truncated'|'slot_alias_mismatch'|'slot_unsafe_quote';
 field:'$root'|'text'|'choices'|'public_request'|'intent'|'prior_updates'|'food'|'mode'|'city'|'region'|'country'|'preference';
 message_index?:number;quote_match_count?:0|1|2;
};
const typography=publicTypography;
const norm=(s:string)=>typography(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/'/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
// Country/area names and codes: https://unstats.un.org/unsd/methodology/m49/overview/ (EN/ES).
const countries:Record<string,string>={us:'US',usa:'US','united states':'US','united states of america':'US','estados unidos':'US','estados unidos de america':'US',ca:'CA',canada:'CA',mx:'MX',mexico:'MX',gb:'GB',uk:'GB','united kingdom':'GB','reino unido':'GB',es:'ES',esp:'ES',spain:'ES',espana:'ES',pr:'PR',pri:'PR','puerto rico':'PR'};
// USPS Publication 28 Appendix B, not inferred country membership or a city geocoder.
const regionGroups='Alabama:AL|Alaska:AK|American Samoa:AS|Arizona:AZ|Arkansas:AR|California:CA|Colorado:CO|Connecticut:CT|Delaware:DE|District of Columbia:DC|Federated States of Micronesia:FM|Florida:FL|Georgia:GA|Guam:GU|Hawaii:HI|Idaho:ID|Illinois:IL|Indiana:IN|Iowa:IA|Kansas:KS|Kentucky:KY|Louisiana:LA|Maine:ME|Marshall Islands:MH|Maryland:MD|Massachusetts:MA|Michigan:MI|Minnesota:MN|Mississippi:MS|Missouri:MO|Montana:MT|Nebraska:NE|Nevada:NV|New Hampshire:NH|New Jersey:NJ|New Mexico:NM|New York:NY|North Carolina:NC|North Dakota:ND|Northern Mariana Islands:MP|Ohio:OH|Oklahoma:OK|Oregon:OR|Palau:PW|Pennsylvania:PA|Puerto Rico:PR|Rhode Island:RI|South Carolina:SC|South Dakota:SD|Tennessee:TN|Texas:TX|Utah:UT|Vermont:VT|Virgin Islands:VI|Virginia:VA|Washington:WA|West Virginia:WV|Wisconsin:WI|Wyoming:WY'.split('|').map(pair=>pair.split(':'));
const explicitCountries=new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '));
const countryKey=(s:string)=>norm(s.replace(/\./g,''));
function slotValue(key:typeof keys[number],raw:string):string{
 const value=(key==='food'?publicFoodTypography:typography)(raw).trim().replace(/^(["'])([\s\S]*)\1$/,'$2').trim(),v=value.toLowerCase();
 if(key==='mode')return ({restaurants:'restaurant',restaurante:'restaurant',restaurantes:'restaurant',menu:'restaurant',menus:'restaurant',supermarket:'product',grocery:'product',groceries:'product',recipes:'recipe',receta:'recipe',recetas:'recipe'} as Record<string,string>)[v]??v;
 if(key==='preference')return v.replace(/[-\s]+/g,'_');
 if(key==='country')return countries[countryKey(value)]??value.toUpperCase();
 return value;
}
function spanCount(value:string,quote:string,code=false):0|1|2{
 const fold=(s:string)=>typography(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const literal=fold(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
 const matches=[...fold(quote).matchAll(new RegExp("(?<![\\p{L}\\p{N}'-])"+literal+"(?![\\p{L}\\p{N}'-])",code?'gu':'giu'))];return Math.min(matches.length,2) as 0|1|2;
}
function groundedSlot(key:typeof keys[number],value:string,quote:string,city?:string):PlannerValidationDiagnostic['code']|undefined{
 if(lookupIntent(quote).reason==='private_or_unsafe_context')return 'slot_unsafe_quote';
 if(key==='city'){
  const count=spanCount(value,quote);if(count!==1)return count?'slot_span_ambiguous':'slot_span_mismatch';
  // Keep complete multiword locality names: Juan cannot replace San Juan.
  const folded=typography(quote).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),needle=typography(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const pattern=needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
  const found=new RegExp("(?<![\\p{L}\\p{N}'-])"+pattern+"(?![\\p{L}\\p{N}'-])",'u').exec(folded)!;
  const before=folded.slice(0,found.index),after=folded.slice(found.index+found[0].length),left=/([\p{L}\p{N}'-]+)\s+$/u.exec(before),right=/^\s+([\p{L}\p{N}'-]+)/u.exec(after);
  const leftBoundary=new Set(['in','en','near','around','at','from','de','of']),rightBoundary=new Set(['in','en','with','con','for','para','please','and','y']);
  const namedSuffix=[...regionGroups.map(group=>group[0]),...Object.keys(countries).filter(alias=>alias.length>3)].some(alias=>norm(after).startsWith(norm(alias)+' ')||norm(after)===norm(alias));
  if(left&&!leftBoundary.has(left[1])||right&&!rightBoundary.has(right[1])&&!namedSuffix)return 'slot_identity_truncated';
  return;
 }
 if(key==='region'||key==='country'){
  const aliases=key==='region'?(regionGroups.find(group=>group.some(alias=>norm(alias)===norm(value)))??[value]):
   explicitCountries.has(value)?[value,...Object.keys(countries).filter(alias=>countries[alias]===value).map(alias=>/^[a-z]{2,3}$/.test(alias)?alias.toUpperCase():alias),...(value==='US'?['U.S.','U.S.A.']:[])]:[];
  if(key==='region'&&regionGroups.some(group=>group.some(alias=>!aliases.includes(alias)&&aliases.some(selected=>norm(alias).length>norm(selected).length&&spanCount(selected,alias)>0)&&spanCount(alias,quote)>0)))return 'slot_alias_mismatch';
  const parts=typography(quote).split(',').map(part=>part.trim());
  // A lowercase postal code is explicit only in a delimited city, region[, country].
  // Bare prepositions such as "in" or "or" never become region-code evidence.
  const delimitedRegion=key==='region'&&parts.length>=2&&parts.length<=3&&!!city&&norm(parts[0])===norm(city)&&!!publicPlace(parts[0],'area')&&/^[a-z]{2}$/i.test(parts[1])&&
   (parts.length===2||!!countries[countryKey(parts[2])]||explicitCountries.has(parts[2]));
  const counts=aliases.map(alias=>spanCount(alias,quote,/^[A-Z]{2,3}(?:\.|$)/.test(alias)&&!(delimitedRegion&&alias.toLowerCase()===parts[1].toLowerCase())));
  // Identical aliases (e.g. PR in the literal value and table) count once.
  const found=new Set(aliases.filter((_,i)=>counts[i]>0).map(alias=>norm(alias)));
  if(counts.some(count=>count===2))return 'slot_span_ambiguous';
  return found.size?undefined:'slot_alias_mismatch';
 }
 // The planner owns semantic interpretation for these enums. The surrounding
 // validator still requires unique affirmative user evidence and signed consent.
 return (key==='mode'?['restaurant','product','recipe']:['balanced','high_protein','lower_calorie']).includes(value)?undefined:'unsupported_value';
}

/** A source name is preserved verbatim apart from shared typography/whitespace normalization. */
function publicFoodName(raw:string):string|undefined{
 const name=publicFoodTypography(raw).replace(/^(["'])([\s\S]*)\1$/,'$2').trim(),validated=publicFood(name);
 return validated&&norm(validated)===norm(name)?name:undefined;
}

/** Whole-word, contiguous source span. No stemming, paraphrase, token reordering or variant synthesis. */
function deriveFood(value:string,rawQuote:string):{value?:string;code?:PlannerValidationDiagnostic['code']}{
 const quote=publicFoodTypography(rawQuote),needle=publicFoodTypography(value);
 const words=publicFoodTokens;
 const wanted=words(needle),source=words(quote),matches:Array<{start:number;end:number;wordIndex:number}>=[];
 if(!wanted.length)return {code:'food_span_mismatch'};
 for(let i=0;i+wanted.length<=source.length;i++){
  if(!wanted.every((w,j)=>w.word===source[i+j].word))continue;
  if(source.slice(i+1,i+wanted.length).some((w,j)=>!/^\s+$/.test(quote.slice(source[i+j].end,w.start))))continue;
  matches.push({start:source[i].start,end:source[i+wanted.length-1].end,wordIndex:i});if(matches.length>1)return {code:'food_span_ambiguous'};
 }
 if(matches.length!==1)return {code:'food_span_mismatch'};
 if(lookupIntent(quote).reason==='private_or_unsafe_context')return {code:'food_unsafe_quote'};
 const span=quote.slice(matches[0].start,matches[0].end),name=publicFoodName(needle);
 if(!name||!publicFoodName(span))return {code:'food_public_name_invalid'};
 // A whole quoted public name has priority, retaining its explicit merchant/variant.
 const quoteText=publicFoodTypography(quote).replace(/^(["'])([\s\S]*)\1$/,'$2').trim(),parsedQuote=publicFood(quoteText);
 if(parsedQuote&&norm(parsedQuote)!==norm(quoteText))return {code:'food_public_name_invalid'};
 const quotedName=publicFoodName(quote);
 if(quotedName)return {value:quotedName};
 // A sentence wrapper must not let a shorter value silently drop adjacent name words.
 const found=matches[0],boundaries=new Set(['a','an','the','un','una','el','la','los','las','in','en']);
 const identityNeighbor=(index:number,side:'left'|'right')=>{
  const word=source[index];if(!word||boundaries.has(word.word))return false;
  const gap=side==='left'?quote.slice(word.end,found.start):quote.slice(found.end,word.start);
  if(/[.!?;:\r\n]/.test(gap))return false;
  // A lowercase preference modifier immediately introduced by request wording is not a brand/variant.
  // Whole-name quotes above and any remaining adjacent identity words retain their existing protection.
  const literal=quote.slice(word.start,word.end),prefix=quote.slice(0,word.start);
  if(side==='left'&&literal===literal.toLowerCase()&&isFoodPreferenceExpression(literal)&&/\b(?:want|need|find|search(?: for)?|show me|looking for|quiero|busca|buscar|necesito)\s+(?:(?:a|an|the|some|un|una|el|la)\s+)?$/i.test(prefix))return false;
  const next=source[index+1];
  // Generic request framing: "[full name] option in [place]", never a brand rule.
  if(side==='right'&&['option','options','item','items'].includes(word.word)&&next&&['in','at','en','from'].includes(next.word)&&/^\s+$/.test(quote.slice(word.end,next.start)))return false;
  return !!publicFoodName(quote.slice(word.start,word.end))||/^\p{Nd}/u.test(word.word)||['with','con','and','y','&','de','del'].includes(word.word);
 };
 if(identityNeighbor(found.wordIndex-1,'left')||identityNeighbor(found.wordIndex+wanted.length,'right'))return {code:'food_identity_truncated'};
 return {value:name};
}

/** Typography normalization preserves words, order, source role and local negation. Counts saturate at two. */
function quoteCheck(rawText:string,rawQuote:string):{code?:'quote_missing'|'quote_ambiguous'|'negated';count:0|1|2}{
 const text=typography(rawText),quote=typography(rawQuote),at=text.indexOf(quote);
 if(at<0)return {code:'quote_missing',count:0};
 if(text.indexOf(quote,at+1)>=0)return {code:'quote_ambiguous',count:2};
 const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const q=fold(quote),before=fold(text.slice(Math.max(0,at-100),at)).split(/[.!?;,\n]/).at(-1)??'',after=fold(text.slice(at+quote.length,at+quote.length+40));
 const negative="(?:not|no|never|without|avoid|don't|dont|do not|sin|evita|evitar|ni)",filler='(?:a|an|the|any|to|in|from|want|visit|quiero|busco|necesito|ir|a|un|una|el|la|en|de)';
 if(new RegExp('\\b'+negative+'\\b').test(q)||new RegExp('\\b'+negative+'(?:\\s+'+filler+'){0,4}\\s*$').test(before)||/^\s*(?:(?:is|are|es|son)\s+)?(?:not|no|never)\b/.test(after))return {code:'negated',count:1};
 return {count:1};
}

/** All rejections use fixed enums and bounded indices/counts; no model keys, text, values or quotes are emitted. */
export function resolvePlannerReply(output:unknown,messages:Message[],language:string,onDiagnostic?:(d:PlannerValidationDiagnostic)=>void,summary?:PublicRestaurantSummary):StructuredCoachReply|null{
 const reject=(code:PlannerValidationDiagnostic['code'],field:PlannerValidationDiagnostic['field'],index?:number,count?:0|1|2):null=>{
  onDiagnostic?.({code,field,...(Number.isInteger(index)&&index!>=0&&index!<=29?{message_index:index}:{}),...(count!==undefined?{quote_match_count:count}:{})});return null;
 };
 if(!output||typeof output!=='object'||Array.isArray(output))return reject('shape','$root');
 const v=output as any,raw=v.public_request;
 if(Object.keys(v).some(k=>!['text','choices','public_request'].includes(k)))return reject('shape','$root');
 const safe=validateStructuredCoachReply({text:v.text,choices:v.choices});
 if(!safe){const field=diagnoseStructuredCoachReply({text:v.text,choices:v.choices})?.field??'$root';return reject('shape',field==='text'?'text':field.startsWith('choices')?'choices':'$root');}
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['intent','prior_updates',...keys].includes(k)))return reject('shape','public_request');
 const intent=typeof raw.intent==='string'?raw.intent.trim().toLowerCase():raw.intent;
 if(!['none','new','continuation'].includes(intent))return reject('unsupported_value','intent');
 const prior=raw.prior_updates??[];if(!Array.isArray(prior)||prior.length>30)return reject('shape','prior_updates');
 const userIndices=messages.flatMap((m,i)=>m.role==='user'?[i]:[]),latest=userIndices.at(-1),args:Record<string,string>={},current:Partial<Record<typeof keys[number],Exclude<Slot,null>>>={},indices:number[]=[];
 const meta:Partial<Record<typeof keys[number],{index:number;count:0|1|2}>>={};
 const validSlot=(key:typeof keys[number],s:any):Exclude<Slot,null>|null=>{
  if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).length!==3||Object.keys(s).some(k=>!['value','quote','message_index'].includes(k))||typeof s.value!=='string'||!s.value.trim()||s.value.length>72||typeof s.quote!=='string'||!s.quote||s.quote.length>180){reject('shape',key);return null;}
  if(!Number.isInteger(s.message_index)||s.message_index<0||s.message_index>29||!messages[s.message_index]){reject('source_index',key,s.message_index);return null;}
  const m=messages[s.message_index];if(m.role!=='user'){reject('source_not_user',key,s.message_index);return null;}
  if(key!=='food'&&lookupIntent(m.content).reason==='private_or_unsafe_context'){reject('slot_unsafe_quote',key,s.message_index);return null;}
  const match=quoteCheck(m.content,s.quote);if(match.code){reject(match.code,key,s.message_index,match.count);return null;}
  if(key==='food'&&/[\u0000-\u001f\u007f]/.test(s.value)){reject('food_public_name_invalid',key,s.message_index,match.count);return null;}
  const value=slotValue(key,s.value);
  if(key==='food'){const food=deriveFood(value,s.quote);if(food.code||!food.value){reject(food.code??'food_public_name_invalid',key,s.message_index,match.count);return null;}return {...s,value:food.value};}
  const grounding=groundedSlot(key,value,s.quote,args.city);if(grounding){reject(grounding,key,s.message_index,match.count);return null;}
  return {...s,value};
 };
 for(const key of keys){
  if(raw[key]===null||raw[key]===undefined)continue;
  let s=validSlot(key,raw[key]);if(!s)return null;
  if(latest!==undefined&&s.message_index!==latest){
   const match=quoteCheck(messages[latest].content,s.quote);
   if(match.code==='negated')return reject('negated',key,latest,match.count);
   // Same unique affirmative quote, now explicitly present in the current user request.
   if(!match.code&&(key==='food'||lookupIntent(messages[latest].content).reason!=='private_or_unsafe_context'))s={...s,message_index:latest};
  }
  if(intent==='none')return reject('intent_conflict','intent',s.message_index);
  current[key]=s;args[key]=s.value;meta[key]={index:s.message_index,count:1};indices.push(s.message_index);
 }
 if(intent==='none'&&prior.length)return reject('intent_conflict','prior_updates');
 const latestOnly=()=>{for(const key of keys)if(current[key]?.message_index!==latest){delete current[key];delete args[key];delete meta[key];}indices.splice(0,indices.length,...Object.values(current).map(s=>s!.message_index));};
 const completeLatest=current.food?.message_index===latest&&current.mode?.message_index===latest&&(args.mode!=='restaurant'||current.city?.message_index===latest);
 const fresh=intent==='new'||completeLatest;
 if(fresh)latestOnly();
 const seen=new Map<string,string>();
 for(const entry of fresh?[]:prior){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).length!==4||!keys.includes(entry.field))return reject('shape','prior_updates');
  const {field,...rawSlot}=entry,s=validSlot(field,rawSlot);if(!s)return null;
  if(!current[field])return reject('invalid_prior_update',field,s.message_index);
  if(s.message_index===current[field]!.message_index&&s.value===current[field]!.value)continue;
  if(s.message_index>=current[field]!.message_index)return reject('invalid_prior_update',field,s.message_index);
  const id=field+':'+s.message_index;if(seen.has(id)){if(seen.get(id)===s.value)continue;return reject('invalid_prior_update',field,s.message_index);}seen.set(id,s.value);indices.push(s.message_index);
 }
 if(intent==='none')return issue(safe,'ordinary');
 if(!fresh){
  // No current public evidence: answer conversationally without reviving an old lookup.
  if(!indices.includes(latest!))return issue(safe,'ordinary');
  // The existing planner owns semantic continuity. Non-slot turns do not invalidate quoted values.
 }
 if(intent==='continuation'&&indices.includes(latest!)&&isServerRestaurantSummary(summary)){
  const previous=summary.request,[city,region]=previous.area?.split(',').map(s=>s.trim())??[];
  const cityChanged=args.city!==undefined&&city!==undefined&&norm(args.city)!==norm(city);
  for(const [key,value] of Object.entries({food:previous.food,mode:previous.mode,city,region:cityChanged?undefined:region,country:cityChanged?undefined:previous.country,preference:previous.preference}))if(args[key]===undefined&&value!==undefined)args[key]=value;
 }
 if(!args.food&&args.mode==='restaurant')args.food='meal';
 const context=args.food?lookupContext({food:args.food,mode:args.mode??'unknown',...(args.city?{area:[args.city,args.region].filter(Boolean).join(', ')}:{}),...(args.country?{country:args.country}:{}),...(args.preference?{preference:args.preference}:{})}):null;
 if(args.food&&!context){const field=!publicFood(args.food)?'food':args.city&&!publicPlace(args.city,'area')?'city':args.region?'region':'food';return reject(field==='food'?'food_public_name_invalid':'unsupported_value',field,meta[field]?.index,meta[field]?.count);}
 if(!args.food||!args.mode||args.mode==='restaurant'&&!args.city)return issue({text:language.startsWith('es')?(!args.food?'\u00bfQu\u00e9 alimento o plato quieres buscar?':!args.mode?'\u00bfQuieres restaurante, producto o receta?':'\u00bfEn qu\u00e9 ciudad p\u00fablica debo buscar?'):(!args.food?'Which food or dish should I look up?':!args.mode?'Would you like a restaurant, product, or recipe?':'Which public city should I search?'),choices:[]},'clarify',context);
 const validated=validateDiscoverFoodArgs(args);if(!validated)return reject('unsupported_value','public_request');
 return issue({...safe,tool_request:{name:'discover_food',args:validated as DiscoverFoodArgs}},'lookup',context);
}

/** Same resolver path, with a private structured reason for an invalid plan. */
export function resolvePlannerReplyWithDiagnostic(output:unknown,messages:Message[],language:string,summary?:PublicRestaurantSummary):{reply:StructuredCoachReply|null;diagnostic?:PlannerValidationDiagnostic}{
 let diagnostic:PlannerValidationDiagnostic|undefined;
 const reply=resolvePlannerReply(output,messages,language,d=>{diagnostic=d;},summary);
 return {reply,...(diagnostic?{diagnostic}:{})};
}

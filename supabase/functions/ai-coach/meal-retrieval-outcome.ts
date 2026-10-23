// Compound requests must be evidenced together in one item-bound source line.
// This does not establish nutrition, portion, allergens, merchant or locality.
export function compoundFoodParts(food:string):string[]|null{
 const normalized=food.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
  .replace(/\bpollo\s+a\s+la\s+parrilla\b/g,'grilled chicken')
  .replace(/\ba\s+la\s+parrilla\b/g,'grilled').replace(/\bpollo\b/g,'chicken')
  .replace(/\barroz\b/g,'rice').replace(/\b(?:verduras|vegetales)\b/g,'vegetables');
 if(/\b(?:no|not|without|sin)\b/.test(normalized))return null;
 // Only this complete known component grammar permits omitted commas.
 // Never split arbitrary words or discard preparation/unknown qualifiers.
 if(/^(?:grilled chicken|chicken)\s+rice\s+(?:and|y)\s+vegetables$/.test(normalized))
  return [normalized.startsWith('grilled')?'grilled chicken':'chicken','rice','vegetables'];
 const parts=normalized.split(/\s*(?:,|\band\b|\by\b)\s*/).map(x=>x.trim()).filter(Boolean);
 return parts.length>=2&&parts.length<=5&&parts.every(x=>/^[a-z ]{2,60}$/i.test(x))?parts:null;
}
export function compoundFoodMatches(food:string,evidence:string):boolean{
 const parts=compoundFoodParts(food);if(!parts)return false;
 const text=evidence.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 if(text.length>700||/[\n\r;]|\b(?:other (?:meal|dish)|another (?:meal|dish))\b/i.test(evidence)||/\b(?:without|no|not|sin)\b/.test(text))return false;
 // Alternatives, optional additions and separate sides do not establish inclusion.
 if(/\b(?:or|o|separately|optional|optionally|opcional|opcionales)\b|\b(?:por separado|a eleccion|on request|upon request)\b/.test(text))return false;
 if(parts.includes('grilled chicken')&&/\b(?:fried|breaded|crispy|frito|empanizado)\b/.test(text))return false;
 return parts.every(part=>{
  if(/^(?:vegetables|veggies|vegetales|verduras)$/.test(part))return /\b(?:vegetables|veggies|vegetales|verduras|broccoli|brocoli|carrots|zanahorias|cucumber|pepper|peppers|tomato|tomatoes|arugula|spinach)\b/.test(text);
  return new RegExp('\\b'+part.trim().split(/\s+/).join('\\s+')+'\\b','i').test(text);
 });
}
/** A compound match may use only this named item's one bounded description. */
export function compoundItemEvidence(name:string,line:string):string|null{
 const norm=(s:string)=>s.normalize('NFKC').toLowerCase();const text=norm(line),item=norm(name);
 const at=text.indexOf(item);if(at<0||text.indexOf(item,at+item.length)>=0)return null;
 if(at>0&&/[\p{L}\p{N}]/u.test(text[at-1]))return null;
 const own=line.slice(at).trim();
 // Ambiguous flattened menus must not lend a neighboring item's ingredients.
 if(own.length>400||/[\n\r;|]|[.!?].*\S|[:].*[:]|[\u2013\u2014]/u.test(own))return null;
 const description=own.slice(name.length).trim();
 if(description&&(!description.startsWith(':')||/\b(?:bowl|plate|basket|sandwich|wrap|salad|pizza|meal|dish)\b/i.test(description)))return null;
 // A prefix is allowed only if blank; the caller already finds the item-bound line.
 if(line.slice(0,at).trim())return null;
 return own;
}
export function importedDiscoveryOutcome(options:unknown[],hadValidatedOptions:boolean){
 return options.length?{status:'options',next_action:'review_option'}:{status:'clarify',outcome:'no_validated_options',question:{key:'dish_and_portion'},reason:hadValidatedOptions?'dietary_constraints_filtered':'source_evidence_unavailable',next_action:'revise_search',retry_automatically:false};
}

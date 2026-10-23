import {publishedRecipeTotalMinutes} from './recipe-duration.ts';
import {relatedRestaurantMatch,type RestaurantMatch} from './restaurant-similarity.ts';
import {compoundFoodParts,compoundFoodMatches,compoundItemEvidence} from './meal-retrieval-outcome.ts';
import {verifiedRegistryPages,verifiedRegistryCandidates,isRegistryCandidate,isOfficialRestaurantPlan} from './coach-official-capabilities.ts';
import { isVerifiedMcDonaldsBranch, type VerifiedMcDonaldsBranch } from './coach-mcdonalds-api.ts';
import { parseMcDonaldsNutrition, verifiedMcDonaldsMerchant, type McDonaldsItemReceipt } from './coach-mcdonalds-api.ts';

import { officialProductNutrition, officialMenuNutrition, officialMenuNutritionOptions, classifyItemIntegrity, foodCategory, type Nutrition } from './coach-nutrition-evidence.ts';
import { coachSources, type CoachSource } from './coach-sources.ts';
import { parsePublishedProductIdentity, parsePublishedRestaurantIdentity, parseCitedRetailerListing, parseRestaurantBranchAssociation, validateCitedDiscoveryMetadata, type CandidateRejection, type CitedDiscoveryMetadata, type VerifiedBranch, type VerifiedRetailer } from './coach-public-metadata.ts';
import { publicPlace } from './coach-lookup-intent.ts';
import { parseDishJSON } from './coach-dish-json.ts';
import { verifiedPublisherBrand } from './_shared/coach-recommendation-contract.ts';
export { parseDishJSON } from './coach-dish-json.ts';
export type DishEvidence = { recipe_total_minutes?:number; dietary_evidence?:string; match?:RestaurantMatch; nutrition?: Nutrition | null; name: string; portion: string | null; calories: number | null; nutritionStatus: 'verified' | 'unverified'; areaVerified: boolean; url: string; productUrl?:string|null; locatorUrl?:string|null; quote: string; sourceTitle: string; market: string | null; sourceKind: 'menu' | 'product' | 'retrieved_recipe'; instructions: string[]; restaurantName?:string; variant?:string;retailers?:VerifiedRetailer[];location?:VerifiedBranch;discoveryMetadata?:CitedDiscoveryMetadata };
export type EvidenceResult = { requestedKind?:DishEvidence['sourceKind']; candidates?: DishEvidence[]; rejectedCandidates?:Array<{name:string;url:string;reason:'unverified_packaged_product'}>; status: 'supported' | 'missing' | 'conflicting'; dishes: DishEvidence[]; sources: CoachSource[]; conflicts: string[] };
const decoded = (s: string) => s.replace(/&amp;/gi,'&').replace(/&nbsp;|&#160;/gi,' ').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'");
const plain = (s: string) => decoded(s).normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
const categoryText = (s: string) => plain(s.replace(/([a-z])([A-Z])/g,'$1 $2'));
function categoryMatches(food:string,evidence:string):boolean { if(compoundFoodParts(food))return compoundFoodMatches(food,evidence); const resolved=foodCategory(food),f=resolved??plain(food).replace(/^(healthy|saludable)\s+/,''); const text=categoryText(evidence);const escaped=f.replace(/[.*+?^$|(){}\[\]\\]/g,'\\$&');const plural=/^(?:ice cream|pasta|soup|salad|bread|lasagna|burrito|bowl|casserole|pie|cake|omelet|omelette)$/.test(f)?'':'s?';if(!f||!new RegExp('\\b'+escaped+plural+'\\b','i').test(text))return false;if(resolved){const categoryEscaped=resolved.replace(/[.*+?^$|(){}\[\]\\]/g,'\\$&');if(new RegExp('\\b'+categoryEscaped+'\\s+(?:sauce|crust|toppings?|dough|base|side|ingredient)\\b','i').test(text))return false;}return true; }
export function sourceMarket(url: string, content='', itemName?:string): string | null {
  const u=new URL(url),parts=u.pathname.toLowerCase().split('/');
  if(itemName&&['papajohns.com','www.papajohns.com'].includes(u.hostname)){
    const lines=String(content).split(/\r?\n/), headings=lines.map((line,index)=>{const m=/^\s*(#{1,6})\s+(.+?)\s*$/.exec(line);return m?{index,level:m[1].length,text:m[2].trim()}:null;}).filter((x):x is {index:number;level:number;text:string}=>!!x);
    const norm=(v:string)=>v.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase(),matches=headings.filter(h=>norm(h.text)===norm(itemName));
    let itemIndex:number,sectionEnd:number;
    if(matches.length===1){const h=matches[0];itemIndex=h.index;sectionEnd=headings.find(x=>x.index>h.index&&x.level<=h.level&&!/^(?:serving size|nutrition|nutritional information)$/i.test(x.text))?.index??lines.length;}
    else if(matches.length>1)return null;
    else {const found=lines.map((line,i)=>norm(line).includes(norm(itemName))?i:-1).filter(i=>i>=0);if(found.length!==1)return /\b(?:products?\s+sold|sold)\s+in\s+the\s+(?:u\.?s\.?|united states)\b/i.test(content)?'US':null;itemIndex=found[0];sectionEnd=headings.find(x=>x.index>itemIndex&&x.level<=5&&!/^(?:serving size|nutrition|nutritional information)$/i.test(x.text))?.index??lines.length;}
    const local=lines.slice(itemIndex,sectionEnd).join(' ');if(/\b(?:available|sold)\s+in\s+(?:canada|canadian)\s+only\b|\bcanada\s+only\b/i.test(local))return 'CA';if(/\b(?:available|sold)\s+in\s+(?:the\s+)?(?:u\.?s\.?|united states)\s+only\b|\b(?:u\.?s\.?|united states)\s+only\b/i.test(local))return 'US';
    const prior=headings.filter(h=>h.index<itemIndex&&/^(?:US|Canada|UK|Australia|New Zealand|Mexico|Spain)\W+Nutritional Information\s*$/i.test(h.text)).at(-1);if(prior){const market=/^(US|Canada|UK|Australia|New Zealand|Mexico|Spain)\W+/i.exec(prior.text)?.[1]?.toLowerCase();return ({us:'US',canada:'CA',uk:'UK',australia:'AU','new zealand':'NZ',mexico:'MX',spain:'ES'} as Record<string,string>)[market??'']??null;}
    return /\b(?:products?\s+sold|sold)\s+in\s+the\s+(?:u\.?s\.?|united states)\b/i.test(content)?'US':null;
  }
  if(u.hostname.split('.')[0]==='us')return 'US';
  if(/\b(?:products?\s+sold|sold)\s+in\s+the\s+(?:u\.?s\.?|united states)\b/i.test(content)||/^\s*#{0,6}\s*US\s*[-–]\s*Nutrition(?:al)?\s+Information\s*$/im.test(content))return 'US';
  for(const code of ['us','uk','ca','au','nz','es','mx'])if(parts.includes(code))return code.toUpperCase();
  if(u.hostname.endsWith('.co.uk'))return 'UK';
  if(u.hostname.endsWith('.com.au'))return 'AU';
  return null;
}
/** Extract directly from a labelled instruction section; model steps are never a source. */
export function sourceInstructions(content: string): string[] {
  const match=/^\s*#{0,6}\s*(?:instructions|directions|method|preparation|instrucciones|preparacion|preparación)\s*:?\s*$/im.exec(content);
  if(!match)return [];
  const after=content.slice(match.index+match[0].length);const boundary=after.search(/^\s*#{1,6}\s+\S/m);const section=boundary<0?after:after.slice(0,boundary);
  const chunks=section.split(/\n+|(?<=\.)\s+|\s+(?=\d+\)\s)/).map(s=>s.trim().replace(/^\d+[.)]\s*/,''));
  return chunks.filter(s=>s.length>=12&&s.length<=160&&!/^[_*#]|^\.{3}|^\d+$/.test(s)).slice(0,3).map(decoded);
}
export function validateDishEvidence(message:any,retrievedAt:string,scope:{max_minutes?:number;allowSimilar?:boolean;generalMeal?:boolean;food?:string;restaurant?:string;area?:string;product?:string;market?:string;sourceKind?:DishEvidence['sourceKind'];variant?:string;menuVariant?:string;productVariant?:string;portion?:string;modifications?:string[];onReject?:(reason:CandidateRejection)=>void}={}):EvidenceResult {
  const providerAnnotations=Array.isArray(message?.annotations)?message.annotations.slice(0,20):[];
  const registryPages=verifiedRegistryPages(message),registryURLs=new Set(registryPages.map(page=>page.url));
  const sourceRecords=[...registryPages,...providerAnnotations.filter((a:any)=>a?.type==='url_citation'&&!registryURLs.has(a.url_citation?.url)).map((a:any)=>({...a.url_citation,evidence_origin:'provider'}))];
  const rawRows=[...verifiedRegistryCandidates(message),...(isOfficialRestaurantPlan(message?.official_restaurant_plan)?[]:(parseDishJSON(message?.content)?.dishes??[]))];const rows=(rawRows.slice(0,12) as any[]).flatMap(row=>{if(isRegistryCandidate(row))return [row];if(!row||typeof row.name!=='string'||typeof row.url!=='string'||(scope.sourceKind??'menu')!=='menu'||scope.menuVariant||scope.variant)return [row];const citation=sourceRecords.find((a:any)=>a?.url===row.url&&a.public_page_verified===true&&typeof a.page_content==='string');if(!citation)return [row];const options=officialMenuNutritionOptions(citation.page_content,row.name,row.url,retrievedAt,scope.food,3);return options.length?options.map(o=>({...row,__menuVariant:o.variant})): [row];});const accepted:DishEvidence[]=[];const rejectedCandidates:NonNullable<EvidenceResult['rejectedCandidates']>=[];const usedSources:CoachSource[]=[];
  for(const row of rows.slice(0,12) as any[]){
    const slot=rawRows.findIndex((raw:any)=>raw?.url===row?.url&&raw?.name===row?.name)+1;
    const discard=(stage:CandidateRejection['stage'],code:string)=>{if(slot>=1&&slot<=3)scope.onReject?.({slot,stage,code});};
    if(!row||typeof row.name!=='string'||!row.name.trim()||row.name.length>100)continue;
    const name=plain(row.name),kind=scope.sourceKind??'menu';
    // Published standard-item values do not establish nutrition after customizations.
    if(scope.modifications?.length){discard('nutrition','unsupported_modifications');continue;}
    if(scope.variant&&name!==plain(scope.variant)){discard('identity','item_variant_mismatch');continue;}
    if(!scope.allowSimilar&&scope.food==='pizza'&&/\b(sandwich(?:es)?|wrap|pasta|salad|burger|sauce|topping)\b/.test(name)){discard('identity','food_category_mismatch');continue;}
    const ann=sourceRecords.filter((a:any)=>a?.url===row.url);
    const sources=ann.flatMap((a:any)=>coachSources([{url:a.url,title:a.title,retrievedAt}]));const source=sources[0];if(!source){discard('source','missing_candidate_citation');continue;}
const mcdCitation=ann.length===1&&ann[0].public_page_verified===true?ann[0]:undefined;
const mcdReceipt=mcdCitation?.privateMcDonaldsItemDetails as McDonaldsItemReceipt|undefined;
const mcdParsed=mcdReceipt
  ?parseMcDonaldsNutrition(mcdReceipt,{
      candidateName:row.name.trim(),
      foodType:scope.food??(scope.generalMeal?'burger':undefined),
      retrievedAt,
      sourceUrl:source.url
    })
  :null;

const mcdRestaurant=mcdParsed&&verifiedMcDonaldsMerchant(source.url,mcdCitation?.title,mcdCitation?.raw_page_content,row.name.trim());
const mcdVerified=!!mcdParsed&&!!mcdRestaurant&&['mcdonalds.com','www.mcdonalds.com'].includes(new URL(source.url).hostname);

    if(!scope.allowSimilar&&kind==='menu'&&scope.food&&!compoundFoodParts(scope.food)&&!categoryMatches(scope.food,row.name)&&!mcdVerified){discard('identity','food_category_mismatch');continue;}
    const texts:string[]=ann.flatMap((a:any)=>[a.content,a.page_content].filter((x:unknown)=>typeof x==='string'));
    const marketPages=ann.filter((a:any)=>a.public_page_verified===true&&typeof a.page_content==='string');const isPapaJohns=['papajohns.com','www.papajohns.com'].includes(new URL(source.url).hostname);const marketContent=isPapaJohns?(marketPages.length===1?marketPages[0].page_content:''):texts.join('\n');const market=sourceMarket(source.url,marketContent,row.name.trim());if(scope.market&&market!==scope.market.toUpperCase()&&(!scope.allowSimilar||market!==null)){discard('market','requested_market_mismatch');continue;}
    const knownHosts:Record<string,string[]>={dominos:['dominos.com','www.dominos.com','cache.dominos.com'],mcdonalds:['mcdonalds.com','www.mcdonalds.com'],baskinrobbins:['baskinrobbins.com','www.baskinrobbins.com'],dairyqueen:['dairyqueen.com','www.dairyqueen.com'],papajohns:['papajohns.com','www.papajohns.com']};
    if(scope.restaurant){const hosts=knownHosts[plain(scope.restaurant).replace(/[^a-z]/g,'')];if(hosts?!hosts.includes(new URL(source.url).hostname):!texts.some(t=>plain(t).includes(plain(scope.restaurant!))))continue;}
    if(scope.product&&!texts.some(t=>plain(t).includes(plain(scope.product!))))continue;
    let evidence:string|undefined,matchedText:string|undefined,matchedSection='',match:RestaurantMatch|undefined,dietaryEvidence:string|undefined;
    for(const content of texts){
      const normalized=plain(content),at=normalized.indexOf(name);if(at<0)continue;
      const contentLines=content.split(/\n/);let nearestHeading='';
      // A JSON-LD/title/navigation mention may precede the visible recipe heading.
      // Bind a recipe to its exact unique primary heading, not the first substring occurrence.
      const primaryRecipeHeadings=kind==='retrieved_recipe'?[...new Set(contentLines.filter(line=>/^\s*#\s+\S/.test(line)).map(line=>plain(line.replace(/^\s*#\s+/,''))))]:[];
      const recipeHeading=primaryRecipeHeadings.length===1&&primaryRecipeHeadings[0]===name?contentLines.find(line=>/^\s*#\s+\S/.test(line)&&plain(line.replace(/^\s*#\s+/,''))===name):undefined;
      for(const candidateLine of contentLines){
        if(/^\s*#{1,6}\s/.test(candidateLine))nearestHeading=candidateLine.replace(/^\s*#+\s*/,'').trim();
        if(plain(candidateLine).includes(name))break;
      }
      const exactTitle=plain(source.title).split(/\s*[|—]\s*/)[0]===name;
      const titleMatch=exactTitle||plain(nearestHeading)===name||recipeHeading!==undefined;
      // A one-word flavour in a flattened multi-product table is ambiguous. A real recipe title may be just Pizza.
      if(name.split(' ').length===1&&!titleMatch&&kind!=='menu')continue;
      if(/^(pizza|pizzas|ice cream|burger|tacos?)$/.test(name)&&!(kind==='retrieved_recipe'&&titleMatch))continue;
      const compact=decoded(content).normalize('NFKC').replace(/\s+/g,' ').trim();const index=plain(compact).indexOf(name);
      // Evidence always comes from provider/page text, never row.quote. Identity remains exact after harmless entity/space normalization.
      const line=recipeHeading??content.split(/\n+/).find(line=>plain(line).includes(name))??compact;
      const lineText=decoded(line).normalize('NFKC').trim(),lineIndex=plain(lineText).indexOf(name);
      const segment=lineText.slice(Math.max(0,lineIndex-90),Math.min(lineText.length,lineIndex+name.length+220));
      // Match against this item's own line and only its closest preceding section heading.
      // Other headings elsewhere on the page must not lend their category to this item.
      const categoryScope=[name,nearestHeading,lineText,exactTitle?source.title:''].join(' ');
      const compoundEvidence=scope.food&&compoundFoodParts(scope.food)?(kind==='retrieved_recipe'&&titleMatch?row.name:compoundItemEvidence(row.name,lineText)):null;
      if(scope.allowSimilar&&kind==='menu'&&scope.food){
       // Name alone is item-bound even if a citation flattens neighboring menu entries.
       const ownText=compoundItemEvidence(row.name,lineText)??row.name;
       const exact=categoryMatches(scope.food,ownText);
       if(!exact){const related=relatedRestaurantMatch(scope.food,ownText);if(!related)continue;match=related;}
      }else{
       if(scope.food&&compoundFoodParts(scope.food)&&compoundEvidence===null)continue;
       if(scope.food&&!categoryMatches(scope.food,compoundEvidence??categoryScope)&&!mcdVerified)continue;
       if(scope.food&&!categoryMatches(scope.food,name)&&/\b(sandwich(?:es)?|wrap|pasta|salad)\b/.test(plain(segment)))continue;
      }
      if(kind==='retrieved_recipe'&&!/\b(recipe|recipes|receta|recetas|instructions|directions)\b/.test(plain(content)))continue;
      dietaryEvidence=compoundItemEvidence(row.name,lineText)??row.name;
      evidence=segment;matchedText=content;matchedSection=nearestHeading;break;
    }
    if(!evidence||!matchedText){discard('identity','item_not_bound_to_source');continue;}
    // Search-provider excerpts may discover identity, never establish macros.
    // Only bytes fetched directly from the allowlisted publisher can do that.
    const fetched=ann.filter((a:any)=>a.url===source.url&&a.public_page_verified===true&&typeof a.page_content==='string');
    let selectedVariant=scope.menuVariant??scope.productVariant??scope.variant??row.__menuVariant;const host=new URL(source.url).hostname;const redBaron=kind==='product'&&host==='www.redbaron.com'&&new URL(source.url).pathname.toLowerCase()==='/products/red-baron%c2%ae-classic-crust-supreme-pizza';if(redBaron&&!selectedVariant)selectedVariant='Classic Crust Supreme';const nutritionPage=redBaron&&typeof fetched[0]?.raw_page_content==='string'?fetched[0].raw_page_content:fetched[0]?.page_content;const nutrition=kind==='retrieved_recipe'||fetched.length!==1?null:kind==='product'?officialProductNutrition(nutritionPage,row.name.trim(),source.url,retrievedAt,selectedVariant,scope.food):kind==='menu'?(mcdVerified?mcdParsed!.nutrition:officialMenuNutrition(fetched[0].page_content,row.name.trim(),source.url,retrievedAt,scope.food,selectedVariant))
:null;if(redBaron&&nutrition)selectedVariant='Classic Crust Supreme';
    // Product discovery may expose a source-cited package identity even when its
    // official label is unsupported or absent. Only complete verified values can
    // enter lookup_options; unverified nutrition remains private and unrendered.
    if(kind==='product'&&nutrition&&nutrition.itemAssociation!=='packaged_product'){rejectedCandidates.push({name:row.name.trim(),url:source.url,reason:'unverified_packaged_product'});continue;}
    if(nutrition){const contextual=classifyItemIntegrity(row.name,nutrition.basis.label,matchedSection,scope.food,nutrition.itemAssociation??'unknown');if(contextual==='component'||nutrition.itemIntegrity==='component')nutrition.itemIntegrity='component';else if(nutrition.itemIntegrity==='complete'||contextual==='complete')nutrition.itemIntegrity='complete';else nutrition.itemIntegrity='unknown';}
    if(scope.portion&&(!nutrition||plain(nutrition.basis.label)!==plain(scope.portion))){discard('nutrition','requested_serving_mismatch');continue;}
    const discoveryMetadata=validateCitedDiscoveryMetadata(row,providerAnnotations,{kind:kind==='menu'?'restaurant':kind==='product'?'product':'recipe',area:scope.area});
    if(mcdVerified)discoveryMetadata.restaurant_name={value:"McDonald's",source_url:source.url,evidence_basis:'citation_title'};

    let retailers:VerifiedRetailer[]|undefined,location:VerifiedBranch|undefined,associationSource:CoachSource|undefined,branchFailure='branch_association_missing';
    const associationUrl=typeof row.association_url==='string'&&row.association_url.length<=2000?row.association_url:undefined;
    const associationKind=row.association_kind==='retailer'||row.association_kind==='branch'?row.association_kind:undefined;
    const associationMatches=associationUrl?sourceRecords.filter((a:any)=>a?.url===associationUrl&&typeof a?.title==='string'&&(typeof a?.content==='string'||typeof a?.page_content==='string')):[];const associationCitation=associationMatches.length===1?associationMatches[0]:undefined;
    if(fetched.length===1&&associationCitation&&associationKind==='retailer'&&kind==='product'){
  const identity=parsePublishedProductIdentity(fetched[0].page_content,source.url,row.name.trim(),selectedVariant??scope.productVariant??scope.variant,discoveryMetadata.brand?.value??verifiedPublisherBrand(source.url,nutrition?.identity??''));
      const listingContent=[associationCitation.content,associationCitation.page_content].filter((x:any)=>typeof x==='string'&&x.length<=512*1024).join('\n');const retailer=identity&&associationUrl!==source.url&&parseCitedRetailerListing({title:associationCitation.title,content:listingContent,sourceUrl:associationUrl},identity);if(retailer){retailers=[retailer];associationSource=coachSources([{url:associationUrl,title:associationCitation.title??'Retailer product listing',retrievedAt}])[0];}
    }
    if(fetched.length===1&&associationCitation&&associationKind==='branch'&&kind==='menu'&&scope.area){
const mcDonaldsBranch=associationCitation?.privateMcDonaldsBranch as VerifiedMcDonaldsBranch|undefined;
if(mcdVerified&&isVerifiedMcDonaldsBranch(mcDonaldsBranch)&&mcDonaldsBranch.source_url===associationUrl&&(!scope.restaurant||plain(publicPlace(scope.restaurant,'restaurant')??'')===plain(mcDonaldsBranch.name))&&scope.area){
  location=mcDonaldsBranch;
  associationSource=coachSources([{url:associationUrl!,title:associationCitation.title??'McDonald\'s branch listing',retrievedAt}])[0];
}else if(associationCitation.public_page_verified===true){
      const chain=parsePublishedRestaurantIdentity(fetched[0].page_content,source.url),requested=scope.restaurant&&publicPlace(scope.restaurant,'restaurant'),restaurant=chain&&publicPlace(chain,'restaurant');const area=publicPlace(scope.area,'area');if(!restaurant)branchFailure='restaurant_identity_unverified';else if(!area)branchFailure='invalid_requested_area';else if(requested&&plain(requested)!==plain(restaurant))branchFailure='requested_merchant_mismatch';if(restaurant&&(!requested||plain(requested)===plain(restaurant))&&area){location=parseRestaurantBranchAssociation(associationCitation.page_content,associationUrl!,{restaurant,area},code=>{branchFailure=code;})??undefined;if(location)associationSource=coachSources([{url:associationUrl,title:associationCitation.title??'Restaurant branch listing',retrievedAt}])[0];}
}else branchFailure='branch_source_unverified';

    }
    if(kind==='menu'&&scope.area&&market&&((!location&&!scope.allowSimilar)||(location&&location.country!==market))){discard(location||branchFailure==='branch_country_unrecognized'?'market':branchFailure.includes('source')?'source':/identity|merchant/.test(branchFailure)?'identity':'locality',location?'branch_country_mismatch':branchFailure);continue;}
    const officialPage=kind==='product'?fetched[0]:null;let locatorUrl:string|null=null;if(officialPage){try{const pageHost=new URL(source.url).hostname,links=Array.isArray(officialPage.page_links)?officialPage.page_links:[];locatorUrl=links.find((link:any)=>{try{const u=new URL(link);return u.protocol==='https:'&&u.hostname===pageHost&&!u.username&&!u.password&&!u.port&&u.href.length<=2000;}catch{return false;}})??null;}catch{}}
    const durations=kind==='retrieved_recipe'?fetched.map((a:any)=>publishedRecipeTotalMinutes(a.page_content,row.name)).filter((v:any)=>v!==null):[];
    const totalMinutes=durations.length&&new Set(durations).size===1?durations[0]:undefined;
    if(totalMinutes!==undefined&&scope.max_minutes!==undefined&&totalMinutes>scope.max_minutes){discard('identity','recipe_total_time_exceeds_request');continue;}
    accepted.push({...(totalMinutes!==undefined?{recipe_total_minutes:totalMinutes}:{}),...(dietaryEvidence?{dietary_evidence:dietaryEvidence}:{}),...(match?{match}:{}),name:row.name.trim(),portion:nutrition?.basis.label??null,calories:nutrition?.fields.calories?.value??null,nutritionStatus:nutrition&&nutrition.itemIntegrity==='complete'?'verified':'unverified',nutrition,areaVerified:!!location,url:source.url,productUrl:officialPage?source.url:null,locatorUrl,quote:evidence,sourceTitle:source.title,market,sourceKind:kind,instructions:kind==='retrieved_recipe'?sourceInstructions(matchedText):[],...((kind==='menu'&&nutrition?.itemAssociation==='menu_item'&&nutrition.itemIntegrity==='complete')?{itemCompleteness:'complete_menu_item'}:{}),...((kind==='product'&&nutrition?.itemAssociation==='packaged_product'&&nutrition.itemIntegrity==='complete')?{itemCompleteness:'complete_product'}:{}),...((kind==='menu'&&(location?.name||discoveryMetadata.restaurant_name?.value))?{restaurantName:location?.name??discoveryMetadata.restaurant_name!.value}:{}),...((selectedVariant||discoveryMetadata.variant?.value)?{variant:selectedVariant??discoveryMetadata.variant!.value}:{}),...(Object.keys(discoveryMetadata).length?{discoveryMetadata}:{}),...(retailers?.length?{retailers}:{}),...(location?{location}:{})});usedSources.push(source);for(const field of Object.values(discoveryMetadata)){if(!field)continue;const citation=sourceRecords.find((a:any)=>a?.url===field.source_url);if(citation)usedSources.push(...coachSources([{url:field.source_url,title:citation.title??'Cited identity evidence',retrievedAt}]));}if(associationSource)usedSources.push(associationSource);
  }
  const seen=new Set<string>();const candidates=accepted.filter(d=>{const key=d.url+'|'+plain(d.name)+'|'+plain(d.variant??'')+'|'+plain(d.portion??'');if(seen.has(key))return false;seen.add(key);return true;});
  const dishes=candidates.filter(d=>d.market&&d.nutrition&&d.nutrition.itemIntegrity==='complete'&&d.nutrition.missing.length===0&&d.sourceKind!=='retrieved_recipe').slice(0,isOfficialRestaurantPlan(message?.official_restaurant_plan)?12:3);
  return {requestedKind:scope.sourceKind,status:dishes.length?'supported':'missing',dishes,candidates,rejectedCandidates,sources:coachSources(usedSources.filter(s=>candidates.some(d=>d.url===s.url||d.retailers?.some(r=>r.source_url===s.url)||d.location?.source_url===s.url))),conflicts:[]};
}
export function evidenceReply(evidence:EvidenceResult,language:string):string{
 const es=language.startsWith('es');const eligible=evidence.dishes.filter(d=>d.market&&d.sourceKind!=='retrieved_recipe'&&d.nutrition&&d.nutrition.missing.length===0&&d.portion&&['calories','protein','carbs','fat','fiber'].every(k=>{const f=d.nutrition!.fields[k as keyof Nutrition['fields']];return f&&Number.isFinite(f.value)&&f.value>=0;}));if(!eligible.length){const kind=evidence.requestedKind??evidence.candidates?.[0]?.sourceKind;return kind==='product'?(es?'No encontré una etiqueta nutricional oficial completa para ese producto. No inventaré macros; Si prefieres menús de restaurantes, responde «restaurantes» y te pediré la ciudad pública antes de preparar una búsqueda que podrás confirmar.':'I could not verify a complete manufacturer nutrition label for a packaged supermarket product. I will not treat restaurant menu items as products or invent macros. If you prefer restaurant menus, reply “restaurants” and I will ask which public city before preparing a search for your confirmation.'):kind==='retrieved_recipe'?(es?'No encontré una receta verificable con cantidades, preparación y rendimiento completos. No inventaré esos datos; puedes cambiar el plato o el sitio.':'I could not verify a recipe with complete quantities, preparation and yield. I will not invent those details; you can change the dish or source.'):(es?'No pude verificar una opción con las fuentes oficiales de cadenas consultadas.':'I could not verify an option using the official chain sources searched.');} return eligible.map(d=>{
  const n=d.nutrition,fields=n?.fields;const values=fields?Object.entries(fields).map(([key,f])=>`${({calories:es?'Energía':'Energy',protein:es?'Proteína':'Protein',carbs:es?'Carbohidratos':'Carbs',fat:es?'Grasa':'Fat',fiber:es?'Fibra':'Fiber'} as Record<string,string>)[key]}: ${f!.value} ${f!.unit}`).join(' · '):'';
  const missing=(!n||!d.portion)?(d.sourceKind==='retrieved_recipe'?(es?'¿Qué cantidades de ingredientes lleva y cuántas porciones rinde?':'What ingredient amounts does it use, and how many servings does it make?'):(es?'¿Qué tamaño o porción quieres de este producto o plato?':'Which size or portion of this product or dish do you want?')):
   n.missing.length?(es?'Faltan estos datos de la porción: ':'These serving values are still missing: ')+n.missing.map(k=>({calories:es?'energía':'energy',protein:es?'proteína':'protein',carbs:es?'carbohidratos':'carbs',fat:es?'grasa':'fat',fiber:es?'fibra':'fiber'} as Record<string,string>)[k]??k).join(', ')+(es?'. ¿Puedes indicar esos valores de la etiqueta o tabla del menú?':'. Can you provide those values from the label or menu table?'):'';
  return [d.name,d.portion,values,missing].filter(Boolean).join('\n');
 }).join('\n\n');
}


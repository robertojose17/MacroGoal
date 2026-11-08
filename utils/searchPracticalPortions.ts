import { resolveCatalogUsdaPortions } from './catalogUsdaPortions';
import { selectedNutritionScope, selectedNutritionScopeIsCurrent } from './usdaSelectionPersistence';
import { buildResultItem, type SearchResultItem } from './foodSearchUtils';
import { preferredUsdaPortion } from './preferredUsdaPortion';
import { searchSelectionNeedsConfirmation } from './searchSelectionSafety';
const name=(v:unknown)=>typeof v==='string'?v.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' '):'';
/** One settled generic result, never one request per result or keystroke.
 * The original search completes first. This optional display enrichment does not
 * alter nutrition values, ranking, saved entries or a separately opened editor. */
export function scheduleSearchPracticalPortion(rows:Map<string,SearchResultItem>,signal:AbortSignal,isCurrent:()=>boolean,setRows:(update:(previous:SearchResultItem[])=>SearchResultItem[])=>void):void{
 if(signal.aborted||!isCurrent())return;
 const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);void hydrate().catch(()=>{});},600);
 const cancel=()=>clearTimeout(timer);signal.addEventListener('abort',cancel,{once:true});
 async function hydrate(){
  if(signal.aborted||!isCurrent())return;
  const owner=await selectedNutritionScope();if(!owner||signal.aborted||!isCurrent())return;
  const entry=[...rows.entries()].find(([,item])=>{
   const p=item.product;
   return !!p._db_id&&!p._manual_food_id&&p._serving_authority!=='confirmed_correction'&&!name(p.brands)&&!searchSelectionNeedsConfirmation(p)&&!preferredUsdaPortion(p,'view')&&name(p.product_name||p.generic_name);
  });
  if(!entry)return;
  const [key,original]=entry;const product=original.product;
  const description=name(product.product_name||product.generic_name);
  const evidence=await resolveCatalogUsdaPortions(product._db_id);
  if(!evidence||signal.aborted||!isCurrent())return;
  const currentOwner=await selectedNutritionScope();
  if(currentOwner?.userId!==owner.userId||currentOwner.epoch!==owner.epoch||signal.aborted||!isCurrent()||rows.get(key)!==original||original.product!==product||name(product.product_name||product.generic_name)!==description||name(evidence.foodDescription)!==description||evidence.foodItemId!==product._db_id)return;
  const hydrated={...product,_usda_fdc_id:evidence.fdcId,_portion_evidence:evidence.portionEvidence};
  if(!preferredUsdaPortion(hydrated,'view'))return;
  const replacement=buildResultItem(hydrated,original.source);
  if(replacement.requiresConfirmation||!replacement.hasNutrition)return;
  rows.set(key,replacement);
  setRows(previous=>signal.aborted||!isCurrent()||!selectedNutritionScopeIsCurrent(owner)?previous:previous.map(item=>item===original?replacement:item));
 }
}

export const NUTRIENTS = ['calories','protein','carbs','fat','fiber'] as const;
export type Nutrient = typeof NUTRIENTS[number];
export type Fact = {value:number;unit:'kcal'|'g';source:{provider:string;id:string;url:string;field:string;retrievedAt:string};method:'reported'|'calculated';inputs?:Fact[]};
export type ItemIntegrity='complete'|'component'|'unknown';
export type IntegrityAssociation='menu_item'|'packaged_product'|'recipe'|'food'|'unknown';
export type Nutrition = {preparation?:'raw'|'cooked'|'as_sold'|'not_applicable';itemAssociation?:'packaged_product'|'menu_item'|'component'|'unknown';itemIntegrity?:ItemIntegrity;identity:string;basis:{amount:number;unit:'g'|'ml'|'serving';label:string};fields:Partial<Record<Nutrient,Fact>>;missing:string[]};
import { allowedEvidenceURL } from './coach-source-pages.ts';
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const norm=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const unit=(key:Nutrient):'kcal'|'g'=>key==='calories'?'kcal':'g';
const componentSectionPattern=/\b(?:components?|ingredients?|toppings?|sauces?|side items?)\b/i;
const componentServingPattern=/\b(?:\d+(?:\/\d+)?|one|single)\s+(?:crust|topping|sauce|side|dough|base|ingredient)\b/i;
const itemWords=(s:string)=>norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const canonicalFoodCategories=['ice cream','pizza','lasagna','burger','sandwich','salad','soup','taco','tacos','burrito','wrap','pasta','bowl','casserole','pie','cake','bread','omelet','omelette'];
/** Resolve only a known whole-food category at the end of a user query.
 * Leading descriptors such as "frozen" or "macro-friendly" stay in the search
 * query, while component queries such as "pizza sauce" do not become pizza. */
export function foodCategory(foodType:string|undefined):string|undefined {
 if(typeof foodType!=='string')return;
 const words=itemWords(foodType.replace(/^(?:healthy|saludable)\s+/i,''));
 for(const category of [...canonicalFoodCategories].sort((a,b)=>itemWords(b).length-itemWords(a).length)){
  const suffix=itemWords(category);
  if(suffix.length<=words.length&&suffix.every((word,i)=>words[words.length-suffix.length+i]===word||words[words.length-suffix.length+i]===word+'s'))return category;
 }
 return;
}
/** Conservative whole-item proof shared by every nutrition representation. */
export function classifyItemIntegrity(name:string,serving:string,context:string,foodType?:string,association:IntegrityAssociation='unknown'):ItemIntegrity{
 const section=norm(context);if(componentSectionPattern.test(section))return 'component';
 const core=norm(name).split(/\s+(?:[-–—])\s+/)[0].replace(/\s*\([^)]*\)\s*$/,'').trim();
 const title=itemWords(core);if(!title.length)return 'unknown';
 const componentTokens=new Set(['crust','topping','toppings','sauce','sauces','dough','base','ingredient','ingredients','side']);
 const componentPositions=title.flatMap((word,index)=>componentTokens.has(word)?[index]:[]);
 if(componentServingPattern.test(serving))return 'component';
 const resolved=foodCategory(foodType),hasRequestedFood=typeof foodType==='string'&&foodType.trim().length>0;const expected=itemWords(resolved??(hasRequestedFood?foodType:''));const category=expected.length?expected:hasRequestedFood?[]:[...canonicalFoodCategories].sort((x,y)=>y.length-x.length).flatMap(t=>{const w=itemWords(t);return w.length<=title.length&&w.every((word,i)=>title[title.length-w.length+i]===word||title[title.length-w.length+i]===word+'s')?[w]:[];})[0]??[];
 if(!category.length)return componentPositions.length?'component':'unknown';
 const lastIndex=title.length-category.length;const categoryAtEnd=lastIndex>=0&&category.every((word,i)=>title[lastIndex+i]===word||title[lastIndex+i]===word+'s'||(word.endsWith('s')&&title[lastIndex+i]===word.slice(0,-1)));
 if(componentPositions.some(index=>index>=Math.max(0,lastIndex)))return 'component';
 if(!categoryAtEnd)return componentPositions.length?'component':'unknown';
 if(!['menu_item','packaged_product','recipe','food'].includes(association))return 'unknown';
 if(association==='menu_item'){const sectionWords=itemWords(section);const sectionBindsCategory=category.every(word=>sectionWords.includes(word)||sectionWords.includes(word+'s'));if(!sectionBindsCategory)return 'unknown';}
 return 'complete';
}
/** Raw USDA food details/search nutrient amounts are per100g. Never re-scale branded rows by servingSize here. */
export function usdaNutrition(food:any,retrievedAt:string):Nutrition|null{
 if(!Number.isSafeInteger(food?.fdcId)||food.fdcId<=0||typeof food.description!=='string')return null;
 const ids:Record<Nutrient,number>={calories:1008,protein:1003,carbs:1005,fat:1004,fiber:1079};const fields:Nutrition['fields']={};
 for(const key of NUTRIENTS){const rows=(Array.isArray(food.foodNutrients)?food.foodNutrients:[]).filter((n:any)=>(n.nutrient?.id??n.nutrientId)===ids[key]&&String(n.nutrient?.unitName??n.unitName).toLowerCase()===unit(key));const values=rows.map((n:any)=>n.amount??n.value).filter(number);if(values.length&&values.every((v:number)=>v===values[0]))fields[key]={value:values[0],unit:unit(key),method:'reported',source:{provider:'USDA FoodData Central',id:String(food.fdcId),url:`https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`,field:`foodNutrients.${ids[key]}`,retrievedAt}};}
 const preparation=food.dataType==='Branded'?'as_sold':/\braw\b/i.test(food.description)?'raw':/\bcooked\b/i.test(food.description)?'cooked':/^(?:cheese|butter|margarine|flour|sugar|honey|salt|spices?|seasonings?|dried herbs?|oil|(?:olive|vegetable|canola|corn|soybean|sunflower|peanut|coconut) oil)(?:\s*,|\s*[-–—]\s*|$)/i.test(food.description.trim())?'not_applicable':undefined;
 return {preparation,itemIntegrity:classifyItemIntegrity(food.description,'100 g','','','food'),identity:food.description,basis:{amount:100,unit:'g',label:'100 g'},fields,missing:NUTRIENTS.filter(k=>!fields[k])};
}
/** Caller must select the exact barcode; a name search alone is not product identity. */
export function offNutrition(product:any,barcode:string,retrievedAt:string,selection?:{productName:string;marketTag:string;brand:string}):Nutrition|null{
 if(!/^\d{8,14}$/.test(barcode)||product?.code!==barcode||typeof product.product_name!=='string'||!['100g','100ml'].includes(product.nutrition_data_per))return null;
 if(selection&&(norm(product.product_name)!==norm(selection.productName)||!Array.isArray(product.countries_tags)||!product.countries_tags.includes(selection.marketTag)||typeof product.brands!=='string'||norm(product.brands)!==norm(selection.brand)))return null;
 const names:Record<Nutrient,string>={calories:'energy-kcal',protein:'proteins',carbs:'carbohydrates',fat:'fat',fiber:'fiber'};const fields:Nutrition['fields']={};
 for(const key of NUTRIENTS){const field=names[key]+'_100g',value=product.nutriments?.[field];if(number(value)&&!product.nutriments?.[names[key]+'_modifier'])fields[key]={value,unit:unit(key),method:'reported',source:{provider:'Open Food Facts label transcription',id:barcode,url:`https://world.openfoodfacts.org/product/${barcode}`,field:'nutriments.'+field,retrievedAt}};}
 return {preparation:'as_sold',itemAssociation:'packaged_product',identity:product.product_name,basis:{amount:100,unit:product.nutrition_data_per==='100ml'?'ml':'g',label:product.nutrition_data_per==='100ml'?'100 ml':'100 g'},fields,missing:[...NUTRIENTS.filter(k=>!fields[k]),...(!selection?['product_variant_market']:[])]};
}

/** Conservative exact-row parser. Accepts labelled official-source tables, never model-supplied nutrition or unrelated numbers. */
export function officialTableNutrition(content:string,name:string,url:string,retrievedAt:string,foodType?:string):Nutrition|null{
 let u:URL;try{const safe=nutritionSourceURL(url);if(!safe)return null;u=new URL(safe);}catch{return null;}
 const lines=content.split(/\r?\n/),cells=(line:string)=>line.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());const found:Nutrition[]=[];
 let enclosingSection='';for(let i=0;i<lines.length;i++){const heading=/^\s*#{1,6}\s+(.+?)\s*$/.exec(lines[i]);if(heading){enclosingSection=norm(heading[1]);continue;}if(!lines[i].includes('|'))continue;const headers=cells(lines[i]).map(norm),item=headers.findIndex(x=>['item','dish','product','menu item','plato','producto'].includes(x)),portion=headers.findIndex(x=>['serving','portion','porción','porcion','serving size'].includes(x));if(item<0||portion<0)continue;
 const columns:Partial<Record<Nutrient,number>>={};for(const key of NUTRIENTS){const patterns:Record<Nutrient,RegExp>={calories:/^(calories|calories \(kcal\)|energy \(kcal\)|energía \(kcal\))$/,protein:/^(protein|proteína) \(g\)$/,carbs:/^(carbohydrates|carbs|carbohidratos) \(g\)$/,fat:/^(fat|grasa) \(g\)$/,fiber:/^(fiber|fibra) \(g\)$/};const n=headers.findIndex(x=>patterns[key].test(x));if(n>=0)columns[key]=n;}
 for(let j=i+1;j<lines.length&&lines[j].includes('|');j++){const row=cells(lines[j]);if(norm(row[item]??'')!==norm(name)||!row[portion]||row[portion].length>100)continue;const itemIntegrity=classifyItemIntegrity(name,row[portion],enclosingSection,foodType,['dish','menu item','plato'].includes(headers[item])?'menu_item':['product','producto'].includes(headers[item])?'packaged_product':'unknown');if(itemIntegrity==='component')continue;const fields:Nutrition['fields']={};for(const key of NUTRIENTS){const col=columns[key],v=col===undefined?'':row[col];if(v!==undefined&&/^\d+(?:\.\d+)?$/.test(v))fields[key]={value:Number(v),unit:unit(key),method:'reported',source:{provider:'Official menu/label table',id:name,url:u.href,field:`row:${j+1};column:${headers[col!]};portion:${row[portion]}`,retrievedAt}};}if(fields.calories&&Object.values(fields).every(f=>number(f!.value)))found.push({itemAssociation:['dish','menu item','plato'].includes(headers[item])?'menu_item':['product','producto'].includes(headers[item])?'packaged_product':'unknown',itemIntegrity,identity:name,basis:{amount:1,unit:'serving',label:row[portion]},fields,missing:NUTRIENTS.filter(k=>!fields[k])});}
 }
 if(found.length!==1)return null;return found[0];
}


const makeFact=(key:Nutrient,value:number,url:string,id:string,field:string,retrievedAt:string):Fact=>({value,unit:unit(key),method:'reported',source:{provider:'Official manufacturer product label',id,url,field,retrievedAt}});
const productHost=(url:string):URL|null=>{try{const safe=allowedEvidenceURL(url);return safe?new URL(safe):null;}catch{return null;}};
// Fetchable association pages are not authoritative nutrition sources.
const METADATA_ONLY_HOSTS=new Set(['target.com','www.target.com','locations.papajohns.com']);
const nutritionSourceURL=(url:string):string|null=>{const safe=allowedEvidenceURL(url);if(!safe)return null;try{return METADATA_ONLY_HOSTS.has(new URL(safe).hostname)?null:safe;}catch{return null;}};
const identityWords=(s:string)=>norm(s).replace(/\[\[(?:TH|TD):\d+:\d+\]\]/gi,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const exactFoodName=(candidate:string,identity:string)=>{const c=identityWords(candidate),i=identityWords(identity);return !!c&&c===i;};
const containsFoodName=(candidate:string,identity:string)=>{const c=identityWords(candidate).split(' ').filter(Boolean),i=new Set(identityWords(identity).split(' ').filter(Boolean));return !!c.length&&c.every(w=>i.has(w));};
function jsonObjects(text:string):Array<{start:number;end:number;value:any}>{const out=[];let start=-1,depth=0,inString=false,escape=false;for(let i=0;i<text.length;i++){const c=text[i];if(depth===0){if(c==='{'){start=i;depth=1;inString=false;escape=false;}continue;}if(inString){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')inString=false;continue;}if(c==='"'){inString=true;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0){try{out.push({start,end:i+1,value:JSON.parse(text.slice(start,i+1))});}catch{}if(out.length>=30)break;}}return out;}
function labeledJsonNutrition(content:string,name:string,url:string,retrievedAt:string,foodType?:string):Nutrition|null{
 const objects=jsonObjects(content).filter(x=>Array.isArray(x.value?.NutrientDetails)&&x.value?.MetricServingSize?.Code==='GRM'&&number(x.value.MetricServingSize.Value)&&x.value.MetricServingSize.Value>0&&typeof x.value.ServingSizeDescription==='string');
 const panelName=(start:number)=>{const from=Math.max(0,start-5000),before=content.slice(from,start),hits=[...before.matchAll(/PName:\s*([^\r\n]+)/gi)],last=hits.at(-1);return last&&start-(from+(last.index??0))<=2000?last[1].replace(/<[^>]*>/g,' ').trim():undefined;};
 const matches=objects.filter(x=>{const product=panelName(x.start);return !!product&&containsFoodName(name,product);});if(matches.length!==1)return null;
 const {value:v}=matches[0],product=panelName(matches[0].start)??name,byCode:Record<string,Nutrient>={'ENER-':'calories','PRO-':'protein','CHO-':'carbs','FAT':'fat','FIBTSW':'fiber'},fields:Nutrition['fields']={};
 for(const row of v.NutrientDetails){const key=byCode[row?.NutrientTypeCode];if(!key)continue;const q=row?.QuantityContained,expected=key==='calories'?'E14':'GRM';if(!number(q?.Value)||q.Value<0||q.Code!==expected||fields[key])return null;fields[key]=makeFact(key,q.Value,url,product,'NutrientDetails.'+row.NutrientTypeCode+'.QuantityContained',retrievedAt);}
 if(!fields.calories)return null;const sectionContext=[...content.slice(0,matches[0].start).matchAll(/^\s*#{1,6}\s+(.+?)\s*$/gm)].at(-1)?.[1]??'';return {preparation:'as_sold',itemAssociation:'packaged_product',itemIntegrity:classifyItemIntegrity(product,v.ServingSizeDescription.trim(),sectionContext,foodType,'packaged_product'),identity:product,basis:{amount:v.MetricServingSize.Value,unit:'g',label:v.ServingSizeDescription.trim()},fields,missing:NUTRIENTS.filter(k=>!fields[k])};
}
/** Menu-specific adapter; excludes Product panels and Recipe schema from whole menu-item certification. */
export function officialMenuNutrition(content:string,name:string,url:string,retrievedAt:string,foodType?:string,variant?:string):Nutrition|null{
 const nutritionUrl=nutritionSourceURL(url),safe=nutritionUrl?productHost(nutritionUrl):null;if(!safe||typeof content!=='string'||content.length>512*1024)return null;
 if(contradictoryMenuPortion(content,name,variant))return null;
 const structured=schemaNutrition(content,name,safe.href,retrievedAt,['MenuItem'],foodType);if(structured)return structured;
 const lines=content.split(/\r?\n/),headings=lines.map((line,index)=>{const m=/^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());return m?{index,level:m[1].length,text:m[2].trim()}:null;}).filter((x):x is {index:number;level:number;text:string}=>!!x),titles=headings.filter(h=>exactFoodName(name,h.text));if(titles.length>1)return null;if(titles.length===1){const title=titles[0],end=headings.find(h=>h.index>title.index&&h.level<=title.level&&!subsectionHeading(h.text))?.index??lines.length,selected=tableNutrition(lines,title,end,variant,safe.href,retrievedAt,foodType,'menu_item');if(selected)return selected;}
 return officialTableNutrition(content,name,safe.href,retrievedAt,foodType);
}

/** Brand-independent official nutrition adapter for approved publisher hosts. Product microdata supplies identity only; nutrition is accepted from MenuItem/Recipe schema or a title- and serving-bound HTML panel. */
function schemaNutrition(content:string,name:string,url:string,retrievedAt:string,acceptedTypes:('MenuItem'|'Recipe')[]=['MenuItem','Recipe'],foodType?:string):Nutrition|null{
 const objects=jsonObjects(content),matches:any[]=[];
 const getTypes=(x:any):string[]=>Array.isArray(x?.['@type'])?x['@type']:typeof x?.['@type']==='string'?[x['@type']]:[];
 for(const entry of objects){const v=entry.value;const visit=(x:any)=>{if(!x||typeof x!=='object')return;if(Array.isArray(x)){for(const y of x)visit(y);return;}const types=getTypes(x);if(types.some(t=>/^Product$/i.test(t)))return;if(types.some(t=>acceptedTypes.some(allowed=>allowed.toLowerCase()===t.toLowerCase()))&&exactFoodName(name,String(x.name??''))&&x.nutrition&&typeof x.nutrition==='object')matches.push({schema:x,start:entry.start});for(const [k,y] of Object.entries(x))if(k==='@graph'||k==='mainEntity'||k==='hasMenuItem'||k==='mainEntityOfPage')visit(y);};visit(v);}
 if(matches.length!==1)return null;const match=matches[0],v=match.schema,n=v.nutrition,serving=typeof n.servingSize==='string'?n.servingSize.trim():'';if(!serving||serving.length>100)return null;
 const props:Record<Nutrient,string>={calories:'calories',protein:'proteinContent',carbs:'carbohydrateContent',fat:'fatContent',fiber:'fiberContent'},fields:Nutrition['fields']={};
 for(const key of NUTRIENTS){const raw=n[props[key]];if(raw===undefined)continue;const text=typeof raw==='string'?raw:typeof raw==='number'?String(raw):'';const re=key==='calories'?/^(\d+(?:\.\d+)?)\s*(?:kcal|calories?)?$/i:/^(\d+(?:\.\d+)?)\s*(?:g|grams?)$/i;const m=re.exec(text.trim());if(!m)return null;fields[key]=makeFact(key,Number(m[1]),url,String(v.name),'schema:'+props[key],retrievedAt);}
 if(!fields.calories)return null;const grams=/\((\d+(?:\.\d+)?)\s*g\)/i.exec(serving);return {preparation:'as_sold',itemAssociation:(getTypes(v).some(t=>/^MenuItem$/i.test(t))?'menu_item':'unknown'),itemIntegrity:classifyItemIntegrity(String(v.name),serving,[...content.slice(0,match.start).matchAll(/^\s*#{1,6}\s+(.+?)\s*$/gm)].at(-1)?.[1]+' '+String(v.menuSection??v.recipeCategory??''),foodType,getTypes(v).some(t=>/^MenuItem$/i.test(t))?'menu_item':getTypes(v).some(t=>/^Recipe$/i.test(t))?'recipe':'unknown'),identity:String(v.name),basis:grams?{amount:Number(grams[1]),unit:'g',label:serving}:{amount:1,unit:'serving',label:serving},fields,missing:NUTRIENTS.filter(k=>!fields[k])};
}
const nutritionHeading=(text:string)=>/^(?:nutrition(?: facts| information| info| label)?|nutritional(?: facts| information| info| values| label)?)$/i.test(text.trim());
const specificNutritionPanels=(items:{index:number;level:number;text?:string}[])=>{if(items.length<=1)return items;const detailed=items.filter(h=>!/^(?:nutrition|nutritional)$/i.test((h.text??'').trim()));return detailed.length===1?detailed:[];};
const subsectionHeading=(text:string)=>/^(?:serving size|nutrition|nutrition facts|nutrition information|nutritional information|ingredients|allergens|cooking instructions|instructions|directions|method)$/i.test(text.trim());
const productEnd=(headings:{index:number;level:number;text:string}[],title:{index:number;level:number},fallback:number)=>headings.find(h=>h.index>title.index&&h.level<=title.level&&!subsectionHeading(h.text))?.index??fallback;
const servingRows=(lines:string[])=>{const values:string[]=[];for(let i=0;i<lines.length;i++){const line=lines[i].trim(),cells=line.replace(/^\|\s*/, '').split('|').map(x=>x.trim());if(/^serving\s+size\b/i.test(cells[0]??'')){if(cells.length>2){values.push('!ambiguous_variant_columns');continue;}let val=cells.length===2?cells[1]:cells[0].replace(/^serving\s+size\s*(?::\s*)?/i,'').trim();if(!val){for(let j=i+1;j<lines.length&&j<=i+2;j++){const next=lines[j].trim();if(!next||/^[-|]+$/.test(next))continue;if(next.replace(/^\|\s*/,'').split('|').length>1){val='!ambiguous_variant_columns';break;}val=next.replace(/^\|\s*/,'').trim();break;}}if(val)values.push(val);}}return values;};

function nutritionRow(line:string,key:Nutrient):{value:number;field:string}|null{
 const labels:Record<Nutrient,RegExp>={calories:/^(?:total\s+)?calories(?:\s*\(kcal\))?(?=\s*(?:\||\d|[<>~≈]|about\b|approx\b|less\b|more\b|up\s+to\b|$))/i,protein:/^protein(?:\s*\(g\))?(?=\s*(?:\||\d|[<>~≈]|about\b|approx\b|less\b|more\b|up\s+to\b|$))/i,carbs:/^(?:total\s+)?(?:carbohydrate|carbohydrates|carbs)(?:\s*\(g\))?(?=\s*(?:\||\d|[<>~≈]|about\b|approx\b|less\b|more\b|up\s+to\b|$))/i,fat:/^(?:total\s+)?fat(?:\s*\(g\))?(?=\s*(?:\||\d|[<>~≈]|about\b|approx\b|less\b|more\b|up\s+to\b|$))/i,fiber:/^(?:dietary\s+)?fiber(?:\s*\(g\))?(?=\s*(?:\||\d|[<>~≈]|about\b|approx\b|less\b|more\b|up\s+to\b|$))/i};
 // HTML table normalization may leave several empty leading cells before a
 // nutrition label (for example `| | Dietary Fiber 2g | 8%`). Strip only
 // those empty delimiters; retain all nonempty cells for the strict value check.
 const text=line.trim().replace(/^(?:\|\s*)+/,'').replace(/^\[\[(?:TH|TD):\d+:\d+\]\]\s*/i,''),label=labels[key].exec(text);if(!label)return null;const rest=text.slice(label[0].length).trim().replace(/^\|\s*/,''),cells=rest.split('|').map(x=>x.trim()).filter(Boolean);if(!cells.length)return {value:NaN,field:line};
 const first=cells[0];if(/[<>~≈]|\b(?:about|approximately|approx\.?|less than|more than|up to)\b|\d+(?:\.\d+)?\s*[-–]\s*\d/i.test(first))return {value:NaN,field:line};
 const quantity=/\d+(?:\.\d+)?\s*(?:g|grams?|kcal|calories?)/gi,quantities=[...rest.matchAll(quantity)];if(quantities.length>1)return {value:NaN,field:line};
 const valuePattern=key==='calories'?/^(\d+(?:\.\d+)?)\s*(?:(?:kcal|calories?)\b)?(?:\s*(?:\|\s*)?(?:\d+(?:\.\d+)?\s*%\s*(?:DV|daily value)?|\(\s*\d+(?:\.\d+)?\s*%\s*(?:DV|daily value)?\s*\)))?$/i:/^(\d+(?:\.\d+)?)\s*(?:g|grams?)(?:\s*(?:\d+(?:\.\d+)?\s*%\s*(?:DV|daily value)?|\(\s*\d+(?:\.\d+)?\s*%\s*(?:DV|daily value)?\s*\)))?$/i;const m=valuePattern.exec(first);if(!m)return {value:NaN,field:line};
 // Later table cells may carry %DV, but never another grams/calories quantity.
 const extra=cells.slice(1).join(' ');if(quantity.test(extra)||extra.replace(/\b\d+(?:\.\d+)?\s*%\s*(?:DV|daily value)?/gi,'').match(/\d/))return {value:NaN,field:line};return {value:Number(m[1]),field:line};
}

type EvidenceTable={start:number;rows:string[][]};
const MAX_TABLE_COLUMNS=32,MAX_TABLE_ROWS=100;
function expandEvidenceTable(lines:string[],offset:number):EvidenceTable[]{const tables:EvidenceTable[]=[];let i=0;while(i<lines.length){if(!lines[i].includes('|')){i++;continue;}const start=i,raw:string[][]=[];let invalid=false;while(i<lines.length){if(!lines[i].includes('|')){if(!lines[i].trim()&&lines[i+1]?.includes('|')){i++;continue;}break;}if(i-start>=MAX_TABLE_ROWS){invalid=true;while(i<lines.length&&lines[i].includes('|'))i++;break;}const cells=lines[i].split('|').map(x=>x.trim());if(cells[0]==='')cells.shift();if(cells.at(-1)==='')cells.pop();if(cells.length>MAX_TABLE_COLUMNS){invalid=true;i++;continue;}if(!cells.every(x=>/^[-: ]+$/.test(x))){raw.push(cells);}i++;}const carry=new Map<number,{text:string;left:number}>(),grid:string[][]=[];for(const cells of raw){if(invalid)break;const row:string[]=[],nextCarry=new Map<number,{text:string;left:number}>();let col=0;const fillCarry=()=>{while(carry.has(col)){const c=carry.get(col)!;row[col]=c.text;if(c.left>1)nextCarry.set(col,{text:c.text,left:c.left-1});col++;if(col>MAX_TABLE_COLUMNS)invalid=true;}};for(let cell of cells){fillCarry();if(invalid)break;let colspan=1,rowspan=1;const m=/^\[\[(?:TH|TD):(\d+):(\d+)\]\]\s*/i.exec(cell);if(m){colspan=Number(m[1]);rowspan=Number(m[2]);cell=cell.slice(m[0].length).trim();}if(!Number.isSafeInteger(colspan)||!Number.isSafeInteger(rowspan)||colspan<1||rowspan<1||colspan>MAX_TABLE_COLUMNS||rowspan>MAX_TABLE_ROWS||col+colspan>MAX_TABLE_COLUMNS||grid.length+rowspan>MAX_TABLE_ROWS){invalid=true;break;}for(let n=0;n<colspan;n++){row[col]=cell;if(rowspan>1)nextCarry.set(col,{text:cell,left:rowspan-1});col++;}}if(invalid)break;fillCarry();if(invalid)break;carry.clear();for(const [k,v] of nextCarry)carry.set(k,v);grid.push(row);}tables.push({start:offset+start,rows:invalid?[]:grid});}return tables;}
function tableColumn(rows:string[][],variant:string|undefined):number|null{const width=Math.max(0,...rows.map(r=>r.length));if(width<=2)return 1;if(!variant)return null;const terms=identityWords(variant).split(' ').filter(x=>!['pizza','crust','size','for','the','and'].includes(x));if(!terms.length)return null;const headers=rows.filter(r=>/^(?:crust type|crust size|pizza size|size|crust)$/i.test((r[0]??'').trim()));const hits:number[]=[];for(let c=1;c<width;c++){const text=identityWords(headers.map(r=>r[c]??'').join(' '));if(terms.every(t=>text.split(' ').includes(t)))hits.push(c);}return hits.length===1?hits[0]:null;}
/** Reject conflicting explicit claims for this item/column; never infer inches-to-size equivalences. */
function contradictoryMenuPortion(content:string,name:string,variant?:string):boolean{
 const lines=content.split(/\r?\n/),heads=lines.flatMap((line,index)=>{const m=/^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());return m?[{index,level:m[1].length,text:m[2].trim()}]:[];}),titles=heads.filter(h=>exactFoodName(name,h.text));if(titles.length!==1)return false;
 const title=titles[0],end=productEnd(heads,title,lines.length),tables=expandEvidenceTable(lines.slice(title.index+1,end),title.index+1),sizes:string[]=[],grams:number[]=[],counts:number[]=[],diameters:number[]=[],portions=new Map<string,number[]>();
 const size=(text:string)=>{const s=identityWords(text);return ['pizza for one','extra large','small','medium','large'].includes(s)?s:undefined;};
 const addSize=(text:string)=>{const value=size(text);if(value)sizes.push(value);};
 const firstTable=tables[0]?.start??end,description=lines.slice(title.index+1,firstTable).join(' ');
 for(const m of description.matchAll(/\b(?:only available in|available only in|solo disponible en|disponible solo en)\s+(?:size\s+|tama\u00f1o\s+)?(extra large|pizza for one|small|medium|large)\b/gi))addSize(m[1]);
 if(variant){const m=/^(extra large|pizza for one|small|medium|large)\b/i.exec(variant.trim());if(m)addSize(m[1]);}
 for(const table of tables){const col=tableColumn(table.rows,variant);if(col===null)continue;for(const row of table.rows){
  if(/^(?:pizza size|crust size|size)$/i.test(row[0]??'')){const value=row[col]??'';addSize(value);const inches=/^(\d+(?:\.\d+)?)\s*(?:"|inches?|in\.?)$/i.exec(value.trim());if(inches)diameters.push(Number(inches[1]));}
  if(!/^serving size$/i.test(row[0]??''))continue;const serving=row[col]??'';
  for(const m of serving.matchAll(/\b(\d+(?:\.\d+)?)\s*g\b/gi))grams.push(Number(m[1]));
  for(const m of serving.matchAll(/\b(\d+)\s+(?:slices?|servings?)\s+per\s+pizza\b/gi))counts.push(Number(m[1]));
  const portion=/^(\d+(?:\.\d+)?)\s+(slices?|servings?|pieces?)\b/i.exec(serving.trim());if(portion){const unit=portion[2].toLowerCase().replace(/s$/,'');portions.set(unit,[...(portions.get(unit)??[]),Number(portion[1])]);}
 }}
 return new Set(sizes).size>1||new Set(grams).size>1||new Set(counts).size>1||new Set(diameters).size>1||[...portions.values()].some(values=>new Set(values).size>1);
}
function tableNutrition(lines:string[],title:{index:number;level:number;text:string},end:number,variant:string|undefined,url:string,retrievedAt:string,foodType?:string,association:'menu_item'|'packaged_product'='packaged_product'):Nutrition|null{
 const headings=lines.map((line,index)=>{const m=/^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());return m?{index,level:m[1].length,text:m[2].trim()}:null;}).filter((x):x is {index:number;level:number;text:string}=>!!x);
 const panel=headings.filter(h=>h.index>title.index&&h.index<end&&nutritionHeading(h.text));if(panel.length!==1)return null;const panelIndex=panel[0].index;
 const sectionHead=headings.find(h=>h.index>panelIndex&&h.index<end)?.index??end;const tables=expandEvidenceTable(lines.slice(title.index+1,end),title.index+1);
 const servingTables=tables.filter(t=>t.start<panelIndex&&t.rows.some(r=>/^serving size$/i.test((r[0]??'').trim())));const nutritionTables=tables.filter(t=>t.start>panelIndex&&t.rows.some(r=>nutritionRow(r[0]+' '+(r[1]??''),'calories')!==null||nutritionRow(r[0]+' '+(r[1]??''),'protein')!==null));if(servingTables.length<1||nutritionTables.length<1)return null;
 const st=servingTables.at(-1)!,nt=nutritionTables[0],sc=tableColumn(st.rows,variant),nc=tableColumn(nt.rows,variant);if(sc===null||nc===null||sc!==nc)return null;const servingRow=st.rows.filter(r=>/^serving size$/i.test((r[0]??'').trim()));if(servingRow.length!==1||!servingRow[0][sc])return null;const serving=servingRow[0][sc].replace(/\s+/g,' ').trim();if(!serving||serving.length>100)return null;
 const fields:Nutrition['fields']={};for(const key of NUTRIENTS){const rows=nt.rows.filter(r=>nutritionRow(r[0]+' '+(r[nc]??''),key)!==null);if(rows.length>1)return null;if(rows.length===1){const parsed=nutritionRow(rows[0][0]+' '+(rows[0][nc]??''),key)!;if(!Number.isFinite(parsed.value)||parsed.value<0)return null;fields[key]=makeFact(key,parsed.value,url,title.text,'table:'+parsed.field,retrievedAt);}}
 if(!fields.calories)return null;const grams=/(\((\d+(?:\.\d+)?)\s*g\))/i.exec(serving);const pageContext=headings.filter(h=>h.index<title.index).at(-1)?.text??'';return {preparation:'as_sold',itemAssociation:association,itemIntegrity:classifyItemIntegrity(title.text,serving,pageContext+' '+title.text,foodType,association),identity:title.text,basis:grams?{amount:Number(grams[2]),unit:'g',label:serving}:{amount:1,unit:'serving',label:serving},fields,missing:NUTRIENTS.filter(k=>!fields[k])};
}
function hasAmbiguousMenuVariantTable(lines:string[],title:{index:number;level:number;text:string},end:number):boolean{const tables=expandEvidenceTable(lines.slice(title.index+1,end),title.index+1);return tables.some(t=>Math.max(0,...t.rows.map(r=>r.length))>2&&t.rows.some(r=>/^(?:crust type|pizza size)$/i.test((r[0]??'').trim())));}
/** Extract a small, ordered set of exact variant identities from a publisher's matched menu table. */
export function officialMenuNutritionOptions(content:string,name:string,url:string,retrievedAt:string,foodType?:string,maxOptions=3):Array<{variant?:string;nutrition:Nutrition}>{
 const nutritionUrl=nutritionSourceURL(url),safe=nutritionUrl?productHost(nutritionUrl):null;if(!safe||typeof content!=='string'||content.length>512*1024||!Number.isInteger(maxOptions)||maxOptions<1||maxOptions>3)return [];
 // Per-column checks below preserve unambiguous variants on multi-column pages.
 if(contradictoryMenuPortion(content,name))return [];
 const structured=schemaNutrition(content,name,safe.href,retrievedAt,['MenuItem'],foodType);if(structured)return [{nutrition:structured}];
 const lines=content.split(/\r?\n/),headings=lines.map((line,index)=>{const m=/^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());return m?{index,level:m[1].length,text:m[2].trim()}:null;}).filter((x):x is {index:number;level:number;text:string}=>!!x),titles=headings.filter(h=>exactFoodName(name,h.text));if(titles.length!==1)return [];
 const title=titles[0],end=headings.find(h=>h.index>title.index&&h.level<=title.level&&!subsectionHeading(h.text))?.index??lines.length,block=lines.slice(title.index+1,end),tables=expandEvidenceTable(block,title.index+1),servingTables=tables.filter(t=>t.rows.some(r=>/^serving size$/i.test((r[0]??'').trim())));if(servingTables.length!==1)return [];
 const st=servingTables[0],crust=st.rows.find(r=>/^crust type$/i.test((r[0]??'').trim())),size=st.rows.find(r=>/^pizza size$/i.test((r[0]??'').trim()));if(!crust||!size)return [{nutrition:officialMenuNutrition(content,name,url,retrievedAt,foodType) as Nutrition}].filter(x=>!!x.nutrition);
 const sizes=new Set(['pizza for one','small','medium','large','extra large']),crusts=new Set(['original crust','epic stuffed crust','thin crust','gluten free']);const variants:string[]=[];for(let c=1;c<Math.min(crust.length,size.length,MAX_TABLE_COLUMNS);c++){const crustName=(crust[c]??'').trim(),sizeName=(size[c]??'').trim();if(!sizes.has(identityWords(sizeName))||!crusts.has(identityWords(crustName)))continue;const variant=sizeName+' '+crustName;if(!variants.some(v=>identityWords(v)===identityWords(variant)))variants.push(variant);}
 const options: Array<{variant?:string;nutrition:Nutrition}>=[];for(const variant of variants.slice(0,maxOptions)){const nutrition=officialMenuNutrition(content,name,url,retrievedAt,foodType,variant);if(nutrition)options.push({variant,nutrition});}return options;
}

/** Red Baron product page adapter: exact product URL, title, one nutrition accordion, one serving, five exact values. */
function redBaronProductNutrition(content:string,name:string,url:string,retrievedAt:string,variant?:string,foodType?:string):Nutrition|null{
 let u:URL;try{const safe=allowedEvidenceURL(url);if(!safe)return null;u=new URL(safe);if(u.hostname!=='www.redbaron.com'||decodeURIComponent(u.pathname).toLowerCase()!=='/products/red-baron®-classic-crust-supreme-pizza'||u.search||u.hash)return null;}catch{return null;}
 if(typeof content!=='string'||content.length>512*1024||identityWords(name)!=='red baron classic crust supreme pizza'||identityWords(variant??'')!=='classic crust supreme')return null;
 const htmlText=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&reg;|&#174;/gi,'®').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();
 const titles=[...content.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>htmlText(m[1]));if(titles.length!==1||identityWords(titles[0])!=='red baron classic crust supreme pizza'||identityWords(titles[0])!==identityWords(name))return null;
 const structure=content.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,m=>' '.repeat(m.length)),tags=[...structure.matchAll(/<div\b[^>]*>|<\/div\s*>/gi)],blocks:string[]=[];
 for(let i=0;i<tags.length;i++){const token=tags[i][0];if(!/^<div\b/i.test(token))continue;const cls=/\bclass\s*=\s*(["'])(.*?)\1/i.exec(token)?.[2]??'';if(!/(?:^|\s)accordion-item(?:\s|$)/i.test(cls)||!/(?:^|\s)nutrition(?:\s|$)/i.test(cls))continue;let depth=1,j=i+1;for(;j<tags.length;j++){if(/^<div\b/i.test(tags[j][0]))depth++;else if(--depth===0)break;}if(depth===0)blocks.push(content.slice(tags[i].index!,tags[j].index!+tags[j][0].length));}
 if(blocks.length!==1)return null;const panel=blocks[0],plainPanel=htmlText(panel),servings=[...plainPanel.matchAll(/\bServing\s+Size\s+(\d+(?:\.\d+)?)\s*g\b/gi)];if(servings.length!==1)return null;const grams=Number(servings[0][1]);if(!Number.isFinite(grams)||grams<=0||grams>10000)return null;
 const rowHtml=[...panel.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>m[1].replace(/<span\b[^>]*style\s*=\s*(["'])[^"']*position\s*:\s*absolute[^"']*\1[^>]*>[\s\S]*?<\/span>/gi,' '));
 const rows=rowHtml.map(htmlText);const extract=(label:RegExp,unitPattern:string):{value:number;field:string}|null=>{const found=rows.flatMap((row,index)=>{const m=label.exec(row);if(!m)return [];const match=new RegExp('^'+label.source+'\\s+(\\d+(?:\\.\\d+)?)\\s*'+unitPattern+'(?:\\s+\\d+(?:\\.\\d+)?%?(?:\\s+daily value)?)?$','i').exec(row);return match?[{value:Number(match[1]),field:`nutrition accordion li[${index+1}]: ${row}`}]:[{value:NaN,field:row}];});if(found.length!==1||!Number.isFinite(found[0].value)||found[0].value<0)return null;return found[0];};
 const values={calories:extract(/^Calories\b/i,'(?:kcal|calories?)?'),fat:extract(/^Total Fat\b/i,'g'),carbs:extract(/^Total Carbohydrate\b/i,'g'),fiber:extract(/^Dietary Fiber\b/i,'g'),protein:extract(/^Protein\b/i,'g')};if(Object.values(values).some(v=>!v))return null;
 const fields:Nutrition['fields']={};for(const key of NUTRIENTS){const fact=values[key]!,provider='Official manufacturer product label';fields[key]={value:fact.value,unit:unit(key),method:'reported',source:{provider,id:'Red Baron Classic Crust Supreme Pizza',url:u.href,field:`${fact.field}; Serving Size ${grams} g`,retrievedAt}};}
 const basis={amount:grams,unit:'g' as const,label:`${grams} g serving`},itemIntegrity=classifyItemIntegrity(titles[0],basis.label,'',foodType??'pizza','packaged_product');if(itemIntegrity!=='complete')return null;
 return {preparation:'as_sold',itemAssociation:'packaged_product',itemIntegrity,identity:titles[0],basis,fields,missing:[]};
}

/** Brand-independent adapter. Exact approved source host, exact product/variant title, one serving and one unqualified amount per nutrient are required. */
export function officialProductNutrition(content:string,name:string,url:string,retrievedAt:string,variant?:string,foodType?:string):Nutrition|null{
 const nutritionUrl=nutritionSourceURL(url),u=nutritionUrl?productHost(nutritionUrl):null;if(!u||typeof content!=='string'||content.length>512*1024)return null;
 if(u.hostname==='www.redbaron.com')return redBaronProductNutrition(content,name,u.href,retrievedAt,variant,foodType);
 const vendorShape=labeledJsonNutrition(content,name,u.href,retrievedAt,foodType);if(vendorShape)return vendorShape;const structured=schemaNutrition(content,name,u.href,retrievedAt,['MenuItem','Recipe'],foodType);if(structured)return structured;
 const lines=content.split(/\r?\n/),headings=lines.map((line,index)=>{const m=/^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());return m?{index,level:m[1].length,text:m[2].trim()}:null;}).filter((x):x is {index:number;level:number;text:string}=>!!x);
 const titles=headings.filter(h=>exactFoodName(name,h.text));if(titles.length!==1)return null;const title=titles[0],end=productEnd(headings,title,lines.length),segment=lines.slice(title.index+1,end);if(hasAmbiguousMenuVariantTable(lines,title,end))return null;const tableResult=tableNutrition(lines,title,end,variant,u.href,retrievedAt,foodType);if(tableResult)return tableResult;
 const panels=headings.filter(h=>h.index>title.index&&h.index<end&&nutritionHeading(h.text)).map(h=>({index:h.index,level:h.level,text:h.text}));for(let i=title.index+1;i<end;i++)if(nutritionHeading(lines[i].trim())&&!panels.some(h=>h.index===i))panels.push({index:i,level:6,text:lines[i].trim()});const selectedPanels=specificNutritionPanels(panels);if(selectedPanels.length!==1)return null;
 const panel=selectedPanels[0],sectionEnd=headings.find(h=>h.index>panel.index&&h.index<end)?.index??end,section=lines.slice(panel.index+1,sectionEnd);const servings=servingRows(segment);if(servings.length!==1||servings[0].startsWith('!'))return null;
 const fields:Nutrition['fields']={};for(const key of NUTRIENTS){const found:{value:number;field:string}[]=[];for(let i=0;i<section.length;i++){let parsed=nutritionRow(section[i],key);if(parsed&&Number.isNaN(parsed.value)){for(let j=i+1;j<section.length&&j<=i+3;j++){if(!section[j].trim())continue;const joined=nutritionRow(section[i]+' '+section[j].trim(),key);if(joined){parsed=joined;}break;}}if(parsed)found.push(parsed);}if(found.length>1)return null;if(found.length===1){const row=found[0];if(!Number.isFinite(row.value)||row.value<0)return null;fields[key]=makeFact(key,row.value,u.href,title.text,'nutrition_panel:'+row.field,retrievedAt);}}
 if(!fields.calories)return null;const grams=/(\((\d+(?:\.\d+)?)\s*g\))/i.exec(servings[0]);const pageContext=headings.filter(h=>h.index<title.index).at(-1)?.text??'';return {preparation:'as_sold',itemAssociation:'packaged_product',itemIntegrity:classifyItemIntegrity(title.text,servings[0],pageContext+' '+title.text,foodType,'packaged_product'),identity:title.text,basis:grams?{amount:Number(grams[2]),unit:'g',label:servings[0]}:{amount:1,unit:'serving',label:servings[0]},fields,missing:NUTRIENTS.filter(k=>!fields[k])};
}

export type RecipeIngredient={name:string;grams?:number;food:Nutrition|null;quantityEvidence?:{source:string;field:string};identityConfirmed:boolean;preparation?:'raw'|'cooked'|'as_sold'|'not_applicable'};
/** Explicit ingredient matches and edible grams only. No inferred density, household-unit conversion, yield or missing nutrient zeroes. */
export function recipeNutrition(ingredients:RecipeIngredient[],servings:number|undefined,yieldEvidence?:{source:string;field:string}){
 const missing:string[]=[];if(!number(servings)||servings<=0||!yieldEvidence?.source.trim()||!yieldEvidence?.field.trim())missing.push('recipe_yield');if(!ingredients.length)missing.push('ingredients');
 for(const item of ingredients){if(!item.preparation||item.preparation!==item.food?.preparation)missing.push('ingredient_preparation:'+item.name);if(!item.identityConfirmed||!item.food||item.food.missing.some(k=>!NUTRIENTS.includes(k as Nutrient)))missing.push('ingredient_identity:'+item.name);if(!number(item.grams)||item.grams<=0||!item.quantityEvidence?.source.trim()||!item.quantityEvidence?.field.trim())missing.push('ingredient_grams:'+item.name);if(item.food&&(item.food.basis.unit!=='g'||item.food.basis.amount!==100))missing.push('ingredient_mass_basis:'+item.name);}
 const fields:Nutrition['fields']={};if(!missing.length)for(const key of NUTRIENTS){if(ingredients.some(i=>!i.food!.fields[key])){missing.push('nutrient:'+key);continue;}const inputs=ingredients.map(i=>i.food!.fields[key]!);fields[key]={value:ingredients.reduce((sum,i)=>sum+i.food!.fields[key]!.value*i.grams!/100,0)/servings!,unit:unit(key),method:'calculated',source:{provider:'Deterministic ingredient calculation',id:'recipe',url:yieldEvidence!.source,field:'sum(per100g * edible_grams /100) / explicit_yield',retrievedAt:inputs[0].source.retrievedAt},inputs};}
 return {identity:'Recipe calculation',basis:{amount:1,unit:'serving' as const,label:'1 recipe serving'},fields,missing,assumptions:{servings,yieldEvidence,ingredients:ingredients.map(i=>({name:i.name,grams:i.grams,quantityEvidence:i.quantityEvidence,sourceIdentity:i.food?.identity}))},status:missing.length?'needs_details':'calculated',notRestaurantCertification:true};
}

export function verifiedRecipe(recipe:{name:string;ingredients:RecipeIngredient[];servings?:number;yieldEvidence?:{source:string;field:string};instructions:string[];instructionsComplete:boolean}){
 const nutrition=recipeNutrition(recipe.ingredients,recipe.servings,recipe.yieldEvidence);
 const complete=recipe.instructionsComplete&&recipe.instructions.length>0&&recipe.instructions.every(s=>typeof s==='string'&&s.trim().length>0);const itemIntegrity=classifyItemIntegrity(recipe.name,'1 recipe serving','',undefined,'recipe');
 return {eligible:complete&&nutrition.status==='calculated'&&itemIntegrity==='complete',itemIntegrity,nutrition,missing:[...nutrition.missing,...(!complete?['complete_instructions']:[])],name:recipe.name,instructions:complete?recipe.instructions:[]};
}

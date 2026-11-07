// Audited Target product detail JSON, 2026-11-04. Parse inert JSON only: no script
// execution, hydration evaluation, API key use, hidden API requests or extra hosts.
import {validBarcode} from './recovery-contract.mjs';
import {sameBarcode} from './identity.mjs';
const QUERY='platform/domain-cdui-orchestrations/fetch-cdui-layout-v1';
const CORE='ProductDetailWebDatasourceCore';
const string=x=>typeof x==='string'?x.trim():'';
const text=x=>string(x).replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
const numeric=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const positive=x=>typeof x==='string'&&/^\d+(?:\.\d+)?$/.test(x)&&Number.isFinite(Number(x))&&Number(x)>0;
const unit=x=>string(x).toLowerCase();
export function isTargetOrigin(value) {try {return ['target.com','www.target.com'].includes(new URL(value).hostname);}catch{return false;}}
export function targetProductID(value) {
  try {const u=new URL(value);if(u.protocol!=='https:'||!['target.com','www.target.com'].includes(u.hostname)||u.username||u.password||u.port||u.search||u.hash||u.href.length>2000)return null;
    return /^\/p\/(?:[A-Za-z\d][A-Za-z\d_-]{0,240}\/)?-\/A-(\d{5,12})$/.exec(u.pathname)?.[1]??null;
  }catch{return null;}
}
function attrs(s) {const out=Object.create(null);for(const m of s.matchAll(/\s([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)){const k=m[1].toLowerCase(),v=m[2]??m[3];if(Object.hasOwn(out,k))return null;out[k]=v;}return out;}
function safeImageURL(value) {
  try {const u=new URL(value);return u.protocol==='https:'&&u.hostname==='target.scene7.com'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&/^\/is\/image\/Target\/[A-Za-z\d_-]{1,120}$/.test(u.pathname)?u.href:null;}catch{return null;}
}
function productImages(info) {
  const bound=image=>{const safe=safeImageURL(image?.url);return safe&&typeof image.image_name==='string'&&new URL(safe).pathname==='/is/image/Target/'+image.image_name?safe:null;};
  const primary=bound(info?.primary_image);
  if(!primary||!['//target.scene7.com/is/image/Target/','https://target.scene7.com/is/image/Target/'].includes(info?.base_url))return null;
  const alternate=info.alternate_images??[],labels=info.content_labels??[];
  if(!Array.isArray(alternate)||alternate.length>20||!Array.isArray(labels)||labels.length>32)return null;
  const images=[primary,...alternate.map(bound),...labels.map(row=>safeImageURL(row?.image_url))];
  // Preserve all linked product images: a suggested source-bound label still has
  // to reconcile through the existing label gate, including failed reads.
  return images.every(Boolean)?[...new Set(images)]:null;
}
// Character references are decoded by HTML parsers even inside an ID.
// Recognize them as present, but let strict raw attribute checks reject unsupported
// encoded/malformed hydration instead of allowing a generic JSON-LD fallback.
const numericEntities=value=>value.replace(/&(?:lowbar|UnderBar);/g,'_').replace(/&#(?:x([a-f\d]+)|([\d]+));?/gi,(_m,hex,dec)=>{const code=Number.parseInt(hex??dec,hex?16:10);return Number.isFinite(code)&&code>0&&code<=0x10ffff?String.fromCodePoint(code):'\ufffd';});
const nextDataID=attrs=>/(?:^|\s)id\s*=\s*(?:"__NEXT_DATA__"|'__NEXT_DATA__'|__NEXT_DATA__(?:\s|$))/i.test(numericEntities(attrs));
const cleanHTML=html=>html.replace(/<!--[\s\S]*?-->/g,'');
const nextDataOpenings=html=>[...cleanHTML(html).matchAll(/<script\b([^>]*)>/gi)].filter(m=>nextDataID(m[1]));
export function hasTargetProductData(html) {return typeof html==='string'&&nextDataOpenings(html).length>0;}

function servingPanel(panel) {
  if(!panel||typeof panel!=='object'||Array.isArray(panel)||!positive(panel.serving_size))return null;
  const count=Number(panel.serving_size),u=unit(panel.serving_size_unit_of_measurement),description=string(panel.description);
  if(/[<>~≤≥]|\b(?:about|approx|less|more|prepared|cooked|dry mix|per\s*100)\b/i.test(description))return null;
  // Description and structured serving fields must identify the same count/unit.
  // Grams are literal source evidence, never derived from ounces or another panel.
  const match=/^(\d+(?:\.\d+)?)\s+([A-Za-z][A-Za-z -]{0,30}?)\s*\((\d+(?:\.\d+)?)\s*g(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:oz|fl oz))?\)(?:\s+of\s+Per)?$/i.exec(description);
  if(match&&Number(match[1])===count&&unit(match[2])===u&&Number(match[3])>0&&Number.isFinite(Number(match[3])))return {grams:Number(match[3]),serving:description.replace(/\s+of\s+Per$/i,'')};
  if(['g','grm','gram','grams'].includes(u)&&(!description||description===panel.serving_size+' '+panel.serving_size_unit_of_measurement))return {grams:count,serving:panel.serving_size+' g'};
  return null;
}
function panelNutrition(facts) {
  if(!facts||facts.nutrition_label_type_code!=='LEGACY_FORMAT'||!Array.isArray(facts.value_prepared_list)||facts.value_prepared_list.length<1||facts.value_prepared_list.length>4)return null;
  const bound=[];
  for(const panel of facts.value_prepared_list){
    const serving=servingPanel(panel);
    // Another unexplained gram-bearing panel is ambiguity, not permission to
    // silently discard it and prefer a different column.
    const hasGrams=/\d\s*(?:g|grm|grams?)\b/i.test(string(panel?.description))||['g','grm','gram','grams'].includes(unit(panel?.serving_size_unit_of_measurement));
    if(hasGrams&&!serving)return null;
    if(serving)bound.push({panel,...serving});
  }
  if(bound.length!==1)return null;
  const chosen=bound[0],rows=chosen.panel.nutrients;if(!Array.isArray(rows)||rows.length>60)return null;
  const fields={calories:['Calories','kcal'],proteinContent:['Protein','g'],carbohydrateContent:['Total Carbohydrate','g'],fatContent:['Total Fat','g'],fiberContent:['Dietary Fiber','g']};
  const nutrition={servingSize:chosen.serving};
  for(const [field,[name,expectedUnit]] of Object.entries(fields)){
    const hits=rows.filter(r=>unit(r?.name)===name.toLowerCase());
    if(field==='fiberContent'&&hits.length===0)continue;
    if(hits.length!==1)return null;
    const row=hits[0];
    if(Object.keys(row).some(k=>!['name','percentage','quantity','unit_of_measurement'].includes(k))||!numeric(row.quantity))return null;
    const sourceUnit=unit(row.unit_of_measurement);
    if(expectedUnit==='kcal'?sourceUnit!=='kcal':!['g','grm','gram','grams'].includes(sourceUnit))return null;
    nutrition[field]=String(row.quantity)+' '+expectedUnit;
  }
  return {nutrition,serving:chosen.serving,grams:chosen.grams};
}
export function targetProductRecord(html,url,barcode) {
  const tcin=targetProductID(url);if(!tcin||!validBarcode(barcode)||typeof html!=='string'||html.length>1024*1024)return null;
  // Count raw identifying openings before validating attributes. A malformed,
  // duplicated or unclosed second NEXT_DATA script cannot disappear into fallback.
  if(nextDataOpenings(html).length!==1)return null;
  const scripts=[...cleanHTML(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>nextDataID(m[1])).map(m=>({a:attrs(' '+m[1]),body:m[2]}));
  if(scripts.length!==1||scripts[0].a?.id!=='__NEXT_DATA__'||scripts[0].a?.type!=='application/json'||scripts[0].a.src)return null;
  let root;try{root=JSON.parse(scripts[0].body);}catch{return null;}
  if(root?.page!=='/p/[...subpath]'||!Array.isArray(root.query?.subpath)||root.query.subpath.some(s=>typeof s!=='string')||'/p/'+root.query.subpath.join('/')!==new URL(url).pathname)return null;
  const queries=root.props?.dehydratedState?.queries;if(!Array.isArray(queries)||queries.length>100)return null;
  const matches=queries.filter(q=>Array.isArray(q?.queryKey)&&q.queryKey[0]===QUERY);
  if(matches.length!==1)return null;
  const q=matches[0];if(q.queryKey[1]?.tcin!==tcin||q.queryKey[1]?.page_type!=='pdp'||q.state?.status!=='success')return null;
  const modules=q.state.data?.data?.data_source_modules;if(!Array.isArray(modules)||modules.length>30)return null;
  const cores=modules.filter(m=>m?.module_placement_id===CORE||m?.module_type===CORE);
  if(cores.length!==1)return null;
  const core=cores[0];if(core.module_placement_id!==CORE||core.module_type!==CORE||core.is_enrichment_deferred!==false)return null;
  const product=core.module_data?.data?.product,item=product?.item,enrichment=item?.enrichment;
  if(product?.__typename!=='Product'||product.tcin!==tcin||item?.relationship_type_code!=='SA'||!validBarcode(item.primary_barcode)||!sameBarcode(item.primary_barcode,barcode)||targetProductID(enrichment?.buy_url)!==tcin)return null;
  const name=text(item.product_description?.title),brand=text(item.primary_brand?.name),image=productImages(enrichment?.image_info);
  if(!name||name.length>160||!brand||brand.length>100||/[<>]/.test(name+brand)||!image)return null;
  // Absence of a structured panel must not discard an exact-barcode product's
  // gallery. A present but malformed/unsupported panel is still rejected; OCR
  // is not an escape hatch for contradictory or ambiguous structured evidence.
  const absent=enrichment.nutrition_facts===undefined||enrichment.nutrition_facts===null;
  const panel=absent?null:panelNutrition(enrichment.nutrition_facts);if(!absent&&!panel)return null;
  return {'@type':'Product',name,brand,gtin:item.primary_barcode,image,...(panel?{nutrition:panel.nutrition}:{}),_targetTcin:tcin};
}


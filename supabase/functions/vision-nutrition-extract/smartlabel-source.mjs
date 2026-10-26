// PepsiCo SmartLabel's published single-product HTML and its bound nutrition fragment.
// No script execution, arbitrary links, cross-product joins or inferred GTINs.
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
const one=(s,re)=>{const rows=[...s.matchAll(re)];return rows.length===1?rows[0][1]:null;};
export function smartLabelProduct(html,url) {
  const u=new URL(url);
  if(u.hostname!=='smartlabel.pepsico.info'||!/^\/\d{12,14}-\d+-en-US\/index\.html$/.test(u.pathname))return null;
  const id=one(html,/<input\b[^>]*value="([a-f\d-]{36})"[^>]*id="productId"[^>]*>/gi);
  const name=clean(one(html,/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi));
  const brand=clean(one(html,/<div\b[^>]*class="product-subheader [^"]*"[^>]*>([\s\S]*?)<\/div>/gi));
  const upc=clean(one(html,/<div\b[^>]*class="[^"]*formatted-upc-div[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)).match(/^UPC\s+(\d{12,14})$/)?.[1];
  const net=clean(one(html,/<div\b[^>]*class="[^"]*net-weight-div[^"]*"[^>]*>([\s\S]*?)<\/div>/gi));
  const image=one(html,/<meta\b[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/gi);
  if(!id||!name||!brand||!upc||!image||u.pathname.split('/')[1].split('-')[0]!==upc)return null;
  const headerText=clean(one(html,/<header\b[^>]*>([\s\S]*?)<\/header>/gi)?.replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi,''));
  return {row:{'@type':'Product',name,brand,gtin:upc,image},net,headerText,fragmentURL:new URL(id+'-nutrition.html',u).href};
}
export function smartLabelNutrition(fragment,product) {
  const text=clean(fragment.replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi,''));
  const selectors=[...fragment.matchAll(/<select\b[^>]*id="servingDropDown"[^>]*>([\s\S]*?)<\/select>/gi)];
  if(selectors.length!==1||[...selectors[0][1].matchAll(/<option\b/gi)].length!==1||!/^Per Serving$/i.test(clean(selectors[0][1])))return null;
  if((text.match(/Nutrition Facts/gi)||[]).length!==1||!/Amount Per Serving/i.test(text)||/as prepared|per\s*100\s*g/i.test(text))return null;
  // Only an explicit one-package panel may borrow the net mass from its own header.
  const serving=one(fragment,/<div\b[^>]*>Serving Size<\/div>\s*<div\b[^>]*>([\s\S]*?)<\/div>/gi);
  let servingText=clean(serving);
  const grams=[...servingText.matchAll(/(\d+(?:\.\d+)?)\s*g\b/gi)];
  if(grams.length>1)return null;
  if(!grams.length){
    // A solitary matching paragraph is insufficient if another count contradicts it.
    const countMentions=text.match(/\bservings?\s+per\s+container\b/gi)||[];
    if(!/^1 (?:Package|Bag|Pouch|Container)$/i.test(servingText)||countMentions.length!==1||!/<p\b[^>]*>\s*1(?:\.0)? Servings? Per Container\s*<\/p>/i.test(fragment))return null;
    // Packaging evidence anywhere in the product identity/header overrides this inference.
    const packaging=[product.row?.name,product.row?.brand,product.net,product.headerText].map(clean).join(' ');
    if(/multi[ -]?pack|variety[ -]?pack|\bpack of\b|\b(?:twin|double)\s*pack\b|\d\s*[x×]/i.test(packaging))return null;
    const packageCounts=[...packaging.matchAll(/\b(\d+(?:\.\d+)?)\s*[- ]?\s*(?:bags?|pouches?|packages?|packs?|containers?|count|ct)\b/gi)];
    if(packageCounts.some(m=>Number(m[1])>1))return null;
    const mass=[...product.net.matchAll(/(\d+(?:\.\d+)?)\s*g\b/gi)];
    if(mass.length!==1||!/^Net Wt\b/i.test(product.net)||/multipack|\bpack of\b|\d\s*[x×]/i.test(product.net))return null;
    servingText+=' ('+mass[0][1]+' g)';
  }
  const rows=[...fragment.matchAll(/<li\b[^>]*class="nfp__row[^"]*"[^>]*>([\s\S]*?)(?=<li\b|<\/ul>)/gi)].map(m=>clean(m[1]));
  const get=(label,unit)=>{
    const hits=rows.filter(r=>new RegExp('^'+label+'(?:\\s|$)','i').test(r));
    if(hits.length!==1)return null;
    const m=new RegExp('^'+label+'\\s+(\\d+(?:\\.\\d+)?)'+(unit?'\\s*g':'')+'(?:\\s+\\d+(?:\\.\\d+)?%)?(?:\\s+% Daily Value \\*)?$','i').exec(hits[0]);
    return m?m[1]+(unit?' g':' kcal'):null;
  };
  const nutrition={servingSize:servingText,calories:get('Calories',false),fatContent:get('Total Fat',true),carbohydrateContent:get('Total Carbohydrate',true),proteinContent:get('Protein',true),fiberContent:get('Dietary Fiber',true)};
  return nutrition.calories&&nutrition.fatContent&&nutrition.carbohydrateContent&&nutrition.proteinContent?nutrition:null;
}

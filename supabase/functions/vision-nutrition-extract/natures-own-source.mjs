// Reviewed Nature's Own Life Honey Wheat source, 2026-11-04.
// Audited manufacturer product template and its explicitly linked panel only. Never execute site scripts,
// infer a GTIN, trust model-suggested assets, or authorize arbitrary Squarespace hosts.
import { validBarcode } from './recovery-contract.mjs';
import { sameBarcode } from './identity.mjs';
const ORIGIN='https://www.naturesownbread.com';
const PRODUCT=/^\/natures-own\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACCORDION=/^\/[a-z0-9]+(?:-[a-z0-9]+)*-accordion$/;
const NUTRITION=/^\/[a-z0-9]+(?:-[a-z0-9]+)*-accordion\/nutrition-facts$/;
const TENANT='/content/v1/69b845710dd8d26ef069400f/';
const validPath=path=>path.length<=180&&[PRODUCT,ACCORDION,NUTRITION].some(re=>re.test(path));
const decode=s=>String(s||'').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/&nbsp;|&#160;/gi,' ');
const plain=s=>decode(String(s||'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const clean=s=>String(s||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi,'');
const unique=values=>[...new Set(values)];
function attrs(tag) {
  const result=Object.create(null);
  for(const m of tag.matchAll(/\s([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const key=m[1].toLowerCase();
    const value=decode(m[2]??m[3]);
    // Squarespace repeats ALT in live markup; ALT is not identity, URL or nutrition evidence.
    if(Object.hasOwn(result,key)&&result[key]!==value&&key!=='alt')return null;
    result[key]=value;
  }
  return result;
}
const tags=(html,name)=>[...html.matchAll(new RegExp('<'+name+'\\b[^>]*>','gi'))].map(m=>attrs(m[0])||{__invalid:true});
function main(html) { const hits=[...html.matchAll(/<main\b[^>]*>([\s\S]*?)<\/main>/gi)];return hits.length===1?hits[0][1]:null; }
function canonical(html,path) {const hits=tags(html,'link').filter(a=>a.rel==='canonical');return hits.length===1&&hits[0].href===ORIGIN+path;}
export function naturesOwnPageURL(value) {
  try { const u=new URL(value);return u.origin===ORIGIN&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&validPath(u.pathname)&&u.href.length<=2000?u.href:null; }catch{return null;}
}
export function isNaturesOwnProductURL(value) {const safe=naturesOwnPageURL(value);return !!safe&&PRODUCT.test(new URL(safe).pathname);}
export function naturesOwnImageURL(value,page) {
  if(!naturesOwnPageURL(page))return null;
  try {
    const u=new URL(value,page);
    // Exact tenant, one UUID directory, ordinary image file, no encoded separators or queries.
    const tail=u.pathname.startsWith(TENANT)?u.pathname.slice(TENANT.length):'';
    return u.protocol==='https:'&&u.hostname==='images.squarespace-cdn.com'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.href.length<=2000&&/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}\/[A-Za-z\d_+.-]+\.(?:jpg|jpeg|png|webp)$/i.test(tail)?u.href:null;
  }catch{return null;}
}
function boundImages(html,page) {
  const images=tags(html,'img');if(images.some(a=>a.__invalid))return [];
  return unique(images.filter(a=>a.src&&a['data-src']===a.src&&(!a['data-image']||a['data-image']===a.src)).map(a=>naturesOwnImageURL(a.src,page)).filter(Boolean));
}
export function naturesOwnProduct(html,url) {
  if(!isNaturesOwnProductURL(url))return null;
  html=clean(html);const body=main(html);
  if(!body||!canonical(html,new URL(url).pathname))return null;
  const sites=tags(html,'meta').filter(a=>a.property==='og:site_name');
  const heads=[...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>plain(m[1]));
  if(sites.length!==1||sites[0].content!=="Nature's Own"||heads.length!==1||heads[0].length<3||heads[0].length>160)return null;
  const divs=tags(body,'div');if(divs.some(a=>a.__invalid))return null;
  const bv=divs.filter(a=>a['data-bv-show']==='rating_summary').map(a=>a['data-bv-product-id']);
  const upcs=divs.filter(a=>a.id==='destini-locator').map(a=>a.apo);
  if(!bv.length||!upcs.length||![...bv,...upcs].every(c=>validBarcode(c)&&sameBarcode(c,bv[0])))return null;
  const fragments=unique(divs.filter(a=>a['data-wm-plugin']==='accordions').map(a=>a['data-source']));
  if(fragments.length!==1||!ACCORDION.test(fragments[0]||''))return null;
  const fronts=boundImages(body,url).filter(u=>/\/Mobile-Product-Images_[A-Za-z\d_+.-]+\.(?:jpg|jpeg|png|webp)$/i.test(new URL(u).pathname));
  if(fronts.length!==1)return null;
  return {row:{'@type':'Product',name:heads[0],brand:sites[0].content,gtin:bv[0],image:fronts[0]},accordionURL:ORIGIN+fragments[0]};
}
export function naturesOwnNutritionPage(html,url) {
  const safe=naturesOwnPageURL(url);if(!safe||!ACCORDION.test(new URL(safe).pathname))return null;
  html=clean(html);const body=main(html);if(!body||!canonical(html,new URL(safe).pathname))return null;
  const links=[...body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(m=>plain(m[2])==='Nutrition Facts').map(m=>attrs('<a '+m[1]+'>')?.href);
  const expected=new URL(safe).pathname+'/nutrition-facts';
  return links.length===1&&links[0]===expected?naturesOwnPageURL(ORIGIN+expected):null;
}
export function naturesOwnNutritionImage(html,url) {
  const safe=naturesOwnPageURL(url);if(!safe||!NUTRITION.test(new URL(safe).pathname))return null;
  html=clean(html);const body=main(html);if(!body||!canonical(html,new URL(safe).pathname))return null;
  // Do not silently ignore a second panel image just because its host/shape is unsupported.
  if(tags(body,'img').length!==1)return null;
  const images=boundImages(body,url);
  return images.length===1?images[0]:null;
}

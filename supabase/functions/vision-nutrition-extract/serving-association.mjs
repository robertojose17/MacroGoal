// Literal serving association only: never recover mass, translate arbitrary nouns,
// infer package ratios, repair OCR, or borrow evidence from the other read.
const fold=v=>typeof v==='string'?v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' '):'';
const units=new Map([['unit','unit'],['unidad','unit'],['piece','piece'],['pieza','piece'],['slice','slice'],['rebanada','slice'],['cracker','cracker'],['cookie','cookie'],['biscuit','biscuit'],['galleta','galleta'],['bar','bar'],['barra','bar'],['package','package'],['paquete','package'],['bag','bag'],['bolsa','bag'],['pouch','pouch'],['container','container'],['envase','container'],['serving','serving'],['portion','serving'],['porcion','serving'],['racion','serving']]);
const unit=v=>units.get(v)||units.get(v.replace(/s$/,''));
const LABEL='(?:serving size|tamano (?:de )?(?:porcion|servicio|racion))';
const declarationPattern=new RegExp('^'+LABEL+'(?:\\s*[/]\\s*'+LABEL+')?(?:\\s*:\\s*|\\s+)(.+)$');
export function literalServingDeclaration(value){const m=declarationPattern.exec(fold(value));return m?literalServingQuantity(m[1]):null;}
export function literalServingQuantity(value){
 const m=/^(\d+(?:\.\d+)?)\s+([a-z]+)(?:\s*\/\s*([a-z]+))?(?:\s*\(\s*(\d+(?:\.\d+)?)\s*(?:g|grams?|gramos?)\s*\))?$/.exec(fold(value));
 if(!m)return null;const canonical=unit(m[2]);if(!canonical||(m[3]&&unit(m[3])!==canonical))return null;
 const count=Number(m[1]),grams=m[4]===undefined?null:Number(m[4]);if(!Number.isFinite(count)||count<=0||(grams!==null&&(!Number.isFinite(grams)||grams<=0))||canonical==='serving'&&count!==1)return null;
 return {count,unit:canonical,grams};
}
export const SERVING_ASSOCIATION_REASONS=Object.freeze(['not_applicable','matched','declaration_unrecognized','declaration_missing_grams','scalar_missing','scalar_mass_mismatch','quantity_unrecognized','quantity_count_or_unit_mismatch','quantity_mass_mismatch','header_missing','header_unrecognized','header_count_or_unit_mismatch','header_mass_mismatch']);
export function servingAssociation(header,mass,quantity,evidence){
 const declared=literalServingDeclaration(evidence),fail=reason=>({ok:false,reason});
 if(!declared)return fail('declaration_unrecognized');if(declared.grams===null)return fail('declaration_missing_grams');
 if(typeof mass!=='number'||!Number.isFinite(mass)||mass<=0)return fail('scalar_missing');if(mass!==declared.grams)return fail('scalar_mass_mismatch');
 const q=literalServingDeclaration(quantity)||literalServingQuantity(quantity);if(!q)return fail('quantity_unrecognized');if(q.count!==declared.count||q.unit!==declared.unit)return fail('quantity_count_or_unit_mismatch');if(q.grams!==null&&q.grams!==mass)return fail('quantity_mass_mismatch');
 const h=fold(header);if(!h)return fail('header_missing');
 if(/\b(?:per|por)\s*100\s*(?:g|grams?|gramos?|ml)\b/.test(h))return fail('header_unrecognized');
 const generic='(?:amount per serving|per serving|serving|porcion|racion|cantidad por (?:porcion|racion)|por (?:porcion|racion))';
 if(!new RegExp('^'+generic+'(?:\\s*/\\s*'+generic+')?\\s*:?$').test(h)){
   const bare=/^(?:per|por) ([a-z]+)$/.exec(h);
   if(bare&&unit(bare[1])===declared.unit&&declared.count===1)return {ok:true,reason:'matched',canonicalQuantity:`${declared.count} ${declared.unit} (${mass}g)`};
   const raw=h.replace(/^(?:per|por)\s+/,''),g=/^(\d+(?:\.\d+)?)\s*(?:g|grams?|gramos?)$/.exec(raw),c=literalServingQuantity(raw);
   if(g){if(Number(g[1])!==mass)return fail('header_mass_mismatch');}
   else {if(!c)return fail('header_unrecognized');if(c.unit==='serving'?c.count!==1:c.count!==declared.count||c.unit!==declared.unit)return fail('header_count_or_unit_mismatch');if(c.grams!==null&&c.grams!==mass)return fail('header_mass_mismatch');}
 }
 return {ok:true,reason:'matched',canonicalQuantity:`${declared.count} ${declared.unit} (${mass}g)`};
}

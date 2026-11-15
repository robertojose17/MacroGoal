// Recovered from recorded tool-call source. New hashes required; source-only.
export const NUTRIENTS=Object.freeze(['calories','protein','carbs','fats','fiber']);
const PORTION=['grams','quantity','serving_description','serving_unit','food_id','food_item_id','food_name','food_brand','meal_id','is_scheduled','logged_at'];
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,e)=>object(v)&&Object.keys(v).length===e.length&&e.every(k=>Object.hasOwn(v,k));
const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&!Object.is(v,-0);
const freeze=v=>{if(object(v)||Array.isArray(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const fail=reason=>Object.freeze({ok:false,reason});
const equal=(a,b)=>{if(a===b)return true;if(!object(a)||!object(b)||Object.keys(a).length!==Object.keys(b).length)return false;return Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));};
const valuesValid=v=>keys(v,NUTRIENTS)&&NUTRIENTS.every(k=>numeric(v[k]));
function bindingValid(b){
 if(!keys(b,['values','portion'])||!valuesValid(b.values)||!keys(b.portion,PORTION))return false;
 const p=b.portion;return(p.grams===null||numeric(p.grams))&&numeric(p.quantity)&&p.is_scheduled===false&&uuid(p.meal_id)
 &&[p.food_id,p.food_item_id].every(v=>v===null||uuid(v))
 &&['serving_description','serving_unit','food_name','food_brand','logged_at'].every(k=>p[k]===null||typeof p[k]==='string');
}
// Only genuinely user-edited strings; never prefills, reconstructed catalog or AI values.
export function captureManualNutrition(editedText,savedValues){
 if(!object(editedText)||Object.keys(editedText).some(k=>!NUTRIENTS.includes(k))||!valuesValid(savedValues))return fail('invalid_capture');
 const declaredFields=[];
 for(const k of NUTRIENTS){if(!Object.hasOwn(editedText,k))continue;if(typeof editedText[k]!=='string')return fail('invalid_manual_text');const s=editedText[k].trim();if(!s)continue;
 if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))return fail('invalid_manual_text');const v=Number(s);if(!numeric(v)||v!==savedValues[k])return fail('saved_value_mismatch');declaredFields.push(k);}
 if(!declaredFields.length)return fail('no_explicit_fields');return freeze({ok:true,declaration:{version:'manual-nutrition-capture-v1',declaredFields,values:{...savedValues}}});
}
export function prepareManualEvidenceRequest({declaration,authenticatedOwnerId,confirmedItemId,expectedLoggedBinding,readState,requestId}={}){
 if(!uuid(authenticatedOwnerId)||!uuid(confirmedItemId)||!uuid(requestId))return fail('invalid_identity');
 if(!keys(declaration,['version','declaredFields','values'])||declaration.version!=='manual-nutrition-capture-v1'||!valuesValid(declaration.values)||!Array.isArray(declaration.declaredFields)||!declaration.declaredFields.length||new Set(declaration.declaredFields).size!==declaration.declaredFields.length||declaration.declaredFields.some(k=>!NUTRIENTS.includes(k)))return fail('invalid_declaration');
 if(!bindingValid(expectedLoggedBinding))return fail('expected_log_binding_required');if(!equal(declaration.values,expectedLoggedBinding.values))return fail('capture_changed');
 if(!object(readState)||readState.version!=='logged-nutrition-evidence-state-v1'||readState.ownerId!==authenticatedOwnerId||readState.itemId!==confirmedItemId||!uuid(readState.revision)||!Number.isSafeInteger(readState.evidenceVersion)||readState.evidenceVersion<0||readState.evidenceVersion>=Number.MAX_SAFE_INTEGER)return fail('invalid_read_state');
 if(!bindingValid(readState.expected)||!equal(readState.expected,expectedLoggedBinding))return fail('logged_item_changed');
 return freeze({ok:true,request:{version:'user-entered-v1',kind:'register',requestId,itemId:confirmedItemId,revision:readState.revision,expectedEvidenceVersion:readState.evidenceVersion,expected:{values:{...readState.expected.values},portion:{...readState.expected.portion}},declaredFields:[...declaration.declaredFields]}});
}
function sameIssuedUtc(issued,observed){
 if(typeof issued!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(issued))return false;
 const date=new Date(issued);if(!Number.isFinite(date.getTime())||date.toISOString()!==issued)return false;if(typeof observed!=='string')return false;
 const m=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(observed);
 return Boolean(m&&m[1]===issued.slice(0,19)&&(m[2]??'').padEnd(6,'0')===issued.slice(20,23)+'000');
}
const INTENT_PORTION=['grams','quantity','serving_description','serving_unit','food_id','meal_id','is_scheduled','logged_at'];
// Current matching observation, not original log revision/history or catalog proof.
export function prepareManualEvidenceFromIntent({declaration,authenticatedOwnerId,confirmedItemId,loggedIntent,readState,requestId}={}){
 if(!keys(loggedIntent,['values','portion'])||!valuesValid(loggedIntent.values)||!keys(loggedIntent.portion,INTENT_PORTION))return fail('known_log_intent_required');
 const p=loggedIntent.portion;if(!uuid(p.food_id))return fail('known_food_identity_required');if(!object(readState)||!bindingValid(readState.expected))return fail('invalid_read_state');const observed=readState.expected;
 if(!equal(loggedIntent.values,observed.values)||INTENT_PORTION.filter(k=>k!=='logged_at').some(k=>p[k]!==observed.portion[k])||!sameIssuedUtc(p.logged_at,observed.portion.logged_at))return fail('known_log_intent_changed');
 return prepareManualEvidenceRequest({declaration,authenticatedOwnerId,confirmedItemId,expectedLoggedBinding:{values:{...observed.values},portion:{...observed.portion}},readState,requestId});
}

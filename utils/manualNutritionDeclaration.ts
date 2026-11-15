import type {Nutrient,Values,Binding,RegisterRequest,JournalEntry,Receipt,ReadState,FullEvidenceInput,EvidenceInput,Capture,Preparation,Failure} from './manualNutritionTypes.ts';
// Recovered from recorded tool-call source. New hashes required; source-only.
export const NUTRIENTS: readonly string[]=Object.freeze(['calories','protein','carbs','fats','fiber']);
const PORTION=['grams','quantity','serving_description','serving_unit','food_id','food_item_id','food_name','food_brand','meal_id','is_scheduled','logged_at'];
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:unknown,e:readonly string[]):boolean=>object(v)&&Object.keys(v).length===e.length&&e.every(k=>Object.hasOwn(v,k));
const numeric=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&!Object.is(v,-0);
const freeze=<T>(v:T):T=>{if(object(v)||Array.isArray(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const fail=(reason:string):Failure=>Object.freeze({ok:false,reason});
const equal=(a:unknown,b:unknown):boolean=>{if(a===b)return true;if(!object(a)||!object(b)||Object.keys(a).length!==Object.keys(b).length)return false;return Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));};
const valuesValid=(v:Values):boolean=>keys(v,NUTRIENTS)&&NUTRIENTS.every(k=>numeric(v[k as Nutrient]));
function bindingValid(b:Binding):boolean{
 if(!keys(b,['values','portion'])||!valuesValid(b.values)||!keys(b.portion,PORTION))return false;
 const p=b.portion;return(p.grams===null||numeric(p.grams))&&numeric(p.quantity)&&p.is_scheduled===false&&uuid(p.meal_id)
 &&[p.food_id,p.food_item_id].every(v=>v===null||uuid(v))
 &&(['serving_description','serving_unit','food_name','food_brand','logged_at'] as const).every(k=>p[k]===null||typeof p[k]==='string');
}
// Only genuinely user-edited strings; never prefills, reconstructed catalog or AI values.
export function captureManualNutrition(editedText:Partial<Record<Nutrient,string>>,savedValues:Values):Capture{
 if(!object(editedText)||Object.keys(editedText).some(k=>!NUTRIENTS.includes(k))||!valuesValid(savedValues))return fail('invalid_capture');
 const declaredFields:Nutrient[]=[];
 for(const k of NUTRIENTS as readonly Nutrient[]){if(!Object.hasOwn(editedText,k))continue;if(typeof editedText[k]!=='string')return fail('invalid_manual_text');const s=editedText[k]!.trim();if(!s)continue;
 if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))return fail('invalid_manual_text');const v=Number(s);if(!numeric(v)||v!==savedValues[k])return fail('saved_value_mismatch');declaredFields.push(k);}
 if(!declaredFields.length)return fail('no_explicit_fields');return freeze({ok:true,declaration:{version:'manual-nutrition-capture-v1',declaredFields,values:{...savedValues}}});
}
export function prepareManualEvidenceRequest({declaration,authenticatedOwnerId,confirmedItemId,expectedLoggedBinding,readState,requestId}:FullEvidenceInput={} as FullEvidenceInput):Preparation{
 if(!uuid(authenticatedOwnerId)||!uuid(confirmedItemId)||!uuid(requestId))return fail('invalid_identity');
 if(!keys(declaration,['version','declaredFields','values'])||declaration.version!=='manual-nutrition-capture-v1'||!valuesValid(declaration.values)||!Array.isArray(declaration.declaredFields)||!declaration.declaredFields.length||new Set(declaration.declaredFields).size!==declaration.declaredFields.length||declaration.declaredFields.some(k=>!NUTRIENTS.includes(k)))return fail('invalid_declaration');
 if(!bindingValid(expectedLoggedBinding))return fail('expected_log_binding_required');if(!equal(declaration.values,expectedLoggedBinding.values))return fail('capture_changed');
 if(!object(readState)||readState.version!=='logged-nutrition-evidence-state-v1'||readState.ownerId!==authenticatedOwnerId||readState.itemId!==confirmedItemId||!uuid(readState.revision)||!Number.isSafeInteger(readState.evidenceVersion)||readState.evidenceVersion<0||readState.evidenceVersion>=Number.MAX_SAFE_INTEGER)return fail('invalid_read_state');
 if(!bindingValid(readState.expected)||!equal(readState.expected,expectedLoggedBinding))return fail('logged_item_changed');
 return freeze({ok:true,request:{version:'user-entered-v1',kind:'register',requestId,itemId:confirmedItemId,revision:readState.revision,expectedEvidenceVersion:readState.evidenceVersion,expected:{values:{...readState.expected.values},portion:{...readState.expected.portion}},declaredFields:[...declaration.declaredFields]}});
}
function sameIssuedUtc(issued:unknown,observed:unknown):boolean{
 if(typeof issued!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(issued))return false;
 const date=new Date(issued);if(!Number.isFinite(date.getTime())||date.toISOString()!==issued)return false;if(typeof observed!=='string')return false;
 const m=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(observed);
 return Boolean(m&&m[1]===issued.slice(0,19)&&(m[2]??'').padEnd(6,'0')===issued.slice(20,23)+'000');
}
const INTENT_PORTION=['grams','quantity','serving_description','serving_unit','food_id','meal_id','is_scheduled','logged_at'] as const;
// Current matching observation, not original log revision/history or catalog proof.
export function prepareManualEvidenceFromIntent({declaration,authenticatedOwnerId,confirmedItemId,loggedIntent,readState,requestId}:EvidenceInput={} as EvidenceInput):Preparation{
 if(!keys(loggedIntent,['values','portion'])||!valuesValid(loggedIntent.values)||!keys(loggedIntent.portion,INTENT_PORTION))return fail('known_log_intent_required');
 const p=loggedIntent.portion;if(!uuid(p.food_id))return fail('known_food_identity_required');if(!object(readState)||!bindingValid(readState.expected))return fail('invalid_read_state');const observed=readState.expected;
 if(!equal(loggedIntent.values,observed.values)||INTENT_PORTION.filter(k=>k!=='logged_at').some(k=>p[k]!==observed.portion[k])||!sameIssuedUtc(p.logged_at,observed.portion.logged_at))return fail('known_log_intent_changed');
 return prepareManualEvidenceRequest({declaration,authenticatedOwnerId,confirmedItemId,expectedLoggedBinding:{values:{...observed.values},portion:{...observed.portion}},readState,requestId});
}

// Transport boundary. Never turns a type assertion into validation; strips all
// unknown fields (including current evidence) and returns a detached known shape.
export function parseManualNutritionReadState(raw:unknown,owner:string,item:string):ReadState {
 const invalid=():never=>{throw new Error('invalid_manual_nutrition_read_state');};
 if(!uuid(owner)||!uuid(item)||!object(raw)||raw.version!=='logged-nutrition-evidence-state-v1'
  ||raw.ownerId!==owner||raw.itemId!==item||!(raw.revision===null||uuid(raw.revision))
  ||typeof raw.evidenceVersion!=='number'||!Number.isSafeInteger(raw.evidenceVersion)
  ||raw.evidenceVersion<0||raw.evidenceVersion>=Number.MAX_SAFE_INTEGER)return invalid();
 const expected=parseBinding(raw.expected);
 let receipt:Receipt|null=null;
 if(raw.receipt!==null){
  const r=raw.receipt;
  if(!object(r)||!keys(r,['requestId','requestDigest','eventVersion','status'])||!uuid(r.requestId)
   ||typeof r.requestDigest!=='string'||!/^[a-f0-9]{64}$/.test(r.requestDigest)
   ||typeof r.eventVersion!=='number'||!Number.isSafeInteger(r.eventVersion)||r.eventVersion<=0||r.eventVersion>raw.evidenceVersion
   ||!(r.status==='active'||r.status==='revoked'))return invalid();
  receipt={requestId:r.requestId,requestDigest:r.requestDigest,eventVersion:r.eventVersion,status:r.status};
 }
 return {
  version:'logged-nutrition-evidence-state-v1',ownerId:owner,itemId:item,
  revision:raw.revision,evidenceVersion:raw.evidenceVersion,receipt,
  expected
 };
}

function parseBinding(raw:unknown):Binding {
 const invalid=():never=>{throw new Error("invalid_manual_nutrition_binding");};
 const b=raw;
 if(!object(b)||!keys(b,['values','portion'])||!object(b.values)||!keys(b.values,NUTRIENTS)
  ||!object(b.portion)||!keys(b.portion,PORTION))return invalid();
 const v=b.values,p=b.portion;
 if(!numeric(v.calories)||!numeric(v.protein)||!numeric(v.carbs)||!numeric(v.fats)||!numeric(v.fiber))return invalid();
 if(!(p.grams===null||numeric(p.grams))||!numeric(p.quantity)||p.is_scheduled!==false
  ||!uuid(p.meal_id)||!(p.food_id===null||uuid(p.food_id))||!(p.food_item_id===null||uuid(p.food_item_id))
  ||!(p.serving_description===null||typeof p.serving_description==='string')
  ||!(p.serving_unit===null||typeof p.serving_unit==='string')
  ||!(p.food_name===null||typeof p.food_name==='string')
  ||!(p.food_brand===null||typeof p.food_brand==='string')
  ||!(p.logged_at===null||typeof p.logged_at==='string'))return invalid();
 return {values:{calories:v.calories,protein:v.protein,carbs:v.carbs,fats:v.fats,fiber:v.fiber},
   portion:{grams:p.grams,quantity:p.quantity,serving_description:p.serving_description,serving_unit:p.serving_unit,
    food_id:p.food_id,food_item_id:p.food_item_id,food_name:p.food_name,food_brand:p.food_brand,
    meal_id:p.meal_id,is_scheduled:false,logged_at:p.logged_at}};
}

export function parseManualNutritionRegisterRequest(raw:unknown):RegisterRequest {
 const invalid=():never=>{throw new Error('invalid_manual_nutrition_request');};
 if(!object(raw)||!keys(raw,['version','kind','requestId','itemId','revision','expectedEvidenceVersion','expected','declaredFields'])
  ||raw.version!=='user-entered-v1'||raw.kind!=='register'||!uuid(raw.requestId)||!uuid(raw.itemId)||!uuid(raw.revision)
  ||typeof raw.expectedEvidenceVersion!=='number'||!Number.isSafeInteger(raw.expectedEvidenceVersion)||raw.expectedEvidenceVersion<0||raw.expectedEvidenceVersion>=Number.MAX_SAFE_INTEGER
  ||!Array.isArray(raw.declaredFields)||raw.declaredFields.length<1||raw.declaredFields.length>5)return invalid();
 const declaredFields:Nutrient[]=[];
 for(const field of raw.declaredFields){
  if(field!=='calories'&&field!=='protein'&&field!=='carbs'&&field!=='fats'&&field!=='fiber')return invalid();
  if(declaredFields.includes(field))return invalid();declaredFields.push(field);
 }
 return {version:'user-entered-v1',kind:'register',requestId:raw.requestId,itemId:raw.itemId,revision:raw.revision,
  expectedEvidenceVersion:raw.expectedEvidenceVersion,expected:parseBinding(raw.expected),declaredFields};
}
export function parseManualNutritionJournalEntry(raw:unknown,owner:string,requestId:string):JournalEntry {
 if(!uuid(owner)||!uuid(requestId)||!object(raw)||!keys(raw,['version','ownerId','itemId','request'])
  ||raw.version!=='manual-evidence-journal-v1'||raw.ownerId!==owner||!uuid(raw.itemId))throw Error('invalid_journal');
 const request=parseManualNutritionRegisterRequest(raw.request);
 if(request.requestId!==requestId||request.itemId!==raw.itemId)throw Error('invalid_journal');
 return {version:'manual-evidence-journal-v1',ownerId:owner,itemId:raw.itemId,request};
}

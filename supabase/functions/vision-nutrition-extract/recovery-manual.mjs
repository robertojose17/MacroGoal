import {validBarcode,openDraft,sealDraft} from './recovery-contract.mjs';
import {canonicalBarcode} from './identity.mjs';
const clean=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max&&!/[\u0000-\u001f\u007f]/.test(v)?v.trim():null;
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1000000;
export function manualCandidate(values,session) {
 if(!session||session.binding?.id||(!session.unknown_front&&!session.manual_only)||!validBarcode(session.binding?.barcode))throw Error('invalid_manual_session');
 const name=clean(values?.name,160),brand=clean(values?.brand,100),serving=clean(values?.serving,160);
 if(!name||!brand||!serving||!number(values?.serving_g)||values.serving_g<=0)throw Error('invalid_manual_values');
 const nutrition={};
 for(const k of ['calories','protein','carbs','fat']){if(!number(values?.nutrition?.[k]))throw Error('invalid_manual_values');nutrition[k]=values.nutrition[k];}
 if(values.nutrition.fiber!=null&&!number(values.nutrition.fiber))throw Error('invalid_manual_values');
 nutrition.fiber=values.nutrition.fiber??null;
 return {name,brand,variant:name,barcode:session.binding.barcode,serving,serving_g:values.serving_g,nutrition,
 image_url:session.front_photo_url||'',exact_barcode:false,barcode_evidence:'user_entered',validated:false,nutrition_validated:false,
 provenance:{kind:'user_entered',identity:'user_entered_barcode',front_url:session.front_photo_url||null}};
}
export function manualConfirmationPayload(candidate,binding,confirmations) {
 if(!confirmations||!['identity','serving','nutrition','shared'].every(k=>confirmations[k]===true))throw Error('confirmation_required');
 if(binding?.id||candidate?.provenance?.kind!=='user_entered')throw Error('invalid_manual_session');
 const c=manualCandidate(candidate,{manual_only:true,binding,front_photo_url:candidate.image_url||null});
 return {barcode:canonicalBarcode(binding.barcode),expected_id:null,expected_revision:null,name:c.name,brand:c.brand,variant:c.variant,
 serving_size:c.serving_g,serving_quantity:c.serving,...c.nutrition,image_url:c.image_url||null,
 provenance:{...c.provenance,source_barcode:null,exact_barcode:false,label_image_url:null}};
}
async function readSessionRow(db,session,owner) {
 const {data,error}=await db.from('food_submissions').select('id,barcode,status,created_at,extracted_data').eq('id',session.submission).eq('submitted_by_user_id',owner).maybeSingle();
 if(error||!data||data.status!=='pending'||canonicalBarcode(data.barcode)!==canonicalBarcode(session.binding.barcode)||data.extracted_data?.recovery_version!==1)throw Error('invalid_manual_session');
 const expires=Date.parse(data.created_at)+20*60*1000,revision=data.extracted_data?.photo_attempts;
 if(!Number.isFinite(expires)||expires<=Date.now())throw Error('expired_proposal');
 if(!Number.isSafeInteger(revision)||revision<0||revision>2)throw Error('invalid_manual_session');
 return {expires,revision};
}
export async function handleManualReview(body,deps,repo) {
 let session;
 if(body.action==='recovery_manual_start') {
  if(!validBarcode(body.barcode)||typeof body.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id))throw Error('invalid_request_id');
  const code=canonicalBarcode(body.barcode),existing=await repo.findByBarcodes(code.length===13&&code[0]==='0'?[code,code.slice(1)]:[code]);
  if(existing.length)return {status:'clarify',code:'barcode_now_known',next_step:'reload_product'};
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('barcode-manual-v1:'+deps.userId+':'+code+':'+body.request_id)));
  digest[6]=(digest[6]&15)|64;digest[8]=(digest[8]&63)|128;
  const hex=Array.from(digest.slice(0,16),v=>v.toString(16).padStart(2,'0')).join('');
  const submission=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  session={version:1,kind:'session',owner:deps.userId,submission,manual_only:true,binding:{barcode:code,id:null,nutrition_revision:null},name:'',brand:''};
  // Same durable rate limits. An uncertain response is recovered only by this
  // owner-bound deterministic submission; never creates a second paid action.
  await deps.supabase.rpc('claim_barcode_recovery',{p_owner:deps.userId,p_submission:submission,p_barcode:code,p_phase:'discover'});
 } else {
  session=await openDraft(body.session,deps.secret,deps.userId);
  if(session.kind!=='session'||session.binding?.id||(!session.unknown_front&&!session.manual_only))throw Error('invalid_manual_session');
 }
 const state=await readSessionRow(deps.supabase,session,deps.userId);
 session.expires=Math.min(session.expires??state.expires,state.expires);
 const token=await sealDraft(session,deps.secret);
 if(body.action==='recovery_manual_start')return {status:'review',session:token,expires_at:session.expires,candidates:[],photo:null,next_step:'manual'};
 const candidate=manualCandidate(body.values,session);
 const {data:manualRevision,error:manualError}=await deps.supabase.rpc('claim_barcode_recovery',{p_owner:deps.userId,p_submission:session.submission,p_barcode:canonicalBarcode(session.binding.barcode),p_phase:'manual'});
 if(manualError||!Number.isSafeInteger(manualRevision)||manualRevision<1)throw Error('invalid_manual_session');
 const proposal=await sealDraft({version:1,kind:'manual_candidate',owner:deps.userId,expires:session.expires,submission:session.submission,binding:session.binding,candidate,revision:state.revision,manual_revision:manualRevision},deps.secret);
 return {status:'review',session:token,expires_at:session.expires,candidates:[],photo:{...candidate,can_confirm:true,proposal},next_step:'review'};
}

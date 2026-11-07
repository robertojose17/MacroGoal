import { ownerRecoveryPhoto, frontRecoverySubmission } from './recovery-front.ts';
import { sanitizeRecoverySearchFailure } from './recovery-search-diagnostics.mjs';
import { candidateEligible, imagePreservationBlocked, preservationAction, confirmationPayload, conflictsWithPhoto, distinctCandidates, openDraft, sealDraft, validBarcode } from './recovery-contract.mjs';
import { resolveCorrectionIdentity, canonicalBarcode as sessionBarcode } from './identity.mjs';
import { discoverGeneralProducts as discoverProducts } from './recovery-general.ts';

type Dependencies = {
  supabase:any; userId:string; secret:string; apiKey:string; projectUrl:string; enabled:boolean; deadline?:number; preserveExistingImageVerified?:boolean;
  readPhotos:(label:string,front:string,known:string|null,providerFetch?:typeof fetch,sourceLabel?:boolean)=>Promise<any>;
  readFront?:(front:string,providerFetch:typeof fetch)=>Promise<{name:string;brand:string}|null>;
  receiptFetch?:(submission:string,revision:number)=>typeof fetch;
};
const ttl=20*60*1000;
const issues=(field:string,reason:string)=>[{field,reason}];
export async function handleRecovery(body:any,deps:Dependencies) {
  if(!deps.enabled)return {status:'unavailable',code:'recovery_not_enabled'};
  const {supabase,userId}=deps;
  const repo={
    async findById(id:string){const {data,error}=await supabase.rpc('read_food_correction_targets_v1',{p_id:id,p_barcodes:null});if(error)throw error;return data?.[0]||null;},
    async findByBarcodes(codes:string[]){const {data,error}=await supabase.rpc('read_food_correction_targets_v1',{p_id:null,p_barcodes:codes});if(error)throw error;return data||[];},
  };
  if(body.action==='recovery_confirm') {
    const proposal=await openDraft(body.proposal,deps.secret,userId);
    if(proposal.kind!=='candidate')throw Error('invalid_proposal');
    if (proposal.image_action !== undefined && deps.preserveExistingImageVerified !== true) throw Error('image_preservation_unverified');
    const payload={...confirmationPayload(proposal.candidate,proposal.binding,body.confirmations,proposal.image_action),revision:proposal.revision};
    const {data,error}=await supabase.rpc('confirm_barcode_recovery',{
      p_owner:userId,p_submission:proposal.submission,p_payload:payload,
    });
    if(error)throw Error('save_conflict');
    return {status:'approved',food_item:data};
  }
  let session:any,frontIdentity=false;
  if(body.action==='recovery_discover') {
    if(!validBarcode(body.barcode))return {status:'clarify',issues:issues('barcode','invalid_barcode')};
    const identity=await resolveCorrectionIdentity({barcode:body.barcode,food_item_id:body.food_item_id},repo);
    if(body.photo_front_url!==undefined&&!identity.isNew)return {status:'clarify',code:'barcode_now_known',next_step:'reload_product'};
    frontIdentity=identity.isNew&&body.photo_front_url!==undefined;
    if(frontIdentity&&!ownerRecoveryPhoto(body.photo_front_url,deps.projectUrl,userId))throw Error('invalid_photo');
    if((frontIdentity||body.request_id!==undefined)&&(typeof body.request_id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)))throw Error('invalid_request_id');
    session={version:1,kind:'session',owner:userId,expires:Date.now()+ttl,
      submission:frontIdentity?await frontRecoverySubmission(userId,sessionBarcode(body.barcode),body.request_id):crypto.randomUUID(),...(frontIdentity?{front_photo_url:body.photo_front_url,unknown_front:true}:{}),binding:{barcode:body.barcode,id:identity.row?.id||null,nutrition_revision:identity.row?._nutrition_revision??null},
      name:String(identity.row?.name||body.name||'').slice(0,160),brand:String(identity.row?.brand||body.brand||'').slice(0,100)};
  } else {
    session=await openDraft(body.session,deps.secret,userId);
    if(session.kind!=='session')throw Error('invalid_proposal');
    if(session.binding?.id && (!Number.isSafeInteger(session.binding.nutrition_revision)||session.binding.nutrition_revision<0))throw Error('proposal_requires_refresh');
  }
  const frontUrl=session.unknown_front?session.front_photo_url:body.photo_front_url;
  if(body.action==='recovery_photos'&&(!ownerRecoveryPhoto(body.photo_label_url,deps.projectUrl,userId)||!ownerRecoveryPhoto(frontUrl,deps.projectUrl,userId)||(session.unknown_front&&body.photo_front_url!==undefined&&body.photo_front_url!==frontUrl)))throw Error('invalid_photo');
  // Durable claim is made before provider work. Replayed/uncertain actions are not billed again.
  const phase=body.action==='recovery_photos'?'photos':'discover';
  const {data:revision,error:claimError}=await supabase.rpc('claim_barcode_recovery',{
    p_owner:userId,p_submission:session.submission,p_barcode:session.binding.barcode,p_phase:phase,
  });
  if(claimError)return {status:'unavailable',code:'request_already_used_or_limit'};
  const providerFetch=deps.receiptFetch?.(session.submission,revision)??fetch;
  const readPhotos=(label:string,front:string,known:string|null)=>deps.readPhotos(label,front,known,providerFetch);
  const identityIssues:any[]=[];
  if(frontIdentity) {
    // Never promote this read into evidence or use a client-supplied fallback identity.
    session.name='';session.brand='';
    try {
      const hint=await deps.readFront?.(session.front_photo_url,providerFetch);
      if(hint){session.name=hint.name;session.brand=hint.brand;}
      else identityIssues.push(...issues('front','identity_unclear'));
    } catch {identityIssues.push(...issues('front','identity_unavailable'));}
  }
  let photo:any=null,partialEvidence:any=null,photoIssues:any[]=[],basisDiagnostics:any=null;
  if(phase==='photos') {
    let result:any;
    try {result=await readPhotos(body.photo_label_url,frontUrl,session.name||null);}
    catch(error) {if(!session.unknown_front)throw error;result={ok:false,issues:issues('label','analysis_unavailable')};}
    partialEvidence=result.partialEvidence;
    basisDiagnostics=result.basis_diagnostics||null;
    if(result.ok) {
      photo={name:result.productName,brand:result.brand||'',variant:result.productName,
        barcode:session.binding.barcode,exact_barcode:false,serving:result.servingQuantity,serving_g:result.servingSize,
        nutrition:result.nutrition,image_url:frontUrl,nutrition_image_url:body.photo_label_url,
        validated:true,confidence:'physical_label',provenance:{kind:'physical_label',url:body.photo_label_url,
          front_url:frontUrl,retrieved_at:new Date().toISOString(),basis:'two_independent_label_reads',serving_mass_basis:result.servingMassBasis||'label_grams',identity:'user_confirms_scanned_package'}};
      session.name=photo.name; session.brand=photo.brand;
    } else {
      photoIssues=result.issues||issues('label','analysis_unavailable');
      // Identity from an incomplete read is search input only, never verified data.
      if(result.identity?.name)session.name=String(result.identity.name).slice(0,160);
      if(result.identity?.brand)session.brand=String(result.identity.brand).slice(0,100);
    }
  }
  let found:any={candidates:[],source_links:[]},searchCode:string|undefined,searchDiagnostics:any[]=[];
  // A valid physical label is already the final authoritative fallback.
  // Do not start another web search after both independent reads succeeded.
  if(!photo&&!(phase==='photos'&&session.unknown_front)&&!(frontIdentity&&!session.name))try{found=await discoverProducts({barcode:session.binding.barcode,name:session.name,brand:session.brand},{apiKey:deps.apiKey,fetch:providerFetch,deadline:deps.deadline,readLabel:(label:string,front:string,known:string)=>deps.readPhotos(label,front,known,providerFetch,true)});}
  catch(error){const diagnostic=sanitizeRecoverySearchFailure(error,'initial_search');searchCode=diagnostic.reason;searchDiagnostics.push(diagnostic);}
  for(const row of found.diagnostics||[])if(row.outcome==='post_validation_fallback_unavailable')searchDiagnostics.push(sanitizeRecoverySearchFailure({message:row.reason,diagnostics:row},'fallback_search'));
  const candidates:any[]=distinctCandidates(found.candidates).map((candidate:any)=>{
    const conflict=conflictsWithPhoto(candidate,photo||partialEvidence);
    // Once physical label evidence exists it wins; online data cannot overwrite it.
    return {...candidate,conflicts:[...new Set([...(candidate.conflicts||[]),...conflict])],validated:candidate.validated&&!conflict.length,nutrition_validated:candidate.nutrition_validated&&!conflict.length};
  });
  const signCandidate=async(candidate:any)=>{
    const imageAction=preservationAction(candidate,session.binding,deps.preserveExistingImageVerified);
    const imageBlocked=imagePreservationBlocked(candidate,session.binding,imageAction);
    const eligible=candidateEligible(candidate,session.binding.barcode)&&!imageBlocked;
    return {...candidate,can_confirm:eligible,...(imageBlocked?{confirmation_blocker:'image_preservation_unverified'}:{}),
      proposal:eligible?await sealDraft({version:1,kind:'candidate',owner:userId,expires:session.expires,
        submission:session.submission,binding:session.binding,candidate,revision,...(imageAction ? {image_action:imageAction} : {})},deps.secret):null};
  };
  console.log('[BarcodeRecovery] outcome', JSON.stringify({submission:session.submission,revision,phase,candidate_count:candidates.length,usable_candidate_count:candidates.filter(c=>candidateEligible(c,session.binding.barcode)&&!imagePreservationBlocked(c,session.binding,preservationAction(c,session.binding,deps.preserveExistingImageVerified))).length,photo_valid:!!photo,basis_diagnostics:basisDiagnostics,issues:photoIssues.map(({field,reason})=>({field,reason})),search_code:searchCode||null,search_diagnostics:searchDiagnostics,diagnostics:found.diagnostics||[]}));
  return {status:'review',expires_at:session.expires,session:await sealDraft(session,deps.secret),
    candidates:await Promise.all(candidates.map(signCandidate)),photo:photo?await signCandidate(photo):null,
    ...(session.unknown_front?{front_photo_url:session.front_photo_url,identity_issues:identityIssues,next_step:photo||candidates.some((candidate:any)=>candidateEligible(candidate,session.binding.barcode))?'review':phase==='photos'?'manual':'rear_label'}:{}),
    issues:photoIssues,source_links:found.source_links,search_code:searchCode,search_diagnostics:searchDiagnostics};
}

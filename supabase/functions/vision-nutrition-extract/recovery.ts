import { candidateEligible, confirmationPayload, conflictsWithPhoto, distinctCandidates, openDraft, sealDraft, validBarcode } from './recovery-contract.mjs';
import { resolveCorrectionIdentity } from './identity.mjs';
import { discoverProducts } from './recovery-discovery.ts';

type Dependencies = {
  supabase:any; userId:string; secret:string; apiKey:string; projectUrl:string; enabled:boolean; deadline?:number;
  readPhotos:(label:string,front:string,known:string|null,providerFetch?:typeof fetch)=>Promise<any>;
  receiptFetch?:(submission:string,revision:number)=>typeof fetch;
};
const ttl=20*60*1000;
const issues=(field:string,reason:string)=>[{field,reason}];
export async function handleRecovery(body:any,deps:Dependencies) {
  if(!deps.enabled)return {status:'unavailable',code:'recovery_not_enabled'};
  const {supabase,userId}=deps;
  const repo={
    async findById(id:string){const {data,error}=await supabase.from('food_items').select('*').eq('id',id).maybeSingle();if(error)throw error;return data;},
    async findByBarcodes(codes:string[]){const {data,error}=await supabase.from('food_items').select('*').in('barcode',codes);if(error)throw error;return data||[];},
  };
  if(body.action==='recovery_confirm') {
    const proposal=await openDraft(body.proposal,deps.secret,userId);
    if(proposal.kind!=='candidate')throw Error('invalid_proposal');
    const payload={...confirmationPayload(proposal.candidate,proposal.binding,body.confirmations),revision:proposal.revision};
    const {data,error}=await supabase.rpc('confirm_barcode_recovery',{
      p_owner:userId,p_submission:proposal.submission,p_payload:payload,
    });
    if(error)throw Error('save_conflict');
    return {status:'approved',food_item:data};
  }
  let session:any;
  if(body.action==='recovery_discover') {
    if(!validBarcode(body.barcode))return {status:'clarify',issues:issues('barcode','invalid_barcode')};
    const identity=await resolveCorrectionIdentity({barcode:body.barcode,food_item_id:body.food_item_id},repo);
    session={version:1,kind:'session',owner:userId,expires:Date.now()+ttl,
      submission:crypto.randomUUID(),binding:{barcode:body.barcode,id:identity.row?.id||null,updated_at:identity.row?.updated_at||null},
      name:String(identity.row?.name||body.name||'').slice(0,160),brand:String(identity.row?.brand||body.brand||'').slice(0,100)};
  } else {
    session=await openDraft(body.session,deps.secret,userId);
    if(session.kind!=='session')throw Error('invalid_proposal');
  }
  // Durable claim is made before provider work. Replayed/uncertain actions are not billed again.
  const phase=body.action==='recovery_photos'?'photos':'discover';
  const {data:revision,error:claimError}=await supabase.rpc('claim_barcode_recovery',{
    p_owner:userId,p_submission:session.submission,p_barcode:session.binding.barcode,p_phase:phase,
  });
  if(claimError)return {status:'unavailable',code:'request_already_used_or_limit'};
  const providerFetch=deps.receiptFetch?.(session.submission,revision)??fetch;
  const readPhotos=(label:string,front:string,known:string|null)=>deps.readPhotos(label,front,known,providerFetch);
  let photo:any=null,partialEvidence:any=null,photoIssues:any[]=[];
  if(phase==='photos') {
    const allowed=(value:unknown)=>{try{
      const url=new URL(String(value)),base=new URL(deps.projectUrl);
      return url.origin===base.origin && url.pathname.startsWith('/storage/v1/object/public/food-photos/submissions/'+userId+'/') && !url.search && !url.hash;
    }catch{return false;}};
    if(!allowed(body.photo_label_url)||!allowed(body.photo_front_url))throw Error('invalid_photo');
    const result=await readPhotos(body.photo_label_url,body.photo_front_url,session.name||null);
    partialEvidence=result.partialEvidence;
    if(result.ok) {
      photo={name:result.productName,brand:result.brand||'',variant:result.productName,
        barcode:session.binding.barcode,exact_barcode:false,serving:result.servingQuantity,serving_g:result.servingSize,
        nutrition:result.nutrition,image_url:body.photo_front_url,nutrition_image_url:body.photo_label_url,
        validated:true,confidence:'physical_label',provenance:{kind:'physical_label',url:body.photo_label_url,
          front_url:body.photo_front_url,retrieved_at:new Date().toISOString(),basis:'two_independent_label_reads',identity:'user_confirms_scanned_package'}};
      session.name=photo.name; session.brand=photo.brand;
    } else {
      photoIssues=result.issues||issues('label','analysis_unavailable');
      // Identity from an incomplete read is search input only, never verified data.
      if(result.identity?.name)session.name=String(result.identity.name).slice(0,160);
      if(result.identity?.brand)session.brand=String(result.identity.brand).slice(0,100);
    }
  }
  let found:any={candidates:[],source_links:[]},searchCode:string|undefined;
  try{found=await discoverProducts({barcode:session.binding.barcode,name:session.name,brand:session.brand},{apiKey:deps.apiKey,fetch:providerFetch,deadline:deps.deadline,readLabel:readPhotos});}
  catch{searchCode='search_unavailable';}
  const candidates=distinctCandidates(found.candidates).map((candidate:any)=>{
    const conflict=conflictsWithPhoto(candidate,photo||partialEvidence);
    // Once physical label evidence exists it wins; online data cannot overwrite it.
    return {...candidate,conflicts:[...new Set([...(candidate.conflicts||[]),...conflict])],validated:candidate.validated&&!conflict.length};
  });
  const signCandidate=async(candidate:any)=>{
    const eligible=candidateEligible(candidate,session.binding.barcode);
    return {...candidate,can_confirm:eligible,
      proposal:eligible?await sealDraft({version:1,kind:'candidate',owner:userId,expires:session.expires,
        submission:session.submission,binding:session.binding,candidate,revision},deps.secret):null};
  };
  console.log('[BarcodeRecovery] outcome', JSON.stringify({submission:session.submission,revision,phase,candidate_count:candidates.length,photo_valid:!!photo,issues:photoIssues.map(({field,reason})=>({field,reason})),search_code:searchCode||null,diagnostics:found.diagnostics||[]}));
  return {status:'review',expires_at:session.expires,session:await sealDraft(session,deps.secret),
    candidates:await Promise.all(candidates.map(signCandidate)),photo:photo?await signCandidate(photo):null,
    issues:photoIssues,source_links:found.source_links,search_code:searchCode};
}

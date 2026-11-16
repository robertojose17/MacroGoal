/** Future stored committed receipt verifier. No writer, issuer or acceptance action.
 * Caller supplies one authentic owner-scoped DB snapshot with authoritative count,
 * current head/profile/journey and all ordered joined receipt+proposal rows. */
import {canonicalRateJson,decodeRateProposalRecord,type RateAnchorReference,type RateAcceptanceRequest,type RateProposalRecord} from './rateProposalRecord.ts';
export const RATE_ACCEPTANCE_CHAIN_RELEASE=Object.freeze({enabled:false} as const);
type Obj=Record<string,any>;
const obj=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[0-9a-f]{12}$/i.test(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const same=(a:unknown,b:unknown)=>canonicalRateJson(a)===canonicalRateJson(b);
const time=(v:unknown)=>{if(typeof v!=='string')return NaN;const m=/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,6})?(Z|[+-]\d\d:\d\d)$/.exec(v);
 if(!m||+m[2]>23||+m[3]>59||+m[4]>59||(m[5]!=='Z'&&(+m[5].slice(1,3)>23||+m[5].slice(4)>59)))return NaN;
 const day=Date.parse(m[1]+'T00:00:00Z');return Number.isFinite(day)&&new Date(day).toISOString().slice(0,10)===m[1]?Date.parse(v):NaN;};
export async function rateReceiptContentDigest(content:string):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function rateReceiptDigest(unsigned:unknown):Promise<string>{return rateReceiptContentDigest(canonicalRateJson(unsigned));}
export type CommittedRateReceipt={
 version:'rate-acceptance-receipt-v1';status:'committed';sequence:number;request:RateAcceptanceRequest;anchorReference:RateAnchorReference;
 previousGoalSnapshot:Obj;acceptedGoalSnapshot:Obj;acceptedAt:number;deltaKcal:number;netDeltaKcal:number;
 previousReceiptDigest:string|null;receiptDigest:string;canonicalContent:string;canonicalEncoding?:'pg-jsonb-v1';
 acceptanceEvidence:{contract:'rate-as-of-revalidated-v1';sourceFingerprint:string;sourceCapturedAt:number;reviewId:string;reviewVersion:number;policyDigest:string;profileBinding:string;journeyBinding:string};
};
export type VerifiedRateChain={kind:'rate_chain_verified';actionable:false;acceptanceAuthorized:false;anchorReference:RateAnchorReference;
 acceptedCount:number;acceptedDeltaKcal:number;lastAcceptedAt:number|null;lastReceiptDigest:string|null;currentGoal:Obj;receiptsVerified:true};
const fail=():never=>{throw Error('rate_receipt_chain_unverified');};
/** New subsequent-state verification path. Does not weaken initial-anchor checks.
 * Hashes prove integrity only, not that a fabricated receipt was really committed. */
export async function verifyRateAcceptanceChain(value:unknown,now:number,digestText:(value:string)=>Promise<string>=rateReceiptContentDigest):Promise<VerifiedRateChain>{
 try{
  if(!obj(value)||value.version!=='rate-acceptance-chain-source-v1'||!uuid(value.ownerId)||!integer(now)||now<0||
   !integer(value.capturedAt)||value.capturedAt>now||now-value.capturedAt>30000||!obj(value.anchorHead)||
   !Array.isArray(value.rows)||!integer(value.totalCount)||value.totalCount<0||value.totalCount>1000||value.rows.length!==value.totalCount||!obj(value.currentGoal))return fail();
  const owner=value.ownerId,h=value.anchorHead,a=h.anchor;
  if(h.kind!=='rate_anchor_head'||h.ownerId!==owner||!integer(h.version)||h.version<1||!uuid(h.sourceRequestId)||!uuid(h.sourceGoalId)||
   !obj(a)||a.contract!=='accepted-intake-rate-anchor-v1'||a.ownerId!==owner||a.initialGoalId!==h.sourceGoalId||
   !obj(a.sourceReceipt)||a.sourceReceipt.requestId!==h.sourceRequestId||!['initial_onboarding','manual_goal'].includes(a.sourceReceipt.operation)||!obj(a.baselineGoalSnapshot)||
   a.baselineGoalSnapshot.id!==h.sourceGoalId||a.baselineGoalSnapshot.user_id!==owner||a.baselineGoalSnapshot.is_active!==true||
   !integer(a.acceptedAt)||a.acceptedAt<0||a.acceptedAt>now||a.acceptedAt!==time(a.initialGoalRevision)||a.initialGoalRevision!==a.baselineGoalSnapshot.updated_at||time(a.baselineGoalSnapshot.created_at)!==a.acceptedAt||
   !integer(a.baselineIntakeKcal)||a.baselineIntakeKcal<=0||a.baselineIntakeKcal!==a.baselineGoalSnapshot.daily_calories||
   a.acceptedCount!==0||a.acceptedDeltaKcal!==0||a.lastAcceptedAt!==null||a.earliestReviewAt!==a.acceptedAt+14*86400000||
   !hash(a.profileBinding)||!hash(a.journeyBinding)||value.currentProfileBinding!==a.profileBinding||value.currentJourneyBinding!==a.journeyBinding||
   value.currentJourneyStartDate!==a.journeyStartDate||value.currentJourneyRestartCount!==a.journeyRestartCount)return fail();
  const ref:RateAnchorReference={ownerId:owner,version:h.version,sourceRequestId:h.sourceRequestId,sourceGoalId:h.sourceGoalId};
  let prior=a.baselineGoalSnapshot,net=0,last=a.acceptedAt,lastDigest:string|null=null;
  const requestIds=new Set<string>(),proposalIds=new Set<string>(),goalIds=new Set<string>([prior.id]);
  for(let index=0;index<value.rows.length;index++){
   const row=value.rows[index];if(!obj(row)||!obj(row.receipt)||!obj(row.proposal))return fail();
   const r=row.receipt as CommittedRateReceipt,q=r.request,p=row.proposal as RateProposalRecord;
   const encoding=r.canonicalEncoding;
   const expectedKeys='acceptanceEvidence,acceptedAt,acceptedGoalSnapshot,anchorReference,canonicalContent,'+(encoding==='pg-jsonb-v1'?'canonicalEncoding,':'')+'deltaKcal,netDeltaKcal,previousGoalSnapshot,previousReceiptDigest,receiptDigest,request,sequence,status,version';
   if((encoding!==undefined&&encoding!=='pg-jsonb-v1')||Object.keys(r).sort().join(',')!==expectedKeys||
    r.version!=='rate-acceptance-receipt-v1'||r.status!=='committed'||r.sequence!==index+1||!integer(r.acceptedAt)||r.acceptedAt<=last||r.acceptedAt>value.capturedAt||
    r.previousReceiptDigest!==lastDigest||!hash(r.receiptDigest)||!same(r.anchorReference,ref)||!obj(q)||
    Object.keys(q).sort().join(',')!=='anchorReference,ownerId,rateProposalDigest,rateProposalId,requestId,version'||
    q.version!=='rate-acceptance-request-v1'||q.ownerId!==owner||!uuid(q.requestId)||!uuid(q.rateProposalId)||!hash(q.rateProposalDigest)||
    !same(q.anchorReference,ref)||requestIds.has(q.requestId)||proposalIds.has(q.rateProposalId))return fail();
   const {receiptDigest,canonicalContent,...unsigned}=r;if(typeof canonicalContent!=='string'||new TextEncoder().encode(canonicalContent).byteLength>65536||(encoding==='pg-jsonb-v1'?!same(JSON.parse(canonicalContent),unsigned):canonicalContent!==canonicalRateJson(unsigned))||await digestText(canonicalContent)!==receiptDigest)return fail();
   if(!await decodeRateProposalRecord(canonicalRateJson(p),{ownerId:owner,proposalId:q.rateProposalId,digest:q.rateProposalDigest},r.acceptedAt,digestText))return fail();
   const payload=p.payload,g=r.acceptedGoalSnapshot,old=r.previousGoalSnapshot,policy=payload.policySnapshot,review=payload.reviewedRate,evidence=r.acceptanceEvidence;
   if(!same(payload.anchorReference,ref)||!same(payload.anchorSnapshot,a)||!same(old,prior)||!same(payload.goalSnapshot,prior)||
    !obj(g)||g.user_id!==owner||g.is_active!==true||!uuid(g.id)||goalIds.has(g.id)||
    !obj(policy)||!obj(review)||!obj(evidence)||!hash(policy.digest)||!uuid(review.reviewId)||!integer(review.reviewVersion)||review.reviewVersion<1||payload.profileBinding!==a.profileBinding||payload.journeyBinding!==a.journeyBinding||
    !integer(payload.preparedAt)||payload.preparedAt>r.acceptedAt||!integer(payload.sourceCapturedAt)||payload.sourceCapturedAt>payload.preparedAt||r.acceptedAt-payload.sourceCapturedAt>30000||
    evidence.contract!=='rate-as-of-revalidated-v1'||evidence.sourceFingerprint!==payload.sourceFingerprint||!hash(evidence.sourceFingerprint)||evidence.sourceCapturedAt!==payload.sourceCapturedAt||
    evidence.profileBinding!==a.profileBinding||evidence.journeyBinding!==a.journeyBinding||evidence.policyDigest!==payload.policyBinding?.digest||
    evidence.reviewId!==review.reviewId||evidence.reviewVersion!==review.reviewVersion||
    review.ownerId!==owner||review.goalId!==old.id||review.goalRevision!==old.updated_at||review.profileBinding!==a.profileBinding||review.journeyBinding!==a.journeyBinding||
    review.policyDigest!==policy.digest||review.policyVersion!==policy.version||review.sourceFingerprint!==payload.sourceFingerprint||review.sourceCapturedAt!==payload.sourceCapturedAt||
    !integer(review.reviewedAt)||review.reviewedAt<payload.sourceCapturedAt||review.reviewedAt>r.acceptedAt||!integer(review.expiresAt)||review.expiresAt<=r.acceptedAt||
    review.uncertainty?.validated!==true||review.uncertainty?.stable!==true||review.conversion?.reviewed!==true||review.conversion?.model!=='approximate-energy-equivalent-v1'||review.conversion?.kcalPerKg!==7700||
    policy.enabled!==true||policy.reviewed!==true||policy.snapshot_contract_reviewed!==true||policy.engine_version!=='rate-review-14d-v1'||
    payload.policyBinding?.version!==policy.version||payload.policyBinding?.digest!==policy.digest||payload.policyBinding?.engineVersion!==policy.engine_version||
    !Number.isFinite(time(policy.expires_at))||time(policy.expires_at)<=r.acceptedAt)return fail();
   for(const field of ['max_step_kcal','max_step_fraction','max_cumulative_delta_kcal','min_days_between_acceptances','increment_kcal','min_intake_kcal','max_intake_kcal'])if(typeof policy[field]!=='number'||!Number.isFinite(policy[field])||policy[field]<=0)return fail();
   if(policy.max_step_kcal>200||policy.max_step_fraction>1||!integer(policy.increment_kcal)||!integer(policy.min_days_between_acceptances)||policy.min_days_between_acceptances<14||policy.max_intake_kcal<policy.min_intake_kcal||
    r.acceptedAt-last<policy.min_days_between_acceptances*86400000||!integer(r.deltaKcal)||r.deltaKcal<=0||r.deltaKcal>policy.max_step_kcal||
    r.deltaKcal>old.daily_calories*policy.max_step_fraction||r.deltaKcal%policy.increment_kcal!==0||r.deltaKcal!==payload.deltaKcal||
    r.netDeltaKcal!==net+r.deltaKcal||r.netDeltaKcal!==payload.netDeltaKcal||r.netDeltaKcal>policy.max_cumulative_delta_kcal)return fail();
   const target=payload.target;
   if(!obj(target)||g.daily_calories!==old.daily_calories+r.deltaKcal||g.daily_calories!==a.baselineIntakeKcal+r.netDeltaKcal||
    g.daily_calories<policy.min_intake_kcal||g.daily_calories>policy.max_intake_kcal||g.base_daily_calories!==a.baselineIntakeKcal||
    time(g.created_at)!==r.acceptedAt||time(g.updated_at)!==r.acceptedAt||time(g.last_adaptive_update)!==r.acceptedAt)return fail();
   for(const [goalKey,targetKey] of [['daily_calories','calories'],['protein_g','proteinG'],['carbs_g','carbsG'],['fats_g','fatsG'],['fiber_g','fiberG']])if(!integer(g[goalKey])||g[goalKey]<0||g[goalKey]>10000||g[goalKey]!==target[targetKey])return fail();
   if(Math.abs(g.daily_calories-4*g.protein_g-4*g.carbs_g-9*g.fats_g)>10)return fail();
   const mutable=new Set(['id','daily_calories','protein_g','carbs_g','fats_g','fiber_g','is_active','last_adaptive_update','created_at','updated_at','base_daily_calories']);
   const stable=(goal:Obj)=>Object.fromEntries(Object.entries(goal).filter(([key])=>!mutable.has(key)));
   if(!same(stable(old),stable(g))||!same(payload.current,{calories:old.daily_calories,proteinG:old.protein_g,carbsG:old.carbs_g,fatsG:old.fats_g,fiberG:old.fiber_g}))return fail();
   prior=g;net=r.netDeltaKcal;last=r.acceptedAt;lastDigest=r.receiptDigest;requestIds.add(q.requestId);proposalIds.add(q.rateProposalId);goalIds.add(g.id);
  }
  if(!same(prior,value.currentGoal)||value.currentGoal.user_id!==owner||value.currentGoal.is_active!==true)return fail();
  return {kind:'rate_chain_verified',actionable:false,acceptanceAuthorized:false,anchorReference:ref,acceptedCount:value.rows.length,acceptedDeltaKcal:net,
   lastAcceptedAt:value.rows.length?last:null,lastReceiptDigest:lastDigest,currentGoal:structuredClone(prior),receiptsVerified:true};
 }catch{return fail();}
}

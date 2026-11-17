/** Future stored committed receipt verifier. No writer, issuer or acceptance action.
 * Caller supplies one authentic owner-scoped DB snapshot with authoritative count,
 * current head/profile/journey and all ordered joined receipt+proposal rows. */
import {canonicalRateJson,type RateAnchorReference} from './rateProposalRecord.ts';
import {decodeRules14Record,type Rules14Record} from './rules14Proposal.ts';
import {adjustRules14Macros,type Rules14MacroContext} from './smartMacroAdjustment.ts';
// goals.last_adaptive_update is DATE, not a timestamp. The server records the
// actual acceptance timezone; receipt/goal timestamps retain millisecond precision.
export function acceptedGoalDate(acceptedAt:number, timezone:unknown):string|null {
 if(!Number.isSafeInteger(acceptedAt)||typeof timezone!=='string'||!timezone)return null;
 try {const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(acceptedAt));
 const part=(type:string)=>parts.find(p=>p.type===type)?.value;
 const result=`${part('year')}-${part('month')}-${part('day')}`;
 return /^\d{4}-\d{2}-\d{2}$/.test(result)?result:null;
 }catch{return null;}
}
export const RULES14_ACCEPTANCE_CHAIN_RELEASE=Object.freeze({enabled:false} as const);
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
export type VerifiedRules14Chain={kind:'rules14_chain_verified';actionable:false;acceptanceAuthorized:false;anchorReference:RateAnchorReference;
 acceptedCount:number;acceptedDeltaKcal:number;lastAcceptedAt:number|null;lastReceiptDigest:string|null;currentGoal:Obj;receiptsVerified:true};
const fail=():never=>{throw Error('rules14_receipt_chain_unverified');};
/** New subsequent-state verification path. Does not weaken initial-anchor checks.
 * Hashes prove integrity only, not that a fabricated receipt was really committed. */
export async function verifyRules14AcceptanceChain(value:unknown,now:number,digestText:(value:string)=>Promise<string>=rateReceiptContentDigest):Promise<VerifiedRules14Chain>{
 try{
  if(!obj(value)||value.version!=='rules14-chain-source-v1'||!uuid(value.ownerId)||!integer(now)||now<0||
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
   const r=row.receipt as Obj,q=r.request,p=row.proposal as Rules14Record;
   const encoding=r.canonicalEncoding;
   const expectedKeys='acceptanceEvidence,acceptedAt,acceptedGoalSnapshot,anchorReference,canonicalContent,'+(encoding==='pg-jsonb-v1'?'canonicalEncoding,':'')+'deltaKcal,netDeltaKcal,previousGoalSnapshot,previousReceiptDigest,receiptDigest,request,sequence,status,version';
   if(encoding!=='pg-jsonb-v1'||Object.keys(r).sort().join(',')!==expectedKeys||
    r.version!=='rules14-acceptance-receipt-v1'||r.status!=='committed'||r.sequence!==index+1||!integer(r.acceptedAt)||r.acceptedAt<=last||r.acceptedAt>value.capturedAt||
    r.previousReceiptDigest!==lastDigest||!hash(r.receiptDigest)||!same(r.anchorReference,ref)||!obj(q)||
    Object.keys(q).sort().join(',')!=='anchorReference,ownerId,rateProposalDigest,rateProposalId,requestId,version'||
    q.version!=='rules14-acceptance-request-v1'||q.ownerId!==owner||!uuid(q.requestId)||!uuid(q.rateProposalId)||!hash(q.rateProposalDigest)||
    !same(q.anchorReference,ref)||requestIds.has(q.requestId)||proposalIds.has(q.rateProposalId))return fail();
   const {receiptDigest,canonicalContent,...unsigned}=r;if(typeof canonicalContent!=='string'||new TextEncoder().encode(canonicalContent).byteLength>65536||(encoding==='pg-jsonb-v1'?!same(JSON.parse(canonicalContent),unsigned):canonicalContent!==canonicalRateJson(unsigned))||await digestText(canonicalContent)!==receiptDigest)return fail();
   if(!await decodeRules14Record(p,owner,r.acceptedAt,digestText)||p.id!==q.rateProposalId||p.digest!==q.rateProposalDigest)return fail();
   const payload=p.payload,g=r.acceptedGoalSnapshot,old=r.previousGoalSnapshot,policy=payload.policySnapshot,screening=payload.screeningEvidence,evidence=r.acceptanceEvidence;
   if(!same(payload.anchorReference,ref)||!same(payload.anchorSnapshot,a)||!same(old,prior)||!same(payload.goalSnapshot,prior)||
    !obj(g)||g.user_id!==owner||g.is_active!==true||!uuid(g.id)||goalIds.has(g.id)||
    !obj(policy)||!obj(screening)||!obj(evidence)||!hash(policy.digest)||payload.profileBinding!==a.profileBinding||payload.journeyBinding!==a.journeyBinding||
    !integer(payload.preparedAt)||payload.preparedAt>r.acceptedAt||!integer(payload.sourceCapturedAt)||payload.sourceCapturedAt>payload.preparedAt||r.acceptedAt-payload.sourceCapturedAt>30000||p.expiresAt>payload.sourceCapturedAt+30000||
    evidence.contract!=='rules14-as-of-revalidated-v1'||evidence.sourceFingerprint!==payload.sourceFingerprint||!hash(evidence.sourceFingerprint)||evidence.sourceCapturedAt!==payload.sourceCapturedAt||
    evidence.profileBinding!==a.profileBinding||evidence.journeyBinding!==a.journeyBinding||evidence.policyDigest!==policy.digest||evidence.policyRevision!==policy.revision||
    screening.version!=='rules-screening-v1'||screening.copyVersion!=='rules-screening-copy-v1'||screening.ownerId!==owner||screening.current!==true||screening.response!=='eligible'||
    !uuid(screening.requestId)||!integer(screening.rowVersion)||screening.rowVersion<1||evidence.screeningRequestId!==screening.requestId||evidence.screeningVersion!==screening.rowVersion||
    screening.profileBinding!==a.profileBinding||screening.journeyBinding!==a.journeyBinding||screening.profileUpdatedAt!==payload.profileUpdatedAt||
    !Number.isFinite(time(screening.acceptedAt))||time(screening.acceptedAt)>r.acceptedAt||!Number.isFinite(time(screening.expiresAt))||time(screening.expiresAt)<=r.acceptedAt||
    policy.enabled!==true||policy.scope!=='screened-adult-general-v1'||policy.engine_version!=='rules14-v1'||!integer(policy.revision)||policy.revision<1||
    payload.policyBinding?.version!==policy.version||payload.policyBinding?.revision!==policy.revision||payload.policyBinding?.digest!==policy.digest||payload.policyBinding?.engineVersion!==policy.engine_version||
    !Number.isFinite(time(policy.expires_at))||time(policy.expires_at)<=r.acceptedAt||
    !same(payload.historyBinding,{acceptedCount:index,acceptedDeltaKcal:net,lastAcceptedAt:index?last:null,lastReceiptDigest:lastDigest,baselineAcceptedAt:a.acceptedAt,baselineIntakeKcal:a.baselineIntakeKcal}))return fail();
   const n=payload.nutritionEvidence,pe=n?.policyEvidence,d=payload.decision;
   if(!obj(n)||!obj(pe)||pe.version!=='nutrition-policy-application-v1'||pe.policyVersion!==policy.version||pe.policyDigest!==policy.digest||
    pe.profileBinding!==a.profileBinding||pe.journeyBinding!==a.journeyBinding||pe.sourceFingerprint!==payload.sourceFingerprint||
    pe.expiresAt>Math.min(p.expiresAt,time(screening.expiresAt),time(policy.expires_at))||
    !obj(d)||d.version!=='rules14-decision-v1'||d.kind!=='rules14_candidate'||d.deltaKcal!==payload.deltaKcal||d.netDeltaKcal!==payload.netDeltaKcal||d.targetCalories!==payload.target?.calories||
    d.sourceFingerprint!==payload.sourceFingerprint||d.sourceCapturedAt!==payload.sourceCapturedAt||d.conversion?.kcalPerKg!==7700||d.conversion?.statisticalConfidenceClaim!==false)return fail();
   const nr=payload.nutritionReference,ratio=old.goal_type==='lose'?policy.protein_min_g_per_kg_loss:policy.protein_min_g_per_kg_other;
   if(!obj(nr)||nr.strategy!=='actual-known-non-obese-weight-v1'||!Number.isFinite(nr.weightKg)||nr.weightKg<=0||!Number.isFinite(nr.heightCm)||nr.heightCm<100||nr.heightCm>250||
    nr.bmi!==nr.weightKg/(nr.heightCm/100)**2||nr.bmi<18.5||nr.bmi>=30||!Number.isFinite(ratio)||ratio<=0||policy.protein_max_g_per_kg<ratio||policy.protein_max_g_per_kg>4||policy.fat_min_fraction<.2||policy.fat_max_fraction>.35||policy.carbs_min_g<130||
    !same(n.limits,{proteinMinG:ratio*nr.weightKg,proteinMaxG:policy.protein_max_g_per_kg*nr.weightKg,carbsMinG:policy.carbs_min_g,carbsMaxG:10000,fatsMinG:0,fatsMaxG:10000,fatMinFraction:policy.fat_min_fraction,fatMaxFraction:policy.fat_max_fraction})||
    !same(n.binding,{ownerId:owner,goalId:old.id,goalRevision:old.updated_at,preset:old.macro_preset,sourceFingerprint:payload.sourceFingerprint,policyVersion:policy.version,policyDigest:policy.digest})||!obj(n.customChoice)||!uuid(n.customChoice.consentId)||!integer(n.customChoice.choiceVersion)||n.customChoice.choiceVersion<1)return fail();
   const logs=d.loggedIntake,sen=d.sensitivity,avg=logs?.averageLoggedCaloriesOnConfirmedDays,observed=d.observedRateKgPerWeek,targetRate=d.targetRateKgPerWeek;
   if(!obj(logs)||logs.status!=='explicit_confirmed_days'||!Number.isFinite(avg)||avg<=0||avg>10000||!integer(logs.validCalorieDayCount)||logs.validCalorieDayCount<10||logs.unknownCalorieDayCount!==0||logs.confirmedDayCount!==logs.validCalorieDayCount||
    !obj(sen)||sen.status!=='descriptive'||sen.outsideToleranceAcrossEnvelope!==true||![observed,targetRate,sen.lowerKgPerWeek,sen.upperKgPerWeek].every(Number.isFinite)||sen.lowerKgPerWeek>sen.upperKgPerWeek)return fail();
   const expenditure=avg-observed*7700/7,lo=avg-old.daily_calories+(targetRate-sen.upperKgPerWeek)*7700/7,hi=avg-old.daily_calories+(targetRate-sen.lowerKgPerWeek)*7700/7;
   const raw=Math.abs(lo)<Math.abs(hi)?lo:hi,sign=Math.sign(raw),edge=raw===lo?sen.upperKgPerWeek:sen.lowerKgPerWeek;
   const room=sign<0?Math.min(policy.max_total_deficit_kcal,expenditure*policy.max_total_deficit_fraction)-(expenditure-old.daily_calories):Infinity;
   const cap=Math.min(room,Math.abs(raw),200,policy.max_step_kcal,old.daily_calories*policy.max_step_fraction,sign>0?policy.max_cumulative_delta_kcal-net:policy.max_cumulative_delta_kcal+net,sign>0?policy.max_intake_kcal-old.daily_calories:old.daily_calories-policy.min_intake_kcal);
   if(!Number.isFinite(expenditure)||expenditure<=0||expenditure>10000||(lo<=0&&hi>=0)||sign!==Math.sign(targetRate-observed)||d.estimatedExpenditureKcal!==expenditure||d.desiredIntakeKcal!==expenditure+targetRate*7700/7||
    d.deltaKcal!==sign*Math.floor((cap+1e-9)/policy.increment_kcal)*policy.increment_kcal||!same(d.calculation,{method:'confirmed-intake-plus-target-minus-observed-v1',edgeKgPerWeek:edge,unroundedDeltaKcal:raw,arithmeticEpsilonKcal:1e-9,incrementKcal:policy.increment_kcal}))return fail();
   const macro=adjustRules14Macros({current:payload.current,newCalories:payload.target?.calories,now:r.acceptedAt,sourceFingerprint:payload.sourceFingerprint,binding:n.binding,context:n as Rules14MacroContext});
   if(macro.kind!=='candidate'||!same(macro.target,payload.target)||macro.allocationMode!==payload.allocationMode)return fail();
   for(const field of ['max_step_kcal','max_step_fraction','max_cumulative_delta_kcal','min_days_between_acceptances','increment_kcal','min_intake_kcal','max_intake_kcal'])if(typeof policy[field]!=='number'||!Number.isFinite(policy[field])||policy[field]<=0)return fail();
   if(policy.max_step_kcal>200||policy.max_step_fraction>1||!integer(policy.increment_kcal)||!integer(policy.min_days_between_acceptances)||policy.min_days_between_acceptances<14||policy.max_intake_kcal<policy.min_intake_kcal||
    r.acceptedAt-last<policy.min_days_between_acceptances*86400000||!integer(r.deltaKcal)||r.deltaKcal===0||Math.abs(r.deltaKcal)>policy.max_step_kcal||
    Math.abs(r.deltaKcal)>old.daily_calories*policy.max_step_fraction||r.deltaKcal%policy.increment_kcal!==0||r.deltaKcal!==payload.deltaKcal||
    r.netDeltaKcal!==net+r.deltaKcal||r.netDeltaKcal!==payload.netDeltaKcal||Math.abs(r.netDeltaKcal)>policy.max_cumulative_delta_kcal)return fail();
   if(r.deltaKcal<0){const de=d.deficitEvidence;
    if(!obj(de)||de.version!=='rules14-deficit-evidence-v1'||de.method!=='confirmed-intake-minus-observed-rate-v1'||de.measuredExpenditure!==false||de.clinicalGuarantee!==false||
     de.averageLoggedCaloriesOnConfirmedDays!==avg||de.confirmedDayCount!==logs.confirmedDayCount||de.observedRateKgPerWeek!==observed||de.approximateKcalPerKg!==7700||de.estimatedExpenditureKcal!==expenditure||!Number.isFinite(de.estimatedExpenditureKcal)||de.estimatedExpenditureKcal<=0||de.totalDeficitKcal!==de.estimatedExpenditureKcal-payload.target.calories||
     de.maxAllowedDeficitKcal!==Math.min(policy.max_total_deficit_kcal,de.estimatedExpenditureKcal*policy.max_total_deficit_fraction)||de.totalDeficitKcal>de.maxAllowedDeficitKcal+1e-9)return fail();}
   const target=payload.target;
   if(!obj(target)||g.daily_calories!==old.daily_calories+r.deltaKcal||g.daily_calories!==a.baselineIntakeKcal+r.netDeltaKcal||
    g.daily_calories<policy.min_intake_kcal||g.daily_calories>policy.max_intake_kcal||g.base_daily_calories!==a.baselineIntakeKcal||
    time(g.created_at)!==r.acceptedAt||time(g.updated_at)!==r.acceptedAt||acceptedGoalDate(r.acceptedAt,evidence.acceptanceTimezone)===null||g.last_adaptive_update!==acceptedGoalDate(r.acceptedAt,evidence.acceptanceTimezone))return fail();
   for(const [goalKey,targetKey] of [['daily_calories','calories'],['protein_g','proteinG'],['carbs_g','carbsG'],['fats_g','fatsG'],['fiber_g','fiberG']])if(!integer(g[goalKey])||g[goalKey]<0||g[goalKey]>10000||g[goalKey]!==target[targetKey])return fail();
   if(Math.abs(g.daily_calories-4*g.protein_g-4*g.carbs_g-9*g.fats_g)>10)return fail();
   const mutable=new Set(['id','daily_calories','protein_g','carbs_g','fats_g','fiber_g','is_active','last_adaptive_update','created_at','updated_at','base_daily_calories']);
   const stable=(goal:Obj)=>Object.fromEntries(Object.entries(goal).filter(([key])=>!mutable.has(key)));
   if(!same(stable(old),stable(g))||!same(payload.current,{calories:old.daily_calories,proteinG:old.protein_g,carbsG:old.carbs_g,fatsG:old.fats_g,fiberG:old.fiber_g}))return fail();
   prior=g;net=r.netDeltaKcal;last=r.acceptedAt;lastDigest=r.receiptDigest;requestIds.add(q.requestId);proposalIds.add(q.rateProposalId);goalIds.add(g.id);
  }
  if(!same(prior,value.currentGoal)||value.currentGoal.user_id!==owner||value.currentGoal.is_active!==true)return fail();
  return {kind:'rules14_chain_verified',actionable:false,acceptanceAuthorized:false,anchorReference:ref,acceptedCount:value.rows.length,acceptedDeltaKcal:net,
   lastAcceptedAt:value.rows.length?last:null,lastReceiptDigest:lastDigest,currentGoal:structuredClone(prior),receiptsVerified:true};
 }catch{return fail();}
}


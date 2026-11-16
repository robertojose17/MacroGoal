/** Private administrative getter decoder, not reviewer authentication or HTTP input. */
import {diagnoseSnapshotRateReview} from './snapshotReviewContextParser.ts';
import type {FourteenDayReview} from './fourteenDayProposal.ts';
import type {ServerPolicyBinding} from './snapshotReviewOrchestration.ts';
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const text=(x:unknown,n:number):x is string=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
const hash=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const uuid=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
const instant=(x:unknown):number=>{
 if(typeof x!=='string')return NaN;
 const m=/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,6})?(Z|[+-]\d\d:\d\d)$/.exec(x);
 if(!m||Number(m[2])>23||Number(m[3])>59||Number(m[4])>59)return NaN;
 const day=Date.parse(m[1]+'T00:00:00Z');
 if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==m[1])return NaN;
 if(m[5]!=='Z'&&(Number(m[5].slice(1,3))>23||Number(m[5].slice(4,6))>59))return NaN;
 return Date.parse(x);
};
export type RateReviewRequest={ownerId:string;goalId:string;goalRevision:string;profileUpdatedAt:string;profileBinding:string;journeyBinding:string;policyVersion:string;policyDigest:string;engineVersion:'rate-review-14d-v1';sourceFingerprint:string;sourceCapturedAt:number;windowStart:string;windowEndExclusive:string};
export type StoredRateReview=FourteenDayReview&{reviewVersion:number;profileBinding:string;approvalDigest:string;approvalVersion:string};
export function rateReviewRequest(snapshot:unknown,actor:string,policy:ServerPolicyBinding,now:number):RateReviewRequest|null{
 if(!obj(snapshot)||!obj(snapshot.profile)||!obj(snapshot.readiness)||!obj(snapshot.policy)||!uuid(actor)||
  policy?.engineVersion!=='rate-review-14d-v1'||snapshot.policy.version!==policy.version||snapshot.policy.digest!==policy.digest||snapshot.policy.engine_version!==policy.engineVersion||
  !hash(snapshot.readiness.profileBinding)||!hash(snapshot.readiness.journeyBinding))return null;
 const d=diagnoseSnapshotRateReview(snapshot,actor,now);
 if(d.kind==='blocked'||!d.initialCoverage.coverageSufficient||d.paceComparison.status!=='comparison'||!d.paceComparison.outsideProductTolerance)return null;
 return {ownerId:actor,goalId:d.goalId,goalRevision:d.goalRevision,profileUpdatedAt:snapshot.profile.updatedAt as string,
  profileBinding:snapshot.readiness.profileBinding as string,journeyBinding:snapshot.readiness.journeyBinding as string,
  policyVersion:policy.version,policyDigest:policy.digest,engineVersion:policy.engineVersion,
  sourceFingerprint:d.sourceFingerprint,sourceCapturedAt:Date.parse(d.sourceCapturedAt),windowStart:d.window.startDate,windowEndExclusive:d.window.endDateExclusive};
}
/** Only the fixed service-only SQL getter may supply value. Request booleans are not approval. */
export function rateReviewEvidence(expected:RateReviewRequest,value:unknown,now:number):StoredRateReview|null{
 if(!expected||!obj(value)||!obj(value.binding)||!obj(value.provenance)||!obj(value.interval)||!obj(value.conversion))return null;
 const b=value.binding,p=value.provenance,i=value.interval,c=value.conversion;
 if(value.version!=='rate-review-record-v1'||value.actionable!==false||value.decision!=='reviewed'||!uuid(value.reviewId)||
  !Number.isSafeInteger(value.reviewVersion)||(value.reviewVersion as number)<1||
  Object.keys(b).length!==Object.keys(expected).length||!Object.keys(expected).every(k=>b[k]===expected[k as keyof RateReviewRequest])||
  !text(value.methodVersion,128)||!text(p.approvalRef,2048)||!hash(p.approvalDigest)||!text(p.approvalVersion,128)||!text(p.verifiedBy,200)||
  typeof i.lowerKgPerWeek!=='number'||!Number.isFinite(i.lowerKgPerWeek)||typeof i.upperKgPerWeek!=='number'||!Number.isFinite(i.upperKgPerWeek)||i.lowerKgPerWeek>i.upperKgPerWeek||
  c.model!=='approximate-energy-equivalent-v1'||c.kcalPerKg!==7700)return null;
 const source=expected.sourceCapturedAt,captured=instant(value.capturedAt),reviewed=instant(value.reviewedAt),expires=instant(value.expiresAt),verified=instant(p.verifiedAt),recorded=instant(value.recordedAt);
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(source)||![captured,reviewed,expires,verified,recorded].every(Number.isSafeInteger)||
  source>reviewed||reviewed>verified||verified>recorded||recorded>captured||captured>now||now-source>30000||expires<=now||expires<=reviewed)return null;
 return {version:'fourteen-day-reviewed-input-v1',reviewId:value.reviewId as string,reviewVersion:value.reviewVersion as number,
  methodVersion:value.methodVersion as string,reviewedAt:reviewed,expiresAt:expires,...expected,
  approvalDigest:p.approvalDigest as string,approvalVersion:p.approvalVersion as string,
  uncertainty:{validated:true,stable:true,lowerKgPerWeek:i.lowerKgPerWeek,upperKgPerWeek:i.upperKgPerWeek},
  conversion:{reviewed:true,model:'approximate-energy-equivalent-v1',kcalPerKg:7700}};
}

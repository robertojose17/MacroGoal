/** Private server boundary. This validates an administrative read, not reviewer credentials.
 * No default review, inferred approval, I/O, policy seeding or client-supplied authority.
 */
import type {SnapshotMacroRequest,SnapshotMacroEvidence} from './snapshotReviewContextParser.ts';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{12}$/i.test(v);
const time=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
const goalKeys=['calories','proteinG','carbsG','fatsG','fiberG'] as const;
const bindingKeys=['goalId','goalRevision','preset','profileUpdatedAt','profileBinding','journeyBinding','policyVersion','policyDigest','engineVersion'] as const;
const limitKeys=['proteinMinG','proteinMaxG','carbsMinG','carbsMaxG','fatsMinG','fatsMaxG','fatMinFraction','fatMaxFraction'] as const;
export function nutritionReviewExpected(request:SnapshotMacroRequest,engineVersion:string){
 return {goalId:request.binding.goalId,goalRevision:request.binding.goalRevision,preset:request.binding.preset,
 current:structuredClone(request.current),profileUpdatedAt:request.profileUpdatedAt,profileBinding:request.profileBinding,
 journeyBinding:request.journeyBinding,policyVersion:request.binding.policyVersion,policyDigest:request.binding.policyDigest,engineVersion};
}
/** The caller must obtain value from the fixed service-only getter, never a request/RPC echo. */
export function nutritionReviewEvidence(actor:string,request:SnapshotMacroRequest,engineVersion:string,value:unknown,now:number):SnapshotMacroEvidence['review']{
 if(!uuid(actor)||request.binding.ownerId!==actor||!text(engineVersion,128)||!object(value))return null;
 const expected=nutritionReviewExpected(request,engineVersion),b=value.binding,limits=value.limits,p=value.provenance;
 if(value.version!=='nutrition-review-record-v1'||value.ownerId!==actor||value.actionable!==false||
  value.decision!=='eligible'||!uuid(value.reviewId)||!Number.isSafeInteger(value.reviewVersion)||(value.reviewVersion as number)<1||
  !object(b)||Object.keys(b).length!==10||!bindingKeys.every(k=>b[k]===expected[k])||!object(b.current)||
  Object.keys(b.current).length!==5||!goalKeys.every(k=>b.current[k]===expected.current[k])||
  !object(limits)||Object.keys(limits).length!==8||
  !limitKeys.every(k=>typeof limits[k]==='number'&&Number.isFinite(limits[k]))||
  !object(p)||!text(p.approvalRef,2048)||typeof p.approvalSha256!=='string'||!/^[a-f0-9]{64}$/.test(p.approvalSha256)||
  !text(p.approvalVersion,128)||!text(p.verifiedBy,256))return null;
 const captured=time(value.capturedAt),source=time(request.sourceCapturedAt),reviewed=time(value.reviewedAt),expires=time(value.expiresAt),verified=time(p.verifiedAt);
 if(!Number.isFinite(now)||!Number.isFinite(captured)||captured>now||now-captured>30000||
  !Number.isFinite(source)||source>captured||now-source>30000||
  !Number.isFinite(reviewed)||reviewed>verified||!Number.isFinite(verified)||verified>captured||
  !Number.isFinite(expires)||expires<=now||expires<=reviewed||
  !Number.isSafeInteger(request.ageYears)||request.ageYears<19||request.ageYears>100)return null;
 for(const k of limitKeys.slice(0,6)){if((limits[k] as number)<0||(limits[k] as number)>10000)return null;}
 if((limits.proteinMinG as number)>(limits.proteinMaxG as number)||(limits.carbsMinG as number)>(limits.carbsMaxG as number)||
  (limits.fatsMinG as number)>(limits.fatsMaxG as number)||(limits.fatMinFraction as number)<0||
  (limits.fatMaxFraction as number)>1||(limits.fatMinFraction as number)>(limits.fatMaxFraction as number))return null;
 return {binding:structuredClone(request.binding),current:structuredClone(request.current),
 review:{status:'reviewed',reviewId:value.reviewId as string,reviewedAt:reviewed,expiresAt:expires,ageYears:request.ageYears,eligibility:'eligible'},
 limits:structuredClone(limits) as NonNullable<SnapshotMacroEvidence['review']>['limits']};
}

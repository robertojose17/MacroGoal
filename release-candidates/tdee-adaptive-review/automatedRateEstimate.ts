/** Research-only producer boundary. Not an operational nutrition/rate review.
 * A schema/digest check does not establish statistical calibration. No path from
 * this draft output to the existing human-reviewed-v1 decoder is provided.
 */
export const AUTOMATED_RATE_ESTIMATE_RELEASE=Object.freeze({enabled:false} as const);
export type RateEstimateBinding={ownerId:string;goalId:string;goalRevision:string;profileUpdatedAt:string;profileBinding:string;journeyBinding:string;policyVersion:string;policyDigest:string;engineVersion:'rate-review-14d-v1';sourceFingerprint:string;sourceCapturedAt:number;windowStart:string;windowEndExclusive:string};
export type ResearchMethodArtifact={version:'rate-method-research-artifact-v1';methodId:string;codeDigest:string;calibrationStatus:'unvalidated';methodApprovedAt:null;evidenceReferences:string[];assumptions:string[];digest:string};
export type EstimateInput={binding:RateEstimateBinding;timezone:string;points:{date:string;kg:number}[]};
export type ResearchEstimate={pointKgPerWeek:number;lowerKgPerWeek:number;upperKgPerWeek:number;diagnostics:Record<string,number>};
export type EstimatePorts={executorCodeDigest:string;now():number;loadMethod():Promise<unknown>;digest(text:string):Promise<string>;estimate(points:EstimateInput['points'],method:ResearchMethodArtifact):Promise<ResearchEstimate>};
const obj=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const hash=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const uuid=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
const stamp=(x:unknown)=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&/^\d{4}-\d\d-\d\dT/.test(x);
const date=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
export function canonicalMethodArtifact(x:Omit<ResearchMethodArtifact,'digest'>){return JSON.stringify({version:x.version,methodId:x.methodId,codeDigest:x.codeDigest,calibrationStatus:x.calibrationStatus,methodApprovedAt:x.methodApprovedAt,evidenceReferences:x.evidenceReferences,assumptions:x.assumptions});}
const blocked=(reason:string)=>({kind:'blocked' as const,reason,actionable:false as const,mayHaveWritten:false as const});
function validBinding(b:unknown,now:number):b is RateEstimateBinding{
 if(!obj(b)||Object.keys(b).sort().join(',')!=='engineVersion,goalId,goalRevision,journeyBinding,ownerId,policyDigest,policyVersion,profileBinding,profileUpdatedAt,sourceCapturedAt,sourceFingerprint,windowEndExclusive,windowStart')return false;
 return uuid(b.ownerId)&&uuid(b.goalId)&&stamp(b.goalRevision)&&stamp(b.profileUpdatedAt)&&[b.profileBinding,b.journeyBinding,b.policyDigest,b.sourceFingerprint].every(hash)&&typeof b.policyVersion==='string'&&b.policyVersion.length>0&&b.policyVersion.length<=128&&b.engineVersion==='rate-review-14d-v1'&&Number.isSafeInteger(b.sourceCapturedAt)&&b.sourceCapturedAt<=now&&now-b.sourceCapturedAt<=30000&&date(b.windowStart)&&date(b.windowEndExclusive)&&Date.parse(b.windowEndExclusive)-Date.parse(b.windowStart)===14*86400000;
}
/** Explicit research seam; caller must use trusted coherent input, not client data.
 * Input is cloned before async work. No registry writes and no approval stamping.
 */
export async function computeResearchRateEstimate(input:unknown,p:EstimatePorts){
 try{
  const captured=structuredClone(input),started=p.now();
  if(!Number.isSafeInteger(started)||!obj(captured)||Object.keys(captured).sort().join(',')!=='binding,points,timezone'||!validBinding(captured.binding,started)||!Array.isArray(captured.points)||captured.points.length<8||captured.points.length>14)return blocked('research_source_invalid');
  const b=captured.binding;
  if(typeof captured.timezone!=='string'||!captured.timezone||captured.timezone.length>128)return blocked('research_calendar_invalid');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:captured.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(b.sourceCapturedAt));
  const localDay=['year','month','day'].map(k=>parts.find(v=>v.type===k)?.value).join('-');
  if(b.windowEndExclusive!==localDay)return blocked('research_calendar_invalid');
  let last='';
  for(const point of captured.points){if(!obj(point)||Object.keys(point).sort().join(',')!=='date,kg'||!date(point.date)||point.date<=last||point.date<b.windowStart||point.date>=b.windowEndExclusive||typeof point.kg!=='number'||!Number.isFinite(point.kg)||point.kg<=0)return blocked('research_points_invalid');last=point.date;}
  const method=structuredClone(await p.loadMethod());
  if(!obj(method)||Object.keys(method).sort().join(',')!=='assumptions,calibrationStatus,codeDigest,digest,evidenceReferences,methodApprovedAt,methodId,version'||method.version!=='rate-method-research-artifact-v1'||method.calibrationStatus!=='unvalidated'||method.methodApprovedAt!==null||typeof method.methodId!=='string'||!method.methodId||method.methodId.length>128||!hash(method.codeDigest)||!hash(method.digest)||!Array.isArray(method.evidenceReferences)||!Array.isArray(method.assumptions)||method.assumptions.length===0||method.assumptions.length>16||method.evidenceReferences.length>32||[...method.evidenceReferences,...method.assumptions].some(x=>typeof x!=='string'||!x||x.length>2048))return blocked('research_method_invalid');
  if(new TextEncoder().encode(JSON.stringify(method)).byteLength>32768)return blocked('research_method_invalid');
  const artifact=method as ResearchMethodArtifact;
  if(!hash(p.executorCodeDigest)||p.executorCodeDigest!==artifact.codeDigest)return blocked('research_executor_mismatch');
  if(await p.digest(canonicalMethodArtifact(artifact))!==artifact.digest)return blocked('research_method_digest_mismatch');
  const estimate=structuredClone(await p.estimate(structuredClone(captured.points),structuredClone(artifact)));
  const computed=p.now();
  if(!Number.isSafeInteger(computed)||computed<started||!validBinding(b,computed))return blocked('research_source_expired');
  if(!obj(estimate)||Object.keys(estimate).sort().join(',')!=='diagnostics,lowerKgPerWeek,pointKgPerWeek,upperKgPerWeek'||![estimate.pointKgPerWeek,estimate.lowerKgPerWeek,estimate.upperKgPerWeek].every(Number.isFinite)||estimate.lowerKgPerWeek>estimate.upperKgPerWeek||!obj(estimate.diagnostics)||Object.keys(estimate.diagnostics).length>32||Object.values(estimate.diagnostics).some(x=>typeof x!=='number'||!Number.isFinite(x)))return blocked('research_estimate_invalid');
  return {kind:'research_estimate' as const,version:'automated-rate-estimate-draft-v1' as const,actionable:false as const,mayHaveWritten:false as const,qualification:'unvalidated-research-only' as const,binding:structuredClone(b),methodArtifactDigest:artifact.digest,methodApprovedAt:null,computedAt:computed,...estimate};
 }catch{return blocked('research_estimate_error');}
}
export async function produceAutomatedRateEstimate(input:unknown,p:EstimatePorts){
 if(!AUTOMATED_RATE_ESTIMATE_RELEASE.enabled)return blocked('automated_estimate_off');
 return computeResearchRateEstimate(input,p);
}

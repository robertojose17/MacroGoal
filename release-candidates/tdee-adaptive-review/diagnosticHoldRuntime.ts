import {assessFourteenDaySnapshotReview} from './snapshotReviewContextParser.ts';
import {scheduleUncertainReassessment,type UncertainHold} from './dailyAssessmentScheduler.ts';
import {diagnosticFromSnapshot} from './schedulerDiagnostic.ts';
export const DIAGNOSTIC_HOLD_RELEASE=Object.freeze({enabled:false} as const);
export type DiagnosticHoldScope={ownerId:string;goalId:string;goalRevision:string;profileUpdatedAt:string;profileBinding:string;journeyBinding:string;timezone:string};
export type BoundDiagnosticHold={scope:DiagnosticHoldScope;hold:UncertainHold};
const obj=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const hash=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const stop=(reason:string)=>({kind:'blocked' as const,reason,actionable:false as const,recommendation:null,mayHaveWritten:false as const});
/** Trusted snapshot seam, read-only. Proposed hold is not a persisted schedule.
 * Uses existing14d/8weights/10complete-days rules; never manufactures a CI,
 * approval, calorie adjustment, or permission to keep an unsuitable current goal.
 */
export function evaluateDiagnosticHold(snapshot:unknown,actor:string,now:number,previous:BoundDiagnosticHold|null){
 const assessment=assessFourteenDaySnapshotReview(snapshot,actor,now);
 if(assessment.kind==='blocked')return stop(assessment.reason);
 if(!obj(snapshot)||!obj(snapshot.profile)||!obj(snapshot.readiness)||!hash(snapshot.readiness.profileBinding)||!hash(snapshot.readiness.journeyBinding))return stop('hold_scope_unavailable');
 const scope:DiagnosticHoldScope={ownerId:actor,goalId:assessment.goalId,goalRevision:assessment.goalRevision,profileUpdatedAt:snapshot.profile.updatedAt,profileBinding:snapshot.readiness.profileBinding,journeyBinding:snapshot.readiness.journeyBinding,timezone:snapshot.profile.timezone};
 if(previous!==null&&(!obj(previous)||Object.keys(previous).sort().join(',')!=='hold,scope'||!obj(previous.scope)||Object.keys(previous.scope).length!==Object.keys(scope).length||Object.keys(scope).some(k=>previous.scope[k as keyof DiagnosticHoldScope]!==scope[k as keyof DiagnosticHoldScope])))return stop('hold_scope_changed');
 if(previous!==null&&!obj(previous.hold))return stop('invalid_hold');
 const diagnostic=diagnosticFromSnapshot(assessment,now);
 if(diagnostic.kind!=='uncertain')return stop('hold_result_unrecognized');
 const proposed=scheduleUncertainReassessment(now,previous===null?null:previous.hold);
 if('kind' in proposed)return stop(proposed.reason);
 return {kind:'diagnostic_hold' as const,version:'diagnostic-hold-v1' as const,actionable:false as const,recommendation:null,mayHaveWritten:false as const,statisticalConfidenceEstablished:false as const,assessment,diagnostic,proposedHold:{scope,hold:proposed},persisted:false as const};
}
export type DiagnosticHoldPorts={loadOwnSnapshot():Promise<{snapshot:unknown;actor:string;previous:BoundDiagnosticHold|null}>;now():number};
/** OFF before context, clock, or network. No mutation ports exist. */
export function createDiagnosticHoldRuntime(ports:DiagnosticHoldPorts){return async()=>{
 if(!DIAGNOSTIC_HOLD_RELEASE.enabled)return stop('diagnostic_hold_off');
 try{const {snapshot,actor,previous}=await ports.loadOwnSnapshot();return evaluateDiagnosticHold(snapshot,actor,ports.now(),previous);}catch{return stop('diagnostic_unavailable');}
};}
/** Copy only, no mount or read. Hold date is proposed, never a delivery promise. */
export function diagnosticHoldCopy(language:'es'|'en'){
 return language==='es'?{title:'Tendencia orientativa',hold:'No se propone un cambio de metas.',uncertainty:'Los datos no establecen un intervalo estadístico validado.',next:'La fecha propuesta de reevaluación aún no está programada.',caution:'Mantener las metas sin cambios no confirma que sean adecuadas para ti.'}:{title:'Descriptive trend',hold:'No target change is proposed.',uncertainty:'These data do not establish a validated statistical interval.',next:'The proposed reassessment date is not scheduled yet.',caution:'Leaving targets unchanged does not confirm they are suitable for you.'};
}

/** Read-only Option 2 candidate. No acceptance, scheduling or target-write ports. */
import {evaluateDiagnosticHold,diagnosticHoldCopy,type BoundDiagnosticHold,type DiagnosticHoldScope} from './diagnosticHoldRuntime.ts';
export const OPTION2_FOLLOWUP_RELEASE=Object.freeze({enabled:false} as const);
export type KnownDiagnosticScope=Pick<DiagnosticHoldScope,'ownerId'|'goalId'|'goalRevision'|'profileUpdatedAt'|'timezone'>;
export type Context={actor:string;revision:string;scope:KnownDiagnosticScope};
export function matchesKnownScope(actual:DiagnosticHoldScope,expected:KnownDiagnosticScope){return ['ownerId','goalId','goalRevision','profileUpdatedAt','timezone'].every(k=>actual[k as keyof KnownDiagnosticScope]===expected[k as keyof KnownDiagnosticScope]);}
export type FollowupPorts={currentContext():Context|null;now():number;load(context:Context,signal:AbortSignal):Promise<{snapshot:unknown;actor:string;previous:BoundDiagnosticHold|null}>};
export type FollowupView={status:'idle'|'loading'|'observing'|'insufficient'|'unavailable'|'disabled';title:string;message:string;uncertainty:string;caution:string;refreshLabel:string;schedulingNote:string;canRefresh:boolean;actionable:false;recommendation:null;scheduled:false;proposedReassessmentAt:number|null;trendStatus:'within_tolerance'|'outside_tolerance'|'unavailable';trendText:string};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const copy=(language:'es'|'en')=>({...diagnosticHoldCopy(language),refresh:language==='es'?'Actualizar datos':'Refresh data',insufficient:language==='es'?'Aún faltan datos para describir la tendencia.':'More data are needed to describe the trend.',unavailable:language==='es'?'No se pudo verificar el contexto actual.':'The current context could not be verified.',disabled:language==='es'?'Esta vista aún no está habilitada.':'This view is not enabled yet.'});
function view(language:'es'|'en',status:FollowupView['status'],at:number|null=null):FollowupView{const c=copy(language);return {status,title:c.title,message:status==='insufficient'?c.insufficient:status==='unavailable'?c.unavailable:status==='disabled'?c.disabled:c.hold,uncertainty:c.uncertainty,caution:c.caution,refreshLabel:c.refresh,schedulingNote:c.next,canRefresh:status!=='disabled'&&status!=='loading',actionable:false,recommendation:null,scheduled:false,proposedReassessmentAt:at,trendStatus:'unavailable',trendText:''};}
function validContext(c:Context|null):c is Context{return !!c&&typeof c.actor==='string'&&typeof c.revision==='string'&&c.revision.length>0&&!!c.scope&&c.scope.ownerId===c.actor&&['goalId','goalRevision','profileUpdatedAt','timezone'].every(k=>typeof c.scope[k as keyof KnownDiagnosticScope]==='string'&&c.scope[k as keyof KnownDiagnosticScope].length>0); }
function controller(ports:FollowupPorts,language:'es'|'en',review:boolean){
 let boundContext:Context|null=null;let generation=0,active:AbortController|null=null,state=view(language,review?'idle':'disabled');
 const snapshot=()=>{if(review&&boundContext){try{if(!same(boundContext,ports.currentContext())){state=view(language,'unavailable');boundContext=null;}}catch{state=view(language,'unavailable');boundContext=null;}}return structuredClone(state);};
 return {getView:snapshot,dispose(){generation++;active?.abort();active=null;boundContext=null;state=view(language,review?'idle':'disabled');},async refresh():Promise<FollowupView>{
  if(!review)return snapshot();
  const request=++generation;active?.abort();const abort=new AbortController();active=abort;
  let captured:Context;
  try{const current=ports.currentContext();if(!validContext(current)){state=view(language,'unavailable');return snapshot();}captured=structuredClone(current);boundContext=captured;state=view(language,'loading');
   const result=await ports.load(structuredClone(captured),abort.signal);
   if(request!==generation)return snapshot();
   if(abort.signal.aborted||!same(captured,ports.currentContext())||result.actor!==captured.actor){state=view(language,'unavailable');return snapshot();}
   // Recompute using the actual canonical assessor, never accept a wire "approved" flag.
   const diagnostic=evaluateDiagnosticHold(result.snapshot,result.actor,ports.now(),result.previous);
   if(diagnostic.kind!=='diagnostic_hold'||!matchesKnownScope(diagnostic.proposedHold.scope,captured.scope)){state=view(language,'unavailable');return snapshot();}
   if(!same(captured,ports.currentContext())){state=view(language,'unavailable');return snapshot();}
   state=view(language,diagnostic.assessment.coverage.coverageSufficient?'observing':'insufficient',diagnostic.proposedHold.hold.reevaluateAt);
   const comparison=diagnostic.assessment.paceComparison;
   if(comparison.status==='comparison'){
    state.trendStatus=comparison.outsideProductTolerance?'outside_tolerance':'within_tolerance';
    state.trendText=language==='es'?(comparison.outsideProductTolerance?'La tendencia descriptiva difiere del ritmo objetivo. Esto no autoriza un ajuste.':'La tendencia descriptiva está dentro de la tolerancia del producto. Esto no confirma que la meta sea adecuada.'):(comparison.outsideProductTolerance?'The descriptive trend differs from the target pace. This does not authorize an adjustment.':'The descriptive trend is within product tolerance. This does not confirm target suitability.');
   }
   return snapshot();
  }catch{if(request===generation)state=view(language,'unavailable');return snapshot();}
  finally{if(request===generation)active=null;}
 }};
}
/** Production entry remains immutable OFF, including refresh: zero port access. */
export function createDiagnosticFollowupController(p:FollowupPorts,language:'es'|'en'='es'){return controller(p,language,OPTION2_FOLLOWUP_RELEASE.enabled);}
/** Explicit synthetic/review seam, not mounted or enabled by this module. */
export function createDiagnosticFollowupControllerForReview(p:FollowupPorts,language:'es'|'en'='es'){return controller(p,language,true);}

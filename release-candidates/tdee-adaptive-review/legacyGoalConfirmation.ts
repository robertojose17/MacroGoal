/** SOURCE-ONLY. Goal acknowledgment is not a goal write, macro-choice consent,
 * expenditure measurement, nutrition review or permission to issue recommendations. */
export const LEGACY_GOAL_CONFIRMATION_RELEASE=Object.freeze({enabled:false} as const);
export const LEGACY_GOAL_CONFIRMATION_CONTRACT='legacy-goal-acknowledgment-v1' as const;
type Obj=Record<string,unknown>;
export type LegacyTargets=Readonly<{calories:number;proteinG:number;carbsG:number;fatsG:number}>;
export type LegacyGoalBinding=Readonly<{
 ownerId:string;goalId:string;goalRevision:string;profileUpdatedAt:string;
 profileBinding:string;journeyBinding:string;goalFingerprint:string;targets:LegacyTargets;
}>;
export type LegacyGoalContext=Readonly<{
 version:'legacy-goal-current-context-v1';ownerId:string;capturedAt:string;
 currentGoal:Readonly<{id:string;ownerId:string;isActive:true;updatedAt:string;targets:LegacyTargets}>;
 profileUpdatedAt:string;profileBinding:string;journeyBinding:string;goalFingerprint:string;
}>;
export type LegacyGoalConfirmationRequest=Readonly<{
 version:typeof LEGACY_GOAL_CONFIRMATION_CONTRACT;requestId:string;
 decision:'keep_current_targets';binding:LegacyGoalBinding;
}>;
const rec=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const keys=(o:Obj,want:string[])=>Object.keys(o).sort().join(',')===[...want].sort().join(',');
// Exact strings are retained for revision comparison, including microseconds.
const stamp=(v:unknown):v is string=>{
 if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/.test(v))return false;
 const t=Date.parse(v),day=Date.parse(v.slice(0,10)+'T00:00:00Z');
 return Number.isFinite(t)&&Number.isFinite(day)&&new Date(day).toISOString().slice(0,10)===v.slice(0,10);
};
const micros=(v:string)=>BigInt(Date.parse(v))*1000n+BigInt((/\.(\d{1,6})Z$/.exec(v)?.[1]??'').padEnd(6,'0').slice(3));
const targets=(v:unknown):v is LegacyTargets=>rec(v)&&keys(v,['calories','proteinG','carbsG','fatsG'])&&
 typeof v.calories==='number'&&Number.isFinite(v.calories)&&v.calories>0&&
 ['proteinG','carbsG','fatsG'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k])&&(v[k] as number)>=0);
function binding(v:unknown,actor:string):v is LegacyGoalBinding{
 return rec(v)&&keys(v,['ownerId','goalId','goalRevision','profileUpdatedAt','profileBinding','journeyBinding','goalFingerprint','targets'])&&
 uuid(actor)&&v.ownerId===actor&&uuid(v.goalId)&&stamp(v.goalRevision)&&stamp(v.profileUpdatedAt)&&
 hash(v.profileBinding)&&hash(v.journeyBinding)&&hash(v.goalFingerprint)&&targets(v.targets);
}
function copyBinding(v:LegacyGoalBinding):LegacyGoalBinding{
 return Object.freeze({...v,targets:Object.freeze({...v.targets})});
}
/** This validates shape/freshness, not provenance. Only a server-owned context
 * loader may supply input in a future mount; HTTP body is never such a loader. */
function contextBinding(v:unknown,actor:string,now:bigint):LegacyGoalBinding|null{
 if(!uuid(actor)||!rec(v)||v.version!=='legacy-goal-current-context-v1'||v.ownerId!==actor||
 !stamp(v.capturedAt)||micros(v.capturedAt)>now||now-micros(v.capturedAt)>30000000n||
 !rec(v.currentGoal)||v.currentGoal.ownerId!==actor||v.currentGoal.isActive!==true||
 !stamp(v.currentGoal.updatedAt)||!stamp(v.profileUpdatedAt)||micros(v.currentGoal.updatedAt)>micros(v.capturedAt)||
 micros(v.profileUpdatedAt)>micros(v.capturedAt))return null;
 const b={ownerId:actor,goalId:v.currentGoal.id,goalRevision:v.currentGoal.updatedAt,profileUpdatedAt:v.profileUpdatedAt,
 profileBinding:v.profileBinding,journeyBinding:v.journeyBinding,goalFingerprint:v.goalFingerprint,targets:v.currentGoal.targets};
 return binding(b,actor)?copyBinding(b):null;
}
export function legacyGoalBindingForReview(v:unknown,actor:string,now:number):LegacyGoalBinding|null{
 return Number.isSafeInteger(now)?contextBinding(v,actor,BigInt(now)*1000n):null;
}
const strings={
 en:{title:'Keep your current targets?',body:'These are your current daily targets. Confirming keeps them unchanged and records your choice today.',
 calories:'Calories',protein:'Protein',carbs:'Carbohydrates',fats:'Fat',keep:'Confirm current targets',cancel:'Cancel',
 caution:'This confirms your choice only. It does not verify your energy expenditure, nutritional suitability or an adaptive recommendation.',
 timing:'A new acknowledgment starts now. Previous goal dates are not treated as your confirmation.'},
 es:{title:'¿Mantener tus objetivos actuales?',body:'Estos son tus objetivos diarios actuales. Al confirmar, se mantienen sin cambios y se registra tu elección hoy.',
 calories:'Calorías',protein:'Proteína',carbs:'Carbohidratos',fats:'Grasas',keep:'Confirmar estas metas',cancel:'Cancelar',
 caution:'Solo confirma tu elección. No verifica tu gasto energético, la adecuación nutricional ni una recomendación adaptativa.',
 timing:'La nueva confirmación comienza ahora. Las fechas anteriores del objetivo no se consideran tu confirmación.'},
} as const;
/** Presentation-only review seam. No submit callback, default choice or live mount. */
export function legacyGoalConfirmationViewModel(v:unknown,actor:string,locale:'en'|'es',now:number){
 const b=legacyGoalBindingForReview(v,actor,now);if(!b||(locale!=='en'&&locale!=='es'))return {kind:'unavailable' as const,actionable:false as const};
 const t=strings[locale];
 return {kind:'confirmation_preview' as const,actionable:false as const,persistence:'not_connected' as const,
 requiresExplicitConfirmation:true as const,binding:b,...t,
 rows:[{key:'calories',label:t.calories,value:b.targets.calories,unit:'kcal'},
 {key:'proteinG',label:t.protein,value:b.targets.proteinG,unit:'g'},
 {key:'carbsG',label:t.carbs,value:b.targets.carbsG,unit:'g'},
 {key:'fatsG',label:t.fats,value:b.targets.fatsG,unit:'g'}],defaultChoice:null};
}
/** Call only following a deliberate keep/cancel event. Merely showing the view,
 * lacking a receipt, loading a page or finding an existing goal is not consent. */
export function legacyGoalConfirmationIntent(b:unknown,actor:string,choice:unknown,requestId:string){
 if(choice==='cancel')return {kind:'cancelled' as const,request:null};
 if(choice!=='keep_current_targets'||!binding(b,actor)||!uuid(requestId))return {kind:'blocked' as const,reason:'explicit_confirmation_required',request:null};
 return {kind:'intent' as const,actionable:false as const,request:Object.freeze({version:LEGACY_GOAL_CONFIRMATION_CONTRACT,requestId,decision:'keep_current_targets' as const,binding:copyBinding(b)})};
}
export function parseLegacyGoalConfirmationRequest(v:unknown,actor:string):LegacyGoalConfirmationRequest|null{
 if(!rec(v)||!keys(v,['version','requestId','decision','binding'])||v.version!==LEGACY_GOAL_CONFIRMATION_CONTRACT||
 !uuid(v.requestId)||v.decision!=='keep_current_targets'||!binding(v.binding,actor))return null;
 return Object.freeze({version:LEGACY_GOAL_CONFIRMATION_CONTRACT,requestId:v.requestId,decision:v.decision,binding:copyBinding(v.binding)});
}
const equal=(a:LegacyGoalBinding,b:LegacyGoalBinding)=>
 (['ownerId','goalId','goalRevision','profileUpdatedAt','profileBinding','journeyBinding','goalFingerprint'] as const).every(k=>a[k]===b[k])&&
 (['calories','proteinG','carbsG','fatsG'] as const).every(k=>a.targets[k]===b.targets[k]);
/** Pure commit precondition only. SQL must authenticate, lock current owner/goal,
 * reload profile/journey/fingerprint, recheck the request, assign transaction time,
 * enforce idempotency/revocation and save an acknowledgment WITHOUT goal updates.
 * serverConfirmedAt is server supplied, never accepted from the client payload. */
export function prepareLegacyGoalAcknowledgmentForReview(request:unknown,current:unknown,actor:string,serverConfirmedAt:string){
 const blocked=(reason:string)=>({kind:'blocked' as const,actionable:false as const,reason});
 if(!stamp(serverConfirmedAt))return blocked('server_confirmation_time_required');
 const parsed=parseLegacyGoalConfirmationRequest(request,actor),b=contextBinding(current,actor,micros(serverConfirmedAt));
 if(!parsed||!b)return blocked('confirmation_context_unavailable');
 if(!equal(parsed.binding,b))return blocked('confirmation_context_changed');
 return {kind:'prepared_acknowledgment' as const,actionable:false as const,requiresServerCommit:true as const,
 requestId:parsed.requestId,binding:b,confirmedAt:serverConfirmedAt,observationPeriodStartsAt:serverConfirmedAt,
 goalsModified:false as const,nutritionalApproval:false as const,expenditureVerified:false as const,
 macroAllocationConsent:false as const,historicalBaselineAuthorized:false as const};
}
/** Production gate remains immutable OFF; no live transport or goal-writing RPC. */
export async function confirmLegacyGoal(_request:unknown,_ports:unknown){
 if(!LEGACY_GOAL_CONFIRMATION_RELEASE.enabled)return {status:'disabled' as const,actionable:false as const};
 throw Error('legacy_confirmation_transport_not_implemented');
}

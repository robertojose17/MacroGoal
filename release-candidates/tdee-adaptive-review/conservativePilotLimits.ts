/** Limit checker only. It DOES NOT choose an adjustment or validate a clinical
 * policy. Server must supply a genuinely reviewed policy/individual limits.
 * No rule defaults, confidence interval or energy-per-weight conversion exists.
 */
export const CONSERVATIVE_PILOT_RELEASE=Object.freeze({enabled:false} as const);
export type PilotPolicyLimits={maxStepKcal:number;maxStepFraction:number;maxNetDeltaKcal:number;minIntakeKcal:number;maxIntakeKcal:number;minDaysBetweenAcceptances:number;incrementKcal:number};
export type PilotLimitInput={now:number;sourceCapturedAt:number;baselineAcceptedAt:number;lastAcceptedAt:number|null;baselineIntakeKcal:number;currentIntakeKcal:number;acceptedNetDeltaKcal:number;requestedDeltaKcal:number;coverageSufficient:boolean;policy:PilotPolicyLimits|null};
const stop=(reason:string)=>({kind:'hold' as const,reason,actionable:false as const,recommendation:null});
const integer=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n);
const time=(n:unknown):n is number=>integer(n)&&n>=0&&n<=253401609600000;
/** Pure guard. A passing result only says numerical limits pass; full nutrition,
 * identity, policy provenance, purchase, binding, macro and atomic-write gates
 * remain independent. Never reuse it as an acceptance authorization.
 */
export function checkConservativePilotLimits(i:PilotLimitInput){
 if(!i||!time(i.now)||!time(i.sourceCapturedAt)||i.sourceCapturedAt>i.now||i.now-i.sourceCapturedAt>30000)return stop('source_not_current');
 if(!i.policy)return stop('pilot_policy_not_configured');
 const p=i.policy;
 if(![p.maxStepKcal,p.maxNetDeltaKcal,p.minIntakeKcal,p.maxIntakeKcal,p.minDaysBetweenAcceptances,p.incrementKcal].every(integer)||p.maxStepKcal<=0||p.maxStepKcal>200||p.maxNetDeltaKcal<=0||p.minIntakeKcal<=0||p.maxIntakeKcal<p.minIntakeKcal||p.maxIntakeKcal>10000||p.minDaysBetweenAcceptances<14||!Number.isSafeInteger(p.minDaysBetweenAcceptances*86400000)||p.incrementKcal<=0||p.incrementKcal>p.maxStepKcal||typeof p.maxStepFraction!=='number'||!Number.isFinite(p.maxStepFraction)||p.maxStepFraction<=0||p.maxStepFraction>1)return stop('pilot_policy_invalid');
 if(i.coverageSufficient!==true)return stop('coverage_insufficient');
 if(!time(i.baselineAcceptedAt)||i.baselineAcceptedAt>i.now||i.lastAcceptedAt!==null&&(!time(i.lastAcceptedAt)||i.lastAcceptedAt<i.baselineAcceptedAt||i.lastAcceptedAt>i.now))return stop('acceptance_history_invalid');
 if(i.now-(i.lastAcceptedAt??i.baselineAcceptedAt)<p.minDaysBetweenAcceptances*86400000)return stop('review_cooldown');
 if(![i.baselineIntakeKcal,i.currentIntakeKcal,i.acceptedNetDeltaKcal,i.requestedDeltaKcal].every(integer)||i.baselineIntakeKcal<=0||i.baselineIntakeKcal>10000||i.currentIntakeKcal<=0||i.currentIntakeKcal>10000||i.baselineIntakeKcal+i.acceptedNetDeltaKcal!==i.currentIntakeKcal||Math.abs(i.acceptedNetDeltaKcal)>p.maxNetDeltaKcal)return stop('anchor_history_mismatch');
 if(i.lastAcceptedAt===null&&i.acceptedNetDeltaKcal!==0)return stop('acceptance_history_invalid');
 if(i.currentIntakeKcal<p.minIntakeKcal||i.currentIntakeKcal>p.maxIntakeKcal)return stop('current_target_outside_policy');
 if(i.requestedDeltaKcal===0)return stop('no_change');
 // Retains the existing unresolved individual-deficit gate, not a new policy.
 if(i.requestedDeltaKcal<0)return stop('individual_deficit_review_required');
 // Reject, never silently clamp or round an unapproved requested target.
 if(i.requestedDeltaKcal>p.maxStepKcal||i.requestedDeltaKcal>200||i.requestedDeltaKcal>i.currentIntakeKcal*p.maxStepFraction||i.requestedDeltaKcal%p.incrementKcal!==0)return stop('step_limit');
 const next=i.currentIntakeKcal+i.requestedDeltaKcal,net=i.acceptedNetDeltaKcal+i.requestedDeltaKcal;
 if(!integer(next)||!integer(net)||next<p.minIntakeKcal||next>p.maxIntakeKcal||Math.abs(net)>p.maxNetDeltaKcal)return stop('cumulative_or_intake_limit');
 return {kind:'limits_pass' as const,actionable:false as const,recommendation:null,acceptanceAuthorized:false as const,requiresExplicitAcceptance:true as const,requestedDeltaKcal:i.requestedDeltaKcal,targetIntakeKcal:next};
}
export function checkPilotRelease(i:PilotLimitInput){
 if(!CONSERVATIVE_PILOT_RELEASE.enabled)return stop('conservative_pilot_off');
 return checkConservativePilotLimits(i);
}

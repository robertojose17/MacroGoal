import {assessAutomaticRules14Attention} from './rules14Decision.ts';
import {parseObservedSnapshot} from '../../supabase/functions/observed-snapshot-release/functions/observed-program/snapshot.ts';
export type DashboardAttention={version:'dashboard-attention-v1';ownerId:string;capturedAt:string;expiresAt:number;premium:boolean;status:'attention'|'none'|'unavailable';reason:'review_needed'|'no_change'|'insufficient_data'|'baseline_required'|'baseline_reconfirmation_required'|'unavailable';actionable:false;proposal:null};
/** Server-only result projection: raw evidence and target arithmetic never leave this function. */
export function dashboardAttentionFromSource(raw:unknown,owner:string,premium:boolean,now:number):DashboardAttention{
 const result:DashboardAttention={version:'dashboard-attention-v1',ownerId:owner,capturedAt:new Date(now).toISOString(),expiresAt:now+30000,premium,status:'unavailable',reason:'unavailable',actionable:false,proposal:null};
 try{
  const r=raw as any;if(!r||r.ownerId!==owner||!r.snapshot)return result;
  const s=r.snapshot,o=parseObservedSnapshot(s.observation,owner),captured=Date.parse(o.capturedAt);
  if(!Number.isSafeInteger(now)||captured>now||now-captured>30000||o.context.analysisMode!=='automatic-v1'||o.context.premium!==premium||s.actor!==owner||s.capturedAt!==o.capturedAt)return result;
  const expiry=Math.min(captured+30000,premium?o.context.accessValidUntil??0:Infinity);if(expiry<=now)return result;
  result.capturedAt=o.capturedAt;result.expiresAt=expiry;
  if(r.version==='rules14-attention-setup-v1'&&r.actionable===false&&['baseline_required','baseline_reconfirmation_required'].includes(r.reason))return {...result,status:premium?'attention':'none',reason:premium?r.reason:'baseline_required'};
  if(r.version!=='rules14-source-v1'||!r.history||!r.policy)return result;
  const d=assessAutomaticRules14Attention(s,owner,r.history,r.policy,now);
  if(d.kind==='attention')return {...result,status:'attention',reason:'review_needed'};
  const baseline=['accepted_history_required','baseline_reconfirmation_required'].includes(d.reason);
  const noChange=['within_product_tolerance','review_cooldown','policy_limit_or_subincrement','total_deficit_limit'].includes(d.reason);
  const insufficient=['observed_log_days_insufficient','weight_days_insufficient','weight_distribution_insufficient','initial_fourteen_days_not_elapsed','rate_sensitivity_uncertain','logged_intake_mean_unavailable','target_or_trend_unavailable','journey_start_unverified'].includes(d.reason);
  return baseline?{...result,status:'none',reason:'baseline_required'}:noChange?{...result,status:'none',reason:'no_change'}:insufficient?{...result,status:'none',reason:'insufficient_data'}:result;
 }catch{return result;}
}

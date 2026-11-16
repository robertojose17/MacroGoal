import {prepareAcceptedIntakeRateAdjustment} from '../release-candidates/tdee-adaptive-review/snapshotAdjustment.ts';
/** Synthetic genuine-shape receipt only for offline tests; never persisted. */
export function acceptedRateSource(input){
 const actor=input.macroBinding.ownerId,at=input.macroBinding.goalRevision,c=input.current,hash='a'.repeat(64);
 const g={id:input.macroBinding.goalId,user_id:actor,is_active:true,goal_type:'maintain',loss_rate_lbs_per_week:0,macro_preset:'balanced',daily_calories:c.calories,protein_g:c.proteinG,carbs_g:c.carbsG,fats_g:c.fatsG,fiber_g:c.fiberG,base_daily_calories:c.calories,last_adaptive_update:null,created_at:at,updated_at:at,start_journey_date:at.slice(0,10)};
 return {version:'accepted-goal-rate-anchor-source-v1',ownerId:actor,actionable:false,capturedAt:new Date(input.now-1000).toISOString(),existingAnchor:null,currentGoal:g,currentProfile:{id:actor,onboarding_completed:true,updated_at:at,journey_start_date:at.slice(0,10),journey_restart_count:0,date_of_birth:'1990-01-01',timezone:'UTC'},currentProfileFingerprint:hash,profileBinding:hash,journeyBinding:hash,receipt:{user_id:actor,request_id:'22222222-2222-4222-8222-222222222222',goal_id:g.id,payload:{operation:'manual_goal'},goal_snapshot:structuredClone(g),profile_fingerprint:hash,created_at:at}};
}
export function admittedRateInput(input,source=acceptedRateSource(input)){
 const {anchor,observedExpenditure,...rest}=input;
 const prepared=prepareAcceptedIntakeRateAdjustment(source,input.macroBinding.ownerId,rest);
 if(prepared.kind!=='rate_input_prepared')throw Error(prepared.reason);
 return prepared.input;
}

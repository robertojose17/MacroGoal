import {rules14ScreeningCurrent} from './rules14Screening.ts';
import {diagnoseSnapshotRateReview,type SnapshotMacroRequest} from './snapshotReviewContextParser.ts';
import {macroPreferenceEvidence} from './snapshotOrchestrationSupabaseAdapter.ts';
import type {Rules14Policy} from './rules14Decision.ts';
import type {Rules14MacroContext} from './smartMacroAdjustment.ts';
/** Deterministic application of the registered general-adult policy. No claim of
 * individualized clinician review. Restricted/unknown screening or obese/unknown
 * reference-weight cases hold instead of inventing body composition/reference. */
export function applyRules14Nutrition(snapshot:any,actor:string,policy:Rules14Policy,choice:unknown,now:number){
 const blocked=(reason:string)=>({kind:'blocked' as const,reason});
 const d=diagnoseSnapshotRateReview(snapshot,actor,now);if(d.kind==='blocked')return blocked(d.reason);
 const g=snapshot.currentGoal,p=snapshot.profile,r=snapshot.readiness;
 if(!rules14ScreeningCurrent(snapshot,actor,now)||policy.scope!=='screened-adult-general-v1')return blocked('clinical_eligibility_required');
 if(!['balanced','high_protein','low_carb','lean_body','custom'].includes(g.macro_preset))return blocked('macro_preference_unavailable');
 const today=d.window.endDateExclusive,dob=p.dateOfBirth;
 const age=Number(today.slice(0,4))-Number(dob?.slice(0,4))-(today.slice(5)<dob?.slice(5)?1:0);
 if(!Number.isSafeInteger(age)||age<19||age>100)return blocked('unsupported_age');
 const height=p.heightCm,weight=d.window.weights.at(-1)?.weightKg;
 if(p.heightUnit!=='cm'||typeof height!=='number'||!Number.isFinite(height)||height<100||height>250||typeof weight!=='number'||!Number.isFinite(weight)||weight<=0)return blocked('protein_reference_unavailable');
 const bmi=weight/(height/100)**2;
 if(bmi<18.5)return blocked('underweight_review_required');
 if(bmi>=30)return blocked('individual_reference_weight_required');
 const minRatio=g.goal_type==='lose'?policy.protein_min_g_per_kg_loss:policy.protein_min_g_per_kg_other;
 if(![minRatio,policy.protein_max_g_per_kg,policy.fat_min_fraction,policy.fat_max_fraction,policy.carbs_min_g].every(n=>typeof n==='number'&&Number.isFinite(n))||
 minRatio<=0||policy.protein_max_g_per_kg<minRatio||policy.protein_max_g_per_kg>4||policy.fat_min_fraction<.2||policy.fat_max_fraction>.35||policy.fat_min_fraction>policy.fat_max_fraction||policy.carbs_min_g<130||policy.carbs_min_g>10000)return blocked('nutrition_policy_invalid');
 const request:SnapshotMacroRequest={binding:{ownerId:actor,goalId:g.id,goalRevision:g.updated_at,preset:g.macro_preset,sourceFingerprint:d.sourceFingerprint,policyVersion:policy.version,policyDigest:policy.digest},current:{calories:g.daily_calories,proteinG:g.protein_g,carbsG:g.carbs_g,fatsG:g.fats_g,fiberG:g.fiber_g},sourceCapturedAt:d.sourceCapturedAt,profileUpdatedAt:p.updatedAt,profileBinding:r.profileBinding,journeyBinding:r.journeyBinding,today,ageYears:age};
 const preference=macroPreferenceEvidence(actor,request,choice,now);
 if(preference.preferenceStatus!=='current'||!preference.consent)return blocked('explicit_macro_choice_required');
 const context:Rules14MacroContext={binding:request.binding,current:request.current,customChoice:preference.consent,
 policyEvidence:{version:'nutrition-policy-application-v1',policyVersion:policy.version,policyDigest:policy.digest,sourceFingerprint:d.sourceFingerprint,profileBinding:r.profileBinding,journeyBinding:r.journeyBinding,computedAt:now,expiresAt:Math.min(Date.parse(policy.expires_at),Date.parse(d.sourceCapturedAt)+30000,Date.parse(snapshot.rulesScreening.expiresAt)),ageYears:age,eligibility:'eligible'},
 limits:{proteinMinG:minRatio*weight,proteinMaxG:policy.protein_max_g_per_kg*weight,carbsMinG:policy.carbs_min_g,carbsMaxG:10000,fatsMinG:0,fatsMaxG:10000,fatMinFraction:policy.fat_min_fraction,fatMaxFraction:policy.fat_max_fraction}};
 return {kind:'nutrition_policy_applied' as const,request,context,reference:{strategy:'actual-known-non-obese-weight-v1',weightKg:weight,heightCm:height,bmi,measurementDate:d.window.weights.at(-1)!.date},qualityNotes:['Fat percentage does not establish essential fatty acid adequacy.','Fiber is retained and remains a nutrition-quality indicator.']};
}

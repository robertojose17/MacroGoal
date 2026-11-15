/** Pure server-only candidate. No policy defaults, I/O, or authorization from client flags. */
export type SmartTarget={calories:number;proteinG:number;carbsG:number;fatsG:number;fiberG:number};
export type SmartMacroBinding={ownerId:string;goalId:string;goalRevision:string;preset:string;sourceFingerprint:string;policyVersion:string;policyDigest:string};
export type SmartMacroContext={
 binding:SmartMacroBinding;current:SmartTarget;
 review:{status:'reviewed';reviewId:string;reviewedAt:number;expiresAt:number;ageYears:number;eligibility:'eligible'|'restricted'|'unknown'};
 limits:{proteinMinG:number;proteinMaxG:number;carbsMinG:number;carbsMaxG:number;fatsMinG:number;fatsMaxG:number;fatMinFraction:number;fatMaxFraction:number};
 customChoice?:{mode:'smart'|'preserve_percent';binding:SmartMacroBinding;consentId:string;acceptedAt:number};
};
const keys=['ownerId','goalId','goalRevision','preset','sourceFingerprint','policyVersion','policyDigest'] as const;
const targetKeys=['calories','proteinG','carbsG','fatsG','fiberG'] as const;
const text=(x:unknown):x is string=>typeof x==='string'&&x.trim().length>0;
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const stamp=(x:unknown):x is number=>finite(x)&&Number.isSafeInteger(x)&&x>=0&&x<=8640000000000000;
const amount=(x:unknown):x is number=>finite(x)&&Number.isSafeInteger(x)&&x>=0&&x<=10000;
const validBinding=(b:SmartMacroBinding)=>!!b&&keys.every(k=>text(b[k]))&&/^[a-f0-9]{64}$/.test(b.sourceFingerprint)&&/^[a-f0-9]{64}$/.test(b.policyDigest);
const sameBinding=(a:SmartMacroBinding,b:SmartMacroBinding)=>validBinding(a)&&validBinding(b)&&keys.every(k=>a[k]===b[k]);
const blocked=(reason:string)=>({kind:'blocked' as const,reason});
/** Caller must source review/consent from trusted storage; equality is not authentication. */
export function adjustSmartMacros(input:{current:SmartTarget;newCalories:number;now:number;sourceFingerprint:string;binding?:SmartMacroBinding;context?:SmartMacroContext}):
 {kind:'blocked';reason:string}|{kind:'candidate';actionable:false;requiresAcceptance:true;target:SmartTarget}{
 if(!input||!input.context||!input.binding)return blocked('macro_context_required');
 const {current:g,newCalories:calories,now,context:c,binding:b}=input;
 if(!g||!c.current||!targetKeys.every(k=>amount(g[k]))||g.calories===0||!amount(calories)||calories===0||!stamp(now))
  return blocked('macro_input_invalid');
 if(Math.abs(g.calories-4*g.proteinG-4*g.carbsG-9*g.fatsG)>10)return blocked('macro_input_invalid');
 if(!sameBinding(b,c.binding)||b.sourceFingerprint!==input.sourceFingerprint||!targetKeys.every(k=>g[k]===c.current[k]))
  return blocked('macro_binding_mismatch');
 const r=c.review,l=c.limits;
 if(!r||r.status!=='reviewed'||!text(r.reviewId)||r.eligibility!=='eligible'||!finite(r.ageYears)||r.ageYears<19||
  !stamp(r.reviewedAt)||!stamp(r.expiresAt)||r.reviewedAt>now||r.expiresAt<=now||r.expiresAt<=r.reviewedAt)
  return blocked('macro_review_required');
 if(!l||!['proteinMinG','proteinMaxG','carbsMinG','carbsMaxG','fatsMinG','fatsMaxG'].every(k=>finite(l[k as keyof typeof l])&&l[k as keyof typeof l]>=0&&l[k as keyof typeof l]<=10000)||
  l.proteinMinG>l.proteinMaxG||l.carbsMinG>l.carbsMaxG||l.fatsMinG>l.fatsMaxG||
  !finite(l.fatMinFraction)||!finite(l.fatMaxFraction)||l.fatMinFraction<0||l.fatMaxFraction>1||l.fatMinFraction>l.fatMaxFraction)
  return blocked('macro_limits_invalid');
 if(g.proteinG<l.proteinMinG||g.proteinG>l.proteinMaxG)return blocked('protein_review_required');
 if(b.preset==='custom'){
  const choice=c.customChoice;
  if(!choice||!sameBinding(b,choice.binding)||!text(choice.consentId)||!stamp(choice.acceptedAt)||choice.acceptedAt>now)
   return blocked('custom_macro_consent_required');
  if(choice.mode==='preserve_percent')return blocked('custom_percentage_review_required');
  if(choice.mode!=='smart')return blocked('custom_macro_consent_required');
 }
 let best:{fats:number;carbs:number;distance:number;error:number;carbDistance:number}|null=null;
 for(let fats=Math.ceil(l.fatsMinG);fats<=Math.floor(l.fatsMaxG);fats++){
  const fraction=9*fats/calories;
  if(fraction<l.fatMinFraction||fraction>l.fatMaxFraction)continue;
  const residual=calories-4*g.proteinG-9*fats;
  if(residual<0)continue;
  // Check adjacent integer carbohydrate values; fail closed if neither meets the limits.
  for(const carbs of [Math.floor(residual/4),Math.ceil(residual/4)]){
   if(!amount(carbs)||carbs<l.carbsMinG||carbs>l.carbsMaxG)continue;
   const error=Math.abs(calories-4*g.proteinG-4*carbs-9*fats);
   if(error>10)continue;
   const distance=Math.abs(fats-g.fatsG),carbDistance=Math.abs(carbs-g.carbsG);
   if(!best||distance<best.distance||distance===best.distance&&(error<best.error||error===best.error&&carbDistance<best.carbDistance))
    best={fats,carbs,distance,error,carbDistance};
  }
 }
 if(!best)return blocked('macro_distribution_unavailable');
 return {kind:'candidate',actionable:false,requiresAcceptance:true,target:{calories,proteinG:g.proteinG,carbsG:best.carbs,fatsG:best.fats,fiberG:g.fiberG}};
}

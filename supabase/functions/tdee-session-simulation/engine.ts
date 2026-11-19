import {decideRules14} from '../../../release-candidates/tdee-adaptive-review/rules14Decision.ts';
import {applyRules14Nutrition} from '../../../release-candidates/tdee-adaptive-review/rules14Nutrition.ts';
import {adjustRules14Macros} from '../../../release-candidates/tdee-adaptive-review/smartMacroAdjustment.ts';
import {simulationFixture,fixtureActor,fixtureNow} from './fixture.ts';
/** Simulation only: never creates a proposal record or acceptance capability. */
export function computeSimulation(){
 const raw=simulationFixture();const s=raw.snapshot,p=raw.policy as any,h=raw.history as any;
 const decision=decideRules14(s,fixtureActor,h,p,fixtureNow);
 if(decision.kind!=='rules14_candidate')throw Error('simulation_rule_hold');
 const nutrition=applyRules14Nutrition(s,fixtureActor,p,raw.choice,fixtureNow);
 if(nutrition.kind!=='nutrition_policy_applied')throw Error('simulation_nutrition_hold');
 const macro=adjustRules14Macros({current:nutrition.request.current,newCalories:decision.targetCalories,now:fixtureNow,sourceFingerprint:decision.sourceFingerprint,binding:nutrition.request.binding,context:nutrition.context});
 if(macro.kind!=='candidate')throw Error('simulation_macro_hold');
 return {current:nutrition.request.current,recommended:macro.target,
  todayIntake:{calories:1200,proteinG:90,carbsG:120,fatsG:40,fiberG:18},
  inputs:{fictional:true,engine:'rules14-observed-v2',windowDays:14,startWeightKg:80,currentWeightKg:80,averageLoggedCalories:2000,targetLossLbPerWeek:0.5},
  deltaCalories:decision.deltaKcal};
}

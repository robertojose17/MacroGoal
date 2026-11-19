/** Memory-only fictional UI state. No live goal, journal, receipt or transport dependency. */
export type SimulationTargets={calories:number;proteinG:number;carbsG:number;fatsG:number;fiberG:number};
export type SimulationEnvelope={version:'tdee-session-simulation-v1';ownerId:string;sessionId:string;expiresAt:number;scenario:{current:SimulationTargets;recommended:SimulationTargets;todayIntake:SimulationTargets;inputs:{fictional:true;engine:'rules14-observed-v2';windowDays:14;startWeightKg:80;currentWeightKg:80;averageLoggedCalories:2000;targetLossLbPerWeek:0.5};deltaCalories:number}};
export type SimulationState={envelope:SimulationEnvelope;accepted:boolean;reviewOpen:boolean;tab:'dashboard'|'foods';closed:boolean};
const keys=['calories','proteinG','carbsG','fatsG','fiberG'] as const;
const exact=(v:any,k:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...k].sort().join('|');
function targets(v:any):v is SimulationTargets{return exact(v,[...keys])&&keys.every(k=>Number.isFinite(v[k])&&v[k]>=0&&v[k]<=10000)&&v.calories>0;}
export function parseSimulationEnvelope(raw:unknown,ownerId:string,sessionId:string,now:number):SimulationEnvelope{
 const r=raw as any;
 if(!exact(r,['version','ownerId','sessionId','expiresAt','scenario'])||r.version!=='tdee-session-simulation-v1'||!ownerId||!sessionId||r.ownerId!==ownerId||r.sessionId!==sessionId||!Number.isSafeInteger(now)||!Number.isSafeInteger(r.expiresAt)||r.expiresAt<=now||!exact(r.scenario,['current','recommended','todayIntake','inputs','deltaCalories'])||!targets(r.scenario.current)||!targets(r.scenario.recommended)||!targets(r.scenario.todayIntake)||JSON.stringify(Object.entries(r.scenario.inputs??{}).sort())!==JSON.stringify(Object.entries({fictional:true,engine:'rules14-observed-v2',windowDays:14,startWeightKg:80,currentWeightKg:80,averageLoggedCalories:2000,targetLossLbPerWeek:0.5}).sort())||r.scenario.deltaCalories!==r.scenario.recommended.calories-r.scenario.current.calories||r.expiresAt-now>86400000)throw Error('simulation_unavailable');
 return structuredClone(r);
}
export function simulationCurrent(s:SimulationState,ownerId:string,sessionId:string,now:number){return !s.closed&&s.envelope.ownerId===ownerId&&s.envelope.sessionId===sessionId&&now<s.envelope.expiresAt;}
export function createSimulation(raw:unknown,ownerId:string,sessionId:string,now:number):SimulationState{return {envelope:parseSimulationEnvelope(raw,ownerId,sessionId,now),accepted:false,reviewOpen:false,tab:'dashboard',closed:false};}
export type SimulationAction='review'|'accept'|'reject'|'reset'|'exit'|'dashboard'|'foods';
export function simulationTransition(s:SimulationState,action:SimulationAction,ownerId:string,sessionId:string,now:number):SimulationState{
 if(action==='exit'||!simulationCurrent(s,ownerId,sessionId,now))return {...s,closed:true,reviewOpen:false,accepted:false};
 if(action==='reset')return {...s,accepted:false,reviewOpen:false,tab:'dashboard'};
 if(action==='dashboard'||action==='foods')return {...s,tab:action};
 if(action==='review')return {...s,reviewOpen:true};
 if(action==='reject')return {...s,reviewOpen:false};
 if(action==='accept'&&s.reviewOpen)return {...s,accepted:true,reviewOpen:false};
 return s;
}
export function simulationTargets(s:SimulationState):SimulationTargets{return {...(s.accepted?s.envelope.scenario.recommended:s.envelope.scenario.current)};}

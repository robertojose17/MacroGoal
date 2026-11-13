import { progressHeaders } from './dispatcher.ts';
import { buildTargetTimeline, hasTargetIntegrityConflict } from './historicalTargets.ts';
import { resolveWeightSource } from './weightSource.ts';
import { computeTrendWeight } from './trendWeight.ts';
import { computeWeightPace } from './weightPace.ts';
import { aggregateNutritionByDay, computeLoggingReliability } from './loggingReliability.ts';
import { computeAdherence } from './adherence.ts';
import { assembleProgressState } from './assemble.ts';
import { PROGRESS_CONFIG } from './config.ts';
import { todayInZone } from '../dynamic-tdee/data.ts';
type Dependencies = { authenticate:(token:string)=>Promise<string|null>; context:(authorization:string)=>Promise<any>;
  read:(owner:string,authorization:string,now:Date)=>Promise<any>; now?:()=>Date };
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:progressHeaders});
function access(context:any,owner:string) {
  if (!context || context.ownerId!==owner || context.safety?.enabled!==false || context.safety?.eligibility!=='unverified' || context.proposal!==null)
    throw new Error('preview_access_denied');
}
export function createPreviewProgressHandler(deps:Dependencies) {
  return async (req:Request):Promise<Response> => {
    if(req.method!=='POST') return reply(405,{error:'method_not_allowed'});
    const authorization=req.headers.get('authorization')??'',token=authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
    if(!token)return reply(401,{error:'authentication_required'});
    try {
      const owner=await deps.authenticate(token);if(!owner)return reply(401,{error:'authentication_required'});
      const text=await req.text();if(text.length>2048)return reply(400,{error:'invalid_request'});
      let body:any;try{body=JSON.parse(text);}catch{return reply(400,{error:'invalid_request'});}
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='userId'))return reply(400,{error:'invalid_request'});
      if(body.userId!==undefined&&body.userId!==owner)return reply(403,{error:'owner_mismatch'});
      const before=await deps.context(authorization);access(before,owner);
      const now=deps.now?.()??new Date(),data=await deps.read(owner,authorization,now);
      const after=await deps.context(authorization);access(after,owner);
      if(before.fingerprint!==after.fingerprint||before.today!==after.today||data.todayStr!==before.today||
        todayInZone(now,data.profile.timezone)!==before.today||data.profile.journey_start_date!==after.profile?.journey_start_date)
        return reply(409,{error:'context_changed'});
      const {profile,activeGoal,allGoals,trackerWeights,checkInWeights,nutritionRaw,tdeeEstimates,todayStr}=data;
      const timeline=buildTargetTimeline(allGoals,tdeeEstimates,profile.timezone);
      const weightSource=resolveWeightSource(trackerWeights,checkInWeights,PROGRESS_CONFIG.trendWeightMinWeighIns);
      const nutrition=aggregateNutritionByDay(nutritionRaw),loggingResult=computeLoggingReliability(nutrition,todayStr);
      const weightPace=computeWeightPace(weightSource.points,todayStr);
      const last14=nutrition.filter(d=>d.date>=new Date(Date.parse(todayStr+'T12:00:00Z')-14*86400000).toISOString().slice(0,10));
      const phaseHistory=tdeeEstimates.filter((t:any)=>todayInZone(new Date(t.created_at),profile.timezone)>=profile.journey_start_date);
      const state=assembleProgressState({userId:owner,profile,activeGoal,weightSource,trendWeightLbs:computeTrendWeight(weightSource.points),weightPace,
        loggingResult,adherence:computeAdherence(nutrition,timeline,loggingResult.loggingReliability,todayStr),
        tdee:{value:null,source:'none',confidence:null},statusResult:{progressStatus:'INSUFFICIENT_DATA',possiblePlateau:false},
        projection:{projectedGoalDate:null,projectedGoalDateRange:null,projectionBasis:'none',projectionConfidence:null,weeksToGoal:null},
        tdeeEstimates:phaseHistory,targetTimeline:timeline,hasTargetIntegrityConflict:hasTargetIntegrityConflict(activeGoal?.daily_calories??null,tdeeEstimates,activeGoal?.created_at),todayStr,
        avgDailyCaloriesLogged:last14.length>=4?Math.round(last14.reduce((s,d)=>s+d.calories,0)/last14.length):null,
        avgDailyProteinLogged:last14.length>=4?Math.round(last14.reduce((s,d)=>s+d.protein,0)/last14.length*10)/10:null});
      // Observations and accepted targets only. No legacy TDEE/formula, pace target,
      // deadline projection, recommendation or mutation is activated by this route.
      const adaptiveHistory=state.adaptiveHistory.map(h=>({...h,effectiveDate:timeline.find(e=>e.sourceWeekStart===h.weekStart&&e.calorieTarget===h.prescribedCalories)?.effectiveDate??h.effectiveDate}));
      const journeyProgress = {
        startWeightLbs: state.journeyStartWeightLbs,
        goalWeightLbs: state.goalWeightLbs,
        currentWeightLbs: state.currentWeightLbs,
        progressFraction: state.progressToGoalFraction,
      };
      return reply(200,{...state,journeyProgress,adaptiveHistory,lastAdaptiveAdjustment:adaptiveHistory[0]??null,previewOnly:true,
        previewVersion:'private-progress-v1',interpretationAvailable:false,proposal:null,safety:{enabled:false,eligibility:'unverified'}});
    } catch(error) {
      const message=error instanceof Error?error.message:'';
      if(message.includes('preview_access_denied'))return reply(403,{error:'preview_access_denied'});
      if(message==='context_changed')return reply(409,{error:message});
      return reply(503,{error:'source_unavailable'});
    }
  };
}

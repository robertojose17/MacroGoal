import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient, fetchAllData } from './queries.ts';
import { resolveWeightSource } from './weightSource.ts';
import { computeTrendWeight } from './trendWeight.ts';
import { computeWeightPace } from './weightPace.ts';
import { buildTargetTimeline, hasTargetIntegrityConflict } from './historicalTargets.ts';
import { aggregateNutritionByDay, computeLoggingReliability } from './loggingReliability.ts';
import { computeAdherence } from './adherence.ts';
import { computeProgressStatus } from './progressStatus.ts';
import { computeProjection } from './projection.ts';
import { computeTDEE } from './tdee.ts';
import { assembleProgressState } from './assemble.ts';
import { PROGRESS_CONFIG } from './config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();
    const userId = body?.userId;

    if (!userId || typeof userId !== 'string') {
      return new Response(JSON.stringify({ error: 'userId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createSupabaseClient();
    const data = await fetchAllData(supabase, userId);
    const { profile, activeGoal, allGoals, trackerWeights, checkInWeights, nutritionRaw, tdeeEstimates, todayStr } = data;

    const weightSource = resolveWeightSource(trackerWeights, checkInWeights, PROGRESS_CONFIG.trendWeightMinWeighIns);
    if (weightSource.usedLegacyFallback) {
      console.log(`[PIE] legacy_weight_fallback userId=${userId}`);
    }

    const trendWeightLbs = computeTrendWeight(weightSource.points);
    const weightPace = computeWeightPace(weightSource.points, todayStr);
    const dailyNutrition = aggregateNutritionByDay(nutritionRaw);
    const loggingResult = computeLoggingReliability(dailyNutrition, todayStr);
    const targetTimeline = buildTargetTimeline(allGoals, tdeeEstimates);
    const integrityConflict = hasTargetIntegrityConflict(
      activeGoal?.daily_calories ? Number(activeGoal.daily_calories) : null,
      tdeeEstimates
    );
    const adherence = computeAdherence(dailyNutrition, targetTimeline, loggingResult.loggingReliability, todayStr);
    const tdee = computeTDEE(tdeeEstimates, profile, todayStr);

    const lastPoint = weightSource.points.length > 0 ? weightSource.points[weightSource.points.length - 1] : null;
    const thirtyDaysAgo = new Date(todayStr + 'T00:00:00Z');
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const currentWeightLbs = (lastPoint && lastPoint.date >= thirtyDaysAgo.toISOString().split('T')[0]) ? lastPoint.weightLbs : null;
    const goalWeightLbs = profile?.goal_weight ? Number(profile.goal_weight) * 2.20462 : null;
    const goalType = (activeGoal?.goal_type as 'lose' | 'maintain' | 'gain' | null) ?? null;
    const intendedLossRate = activeGoal?.loss_rate_lbs_per_week ? Number(activeGoal.loss_rate_lbs_per_week) : null;
    const currentCalorieTarget = activeGoal?.daily_calories ? Number(activeGoal.daily_calories) : null;

    let daysSinceJourneyStart: number | null = null;
    if (profile?.journey_start_date) {
      const start = new Date(profile.journey_start_date + 'T00:00:00Z');
      const today = new Date(todayStr + 'T00:00:00Z');
      daysSinceJourneyStart = Math.floor((today.getTime() - start.getTime()) / 86400000);
    }

    const statusResult = computeProgressStatus(
      weightPace, goalType, currentWeightLbs, goalWeightLbs,
      currentCalorieTarget, intendedLossRate, weightSource.points, todayStr, daysSinceJourneyStart
    );

    const projection = computeProjection(currentWeightLbs, goalWeightLbs, weightPace, intendedLossRate, goalType, todayStr);

    const fourteenDaysAgo = new Date(todayStr + 'T00:00:00Z');
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0];
    const last14 = dailyNutrition.filter(d => d.date >= fourteenDaysAgoStr && d.date <= todayStr);
    const avgDailyCaloriesLogged = last14.length >= 4 ? Math.round(last14.reduce((s, d) => s + d.calories, 0) / last14.length) : null;
    const avgDailyProteinLogged = last14.length >= 4 ? Math.round(last14.reduce((s, d) => s + d.protein, 0) / last14.length * 10) / 10 : null;

    const progressState = assembleProgressState({
      userId, profile, activeGoal, weightSource, trendWeightLbs, weightPace,
      loggingResult, adherence, tdee, statusResult, projection, tdeeEstimates,
      targetTimeline, hasTargetIntegrityConflict: integrityConflict, todayStr,
      avgDailyCaloriesLogged, avgDailyProteinLogged,
    });

    const elapsed = Date.now() - startTime;
    console.log(`[PIE] userId=${userId} status=${progressState.progressStatus} elapsed=${elapsed}ms`);

    return new Response(JSON.stringify(progressState), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[PIE] error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

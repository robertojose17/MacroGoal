export async function readChallengeMetric(metric, readers, date = new Date()) {
  const names={steps:'getStepsForDate',active_calories:'getActiveCaloriesForDate',exercise_minutes:'getExerciseMinutesForDate',distance:'getDistanceMilesForDate',floors:'getFlightsClimbedForDate'};
  const read=readers[names[metric]];
  if (!read) return null;
  try {
    const result=await read(date);
    const value=metric==='steps'?result.steps:result.value;
    return result.available && result.permission==='granted' && Number.isFinite(value) && value>=0 ? value : null;
  } catch {return null;}
}
export async function acceptWithHealthBaseline(metric, readers, accept) {
  const baseline=await readChallengeMetric(metric,readers);
  if (baseline===null) throw new Error('Connect your health app and allow this activity before accepting the challenge.');
  await accept(baseline);
  return baseline;
}
export function healthChallengeProgress(current,baseline,target) {
  if (![current,baseline,target].every(Number.isFinite) || current<0 || baseline<0 || target<=0) return {progress:0,progressPct:0};
  const progress=Math.max(0,current-baseline);
  return {progress:Math.round(progress*10)/10,progressPct:Math.min(100,Math.round(progress/target*100))};
}

// Referral counts are tracked by the referral service, not the health provider.
export async function acceptChallengeWithBaseline(metric, readers, accept) {
  if (metric === 'referral') {await accept(0);return 0;}
  return acceptWithHealthBaseline(metric,readers,accept);
}

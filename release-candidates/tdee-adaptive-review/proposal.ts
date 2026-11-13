/** Offline engineering candidate. No runtime binding, storage, network or prescription. */
export const ADAPTIVE_RELEASE_STATE = Object.freeze({
  recommendationsEnabled: false,
  acceptanceEnabled: false,
  reviewedPolicyId: null,
} as const);

export type GoalState = {
  id: string; updatedAt: string | null; kind: 'lose' | 'gain' | 'maintain';
  calories: number; proteinG: number; carbsG: number; fatsG: number; fiberG: number;
};
/** All numerical adjustment choices are required review inputs, never defaults. */
export type PolicyCandidate = {
  id: string; digest: string; modelRevision: string;
  maxStepKcal: number; maxStepFraction: number; maxCumulativeIncreaseKcal: number;
  minDaysBetweenAcceptances: number; incrementKcal: number;
  minIntakeKcal: number; maxIntakeKcal: number; maxEvidenceAgeMs: number; maxWeightAgeDays: number;
  macroStrategy: 'preserve_accepted_energy_ratios';
};
export type DraftContext = {
  ownerId: string; expectedOwnerId: string; profileUpdatedAt: string | null;
  sex: 'male' | 'female'; dateOfBirth: string; currentWeightKg: number; targetWeightKg: number;
  goal: GoalState;
  // These must be derived from one enriched snapshot, not separate client reads.
  source: {
    kind: 'adaptive-evidence-v1'; fingerprint: string; ownerRevision: string;
    writerProtocol: 'serialized-owner-v1'; capturedAt: string; today: string; timezone: string;
    modelRevision: string; validation: 'reviewed_for_adaptation';
    logging: 'explicit_complete_day_attestations'; completenessDigest: string;
    kcalPerDay: number; sensitivityLow: number; sensitivityHigh: number;
    windowStart: string; asOf: string; windowDays: number; loggedDays: number; weightDays: number;
    latestWeight: { source: 'check_in' | 'tracker_entry'; rowId: string; date: string; valueKg: number;
      selection: 'latest_non_conflicting_normalized_weight_v1' };
  };
  eligibility: {
    status: 'reviewed_eligible'; digest: string; policyDigest: string; expiresAt: string;
    goalId: string; goalUpdatedAt: string | null; profileUpdatedAt: string | null;
  };
  anchor: {
    ownerId: string; goalId: string; goalUpdatedAt: string | null;
    modelRevision: string; baselineIntakeKcal: number; baselineExpenditureKcal: number;
    sensitivityLow: number; sensitivityHigh: number; acceptedIncreaseKcal: number;
    receiptChainValidated: true; lastAcceptedAt: string | null;
  };
};
export type DraftResult = {
  kind: 'blocked' | 'no_change'; reason: string; actionable: false;
} | {
  kind: 'engineering_draft'; actionable: false; professionalReviewRequired: true;
  ownerId: string; policyDigest: string; eligibilityDigest: string; sourceFingerprint: string;
  ownerRevision: string; expectedGoal: GoalState; expectedProfileUpdatedAt: string | null;
  target: Pick<GoalState, 'calories' | 'proteinG' | 'carbsG' | 'fatsG' | 'fiberG'>;
  deltaKcal: number; cumulativeIncreaseKcal: number; capturedAt: string;
  explanation: 'preserve_anchor_energy_gap_without_stacking_deficit';
};
const hash = (x: unknown): x is string => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const id = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const positive = (x: unknown): x is number => finite(x) && x > 0;
function time(x: unknown): x is string {
  if (typeof x !== 'string' || !civil(x.slice(0,10))) return false;
  const parts = /^\d{4}-\d{2}-\d{2}T(\d{2}):([0-5]\d):([0-5]\d)(?:\.\d{1,6})?(Z|([+-])(\d{2}):([0-5]\d))$/.exec(x);
  return !!parts && Number(parts[1]) <= 23 && (parts[4] === 'Z' || (Number(parts[6]) <= 14 && (Number(parts[6]) < 14 || Number(parts[7]) === 0))) && Number.isFinite(Date.parse(x));
}
const version = (x: unknown): x is string | null => x === null || time(x);
const dayMs = 86400000;
function civil(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const d = new Date(x + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === x;
}
const blocked = (reason: string): DraftResult => ({kind:'blocked',reason,actionable:false});
const unchanged = (reason: string): DraftResult => ({kind:'no_change',reason,actionable:false});
function validGoal(g: GoalState): boolean {
  return !!g && id(g.id) && version(g.updatedAt) && ['lose','gain','maintain'].includes(g.kind) &&
    positive(g.calories) && [g.proteinG,g.carbsG,g.fatsG,g.fiberG].every(x => finite(x) && x >= 0) &&
    Math.abs(4*g.proteinG + 4*g.carbsG + 9*g.fatsG - g.calories) <= 10;
}
function validPolicy(p: PolicyCandidate): boolean {
  return !!p && typeof p.id === 'string' && p.id.trim().length > 0 && hash(p.digest) && hash(p.modelRevision) &&
    [p.maxStepKcal,p.maxStepFraction,p.maxCumulativeIncreaseKcal,p.minDaysBetweenAcceptances,p.incrementKcal,p.minIntakeKcal,p.maxIntakeKcal,p.maxEvidenceAgeMs,p.maxWeightAgeDays].every(positive) &&
    p.maxStepFraction <= 1 && Number.isInteger(p.maxWeightAgeDays) && Number.isInteger(p.minDaysBetweenAcceptances) && Number.isInteger(p.incrementKcal) &&
    p.maxIntakeKcal >= p.minIntakeKcal && p.macroStrategy === 'preserve_accepted_energy_ratios';
}

/**
 * Private-server design input only, never a request-body adapter. Even successful
 * results are non-actionable drafts. No policy has been approved or installed.
 * Current observation-v1 low/unverified output cannot satisfy this contract.
 */
export function proposeForProfessionalReview(context: DraftContext, policy: PolicyCandidate, nowMs: number): DraftResult {
  if (!finite(nowMs) || !validPolicy(policy)) return blocked('policy_review_input_invalid');
  if (!context || !id(context.ownerId) || context.ownerId !== context.expectedOwnerId) return blocked('account_changed');
  if (!Object.prototype.hasOwnProperty.call(context,'profileUpdatedAt') || !version(context.profileUpdatedAt) || !validGoal(context.goal)) return blocked('accepted_state_unavailable');
  const {source:s, eligibility:e, anchor:a, goal:g} = context;
  if (!s || s.kind !== 'adaptive-evidence-v1' || s.validation !== 'reviewed_for_adaptation' || s.logging !== 'explicit_complete_day_attestations') return blocked('validated_evidence_required');
  if (s.writerProtocol !== 'serialized-owner-v1' || !hash(s.ownerRevision)) return blocked('source_writer_protocol_required');
  if (!hash(s.fingerprint) || !hash(s.completenessDigest) || s.modelRevision !== policy.modelRevision || !time(s.capturedAt) || !civil(s.today)) return blocked('source_contract_invalid');
  if (Date.parse(s.capturedAt) > nowMs || nowMs-Date.parse(s.capturedAt) > policy.maxEvidenceAgeMs) return blocked('source_expired');
  try {
    const format = new Intl.DateTimeFormat('en-US',{timeZone:s.timezone,year:'numeric',month:'2-digit',day:'2-digit'});
    const date = (value: Date) => { const parts = format.formatToParts(value); const part = (name: string) => parts.find(p => p.type === name)?.value; return `${part('year')}-${part('month')}-${part('day')}`; };
    if (typeof s.timezone !== 'string' || !s.timezone || date(new Date(s.capturedAt)) !== s.today || date(new Date(nowMs)) !== s.today) return blocked('source_clock_invalid');
  } catch { return blocked('source_clock_invalid'); }
  const start = civil(s.windowStart) ? Date.parse(s.windowStart+'T00:00:00Z') : NaN;
  const end = civil(s.asOf) ? Date.parse(s.asOf+'T00:00:00Z') : NaN;
  const ageDays = (Date.parse(s.today+'T00:00:00Z')-end)/dayMs;
  if (![s.kcalPerDay,s.sensitivityLow,s.sensitivityHigh].every(positive) || s.kcalPerDay < 1000 || s.kcalPerDay > 5000 || s.sensitivityLow >= s.kcalPerDay || s.sensitivityHigh <= s.kcalPerDay ||
      !Number.isInteger(s.windowDays) || s.windowDays < 21 || s.windowDays > 28 || (end-start)/dayMs !== s.windowDays || ageDays < 1 || ageDays > 3 ||
      s.loggedDays !== s.windowDays || !Number.isInteger(s.weightDays) || s.weightDays < 10 || s.weightDays > s.windowDays+1) return blocked('source_coverage_invalid');
  // A stale profile weight must not override the latest reconciled source weight.
  // Freshness is an explicit unapproved policy input, not a hidden medical threshold.
  const weight = s.latestWeight;
  const weightAgeDays = weight && civil(weight.date) ? (Date.parse(s.today+'T00:00:00Z')-Date.parse(weight.date+'T00:00:00Z'))/dayMs : NaN;
  if (!weight || !['check_in','tracker_entry'].includes(weight.source) || !id(weight.rowId) ||
      weight.selection !== 'latest_non_conflicting_normalized_weight_v1' || !positive(weight.valueKg) ||
      weight.valueKg !== context.currentWeightKg || weight.date < s.windowStart || weight.date > s.asOf ||
      !finite(weightAgeDays) || weightAgeDays < 0 || weightAgeDays > policy.maxWeightAgeDays) return blocked('current_weight_evidence_required');
  if (!civil(context.dateOfBirth) || context.dateOfBirth > `${Number(s.today.slice(0,4))-18}${s.today.slice(4)}` || context.dateOfBirth < `${Number(s.today.slice(0,4))-100}${s.today.slice(4)}`) return blocked('adult_scope_unverified');
  if (!['male','female'].includes(context.sex) || !positive(context.currentWeightKg) || !positive(context.targetWeightKg)) return blocked('profile_review_required');
  if ((g.kind === 'lose' && context.currentWeightKg <= context.targetWeightKg) || (g.kind === 'gain' && context.currentWeightKg >= context.targetWeightKg)) return blocked('goal_reached_or_direction_conflict');
  if (!e || e.status !== 'reviewed_eligible' || !hash(e.digest) || e.policyDigest !== policy.digest || !time(e.expiresAt) || Date.parse(e.expiresAt) <= nowMs ||
      e.goalId !== g.id || e.goalUpdatedAt !== g.updatedAt || e.profileUpdatedAt !== context.profileUpdatedAt) return blocked('eligibility_review_required');
  if (!a || a.ownerId !== context.ownerId || a.goalId !== g.id || a.goalUpdatedAt !== g.updatedAt || a.modelRevision !== s.modelRevision || a.receiptChainValidated !== true ||
      ![a.baselineIntakeKcal,a.baselineExpenditureKcal,a.sensitivityLow,a.sensitivityHigh].every(positive) || a.baselineExpenditureKcal < 1000 || a.baselineExpenditureKcal > 5000 || !finite(a.acceptedIncreaseKcal) || a.acceptedIncreaseKcal < 0 ||
      a.sensitivityLow >= a.baselineExpenditureKcal || a.sensitivityHigh <= a.baselineExpenditureKcal ||
      Math.abs(a.baselineIntakeKcal+a.acceptedIncreaseKcal-g.calories)>0.001) return blocked('accepted_anchor_review_required');
  if ((a.acceptedIncreaseKcal > 0 && a.lastAcceptedAt === null) || (a.lastAcceptedAt !== null && (!time(a.lastAcceptedAt) || Date.parse(a.lastAcceptedAt)>nowMs || nowMs-Date.parse(a.lastAcceptedAt)<policy.minDaysBetweenAcceptances*dayMs))) return blocked('review_cooldown');
  const energyGap = a.baselineIntakeKcal-a.baselineExpenditureKcal;
  if ((g.kind === 'lose' && energyGap >= 0) || (g.kind === 'gain' && energyGap <= 0) || (g.kind === 'maintain' && energyGap !== 0)) return blocked('anchor_intent_requires_review');
  const floor = Math.max(context.sex === 'female' ? 1200 : 1500, policy.minIntakeKcal);
  if (g.calories < floor || g.calories > policy.maxIntakeKcal) return blocked('existing_goal_requires_review');
  const desired = a.baselineIntakeKcal + (s.kcalPerDay-a.baselineExpenditureKcal);
  // No existing deficit is subtracted a second time; no downward adjustment is allowed.
  if (desired < g.calories) return blocked('downward_adjustment_requires_review');
  if (desired === g.calories) return unchanged('same_anchored_target');
  // This conservative engineering check is not a statistical significance claim.
  if (s.sensitivityLow <= a.sensitivityHigh) return blocked('overlapping_sensitivity_ranges');
  const remaining = policy.maxCumulativeIncreaseKcal-a.acceptedIncreaseKcal;
  const cap = Math.min(desired-g.calories,policy.maxStepKcal,g.calories*policy.maxStepFraction,remaining,policy.maxIntakeKcal-g.calories);
  const delta = Math.floor(cap/policy.incrementKcal)*policy.incrementKcal;
  if (!finite(delta) || delta < policy.incrementKcal) return unchanged('step_or_cumulative_limit');
  const calories = g.calories+delta, energy = 4*g.proteinG+4*g.carbsG+9*g.fatsG;
  if (!positive(energy) || calories < floor || calories < g.calories) return blocked('target_invalid');
  const scale = calories/energy, round = (x: number) => Math.round(x);
  const target = {calories,proteinG:round(g.proteinG*scale),carbsG:round(g.carbsG*scale),fatsG:round(g.fatsG*scale),fiberG:g.fiberG};
  if (!Object.values(target).every(Number.isInteger) || !validGoal({...g,...target})) return blocked('macro_allocation_requires_review');
  return {kind:'engineering_draft',actionable:false,professionalReviewRequired:true,ownerId:context.ownerId,
    policyDigest:policy.digest,eligibilityDigest:e.digest,sourceFingerprint:s.fingerprint,ownerRevision:s.ownerRevision,
    expectedGoal:{id:g.id,updatedAt:g.updatedAt,kind:g.kind,calories:g.calories,proteinG:g.proteinG,carbsG:g.carbsG,fatsG:g.fatsG,fiberG:g.fiberG},expectedProfileUpdatedAt:context.profileUpdatedAt,target,deltaKcal:delta,
    cumulativeIncreaseKcal:a.acceptedIncreaseKcal+delta,capturedAt:s.capturedAt,
    explanation:'preserve_anchor_energy_gap_without_stacking_deficit'};
}

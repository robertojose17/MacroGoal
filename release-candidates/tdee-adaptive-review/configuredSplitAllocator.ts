/**
 * Inert candidate: no runtime imports, persistence, clinical policy or authority.
 * Binding equality is a server-side integration contract, not authentication.
 */
export type GoalBinding = { goalId: string; revision: string; preset: string };
export type ConfiguredSplit = {
  version: 'configured-split-v1'; binding: GoalBinding;
  proteinBps: number; carbsBps: number; fatBps: number;
};
export type AllocationInput = {
  goal: GoalBinding; newCalories: number; currentProteinG: number; currentFiberG: number;
  explicitSplit?: ConfiguredSplit;
};
export type AllocationResult =
  | { kind: 'blocked'; actionable: false; reason: string }
  | { kind: 'candidate'; actionable: false; requiresAcceptance: true;
      resolverVersion: 'configured-split-v1'; goal: GoalBinding;
      calories: number; proteinG: number; carbsG: number; fatsG: number; fiberG: number;
      energyErrorKcal: number };
const blocked = (reason: string): AllocationResult => ({ kind: 'blocked', actionable: false, reason });
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const binding = (x: unknown): x is GoalBinding => !!x && typeof x === 'object' &&
  ['goalId', 'revision', 'preset'].every(k => typeof (x as Record<string, unknown>)[k] === 'string' &&
    ((x as Record<string, string>)[k]).trim().length > 0);
const sameBinding = (a: GoalBinding, b: GoalBinding) =>
  a.goalId === b.goalId && a.revision === b.revision && a.preset === b.preset;
const presets: Record<string, readonly [number, number, number]> = {
  balanced: [3000, 4000, 3000], high_protein: [4000, 3500, 2500], low_carb: [3500, 2500, 4000],
};
export function allocateConfiguredSplit(input: AllocationInput): AllocationResult {
  if (!input || !binding(input.goal) || !integer(input.newCalories) || input.newCalories === 0 || input.newCalories > 10000 ||
      !integer(input.currentProteinG) || input.currentProteinG > 10000 || !integer(input.currentFiberG) || input.currentFiberG > 10000) return blocked('invalid_input');
  const goal = input.goal;
  if (goal.preset === 'lean_body') return blocked('non_percentage_strategy');
  let shares: readonly number[];
  if (goal.preset === 'custom') {
    const s = input.explicitSplit;
    if (!s) return blocked('configured_split_missing');
    if (s.version !== 'configured-split-v1' || !binding(s.binding) || !sameBinding(goal, s.binding))
      return blocked('configured_split_binding_mismatch');
    shares = [s.proteinBps, s.carbsBps, s.fatBps];
  } else {
    if (!Object.hasOwn(presets, goal.preset)) return blocked('unsupported_preset');
    if (input.explicitSplit !== undefined) return blocked('unexpected_split_override');
    shares = presets[goal.preset];
  }
  if (!shares.every(n => integer(n) && n <= 10000) || shares.reduce((a, b) => a + b, 0) !== 10000)
    return blocked('invalid_configured_split');
  const factors = [4, 4, 9];
  const ideals = shares.map((share, i) => input.newCalories * (share / 10000) / factors[i]);
  if (!ideals.every(Number.isFinite)) return blocked('numeric_range_invalid');
  let best: { grams: number[]; error: number; deviation: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const grams = ideals.map((n, i) => mask & (1 << i) ? Math.ceil(n) : Math.floor(n));
    if (!grams.every(n => integer(n) && n <= 10000)) continue;
    const energy = grams.reduce((sum, n, i) => sum + n * factors[i], 0);
    const error = Math.abs(energy - input.newCalories);
    const deviation = grams.reduce((sum, n, i) => sum + Math.abs(n - ideals[i]), 0);
    if (!Number.isSafeInteger(energy) || error > 10 || grams.some((n, i) => Math.abs(n - ideals[i]) > 1)) continue;
    if (!best || error < best.error || (error === best.error && deviation < best.deviation))
      best = { grams, error, deviation };
  }
  if (!best) return blocked('rounding_unavailable');
  // Do not distort the configured split to bypass the existing exact-protein guard.
  if (best.grams[0] !== input.currentProteinG) return blocked('protein_guard_conflict');
  return { kind: 'candidate', actionable: false, requiresAcceptance: true,
    resolverVersion: 'configured-split-v1', goal: { ...goal }, calories: input.newCalories,
    proteinG: best.grams[0], carbsG: best.grams[1], fatsG: best.grams[2], fiberG: input.currentFiberG,
    energyErrorKcal: best.error };
}

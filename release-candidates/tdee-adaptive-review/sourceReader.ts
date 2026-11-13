/** Read-only bridge to the installed atomic observation RPC. No live binding. */
import { parseObservedSnapshot, type ObservedSnapshot } from '../../supabase/functions/observed-snapshot-release/functions/observed-program/snapshot.ts';

/** Missing from the installed snapshot contract, not inferred from diary volume. */
export const OBSERVATION_ADAPTIVE_GAPS = Object.freeze([
  'full_goal_snapshot_and_profile_goal_cas',
  'profile_sex_and_target_weight_with_units',
  'serialized_source_epoch_revision',
  'explicit_complete_day_attestations',
  'reviewed_model_and_policy',
  'current_reviewed_eligibility',
  'accepted_anchor_and_validated_receipt_chain',
] as const);
export type SourceReadResult = {
  kind: 'observation_only'; snapshot: ObservedSnapshot;
  reason: 'premium_required' | 'disabled' | 'adaptive_evidence_unavailable';
  missing: readonly string[];
};
export interface ReadOnlySourceDependencies {
  authenticate(token: string): Promise<string | null>;
  // Must use actor JWT, anon key and precisely this installed read-only RPC.
  // No service-role fallback, per-table reads or pagination can supply this snapshot.
  rpc(authorization: string, name: 'observed_get_tdee_snapshot_v1'): Promise<unknown>;
}
const uuid = (x:string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
export function createReadOnlySourceReader(deps: ReadOnlySourceDependencies) {
  return async (actor: string, authorization: string): Promise<SourceReadResult> => {
    const token = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1];
    if (!uuid(actor) || !token) throw new Error('authentication_required');
    let verified: string | null;
    try { verified = await deps.authenticate(token); } catch { throw new Error('authentication_required'); }
    if (verified !== actor) throw new Error('authentication_required');
    let raw: unknown;
    try { raw = await deps.rpc(authorization, 'observed_get_tdee_snapshot_v1'); }
    catch { throw new Error('source_unavailable'); }
    const snapshot = parseObservedSnapshot(raw, actor);
    // Even forged extension fields cannot upgrade this version to reviewed evidence.
    const reason = !snapshot.context.premium ? 'premium_required' : !snapshot.context.enabled ? 'disabled' : 'adaptive_evidence_unavailable';
    return { kind: 'observation_only', snapshot, reason, missing: OBSERVATION_ADAPTIVE_GAPS };
  };
}

export interface EnrichedSourceSnapshot {
  version: 'adaptive-source-snapshot-v1'; ownerId: string; observation: ObservedSnapshot;
  profile: { id: string; updatedAt: string|null; sex: string|null; dateOfBirth: string|null };
  goalSnapshot: Record<string,unknown>|null;
  targetWeight: {raw:unknown;unitVerified:false};
  evidence: Record<string,unknown>; actionable:false;
}
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
/** Private server parser, not a browser response or a reviewed DraftContext. */
export function parseEnrichedSource(value:unknown,actor:string):EnrichedSourceSnapshot {
  const fail=():never=>{throw new Error('enriched_source_invalid');};
  if(!record(value)||value.version!=='adaptive-source-snapshot-v1'||value.ownerId!==actor||value.actionable!==false) return fail();
  const observation=parseObservedSnapshot(value.observation,actor);
  const p=value.profile,g=value.goalSnapshot,e=value.evidence,t=value.targetWeight;
  const nullableTime=(v:unknown)=>v===null||(typeof v==='string'&&Number.isFinite(Date.parse(v)));
  if(!record(p)||p.id!==actor||!nullableTime(p.updatedAt)||!(p.sex===null||typeof p.sex==='string')||!(p.dateOfBirth===null||typeof p.dateOfBirth==='string')||
    !record(e)||!['writerProtocol','loggingCompleteness','eligibility','policy','modelValidation','acceptedAnchor'].every(k=>e[k]==='unverified')||e.sourceEpoch!==null||e.sourceRevision!==null||
    !record(t)||t.unitVerified!==false) return fail();
  const current=observation.context.currentGoal;
  if(g===null){if(current!==null) return fail();}
  else {
    if(!record(g)||g.user_id!==actor||g.is_active!==true||!nullableTime(g.updated_at)||!current||g.id!==current.id||
       !['daily_calories','protein_g','carbs_g','fats_g','fiber_g'].every(k=>g[k]===current[k as keyof typeof current])||t.raw!==g.target_weight) return fail();
  }
  return structuredClone({...value,observation}) as unknown as EnrichedSourceSnapshot;
}

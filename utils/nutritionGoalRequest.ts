import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppDatabase } from '@/lib/supabase/databaseContracts';
import type { Database } from '@/lib/supabase/types';
import { randomUUID } from 'expo-crypto';
import { emitGoalChanged } from './goalChangeEvents';
import type { GoalRequestJournal, GoalJournalOperation } from './goalRequestJournal';

export type GoalRow = Database['public']['Tables']['goals']['Row'];
export type GoalClient = Pick<SupabaseClient<AppDatabase>, 'auth' | 'from' | 'rpc'>;
export type RequestOptions = { client: GoalClient; makeRequestId?: () => string; journal?: GoalRequestJournal };
export type RequestIdentity = { userId: string; expectedProfileUpdatedAt: string | null; expectedGoal: GoalRow | null; isCurrent: () => boolean };
export class NutritionGoalRequestError extends Error {
  constructor(message: string, public readonly code: string, public readonly uncertain = false) { super(message); this.name = 'NutritionGoalRequestError'; }
}
export function fail(message: string, code = '22023'): never { throw new NutritionGoalRequestError(message, code); }
export const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nullableNumber = (value: unknown) => value === null || finite(value);
const nullableText = (value: unknown) => value === null || typeof value === 'string';
const timestamp = (value: unknown) => typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
const nullableTimestamp = (value: unknown) => value === null || timestamp(value);
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function validGoal(value: unknown, owner: string): value is GoalRow {
  if (!record(value) || value.user_id !== owner || value.is_active !== true || !uuid(value.id) || !uuid(value.user_id) ||
      typeof value.goal_type !== 'string' || !['lose', 'gain', 'maintain'].includes(value.goal_type) ||
      !nullableText(value.macro_preset) || !nullableTimestamp(value.updated_at) || !timestamp(value.created_at) ||
      !nullableText(value.start_date) || !nullableText(value.start_journey_date) || !nullableTimestamp(value.last_adaptive_update)) return false;
  return ['daily_calories', 'protein_g', 'carbs_g', 'fats_g', 'fiber_g'].every(k => finite(value[k]) && Number.isInteger(value[k]) && value[k] >= 0 && value[k] <= 10000)
    && finite(value.daily_calories) && value.daily_calories > 0
    && ['goal_intensity', 'target_weight', 'loss_rate_lbs_per_week', 'base_daily_calories'].every(k => nullableNumber(value[k]));
}
export function checkIdentity(input: RequestIdentity) {
  if (!uuid(input.userId) || typeof input.isCurrent !== 'function' || !nullableTimestamp(input.expectedProfileUpdatedAt)) fail('profile_review_required');
  if (input.expectedGoal !== null && !validGoal(input.expectedGoal, input.userId)) fail('goal_review_required');
}
export function copyJson<T>(value: T): T {
  // Reject values that JSON would silently coerce/drop, then deep-copy the immutable request.
  const visit = (item: unknown): void => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (record(item) && Object.getPrototypeOf(item) === Object.prototype) { Object.values(item).forEach(visit); return; }
    fail('invalid_request_value');
  };
  visit(value);
  return JSON.parse(JSON.stringify(value));
}
export async function assertOwner(client: GoalClient, owner: string, current: () => boolean) {
  if (!current()) fail('request_cancelled', '42501');
  const { data, error } = await client.auth.getUser();
  if (error || data.user?.id !== owner || data.user?.is_anonymous) fail('account_changed', '42501');
  if (!current()) fail('request_cancelled', '42501');
}
export async function readGoal(client: GoalClient, owner: string) {
  const { data, error } = await client.from('goals').select('*').eq('user_id', owner).eq('is_active', true).maybeSingle();
  if (error || !validGoal(data, owner)) throw new NutritionGoalRequestError('goal_readback_unavailable', 'READBACK', true);
  return data;
}
export function sameFields(actual: GoalRow, expected: Partial<GoalRow>, keys: readonly (keyof GoalRow)[]) {
  return keys.every(key => actual[key] === expected[key]);
}
export const preservedGoalKeys = ['daily_calories', 'protein_g', 'carbs_g', 'fats_g', 'fiber_g', 'goal_type', 'goal_intensity', 'target_weight', 'loss_rate_lbs_per_week', 'macro_preset'] as const;

function equalJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value,index) => equalJson(value,b[index]));
  if (!record(a) || !record(b)) return false;
  const keys=Object.keys(a).sort(), other=Object.keys(b).sort();
  return keys.length === other.length && keys.every((key,index) => key === other[index] && equalJson(a[key],b[key]));
}

// One lease per actor across all save/restart controllers in this process.
const leases = new Map<string, object>();
export function decodeRequestIdentity(value: unknown, isCurrent: () => boolean): RequestIdentity {
  if (!record(value) || typeof value.userId !== 'string' || !(value.expectedProfileUpdatedAt === null || typeof value.expectedProfileUpdatedAt === 'string') || !(value.expectedGoal === null || validGoal(value.expectedGoal,value.userId))) fail('invalid_saved_request');
  const result = {userId:value.userId,expectedProfileUpdatedAt:value.expectedProfileUpdatedAt,expectedGoal:value.expectedGoal,isCurrent};
  checkIdentity(result); return result;
}
export function createRequestController<I extends RequestIdentity, P>(options: RequestOptions, build: (input: I, requestId: string) => P, execute: (payload: P, input: I, current: () => boolean) => Promise<GoalRow>, recovery: {operation: GoalJournalOperation; scope?: (input: I) => string; decode: (value: unknown, current: () => boolean) => I}) {
  const token = {};
  let pending: { input: I; payload: P; requestId: string; sent: boolean; definitive: boolean; persistenceAttempted: boolean } | null = null;
  let busy = false, hydratedOwner: string | null = null, foreignPending = false;
  const dataFor = (input: I) => { const {isCurrent: _isCurrent,...data} = input; return data; };
  const release = (owner: string) => { if (leases.get(owner) === token) leases.delete(owner); };
  async function prepare(request: NonNullable<typeof pending>) {
    if (!options.journal) return;
    request.persistenceAttempted = true;
    const existing = await options.journal.load(request.input.userId);
    if (existing) {
      if (existing.requestId !== request.requestId || existing.operation !== recovery.operation || !equalJson(existing.input,dataFor(request.input)) || !equalJson(existing.payload,request.payload)) fail('journal_request_mismatch','STATE');
      if (existing.status !== 'pending') { request.definitive = true; fail('request_resolved_review_current','STATE'); }
    } else {
      await options.journal.prepare({version:1,project: options.journal.project,owner:request.input.userId,requestId:request.requestId,operation:recovery.operation,input:dataFor(request.input),payload:request.payload,status:'pending'});
    }
  }
  async function run(current: () => boolean): Promise<GoalRow> {
    if (busy) fail('request_in_progress', 'BUSY');
    if (!pending) fail('no_pending_request', 'STATE');
    const request = pending;
    if (request.definitive) fail('review_required', 'STATE');
    busy = true;
    try {
      await assertOwner(options.client, request.input.userId, current);
      await prepare(request);
      await assertOwner(options.client, request.input.userId, current);
      request.sent = true;
      const goal = await execute(request.payload, request.input, current);
      await assertOwner(options.client, request.input.userId, current);
      // Durable resolved state precedes cleanup and UI success. If this fails,
      // the original request remains blocked/recoverable, never replaced.
      if (options.journal) {
        await options.journal.resolve(request.input.userId,request.requestId);
        await options.journal.clear(request.input.userId,request.requestId).catch(() => {});
      }
      pending = null; release(request.input.userId);
      emitGoalChanged(request.input.userId);
      return goal;
    } catch (error) {
      const code = record(error) && typeof error.code === 'string' ? error.code : 'NETWORK';
      const uncertain = record(error) && error.uncertain === true;
      const definitive = ['40001', '22023'].includes(code) || (code === '42501' && (!(error instanceof NutritionGoalRequestError) || (!request.sent && !uncertain)));
      if (definitive) {
        request.definitive = true;
        if (options.journal && request.persistenceAttempted && (code === '40001' || code === '22023' || code === '42501')) {
          await options.journal.reject(request.input.userId,request.requestId,code).catch(() => {});
        }
      }
      if (!request.sent && !request.persistenceAttempted) { pending = null; release(request.input.userId); }
      throw error;
    } finally { busy = false; }
  }
  function discard() {
    if (busy || foreignPending || (pending?.sent && !pending.definitive) || (options.journal && pending?.persistenceAttempted)) return false;
    if (pending) release(pending.input.userId);
    pending = null; return true;
  }
  return {
    async recover(owner: string, current: () => boolean): Promise<'empty' | 'pending' | 'review' | 'other_operation'> {
      if (busy) fail('request_in_progress','BUSY');
      if (pending) { if (pending.input.userId !== owner) fail('account_changed','42501'); await assertOwner(options.client,owner,current); return pending.definitive ? 'review' : 'pending'; }
      busy = true; hydratedOwner = null; foreignPending = false;
      try {
        await assertOwner(options.client,owner,current);
        const entry = options.journal ? await options.journal.load(owner) : null;
        await assertOwner(options.client,owner,current);
        if (!entry) { hydratedOwner = owner; return 'empty'; }
        if (entry.status === 'resolved') { await options.journal?.clear(owner,entry.requestId); hydratedOwner = owner; return 'empty'; }
        if (entry.operation !== recovery.operation) { foreignPending = true; hydratedOwner = owner; return 'other_operation'; }
        const input = recovery.decode(entry.input,current);
        if (input.userId !== owner) fail('account_changed','42501');
        const payload = build(input,entry.requestId);
        if (!equalJson(payload,entry.payload)) fail('journal_request_mismatch','STATE');
        if (leases.has(owner) && leases.get(owner) !== token) fail('another_goal_request_pending','BUSY');
        pending = {input,payload,requestId:entry.requestId,sent:true,definitive:entry.status === 'rejected',persistenceAttempted:true};
        leases.set(owner,token); hydratedOwner = owner;
        return pending.definitive ? 'review' : 'pending';
      } finally { busy = false; }
    },
    async save(input: I) {
      if (busy || pending || foreignPending) fail('previous_request_pending', 'BUSY');
      checkIdentity(input);
      if (options.journal && hydratedOwner !== input.userId) fail('goal_recovery_required','STATE');
      if (!input.isCurrent()) fail('request_cancelled', '42501');
      if (leases.has(input.userId)) fail('another_goal_request_pending', 'BUSY');
      const { isCurrent, ...data } = input;
      const snapshot = { ...input, ...copyJson(data), isCurrent };
      const requestId = (options.makeRequestId ?? randomUUID)();
      if (!uuid(requestId)) fail('invalid_request_id');
      const payload = build(snapshot, requestId);
      pending = { input: snapshot, payload, requestId, sent: false, definitive: false, persistenceAttempted:false };
      leases.set(input.userId, token);
      return run(isCurrent);
    },
    retry(isCurrent?: () => boolean) {
      if (!pending) return Promise.reject(new NutritionGoalRequestError('no_pending_request', 'STATE'));
      return run(isCurrent ?? pending.input.isCurrent);
    },
    hasPending: () => pending !== null || foreignPending,
    ownsPending: () => pending !== null,
    pendingScope: () => pending ? (recovery.scope?.(pending.input) ?? recovery.operation) : null,
    pendingData: () => pending ? copyJson(dataFor(pending.input)) : null,
    isBusy: () => busy,
    canRetry: () => pending !== null && !pending.definitive && !busy,
    discard,
    async discardAsync() {
      if (!options.journal) return discard();
      if (busy || foreignPending || !pending || !pending.definitive) return false;
      const request = pending; busy = true;
      try { await options.journal.clear(request.input.userId,request.requestId); pending = null; release(request.input.userId); return true; }
      finally { busy = false; }
    },
  };
}

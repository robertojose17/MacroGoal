import {diagnosticFromAssessment,type AssessedSnapshot,type SchedulerDiagnostic} from './schedulerDiagnostic.ts';
import type {AssessmentInput,DailySchedulerPorts} from './dailyAssessmentScheduler.ts';
/** Internal direct-Postgres candidate. Never accept a client JWT as worker authority. */
import {DAILY_SCHEDULER_RELEASE_STATE,claimDailyAssessment,finishDailyAssessment,reconcileDailyAssessment,scheduleUncertainReassessment,type DailyPlan,type DailyRecord,type ScheduleScope,type UncertainHold} from './dailyAssessmentScheduler.ts';
export const SCHEDULER_STORAGE_RELEASE_STATE=Object.freeze({enabled:false} as const);
export interface SqlTransaction{query<T>(sql:string,values:readonly unknown[]):Promise<T[]>;}
export interface TrustedDatabase{
 // Must BEGIN/COMMIT or ROLLBACK every query on the SAME connection. Never PostgREST.
 transaction<T>(body:(tx:SqlTransaction)=>Promise<T>):Promise<T>;
}
type Stored={record:DailyRecord;hold:UncertainHold|null};
export type VerifiedDiagnostic=SchedulerDiagnostic;
export const STORAGE_SQL=Object.freeze({
 lock:'select pg_advisory_xact_lock(hashtextextended($1::text, 0))',
 read:'select record, hold from tdee_scheduler_private.ledger where owner_id=$1::uuid and context_revision=$2::text for update',
 insert:'insert into tdee_scheduler_private.ledger(owner_id,context_revision,revision,record,hold) values($1::uuid,$2::text,$3::bigint,$4::jsonb,$5::jsonb) on conflict do nothing returning revision',
 update:'update tdee_scheduler_private.ledger set revision=$3::bigint, record=$4::jsonb, hold=$5::jsonb where owner_id=$1::uuid and context_revision=$2::text and revision=$6::bigint returning revision',
 receipt:'insert into tdee_scheduler_private.receipt(owner_id,context_revision,claim_id,daily_key,outcome,observed_at) values($1::uuid,$2::text,$3::uuid,$4::text,$5::text,$6::bigint)',
 readReceipt:'select daily_key, outcome, observed_at from tdee_scheduler_private.receipt where owner_id=$1::uuid and context_revision=$2::text and claim_id=$3::uuid',
});
/** Pure preparation, no storage callback. Evaluator result is trusted internal input,
 * not derived from a timeout, a calendar, a client request, or invented review. */
export function prepareDiagnosticCompletion(record:DailyRecord,hold:UncertainHold|null,claimId:string,now:number,diagnostic:VerifiedDiagnostic){
 if(!diagnostic||!['uncertain','resolved','preserve'].includes(diagnostic.kind))throw Error('verified_diagnostic_required');
 const next=finishDailyAssessment(record,claimId,now,'completed');
 if(!('version' in next))throw Error(next.reason);
 let nextHold:UncertainHold|null=null;
 if(diagnostic.kind==='uncertain'){
  const h=scheduleUncertainReassessment(now,hold);if('kind' in h)throw Error(h.reason);nextHold=h;
 }else if(hold!==null){
  const valid=scheduleUncertainReassessment(now,hold);if('kind' in valid)throw Error(valid.reason);
 }
 if(diagnostic.kind==='preserve')nextHold=hold;
 return {record:next,hold:nextHold};
}
/** Runtime remains immutable OFF, including reads. These operations deliberately do
 * not evaluate recommendations or grant purchase/policy authority. */
export function createTrustedSchedulerStorage(db:TrustedDatabase){
 const gate=()=>{if(!SCHEDULER_STORAGE_RELEASE_STATE.enabled||!DAILY_SCHEDULER_RELEASE_STATE.enabled)throw Error('safety_review_required');};
 async function locked<T>(scope:ScheduleScope,body:(tx:SqlTransaction,row:Stored|null)=>Promise<T>):Promise<T>{
  gate();return db.transaction(async tx=>{
   // Owner-wide lock serializes absent rows too, and competing old/new scopes.
   await tx.query(STORAGE_SQL.lock,[scope.ownerId]);
   const rows=await tx.query<Stored>(STORAGE_SQL.read,[scope.ownerId,scope.contextRevision]);
   if(rows.length>1)throw Error('duplicate_ledger');
   const row=rows[0]??null;
   if(row&&(row.record.ownerId!==scope.ownerId||row.record.contextRevision!==scope.contextRevision||row.record.timezone!==scope.timezone))throw Error('ledger_scope_mismatch');
   return body(tx,row);
  });
 }
 async function persist(tx:SqlTransaction,next:Stored,previous:Stored|null){
  const r=next.record,values:unknown[]=[r.ownerId,r.contextRevision,r.revision,JSON.stringify(r),next.hold===null?null:JSON.stringify(next.hold)];
  if(previous)values.push(previous.record.revision);
  const changed=await tx.query(STORAGE_SQL[previous?'update':'insert'],values);
  if(changed.length!==1)throw Error('claim_conflict');
 }
 return {
  load(scope:ScheduleScope){return locked(scope,async(_tx,row)=>row);},
  claim(plan:DailyPlan,expectedRevision:number,claimId:string){return locked(plan,async(tx,row)=>{
   const r=claimDailyAssessment(plan,row?.record??null,expectedRevision,claimId);
   if(!('version'in r))throw Error(r.reason);
   await persist(tx,{record:r,hold:row?.hold??null},row);return {status:'claimed' as const,claimId};
  });},
  complete(scope:ScheduleScope,claimId:string,now:number,diagnostic:VerifiedDiagnostic){return locked(scope,async(tx,row)=>{
   if(!row)throw Error('missing_claim');
   const next=prepareDiagnosticCompletion(row.record,row.hold,claimId,now,diagnostic);
   await persist(tx,next,row);
   // Receipt and completed state are committed atomically. Lost response is
   // reconciled by reading this receipt; absence never means not_executed.
   await tx.query(STORAGE_SQL.receipt,[scope.ownerId,scope.contextRevision,claimId,row.record.key,'completed',now]);
   return next;
  });},
  uncertain(scope:ScheduleScope,claimId:string,now:number){return locked(scope,async(tx,row)=>{
   if(!row)throw Error('missing_claim');const r=finishDailyAssessment(row.record,claimId,now,'uncertain');
   if(!('version'in r))throw Error(r.reason);await persist(tx,{...row,record:r},row);return r;
  });},
  reconcile(scope:ScheduleScope,claimId:string,now:number){return locked(scope,async(tx,row)=>{
   if(!row||row.record.claimId!==claimId)throw Error('claim_not_current');
   const receipts=await tx.query<{daily_key:string;outcome:'completed'|'not_executed';observed_at:number}>(STORAGE_SQL.readReceipt,[scope.ownerId,scope.contextRevision,claimId]);
   const receipt=receipts[0],observed=Number(receipt?.observed_at);if(receipts.length!==1||receipt.daily_key!==row.record.key||!Number.isSafeInteger(observed)||observed<row.record.claimedAt||observed>253402214400000||!Number.isSafeInteger(now)||observed>now)throw Error('authoritative_reconciliation_required');
   // Re-reading immutable durable evidence now is a fresh check, not TTL extension.
   if(row.record.status==='completed'&&receipt.outcome==='completed')return row.record;
   const r=reconcileDailyAssessment(row.record,{key:receipt.daily_key,claimId,checkedAt:now,outcome:receipt.outcome},now);
   if(!('version'in r))throw Error(r.reason);await persist(tx,{...row,record:r},row);return r;
  });},
 };
}

/** Connects typed actual snapshot output to durable storage and existing scheduler
 * ports. No worker auth/context is synthesized; these are trusted server loaders. */
export function createDurableSchedulerPorts(db:TrustedDatabase,bindings:{
 loadInput():Promise<AssessmentInput>;
 evaluateSnapshot(plan:DailyPlan,claimId:string):Promise<AssessedSnapshot>;
 now():number;newClaimId():string;
}):DailySchedulerPorts{
 const store=createTrustedSchedulerStorage(db);
 const gate=()=>{if(!SCHEDULER_STORAGE_RELEASE_STATE.enabled||!DAILY_SCHEDULER_RELEASE_STATE.enabled)throw Error('safety_review_required');};
 return {
  async loadOwnContext(){gate();const input=await bindings.loadInput();const row=await store.load(input);
   return {input:{...input,hold:row?.hold??null},record:row?.record??null};},
  async claim(plan,expectedRevision){gate();return store.claim(plan,expectedRevision,bindings.newClaimId());},
  async evaluateReadOnly(plan,claimId){gate();const assessment=await bindings.evaluateSnapshot(plan,claimId);return diagnosticFromAssessment(assessment,plan.plannedAt,bindings.now());},
  async complete(plan,claimId,outcome,diagnostic){gate();
   if(outcome==='uncertain'){await store.uncertain(plan,claimId,bindings.now());return;}
   if(!diagnostic)throw Error('verified_diagnostic_required');
   await store.complete(plan,claimId,bindings.now(),diagnostic);
  },
 };
}

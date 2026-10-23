import { withPersistenceDeadline, PERSISTENCE_RPC_LIMIT_MS } from '../bounded-provider-phase.ts';

export type ExecutionMetadata={request_id:string;execution_state:'generating'|'committing'|'completed'|'stopped'|null;execution_deadline_at:string|null;retry_of_request_id:string|null;successor_request_id:string|null;retry_eligible:boolean};
const transactionDenials=new Set(['account_budget_exhausted','global_budget_exhausted','account_paused','paid_operation_invalid','premium_required','permission_required','budget_limit','limit','entitlement_unavailable','unauthorized','not_reserved_premium','execution_admission_paused','invalid_retry_request','retry_not_found','retry_envelope_mismatch','lookup_consent_expired','retry_consent_expired']);
const beforeBeginDenials=new Set(['retry_not_found','retry_envelope_mismatch','invalid_discovery_selection','invalid_public_lookup_selection','discovery_selection_not_found','discovery_context_invalid','lookup_consent_expired','retry_consent_expired','lookup_consent_not_found','lookup_consent_context_invalid','invalid_lookup_context']);
export function admissionDenial(kind:string,evidence:'before_begin'|'transaction_response',confirmed:unknown) {
  const allowed=evidence==='before_begin'?confirmed===true&&beforeBeginDenials.has(kind):confirmed==='not_admitted'&&transactionDenials.has(kind);
  return allowed?{admission_state:'not_admitted' as const}:{};
}
export function executionMetadata(row:any):Partial<ExecutionMetadata> {
  const out:any={};
  for(const key of ['request_id','execution_state','execution_deadline_at','retry_of_request_id','successor_request_id','retry_eligible'])
    if(Object.prototype.hasOwnProperty.call(row??{},key))out[key]=row[key];
  return out; // Never copy token, attempt, plan, or provider audit to a public receipt.
}
export function createCoachExecution(db:any,userId:string,requestId:string,attemptId:string,token:string,persistenceDeadlineAt:number) {
  let commitStarted=false;
  const args={p_user_id:userId,p_request_id:requestId,p_attempt_id:attemptId,p_token:token};
  const rpc=async(name:string,params:any)=>{
    const {data,error}=await withPersistenceDeadline(()=>db.rpc(name,params),persistenceDeadlineAt,0,PERSISTENCE_RPC_LIMIT_MS);
    if(error||!data)throw new Error('execution_persistence_unavailable');
    return data;
  };
  return {
    async authorizePhase(phase:'planner'|'discovery'|'final') {
      const grant=await rpc('coach_authorize_phase_v2',{...args,p_phase:phase});
      const deadline=Date.parse(grant.execution_deadline_at);
      if(grant.allowed!==true||!Number.isFinite(deadline)||deadline<=Date.now())
        throw Object.assign(new Error('execution_fenced'),{knownCost:0,errorCode:'uncertain'});
      return deadline;
    },
    async commit(plan:any) {
      // An unknown claim outcome must be recovered, never stopped/retried as generation.
      commitStarted=true;
      const claimed=await rpc('coach_claim_commit_v2',{...args,p_plan:plan});
      if(claimed.claimed!==true)throw new Error('execution_fenced');
      const result=await rpc('coach_commit_execution_v2',args);
      if(result.execution_state!=='completed'||result.request_id!==requestId)throw new Error('execution_commit_unconfirmed');
      return result;
    },
    async stop(outcome:'uncertain'|'failed_before_stream',audit:any) {
      if(commitStarted)return null;
      return executionMetadata(await rpc('coach_stop_execution_v2',{...args,p_outcome:outcome,p_audit:audit}));
    },
  };
}

export function stoppedCoachResult(metadata:any,language:string,usageStatus='uncertain') {
  if(metadata?.execution_state!=='stopped')throw new Error('execution_stop_unconfirmed');
  return {done:true,...executionMetadata(metadata),usage_status:usageStatus,
    corrected_text:language.startsWith('es')?'La respuesta se detuvo. Puedes consultar su estado y reintentar explícitamente cuando esté permitido.':'The response stopped. Check its status and explicitly retry when allowed.',
    choices:[],discovery_options:[],lookup_options:[],action_proposal:null,suggestions:null};
}

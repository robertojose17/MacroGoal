import {withPersistenceDeadline,PERSISTENCE_RPC_LIMIT_MS} from '../bounded-provider-phase.ts';
export type Access = 'premium' | 'free' | 'unknown';
// Exact IDs already used by usePremium, plus the previously supported legacy ID.
export const coachEntitlementIds = ['Macrogoal Pro', 'macrogoal_pro', 'pro', 'premium', 'Premium'];
export type Subscription = { entitlement_ids?: unknown; status?: unknown; expiration_at?: unknown; purchased_at?: unknown; trial_end?: unknown; billing_issues_detected_at?: unknown; cancel_at_period_end?: unknown };
// Input must come from the server-owned subscription table, never the request/JWT user_metadata.
export function evaluateCoachAccess(rows: Subscription[], now = Date.now()): Access {
  let uncertain = false;
  for (const row of rows) {
    if (!Array.isArray(row.entitlement_ids)) { uncertain = true; continue; }
    if (!row.entitlement_ids.some(id => coachEntitlementIds.includes(String(id)))) continue;
    if (row.status === 'inactive' || row.status === 'expired') continue;
    if (!['active', 'trialing', 'canceled', 'cancelled'].includes(String(row.status))) { uncertain = true; continue; }
    if (row.purchased_at != null && (!Number.isFinite(Date.parse(String(row.purchased_at))) || Date.parse(String(row.purchased_at)) > now)) { uncertain = true; continue; }
    // Existing sync-subscription contract: active + explicit null expiry retains lifetime access.
    if (row.expiration_at === null && row.status === 'active') return 'premium';
    if (row.expiration_at == null) { uncertain = true; continue; }
    const expiration = typeof row.expiration_at === 'string' ? Date.parse(row.expiration_at) : NaN;
    if (!Number.isFinite(expiration)) { uncertain = true; continue; }
    // The projection has no grace end. An apparently active/cancelled expired row
    // requires the authoritative RevenueCat response before spending a free slot.
    if (expiration <= now) { uncertain = true; continue; }
    // Cancellation stops renewal, not access already granted until expiration.
    if (row.status === 'trialing' && row.trial_end != null && (!Number.isFinite(Date.parse(String(row.trial_end))) || Date.parse(String(row.trial_end)) <= now)) { uncertain = true; continue; }
    return 'premium';
  }
  return uncertain ? 'unknown' : 'free';
}
export function coachOpening(language: string, returning: boolean) {
  return language.toLowerCase().startsWith('es')
    ? returning ? 'Podemos retomar tu alimentaciÃ³n de hoy. Dime quÃ© necesitas resolver y usarÃ© los datos disponibles para darte una sugerencia concreta.' : 'Puedo ayudarte a elegir una comida, revisar tus registros o preparar un plan. Dime quÃ© necesitas hoy y empezarÃ© con una sugerencia concreta; cualquier cambio quedarÃ¡ pendiente de tu confirmaciÃ³n.'
    : returning ? "We can pick up with today's food choices. Tell me what you want to solve and I'll use the available data to give you a practical suggestion." : "I can help you choose a meal, review your logs or prepare a plan. Tell me what you need today and I'll start with a practical suggestion; any changes will wait for your confirmation.";
}
export function coachRequest(body: any) {
  if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 30 || body.messages.some((m: any) => !m || !['user','assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 16000)) throw new Error('invalid_request');
  if(Object.prototype.hasOwnProperty.call(body,'meal_source_request_id')&&(typeof body.meal_source_request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.meal_source_request_id)))throw new Error('invalid_meal_source');
  const last = body.messages[body.messages.length - 1];
  if (last.role !== 'user' || !last.content.trim()) throw new Error('invalid_request');
  const language = typeof body.language === 'string' && body.language.toLowerCase().startsWith('es') ? 'es' : 'en';
  if (last.content === '__FIRST_INTERACTION__' || last.content === '__RETURNING_USER_OPEN__') return { kind: 'opening' as const, text: coachOpening(language, last.content === '__RETURNING_USER_OPEN__'), language };
  if (typeof body.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)) throw new Error('request_id_required');
  if(body.retry_of_request_id!==undefined&&(typeof body.retry_of_request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.retry_of_request_id)||body.retry_of_request_id.toLowerCase()===body.request_id.toLowerCase()))throw new Error('invalid_retry_request');
  // Flags do not convert a real user question into a free opening.
  const selection=body.discovery_selection;
  if(selection!==undefined&&(!selection||typeof selection!=='object'||Array.isArray(selection)||Object.keys(selection).some((k:string)=>!['source_request_id','option_id'].includes(k))||typeof selection.source_request_id!=='string'||selection.source_request_id.length>80||typeof selection.option_id!=='string'||selection.option_id.length>80))throw new Error('invalid_discovery_selection');
  const consentSelection=body.public_lookup_selection;
  if(consentSelection!==undefined&&(!consentSelection||typeof consentSelection!=='object'||Array.isArray(consentSelection)||Object.keys(consentSelection).length!==1||Object.keys(consentSelection)[0]!=='source_request_id'||typeof consentSelection.source_request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(consentSelection.source_request_id)))throw new Error('invalid_public_lookup_selection');
  if(consentSelection!==undefined&&selection!==undefined)throw new Error('conflicting_selection');
  if(consentSelection!==undefined&&body.lookup_context!==undefined)throw new Error('caller_lookup_context_not_allowed');
  return { kind: 'message' as const, requestId: body.request_id.toLowerCase(), retryOfRequestId:body.retry_of_request_id?.toLowerCase()??null, language,
    fingerprintInput: JSON.stringify({ ...(body.meal_source_request_id?{meal_source_request_id:body.meal_source_request_id}:{}),messages: body.messages.map((m: any) => ({ role: m.role, content: m.content })), language, weight_unit: body.weight_unit || 'lb', conversation_id: body.conversation_id || null, ...(typeof body.time_zone === 'string' ? {time_zone: body.time_zone} : {}),...(selection?{discovery_selection:selection}:{}),...(consentSelection?{public_lookup_selection:consentSelection}:{}) }) };
}
export async function reserveCoachRequest(db: any, userId: string, requestId: string, fingerprint: string, now = Date.now(),requestPayload:unknown=null,resolveUncertain?: (userId: string, now: number) => Promise<Access|{access:Access;reason?:string}>,execution?:{retryOfRequestId:string|null;reserveWeb:boolean;deadlineAt:number}) {
  let access: Access = 'unknown';
  let diagnosticReason:string|undefined;
  try {
    const {data,error} = await db.from('subscriptions').select('entitlement_ids,status,expiration_at,purchased_at,trial_end,billing_issues_detected_at,cancel_at_period_end').eq('user_id',userId);
    if (!error && Array.isArray(data)) access = evaluateCoachAccess(data, now);
  } catch { /* Fail closed, but allow replay of a previously completed result. */ }
  if (access === 'unknown') diagnosticReason='subscription_projection_uncertain';
  if (access === 'unknown' && resolveUncertain) {
    try { const resolved=await resolveUncertain(userId, now);if(typeof resolved==='string')access=resolved;else{access=resolved.access;diagnosticReason=resolved.reason??diagnosticReason;} }
    catch { access = 'unknown';diagnosticReason='transport_error'; }
  }
  let data:any,error:any;try{const invoke=()=>db.rpc(execution?'coach_begin_execution_v2':'coach_reserve_message_v1',{p_user_id:userId,p_request_id:requestId,p_fingerprint:fingerprint,p_access:access,p_request_payload:requestPayload,...(execution?{p_retry_of_request_id:execution.retryOfRequestId,p_reserve_web:execution.reserveWeb}:{})});({data,error}=await(execution?withPersistenceDeadline(invoke,execution.deadlineAt,0,PERSISTENCE_RPC_LIMIT_MS):invoke()));}catch{return {kind:'unavailable',status:503,reason:'reservation_rpc_error'};}
  if(error) return {kind:'unavailable',status:503,reason:'reservation_rpc_error'};
  if(!data) return {kind:'unavailable',status:503,reason:'reservation_rpc_empty'};
  if(data.kind==='entitlement_unavailable')return {...data,reason:diagnosticReason??'subscription_projection_uncertain'};
  return data;
}
export async function finishCoachRequest(db: any,userId: string,requestId: string,outcome: 'completed'|'failed_before_stream'|'uncertain',result: unknown = null,attemptId: string) {
  const {error} = await db.rpc('coach_finish_message_v1',{p_user_id:userId,p_request_id:requestId,p_outcome:outcome,p_result:result,p_attempt_id:attemptId});
  if(error) throw new Error('usage_persistence_failed');
}


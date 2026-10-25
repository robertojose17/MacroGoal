import {paidEligibility} from './paid-eligibility.ts';
import {confirmedMealDiscoveryPlan,confirmedMealAdmissionPayload} from './confirmed-meal-discovery.ts';
import {mealDiscoveryRetryCheck} from './meal-discovery-retry.ts';
import {classifyStructuredProviderError} from './planner-provider-error.ts';
import {confirmedDiscoveryArgs} from './meal-discovery-consent.ts';
import { buildPrivateNutritionSnapshot, personalizeVerifiedOptions, currentRequestedSourceServings, requestsRemainingMacroFit, trustedMealFacts, guardPersonalizedMealText } from './coach-meal-personalization.ts';
import { readOwnedRestaurantReceipt, ownedRestaurantPool, restaurantSummary, restaurantFollowupAction, nextRestaurantOptions, retainedRestaurantOptions, makeRestaurantPool, publicRestaurantChoices, type RestaurantPool } from './coach-restaurant-followup.ts';
import { isBroadRestaurantRequest } from './coach-restaurant-recovery.ts';
import { fetchBoundedProviderJson, fetchWithAbortSignal, withPersistenceDeadline, WORK_DEADLINE_MS, TOTAL_DEADLINE_MS, PERSISTENCE_RPC_LIMIT_MS, PLANNER_PROVIDER_PHASE_LIMIT_MS, FINAL_PROVIDER_PHASE_LIMIT_MS } from './bounded-provider-phase.ts';
import { plannerMessages, groundedPlannerResponseFormat, resolvePlannerReplyWithDiagnostic, plannerReplyState, type PlannerValidationDiagnostic } from './coach-planner-intent.ts';
import { searchFoodSources, emitPrivateProviderDiagnostic, WEB_SEARCH_APPROVED, WEB_PILOT_LIMITS, WEB_PLANNER_MAX_COST_USD, WEB_DISCOVERY_MAX_COST_USD, WEB_FINAL_MAX_COST_USD, type WebResult } from './coach-web-search.ts';
import { parseVerifiedFoodRequest, findVerifiedFood, verifiedFoodReply } from './coach-verified-food.ts';
import { verifyDiscoveredRecipe, verifyAndProjectDiscoverySelection } from './coach-recipe-discovery.ts';
import { foodEvidenceQuestion, generatedFoodEvidenceQuestion, unverifiedDiscoveryGuidance } from './coach-food-fallback.ts';
import { lookupIntent, lookupQuestion, lookupContext, continueLookup, lookupCancelled } from './coach-lookup-intent.ts';
import { coachDate, coachTimeZone, shiftCoachDate, displayTdeeWeight } from "./_shared/coach-context.ts";
import { coachRequest, reserveCoachRequest } from "./_shared/coach-access.ts";
import { createCoachExecution, executionMetadata, stoppedCoachResult, admissionDenial } from './_shared/coach-execution.ts';
import { fetchRevenueCatAccessDetailed } from "./_shared/coach-revenuecat-access.ts";
import { coachResponseSSEFrame, projectLookupOptions, lookupOptionPortion, validatedSuggestedServings } from "./_shared/coach-recommendation-contract.ts";
import { projectDiscoveryOptions, discoveryRowsFromEvidence, publicDiscoveryQuery, validateDiscoverySelection, resolveDiscoverySelection, validatePublicLookupSelection, validateDiscoverFoodArgs, runModelLedTurn, validateStructuredCoachReply, structuredCoachResponseFormat, type DiscoverFoodArgs, type StructuredCoachReply } from "./coach-model-led-contract.ts";
import { readCoachMemories, revalidateCoachMemories, readMemorySettings, memoryAllowed, groundedMemory, createDirectiveFilter, visibleCoachText, memoryDirectives, MEMORY_CATEGORIES } from "./_shared/coach-memory-policy.ts";
import { normalizeCoachMutation } from "./_shared/coach-action-contract.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "google/gemini-2.5-pro";
const PUBLIC_LOOKUP_CONSENT_TTL_MS=30*60*1000;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function genUUID(): string {
  return crypto.randomUUID();
}

function generateSuggestions(assistantMessage: string): string[] | null {
  const msg = assistantMessage.toLowerCase();

  if (
    msg.includes("tracked macros before") ||
    msg.includes("new to this") ||
    msg.includes("experience") ||
    msg.includes("have you tracked") ||
    msg.includes("familiar with")
  ) {
    return ["Brand new to this", "I've tried before", "Yes, I know my stuff"];
  }

  if (
    msg.includes("biggest challenge") ||
    msg.includes("hardest part") ||
    msg.includes("struggle") ||
    msg.includes("what's stopping") ||
    msg.includes("what stops you")
  ) {
    return ["Cravings", "I don't see results", "I keep falling off", "I don't know what to eat"];
  }

  if (
    msg.includes("meal plan") ||
    msg.includes("do you have a plan") ||
    msg.includes("following a plan") ||
    msg.includes("have a plan")
  ) {
    return ["Yes I have one", "No I don't", "I had one but stopped"];
  }

  if (
    msg.includes("cook at home") ||
    msg.includes("eat out") ||
    msg.includes("restaurant") ||
    msg.includes("takeout") ||
    msg.includes("do you cook")
  ) {
    return ["I cook at home", "I eat out a lot", "Mix of both"];
  }

  if (
    msg.includes("hungry") ||
    msg.includes("what can you eat") ||
    msg.includes("calories left") ||
    msg.includes("what to eat") ||
    msg.includes("something to eat")
  ) {
    return ["Log what I ate", "Give me options", "I already ate"];
  }

  if (
    msg.includes("cheated") ||
    msg.includes("messed up") ||
    msg.includes("went over") ||
    msg.includes("off track") ||
    msg.includes("bad day")
  ) {
    return ["It was just one meal", "I went way over", "I want to start fresh tomorrow"];
  }

  if (
    msg.includes("results") ||
    msg.includes("working") ||
    msg.includes("progress") ||
    msg.includes("is it working") ||
    msg.includes("seeing changes")
  ) {
    return ["Show me my progress", "I feel stuck", "What am I doing wrong?"];
  }

  if (
    msg.includes("quit") ||
    msg.includes("give up") ||
    msg.includes("not worth") ||
    msg.includes("want to stop") ||
    msg.includes("frustrated")
  ) {
    return ["I'm just frustrated", "I haven't seen any change", "Help me stay motivated"];
  }

  return null;
}


// Count only explicit meal counts in the latest user request, never model claims.
function requestedMealCount(message: string): number | 'ambiguous' | null {
  const words: Record<string,number> = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10};
  const matches=[...message.toLowerCase().matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:meals?|comidas?)\b/g)];
  if(!matches.length)return null;
  if(/\b(per day|each day|a day|por d[iÃ­]a|cada d[iÃ­]a|between|entre)\b/i.test(message)||/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(?:or|o|-)\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/i.test(message))return 'ambiguous';
  const counts=matches.map(m=>words[m[1]]??Number(m[1]));
  return counts.some(n=>!Number.isInteger(n)||n<1||n>100)||new Set(counts).size!==1?'ambiguous':counts[0];
}
function mealPlanReviewText(payload: any, language: string): string {
  const items=payload.proposal.items;
  const heading=language==='es'?'Revisa este plan de comidas:':'Review this meal plan:';
  const rows=items.map((i:any)=>`- ${i.date} / ${i.meal_type}: ${i.food_name} (${i.calories} kcal)`).join('\n');
  return heading+'\n'+rows+'\n\n'+(language==='es'?'Confirmar guardarÃ¡ este plan de comidas. No aÃ±adirÃ¡ alimentos al diario. TodavÃ­a no se ha guardado.':'Confirming will save this meal plan. It will not add food to your diary. It has not been saved yet.');
}

function goalProposalReviewText(mutation:ReturnType<typeof normalizeCoachMutation>,language:string):string {
  const value=mutation.action_type==='update_goal'?mutation.proposal.proposed_value:mutation.proposal.proposed_calories;
  if(mutation.action_type==='update_goal')return language.startsWith('es')
    ? `Valor de meta propuesto: ${value}. Revisa y confirma para guardarlo; todavía no se aplicó ningún cambio.`
    : `Proposed goal value: ${value}. Review and confirm to save it; no change has been applied.`;
  return language.startsWith('es')
    ? `Objetivo de calorías propuesto: ${value} kcal. Revisa y confirma para guardarlo; todavía no se aplicó ningún cambio.`
    : `Proposed calorie target: ${value} kcal. Review and confirm to save it; no change has been applied.`;
}

// OpenRouter structured phase adapter. Cost is deliberately nullable: callers
// must keep the request reservation open when the provider omits usage.cost.
async function callStructuredPhase(messages:{role:string;content:string}[],maxTokens:number,onReceipt:((cost:number|null,generationId:string|null)=>void)|undefined,allowToolRequest:boolean,phaseLimitMs:number,deadlineAt:number,parentSignal?:AbortSignal,responseFormat:unknown=structuredCoachResponseFormat(allowToolRequest),diagnosticRequestId?:string) {
  let observedStatus:number|undefined;
  let providerDiagnostic:ReturnType<typeof classifyStructuredProviderError>|undefined;
  const logFailure=(errorCode:'http_error'|'aborted'|'timeout'|'input_budget'|'truncated'|'invalid_response'|'provider_error'|'transport_error'|'cost_unavailable',knownCost:unknown)=>console.warn('[AICoach] Structured provider phase failed',{
    ...providerDiagnostic,
    phase:allowToolRequest?'planner':'final',error_code:errorCode,cost_status:typeof knownCost==='number'&&Number.isFinite(knownCost)&&knownCost>=0?'known':'unknown',
    ...(observedStatus!==undefined&&observedStatus>=100&&observedStatus<=599?{http_status:observedStatus}:{}),
    ...(typeof diagnosticRequestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(diagnosticRequestId)?{request_id:diagnosticRequestId}:{})
  });
  try {
  // Count the exact serialized input, including schema and envelope, before dispatch.
  const providerBody=JSON.stringify({model:DEFAULT_MODEL,messages,temperature:0.3,max_tokens:maxTokens,reasoning:{max_tokens:512},stream:false,response_format:responseFormat,provider:{allow_fallbacks:false,require_parameters:true,max_price:{prompt:2.5,completion:15}}});
  const inputBytes=new TextEncoder().encode(providerBody).byteLength;
  const inputCostCeiling=inputBytes*2.5/1_000_000+maxTokens*15/1_000_000;
  if(inputBytes>30_000||maxTokens>2048||inputCostCeiling>0.10572)throw Object.assign(new Error('phase_input_budget_exceeded'),{knownCost:0,errorCode:'invalid_response'});
  const observedFetch:typeof fetch=async(input,init)=>{const response=await fetch(input,init);observedStatus=response.status;return response;};
  const {response,data}=await fetchBoundedProviderJson(observedFetch,`${OPENROUTER_BASE_URL}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${OPENROUTER_API_KEY}`,'Content-Type':'application/json','HTTP-Referer':SUPABASE_URL,'X-Title':'Macro Goal AI Coach'},body:providerBody},deadlineAt,undefined,parentSignal,phaseLimitMs);
  const cost=typeof data?.usage?.cost==='number'&&Number.isFinite(data.usage.cost)&&data.usage.cost>=0?data.usage.cost:null;
  const generationId=typeof data?.id==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(data.id)?data.id:null;
  onReceipt?.(cost,generationId);
  if(!response.ok)providerDiagnostic=classifyStructuredProviderError(data);
  if(!response.ok)throw Object.assign(new Error(`provider_http_${response.status}`),{knownCost:cost,generationId,errorCode:'provider_error'});
  const raw=data?.choices?.[0]?.message?.content;
  if(data?.choices?.[0]?.finish_reason!=='stop'){
    const finishReason=data?.choices?.[0]?.finish_reason;
    const error=Object.assign(new Error('provider_incomplete_phase'),{knownCost:cost,generationId,errorCode:finishReason==='length'?'truncated':'provider_error'});
    throw error;
  }
  let output:unknown;try{output=typeof raw==='string'?JSON.parse(raw):raw;}catch{throw Object.assign(new Error('provider_invalid_json'),{knownCost:cost,generationId,errorCode:'invalid_response'});}
  if(cost===null)logFailure('cost_unavailable',null);
  return {output,cost,generationId};
  } catch(error) {
    // Keep failure classification independent of billing uncertainty. Never log provider text.
    const e=error&&typeof error==='object'?error as {knownCost?:unknown;errorCode?:unknown;name?:unknown;message?:unknown}:{};
    const errorCode=observedStatus!==undefined&&(observedStatus<200||observedStatus>=300)?'http_error':
      parentSignal?.aborted||e.name==='AbortError'||e.message==='provider_phase_aborted'?'aborted':
      e.name==='TimeoutError'||e.message==='provider_phase_timeout'||e.message==='provider_phase_deadline_exceeded'?'timeout':
      e.message==='phase_input_budget_exceeded'?'input_budget':e.errorCode==='truncated'?'truncated':
      e.errorCode==='invalid_response'||e instanceof SyntaxError||e.message==='provider_response_too_large'||e.message==='provider_response_missing_body'?'invalid_response':
      e.errorCode==='provider_error'?'provider_error':'transport_error';
    logFailure(errorCode,e.knownCost);
    throw error; // Preserve knownCost/null and the runner's existing hold/settlement semantics.
  }
}



const handler = (async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestStartedAt=Date.now();
  let providerWorkDeadlineAt=requestStartedAt+WORK_DEADLINE_MS;
  const persistenceDeadlineAt=requestStartedAt+TOTAL_DEADLINE_MS;
  let requestId = '';
  let webLookupAttempted = false;
  let providerAuditOuter:Array<{phase:string;cost:number|null;generation_id:string|null}>=[];
  let privateProviderDiagnostic:unknown=null;
  let privatePlannerValidationDiagnostic:PlannerValidationDiagnostic|undefined;
  let webBudgetReserved = false;
  let usageUserId = '', usagePending = false, usageAttemptId = '';
  let usageFinalizeAttempted=false;
  let execution:ReturnType<typeof createCoachExecution>|undefined;
  const finalizeUsage = async (outcome: 'completed'|'failed_before_stream'|'uncertain', result: unknown = null) => {
    if (!usagePending||usageFinalizeAttempted) throw new Error('execution_not_pending');
    usageFinalizeAttempted=true;
    const auditOnly={provider_phase_ledger:providerAuditOuter.slice(0,3),...(privateProviderDiagnostic?{private_provider_diagnostic:privateProviderDiagnostic}:{}),...(privatePlannerValidationDiagnostic?{private_planner_validation_diagnostic:privatePlannerValidationDiagnostic}:{})};
    if(!execution)throw new Error('execution_unavailable');
    const committed=outcome==='completed'
      ? await execution.commit({result,memories:[],action_payload:null,mark_insights:false})
      : await execution.stop(outcome,auditOnly);
    usagePending = false;
    return committed;
  };
  console.log("[AICoach] New request:", requestId);

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = req.headers.get("Authorization") || "";
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = auth.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUser = userData.user;
    console.log("[AICoach] User authenticated:", authUser.id);

    let body: {
      request_id?: string;
      retry_of_request_id?: string;
      retry_consent?: boolean;
      meal_source_request_id?: string;
      messages?: { role: string; content: string; timestamp?: number }[];
      user_id?: string;
      weight_unit?: string;
      time_zone?: string;
      conversation_id?: string;
      is_first_message?: boolean;
      is_returning_user_open?: boolean;
      language?: string;
      lookup_context?: unknown;
      discovery_selection?: unknown;
      public_lookup_selection?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Identity is always computed from the original immutable request, not a reconstructed lookup.
    let parsedRequest: ReturnType<typeof coachRequest>;
    try { parsedRequest = coachRequest(body); }
    catch(error) { return new Response(JSON.stringify({ error: error instanceof Error&&error.message==='invalid_retry_request'?'invalid_retry_request':'invalid_request_or_missing_request_id' }), { status: 400, headers: corsHeaders }); }
    const replay = (result: unknown) => {const visible=result&&typeof result==='object'&&!Array.isArray(result)?Object.fromEntries(Object.entries(result as Record<string,unknown>).filter(([key])=>key!=='discovery_option_bindings'&&key!=='private_source_read_diagnostics')):result;return new Response(coachResponseSSEFrame(visible), { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });};
    let candidateKnownAbsent=false;
    const reject = (error: string, status: number) => new Response(JSON.stringify({error,...(candidateKnownAbsent&&parsedRequest.kind==='message'?{request_id:parsedRequest.requestId}:{}),...admissionDenial(error,'before_begin',candidateKnownAbsent)}), {status,headers:{...corsHeaders,'Content-Type':'application/json'}});
    if (parsedRequest.kind === 'opening') return replay({ done: true, corrected_text: parsedRequest.text, action_proposal: null, suggestions: null });
    // Owned recovery may revoke an expired generating token or resume a durable commit; never generates.
    const {data: receipts,error: receiptError} = await supabase.rpc('coach_recover_requests_v1',{p_user_id:authUser.id,p_request_id:parsedRequest.requestId,p_offset:0});
    if (receiptError || !Array.isArray(receipts)) return reject('receipt_unavailable',503);
    const prior = receipts.find((r:any)=>r.request_id===parsedRequest.requestId);
    if (prior) {
      if(prior.user_id!==undefined&&prior.user_id!==authUser.id)return reject('receipt_unavailable',503);
      let priorRequest: ReturnType<typeof coachRequest>;
      try { const {lookup_context:_serverDerivedContext,...originalRequestFields}=prior.request_payload??{};priorRequest=coachRequest({...originalRequestFields,request_id:parsedRequest.requestId}); }
      catch { return reject('receipt_identity_unavailable',503); }
      if (priorRequest.kind!=='message' || priorRequest.fingerprintInput!==parsedRequest.fingerprintInput) return reject('conflict',409);
      if((prior.retry_of_request_id??null)!==parsedRequest.retryOfRequestId)return reject('conflict',409);
      if (prior.state==='completed') return replay({...prior.result,...executionMetadata(prior)});
      return new Response(JSON.stringify({error:prior.execution_state==='committing'?'execution_committing':prior.execution_state==='stopped'?'execution_stopped':'execution_active',...executionMetadata(prior)}),{status:409,headers:{...corsHeaders,'Content-Type':'application/json'}});

    }
    candidateKnownAbsent=true;
    if(parsedRequest.retryOfRequestId){
      const {data:parents,error:parentError}=await supabase.rpc('coach_recover_requests_v1',{p_user_id:authUser.id,p_request_id:parsedRequest.retryOfRequestId,p_offset:0});
      if(parentError||!Array.isArray(parents))return reject('receipt_unavailable',503);
      const parent=parents.find((r:any)=>r.request_id===parsedRequest.retryOfRequestId);
      if(body.meal_source_request_id){
        const denial=mealDiscoveryRetryCheck(parent,{owner:authUser.id,parentId:parsedRequest.retryOfRequestId,requestId:parsedRequest.requestId,fingerprint:parsedRequest.fingerprintInput,confirmed:body.retry_consent===true});
        if(denial)return new Response(JSON.stringify({error:denial.error,...(denial.error==='retry_not_found'?{}:executionMetadata(parent))}),{status:denial.status,headers:{...corsHeaders,'Content-Type':'application/json'}});
      }
      if(!parent||parent.request_payload?.conversation_id!==(body.conversation_id||null))return reject('retry_not_found',404);
      let original:ReturnType<typeof coachRequest>;
      try{const {lookup_context:_context,...fields}=parent.request_payload??{};original=coachRequest({...fields,request_id:parent.request_id});}catch{return reject('receipt_identity_unavailable',503);}
      if(original.kind!=='message'||original.fingerprintInput!==parsedRequest.fingerprintInput)return reject('retry_envelope_mismatch',409);
      if(parent.state==='completed')return replay({...parent.result,...executionMetadata(parent)});
      if(parent.execution_state!=='stopped'||parent.successor_request_id)return new Response(JSON.stringify({error:parent.successor_request_id?'retry_exists':parent.execution_state==='committing'?'execution_committing':'execution_active',...executionMetadata(parent)}),{status:409,headers:{...corsHeaders,'Content-Type':'application/json'}});
      body.lookup_context=parent.request_payload.lookup_context;
      body.is_returning_user_open=false;body.is_first_message=false;
    }
    // A discovery tap is only a request to verify the server-stored candidate.
    // Resolve it against a completed receipt owned by this authenticated user and
    // conversation; never accept client supplied candidate details as evidence.
    let selectedDiscovery:any=null;
    if(body.discovery_selection!==undefined){
      const selection=validateDiscoverySelection(body.discovery_selection);
      if(!selection)return reject('invalid_discovery_selection',400);
      const {data:sourceReceipts,error:sourceError}=await supabase.rpc('coach_recover_requests_v1',{p_user_id:authUser.id,p_request_id:selection.source_request_id,p_offset:0});
      if(sourceError||!Array.isArray(sourceReceipts))return reject('discovery_receipt_unavailable',503);
      const source=sourceReceipts.find((r:any)=>r.request_id===selection.source_request_id&&r.state==='completed');
      const resolved=resolveDiscoverySelection({source,sourceRequestId:selection.source_request_id,optionId:selection.option_id,conversationId:body.conversation_id||null,typedText:String(body.messages!.at(-1)!.content)});
      if(!resolved)return reject('discovery_selection_not_found',409);
      selectedDiscovery={...resolved,privateBindings:source.result?.discovery_option_bindings??{}};
    }
    let selectedConsentProposal:{context:NonNullable<ReturnType<typeof lookupContext>>;args:DiscoverFoodArgs;source_request_id:string;created_at:string;sourceServings?:number}|null=null;
    if(body.public_lookup_selection!==undefined){
      const selection=validatePublicLookupSelection(body.public_lookup_selection);
      if(!selection)return reject('invalid_public_lookup_selection',400);
      const {data:sourceReceipts,error:sourceError}=await supabase.rpc('coach_recover_requests_v1',{p_user_id:authUser.id,p_request_id:selection.source_request_id,p_offset:0});
      if(sourceError||!Array.isArray(sourceReceipts))return reject('lookup_consent_receipt_unavailable',503);
      const source=sourceReceipts.find((r:any)=>r.request_id===selection.source_request_id&&r.state==='completed');
      const sameConversation=source?.request_payload?.conversation_id===(body.conversation_id||null);
      const createdAt=typeof source?.created_at==='string'?Date.parse(source.created_at):NaN;
      if(!Number.isFinite(createdAt)||createdAt>Date.now()||Date.now()-createdAt>PUBLIC_LOOKUP_CONSENT_TTL_MS)return reject(parsedRequest.retryOfRequestId?'retry_consent_expired':'lookup_consent_expired',409);
      const context=source?.result?.lookup_status==='needs_consent'?lookupContext(source.result.lookup_context):null;
      if(!source||!sameConversation||!context||context.mode==='unknown'||context.recipeSelection)return reject('lookup_consent_not_found',409);
      if(context.preference==='healthy')return reject('lookup_consent_context_invalid',409);
      const [city,region]=context.area?.split(',').map((x:string)=>x.trim())??[];
      const args=validateDiscoverFoodArgs({food:context.food,mode:context.mode,...(city?{city}:{}),...(region?{region}:{}),...(context.country?{country:context.country}:{}),...(context.preference?{preference:context.preference}:{})});
      if(!args)return reject('lookup_consent_context_invalid',409);
      selectedConsentProposal={context,args,source_request_id:selection.source_request_id,created_at:source.created_at,...(typeof source.result?.private_source_servings==='number'&&validatedSuggestedServings(source.result.private_source_servings)!==null?{sourceServings:source.result.private_source_servings}:{})};
    }
    const eligibility=await paidEligibility(supabase,authUser.id);
    const webEnabled=WEB_SEARCH_APPROVED&&eligibility.enabled;
    if(!webEnabled)return reject(eligibility.reason??'paid_access_unavailable',403);
    const modelLed=webEnabled;
    const lookupText=body.messages!.at(-1)!.content;
    let storedLookupContext: ReturnType<typeof lookupContext> = null;
    if(body.lookup_context!==undefined){storedLookupContext=lookupContext(body.lookup_context);if(!storedLookupContext)return reject('invalid_lookup_context',400);}
    if(selectedConsentProposal)storedLookupContext=selectedConsentProposal.context;
    if((lookupCancelled(lookupText)||restaurantFollowupAction(lookupText)==='cancel')&&storedLookupContext&&!modelLed)return replay({done:true,usage_status:'completed',corrected_text:parsedRequest.language.startsWith('es')?'Búsqueda cancelada.':'Search cancelled.',lookup_context:null,lookup_proposal:null,lookup_status:'cancelled',action_proposal:null,suggestions:null,choices:[],discovery_options:[],lookup_options:[]});
    if(selectedDiscovery){storedLookupContext=lookupContext(selectedDiscovery.lookup_context);if(!storedLookupContext)return reject('discovery_context_invalid',409);}    requestId = parsedRequest.requestId;
    const followupAction=restaurantFollowupAction(lookupText);
    const activeReceipt=modelLed&&restaurantFollowupAction(lookupText)!=='cancel'&&body.conversation_id&&!selectedConsentProposal&&!selectedDiscovery?await readOwnedRestaurantReceipt(supabase,authUser.id,body.conversation_id):null;
    const retainedPool=ownedRestaurantPool(activeReceipt,authUser.id,body.conversation_id||'');
    const publicRestaurantSummary=restaurantSummary(activeReceipt,authUser.id,body.conversation_id||'');
    const localRestaurantTurn=modelLed&&(followupAction==='another'||followupAction==='protein'||followupAction==='cancel');
    const messages = body.messages || [];
    const weightUnit = body.weight_unit || "lb";
    const timeZone = coachTimeZone(body.time_zone);
    const conversationId = body.conversation_id || null;
    const language = parsedRequest.language;
    const isReturningUserOpen = body.is_returning_user_open === true;
    console.log("[AICoach] language:", language, "returning_user_open:", isReturningUserOpen);

    if (!messages.length) {
      return new Response(JSON.stringify({ error: "No messages provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sentinel detection
    const lastMessageContent = messages[messages.length - 1]?.content;
    const isFirstInteraction = body.is_first_message === true || lastMessageContent === "__FIRST_INTERACTION__";
    const isReturningOpen = isReturningUserOpen || lastMessageContent === "__RETURNING_USER_OPEN__";

    // Authenticated server-owned usage reservation, before any model call or stream.

    const userId = authUser.id;
    usageUserId = userId;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parsedRequest.fingerprintInput));
    const fingerprint = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    candidateKnownAbsent=false; // From here an unknown begin outcome must stay in recovery, never be attested absent.
    const reservation = await reserveCoachRequest(supabase, userId, requestId, fingerprint,Date.now(),confirmedMealAdmissionPayload(req,authUser.id,body,{...JSON.parse(parsedRequest.fingerprintInput),...(storedLookupContext?{lookup_context:storedLookupContext}:{})}),
      (authenticatedUserId, now) => fetchRevenueCatAccessDetailed(authenticatedUserId, Deno.env.get('REVENUECAT_API_KEY'), now),{retryOfRequestId:parsedRequest.retryOfRequestId,reserveWeb:webEnabled&&!selectedDiscovery&&!localRestaurantTurn,deadlineAt:persistenceDeadlineAt});
    if (reservation.kind === 'replay') return replay(reservation.result);
    if (reservation.kind !== 'reserved') {
      const error=reservation.kind==='limit'?'Subscription Required':reservation.kind;
      const reason=['missing_key','http_status','timeout','invalid_entitlement','transport_error','subscription_projection_uncertain','reservation_rpc_error','reservation_rpc_empty'].includes(reservation.reason)?reservation.reason:undefined;
      const request_id=requestId;
      if(reservation.kind==='entitlement_unavailable'||reservation.kind==='unavailable')console.warn('[AICoach] Access reservation unavailable',JSON.stringify({request_id,reason:reason??'subscription_projection_uncertain'}));
      return new Response(JSON.stringify({error,...(reason?{reason}:{}),request_id,...executionMetadata(reservation),...admissionDenial(reservation.kind,'transaction_response',reservation.admission_state)}), { status: reservation.status || 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    usagePending = true;
    usageAttemptId = reservation.attempt_id;
    if(typeof reservation.execution_token!=='string')throw new Error('execution_token_missing');
    execution=createCoachExecution(supabase,userId,requestId,usageAttemptId,reservation.execution_token,persistenceDeadlineAt);
    webBudgetReserved=reservation.web_reserved===true;
    const serverDeadline=Date.parse(reservation.execution_deadline_at);
    if(!Number.isFinite(serverDeadline))throw new Error('execution_deadline_missing');
    providerWorkDeadlineAt=Math.min(providerWorkDeadlineAt,serverDeadline);
    const authorizePhase=async(phase:'planner'|'discovery'|'final')=>{
      if(phase==='discovery'&&selectedConsentProposal){
        // The planner may have consumed most of the TTL. Revalidate the owned card before dispatch.
        const {data:rows,error}=await supabase.rpc('coach_recover_requests_v1',{p_user_id:userId,p_request_id:selectedConsentProposal.source_request_id,p_offset:0});
        const source=Array.isArray(rows)?rows.find((r:any)=>r.request_id===selectedConsentProposal!.source_request_id):null;
        const created=Date.parse(source?.created_at);
        if(error||source?.state!=='completed'||source.request_payload?.conversation_id!==conversationId||!Number.isFinite(created)||created>Date.now()||Date.now()-created>PUBLIC_LOOKUP_CONSENT_TTL_MS||JSON.stringify(lookupContext(source.result?.lookup_context))!==JSON.stringify(selectedConsentProposal.context))
          throw Object.assign(new Error('retry_consent_expired'),{knownCost:0,errorCode:'uncertain'});
      }
      const deadline=await execution!.authorizePhase(phase);
      providerWorkDeadlineAt=Math.min(providerWorkDeadlineAt,deadline);
    };
    if(selectedDiscovery){
      const result=await verifyAndProjectDiscoverySelection(selectedDiscovery,{fetch,retrievedAt:new Date().toISOString(),requestId,language});
      return replay(await finalizeUsage('completed',result));
    }
    if(localRestaurantTurn&&followupAction==='cancel')return replay(await finalizeUsage('completed',{done:true,request_id:requestId,usage_status:'completed',corrected_text:language.startsWith('es')?'Búsqueda cancelada.':'Search cancelled.',lookup_context:null,lookup_status:'cancelled',choices:[],discovery_options:[],lookup_options:[],sources:[],action_proposal:null,suggestions:null}));
    if (!OPENROUTER_API_KEY&&!localRestaurantTurn) throw new Error('configuration_error');
    let verifiedFood:any=null;
    let webEvidence:WebResult={sources:[],context:''};
    let providerPhaseLedger:Array<{phase:string;cost:number|null;generation_id:string|null}>=[];    const today = coachDate(Date.now(), timeZone);
    const fourteenDaysAgo = shiftCoachDate(today, -13);
    const thirtyDaysAgo = shiftCoachDate(today, -29);
    const sevenDaysAgo = shiftCoachDate(today, -6);

    const [
      profileResult,
      goalsResult,
      mealsResult,
      checkInsResult,
      memoryResult,
      tdeeResult,
      trackerEntriesResult,
      coachActionsResult,
      lastInsightResult,
    ] = await Promise.all([
      supabase.from("users").select("name, username, sex, date_of_birth, height, current_weight, goal_weight, activity_level, weight_unit").eq("id", userId).maybeSingle(),
      supabase.from("goals").select("daily_calories, protein_g, carbs_g, fats_g, fiber_g, goal_type, macro_preset").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: false }).limit(1),
      supabase.from("meals").select("date, meal_items(calories, protein, carbs, fats, fiber)").eq("user_id", userId).gte("date", fourteenDaysAgo).lte("date", today).order("date", { ascending: false }),
      supabase.from("check_ins").select("date, weight").eq("user_id", userId).gte("date", thirtyDaysAgo).order("date", { ascending: false }).limit(30),
      readCoachMemories(supabase, userId),
      supabase.from("tdee_estimates").select("week_start, estimated_tdee, prescribed_calories, adjustment_amount, avg_calories_eaten, avg_weight_lbs, prev_avg_weight_lbs, data_days_count, adjustment_applied").eq("user_id", userId).order("week_start", { ascending: false }).limit(4),
      supabase.from("tracker_entries").select("date, value, tracker_id, trackers(name, emoji, unit, goal_value)").eq("user_id", userId).gte("date", sevenDaysAgo).lte("date", today).order("date", { ascending: false }),
      supabase.from("coach_actions").select("action_type, new_value, created_at, status").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
      // Fetch latest unread insight for returning user open
      supabase.from("coach_daily_insights").select("insight_text, condition_type, created_at").eq("user_id", userId).eq("is_read", false).order("created_at", { ascending: false }).limit(1),
    ]);

    const profile = profileResult.data;
    const goals = goalsResult.error?null:Array.isArray(goalsResult.data) ? goalsResult.data[0] ?? null : goalsResult.data;
    const privateNutritionSnapshot=buildPrivateNutritionSnapshot({localDate:today,timeZone,goalsResult,mealsResult});
    let requestedMealServings:number|undefined;
    let retainedVerifiedOptions:ReturnType<typeof projectLookupOptions>|null=null;
    let carriedRestaurantPool:RestaurantPool|null=null;
    const macroFitRequested=requestsRemainingMacroFit(messages);
    const allPersonalizedOptions=(evidence:any,food:any)=>personalizeVerifiedOptions(retainedVerifiedOptions??projectLookupOptions(evidence,food,evidence?.requestedKind==='menu'?12:3),privateNutritionSnapshot,requestedMealServings,lookupContext(modelLedLookupContext)?.preference??storedLookupContext?.preference,macroFitRequested);
    const personalizedOptions=(evidence:any,food:any)=>{const ranked=allPersonalizedOptions(evidence,food);return ranked.every(o=>o.kind==='restaurant')?publicRestaurantChoices(ranked):ranked.slice(0,3);};
    if(localRestaurantTurn){
      const claimed=publicRestaurantSummary?.request??null,pool=retainedPool;
      const ranked=pool?personalizeVerifiedOptions(pool.options,privateNutritionSnapshot,undefined,followupAction==='protein'?'high_protein':pool.context.preference):[];
      const next=pool?nextRestaurantOptions(pool,ranked,followupAction as 'another'|'protein'):null;
      const context=next?.pool.context??claimed,options=next?.options??[];
      const es=language.startsWith('es'),exhausted=!next||next.exhausted;
      const lead=exhausted?(!next?(es?'No tengo opciones verificadas vigentes en esta conversación.':'I have no current verified options in this conversation.'):(es?'No quedan otras opciones verificadas en esta consulta.':'There are no other verified options left in this lookup.')):(es?`${followupAction==='protein'?'Opciones verificadas reordenadas priorizando densidad de proteína':'Otra opción de las fuentes verificadas'}: ${options[0].restaurant_name}, ${[options[0].item_name,options[0].variant].filter(Boolean).join(', ')}, ${options[0].location!.address}.`:`${followupAction==='protein'?'Verified options reordered to prioritize protein density':'Another option from the verified sources'}: ${options[0].restaurant_name}, ${[options[0].item_name,options[0].variant].filter(Boolean).join(', ')}, ${options[0].location!.address}.`);
      const preservedServings=pool?.options[0]?.suggested_servings;
      const result={done:true,request_id:requestId,usage_status:'completed',...(preservedServings!==undefined&&pool!.options.every(o=>o.suggested_servings===preservedServings)?{private_source_servings:preservedServings}:{}),corrected_text:[lead,...trustedMealFacts(options,privateNutritionSnapshot,language)].join(' '),choices:exhausted&&context?[{id:'search_options',label:es?'Buscar más opciones':'Search more options',value:'yes, search public options'}]:[],discovery_options:[],lookup_options:options,sources:pool?.sources??[],lookup_context:context??null,action_proposal:null,suggestions:null,...(exhausted&&context?{lookup_status:'needs_consent',public_lookup_proposal:{request_id:requestId,context}}:{}),...(next?{private_restaurant_pool:next.pool}:{}),private_nutrition_snapshot:privateNutritionSnapshot};
      return replay(await finalizeUsage('completed',result));
    }
    const mealsRaw = mealsResult.error?[]:mealsResult.data || [];
    const checkIns = checkInsResult.data || [];
    const memoryItems = await revalidateCoachMemories(supabase, userId, memoryResult.data || []);
    const tdeeRows = tdeeResult.data || [];
    const trackerEntries = trackerEntriesResult.data || [];
    const coachActions = coachActionsResult.data || [];
    const latestInsight = lastInsightResult.data?.[0] || null;

    // Aggregate nutrition by date
    const nutritionByDate: Record<string, { calories: number; protein: number; carbs: number; fats: number; fiber: number }> = {};
    for (const meal of mealsRaw) {
      const date = meal.date as string;
      if (!nutritionByDate[date]) nutritionByDate[date] = { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
      const items = (meal.meal_items as any[]) || [];
      for (const item of items) {
        nutritionByDate[date].calories += Number(item.calories) || 0;
        nutritionByDate[date].protein += Number(item.protein) || 0;
        nutritionByDate[date].carbs += Number(item.carbs) || 0;
        nutritionByDate[date].fats += Number(item.fats) || 0;
        nutritionByDate[date].fiber += Number(item.fiber) || 0;
      }
    }
    const nutritionLogs = Object.entries(nutritionByDate)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14)
      .map(([date, n]) => ({ date, ...n }));

    // Today's nutrition
    const todayNutrition = nutritionByDate[today] || null;

    // Food patterns: last 7 days avg
    const last7Days = nutritionLogs.filter((l) => l.date >= sevenDaysAgo);
    const foodPatternBlock = last7Days.length > 0
      ? (() => {
          const avg = last7Days.reduce((acc, l) => {
            acc.calories += l.calories;
            acc.protein += l.protein;
            acc.carbs += l.carbs;
            acc.fats += l.fats;
            return acc;
          }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
          const n = last7Days.length;
          return `FOOD PATTERNS (last 7 days avg, ${n} days logged):\n- Avg calories: ${Math.round(avg.calories / n)} kcal\n- Avg protein: ${Math.round(avg.protein / n)}g\n- Avg carbs: ${Math.round(avg.carbs / n)}g\n- Avg fats: ${Math.round(avg.fats / n)}g`;
        })()
      : "FOOD PATTERNS (last 7 days): No data logged";

    // Streak / consistency
    const loggedDates = new Set(nutritionLogs.map((l) => l.date));
    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const d = shiftCoachDate(today, -i);
      if (loggedDates.has(d)) streak++;
      else break;
    }
    const consistencyDays = loggedDates.size;
    const streakBlock = `STREAK & CONSISTENCY:\n- Current logging streak: ${streak} day${streak !== 1 ? "s" : ""}\n- Total days logged (last 14): ${consistencyDays}`;

    console.log("[AICoach] Context â€” profile:", !!profile, "goals:", !!goals, "nutrition days:", nutritionLogs.length, "weight:", checkIns.length, "tdee rows:", tdeeRows.length, "tracker entries:", trackerEntries.length, "coach actions:", coachActions.length);

    const dbWeightUnit = (profile as any)?.weight_unit || weightUnit || "lb";
    const wUnit = dbWeightUnit === "kg" ? "kg" : "lb";
    const toDisplayWeight = (kg: number): number =>
      wUnit === "lb" ? Math.round(kg * 2.20462 * 100) / 100 : Math.round(kg * 100) / 100;

    let age = "unknown";
    if (profile?.date_of_birth) {
      const dob = new Date(profile.date_of_birth as string);
      age = String(Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
    }

    const profileBlock = profile
      ? `USER PROFILE:\n- Name: ${(profile as any).name || (profile as any).username || "User"}\n- Age: ${age}\n- Height: ${(profile as any).height ? `${(profile as any).height} cm` : "unknown"}\n- Sex: ${(profile as any).sex || "unknown"}\n- Current weight: ${(profile as any).current_weight ? `${toDisplayWeight((profile as any).current_weight)} ${wUnit}` : "unknown"}\n- Goal weight: ${(profile as any).goal_weight ? `${toDisplayWeight((profile as any).goal_weight)} ${wUnit}` : "unknown"}\n- Activity level: ${(profile as any).activity_level || "unknown"}`
      : "USER PROFILE: Not available";

    let nutritionBlock = "RECENT NUTRITION (last 14 days):\n";
    if (nutritionLogs.length > 0) {
      for (const log of nutritionLogs) {
        nutritionBlock += `- ${log.date}: ${Math.round(log.calories)} cal | P: ${Math.round(log.protein)}g | C: ${Math.round(log.carbs)}g | F: ${Math.round(log.fats)}g\n`;
      }
    } else {
      nutritionBlock += "- No nutrition data logged yet\n";
    }

    // Today's nutrition block
    const todayBlock = mealsResult.error?`TODAY (${today}): Diary read failed; intake and balance are unknown.`:todayNutrition
      ? `TODAY (${today}):\n- Calories logged: ${Math.round(todayNutrition.calories)} kcal${goals ? ` / ${(goals as any).daily_calories ?? "?"} target` : ""}\n- Protein: ${Math.round(todayNutrition.protein)}g${goals ? ` / ${(goals as any).protein_g ?? "?"}g target` : ""}\n- Carbs: ${Math.round(todayNutrition.carbs)}g | Fats: ${Math.round(todayNutrition.fats)}g`
      : `TODAY (${today}): Nothing logged yet`;

    const goalsBlock = goals
      ? `CURRENT DAILY TARGETS:\n- Daily calories: ${(goals as any).daily_calories ?? "not set"} kcal\n- Protein: ${(goals as any).protein_g ?? "not set"}g\n- Carbs: ${(goals as any).carbs_g ?? "not set"}g\n- Fats: ${(goals as any).fats_g ?? "not set"}g\n- Goal type: ${(goals as any).goal_type || "not set"}`
      : "CURRENT DAILY TARGETS: Not set";

    // Adaptive TDEE block
    let tdeeBlock = "ADAPTIVE TDEE HISTORY (last 4 weeks):\n";
    if (tdeeRows.length > 0) {
      for (const row of tdeeRows) {
        const r = row as any;
        tdeeBlock += `- Week of ${r.week_start}: estimated TDEE ${r.estimated_tdee ?? "?"} kcal | prescribed ${r.prescribed_calories ?? "?"} kcal | avg eaten ${r.avg_calories_eaten != null ? Math.round(r.avg_calories_eaten) : "?"} kcal | avg weight ${r.avg_weight_lbs != null ? displayTdeeWeight(r.avg_weight_lbs, wUnit) : "?"} ${wUnit} | adjustment ${r.adjustment_amount != null ? (r.adjustment_amount >= 0 ? "+" : "") + r.adjustment_amount : "?"} kcal | applied: ${r.adjustment_applied ? "yes" : "no"}\n`;
      }
    } else {
      tdeeBlock += "- No TDEE adjustment history yet\n";
    }

    let weightBlock = "WEIGHT TREND (last 30 days):\n";
    if (checkIns.length > 0) {
      for (const w of checkIns) {
        weightBlock += `- ${(w as any).date}: ${toDisplayWeight((w as any).weight)} ${wUnit}\n`;
      }
    } else {
      weightBlock += "- No weight data\n";
    }

    // Trackers block
    let trackersBlock = "HABIT TRACKERS (last 7 days):\n";
    if (trackerEntries.length > 0) {
      // Group entries by tracker
      const trackerMap: Record<string, { name: string; emoji: string; unit: string; goal_value: number | null; entries: number[] }> = {};
      for (const entry of trackerEntries) {
        const e = entry as any;
        const tid = e.tracker_id as string;
        const tracker = e.trackers as any;
        if (!trackerMap[tid]) {
          trackerMap[tid] = {
            name: tracker?.name || tid,
            emoji: tracker?.emoji || "",
            unit: tracker?.unit || "",
            goal_value: tracker?.goal_value ?? null,
            entries: [],
          };
        }
        trackerMap[tid].entries.push(Number(e.value) || 0);
      }
      for (const [, t] of Object.entries(trackerMap)) {
        const avg = t.entries.reduce((a, b) => a + b, 0) / t.entries.length;
        const daysHitGoal = t.goal_value != null ? t.entries.filter((v) => v >= t.goal_value!).length : null;
        const goalStr = t.goal_value != null ? ` (goal: ${t.goal_value}${t.unit ? " " + t.unit : ""})` : "";
        const hitStr = daysHitGoal != null ? ` â€” ${daysHitGoal} day${daysHitGoal !== 1 ? "s" : ""} hit goal` : "";
        trackersBlock += `- ${t.emoji ? t.emoji + " " : ""}${t.name}: ${t.entries.length} entries â€” avg ${avg.toFixed(1)}${t.unit ? " " + t.unit : ""}/day${goalStr}${hitStr}\n`;
      }
    } else {
      trackersBlock += "- No habit trackers set up yet\n";
    }

    // Build memory block grouped by category
    let memoryBlock = "COACH MEMORY:\n";
    if (memoryItems.length > 0) {
      // Group by category
      const categoryMap: Record<string, { key: string; value: string }[]> = {};
      for (const m of memoryItems) {
        const cat = (m as any).category || "general";
        if (!categoryMap[cat]) categoryMap[cat] = [];
        categoryMap[cat].push({ key: (m as any).key, value: (m as any).value });
      }
      const categoryOrder = ["food_preferences", "restrictions", "schedule", "results", "onboarding", "general"];
      const allCats = [...new Set([...categoryOrder, ...Object.keys(categoryMap)])];
      for (const cat of allCats) {
        if (!categoryMap[cat] || categoryMap[cat].length === 0) continue;
        memoryBlock += `[${cat}]\n`;
        for (const item of categoryMap[cat]) {
          memoryBlock += `- ${item.key}: ${item.value}\n`;
        }
        memoryBlock += "\n";
      }
    } else {
      memoryBlock += "- No memory yet\n";
    }

    // Coach actions block
    let coachActionsBlock = "COACH ACTION HISTORY (what I've done for this user):\n";
    if (coachActions.length > 0) {
      for (const action of coachActions) {
        const a = action as any;
        const dateStr = a.created_at ? coachDate(new Date(a.created_at), timeZone) : "unknown date";
        const newValStr = a.new_value ? ` â€” ${JSON.stringify(a.new_value)}` : "";
        coachActionsBlock += `- ${dateStr}: ${a.action_type}${newValStr} (status: ${a.status || "unknown"})\n`;
      }
    } else {
      coachActionsBlock += "- No previous coach actions\n";
    }

    // Build returning user context block for __RETURNING_USER_OPEN__
    let returningUserContextBlock = "";
    if (isReturningOpen) {
      const recentLogDays = nutritionLogs.length;
      const last7LogDays = last7Days.length;
      const avgProteinLast7 = last7Days.length > 0
        ? Math.round(last7Days.reduce((s, l) => s + l.protein, 0) / last7Days.length)
        : null;
      const avgCaloriesLast7 = last7Days.length > 0
        ? Math.round(last7Days.reduce((s, l) => s + l.calories, 0) / last7Days.length)
        : null;
      const proteinGoal = goals ? (goals as any).protein_g : null;
      const calorieGoal = goals ? (goals as any).daily_calories : null;

      // Weight trend
      let weightTrendNote = "";
      if (checkIns.length >= 2) {
        const newest = checkIns[0] as any;
        const oldest = checkIns[checkIns.length - 1] as any;
        const diffLbs = (Number(newest.weight) - Number(oldest.weight)) * 2.20462;
        if (Math.abs(diffLbs) >= 0.5) {
          weightTrendNote = diffLbs < 0
            ? `down ${Math.abs(diffLbs).toFixed(1)} ${wUnit} over the last ${checkIns.length} weigh-ins`
            : `up ${diffLbs.toFixed(1)} ${wUnit} over the last ${checkIns.length} weigh-ins`;
        }
      }

      // Unread insight from nightly analysis
      const insightNote = latestInsight
        ? `UNREAD COACH INSIGHT (from nightly analysis, condition: ${(latestInsight as any).condition_type}): "${(latestInsight as any).insight_text}"`
        : "";

      returningUserContextBlock = `
RETURNING USER OPEN CONTEXT:
- Streak: ${streak} day${streak !== 1 ? "s" : ""} logged in a row
- Days logged last 7: ${last7LogDays}
- Avg calories last 7 days: ${avgCaloriesLast7 ?? "no data"}${calorieGoal ? ` / ${calorieGoal} goal` : ""}
- Avg protein last 7 days: ${avgProteinLast7 ?? "no data"}${proteinGoal ? `g / ${proteinGoal}g goal` : ""}
${weightTrendNote ? `- Weight trend: ${weightTrendNote}` : ""}
${insightNote}
`;
    }

    // Derive onboarding state from coach_memory for use in the system prompt
    const memoryMap: Record<string, string> = {};
    for (const m of memoryItems) {
      memoryMap[(m as any).key] = (m as any).value;
    }
    const hasExperience = !!memoryMap["onboarding_experience"];
    const hasChallenge = !!memoryMap["onboarding_challenge"];

    const languageInstruction = language === "es"
      ? "LANGUAGE: You MUST respond in Spanish (espaÃ±ol) at all times, regardless of what language the user writes in. Never switch languages mid-conversation."
      : "LANGUAGE: You MUST respond in English at all times, regardless of what language the user writes in. Never switch languages mid-conversation.";

    const systemPrompt = `You are an expert AI nutrition and fitness coach inside the Macro Goal app.

${languageInstruction}

FORMATTING RULES (non-negotiable):
- Use clear, concise prose in the text field. A short list is allowed when it improves readability; avoid decorative markdown.
- Write in plain natural prose, like a real person texting
- Do not use headers or em-dashes; use a short plain-text list only when helpful
- Short paragraphs separated by line breaks only

${profileBlock}

${goalsBlock}
PRIVATE TYPED DAILY SNAPSHOT (not public search input): ${JSON.stringify(privateNutritionSnapshot)}
Use only available snapshot fields. Unknown is never zero. Daily remaining is arithmetic against a recorded target, not measured energy expenditure or proof of a physiological deficit. Never guarantee a deficit or weight loss. It is not a meal allocation. Do not reduce targets or recommend skipping meals to compensate. Source-serving counts must agree with verified_lookup_options, Add and Food Details.

${tdeeBlock}
${nutritionBlock}
${todayBlock}

${foodPatternBlock}

${streakBlock}

${weightBlock}
${trackersBlock}
${memoryBlock}

${coachActionsBlock}
${returningUserContextBlock}
Today: ${today} (time zone: ${timeZone})

FOOD EVIDENCE AND DISCOVERY RULES:
- You may search public sources for restaurant menu items, official restaurant addresses, grocery products, and recipes. Only present an address when verified from an official public source; never invent or infer an address. Do not claim current availability unless the source verifies it.
- For a clear request with food, restaurant, and city explicitly stated, issue discover_food with those exact public slots (food, mode="restaurant", city, and region/country only when stated). Do not replace that tool request with a redundant informal question.
- Treat the latest explicit user request as authoritative over stale assistant text or older lookup proposals. A short user reply that selects an offered item continues the active request unless the user explicitly changes its mode, food, or location. Do not treat a prior assistant refusal or unsupported capability claim as fact.
- Preserve a preference explicitly stated in the current request, including balanced, lower_calorie, or high_protein. Do not carry a conflicting preference from stale assistant text over the user's latest explicit preference.
- If the user explicitly changes the mode to supermarket/product, use mode="product" while preserving other still-applicable explicit slots. Do not infer a city, preference, identity, or other private profile data for a public search.
- Never rewrite, construct, or alter signed consent arguments or authenticated selection arguments. The server owns those values; only use the approved tool contract.
- You may request one public restaurant, packaged grocery product, or recipe discovery using only explicit public food and locality slots stated by the user or selected from a server-verified discovery option. Never infer locality from profile, diary, device, or private conversation context.
- Return one schema-valid JSON object. Every response must include non-empty text and a choices array (0-5 objects, each with id, label, value). Planner responses must also include tool_request: null or {name:"discover_food",args:{food:string,mode:"restaurant"|"product"|"recipe",city:string|null,region:string|null,country:ISO-3166-1-alpha-2|null,preference:"high_protein"|"lower_calorie"|"balanced"|null}}. Include every listed key; use null for unknown optional public slots and never put arbitrary fields in args. Use mode "product" for supermarket/grocery products, not "supermarket". Use country "US" for the United States. A lookup proposal is not consent: request discovery only when the user explicitly asks for it or selects an authenticated, server-verified discovery option. Never infer locality from profile, diary, device, or private conversation context. Never provide URLs or arbitrary tools.
- Never claim macros, recipe quantities, yield, stock, or availability unless supplied verified evidence supports them. Partial discovery identity is not loggable and is not complete nutrition.
- Do not emit add_food_to_diary or create_meal_plan actions from this route. Existing validated action proposals require explicit confirmation and server registration.

VALUE FROM THE FIRST MESSAGE:
- Answer the user's actual need immediately, with one practical recommendation supported by available relevant records. No mandatory onboarding or minimum conversation count.
- Do not invent meals, measurements, preferences, schedule, targets or missing records. Distinguish missing data from zero and acknowledge uncertainty.
- Ask at most one useful follow-up question after providing value, when its answer would materially improve the next step.
- If a specific plan requires missing safety-critical information, explain what is missing and give a safe general option instead of pretending to personalize it.
- Keep Settings language throughout, including suggestions. A proposal is not an applied change: explicit confirmation is always required before food or goal writes.
- Do not promise a rate or deadline of weight loss, intensify a deficit to force a rate, or change calories automatically. Existing validated targets and safety safeguards remain in force. Do not invent medical thresholds or diagnose from sparse logs.
- Nutrition advice is educational; where the user reports a medical condition, pregnancy, disordered eating or alarming symptoms, avoid aggressive restriction and recommend appropriate professional support without inventing individualized medical targets.

MEMORY SAFETY: Only store an exact quote from a USER message as the value. Never store your own advice, meal proposals, inferred traits, or recommendations as facts. If a user explicitly states a stable preference, append MEMORY_UPDATE: {"key":"snake_case","value":"exact user quote","category":"canonical category"} at the END, after all user-visible text. No save_memory tool exists. Allowed categories: ${MEMORY_CATEGORIES.join(', ')}. If no explicit fact, emit no update. Storage is subject to current user settings.



TONE BY EXPERIENCE LEVEL (apply once onboarding_experience is known):
- beginner: explain terms, be encouraging, never assume knowledge, celebrate small wins
- intermediate: direct, use numbers, light explanation only when needed
- advanced: technical, straight to the point, no hand-holding, assume full macro literacy

ADAPTIVE TDEE AWARENESS:
- The app automatically adjusts the user's calorie target weekly based on actual intake vs weight change.
- If the TDEE history shows consistent adjustments downward, the user may be in a prolonged deficit â€” consider recommending a diet break or maintenance week.
- Do not infer underreporting or a metabolic cause from a plateau alone; acknowledge data gaps and uncertainty.
- Reference specific weeks and numbers when discussing calorie adjustments.

TRACKER AWARENESS:
- Low sleep (under 7 hrs) correlates with increased hunger and cravings â€” mention this if the user complains about hunger or cravings.
- Low water intake can cause false hunger signals â€” mention this if the user is struggling with overeating.
- Low steps combined with a calorie deficit may slow metabolism â€” consider recommending NEAT (non-exercise activity thermogenesis).

COACH ACTIONS AWARENESS:
- The COACH ACTION HISTORY shows changes you previously made for this user. Reference them naturally.
- If you adjusted calories recently, acknowledge it: "I lowered your calories last week to X â€” how has that been feeling?"
- Never propose the same action twice in a row without checking if the previous one was effective.

INSTRUCTIONS:
- Answer directly and concisely. Use the user's actual data.
- Keep responses under 6 short lines unless detail is explicitly requested.
- When profile or goals are missing, ask for the missing details before calculating personalized targets. Existing explicit food preferences may still be available.
- If giving a general meal idea without an ACTION_PROPOSAL, describe the actual food in the visible reply. Respect any explicit total meal count exactly; never fill the rest of the day unless requested. If quantity is ambiguous, ask before proposing a meal plan. A create_meal_plan confirmation saves a plan and does not log food in the diary. Never announce "here is a plan/breakfast" without providing its details or a complete valid proposal. Do not imply a missing card can be confirmed.
- For a requested meal plan, give a brief summary and include the literal ACTION_PROPOSAL: {...} suffix inside the text string, with action_type create_meal_plan and proposal containing plan_name, start_date, end_date and items (each with date, meal_type, food_name, calories, protein, carbs, fats, fiber, quantity). Maximum 100 items over 31 days. Registration and explicit confirmation are required; never say the plan was saved before confirmation.
- CRITICAL: When proposing a goal change, write only 1-2 sentences then include the literal ACTION_PROPOSAL: {...} suffix inside the text string.
- CRITICAL: When adding food to diary, write only 1 sentence then include the literal ACTION_PROPOSAL: {...} suffix inside the text string.
- When proposing a goal change: ACTION_PROPOSAL: {"action_type":"update_goal","action_id":"<uuid>","confirmation_token":"<uuid>","proposal":{"reason":"...","current_value":...,"proposed_value":...,"expected_effect":"..."}}
- When adding food to diary: ACTION_PROPOSAL: {"action_type":"add_food_to_diary","action_id":"<uuid>","confirmation_token":"<uuid>","proposal":{"food_name":"...","calories":0,"protein":0,"carbs":0,"fats":0,"date":"YYYY-MM-DD","meal_type":"lunch","quantity":1,"serving_unit":"serving"}}
- When recommending a calorie adjustment based on data: write 1-2 sentences with the evidence, then include the literal ACTION_PROPOSAL: {"action_type":"adjust_calories","action_id":"<uuid>","confirmation_token":"<uuid>","proposal":{"reason":"...","current_calories":<number>,"proposed_calories":<number>,"adjustment_amount":<number>,"expected_effect":"...","evidence":"..."}}
- IDs and confirmation tokens in examples are placeholders. The server validates proposals and replaces them with server-generated values.`;

    const apiMessages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role,
        content:
          m.content === "__FIRST_INTERACTION__" ? "[FIRST_INTERACTION_TRIGGER]" :
          m.content === "__RETURNING_USER_OPEN__" ? "[RETURNING_USER_OPEN]" :
          m.content,
      })),
    ];

    // Normal pilot turn: bounded planner -> at most one approved public lookup -> final.
    // Keep the old SSE consumer below so its memory and action validation remains
    // the single post-processing path for structured model text.
    let modelLedChoices:Array<{id:string;label:string;value:string}>=[];
    let modelLedDiscoveryOptions:unknown[]=[];let modelLedDiscoveryBindings:Record<string,any>={};
    let modelLedLookupContext:unknown=storedLookupContext;
    let clearModelLedLookupContext=false;
    let modelLedStatus:'completed'|'needs_consent'|'budget_denied'|'invalid_plan'|'provider_error'='completed';
    const requestText=messages.filter((m:any)=>m.role==='user').at(-1)?.content??'';
    const intent=lookupIntent(requestText);
    const explicitLookupConsent=intent.kind==='search'||(intent.kind==='clarify'&&intent.reason==='confirmation_required');
    // Inherit previous lookup slots only for an exact affirmative or exact consent-card value. Prefixes with edited food/locality are not consent.
    const affirmativeConsent=!!storedLookupContext&&/^(?:yes|sure|okay|ok|search|find|go ahead|si|s\u00ed|vale|adelante|buscar|yes, search public options|si, buscar opciones publicas)[.!]?$/i.test(requestText.trim());
    const selectedArgs:DiscoverFoodArgs|undefined=selectedDiscovery?(()=>{
      const c=lookupContext(selectedDiscovery.lookup_context);
      if(!c)return undefined;
      const mode=c.mode==='restaurant'||c.mode==='product'||c.mode==='recipe'?c.mode:'product';
      return validateDiscoverFoodArgs({food:selectedDiscovery.option.name,mode,...(c.area?{city:c.area.split(',')[0].trim(),...(c.area.split(',')[1]?{region:c.area.split(',')[1].trim()}:{})}:{}),...(c.preference?{preference:c.preference}:{})})??undefined;
    })():undefined;
    const inheritedArgs=affirmativeConsent&&storedLookupContext&&storedLookupContext.mode!=='unknown'?validateDiscoverFoodArgs({food:storedLookupContext.food,mode:storedLookupContext.mode,...(storedLookupContext.area?{city:storedLookupContext.area.split(',')[0].trim(),...(storedLookupContext.area.split(',')[1]?{region:storedLookupContext.area.split(',')[1].trim()}:{})}:{}),...(storedLookupContext.country?{country:storedLookupContext.country}:{}),...(storedLookupContext.preference&&storedLookupContext.preference!=='healthy'?{preference:storedLookupContext.preference}:{})}):undefined;
    const explicitArgs=selectedArgs??selectedConsentProposal?.args??inheritedArgs??confirmedDiscoveryArgs(intent);
    const forceSearch=!!selectedArgs||!!selectedConsentProposal||!!inheritedArgs||explicitLookupConsent;
    requestedMealServings=currentRequestedSourceServings(messages,explicitArgs?{food:explicitArgs.food,mode:explicitArgs.mode,area:[explicitArgs.city,explicitArgs.region].filter(Boolean).join(', ')}:storedLookupContext);
    if(requestedMealServings===undefined&&selectedConsentProposal&&affirmativeConsent&&messages.filter((m:any)=>m.role==='user').length===1)requestedMealServings=selectedConsentProposal.sourceServings;
    let plannerCost:number|null=null,discoveryCost:number|null=null,finalCost:number|null=null;
    const phaseAudit=providerAuditOuter;
    let modelLedChatResponse:Response|undefined;
    if(modelLed){
    const phaseResult=await runModelLedTurn<WebResult>({
      reserveUSD:WEB_PILOT_LIMITS.reserveUSD,
      reserve:async usd=>webBudgetReserved&&usd===WEB_PILOT_LIMITS.reserveUSD, // Reserved atomically by begin.
      // Conservative aggregate: planner/final (30k UTF-8 byte ceiling + 2048 output tokens)
      // are capped at $0.10572 each. Discovery reserves 1,048,576 prompt tokens at
      // $2.50/M, 2,048 output tokens at $15/M, and $0.007 Exa; aggregate $2.87060.
      worstCaseUSD:{planner:WEB_PLANNER_MAX_COST_USD,discovery:WEB_DISCOVERY_MAX_COST_USD,final:WEB_FINAL_MAX_COST_USD},
      authorizeDiscovery:()=>!!explicitArgs&&forceSearch&&webEnabled,
      ...(explicitArgs?{forcedDiscovery:explicitArgs}:{}),
      retainedDiscovery:args=>{
        if(!retainedPool||forceSearch)return undefined;
        const options=retainedRestaurantOptions(retainedPool,args);if(!options)return undefined;
        retainedVerifiedOptions=options;carriedRestaurantPool={...retainedPool,context:{food:args.food,mode:'restaurant',area:[args.city,args.region].filter(Boolean).join(', '),...(args.country?{country:args.country}:{}),...(args.preference?{preference:args.preference}:{})},options};
        const result:WebResult={sources:retainedPool.sources,context:'Verified options retained from this conversation receipt; no public lookup executed.',status:'ok'};webEvidence=result;return result;
      },
      planner:async()=>{const localPlan=confirmedMealDiscoveryPlan(req,authUser.id,body,explicitArgs,!!explicitArgs&&forceSearch&&webEnabled);if(localPlan){plannerCost=0;return localPlan;}await authorizePhase('planner');const row={phase:'planner',cost:null as number|null,generation_id:null as string|null};phaseAudit.push(row);const r=await callStructuredPhase(plannerMessages(language,messages,publicRestaurantSummary),2048,(cost,id)=>{row.cost=cost;row.generation_id=id;},true,PLANNER_PROVIDER_PHASE_LIMIT_MS,providerWorkDeadlineAt,req.signal,groundedPlannerResponseFormat(),requestId);plannerCost=r.cost;const resolved=resolvePlannerReplyWithDiagnostic(r.output,messages,language,publicRestaurantSummary),output=resolved.reply,state=plannerReplyState(output);if(resolved.diagnostic){privatePlannerValidationDiagnostic=resolved.diagnostic;console.warn('[AICoach] Planner validation failed',{request_id:requestId,...resolved.diagnostic});}if(!explicitArgs){modelLedLookupContext=state?.context??null;requestedMealServings=currentRequestedSourceServings(messages,state?.context);clearModelLedLookupContext=!modelLedLookupContext&&storedLookupContext!==null;}return {...r,output,disposition:state?.kind};},
      discover:async(_query,args)=>{
        await authorizePhase('discovery');
        webLookupAttempted=true;
        const query=publicDiscoveryQuery(args);
        const mapped={kind:'search' as const,query,food:args.food,mode:args.mode,...(args.restaurant?{restaurant:args.restaurant}:{}),area:[args.city,args.region,args.country].filter(Boolean).join(', ')};
        const row={phase:'discovery',cost:null as number|null,generation_id:null as string|null};phaseAudit.push(row);
        const result=await searchFoodSources(query,requestId,{maxMinutes:args.max_minutes,enabled:webEnabled,apiKey:OPENROUTER_API_KEY,fetch,language,intent:mapped,onAttempt:()=>{webLookupAttempted=true;},onReceipt:(cost,id)=>{row.cost=cost;row.generation_id=id;},reserveBudget:async()=>true});
        webEvidence=result;privateProviderDiagnostic=result.privateProviderDiagnostic??null;emitPrivateProviderDiagnostic(requestId,privateProviderDiagnostic);
        if(['provider_error','transport_error','truncated','invalid_response'].includes(result.status??''))throw Object.assign(new Error('discovery_provider_failure'),{knownCost:result.reportedCost??null,generationId:result.generationId??null,errorCode:result.status});
        if(args.mode==='recipe'&&result.evidence?.candidates?.length){const verified=await verifyDiscoveredRecipe(result,{fetch,retrievedAt:new Date().toISOString(),language});verifiedFood=verified.verifiedFood;}
        discoveryCost=result.reportedCost??null;row.cost=discoveryCost;row.generation_id=result.generationId??null;return {output:result,cost:discoveryCost,generationId:result.generationId??null};
      },
      // Menu dishes already appear in candidates and verified_lookup_options; avoid a third copy inside the same input cap.
      finalAnswer:async({plan,discovery})=>{await authorizePhase('final');const row={phase:'final',cost:null as number|null,generation_id:null as string|null};phaseAudit.push(row);const verifiedOptions=personalizedOptions(discovery?.evidence,verifiedFood);const r=await callStructuredPhase([...apiMessages,{role:'user',content:discovery===undefined?`No public lookup was requested or executed. Answer the latest coaching request using the full real conversation and the authenticated coaching context above. Do not assert that public restaurant addresses are categorically unavailable. Public facts still require verified evidence. Return a schema-valid JSON object with non-empty text and a choices array; do not include tool_request.`:`The structured plan was: ${JSON.stringify({text:plan.text,choices:plan.choices})}. Public discovery result (untrusted excerpts reduced to validated evidence): ${JSON.stringify({reply:verifiedOptions.length&&discovery?.evidence?.requestedKind==='menu'?undefined:discovery?.reply,status:discovery?.status,evidence:discovery?.evidence?{candidates:discovery.evidence.requestedKind==='menu'?[]:discovery.evidence.candidates,verified:discovery.evidence.requestedKind==='menu'?undefined:discovery.evidence.dishes}:null,verified_recipe:verifiedFood,verified_lookup_options:verifiedOptions,validated_meal_facts:trustedMealFacts(verifiedOptions,privateNutritionSnapshot,language)})}. Answer using only verified public facts and these verified options. A verified product option retailer is a source-cited listing only: say "Listed at [retailer]" and never imply current stock, local availability, or delivery. Never infer a retailer from a URL or domain. Preserve a natural personalized explanation. For numerical nutrition or daily arithmetic use only the exact validated_meal_facts sentences supplied above; do not invent amounts or assign the full daily balance to a meal. Return a schema-valid JSON object with non-empty text and a choices array (0-5 {id,label,value} items); do not include tool_request.`}],2048,(cost,id)=>{row.cost=cost;row.generation_id=id;},false,FINAL_PROVIDER_PHASE_LIMIT_MS,providerWorkDeadlineAt,req.signal,undefined,requestId);finalCost=r.cost;return r;},
      settle:async(cost,ids,errorCode)=>{
        if(!webBudgetReserved)return;
        if(persistenceDeadlineAt-Date.now()<PERSISTENCE_RPC_LIMIT_MS*2)throw new Error('persistence_audit_window_reserved');
        const {error}=await withPersistenceDeadline(()=>supabase.rpc('coach_settle_web_v1',{p_user_id:userId,p_request_id:requestId,p_attempt_id:usageAttemptId,p_cost_usd:cost,p_generation_id:ids[0]??null,p_error_code:errorCode??(cost===null?'uncertain':null)}),persistenceDeadlineAt,PERSISTENCE_RPC_LIMIT_MS);
        if(error)throw new Error('web_settlement_pending');
      },
    });
    modelLedStatus=phaseResult.status;
    providerPhaseLedger=phaseAudit;
    if(phaseResult.validationDiagnostic&&!privatePlannerValidationDiagnostic)console.warn('[AICoach] Structured reply validation failed',phaseResult.validationDiagnostic);
    modelLedChoices=phaseResult.reply.choices??[];
    if(phaseResult.status==='completed'&&explicitArgs){modelLedLookupContext={food:explicitArgs.food,mode:explicitArgs.mode,...(explicitArgs.city?{area:[explicitArgs.city,explicitArgs.region].filter(Boolean).join(', ')}:{}),...(explicitArgs.country?{country:explicitArgs.country}:{}),...(explicitArgs.preference?{preference:explicitArgs.preference}:{})};}
    if(phaseResult.status==='completed'||phaseResult.status==='needs_consent'){
      let text=phaseResult.reply.text;
      if(phaseResult.status==='needs_consent'){
        const p=phaseResult.proposal!;
        modelLedLookupContext={food:p.food,mode:p.mode,...(p.city?{area:[p.city,p.region].filter(Boolean).join(', ')}:{}),...(p.country?{country:p.country}:{}),...(p.preference?{preference:p.preference}:{})};
        const locale=[p.city,p.region,p.country].filter(Boolean).join(', ');
        const preference=p.preference==='high_protein'?(language==='es'?' con preferencia por más proteína':' with a higher-protein preference'):p.preference==='lower_calorie'?(language==='es'?' con preferencia por menos calorías':' with a lower-calorie preference'):p.preference==='balanced'?(language==='es'?' con preferencia equilibrada':' with a balanced preference'):'';
        text=language==='es'?`Puedo buscar opciones públicas de ${p.food}${locale?` en ${locale}`:''}${preference}. ¿Quieres que las busque?`:`I can search public ${p.mode} options for ${p.food}${locale?` in ${locale}`:''}${preference}. Would you like me to search?`;
        modelLedChoices=[{id:'search_options',label:language==='es'?'Buscar opciones':'Search options',value:'yes, search public options'}];
      }
      const completeOptions=personalizedOptions(webEvidence.evidence,verifiedFood);
      const {rows,trustedIds}=discoveryRowsFromEvidence(webEvidence.evidence,completeOptions);
      // Broad recommendations finish with verified menu options; do not turn incomplete discovery into a verification task.
      const broadRestaurant=!!explicitArgs&&isBroadRestaurantRequest(explicitArgs);
      modelLedDiscoveryBindings={};modelLedDiscoveryOptions=projectDiscoveryOptions(rows,requestId,trustedIds,modelLedDiscoveryBindings);
      if(broadRestaurant)modelLedChoices=[];
      const payload=JSON.stringify({text,choices:modelLedChoices});
      const sse=`data: ${JSON.stringify({choices:[{delta:{content:payload}}]})}\n\ndata: [DONE]\n\n`;
      const chatRes=new Response(sse,{headers:{'Content-Type':'text/event-stream'}});
      // Bind the approved wire snapshots to the existing receipt created below.
      // Continue through the existing SSE parser and its action/memory guards.
      // `chatRes` is consumed by the legacy parser immediately below.
      
      // Shadow the old unconditional dispatch with this completed phase response.
      modelLedChatResponse=chatRes;
    } else {
      const preDispatchBudgetDenied=phaseResult.status==='budget_denied'&&phaseAudit.length===0;
      const safeText=preDispatchBudgetDenied?(language==='es'?'No se inició la búsqueda porque el presupuesto disponible no permite reservarla. No se realizó ninguna consulta.':'The search was not started because the lookup budget could not be reserved. No provider request was made.'):(language==='es'?'No pude completar una respuesta segura en este momento.':'I could not complete a safe response right now.');
      modelLedChatResponse=new Response(`data: ${JSON.stringify({choices:[{delta:{content:JSON.stringify({text:safeText,choices:[]})}}]})}\n\ndata: [DONE]\n\n`,{headers:{'Content-Type':'text/event-stream'}});
    }
    }

    console.log("[AICoach] Model-led turn complete; entering guarded response parser.");

    if(!modelLedChatResponse){await authorizePhase('final');providerAuditOuter.push({phase:'final',cost:null,generation_id:null});}
    const chatRes = modelLedChatResponse ?? await fetchWithAbortSignal(fetch,AbortSignal.any([req.signal,AbortSignal.timeout(Math.max(1,providerWorkDeadlineAt-Date.now()))]))(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SUPABASE_URL,
        "X-Title": "Macro Goal AI Coach",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!chatRes.ok || !chatRes.body) {
      await finalizeUsage('failed_before_stream');
      const errText = await chatRes.text();
      console.error("[AICoach] OpenRouter error:", chatRes.status, "upstream_request_failed");
      return new Response(JSON.stringify({ error: `OpenRouter error ${chatRes.status}`, detail: "upstream_request_failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream tokens to client as SSE
    const encoder = new TextEncoder();
    const directiveFilter = createDirectiveFilter();
    const stream = new ReadableStream({
      async start(controller) {
        let receivedProviderText = false, sideEffectsStarted = false;
        try {
        const reader = chatRes.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";
        let upstreamComplete = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed === "data: [DONE]") { upstreamComplete = true; continue; }
              if (!trimmed) continue;
              if (!trimmed.startsWith("data: ")) continue;
              try {
                const json = JSON.parse(trimmed.slice(6));
                const token = json.choices?.[0]?.delta?.content;
                if (token) {
                  receivedProviderText = true;
                  fullText += token;
                  // Do not publish model wording before proposal registration and receipt persistence.
                  // A trailing directive can invalidate an earlier invitation to confirm.
                  directiveFilter.push(token);
                }
              } catch { /* skip malformed */ }
            }
          }
        } finally {
          reader.releaseLock();
        }

        // The model-led adapter emits a validated JSON envelope; unwrap only that
        // envelope before the established action and memory directive guards run.
        try {
          const envelope=JSON.parse(fullText);
          if(envelope&&typeof envelope.text==='string'&&Array.isArray(envelope.choices)){
            fullText=envelope.text;
            modelLedChoices=envelope.choices;
          }
        } catch { /* malformed output remains subject to the existing safe fallback */ }
        const verifiedResponseOptions=personalizedOptions(webEvidence.evidence,verifiedFood);
        const hasVerifiedNutrition=verifiedResponseOptions.some((o:any)=>o.loggable===true&&o.complete_item_verified===true&&o.nutrition_status==='complete_verified');
        if(modelLed&&modelLedStatus==='completed'&&webEvidence.status==='empty'&&webEvidence.evidence?.requestedKind==='menu'&&!verifiedResponseOptions.length&&!modelLedDiscoveryOptions.length){
          fullText=webEvidence.reply||(language.startsWith('es')?'No pude verificar una opción con las fuentes oficiales de cadenas consultadas.':'I could not verify an option using the official chain sources searched.');
          modelLedChoices=[];
        }

        const fitKeys=['calories','protein','carbs','fats'] as const;
        const balanceCannotConfirmFit=!verifiedResponseOptions.length||fitKeys.some(k=>privateNutritionSnapshot.remaining[k]===null)||verifiedResponseOptions.some((o:any)=>{const portion=lookupOptionPortion(o,validatedSuggestedServings(o.suggested_servings)??1);return !portion||fitKeys.some(k=>portion.nutrition[k]>privateNutritionSnapshot.remaining[k]!+1e-6);});
        const personalizedMealReply=modelLed&&modelLedStatus==='completed'&&(hasVerifiedNutrition||(modelLedLookupContext as any)?.mode==='restaurant'&&providerPhaseLedger.some(p=>p.phase==='final'));
        const personalizedMealFacts=personalizedMealReply?trustedMealFacts(verifiedResponseOptions,privateNutritionSnapshot,language,macroFitRequested):[];
        const verifiedNutritionText=personalizedMealFacts.join(' ');
        // The model cannot write nutrient claims into visible prose. We render only
        // complete source-verified values below, so a claim such as "999 kcal" is
        // removed rather than triggering the generic question fallback.
        if(personalizedMealReply&&!fullText.includes('ACTION_PROPOSAL:'))fullText=guardPersonalizedMealText(fullText,personalizedMealFacts,balanceCannotConfirmFit)|| (language.startsWith('es')?'Encontré opciones verificadas.':'I found verified options.');
        // Guard: if OpenRouter returned no tokens, send a fallback so the client never gets an empty bubble
        const emptyModelResponse = fullText.trim().length === 0;
        if (fullText.trim().length === 0) {
          console.warn("[AICoach] OpenRouter returned empty response â€” sending fallback token");
          const fallback = language === "es"
            ? "Estoy teniendo problemas para responder en este momento. IntÃ©ntalo de nuevo."
            : "I'm having trouble responding right now. Please try again.";
          fullText = fallback;
        }

        // Validate the entire buffered reply before memory writes, action registration,
        // receipt persistence or any user-visible text. Never retain its directives.
        const latestUserRequest = messages.filter((m:any)=>m.role==='user').at(-1)?.content ?? '';
        let actionStart = fullText.indexOf('ACTION_PROPOSAL:');
        let actionProposalRaw = upstreamComplete && actionStart >= 0
          ? memoryDirectives('MEMORY_UPDATE:' + fullText.slice(actionStart + 'ACTION_PROPOSAL:'.length))[0] as Record<string, unknown> | undefined
          : null;
        const visibleBeforeFoodGuard=visibleCoachText(fullText);
        if(lookupContext(modelLedLookupContext)?.mode==='restaurant'&&actionProposalRaw&&['update_goal','adjust_calories'].includes(String(actionProposalRaw.action_type))){actionProposalRaw=null;actionStart=-1;fullText=visibleCoachText(fullText);}
        const hasGoalAction=!!actionProposalRaw&&['update_goal','adjust_calories'].includes(String(actionProposalRaw.action_type));
        let validatedGoalMutation:ReturnType<typeof normalizeCoachMutation>|null=null;
        if(hasGoalAction)try { validatedGoalMutation=normalizeCoachMutation({action_type:actionProposalRaw!.action_type,proposal:actionProposalRaw!.proposal}); } catch { /* malformed goal proposal remains on the ordinary guarded path */ }
        // Valid goal proposals are rendered below from normalized server-owned
        // fields; discard all model prose, including any attached food claims.
        const foodGuardText=validatedGoalMutation?'':personalizedMealReply?guardPersonalizedMealText(visibleBeforeFoodGuard,[],balanceCannotConfirmFit):visibleBeforeFoodGuard;
        const discoveryGuidance=modelLed&&modelLedStatus==='completed'&&!hasVerifiedNutrition&&!validatedGoalMutation&&!actionProposalRaw?unverifiedDiscoveryGuidance(modelLedDiscoveryOptions,language):null;
        const foodQuestion = modelLedStatus==='needs_consent'?'':generatedFoodEvidenceQuestion(fullText, foodGuardText, language, modelLed ? '' : latestUserRequest);
        if (discoveryGuidance) { fullText = discoveryGuidance; actionStart=-1; actionProposalRaw=null; }
        else if (foodQuestion) { fullText = foodQuestion; actionStart=-1; actionProposalRaw=null; }

        // Process and strip MEMORY_UPDATE blocks, upsert to coach_memory
        directiveFilter.finish();
        sideEffectsStarted = upstreamComplete && !emptyModelResponse;
        const commitMemorySettings=await readMemorySettings(supabase,userId);
        const preparedMemories=upstreamComplete&&!foodQuestion?memoryDirectives(fullText).slice(0,20).map(m=>groundedMemory(m,messages)).filter(m=>m&&memoryAllowed(commitMemorySettings,m.category,true)):[];
        const memorySaveFailed=false;
        let correctedText = visibleCoachText(fullText);

        // Parse ACTION_PROPOSAL from full text
        let actionProposal: Record<string, unknown> | null = null;
        let preparedAction:ReturnType<typeof normalizeCoachMutation>|null=null;
        if (actionProposalRaw) {
          const proposal = actionProposalRaw as Record<string, unknown>;
          const action_type = (proposal.action_type as string) || "";
          const action_id = genUUID();
          const confirmation_token = genUUID();
          const innerProposal = (proposal.proposal as Record<string, unknown>) || {};
          if (!innerProposal.action_type) innerProposal.action_type = action_type;
          actionProposal = { action_id, action_type, confirmation_token, proposal: innerProposal };
          if (["add_food_to_diary", "update_goal", "adjust_calories", "create_meal_plan"].includes(action_type)) {
            try {
              const payload = normalizeCoachMutation(actionProposal);
              if(payload.action_type==='create_meal_plan') {
                const latestUser=messages.filter((m:any)=>m.role==='user').at(-1)?.content||'';
                const requested=requestedMealCount(latestUser);
                if(requested==='ambiguous'||(requested!==null&&new Set((payload.proposal.items as any[]).map(i=>i.date+':'+i.meal_type)).size!==requested))throw new Error('meal_count_mismatch');
              }
              preparedAction=payload; // Registration happens only inside the fenced SQL commit.
              actionProposal={pending:true};
              if(payload.action_type==='update_goal'||payload.action_type==='adjust_calories')correctedText=goalProposalReviewText(payload,language);
              if(payload.action_type==='create_meal_plan')correctedText=mealPlanReviewText(payload,language);
            } catch (error) {
              // Registration failed: do not leave a confirmation invitation without a card.
              // The final corrected text also becomes the persisted replay result.
              actionProposal = null;
              preparedAction = null;
              correctedText = error instanceof Error && error.message==='meal_count_mismatch'
              ? (language==='es'?'La cantidad de comidas no coincide con una solicitud clara. Aclara el total deseado; no preparÃ© una tarjeta ni guardÃ© cambios.':'The meal count does not match a clear request. Please clarify the total wanted; no card was prepared and no changes were saved.')
              : language === 'es'
                ? 'No pude preparar la propuesta para confirmarla. No se aplicÃ³ ningÃºn cambio.'
                : 'I could not prepare the proposal for confirmation. No changes were applied.';
              console.warn("[AICoach] Proposal unavailable for confirmation");
            }
          }
          if (!["add_food_to_diary", "update_goal", "adjust_calories", "create_meal_plan"].includes(action_type)) {
            // Unknown action types have no registered confirmation path.
            actionProposal = null;
            correctedText = language === 'es'
              ? 'No pude preparar esta acciÃ³n para confirmarla. No se aplicaron cambios.'
              : 'I could not prepare this action for confirmation. No changes were applied.';
          }
          console.log("[AICoach] Action proposal:", action_type, action_id);
        }

        // Incomplete or malformed action directives must not leave a dangling confirmation invitation.
        if (!upstreamComplete || (actionStart >= 0 && !actionProposalRaw)) {
          actionProposal = null;
          correctedText = language === 'es'
            ? 'No pude completar la respuesta ni preparar una propuesta para confirmar. No se aplicÃ³ ningÃºn cambio.'
            : 'I could not complete the reply or prepare a proposal for confirmation. No changes were applied.';
        }

        if(verifiedNutritionText&&!actionProposal)correctedText=[guardPersonalizedMealText(correctedText,[],balanceCannotConfirmFit),verifiedNutritionText].filter(Boolean).join('\n\n');

        // A directive-only reply must not spend the allowance without a usable reply/card.
        const noUsableReply = !correctedText.trim() && !actionProposal;
        if (!correctedText.trim()) correctedText = actionProposal
          ? (language === 'es' ? 'Revisa esta propuesta. Solo se aplicarÃ¡ si la confirmas.' : 'Review this proposal. It will only be applied if you confirm it.')
          : (language === 'es' ? 'No pude completar una respuesta Ãºtil. Puedes reintentar.' : 'I could not complete a useful reply. You can retry.');
        const refundReply = emptyModelResponse || noUsableReply;
        // Generate suggestions based on assistant message content
        // Avoid English-only heuristic suggestion chips; use the localized client choices.
        const suggestions = null;
        console.log("[AICoach] Suggestions generated:", suggestions ? suggestions.length : 0);

        const preDispatchBudgetDenied=modelLed&&modelLedStatus==='budget_denied'&&providerPhaseLedger.length===0;
        const modelLedFailed=modelLed&&modelLedStatus!=='completed'&&modelLedStatus!=='needs_consent'&&!preDispatchBudgetDenied;
    const completedResult = { done: true, request_id:requestId, usage_status: refundReply||preDispatchBudgetDenied ? 'refunded' : modelLedFailed||!upstreamComplete ? 'uncertain' : 'completed', memory_save_failed: memorySaveFailed, corrected_text: correctedText, choices:modelLedChoices, discovery_options:modelLedDiscoveryOptions, action_proposal: actionProposal, suggestions, sources: webEvidence.sources, lookup_options:verifiedResponseOptions,...(verifiedFood?{verified_food:verifiedFood}:{}),...(modelLedLookupContext?{lookup_context:modelLedLookupContext}:clearModelLedLookupContext?{lookup_context:null}:{}),...(modelLedStatus==='needs_consent'&&modelLedLookupContext?{public_lookup_proposal:{request_id:requestId,context:modelLedLookupContext}}:{}),...(modelLedStatus!=='completed'?{lookup_status:modelLedStatus}:{}),...(providerPhaseLedger.length?{provider_phase_ledger:providerPhaseLedger.slice(0,3)}:{}) };
        const restaurantPool=makeRestaurantPool(modelLedLookupContext,allPersonalizedOptions(webEvidence.evidence,verifiedFood),webEvidence.sources,requestId,new Date().toISOString(),carriedRestaurantPool??undefined);
        const storedResult={...completedResult,...(restaurantPool?{private_restaurant_pool:restaurantPool}:{}),...(requestedMealServings!==undefined?{private_source_servings:requestedMealServings}:{}),...(hasVerifiedNutrition?{private_nutrition_snapshot:privateNutritionSnapshot}:{}),...(Object.keys(modelLedDiscoveryBindings).length?{discovery_option_bindings:modelLedDiscoveryBindings}:{}),...(webEvidence.privateDiscoveryDiagnostics?{private_discovery_diagnostics:webEvidence.privateDiscoveryDiagnostics}:{}),...(webEvidence.privateSourceReadDiagnostics?.length?{private_source_read_diagnostics:webEvidence.privateSourceReadDiagnostics}:{}),...(webEvidence.privateProviderDiagnostic?{private_provider_diagnostic:webEvidence.privateProviderDiagnostic}:{})};
        const outcome=refundReply||preDispatchBudgetDenied?'failed_before_stream':modelLedFailed||!upstreamComplete?'uncertain':'completed';
        let publicResult:unknown;
        if(outcome==='completed'){
          usageFinalizeAttempted=true;
          publicResult=await execution!.commit({result:{...storedResult,action_proposal:null},memories:preparedMemories,
            action_payload:preparedAction,action_success_text:correctedText,
            action_failure_text:language==='es'?'No pude preparar la propuesta para confirmarla. No se aplicó ningún cambio.':'I could not prepare the proposal for confirmation. No changes were applied.',
            mark_insights:!!(isReturningOpen&&latestInsight)});
          usagePending=false;
        }else{
          publicResult=stoppedCoachResult(await finalizeUsage(outcome),language,completedResult.usage_status);
        }
        // Only the authoritative committed result or bounded stopped control receipt is published.
        controller.enqueue(encoder.encode(coachResponseSSEFrame(publicResult)));

        controller.close();
        } catch {
          try { await finalizeUsage(!receivedProviderText && !sideEffectsStarted && providerAuditOuter.length===0 ? 'failed_before_stream' : 'uncertain'); } catch { /* Leave reservation locked for reconciliation. */ }
          controller.error(new Error('stream_failed'));
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (e: unknown) {
    try { await finalizeUsage(providerAuditOuter.length||webLookupAttempted ? 'uncertain' : 'failed_before_stream'); } catch { /* Fail closed for reconciliation. */ }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[AICoach] Unhandled error:", msg);
    return new Response(JSON.stringify({ error: "Internal Server Error", detail: "request_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});



export default handler;



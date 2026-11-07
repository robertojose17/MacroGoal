import {discoverProducts} from './recovery-discovery.ts';
import {runRecoveryWebSearch,recoveryWebSearchIdentity,auditRecoverySearchQueries,recoveryPassQuery,normalizedRecoveryQuery} from './recovery-web-search.mjs';
import {fetchGeneralSourceEvidence,selectGeneralSourceURLs} from './recovery-web-evidence.mjs';
import {sanitizeRecoverySearchFailure} from './recovery-search-diagnostics.mjs';
import {candidateEligible,distinctCandidates} from './recovery-contract.mjs';
import {createRecoveryBudget,RECOVERY_BUDGET_LIMITS,recoveryBudgetDiagnostic,recoverySourceResourceKey,recoverySourceExcluded} from './recovery-budget.mjs';

// A second, distinct query is controlled by validated results, not by the search
// model's opinion of its own leads. Every pass uses one request-local budget and
// the original durable receipt wrapper. No source URL or product is seeded.
export async function discoverGeneralProducts(input:any,deps:any) {
  const budget=createRecoveryBudget(deps.deadline),deadline=budget.deadline;
  const identity=recoveryWebSearchIdentity(input);
  const found:any={candidates:[],source_links:[],diagnostics:[]};
  const deferredWork:any[]=[],collected:any[]=[];
  const merge=(next:any)=>{found.candidates.push(...next.candidates);found.diagnostics.push(...next.diagnostics);for(const url of next.source_links)if(!found.source_links.includes(url))found.source_links.push(url);};
  const eligible=()=>found.candidates.some((row:any)=>candidateEligible(row,input.barcode));
  // A denial is not permission to reread that resource through a different
  // spelling or transport. Ignore scheme, www, query and fragment for this
  // exclusion only; ordinary evidence URL/identity validation stays unchanged.
  const deniedResources=budget.denied_resources,resourceKey=recoverySourceResourceKey;
  const sourceUncertain=(result:any,requested:number)=>{
    const observations=(result.diagnostics||[]).filter((row:any)=>row.outcome==='source_fetch_protocol_observed');
    const accounted=(result.diagnostics||[]).some((row:any)=>row.outcome==='source_fetch_protocol_accounted'&&row.complete===true);
    return !accounted || observations.length!==requested || observations.some((row:any)=>{
      // The managed fetch contract reports final 403/404 as incomplete + error.
      // This is known unavailable evidence, never accepted source content.
      if(['completed','incomplete'].includes(row.status)&&[403,404].includes(row.http_status))return false;
      return row.status!=='completed'||row.error_detected||!row.http_status_integer||
        row.http_status<200||row.http_status>599||row.http_status===null||
        (row.http_status<300&&(row.content_type!=='string'||row.content_length_capped));
    }) ||
      (result.diagnostics||[]).some((row:any)=>['proposal_output_missing','proposal_output_unsupported','proposal_output_oversize','proposal_output_malformed','proposal_output_limit_exceeded'].includes(row.outcome));
  };
  const chargeSearchOutput=(output:unknown)=>{
    if(typeof output!=='number'||!Number.isSafeInteger(output)||output<0){budget.uncertain=true;return;}
    const total=budget.search_output_tokens===null?null:budget.search_output_tokens+output;
    if(total===null||!Number.isSafeInteger(total)){
      // Individual receipts remain exact; an unrepresentable aggregate is unknown,
      // never rounded or clamped into apparently trustworthy accounting.
      budget.search_output_tokens=null;budget.uncertain=true;
    } else budget.search_output_tokens=total;
    if(output>=RECOVERY_BUDGET_LIMITS.search_output_tokens||(total!==null&&total>=RECOVERY_BUDGET_LIMITS.search_output_tokens))budget.search_output_budget_exhausted=true;
  };
  const pass=async(kind:'initial'|'fallback')=>{
    // Reserve before dispatch. Exceptions retain all reservations and receipts.
    const outputTokens=Math.min(1024,RECOVERY_BUDGET_LIMITS.search_output_tokens-(budget.search_output_tokens??RECOVERY_BUDGET_LIMITS.search_output_tokens),RECOVERY_BUDGET_LIMITS.search_output_tokens-budget.search_output_tokens_reserved);
    if(budget.provider_blocked||budget.search_output_budget_exhausted||budget.uncertain||budget.search_calls>=RECOVERY_BUDGET_LIMITS.search_calls||outputTokens<512||Date.now()>=deadline)throw Error('request_deadline');
    budget.search_calls++;budget.search_output_tokens_reserved+=outputTokens;
    const hasLabels=!!deps.readLabel&&deferredWork.some(entry=>entry.labels.length&&['matching','absent'].includes(entry.row.barcode_evidence));
    const searchDeadline=kind==='fallback'?Math.min(Date.now()+25000,deadline-(hasLabels?57000:15000)):deadline;
    const result=await runRecoveryWebSearch(input,{...deps,deadline:searchDeadline,searchOptions:{pass:kind,previousQueries:budget.observed_queries,outputTokens}});
    const output=result.diagnostics.output_tokens;
    // Search usage cannot spend the separately bounded extraction allowance.
    // Unknown or unrepresentable accounting still stops all provider work.
    chargeSearchOutput(output);
    const audits=auditRecoverySearchQueries(result.searches,input);
    const queryTrace=result.searches.map((search:any)=>{
      const codes=typeof search.query==='string'?(search.query.match(/\b\d{8,14}\b/g)||[]):[];
      const audit=audits.find((item:any)=>item.index===search.index);
      return {search:budget.search_calls-1,query_present:typeof search.query==='string',
        has_exact_barcode:codes.some((code:string)=>identity.equivalent_barcodes.includes(code)),
        has_other_barcode:codes.some((code:string)=>!identity.equivalent_barcodes.includes(code)),
        brand_hint_present:audit?.brand_hint_present??null,name_hint_present:audit?.name_hint_present??null,
        sources_observed:search.sources_observed,source_count:search.source_count,
        source_hosts:[...new Set(result.search_sources.filter((source:any)=>source.search_indices.includes(search.index)).map((source:any)=>source.host))].slice(0,10)};
    });
    found.diagnostics.push({outcome:'observable_web_search',pass:kind,...result.diagnostics,query_trace:queryTrace});
    const observed=result.searches[0]?.query,queryKey=normalizedRecoveryQuery(observed);
    const duplicate=!!queryKey&&budget.observed_queries.some((query:string)=>normalizedRecoveryQuery(query)===queryKey);
    const counters=result.diagnostics.reported_counters;
    const known=result.searches.length===1&&queryKey&&result.searches[0].sources_observed&&
      Number.isSafeInteger(result.diagnostics.output_tokens)&&
      ['tool_calls_requested','tool_calls_executed','web_search_requests'].every(name=>counters[name]===1);
    if(!known)budget.uncertain=true;
    // Check the actual fallback query before authorizing any of its page leads.
    // The provider can disregard instructions: such a response is rejected, not
    // retried, and never described as a successful alternative query.
    const audit=audits[0];
    const codeTokens=typeof observed==='string'?(observed.match(/\d+/g)||[]):[];
    const queryConforms=kind==='initial'||((identity.brand||identity.name)
      ? (!codeTokens.some((code:string)=>/^\d{8,14}$/.test(code))&&(!identity.brand||audit?.brand_hint_present)&&(!identity.name||audit?.name_hint_present))
      : codeTokens.some((code:string)=>identity.equivalent_barcodes.includes(code)&&!budget.observed_queries.some((query:string)=>((query.match(/\d+/g)||[]) as string[]).includes(code))));
    if(duplicate||!queryConforms||(kind==='fallback'&&!known)) {
      budget.uncertain=true;found.diagnostics.push({outcome:'post_validation_fallback_rejected',reason:duplicate?'repeated_query':!queryConforms?'query_plan_not_observed':'search_observability_missing'});return;
    }
    if(queryKey)budget.observed_queries.push(observed);
    budget.search_sources+=result.diagnostics.raw_result_count;
    if(budget.search_sources>RECOVERY_BUDGET_LIMITS.search_sources)throw Error('search_budget_exceeded');
    const sources=result.sources.filter((source:any)=>{
      if(budget.seen_sources.has(source.url)||recoverySourceExcluded(budget,source.url))return false;
      budget.seen_sources.add(source.url);return true;
    });
    collected.push(...sources.map((source:any)=>({...source,pass:kind})));
    const urls=sources.map((source:any)=>source.url);
    const next=await discoverProducts(input,{...deps,deadline,budget,deferredWork,deferRecovery:true,directPageLimit:kind==='initial'?3:6,generalReserveMs:kind==='initial'?40000:0,
      discoveryOutput:{urls,labels:[],annotations:urls.map((url:string)=>({type:'url_citation',url_citation:{url}}))}});
    merge(next);
  };
  const generalEvidence=budget.source_read_calls<RECOVERY_BUDGET_LIMITS.source_read_calls
      ? async(sourceDeadline:number)=>{
        // Preserve the established direct HTML -> managed text extraction path
        // after a fully completed read, once per transport. A failed/uncertain
        // direct read cannot be retried through the managed transport.
        const fresh=selectGeneralSourceURLs(rankRecoverySources(collected).filter((source:any)=>!recoverySourceExcluded(budget,source.url)&&!budget.managed_attempted_pages.has(source.url)&&
          (!budget.direct_attempted_pages.has(source.url)||budget.direct_completed_pages.has(source.url))));
        if(!fresh.length||budget.source_read_calls>=RECOVERY_BUDGET_LIMITS.source_read_calls)return {candidates:[],source_links:[],diagnostics:[{outcome:'general_source_skipped',reason:'no_unused_source_budget'}]};
        budget.source_read_calls++;budget.managed_fetches+=fresh.length;
        for(const url of fresh)budget.managed_attempted_pages.add(url);
        const result=await fetchGeneralSourceEvidence(input,fresh,{...deps,deadline:sourceDeadline});
        for(const row of result.diagnostics||[]) {
          if(row.outcome==='source_fetch_protocol_observed'&&'http_status' in row&&'requested_source_ordinal' in row&&
            [403,404].includes(row.http_status)&&
            typeof row.requested_source_ordinal==='number'&&Number.isInteger(row.requested_source_ordinal)&&row.requested_source_ordinal>=1&&row.requested_source_ordinal<=fresh.length)
            deniedResources.add(resourceKey(fresh[row.requested_source_ordinal-1]));
        }
        result.candidates=result.candidates.filter((row:any)=>!recoverySourceExcluded(budget,row.provenance.url));
        result.source_links=result.source_links.filter((url:string)=>!recoverySourceExcluded(budget,url));
        if(sourceUncertain(result,fresh.length))budget.uncertain=true;
        return result;
      }:undefined;
  await pass('initial');
  if(!eligible()) {
    const nextQuery=recoveryPassQuery(input,'fallback',budget.observed_queries);
    const pendingLabels=!!deps.readLabel&&deferredWork.some(entry=>entry.labels.length&&['matching','absent'].includes(entry.row.barcode_evidence));
    const reason=budget.search_output_budget_exhausted||Math.min(RECOVERY_BUDGET_LIMITS.search_output_tokens-(budget.search_output_tokens??RECOVERY_BUDGET_LIMITS.search_output_tokens),RECOVERY_BUDGET_LIMITS.search_output_tokens-budget.search_output_tokens_reserved)<512?'search_output_budget_exhausted':budget.provider_blocked?'provider_budget_blocked':budget.uncertain?'provider_or_transport_uncertain':budget.evidence_conflict?'observed_evidence_conflict':budget.unresolved_partial_evidence?'unresolved_partial_evidence':
      deadline-Date.now()<(pendingLabels?62000:30000)?'request_deadline':!nextQuery?'no_distinct_query':
      budget.search_calls>=RECOVERY_BUDGET_LIMITS.search_calls||budget.search_sources>=RECOVERY_BUDGET_LIMITS.search_sources||
      (budget.direct_product_pages>=RECOVERY_BUDGET_LIMITS.direct_product_pages&&budget.source_read_calls>=RECOVERY_BUDGET_LIMITS.source_read_calls)?'validation_budget_exhausted':null;
    if(reason)found.diagnostics.push({outcome:'post_validation_fallback_skipped',reason});
    else {
      found.diagnostics.push({outcome:'post_validation_fallback_started',reason:'zero_eligible_candidates'});
      try {await pass('fallback');}
      catch(error) {
        budget.uncertain=true;
        const diagnostic=sanitizeRecoverySearchFailure(error,'fallback_search');
        if(diagnostic.observed_output_tokens!==null)chargeSearchOutput(diagnostic.observed_output_tokens);
        found.diagnostics.push({outcome:'post_validation_fallback_unavailable',...diagnostic});
      }
    }
  }
  // Finish the shared direct queue without rereading pages, then consume the
  // strongest bound labels before the single optional generic reader against
  // sources from BOTH observed queries, then weaker gallery fallbacks. Labels
  // retain their original work records, contradictions and request-wide budget.
  if(!eligible()) {
    const urls=collected.filter(source=>!recoverySourceExcluded(budget,source.url)).map(source=>source.url);
    merge(await discoverProducts(input,{...deps,deadline,budget,deferredWork,generalEvidence,generalReserveMs:40000,
      providerBlocked:budget.uncertain||budget.provider_blocked||budget.evidence_conflict||budget.unresolved_partial_evidence,
      discoveryOutput:{urls,labels:[],annotations:urls.map(url=>({type:'url_citation',url_citation:{url}}))}}));
  }
  found.candidates=distinctCandidates([...found.candidates.filter((row:any)=>candidateEligible(row,input.barcode)),...found.candidates.filter((row:any)=>!candidateEligible(row,input.barcode))]);
  found.source_links=found.source_links.slice(0,9);
  found.diagnostics.push(recoveryBudgetDiagnostic(budget));
  return found;
}

// Ranking is only a selection hint, never evidence or a fetch authorization.
// Prefer product-shaped paths and cover both passes before a third same-pass
// source. The managed reader applies its existing host diversity and URL guard.
export function rankRecoverySources(sources:any[]) {
  const rank=(source:any)=>/^\/(?:p|ip|products?)\/.+/.test(new URL(source.url).pathname)?0:1;
  const initial=sources.filter(s=>s.pass==='initial').sort((a,b)=>rank(a)-rank(b));
  const fallback=sources.filter(s=>s.pass==='fallback').sort((a,b)=>rank(a)-rank(b));
  const result:any[]=[];
  for(let i=0;i<Math.max(initial.length,fallback.length);i++) {
    if(fallback[i])result.push(fallback[i]);
    if(initial[i])result.push(initial[i]);
  }
  return result.slice(0,20);
}

// Request-local accounting only. No provider call, persistent state or URL policy.
// The durable receipt wrapper remains the authority for the 13-receipt session cap.
export const RECOVERY_BUDGET_LIMITS = Object.freeze({
  search_calls: 2, search_output_tokens: 2048, search_sources: 20,
  direct_product_pages: 6, direct_fragments: 8, managed_fetches: 3,
  source_read_calls: 1, label_attempts: 2, deadline_ms: 125000,
});
/** @typedef {{
 * deadline: number, search_calls: number, search_output_tokens: number|null, search_output_tokens_reserved: number, provider_blocked: boolean, search_output_budget_exhausted: boolean,
 * search_sources: number, direct_product_pages: number, direct_fragments: number,
 * managed_fetches: number, source_read_calls: number, label_attempts: number,
 * manufacturer_attempted: boolean, direct_attempted_pages: Set<string>,
 * direct_completed_pages: Set<string>, managed_attempted_pages: Set<string>,
 * source_chains: Map<string, Set<string>>, denied_resources: Set<string>, attempted_labels: Set<string>, seen_sources: Set<string>, observed_queries: string[],
 * uncertain: boolean, evidence_conflict: boolean, unresolved_partial_evidence: boolean
 * }} RecoveryBudget */
/** @returns {RecoveryBudget} */
export function createRecoveryBudget(deadline = Date.now() + RECOVERY_BUDGET_LIMITS.deadline_ms) {
  return { deadline: Math.min(deadline, Date.now() + RECOVERY_BUDGET_LIMITS.deadline_ms),
    search_calls: 0, search_output_tokens: 0, search_output_tokens_reserved: 0, provider_blocked: false, search_output_budget_exhausted: false, search_sources: 0,
    direct_product_pages: 0, direct_fragments: 0, managed_fetches: 0,
    source_read_calls: 0, label_attempts: 0, manufacturer_attempted: false,
    direct_attempted_pages: new Set(), direct_completed_pages: new Set(), managed_attempted_pages: new Set(),
    source_chains: new Map(), denied_resources: new Set(), attempted_labels: new Set(), seen_sources: new Set(),
    observed_queries: [], uncertain: false, evidence_conflict: false, unresolved_partial_evidence: false };
}
export function recoveryBudgetDiagnostic(budget) {
  return { outcome: 'recovery_budget', search_calls: budget.search_calls,
    search_output_tokens_reserved: budget.search_output_tokens_reserved, search_output_tokens_observed: budget.search_output_tokens, provider_budget_blocked: budget.provider_blocked, search_output_budget_exhausted: budget.search_output_budget_exhausted, search_sources: budget.search_sources,
    direct_product_pages: budget.direct_product_pages, direct_fragments: budget.direct_fragments,
    managed_fetches_reserved: budget.managed_fetches, source_read_calls: budget.source_read_calls,
    label_attempts: budget.label_attempts, provider_or_transport_uncertain: budget.uncertain };
}

// Exclusion only: never use this lossy key as an evidence identity or permission.
export function recoverySourceResourceKey(value) {
  const url=new URL(value);
  const path=url.pathname.replace(/%[0-9a-f]{2}/gi,escape=>{
    const char=String.fromCharCode(parseInt(escape.slice(1),16));
    return /^[A-Za-z0-9._~-]$/.test(char)?char:escape.toUpperCase();
  });
  return url.hostname.replace(/^www\./,'')+path.replace(/\/+$/,'');
}

// A failed fragment invalidates its dependent product evidence chain, but never
// an unrelated discovered product. Closure also handles shared dependencies.
export function recoverySourceExcluded(budget, value) {
  const excluded=new Set(budget.denied_resources);
  let changed=true;
  while(changed) {
    changed=false;
    for(const chain of budget.source_chains?.values() || []) {
      if([...chain].some(key=>excluded.has(key))) for(const key of chain) {
        if(!excluded.has(key)){excluded.add(key);changed=true;}
      }
    }
  }
  return excluded.has(recoverySourceResourceKey(value));
}
export function recoverySourceDependency(budget, root, resource) {
  const key=recoverySourceResourceKey(root);
  if(!budget.source_chains.has(key))budget.source_chains.set(key,new Set([key]));
  budget.source_chains.get(key).add(recoverySourceResourceKey(resource));
}

// Shared by the provider boundary and public recovery response. Never copy raw
// exceptions, stack traces, provider bodies, queries, or unrecognized fields.
const reasons = new Set(['invalid_barcode', 'invalid_search_identity', 'invalid_search_pass', 'request_deadline', 'receipt_store_unavailable', 'receipt_limit', 'receipt_body_aborted', 'unexpected_receipt_model', 'unexpected_receipt_tool', 'search_action_invalid', 'search_budget_exceeded', 'search_citation_invalid', 'search_citation_limit', 'search_content_invalid', 'search_content_limit', 'search_content_type', 'search_counters_inconsistent', 'search_counters_invalid', 'search_dependencies_required', 'search_http_error', 'search_incomplete', 'search_json_invalid', 'search_message_invalid', 'search_not_observed', 'search_output_budget_invalid', 'search_output_invalid', 'search_output_limit', 'search_query_unavailable', 'search_reasoning_incomplete', 'search_response_invalid', 'search_response_too_large', 'search_result_limit', 'search_source_invalid', 'search_sources_invalid', 'search_text_limit', 'search_timeout', 'search_tool_id_invalid', 'search_tool_incomplete', 'search_unavailable', 'search_unexpected_output', 'search_usage_invalid']);
const stages = new Set(['initial_search', 'fallback_search']);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function recoverySearchAccounting(requested, observed) {
  const requestedTokens = Number.isSafeInteger(requested) && requested >= 512 && requested <= 1024 ? requested : null;
  const observedTokens = count(observed);
  return { requested_output_tokens: requestedTokens, observed_output_tokens: observedTokens,
    output_token_overrun: requestedTokens !== null && observedTokens !== null ? Math.max(0, observedTokens - requestedTokens) : null };
}
export function sanitizeRecoverySearchFailure(error, stage = 'initial_search') {
  const reason = reasons.has(error?.message) ? error.message : 'search_unavailable';
  return { stage: stages.has(stage) ? stage : 'initial_search', reason,
    ...recoverySearchAccounting(error?.diagnostics?.requested_output_tokens, error?.diagnostics?.observed_output_tokens) };
}

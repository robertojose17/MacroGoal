# Supplemental physical-label evidence

Scope: barcode recovery_photos only, after the established two-read macro gate succeeds. The original macro prompts and gate remain unchanged. This does not alter legacy photo requests or online source-label reads.

Up to two additional independent openai/gpt-6.1-sol reads run through OpenRouter only, within 30 seconds and the existing recovery deadline. The supplied label and front images are reused. Two matching reads retain every readable nutrient row in the selected declared serving column, including printed units, qualified amounts and %DV. Missing is not zero; no amount is derived from %DV. Missing printed calorie units remain null. Amounts embedded within labels (Includes 6g Added Sugars) are supported without accepting unrelated text.

The extra reads are best-effort. Failure, timeout, disagreement, oversized evidence or persistence conflict must not prevent review of valid macros. Model agreement is evidence, not proof of correct OCR. Multiple-column coverage is limited to the selected serving column. Ingredients/allergens outside the nutrition panel are not extracted.

Evidence is stored only under owner-bound food_submissions.extracted_data.supplemental_label[photo_revision], with raw independent readings, agreed rows, provenance, time and revision. Writes require pending status, exact owner, revision and JSON CAS; existing receipts/revisions are preserved. Confirmation links food_item_id and appends confirmation metadata without replacing evidence. No micronutrient evidence is automatically promoted into canonical food_items columns or daily analytics. Existing auxiliary fields are cleared by the established confirmation SQL to avoid mixing old serving/source values.

Validation: the existing product photo produced 17 agreed rows in two actual provider requests at incremental cost $0.03862. This is an observation, not a fixed per-label price or guaranteed account cost cap. There can be up to two photo attempts. In addition to the existing macro calls, each eligible attempt can incur two extra requests. The diagnostic was removed and the original baseline restored before permanent activation was prepared.

Run offline tests:

    node --test tests/label-supplemental/*.test.mjs

16 tests include actual independent output replay, zeros/missing/qualifiers, mismatched column/serving, intercalated labels, bounded calls/timeouts, claim concurrency, private CAS and confirmation contract. Historical diagnostic harness is sanitized test-only code, never imported by runtime. The SQL fixture is a read-only captured contract, not a migration.

Deployment: three runtime files change. No temporary probe or startup hook belongs in the deployment. GitHub publication and live Supabase deployment are distinct steps. Live integration/persistence is not implied by successful isolated OCR tests. A local full Deno semantic check was blocked by unavailable dependency resolution; TypeScript syntax transpilation passed.

Persistence validation can use a synthetic pending owner-bound submission inside a database transaction, perform the same guarded JSON append, assert revision preservation, and ROLLBACK. It must not call provider APIs or create foods. This validates SQL storage semantics, not PostgREST/runtime concurrency; a real authorized app test is still needed for end-to-end persistence. Runtime rollback restores the exact previous function bundle and does not delete captured evidence; old code preserves unknown extracted_data fields. No destructive cleanup is required.

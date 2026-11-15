# Nutrient evidence on existing diary flow: design, not installed

## Scope

Keep `log_food` and its callers working unchanged. Do not create a second food-log implementation, overload its PostgREST signature, infer historical zeros, or require evidence for the diary to save. Initially integrate only the ordinary manual diary form after its source is reviewed; do not claim coverage of saved meals, copies, AI, barcode imports or other writers.

Inspection of `app/my-foods-create.tsx` found blank string state, optional prefills, and `parseFloat(value) || 0` before storage. Therefore nonblank text alone does not prove deliberate manual entry: prefills must remain distinguishable from user edits. Snapshot raw field presence and source BEFORE conversion; permit an explicit typed zero, reject malformed/negative/nonfinite input for evidence. Do not reinterpret the existing diary payload silently.

## Proposed evidence registration, not a new food write

After the existing `log_food` returns a confirmed item ID, an own-actor evidence RPC could lock/read that same item through its meal owner and compare exact nutrition values, quantity, grams, portion basis and scheduling state against the pending request. Store only per-nutrient supplied/unknown status, exact value binding, statement version and timestamps; no raw label photo, free text, diagnosis or token. Source means user-supplied, not lab-verified or clinically reviewed.

The evidence RPC never creates food, never updates goals, and never retries `log_food`. A failed or lost evidence response leaves the diary entry intact and nutrition provenance unknown. Retry must use the identical evidence request ID/payload and resolve idempotently. A different payload under the same request ID must conflict. Owner is `auth.uid()`, not trusted request data. Private storage has no direct client writes; RPC grants authenticated only and no service-key exposure.

## Consistency that must be resolved before installation

Evidence write is atomic with its own item comparison, but NOT with the earlier food write. The reader must compare against current item state and include evidence state in the same atomic snapshot/readiness fingerprint. Any mismatch means unknown, not fallback to an old assertion. Revocation must be an explicit own-actor operation and invalidate pending review fingerprints.

The current meal item schema has no reliable update revision. Content-hash comparison catches changed values but cannot establish that no intervening edit changed and later restored the same values (ABA). Do not present it as revision-bound. Before allowing evidence to authorize zeros, choose and verify a durable edit-revision mechanism across all edit paths, or explicitly retain evidence as a historical assertion with a narrower non-authorizing diagnostic use. Do not add a global trigger or rely on PostgreSQL xmin as permanent clinical provenance without review. No such mechanism is implemented by this design.

Account switches, unknown food-write outcome, missing returned item ID, mismatched row values, changed portion, revoked evidence and incompatible statement versions all withhold evidence. Recovering food-write outcomes is a separate existing concern and must not be solved by duplicate posting.

## QA and rollout gate

Required cases: blank versus typed zero versus prefilled zero; partial nutrient set; exact item/owner match; account switch; concurrent item edit; duplicate same request; changed request replay; lost response; revocation; rollback; edits that restore old numbers; legacy readers and writers still work. Use only authorized own-account synthetic data with complete cleanup or supported transaction mechanisms. Backend execution restrictions remain in force. This file creates no table, RPC, UI, trigger, policy or active recommendation.

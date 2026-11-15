# Logged nutrition evidence candidate

Source only. SQL and test tail are **prepared, not compiled or executed**. Nothing
is installed, published, enabled or added to the user's diary by this work.

## Narrow contract

This records the user's explicit per-nutrient declaration after an existing
`log_food` call has returned its item ID. It does not change `log_food`, its ACL,
food amounts, nutrient values, subscriptions, or recommendation authority.
No legacy row is backfilled. A legacy NULL revision cannot register evidence.

`tdee_read_logged_nutrition_evidence_v1(p_item_id uuid, p_request_id uuid DEFAULT NULL)`
returns owner-scoped state with current item revision, exact `expected` binding,
latest `evidenceVersion`, `evidence` or null, and an optional historical `receipt`.
`expected` contains all five stored nutrient values, the portion/food identity and
consumed-status fields, `logged_at`, `meal_id`, and the meal's local date.

`tdee_register_logged_nutrition_evidence_v1(p_request jsonb)` accepts exactly:

```
{version:'user-entered-v1', kind:'register', requestId, itemId, revision,
 expectedEvidenceVersion, expected, declaredFields:['calories', ...]}
```

Each declared field must be an existing nonnegative numeric value. Numeric zero
is allowed only as an explicit declaration; unknown/null is not inferred as zero.
Undeclared fields remain unknown to provenance consumers even when a stored value
is present. Do not preselect declarations based on legacy defaults, saved foods,
prefilled fields, or a successful log. This is self-report, not verified label
truth or professional nutrition review. There are no `reviewed` booleans.

Revocation is an explicit request to the same mutation RPC:

```
{version:'user-entered-v1', kind:'revoke', requestId, itemId,
 expectedEvidenceVersion}
```

Revocation may occur after the original binding becomes stale. It retains that
old binding in its event and never returns active evidence. Same request ID with
different payload is rejected. Exact replay returns the historical receipt AND
the current state; replaying registration after revocation cannot reactivate it.

## Consumer shape

Current evidence is exactly:

```
{version:'user-entered-v1',ownerId,itemId,revision,status:'active',
 declaredFields:[...],values:{calories,protein,carbs,fats,fiber}}
```

The five values are the actual stored values, not estimates. The private latest
event must still match owner, item revision, all values and portion/date binding.
The future same-statement SQL source projection must apply these checks itself;
a separately fetched public read response does not upgrade snapshot authority.
Existing consumer validation may reject any NULL nutrient conservatively, even
if another declared nutrient is usable. Do not replace unknown values to satisfy
that consumer. Snapshot marker integration is not implemented by this candidate.

## Access and concurrency

The private append-event table has RLS and no public, anon, authenticated or
service-role table/schema access. Two narrow SECURITY DEFINER RPCs are needed to
operate it, with closed search paths, explicit authenticated nonanonymous UID,
and an own meal join. No caller-supplied owner exists. No clinical source or
service-role write endpoint is created. New object names intentionally collide
with errors rather than replacing existing functions silently.

Registration requires READ COMMITTED. It discovers the own meal, locks that meal
FOR SHARE then only the item FOR UPDATE, rechecks the link, and compares exact
revision and values before recording. This adds row locks, not global locks.
Existing writers' meal/item lock order and trigger behavior must be reviewed
before rollout; deadlocks/timeouts remain possible and are not a successful save.
Each item serializes event versions. Unique owner/request ID also resolves
cross-item concurrent request reuse. There are no external effects in the RPC.

A read is a statement snapshot, not perpetual validity or commit-time
serialization with all future writes. Item revisions plus exact meal ownership
and date rechecks invalidate stale evidence at consumption. Changes followed by
restoration of meal metadata are not historical revocations. Explicit revocation
is a new latest event. Administrative table mutations are outside this runtime
contract and must not be used to remove revocations and revive older declarations.

## Recovery and rollout gates

Keep request ID and exact payload for a retry/read after an uncertain registration
response. Read receipt/current state; do not create a new request automatically,
and NEVER call `log_food` again to recover provenance. Missing/deleted/foreign item
returns unavailable, not a fabricated success. A source error remains unknown.

The revision candidate is a prerequisite and must be validated together with this
candidate, the eventual source projection and the real input path. Do not install
piecemeal. DDL takes transient locks even though runtime serialization is local.
No backend runner or SQL was executed. The supplied rollback tail requires an
explicit authorized own-account fixture and a reviewed authenticated harness.
It does not create data automatically. Its final notes list unimplemented tests.

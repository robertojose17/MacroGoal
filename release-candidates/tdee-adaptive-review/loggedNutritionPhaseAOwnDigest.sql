-- READ ONLY template. Run separately BEFORE and AFTER the owner-only rollback QA.
-- Set test.fixture_owner independently in each invocation; no identifiers here.
-- Returns hashes/counts only, never diary values or account identifiers.
-- Phase A must exist; this is NOT the pre-install baseline query.
WITH actor AS (
 SELECT nullif(current_setting('test.fixture_owner',true),'')::uuid AS id
), own_meals AS (
 SELECT m.* FROM public.meals m JOIN actor a ON m.user_id=a.id
), own_items AS (
 SELECT i.* FROM public.meal_items i JOIN own_meals m ON m.id=i.meal_id
), own_evidence AS (
 SELECT e.* FROM macrogoal_logged_nutrition_private.evidence_events e
 JOIN actor a ON e.owner_id=a.id
)
SELECT (SELECT id IS NOT NULL FROM actor) AS owner_parameter_present,
 (SELECT count(*) FROM own_meals) AS meal_count,
 (SELECT count(*) FROM own_items) AS item_count,
 (SELECT count(*) FROM own_evidence) AS evidence_count,
 (SELECT md5(string_agg((to_jsonb(i)-'nutrition_revision')::text,E'\n' ORDER BY i.id)) FROM own_items i) AS legacy_items_md5,
 (SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]'::jsonb)::text,'UTF8')),'hex') FROM own_meals m) AS meals_digest,
 (SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb)::text,'UTF8')),'hex') FROM own_items i) AS items_digest,
 (SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.item_id,e.event_version),'[]'::jsonb)::text,'UTF8')),'hex') FROM own_evidence e) AS evidence_digest;
-- owner_parameter_present=false invalidates the result: an empty hash without
-- an owner is never proof of restoration. Legitimate concurrent edits may change
-- hashes; investigate rather than resetting or overwriting user data.

-- Stable registry expiry for until-revoked test eligibility only.
-- Purchase evidence still expires within 30 seconds and revocation is rechecked.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='3s';
DO $patch$ DECLARE body text; BEGIN
SELECT pg_get_functiondef('entitlement_cache_candidate.qa_scope(uuid)'::regprocedure) INTO body;
IF md5(body)<>'edcd9a47f9f879966edd05c676f20650' THEN RAISE EXCEPTION 'registry_helper_changed'; END IF;
IF (length(body)-length(replace(body,$old$now_at + interval '5 minutes'$old$,'')))/length($old$now_at + interval '5 minutes'$old$)<>1 THEN RAISE EXCEPTION 'registry_anchor_changed'; END IF;
EXECUTE replace(body,$old$now_at + interval '5 minutes'$old$,$new$timestamptz '9999-12-31 00:00:00+00'$new$);
SELECT pg_get_functiondef('entitlement_cache_candidate.tester_status(uuid)'::regprocedure) INTO body;
IF md5(body)<>'d6750c6cfc2f3685ede10388503faab3' THEN RAISE EXCEPTION 'registry_helper_changed'; END IF;
IF (length(body)-length(replace(body,$old$now_at+interval '5 minutes'$old$,'')))/length($old$now_at+interval '5 minutes'$old$)<>1 THEN RAISE EXCEPTION 'registry_anchor_changed'; END IF;
EXECUTE replace(body,$old$now_at+interval '5 minutes'$old$,$new$timestamptz '9999-12-31 00:00:00+00'$new$);
END $patch$;
COMMIT;

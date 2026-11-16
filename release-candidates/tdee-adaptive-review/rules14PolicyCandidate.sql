-- SOURCE ONLY. Product rule configuration, NOT a clinical review or statistical validation.
-- Requires rules14StorageCandidate first. No rows, activation or writer grants.
CREATE TABLE tdee_rules14_private.policy_versions(
 version text NOT NULL CHECK(length(version) BETWEEN 1 AND 120),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 decision text NOT NULL CHECK(decision IN ('enabled','revoked')),
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object'),
 canonical_content text NOT NULL CHECK(octet_length(canonical_content)<=16384),
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
 PRIMARY KEY(version,revision),
 CHECK(canonical_content::jsonb=document),
 CHECK(encode(sha256(convert_to(canonical_content,'UTF8')),'hex')=digest),
 CHECK(NOT(document ?| ARRAY['version','revision','digest','enabled','expires_at','reviewed','clinicallyValidated','statisticalConfidenceClaim'])),
 CHECK(expires_at>recorded_at)
);
ALTER TABLE tdee_rules14_private.policy_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tdee_rules14_private.policy_versions FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rules14_private.guard_policy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE head bigint;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'rules14_policy_append_only';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rules14_policy:'||NEW.version,0));
 SELECT max(revision) INTO head FROM tdee_rules14_private.policy_versions WHERE version=NEW.version;
 IF NEW.revision<>coalesce(head,0)+1 THEN RAISE EXCEPTION 'rules14_policy_revision_conflict';END IF;
 NEW.recorded_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER rules14_policy_immutable BEFORE INSERT OR UPDATE OR DELETE ON tdee_rules14_private.policy_versions
FOR EACH ROW EXECUTE FUNCTION tdee_rules14_private.guard_policy();
REVOKE ALL ON FUNCTION tdee_rules14_private.guard_policy() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rules14_private.policy_envelope(p tdee_rules14_private.policy_versions) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT (p).document||jsonb_build_object('version',(p).version,'revision',(p).revision,'digest',(p).digest,'enabled',(p).decision='enabled','expires_at',(p).expires_at)
$$;
REVOKE ALL ON FUNCTION tdee_rules14_private.policy_envelope(tdee_rules14_private.policy_versions) FROM PUBLIC,anon,authenticated,service_role;

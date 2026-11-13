-- LOCAL REVIEW CANDIDATE ONLY. NOT INSTALLED. NO ACCEPTANCE OR PUBLIC API.
-- Installation blockers: independent review, UUID-only enrollment/backfill approval,
-- actual multi-session source/cascade/legacy tests, complete writer inventory.
-- No policy, eligibility or clinical capability is asserted by this schema.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
-- Do not install while ordinary API roles retain the row-trigger bypass.
-- Apply the separately reviewed privilege change only after explicit approval.
DO $preflight$
DECLARE relation text; role_name text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['public.users','public.goals','public.meals','public.meal_items',
  'public.check_ins','public.trackers','public.tracker_entries','public.subscriptions',
  'macrogoal_observed_private.settings'] LOOP
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(role_name,relation,'TRUNCATE') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='source_barrier_truncate_privilege';
   END IF;
  END LOOP;
 END LOOP;
END $preflight$;
CREATE SCHEMA macrogoal_source_barrier_private;
REVOKE ALL ON SCHEMA macrogoal_source_barrier_private FROM PUBLIC,anon,authenticated,service_role;

-- No FK: a profile cascade must not acquire R before finishing source deletes.
-- Deferred sorted flush removes R for deleted profiles; no committed tombstone
-- is intended. Explicit profile-enrollment events reset epoch only at flush.
CREATE TABLE macrogoal_source_barrier_private.owner_revisions (
  owner_id uuid PRIMARY KEY,
  epoch uuid NOT NULL DEFAULT gen_random_uuid(),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
ALTER TABLE macrogoal_source_barrier_private.owner_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE macrogoal_source_barrier_private.owner_revisions FROM PUBLIC,anon,authenticated,service_role;

-- Transaction-private workset: no FK, no health values, no cross-transaction key
-- conflict. Deferred flush deletes every row before commit; rollback removes it.
CREATE TABLE macrogoal_source_barrier_private.pending_owners (
  transaction_id xid8 NOT NULL,
  owner_id uuid NOT NULL,
  reset_epoch boolean NOT NULL DEFAULT false,
  PRIMARY KEY(transaction_id,owner_id)
);
ALTER TABLE macrogoal_source_barrier_private.pending_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE macrogoal_source_barrier_private.pending_owners FROM PUBLIC,anon,authenticated,service_role;

-- No public execute grant. Trigger-only use; callers cannot choose another owner.
CREATE FUNCTION macrogoal_source_barrier_private.bump_owners(p_owners uuid[])
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO pg_catalog,pg_temp AS $fn$
DECLARE actor uuid; owner_lock integer;
BEGIN
  -- Every writer must refresh visibility after waiting for another owner flush.
  -- The helper guard alone cannot protect direct/legacy source transactions.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE='25000',MESSAGE='source_barrier_isolation_unsupported'; END IF;
  -- Row locks alone cannot fence an owner whose profile/revision does not yet
  -- exist. Every source/lifecycle flush participates in this reserved namespace.
  -- Acquire actual hash keys globally sorted before any R lock; collisions only
  -- serialize unrelated owners, never reverse key order or share revision data.
  FOR owner_lock IN SELECT DISTINCT hashtext(x::text) FROM unnest(p_owners) x
    WHERE x IS NOT NULL ORDER BY hashtext(x::text) LOOP
    PERFORM pg_advisory_xact_lock(1413760325,owner_lock);
  END LOOP;
  FOR actor IN SELECT DISTINCT x FROM unnest(p_owners) x WHERE x IS NOT NULL ORDER BY x LOOP
    IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor) THEN
      -- Cleanup participates in the SAME sorted R order after all cascades.
      -- Recheck in the DELETE's own snapshot: a concurrent enrollment may have
      -- committed since the preceding IF. Never remove its newly created R.
      DELETE FROM macrogoal_source_barrier_private.owner_revisions WHERE owner_id=actor
        AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor);
    ELSIF EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners
      WHERE transaction_id=pg_current_xact_id() AND owner_id=actor AND reset_epoch) THEN
      -- Only an explicit users INSERT/identity-change event can enroll/reset.
      -- Delete+reinsert same UUID therefore invalidates the original epoch.
      INSERT INTO macrogoal_source_barrier_private.owner_revisions(owner_id,epoch,revision)
      VALUES(actor,gen_random_uuid(),1)
      ON CONFLICT(owner_id) DO UPDATE SET epoch=excluded.epoch,revision=excluded.revision;
    ELSE
      UPDATE macrogoal_source_barrier_private.owner_revisions SET revision=revision+1 WHERE owner_id=actor;
      IF NOT FOUND THEN
        -- A concurrently deleted profile is not a missing live enrollment.
        IF EXISTS(SELECT 1 FROM public.users WHERE id=actor) THEN
          RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='source_barrier_revision_missing';
        END IF;
      END IF;
    END IF;
  END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION macrogoal_source_barrier_private.bump_owners(uuid[]) FROM PUBLIC,anon,authenticated,service_role;

-- One effective flush per normal transaction: first deferred event sees the
-- complete workset, later queued callbacks see it empty. No other deferred source
-- writer is currently verified; future ones invalidate this protocol review.
CREATE FUNCTION macrogoal_source_barrier_private.flush_pending_owners()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO pg_catalog,pg_temp AS $fn$
DECLARE owners uuid[]; xid xid8:=pg_current_xact_id();
BEGIN
 IF TG_TABLE_SCHEMA<>'macrogoal_source_barrier_private' OR TG_TABLE_NAME<>'pending_owners'
   OR TG_WHEN<>'AFTER' OR TG_OP<>'INSERT' THEN RAISE EXCEPTION 'source_barrier_flush_contract'; END IF;
 SELECT array_agg(owner_id ORDER BY owner_id) INTO owners
 FROM macrogoal_source_barrier_private.pending_owners WHERE transaction_id=xid;
 IF owners IS NOT NULL THEN
   PERFORM macrogoal_source_barrier_private.bump_owners(owners);
   DELETE FROM macrogoal_source_barrier_private.pending_owners WHERE transaction_id=xid;
 END IF;
 RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION macrogoal_source_barrier_private.flush_pending_owners() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER flush_source_owners AFTER INSERT ON macrogoal_source_barrier_private.pending_owners
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION macrogoal_source_barrier_private.flush_pending_owners();

CREATE FUNCTION macrogoal_source_barrier_private.after_source_change()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO pg_catalog,pg_temp AS $fn$
DECLARE rows jsonb[]; item jsonb; owners uuid[]:='{}'; actor uuid; parent_owner uuid; raw_owner text;
BEGIN
  IF TG_WHEN <> 'AFTER' OR TG_LEVEL <> 'ROW' OR TG_OP NOT IN ('INSERT','UPDATE','DELETE') THEN
    RAISE EXCEPTION 'source_barrier_trigger_contract';
  END IF;
  IF NOT ((TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME IN
    ('users','goals','meals','meal_items','check_ins','trackers','tracker_entries','subscriptions'))
    OR (TG_TABLE_SCHEMA='macrogoal_observed_private' AND TG_TABLE_NAME='settings')) THEN
    RAISE EXCEPTION 'source_barrier_relation_contract';
  END IF;
  rows:=CASE TG_OP WHEN 'INSERT' THEN ARRAY[to_jsonb(NEW)] WHEN 'DELETE' THEN ARRAY[to_jsonb(OLD)]
    ELSE ARRAY[to_jsonb(OLD),to_jsonb(NEW)] END;
  FOREACH item IN ARRAY rows LOOP
    IF TG_TABLE_NAME='meal_items' THEN
      SELECT m.user_id INTO parent_owner FROM public.meals m WHERE m.id=(item->>'meal_id')::uuid;
      -- During parent deletion, the parent's OLD owner trigger supplies the bump.
      -- An invalid direct orphan insert/update still fails its existing FK.
      IF parent_owner IS NOT NULL THEN owners:=array_append(owners,parent_owner); END IF;
    ELSE
      raw_owner:=item->>(CASE WHEN TG_TABLE_NAME='users' THEN 'id' ELSE 'user_id' END);
      IF TG_TABLE_NAME='subscriptions' THEN
        -- Snapshot compares user_id text to canonical UUID text. Invalid or
        -- noncanonical strings cannot contribute entitlement to that snapshot.
        IF raw_owner IS NULL OR raw_owner !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN CONTINUE; END IF;
      END IF;
      actor:=raw_owner::uuid;
      IF actor IS NULL THEN RAISE EXCEPTION 'source_barrier_owner_missing'; END IF;
      owners:=array_append(owners,actor);
      IF TG_TABLE_NAME='tracker_entries' THEN
        SELECT t.user_id INTO parent_owner FROM public.trackers t WHERE t.id=(item->>'tracker_id')::uuid;
        IF parent_owner IS NOT NULL THEN owners:=array_append(owners,parent_owner); END IF;
      END IF;
    END IF;
  END LOOP;
  INSERT INTO macrogoal_source_barrier_private.pending_owners(transaction_id,owner_id)
  SELECT pg_current_xact_id(),x FROM (SELECT DISTINCT unnest(owners) AS x) owned WHERE x IS NOT NULL
  ON CONFLICT(transaction_id,owner_id) DO NOTHING;
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION macrogoal_source_barrier_private.after_source_change() FROM PUBLIC,anon,authenticated,service_role;

-- Enrollment event is immediate; it only queues a reset, never locks R.
CREATE FUNCTION macrogoal_source_barrier_private.enroll_new_profile()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO pg_catalog,pg_temp AS $fn$
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'users' OR TG_WHEN<>'AFTER' OR TG_OP NOT IN ('INSERT','UPDATE') THEN
   RAISE EXCEPTION 'source_barrier_enrollment_contract'; END IF;
 IF TG_OP='UPDATE' AND OLD.id IS NOT DISTINCT FROM NEW.id THEN RETURN NULL; END IF;
 INSERT INTO macrogoal_source_barrier_private.pending_owners AS q(transaction_id,owner_id,reset_epoch)
 VALUES(pg_current_xact_id(),NEW.id,true)
 ON CONFLICT(transaction_id,owner_id) DO UPDATE SET reset_epoch=true;
 RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION macrogoal_source_barrier_private.enroll_new_profile() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zzy_tdee_source_enrollment AFTER INSERT OR UPDATE OF id ON public.users FOR EACH ROW EXECUTE FUNCTION macrogoal_source_barrier_private.enroll_new_profile();

-- Source triggers immediately enqueue ownership; only queue flush bumps R at transaction end.
-- Otherwise log_food can acquire R after meal then wait on food FK F, while a
-- concurrent foods deletion holds F and waits on R: a new legacy deadlock.
-- Explicit SET CONSTRAINTS IMMEDIATE or other deferred writers can reintroduce
-- R-before-source ordering and remain unverified installation gates.
-- Parent triggers cover ownership moves and deletions even when cascading child
-- triggers cannot see their old parent. No nutrition catalogue edit is read by
-- snapshot v1; foods DELETE cascades into items and is covered through meals.
CREATE TRIGGER zzz_tdee_source_revision AFTER INSERT OR UPDATE OR DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION macrogoal_source_barrier_private.after_source_change();
CREATE TRIGGER zzz_tdee_source_revision AFTER INSERT OR UPDATE OR DELETE ON public.goals FOR EACH ROW EXECUTE FUNCTION macrogoal_source_barrier_private.after_source_change();
CREATE TRIGGER zzz_tdee_source_revision AFTER INSERT OR UPDATE OR DELETE ON public.meals FOR EACH ROW EXECUTE FUNCTION macrogoal_source_barrier_private.after_source_change();
CREATE TRIGGER zzz_tdee_source_revision AFTER INSERT OR UPDATE OR DELETE ON public.meal_items FOR EACH ROW EXECUTE FUNCTION macrogoal_source_barrier_private.after_source_change();
CREATE TRIGGER zzz_tdee_source_revision AFTER INSERT OR UPDATE OR DELETE ON public.check_ins FOR EACH ROW EXECUTE FUNCTION macrogoal_source_barrier_private.after_source_change();
CREATE TRIGGER zzz_tdee_source_revision AFTER INSERT OR UPDATE OR DELETE ON public.trackers FOR EACH ROW EXECUTE FUNCTION macrogoal_source_barrier_private.after_source_change();
CREATE TRIGGER zzz_tdee_source_revision AFTER INSERT OR UPDATE OR DELETE ON public.tracker_entries FOR EACH ROW EXECUTE FUNCTION macrogoal_source_barrier_private.after_source_change();
CREATE TRIGGER zzz_tdee_source_revision AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION macrogoal_source_barrier_private.after_source_change();
CREATE TRIGGER zzz_tdee_source_revision AFTER INSERT OR UPDATE OR DELETE ON macrogoal_observed_private.settings FOR EACH ROW EXECUTE FUNCTION macrogoal_source_barrier_private.after_source_change();

-- Operational enrollment, not a nutrition-data backfill. Requires separate
-- review/approval before installation. CREATE TRIGGER has already serialized
-- source DDL; use this whole migration transaction, never split deployment.
-- This does NOT execute until the candidate is explicitly approved and applied.
INSERT INTO macrogoal_source_barrier_private.owner_revisions(owner_id)
SELECT id FROM public.users;

-- Private future-adapter building block. No execute grant, no public wrapper.
-- Call within SAME transaction as future acceptance, BEFORE any source reads.
-- After this returns, obtain source snapshot in a separate VOLATILE SQL statement
-- at READ COMMITTED. Do not reuse pre-lock results or acquire new source row locks.
CREATE FUNCTION macrogoal_source_barrier_private.lock_expected_context(
 p_owner uuid,p_goal uuid,p_goal_version timestamptz,p_profile_version timestamptz,
 p_epoch uuid,p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO pg_catalog,pg_temp AS $fn$
DECLARE actor uuid:=auth.uid(); u public.users; g public.goals; r macrogoal_source_barrier_private.owner_revisions;
BEGIN
 IF actor IS NULL OR actor IS DISTINCT FROM p_owner OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='account_changed'; END IF;
 IF current_setting('transaction_isolation') <> 'read committed' THEN
   RAISE EXCEPTION USING ERRCODE='25000',MESSAGE='source_barrier_isolation_unsupported'; END IF;
 IF p_goal IS NULL OR p_epoch IS NULL OR p_revision IS NULL OR p_revision<0 THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source_barrier_expected_context_required'; END IF;
 -- Canonical order U→exact G→R. Never lock a newly discovered goal after R.
 SELECT * INTO u FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND OR u.updated_at IS DISTINCT FROM p_profile_version THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='profile_changed_review_again'; END IF;
 SELECT * INTO g FROM public.goals WHERE id=p_goal AND user_id=actor AND is_active=true FOR UPDATE;
 IF NOT FOUND OR g.updated_at IS DISTINCT FROM p_goal_version THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='goal_changed_review_again'; END IF;
 -- Drain any source events from earlier statements only after owning U/G.
 -- Keep this constraint immediate for the remainder of THIS acceptance TX;
 -- the future adapter must not perform any further unrelated source writes.
 IF EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners
   WHERE transaction_id=pg_current_xact_id() AND owner_id<>actor) THEN
   RAISE EXCEPTION USING ERRCODE='25000',MESSAGE='source_barrier_multiowner_acceptance_forbidden'; END IF;
 SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners IMMEDIATE;
 -- The empty-workset acceptance path must use the SAME existence-independent
 -- fence as every writer, not an acceptance-only advisory lock.
 PERFORM pg_advisory_xact_lock(1413760325,hashtext(actor::text));
 SELECT * INTO r FROM macrogoal_source_barrier_private.owner_revisions WHERE owner_id=actor FOR UPDATE;
 -- No lazy INSERT in acceptance: proposal creation needs a reviewed enrollment
 -- protocol first. Missing revision must never manufacture an expected epoch.
 IF NOT FOUND OR r.epoch IS DISTINCT FROM p_epoch OR r.revision IS DISTINCT FROM p_revision THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='source_changed_review_again'; END IF;
 IF (SELECT count(*) FROM public.goals WHERE user_id=actor AND is_active=true)<>1 THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='active_goal_conflict'; END IF;
 RETURN jsonb_build_object('ownerId',actor,'epoch',r.epoch,'revision',r.revision::text,
   'goalId',g.id,'goalUpdatedAt',g.updated_at,'profileUpdatedAt',u.updated_at);
END $fn$;
REVOKE ALL ON FUNCTION macrogoal_source_barrier_private.lock_expected_context(uuid,uuid,timestamptz,timestamptz,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
-- This schema does NOT certify writer completeness or enable an acceptance route.
-- Existing privileged writers/TRUNCATE/trigger-disable paths, transaction order,
-- UUID enrollment approval, and real concurrency tests remain installation gates.

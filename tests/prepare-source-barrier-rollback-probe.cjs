'use strict';
// Generates an intentionally aborting probe for the EXISTING authorized DB.
// No connector, network, credentials or execution. This is not a migration to install.
const fs=require('node:fs');
const crypto=require('node:crypto');
function prepare(source,{coreOnly=false,holdMs=0}={}){
 if(typeof coreOnly!=='boolean'||!Number.isInteger(holdMs)||holdMs<0||holdMs>20000||(!coreOnly&&holdMs!==0))throw Error('unsafe_probe_mode');
 if((source.match(/^BEGIN;$/gm)||[]).length!==1||(source.match(/^COMMIT;$/gm)||[]).length!==1)throw Error('transaction_wrapper_changed');
 const seed='SELECT id FROM public.users;';
 if(source.split(seed).length!==2)throw Error('enrollment_statement_changed');
 let transformed=source.replace(seed,'SELECT id FROM public.users WHERE false;').replace(/^COMMIT;$/m,'');
 if(coreOnly){
  const sourceTriggers=/^CREATE TRIGGER zz[yz]_tdee_source_(?:enrollment|revision) .*;$/gm;
  if((transformed.match(sourceTriggers)||[]).length!==10)throw Error('source_trigger_inventory_changed');
  transformed=transformed.replace(sourceTriggers,'-- Source trigger omitted: private-core concurrency probe has no public DDL locks.');
 }
 const probe=`
-- Private synthetic workset only. Public source rows are never inserted/updated/deleted.
DO $probe$
DECLARE
 a uuid:='ffffffff-ffff-4fff-8fff-fffffffffff1';
 b uuid:='ffffffff-ffff-4fff-8fff-fffffffffff2';
 role_name text; checks integer:=0; actual integer; denied boolean:=false; hold_started timestamptz;
BEGIN
 IF EXISTS(SELECT 1 FROM public.users WHERE id IN (a,b)) THEN
  RAISE EXCEPTION 'probe_synthetic_owner_collision'; END IF;
 checks:=checks+1;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_schema_privilege(role_name,'macrogoal_source_barrier_private','USAGE')
   OR has_table_privilege(role_name,'macrogoal_source_barrier_private.owner_revisions','SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege(role_name,'macrogoal_source_barrier_private.pending_owners','SELECT,INSERT,UPDATE,DELETE')
   OR has_function_privilege(role_name,'macrogoal_source_barrier_private.lock_expected_context(uuid,uuid,timestamptz,timestamptz,uuid,bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'probe_private_access_leak'; END IF;
 END LOOP;
 checks:=checks+1;
 SELECT count(*) INTO actual FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='macrogoal_source_barrier_private' AND NOT t.tgisinternal;
 IF actual<>${coreOnly?1:11} THEN RAISE EXCEPTION 'probe_trigger_inventory'; END IF;
 checks:=checks+1;
 IF EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.owner_revisions)
  OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners) THEN RAISE EXCEPTION 'probe_real_enrollment_not_empty'; END IF;
 checks:=checks+1;
 SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners DEFERRED;
 INSERT INTO macrogoal_source_barrier_private.owner_revisions(owner_id,revision) VALUES(a,5),(b,6);
 INSERT INTO macrogoal_source_barrier_private.pending_owners(transaction_id,owner_id) VALUES(pg_current_xact_id(),b),(pg_current_xact_id(),a);
 INSERT INTO macrogoal_source_barrier_private.pending_owners(transaction_id,owner_id) VALUES(pg_current_xact_id(),a) ON CONFLICT(transaction_id,owner_id) DO NOTHING;
 IF (SELECT count(*) FROM macrogoal_source_barrier_private.pending_owners)<>2 THEN RAISE EXCEPTION 'probe_queue_dedup'; END IF;
 checks:=checks+1;
 SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners IMMEDIATE;
 IF EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners) OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.owner_revisions) THEN RAISE EXCEPTION 'probe_flush_cleanup'; END IF;
 checks:=checks+1;
 INSERT INTO macrogoal_source_barrier_private.owner_revisions(owner_id,revision) VALUES(a,7);
 INSERT INTO macrogoal_source_barrier_private.pending_owners(transaction_id,owner_id) VALUES(pg_current_xact_id(),a);
 IF EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners) OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.owner_revisions) THEN RAISE EXCEPTION 'probe_immediate_next_write'; END IF;
 checks:=checks+1;
 INSERT INTO macrogoal_source_barrier_private.owner_revisions(owner_id,revision) VALUES(a,8);
 BEGIN
  INSERT INTO macrogoal_source_barrier_private.pending_owners(transaction_id,owner_id) VALUES(pg_current_xact_id(),a);
  IF EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.owner_revisions) THEN RAISE EXCEPTION 'probe_subtxn_did_not_flush'; END IF;
  RAISE EXCEPTION USING ERRCODE='P7701',MESSAGE='expected_probe_subtransaction_rollback';
 EXCEPTION WHEN SQLSTATE 'P7701' THEN NULL;
 END;
 IF (SELECT count(*) FROM macrogoal_source_barrier_private.owner_revisions WHERE owner_id=a AND revision=8)<>1
  OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners) THEN RAISE EXCEPTION 'probe_subtxn_restore'; END IF;
 checks:=checks+1;
 SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners DEFERRED;
 BEGIN
  INSERT INTO macrogoal_source_barrier_private.pending_owners(transaction_id,owner_id) VALUES(pg_current_xact_id(),a);
  RAISE EXCEPTION USING ERRCODE='P7701',MESSAGE='expected_probe_subtransaction_rollback';
 EXCEPTION WHEN SQLSTATE 'P7701' THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners)
  OR (SELECT count(*) FROM macrogoal_source_barrier_private.owner_revisions WHERE owner_id=a AND revision=8)<>1 THEN RAISE EXCEPTION 'probe_queued_rollback'; END IF;
 checks:=checks+1;
 INSERT INTO macrogoal_source_barrier_private.pending_owners(transaction_id,owner_id) VALUES(pg_current_xact_id(),a);
 SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners IMMEDIATE;
 IF EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners) OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.owner_revisions) THEN RAISE EXCEPTION 'probe_final_cleanup'; END IF;
 checks:=checks+1;
 BEGIN
  PERFORM macrogoal_source_barrier_private.lock_expected_context(NULL,NULL,NULL,NULL,NULL,NULL);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'probe_missing_actor_not_rejected'; END IF;
 checks:=checks+1;
 INSERT INTO macrogoal_source_barrier_private.pending_owners(transaction_id,owner_id,reset_epoch) VALUES(pg_current_xact_id(),a,true);
 IF EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners) OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.owner_revisions) THEN RAISE EXCEPTION 'probe_absent_profile_not_enrolled'; END IF;
 checks:=checks+1;
 IF (SELECT count(*) FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND classid=1413760325::oid AND objsubid=2 AND granted)<>2 THEN RAISE EXCEPTION 'probe_owner_fences_missing'; END IF;
 checks:=checks+1;
 hold_started:=clock_timestamp();
 ${holdMs ? `PERFORM pg_sleep(${holdMs/1000});` : '-- No hold in full source-trigger compilation probe.'}
 RAISE EXCEPTION USING ERRCODE='P7700',MESSAGE='TDEE_SOURCE_BARRIER_ROLLBACK_PROBE_OK',DETAIL=jsonb_build_object('checks',checks,'public_source_writes',0,'persistent_objects',0,'core_only',${coreOnly},'pid',pg_backend_pid(),'hold_started',hold_started,'ended',clock_timestamp())::text;
END $probe$;
`;
 const sql=transformed+probe;
 if(/^COMMIT;$/m.test(sql))throw Error('probe_must_not_commit');
 return {sql,coreOnly,holdMs,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),probeSha256:crypto.createHash('sha256').update(sql).digest('hex')};
}
function prepareIsolationProbe(source){
 const base=prepare(source,{coreOnly:true});
 const marker='-- Private synthetic workset only.';
 if(base.sql.split(marker).length!==2)throw Error('probe_marker_changed');
 const prefix=base.sql.split(marker)[0].replace(/^BEGIN;$/m,'BEGIN ISOLATION LEVEL REPEATABLE READ;');
 const sql=prefix+`DO $isolation_probe$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  INSERT INTO macrogoal_source_barrier_private.pending_owners(transaction_id,owner_id)
  VALUES(pg_current_xact_id(),'ffffffff-ffff-4fff-8fff-fffffffffff1');
  SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners IMMEDIATE;
 EXCEPTION WHEN SQLSTATE '25000' THEN
  IF SQLERRM<>'source_barrier_isolation_unsupported' THEN RAISE; END IF;
  rejected:=true;
 END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners)
  OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.owner_revisions) THEN RAISE EXCEPTION 'probe_isolation_guard_failed'; END IF;
 RAISE EXCEPTION USING ERRCODE='P7700',MESSAGE='TDEE_SOURCE_BARRIER_ISOLATION_PROBE_OK',
 DETAIL=jsonb_build_object('isolation',current_setting('transaction_isolation'),'rejected',rejected,'public_source_writes',0,'persistent_objects',0)::text;
END $isolation_probe$;
`;
 return {sql,sourceSha256:base.sourceSha256,probeSha256:crypto.createHash('sha256').update(sql).digest('hex')};
}
function prepareSynchronizedProbe(source){
 const base=prepare(source,{coreOnly:true,holdMs:20000});
 const readiness=`DO $observer_ready$
DECLARE observer integer; matches integer;
BEGIN
 IF hashtext('ffffffff-ffff-4fff-8fff-fffffffffff1') IN (2147483646,2147483647)
  OR hashtext('ffffffff-ffff-4fff-8fff-fffffffffff2') IN (2147483646,2147483647) THEN
  RAISE EXCEPTION 'probe_marker_collision'; END IF;
 SELECT count(*),min(pid) INTO matches,observer FROM pg_locks
 WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND locktype='advisory' AND classid=1413760325::oid AND objid=2147483646::oid
  AND objsubid=2 AND granted AND pid<>pg_backend_pid();
 IF matches<>1 THEN RAISE EXCEPTION USING ERRCODE='P7702',MESSAGE='TDEE_SOURCE_BARRIER_OBSERVER_NOT_READY'; END IF;
 PERFORM set_config('macrogoal.barrier_observer_pid',observer::text,true);
 PERFORM set_config('macrogoal.barrier_observer_ack','',true);
END $observer_ready$;
`;
 const wait=`FOR turn IN 1..80 LOOP
  IF EXISTS(SELECT 1 FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND locktype='advisory' AND classid=1413760325::oid
   AND objid=2147483647::oid AND objsubid=2 AND granted
   AND pid=current_setting('macrogoal.barrier_observer_pid')::integer) THEN
   PERFORM set_config('macrogoal.barrier_observer_ack',clock_timestamp()::text,true);
   EXIT;
  END IF;
  PERFORM pg_sleep(0.25);
 END LOOP;
 IF nullif(current_setting('macrogoal.barrier_observer_ack',true),'') IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='P7702',MESSAGE='TDEE_SOURCE_BARRIER_OBSERVER_DID_NOT_OVERLAP'; END IF;
 checks:=checks+1;`;
 if(base.sql.split('CREATE SCHEMA macrogoal_source_barrier_private;').length!==2||base.sql.split('PERFORM pg_sleep(20);').length!==2)throw Error('synchronized_probe_shape_changed');
 const sql=base.sql.replace('CREATE SCHEMA macrogoal_source_barrier_private;',readiness+'CREATE SCHEMA macrogoal_source_barrier_private;')
  .replace('PERFORM pg_sleep(20);',wait)
  .replace("'ended',clock_timestamp())::text", "'ended',clock_timestamp(),'observer_pid',current_setting('macrogoal.barrier_observer_pid')::integer,'observer_ack',current_setting('macrogoal.barrier_observer_ack'))::text");
 const observerSql=`BEGIN;
SET LOCAL statement_timeout='55s';
SET LOCAL lock_timeout='2s';
DO $observer$
DECLARE started timestamptz:=clock_timestamp(); deadline timestamptz; holder integer; seen_at timestamptz; attempt_at timestamptz; acquired boolean; result jsonb;
BEGIN
 IF hashtext('ffffffff-ffff-4fff-8fff-fffffffffff1') IN (2147483646,2147483647)
  OR hashtext('ffffffff-ffff-4fff-8fff-fffffffffff2') IN (2147483646,2147483647) THEN RAISE EXCEPTION 'probe_marker_collision'; END IF;
 IF NOT pg_try_advisory_xact_lock(1413760325,2147483646) THEN RAISE EXCEPTION 'probe_observer_already_running'; END IF;
 deadline:=started+interval '45 seconds';
 WHILE clock_timestamp()<deadline LOOP
  SELECT min(pid) INTO holder FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND locktype='advisory' AND classid=1413760325::oid
   AND objid=(hashtext('ffffffff-ffff-4fff-8fff-fffffffffff1')::bigint & 4294967295)::oid
   AND objsubid=2 AND granted AND pid<>pg_backend_pid();
  IF holder IS NOT NULL THEN
   seen_at:=clock_timestamp();attempt_at:=clock_timestamp();
   acquired:=pg_try_advisory_xact_lock(1413760325,hashtext('ffffffff-ffff-4fff-8fff-fffffffffff1'));
   IF NOT acquired THEN
    IF NOT pg_try_advisory_xact_lock(1413760325,2147483647) THEN RAISE EXCEPTION 'probe_ack_collision'; END IF;
    PERFORM pg_sleep(3);
   END IF;
   result:=jsonb_build_object('observed',true,'observer_pid',pg_backend_pid(),'holder_pid',holder,
    'started',started,'seen_at',seen_at,'attempt_at',attempt_at,'acquired',acquired,'ended',clock_timestamp());
   EXIT;
  END IF;
  PERFORM pg_sleep(0.25);
 END LOOP;
 IF result IS NULL THEN result:=jsonb_build_object('observed',false,'observer_pid',pg_backend_pid(),'started',started,'ended',clock_timestamp()); END IF;
 PERFORM set_config('macrogoal.barrier_probe_result',result::text,true);
END $observer$;
SELECT current_setting('macrogoal.barrier_probe_result')::jsonb AS probe_result;
ROLLBACK;
`;
 return {sql,observerSql,sourceSha256:base.sourceSha256,probeSha256:crypto.createHash('sha256').update(sql).digest('hex'),observerSha256:crypto.createHash('sha256').update(observerSql).digest('hex')};
}
module.exports={prepare,prepareIsolationProbe,prepareSynchronizedProbe};
if(require.main===module){
 const result=prepare(fs.readFileSync('release-candidates/tdee-adaptive-review/sourceBarrierCandidate.sql','utf8'));
 fs.writeFileSync('.ci-results/source-barrier-rollback-probe-20261113.sql',result.sql);
 fs.writeFileSync('.ci-results/source-barrier-rollback-probe-manifest-20261113.json',JSON.stringify({sourceSha256:result.sourceSha256,probeSha256:result.probeSha256,notExecutedByThisScript:true},null,2)+'\n');
 process.stdout.write(JSON.stringify({sourceSha256:result.sourceSha256,probeSha256:result.probeSha256,bytes:Buffer.byteLength(result.sql)})+'\n');
}

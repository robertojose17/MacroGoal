'use strict';
// PREPARATION ONLY: no connection, execution, account identity, credentials or publication.
// Single transaction, no sleeps/multisession. Only subscriptions receives a temporary
// source trigger/DDL lock; lock_timeout 2s, statement_timeout 30s, forced abort.
// Function deployments must remain frozen during this probe: table DDL lock does
// not prevent CREATE OR REPLACE FUNCTION after the catalogue fingerprint check.
const crypto=require('node:crypto');
const {prepare}=require('./prepare-source-barrier-rollback-probe.cjs');
const SOURCE_SHA='84f9196fa95e34d48f00fc051600af8b28caa68d9b27b732e8a9e8590aa24b5d';
const EXPECTED={"rules":[],"columns":[[1,"id","uuid",true,"","","gen_random_uuid()"],[2,"user_id","text",true,"","",null],[3,"stripe_customer_id","text",false,"","",null],[4,"stripe_subscription_id","text",false,"","",null],[5,"stripe_price_id","text",false,"","",null],[6,"status","text",true,"","","'inactive'::text"],[7,"plan_type","text",false,"","",null],[8,"current_period_start","timestamp with time zone",false,"","",null],[9,"current_period_end","timestamp with time zone",false,"","",null],[10,"cancel_at_period_end","boolean",false,"","","false"],[11,"trial_end","timestamp with time zone",false,"","",null],[12,"created_at","timestamp with time zone",false,"","","now()"],[13,"updated_at","timestamp with time zone",false,"","","now()"],[14,"entitlement_ids","text[]",false,"","","'{}'::text[]"],[15,"revenuecat_app_user_id","text",false,"","",null],[16,"revenuecat_original_app_user_id","text",false,"","",null],[17,"store","text",false,"","",null],[18,"environment","text",false,"","",null],[19,"product_id","text",false,"","",null],[20,"period_type","text",false,"","",null],[21,"purchased_at","timestamp with time zone",false,"","",null],[22,"expiration_at","timestamp with time zone",false,"","",null],[23,"will_renew","boolean",false,"","","true"],[24,"unsubscribe_detected_at","timestamp with time zone",false,"","",null],[25,"billing_issues_detected_at","timestamp with time zone",false,"","",null],[26,"plan_name","text",false,"","",null]],"triggers":[["on_subscription_activated","O","CREATE TRIGGER on_subscription_activated AFTER INSERT OR UPDATE OF status ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION handle_subscription_activated()","handle_subscription_activated()","c9fd3f4c53fa842b951442958860e631","postgres",true,null,"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}"],["subscriptions_updated_at","O","CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION update_subscriptions_updated_at()","update_subscriptions_updated_at()","09d03d12a5c2bdc195ef1501ccca0ad7","postgres",false,null,"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}"],["zzzz_guard_subscription_authority","O","CREATE TRIGGER zzzz_guard_subscription_authority BEFORE INSERT OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION macrogoal_authority_private.guard_subscription_authority()","macrogoal_authority_private.guard_subscription_authority()","f15e5d4c908b20cafea5706bc20c8262","postgres",false,["search_path=pg_catalog"],"{postgres=X/postgres}"]],"constraints":[["subscriptions_pkey","PRIMARY KEY (id)"],["subscriptions_status_check","CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'trialing'::text, 'past_due'::text, 'canceled'::text, 'unpaid'::text])))"],["subscriptions_user_id_key","UNIQUE (user_id)"]]};
const FINGERPRINT_SQL="SELECT jsonb_build_object(\n'columns',(SELECT jsonb_agg(jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.subscriptions'::regclass AND a.attnum>0 AND NOT a.attisdropped),\n'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname),'[]'::jsonb) FROM pg_constraint WHERE conrelid='public.subscriptions'::regclass OR confrelid='public.subscriptions'::regclass),\n'rules',(SELECT coalesce(jsonb_agg(jsonb_build_array(rulename,pg_get_ruledef(oid)) ORDER BY rulename),'[]'::jsonb) FROM pg_rewrite WHERE ev_class='public.subscriptions'::regclass),\n'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid),p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)),pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,p.proacl::text) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.subscriptions'::regclass AND t.tgname<>'zzz_tdee_source_revision')\n) INTO actual;";
function prepareSubscriptionSourceProbe(source){
 const sourceSha256=crypto.createHash('sha256').update(source).digest('hex');
 if(sourceSha256!==SOURCE_SHA)throw Error('source_changed_review_required');
 const base=prepare(source,{coreOnly:true});
 const marker='-- Private synthetic workset only.';
 if(base.sql.split(marker).length!==2)throw Error('core_marker_changed');
 const prefix=base.sql.split(marker)[0];
 const trigger='CREATE TRIGGER zzz_tdee_source_revision AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION macrogoal_source_barrier_private.after_source_change();';
 const expectedJson=JSON.stringify(EXPECTED).replace(/'/g,"''");
 const sql=prefix+trigger+String.raw`
SET LOCAL search_path TO public,pg_catalog;
-- CREATE TRIGGER retains table DDL lock through forced abort. Validate after acquiring it.
DO $preflight$
DECLARE actual jsonb;
BEGIN
 `+FINGERPRINT_SQL+String.raw`
 IF actual IS DISTINCT FROM '`+expectedJson+String.raw`'::jsonb THEN RAISE EXCEPTION 'subscription_catalog_drift'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND
  (conrelid='public.subscriptions'::regclass OR confrelid='public.subscriptions'::regclass)) THEN RAISE EXCEPTION 'subscription_fk_not_allowed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.subscriptions'::regclass AND attidentity<>'')
 OR EXISTS(SELECT 1 FROM pg_depend d JOIN pg_class seq ON seq.oid=d.refobjid AND seq.relkind='S'
   WHERE d.objid='public.subscriptions'::regclass OR d.objid IN(SELECT oid FROM pg_attrdef WHERE adrelid='public.subscriptions'::regclass))
 OR EXISTS(SELECT 1 FROM pg_depend d JOIN pg_class seq ON seq.oid=d.objid AND seq.relkind='S'
   WHERE d.refobjid='public.subscriptions'::regclass)
 THEN RAISE EXCEPTION 'subscription_sequence_not_allowed'; END IF;
END $preflight$;
DO $source_probe$
DECLARE
 a uuid:='ffffffff-ffff-4fff-8fff-fffffffffffa';
 b uuid:='ffffffff-ffff-4fff-8fff-fffffffffffb';
 fixture uuid:='ffffffff-ffff-4fff-8fff-fffffffffffc';
 invalid_owner text:='tdee-source-probe-invalid-owner';
 xid xid8:=pg_current_xact_id(); checks integer:=0;
BEGIN
 -- Existence only, synthetic constants: never recover or assume a real account.
 IF EXISTS(SELECT 1 FROM public.users WHERE id IN(a,b,fixture))
 OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(a,b,fixture))
 OR EXISTS(SELECT 1 FROM public.subscriptions WHERE id=fixture OR lower(user_id) IN(a::text,b::text,fixture::text,invalid_owner))
 THEN RAISE EXCEPTION 'subscription_probe_identity_collision'; END IF;
 IF EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners)
 OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.owner_revisions)
 THEN RAISE EXCEPTION 'subscription_probe_private_state_not_empty'; END IF;
 checks:=checks+1;
 SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners DEFERRED;
 INSERT INTO public.subscriptions(id,user_id,status,entitlement_ids,will_renew,cancel_at_period_end)
 VALUES(fixture,a::text,'inactive','{}'::text[],false,false);
 IF (SELECT array_agg(owner_id ORDER BY owner_id) FROM macrogoal_source_barrier_private.pending_owners WHERE transaction_id=xid) IS DISTINCT FROM ARRAY[a]
 THEN RAISE EXCEPTION 'subscription_insert_not_enqueued'; END IF;
 checks:=checks+1;
 SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners IMMEDIATE;
 SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners DEFERRED;
 UPDATE public.subscriptions SET cancel_at_period_end=true WHERE id=fixture AND status='inactive';
 IF (SELECT array_agg(owner_id) FROM macrogoal_source_barrier_private.pending_owners WHERE transaction_id=xid) IS DISTINCT FROM ARRAY[a] THEN RAISE EXCEPTION 'subscription_nonowner_update_not_enqueued'; END IF;
 UPDATE public.subscriptions SET cancel_at_period_end=false WHERE id=fixture AND status='inactive';
 IF (SELECT count(*) FROM macrogoal_source_barrier_private.pending_owners WHERE transaction_id=xid)<>1 THEN RAISE EXCEPTION 'subscription_dedup_failed'; END IF;
 checks:=checks+1;
 UPDATE public.subscriptions SET user_id=b::text WHERE id=fixture AND status='inactive';
 IF (SELECT array_agg(owner_id ORDER BY owner_id) FROM macrogoal_source_barrier_private.pending_owners WHERE transaction_id=xid) IS DISTINCT FROM ARRAY[a,b]
 THEN RAISE EXCEPTION 'subscription_old_new_not_enqueued'; END IF;
 checks:=checks+1;
 DELETE FROM public.subscriptions WHERE id=fixture AND status='inactive';
 IF EXISTS(SELECT 1 FROM public.subscriptions WHERE id=fixture)
 OR (SELECT count(*) FROM macrogoal_source_barrier_private.pending_owners WHERE transaction_id=xid)<>2 THEN RAISE EXCEPTION 'subscription_delete_failed'; END IF;
 checks:=checks+1;
 INSERT INTO macrogoal_source_barrier_private.owner_revisions(owner_id,revision) VALUES(a,5),(b,6);
 SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners IMMEDIATE;
 IF EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners)
 OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.owner_revisions) THEN RAISE EXCEPTION 'subscription_absent_cleanup_failed'; END IF;
 checks:=checks+1;

 SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners DEFERRED;
 BEGIN
  INSERT INTO public.subscriptions(id,user_id,status,entitlement_ids,will_renew,cancel_at_period_end)
  VALUES(fixture,a::text,'inactive','{}'::text[],false,false);
  IF NOT EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners WHERE transaction_id=xid AND owner_id=a) THEN RAISE EXCEPTION 'subscription_subtxn_queue_missing'; END IF;
  RAISE EXCEPTION USING ERRCODE='P7701',MESSAGE='intentional_subscription_probe_subtransaction';
 EXCEPTION WHEN SQLSTATE 'P7701' THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM public.subscriptions WHERE id=fixture)
 OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners) THEN RAISE EXCEPTION 'subscription_preflush_rollback_failed'; END IF;
 checks:=checks+1;

 INSERT INTO macrogoal_source_barrier_private.owner_revisions(owner_id,revision) VALUES(a,7);
 BEGIN
  INSERT INTO public.subscriptions(id,user_id,status,entitlement_ids,will_renew,cancel_at_period_end)
  VALUES(fixture,a::text,'inactive','{}'::text[],false,false);
  SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners IMMEDIATE;
  IF EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.owner_revisions) THEN RAISE EXCEPTION 'subscription_subtxn_flush_missing'; END IF;
  RAISE EXCEPTION USING ERRCODE='P7701',MESSAGE='intentional_subscription_probe_subtransaction';
 EXCEPTION WHEN SQLSTATE 'P7701' THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM public.subscriptions WHERE id=fixture)
 OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners)
 OR (SELECT count(*) FROM macrogoal_source_barrier_private.owner_revisions WHERE owner_id=a AND revision=7)<>1
 THEN RAISE EXCEPTION 'subscription_postflush_rollback_failed'; END IF;
 checks:=checks+1;
 DELETE FROM macrogoal_source_barrier_private.owner_revisions WHERE owner_id=a;

 INSERT INTO public.subscriptions(id,user_id,status,entitlement_ids,will_renew,cancel_at_period_end)
 VALUES(fixture,invalid_owner,'inactive','{}'::text[],false,false);
 UPDATE public.subscriptions SET user_id=upper(a::text) WHERE id=fixture AND status='inactive';
 DELETE FROM public.subscriptions WHERE id=fixture AND status='inactive';
 IF EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners) THEN RAISE EXCEPTION 'subscription_noncanonical_not_ignored'; END IF;
 checks:=checks+1;

 -- Isolated DELETE assertion, after resetting queue through a previous immediate flush.
 INSERT INTO public.subscriptions(id,user_id,status,entitlement_ids,will_renew,cancel_at_period_end)
 VALUES(fixture,a::text,'inactive','{}'::text[],false,false);
 SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners IMMEDIATE;
 SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners DEFERRED;
 DELETE FROM public.subscriptions WHERE id=fixture AND status='inactive';
 IF (SELECT array_agg(owner_id) FROM macrogoal_source_barrier_private.pending_owners WHERE transaction_id=xid) IS DISTINCT FROM ARRAY[a]
 THEN RAISE EXCEPTION 'subscription_delete_not_enqueued'; END IF;
 checks:=checks+1;
 SET CONSTRAINTS macrogoal_source_barrier_private.flush_source_owners IMMEDIATE;
 IF EXISTS(SELECT 1 FROM public.subscriptions WHERE id=fixture)
 OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.pending_owners)
 OR EXISTS(SELECT 1 FROM macrogoal_source_barrier_private.owner_revisions) THEN RAISE EXCEPTION 'subscription_probe_final_cleanup_failed'; END IF;
 checks:=checks+1;
 RAISE EXCEPTION USING ERRCODE='P7700',MESSAGE='TDEE_SUBSCRIPTION_SOURCE_ROLLBACK_PROBE_OK',
 DETAIL=jsonb_build_object('checks',checks,'source','subscriptions','owner_profiles_created',0,'committed_source_rows',0,'pid',pg_backend_pid())::text;
END $source_probe$;
`;
 if(/^COMMIT;/m.test(sql))throw Error('unexpected_commit');
 return {sql,sourceSha256,probeSha256:crypto.createHash('sha256').update(sql).digest('hex')};
}
module.exports={prepareSubscriptionSourceProbe};


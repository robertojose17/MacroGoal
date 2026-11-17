-- SOURCE ONLY. Reuse the ONE legacy adaptive named job, never enable it here.
-- Existing key is resolved inside the database and sent only to same-project worker.
-- No credential value is in this source or returned as a result.
DO $replace$
DECLARE v_job bigint; n integer;
BEGIN
 SELECT count(*),min(jobid) INTO n,v_job FROM cron.job WHERE jobname='adaptive-tdee-nightly';
 IF n<>1 THEN RAISE EXCEPTION 'adaptive_job_identity_ambiguous';END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobid<>v_job AND command LIKE '%/functions/v1/ai-coach-daily/internal-tdee-daily-v1%') THEN RAISE EXCEPTION 'duplicate_tdee_dispatch_exists';END IF;
 IF (SELECT count(*) FROM vault.secrets WHERE name='service_role_key')<>1 THEN RAISE EXCEPTION 'existing_service_key_unavailable';END IF;
 PERFORM cron.alter_job(v_job,schedule:='*/5 * * * *',command:=$command$
SELECT net.http_post(
 url:='https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/ai-coach-daily/internal-tdee-daily-v1',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key')),
 body:='{"version":"internal-daily-worker-v1"}'::jsonb,
 timeout_milliseconds:=10000
);
$command$,active:=false);
END $replace$;
-- Final enable is a separate action only after verified authenticated worker E2E.
-- SELECT cron.alter_job(jobid,active:=true) FROM cron.job WHERE jobname='adaptive-tdee-nightly';

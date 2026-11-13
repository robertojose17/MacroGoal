-- NOT EXECUTED. Requires explicit rollback authorization and a verified repaired endpoint.
-- This restores the broken schedule if used before its destination is fixed.
BEGIN;
DO $containment$
DECLARE before_job cron.job%ROWTYPE; after_job cron.job%ROWTYPE;
  others_before text; others_after text;
BEGIN
  -- Managed Postgres forbids direct table UPDATE/FOR UPDATE. Use only cron API.
  -- Postcondition comparison detects concurrent changes; any mismatch aborts.
  SELECT * INTO STRICT before_job FROM cron.job WHERE jobid=34;
  IF before_job.jobname IS DISTINCT FROM 'adaptive-tdee-nightly'
     OR before_job.schedule IS DISTINCT FROM '0 15 * * *'
     OR md5(before_job.command) IS DISTINCT FROM 'b68dc728c77d578bf6d5eff07ccc8085'
     OR before_job.active IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TDEE cron changed; stop and review';
  END IF;
  SELECT md5(coalesce(string_agg(md5(to_jsonb(j)::text),',' ORDER BY j.jobid),''))
    INTO others_before FROM cron.job j WHERE jobid<>34;
  PERFORM cron.alter_job(job_id:=34,active:=true);
  SELECT * INTO STRICT after_job FROM cron.job WHERE jobid=34;
  IF after_job.active IS DISTINCT FROM true OR (to_jsonb(before_job)-'active') IS DISTINCT FROM (to_jsonb(after_job)-'active') THEN
    RAISE EXCEPTION 'TDEE cron unexpected change';
  END IF;
  SELECT md5(coalesce(string_agg(md5(to_jsonb(j)::text),',' ORDER BY j.jobid),''))
    INTO others_after FROM cron.job j WHERE jobid<>34;
  IF others_before IS DISTINCT FROM others_after THEN RAISE EXCEPTION 'Other cron jobs changed; stop and review'; END IF;
END $containment$;
COMMIT;
SELECT jobid,jobname,schedule,active,md5(command) AS command_fingerprint FROM cron.job WHERE jobid=34;

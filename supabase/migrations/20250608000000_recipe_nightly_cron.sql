CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'prune-stale-recipes',
  '0 3 * * *',
  $$
  DELETE FROM public.recipes
  WHERE click_count = 0
    AND search_count <= 1
    AND created_at < now() - interval '90 days';
  $$
);

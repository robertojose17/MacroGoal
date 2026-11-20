-- Rebuild the derived ranking cache using the complete authoritative XP ledger.
-- Existing schedules run as postgres; no public administrative write endpoint is needed.
create or replace function public.refresh_macro_goal_rankings_v2()
returns bigint language sql security invoker
set search_path = pg_catalog
as $rank$
with bounds as (
  select (statement_timestamp() at time zone 'UTC')::date as today,
         date_trunc('week',statement_timestamp() at time zone 'UTC')::date as week_start
), points as (
  select l.user_id, sum(l.xp_amount) as total_xp,
         sum(l.xp_amount) filter(where l.date between b.week_start and b.today) as weekly_xp
  from public.xp_ledger l cross join bounds b group by l.user_id
), players as (
  select x.user_id, coalesce(p.total_xp,0) as total_xp, coalesce(p.weekly_xp,0) as weekly_xp,
         coalesce(x.current_streak,0) as current_streak, coalesce(c.score,0) as consistency_score,
         coalesce(c.tracked_days,0) as tracked_days
  from public.user_xp x left join points p using(user_id) left join public.user_consistency c using(user_id)
), positions as (
  select p.*, rank() over(order by total_xp desc) as global_rank,
         rank() over(order by weekly_xp desc) as weekly_rank, count(*) over() as total_players
  from players p
), consistent as (
  select user_id, rank() over(order by consistency_score desc) as consistency_rank,
         count(*) over() as player_count from players where tracked_days > 0
), computed as (
  select p.user_id, p.total_xp::int, p.weekly_xp::int, p.current_streak, p.consistency_score,
         case when p.total_players=1 then 99
              else round(100::numeric*(p.total_players-p.global_rank)/p.total_players) end as percentile,
         p.global_rank::int, p.weekly_rank::int, c.consistency_rank::int,
         case when c.player_count is null then 0 when c.player_count=1 then 99
              else round(100::numeric*(c.player_count-c.consistency_rank)/c.player_count)::int end as consistency_percentile
  from positions p left join consistent c using(user_id)
),
updated as (
  insert into public.user_rankings (
    user_id,total_xp,weekly_xp,current_streak,consistency_score,percentile,
    global_rank,weekly_rank,consistency_rank,consistency_percentile,updated_at
  )
  select user_id,total_xp,weekly_xp,current_streak,consistency_score,percentile,
         global_rank,weekly_rank,consistency_rank,consistency_percentile,statement_timestamp()
  from computed order by user_id
  on conflict (user_id) do update set
    total_xp=excluded.total_xp,weekly_xp=excluded.weekly_xp,current_streak=excluded.current_streak,
    consistency_score=excluded.consistency_score,percentile=excluded.percentile,
    global_rank=excluded.global_rank,weekly_rank=excluded.weekly_rank,consistency_rank=excluded.consistency_rank,
    consistency_percentile=excluded.consistency_percentile,updated_at=excluded.updated_at
  returning 1
)
select count(*) from updated;
$rank$;
revoke all on function public.refresh_macro_goal_rankings_v2() from public, anon, authenticated, service_role;
do $switch$
declare j record;
begin
  for j in select jobid from cron.job
    where jobname in ('calculate-rankings-cron','calculate-rankings-after-consistency')
      and username=current_user and command like '%/functions/v1/calculate-rankings%'
  loop
    perform cron.alter_job(j.jobid, command := 'select public.refresh_macro_goal_rankings_v2()');
  end loop;
end;
$switch$;

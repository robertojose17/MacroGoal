do $pause$ declare j record; begin
for j in select jobid from cron.job where jobname in ('calculate-rankings-cron','calculate-rankings-after-consistency')
and username = current_user and command = 'select public.refresh_macro_goal_rankings_v2()' and active
loop perform cron.alter_job(j.jobid, active := false); end loop; end $pause$;
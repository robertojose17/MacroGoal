-- Retire only the approved XP bot and 7-day reminder schedules. Keep job definitions and user records.
do $retire$
declare j record;
begin
 for j in
  select jobid from cron.job where username=current_user and active and (
   (jobname='league-bot-daily-xp' and command ~* '^\s*select\s+public\.grow_daily_bot_xp\s*\(') or
   (jobname='league-bot-weekly-xp' and command ~* '^\s*select\s+public\.generate_weekly_bot_xp\s*\(') or
   (jobname in ('seven-day-challenge-reminder','seven-day-challenge-reminder-hourly')
      and command like '%/functions/v1/seven-day-challenge-reminder%')
  )
 loop perform cron.alter_job(j.jobid,active := false); end loop;
end $retire$;

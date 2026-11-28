const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const owner = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const goal = '20000000-0000-4000-8000-000000000001';
const otherGoal = '20000000-0000-4000-8000-000000000002';
const pastGoal = '20000000-0000-4000-8000-000000000003';
const stamp = '2026-11-27T12:00:00Z';
const oldAdjustment = '2026-11-20T12:00:00Z';
const fixture = `
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT nullif(current_setting(''test.uid'', true), '''')::uuid';
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE public.users (id uuid PRIMARY KEY, updated_at timestamptz, current_weight numeric, goal_weight numeric, journey_start_weight numeric, journey_start_date date);
CREATE TABLE public.goals (id uuid PRIMARY KEY, user_id uuid, updated_at timestamptz, target_weight numeric, goal_type text, is_active bool, daily_calories int, protein_g int, carbs_g int, fats_g int, base_daily_calories int, last_adaptive_update timestamptz);
CREATE TABLE public.check_ins (user_id uuid, weight numeric);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_own ON public.users TO authenticated USING (id=auth.uid());
CREATE POLICY goal_own ON public.goals TO authenticated USING (user_id=auth.uid());
GRANT SELECT, UPDATE ON public.users, public.goals TO authenticated;
CREATE FUNCTION public.touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER touch_user BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.touch();
CREATE TRIGGER touch_goals BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.touch();
INSERT INTO public.users VALUES ('${owner}','${stamp}',80,70,90,'2026-01-01'), ('${other}','${stamp}',100,90,105,'2026-01-02');
INSERT INTO public.goals VALUES ('${goal}','${owner}','${stamp}',NULL,'lose',true,1850,155,160,65,2050,'${oldAdjustment}'),
  ('${otherGoal}','${other}','${stamp}',90,'lose',true,1900,150,170,61,2000,'${oldAdjustment}'),
  ('${pastGoal}','${owner}','${stamp}',75,'lose',false,2010,145,150,67,2110,'${oldAdjustment}');
INSERT INTO public.check_ins VALUES ('${owner}',78);
`;
const sql = fs.readFileSync(process.env.GOAL_WEIGHT_SQL || 'supabase/migrations/20261128142015_save_profile_goal_weight.sql','utf8');
let db;
const role = async (id = owner, r = 'authenticated') => {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('test.uid',$1,false)",[id || '']);
  await db.exec('SET ROLE ' + r);
};
const call = (w, u = owner, g = goal, a = stamp, b = stamp) => db.query('SELECT public.save_profile_goal_weight_v1($1,$2,$3,$4,$5) AS saved',[u,a,g,b,w]);
test('target is atomic, idempotent, authorization-scoped and does not reset the plan', async () => {
  db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(sql);
    await db.exec(`
      CREATE FUNCTION public.reject_fixture_weight() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.goal_weight=68 THEN RAISE EXCEPTION 'fixture mirror rejected'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_fixture_weight BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.reject_fixture_weight();
    `);
    await role(null, 'anon');
    await assert.rejects(call(69), /permission denied/);
    await role(other);
    await assert.rejects(call(69), /account_changed/);
    await role();
    await assert.rejects(call(69, owner, otherGoal), /goal_changed/);
    await assert.rejects(call(69, owner, goal, '2026-11-01'), /goal_or_profile_changed/);
    await assert.rejects(call(81), /goal_direction_review_required/);
    await assert.rejects(call('NaN'), /invalid_goal_weight/);
    await assert.rejects(call(68), /fixture mirror rejected/);
    assert.deepEqual((await db.query('SELECT target_weight FROM goals WHERE is_active')).rows,[{target_weight:null}]);
    assert.equal((await call(70)).rows[0].saved,true);
    const synced = (await db.query('SELECT u.updated_at AS u, g.updated_at AS g FROM users u JOIN goals g ON g.user_id=u.id AND g.is_active')).rows[0];
    assert.equal((await call(69, owner, goal, synced.u, synced.g)).rows[0].saved,true);
    const captured = (await db.query('SELECT u.updated_at AS u, g.updated_at AS g FROM users u JOIN goals g ON g.user_id=u.id AND g.is_active')).rows[0];
    assert.equal((await call(69)).rows[0].saved, true);
    assert.deepEqual((await db.query('SELECT u.updated_at AS u, g.updated_at AS g FROM users u JOIN goals g ON g.user_id=u.id AND g.is_active')).rows[0],captured);
    await db.exec('RESET ROLE');
    const actual = (await db.query(`SELECT g.id,g.daily_calories,g.protein_g,g.carbs_g,g.fats_g,g.base_daily_calories,g.last_adaptive_update::text AS adaptive,
      g.target_weight,u.goal_weight,u.current_weight,u.journey_start_weight,u.journey_start_date::text AS start_date,
      (SELECT weight FROM check_ins LIMIT 1) AS check_in,
      (SELECT target_weight FROM goals WHERE id='${pastGoal}') AS past_target,
      (SELECT goal_weight FROM users WHERE id='${other}') AS other_target
      FROM users u JOIN goals g ON g.user_id=u.id AND g.is_active WHERE u.id='${owner}'`)).rows[0];
    assert.deepEqual(actual,{id:goal,daily_calories:1850,protein_g:155,carbs_g:160,fats_g:65,base_daily_calories:2050,adaptive:'2026-11-20 12:00:00+00',target_weight:'69',goal_weight:'69',current_weight:'80',journey_start_weight:'90',start_date:'2026-01-01',check_in:'78',past_target:'75',other_target:'90'});
    // Correcting the starting weight affects only its own profile column.
    await role();
    await db.query('UPDATE users SET journey_start_weight=92 WHERE id=$1',[owner]);
    const u = (await db.query('SELECT current_weight, goal_weight, journey_start_weight, journey_start_date::text AS start_date FROM users')).rows[0];
    assert.deepEqual(u,{current_weight:'80',goal_weight:'69',journey_start_weight:'92',start_date:'2026-01-01'});
  } finally { await db.close(); }
});

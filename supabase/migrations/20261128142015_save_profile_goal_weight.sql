-- Additive deployment: apply before an app version that calls this RPC.
-- Matches existing user-then-active-goal lock order, with ownership enforced by caller RLS.
BEGIN;
CREATE OR REPLACE FUNCTION public.save_profile_goal_weight_v1(
  p_expected_user_id uuid,
  p_expected_profile_updated_at timestamptz,
  p_expected_goal_id uuid,
  p_expected_goal_updated_at timestamptz,
  p_target_weight numeric
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE
  actor uuid := auth.uid();
  u record;
  g record;
  existing_target numeric;
  current_weight_kg numeric;
  local_today date;
BEGIN
  IF actor IS NULL OR actor IS DISTINCT FROM p_expected_user_id THEN
    RAISE EXCEPTION 'account_changed' USING ERRCODE = '42501';
  END IF;
  IF p_target_weight IS NULL OR NOT (p_target_weight BETWEEN 20 AND 500) THEN
    RAISE EXCEPTION 'invalid_goal_weight' USING ERRCODE = '22023';
  END IF;

  SELECT id, updated_at, current_weight, goal_weight, timezone INTO u
  FROM public.users WHERE id = actor FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_changed' USING ERRCODE = '40001'; END IF;
  SELECT id, updated_at, target_weight, goal_type INTO g
  FROM public.goals WHERE user_id = actor AND is_active IS TRUE FOR UPDATE NOWAIT;
  IF NOT FOUND OR g.id IS DISTINCT FROM p_expected_goal_id THEN
    RAISE EXCEPTION 'goal_changed' USING ERRCODE = '40001';
  END IF;

  -- An identical retry after a lost response is safe without re-writing either row.
  IF g.target_weight IS NOT DISTINCT FROM p_target_weight
     AND u.goal_weight IS NOT DISTINCT FROM p_target_weight THEN RETURN true; END IF;
  IF u.updated_at IS DISTINCT FROM p_expected_profile_updated_at
     OR g.updated_at IS DISTINCT FROM p_expected_goal_updated_at THEN
    RAISE EXCEPTION 'goal_or_profile_changed' USING ERRCODE = '40001';
  END IF;

  existing_target := CASE WHEN g.target_weight BETWEEN 20 AND 500 THEN g.target_weight
    WHEN u.goal_weight BETWEEN 20 AND 500 THEN u.goal_weight END;
  -- Preserve the existing direction rule for an actual change, not for syncing an existing goal.
  IF existing_target IS DISTINCT FROM p_target_weight AND g.goal_type IN ('lose', 'gain') THEN
    local_today := (statement_timestamp() AT TIME ZONE COALESCE(
      (SELECT name FROM pg_catalog.pg_timezone_names WHERE name = u.timezone), 'UTC'
    ))::date;
    -- Date of measurement, not time of edit, determines the latest check-in.
    SELECT ci.weight INTO current_weight_kg
    FROM public.check_ins AS ci
    WHERE ci.user_id = actor AND ci.date <= local_today AND ci.weight BETWEEN 20 AND 500
    ORDER BY ci.date DESC, ci.updated_at DESC NULLS LAST, ci.created_at DESC NULLS LAST, ci.id DESC
    LIMIT 1;

    IF current_weight_kg IS NULL AND u.current_weight BETWEEN 20 AND 500 THEN
      current_weight_kg := u.current_weight;
    END IF;
    IF current_weight_kg IS NULL
       OR (g.goal_type = 'lose' AND p_target_weight >= current_weight_kg)
       OR (g.goal_type = 'gain' AND p_target_weight <= current_weight_kg)
    THEN RAISE EXCEPTION 'goal_direction_review_required' USING ERRCODE = '22023'; END IF;
  END IF;

  IF g.target_weight IS DISTINCT FROM p_target_weight THEN
    UPDATE public.goals SET target_weight = p_target_weight
    WHERE id = g.id AND user_id = actor AND is_active IS TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'goal_changed' USING ERRCODE = '40001'; END IF;
  END IF;
  IF u.goal_weight IS DISTINCT FROM p_target_weight THEN
    UPDATE public.users SET goal_weight = p_target_weight WHERE id = actor;
    IF NOT FOUND THEN RAISE EXCEPTION 'profile_changed' USING ERRCODE = '40001'; END IF;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.save_profile_goal_weight_v1(uuid,timestamptz,uuid,timestamptz,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_profile_goal_weight_v1(uuid,timestamptz,uuid,timestamptz,numeric) TO authenticated;
COMMIT;

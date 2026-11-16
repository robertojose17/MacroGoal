-- Nullable structural support only. No policy value or approval supplied.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='3s';
ALTER TABLE macrogoal_snapshot_review_private.policies
 ADD COLUMN increment_kcal integer,
 ADD CONSTRAINT policies_increment_kcal_positive_when_present
 CHECK (increment_kcal IS NULL OR increment_kcal BETWEEN 1 AND max_step_kcal);
-- NULL is intentionally allowed. Existing/missing/null values remain unavailable
-- to the reviewed-rate loader. There is no default, backfill, approved record,
-- new grant, flag change, uncertainty conclusion or nutritional limit selection.
COMMIT;

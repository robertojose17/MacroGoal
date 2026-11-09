BEGIN;
CREATE TEMP TABLE fixture_recipes(id integer primary key,created_at timestamptz);
CREATE TEMP TABLE fixture_audits(id integer,recipe_id integer unique,image_url text,match boolean,confidence text,regenerated boolean,new_image_url text,audited_at timestamptz);
INSERT INTO fixture_recipes SELECT i,'2026-01-01'::timestamptz+i*interval '1 day' FROM generate_series(1,7) i;
INSERT INTO fixture_audits VALUES
(2,2,NULL,false,'low',false,NULL,'2026-02-01'),
(3,3,'old',false,'medium',false,NULL,'2026-02-02'),
(4,4,'old',true,'low',false,NULL,'2026-02-03'),
(5,5,'valid',true,'high',false,NULL,'2026-02-04'),
(6,6,'old',false,'low',true,'new','2026-02-05'),
(7,7,'',false,'low',NULL,NULL,'2026-02-06');
CREATE TEMP VIEW fixture_queue AS
SELECT r.id FROM fixture_recipes r LEFT JOIN fixture_audits a ON a.recipe_id=r.id
WHERE a.id IS NULL OR (a.regenerated IS NOT TRUE AND a.new_image_url IS NULL AND (NULLIF(a.image_url,'') IS NULL OR a.match IS FALSE OR a.confidence='low'))
ORDER BY CASE WHEN a.id IS NOT NULL THEN 0 ELSE 1 END,COALESCE(a.audited_at,r.created_at),r.created_at,r.id;
DO $$ BEGIN
 IF (SELECT array_agg(id) FROM fixture_queue)<>ARRAY[2,3,4,7,1] THEN RAISE EXCEPTION 'failed attempts must precede new recipes; accepted/successful excluded'; END IF;
 IF (SELECT count(*)<>count(DISTINCT id) FROM fixture_queue) THEN RAISE EXCEPTION 'duplicate within run'; END IF;
END $$;
-- A run takes one snapshot; no immediate loop is introduced.
CREATE TEMP TABLE fixture_run AS SELECT * FROM fixture_queue LIMIT 63;
-- A failed attempt stays eligible for a later snapshot, not duplicated in this run.
UPDATE fixture_audits SET audited_at='2026-03-01' WHERE recipe_id=2;
DO $$ BEGIN
 IF (SELECT count(*) FROM fixture_run WHERE id=2)<>1 THEN RAISE EXCEPTION 'failed recipe repeated within run'; END IF;
 IF NOT EXISTS(SELECT 1 FROM fixture_queue WHERE id=2) THEN RAISE EXCEPTION 'failed attempt lost from future queue'; END IF;
END $$;
-- A generated image succeeds; another existing image passes review without regeneration.
UPDATE fixture_audits SET regenerated=true,new_image_url='generated' WHERE recipe_id=2;
UPDATE fixture_audits SET match=true,confidence='high',image_url='correct' WHERE recipe_id=3;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM fixture_queue WHERE id IN(2,3,5,6)) THEN RAISE EXCEPTION 'completed recipe remained queued'; END IF;
 IF (SELECT array_agg(id) FROM fixture_queue)<>ARRAY[4,7,1] THEN RAISE EXCEPTION 'remaining queue changed unexpectedly'; END IF;
END $$;
ROLLBACK;
SELECT 'passed: failed-first order, unique run snapshot, retry later, generated exit, validated-image exit, new recipe fallback' AS result;

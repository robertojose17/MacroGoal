-- SOURCE ONLY. Pure trusted-JSON calculation, NOT authentication or review authority.
CREATE SCHEMA IF NOT EXISTS tdee_rules14_macro_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA tdee_rules14_macro_private FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rules14_macro_private.number_ok(v jsonb,lo double precision,hi double precision,whole boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $f$
DECLARE n double precision;
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'number' THEN RETURN false;END IF;
 n:=(v#>>'{}')::double precision;
 RETURN n>=lo AND n<=hi AND (NOT whole OR n=trunc(n));
EXCEPTION WHEN OTHERS THEN RETURN false;
END $f$;
CREATE FUNCTION tdee_rules14_macro_private.text_ok(v jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $f$
SELECT coalesce(jsonb_typeof(v)='string' AND btrim(v#>>'{}',chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))<>'',false);
$f$;
CREATE FUNCTION tdee_rules14_macro_private.binding_ok(b jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $f$
DECLARE k text;
BEGIN
 IF jsonb_typeof(b) IS DISTINCT FROM 'object' THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['ownerId','goalId','goalRevision','preset','sourceFingerprint','policyVersion','policyDigest'] LOOP
 IF NOT tdee_rules14_macro_private.text_ok(b->k) THEN RETURN false;END IF;END LOOP;
 RETURN b->>'preset' IN ('balanced','high_protein','low_carb','lean_body','custom') AND b->>'sourceFingerprint' ~ '^[a-f0-9]{64}$' AND b->>'policyDigest' ~ '^[a-f0-9]{64}$';
END $f$;
CREATE FUNCTION tdee_rules14_macro_private.same_binding(a jsonb,b jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $f$
DECLARE k text;
BEGIN
 IF NOT tdee_rules14_macro_private.binding_ok(a) OR NOT tdee_rules14_macro_private.binding_ok(b) THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['ownerId','goalId','goalRevision','preset','sourceFingerprint','policyVersion','policyDigest'] LOOP
 IF a->k IS DISTINCT FROM b->k THEN RETURN false;END IF;END LOOP;RETURN true;
END $f$;
CREATE FUNCTION tdee_rules14_macro_private.adjust(i jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $f$
DECLARE g jsonb;c jsonb;b jsonb;r jsonb;l jsonb;choice jsonb;split jsonb;k text;
 calories double precision;now_ms double precision;protein double precision;carbs double precision;fats double precision;
 oldp double precision;oldc double precision;oldf double precision;reason text;mode text;best record;
BEGIN
 <<validation>> BEGIN
 IF i IS NULL OR i->'context' IS NULL OR i->'context' IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb) OR i->'binding' IS NULL OR i->'binding' IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb) THEN reason:='macro_context_required';EXIT validation;END IF;
 g:=i->'current';c:=i->'context';b:=i->'binding';r:=c->'policyEvidence';l:=c->'limits';
 IF jsonb_typeof(g) IS DISTINCT FROM 'object' OR jsonb_typeof(c->'current') IS DISTINCT FROM 'object' THEN reason:='macro_input_invalid';EXIT validation;END IF;
 FOREACH k IN ARRAY ARRAY['calories','proteinG','carbsG','fatsG','fiberG'] LOOP
 IF NOT tdee_rules14_macro_private.number_ok(g->k,0,10000,true) THEN reason:='macro_input_invalid';EXIT validation;END IF;END LOOP;
 IF g->'calories'='0'::jsonb OR NOT tdee_rules14_macro_private.number_ok(i->'newCalories',1,10000,true)
 OR NOT tdee_rules14_macro_private.number_ok(i->'now',0,8640000000000000,true) THEN reason:='macro_input_invalid';EXIT validation;END IF;
 calories:=(i->>'newCalories')::double precision;now_ms:=(i->>'now')::double precision;
 oldp:=(g->>'proteinG')::double precision;oldc:=(g->>'carbsG')::double precision;oldf:=(g->>'fatsG')::double precision;
 IF abs((g->>'calories')::double precision-4*oldp-4*oldc-9*oldf)>10 THEN reason:='macro_input_invalid';EXIT validation;END IF;
 IF NOT tdee_rules14_macro_private.same_binding(b,c->'binding') OR b->'sourceFingerprint' IS DISTINCT FROM i->'sourceFingerprint' THEN reason:='macro_binding_mismatch';EXIT validation;END IF;
 FOREACH k IN ARRAY ARRAY['calories','proteinG','carbsG','fatsG','fiberG'] LOOP
 IF g->k IS DISTINCT FROM c->'current'->k THEN reason:='macro_binding_mismatch';EXIT validation;END IF;END LOOP;
 IF NOT coalesce(((r->>'version'='nutrition-policy-application-v1' AND r->>'eligibility'='eligible' AND NOT (r ? 'support')) OR (r->>'version'='nutrition-policy-application-v2' AND r->>'support'='profile-supported' AND NOT (r ? 'eligibility'))),false)
 OR r->'policyVersion' IS DISTINCT FROM b->'policyVersion' OR r->'policyDigest' IS DISTINCT FROM b->'policyDigest' OR r->'sourceFingerprint' IS DISTINCT FROM b->'sourceFingerprint'
 OR NOT tdee_rules14_macro_private.text_ok(r->'profileBinding') OR NOT tdee_rules14_macro_private.text_ok(r->'journeyBinding')
 OR NOT tdee_rules14_macro_private.number_ok(r->'ageYears',19,100,true) OR NOT tdee_rules14_macro_private.number_ok(r->'computedAt',0,8640000000000000,true)
 OR NOT tdee_rules14_macro_private.number_ok(r->'expiresAt',0,8640000000000000,true) THEN reason:='nutrition_policy_evidence_required';EXIT validation;END IF;
 IF (r->>'computedAt')::double precision>now_ms OR now_ms-(r->>'computedAt')::double precision>30000 OR (r->>'expiresAt')::double precision<=now_ms THEN reason:='nutrition_policy_evidence_required';EXIT validation;END IF;
 FOREACH k IN ARRAY ARRAY['proteinMinG','proteinMaxG','carbsMinG','carbsMaxG','fatsMinG','fatsMaxG'] LOOP
 IF NOT tdee_rules14_macro_private.number_ok(l->k,0,10000) THEN reason:='macro_limits_invalid';EXIT validation;END IF;END LOOP;
 IF (l->>'proteinMinG')::double precision>(l->>'proteinMaxG')::double precision OR (l->>'carbsMinG')::double precision>(l->>'carbsMaxG')::double precision OR (l->>'fatsMinG')::double precision>(l->>'fatsMaxG')::double precision
 OR NOT tdee_rules14_macro_private.number_ok(l->'fatMinFraction',0,1) OR NOT tdee_rules14_macro_private.number_ok(l->'fatMaxFraction',0,1) THEN reason:='macro_limits_invalid';EXIT validation;END IF;
 IF (l->>'fatMinFraction')::double precision>(l->>'fatMaxFraction')::double precision THEN reason:='macro_limits_invalid';EXIT validation;END IF;
 IF b->>'preset'='custom' OR c ? 'customChoice' THEN
 choice:=c->'customChoice';
 IF NOT tdee_rules14_macro_private.same_binding(b,choice->'binding') OR NOT tdee_rules14_macro_private.text_ok(choice->'consentId')
 OR NOT tdee_rules14_macro_private.number_ok(choice->'acceptedAt',0,8640000000000000,true) THEN reason:='custom_macro_consent_required';EXIT validation;END IF;
 IF (choice->>'acceptedAt')::double precision>now_ms THEN reason:='custom_macro_consent_required';EXIT validation;END IF;
 IF choice->>'mode'='preserve_percent' THEN
 split:=choice->'splitBps';
 IF NOT tdee_rules14_macro_private.number_ok(choice->'choiceVersion',1,9007199254740991,true) OR jsonb_typeof(split) IS DISTINCT FROM 'object' THEN reason:='manual_percentage_choice_invalid';EXIT validation;END IF;
 IF NOT split ?& ARRAY['protein','carbs','fats'] OR (split-ARRAY['protein','carbs','fats'])<>'{}'::jsonb THEN reason:='manual_percentage_choice_invalid';EXIT validation;END IF;
 FOREACH k IN ARRAY ARRAY['protein','carbs','fats'] LOOP
 IF NOT tdee_rules14_macro_private.number_ok(split->k,0,10000,true) THEN reason:='manual_percentage_choice_invalid';EXIT validation;END IF;END LOOP;
 IF (split->>'protein')::double precision+(split->>'carbs')::double precision+(split->>'fats')::double precision<>10000 THEN reason:='manual_percentage_choice_invalid';EXIT validation;END IF;
 protein:=floor((calories*(split->>'protein')::double precision+20000)/40000);carbs:=floor((calories*(split->>'carbs')::double precision+20000)/40000);fats:=floor((calories*(split->>'fats')::double precision+45000)/90000);
 IF protein NOT BETWEEN (l->>'proteinMinG')::double precision AND (l->>'proteinMaxG')::double precision OR carbs NOT BETWEEN (l->>'carbsMinG')::double precision AND (l->>'carbsMaxG')::double precision OR fats NOT BETWEEN (l->>'fatsMinG')::double precision AND (l->>'fatsMaxG')::double precision
 OR 9*fats/calories NOT BETWEEN (l->>'fatMinFraction')::double precision AND (l->>'fatMaxFraction')::double precision OR abs(calories-4*protein-4*carbs-9*fats)>10 THEN reason:='manual_percentage_distribution_unavailable';EXIT validation;END IF;
 mode:='manual-percent-nearest-gram-v1';
 ELSE
 IF choice->>'mode' IS DISTINCT FROM 'smart' THEN reason:='custom_macro_consent_required';EXIT validation;END IF;
 END IF;
 END IF;
 IF mode IS NULL THEN
 IF oldp NOT BETWEEN (l->>'proteinMinG')::double precision AND (l->>'proteinMaxG')::double precision THEN reason:='protein_review_required';EXIT validation;END IF;
 SELECT f::double precision AS f,x.c INTO best
 FROM generate_series(ceil((l->>'fatsMinG')::double precision)::int,floor((l->>'fatsMaxG')::double precision)::int) f
 CROSS JOIN LATERAL (VALUES(floor((calories-4*oldp-9*f)/4)),(ceil((calories-4*oldp-9*f)/4))) x(c)
 WHERE 9*f/calories BETWEEN (l->>'fatMinFraction')::double precision AND (l->>'fatMaxFraction')::double precision
 AND calories-4*oldp-9*f>=0 AND x.c BETWEEN 0 AND 10000 AND x.c BETWEEN (l->>'carbsMinG')::double precision AND (l->>'carbsMaxG')::double precision
 AND abs(calories-4*oldp-4*x.c-9*f)<=10
 ORDER BY abs(f-oldf),abs(calories-4*oldp-4*x.c-9*f),abs(x.c-oldc),f,x.c LIMIT 1;
 IF NOT FOUND THEN reason:='macro_distribution_unavailable';EXIT validation;END IF;
 protein:=oldp;carbs:=best.c;fats:=best.f;mode:='smart-preserve-adequate-protein-v1';
 END IF;
 RETURN jsonb_build_object('kind','candidate','actionable',false,'requiresAcceptance',true,'allocationMode',mode,
 'target',jsonb_build_object('calories',calories,'proteinG',protein,'carbsG',carbs,'fatsG',fats,'fiberG',g->'fiberG'));
 END validation;
 RETURN jsonb_build_object('kind','blocked','reason',reason);
END $f$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tdee_rules14_macro_private FROM PUBLIC,anon,authenticated,service_role;



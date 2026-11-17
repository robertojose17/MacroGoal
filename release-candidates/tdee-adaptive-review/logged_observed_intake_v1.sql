-- SOURCE ONLY. Requires existing declared_nutrient helper unchanged.
CREATE FUNCTION tdee_rules14_private.logged_observed_intake_v1(c jsonb,actor uuid,start_date date,end_date date) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp SET extra_float_digits=3 AS $$
DECLARE s jsonb:=c#>'{observation,sources}';dates text[]:='{}';days jsonb:='{}';meals jsonb:='{}';day jsonb;item jsonb;meal jsonb;k text;key text;field text;output text;
 total double precision:=0;macro_total double precision;amount double precision;average double precision;observed integer;valid integer:=0;seen text[];known boolean;macros jsonb:='{"proteinG":null,"carbsG":null,"fatsG":null,"fiberG":null}';
BEGIN
 IF c#>>'{readiness,version}' IS DISTINCT FROM 'observed-log-coverage-v1' OR c#>>'{readiness,dataBasis}' IS DISTINCT FROM 'observed-logs-v1' OR c#>'{readiness,completenessEstablished}' IS DISTINCT FROM 'false'::jsonb THEN RETURN jsonb_build_object('status','unknown_calories','actionable',false,'dataBasis','observed-logs-v1','completenessEstablished',false);END IF;
 FOR day IN SELECT value FROM jsonb_array_elements(c#>'{readiness,days}') LOOP
 key:=day->>'date';IF day->'hasValidLoggedIntake'='true'::jsonb AND key>=start_date::text AND key<end_date::text AND NOT key=ANY(dates) THEN dates:=array_append(dates,key);days:=jsonb_set(days,ARRAY[key],jsonb_build_object('sum',0,'count',0,'unknown',false));END IF;END LOOP;
 observed:=cardinality(dates);
 FOR meal IN SELECT value FROM jsonb_array_elements(s->'meals') LOOP meals:=jsonb_set(meals,ARRAY[meal->>'id'],meal);END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(s->'items') LOOP
 meal:=meals->(item->>'meal_id');key:=meal->>'date';day:=days->key;IF day IS NULL OR item->'is_scheduled'='true'::jsonb THEN CONTINUE;END IF;
 IF item->'is_scheduled' IS DISTINCT FROM 'false'::jsonb OR jsonb_typeof(item->'calories') IS DISTINCT FROM 'number' OR (item->>'calories')::numeric<0 OR
 (item->'calories'='0'::jsonb AND NOT(coalesce(s->>'nutritionEvidenceVersion'='user-entered-v1',false) AND tdee_rules14_private.declared_nutrient(item,actor,'calories'))) THEN day:=jsonb_set(day,'{unknown}','true');
 ELSE day:=jsonb_set(jsonb_set(day,'{sum}',to_jsonb((day->>'sum')::double precision+(item->>'calories')::double precision)),'{count}',to_jsonb((day->>'count')::integer+1));END IF;
 days:=jsonb_set(days,ARRAY[key],day);
 END LOOP;
 FOREACH key IN ARRAY dates LOOP day:=days->key;
 IF day->'unknown'='false'::jsonb AND (day->>'count')::integer>0 AND (day->>'sum')::double precision>0 THEN valid:=valid+1;total:=total+(day->>'sum')::double precision;END IF;END LOOP;
 IF observed>0 AND valid=observed THEN average:=total/observed;END IF;
 IF s->>'nutritionFieldsVersion'='logged-macros-v1' AND observed>0 THEN
 FOR field,output IN SELECT * FROM (VALUES('protein','proteinG'),('carbs','carbsG'),('fats','fatsG'),('fiber','fiberG'))x LOOP
 macro_total:=0;known:=true;seen:='{}';
 FOR item IN SELECT value FROM jsonb_array_elements(s->'items') LOOP
 meal:=meals->(item->>'meal_id');key:=meal->>'date';IF key IS NULL OR NOT key=ANY(dates) OR item->'is_scheduled'='true'::jsonb THEN CONTINUE;END IF;
 IF item->'is_scheduled' IS DISTINCT FROM 'false'::jsonb OR jsonb_typeof(item->field) IS DISTINCT FROM 'number' OR (item->>field)::numeric<0 OR
 (item->field='0'::jsonb AND NOT(coalesce(s->>'nutritionEvidenceVersion'='user-entered-v1',false) AND tdee_rules14_private.declared_nutrient(item,actor,field))) THEN known:=false;CONTINUE;END IF;
 macro_total:=macro_total+(item->>field)::double precision;IF NOT key=ANY(seen) THEN seen:=array_append(seen,key);END IF;
 END LOOP;
 IF known AND cardinality(seen)=observed THEN macros:=jsonb_set(macros,ARRAY[output],to_jsonb(macro_total/observed));END IF;
 END LOOP;END IF;
 RETURN macros||jsonb_build_object('dataBasis','observed-logs-v1','completenessEstablished',false,'status',CASE WHEN average IS NULL THEN 'unknown_calories' ELSE 'observed_logged_days' END,'averageLoggedCaloriesOnObservedDays',average,'observedDayCount',observed,'validCalorieDayCount',valid,'unknownCalorieDayCount',observed-valid,
 'macroStatus',CASE WHEN s->>'nutritionFieldsVersion' IS DISTINCT FROM 'logged-macros-v1' THEN 'not_in_snapshot' WHEN NOT EXISTS(SELECT 1 FROM jsonb_each(macros) WHERE value='null'::jsonb) THEN 'logged_values' ELSE 'unknown_values' END,'imputedDays',0,'actionable',false);
END $$;
REVOKE ALL ON FUNCTION tdee_rules14_private.logged_observed_intake_v1(jsonb,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;

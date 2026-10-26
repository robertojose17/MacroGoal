-- PROPOSED ONLY. Not applied. Existing tables; service-role-only invoker functions.
-- Review limits and rollout flag before deployment. No client can supply a signed proposal.
begin;
create or replace function public.claim_barcode_recovery(p_owner uuid,p_submission uuid,p_barcode text,p_phase text)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.food_submissions; used integer;
begin
  if p_phase not in ('discover','photos') or p_barcode !~ '^[0-9]{8,14}$' then raise exception 'invalid_recovery'; end if;
  perform pg_advisory_xact_lock(hashtextextended('barcode-recovery-budget',0));
  select * into s from public.food_submissions where id=p_submission for update;
  if not found then
    if p_phase <> 'discover' then raise exception 'missing_session'; end if;
    select count(*) into used from public.food_submissions where extracted_data->>'recovery_version'='1' and created_at>now()-interval '1 hour' and submitted_by_user_id=p_owner;
    if used>=6 then raise exception 'user_limit'; end if;
    select count(*) into used from public.food_submissions where extracted_data->>'recovery_version'='1' and created_at>now()-interval '1 day';
    if used>=100 then raise exception 'global_limit'; end if;
    insert into public.food_submissions(id,barcode,submitted_by_user_id,photo_label_url,type,status,extracted_data)
      values(p_submission,p_barcode,p_owner,'','correction','pending',jsonb_build_object('recovery_version',1,'discover_claimed',true,'photo_attempts',0));
    return 0;
  end if;
  if s.submitted_by_user_id<>p_owner or s.barcode<>p_barcode or s.status<>'pending' or s.extracted_data->>'recovery_version' is distinct from '1' or s.created_at<now()-interval '20 minutes' then raise exception 'invalid_session'; end if;
  if p_phase='discover' or coalesce((s.extracted_data->>'photo_attempts')::integer,0)>=2 then raise exception 'already_claimed'; end if;
  update public.food_submissions set extracted_data=jsonb_set(extracted_data,'{photo_attempts}',to_jsonb(coalesce((extracted_data->>'photo_attempts')::integer,0)+1)) where id=p_submission;
  return coalesce((s.extracted_data->>'photo_attempts')::integer,0)+1;
end $$;
revoke all on function public.claim_barcode_recovery(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_barcode_recovery(uuid,uuid,text,text) to service_role;

create or replace function public.confirm_barcode_recovery(p_owner uuid,p_submission uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.food_submissions; item public.food_items; saved public.food_items;
  code text:=p_payload->>'barcode'; aliases text[]; matches integer; k text;
  user_bound boolean:=coalesce(p_payload#>>'{provenance,identity}','')='user_confirmed_barcode';
begin
  if code !~ '^[0-9]{8,14}$' or length(coalesce(p_payload->>'name',''))=0 or length(coalesce(p_payload->>'brand',''))=0 then raise exception 'invalid_identity'; end if;
  if jsonb_typeof(p_payload->'serving_size') is distinct from 'number' or (p_payload->>'serving_size')::numeric<=0 then raise exception 'invalid_serving'; end if;
  foreach k in array array['calories','protein','carbs','fat'] loop
    if jsonb_typeof(p_payload->k) is distinct from 'number' or (p_payload->>k)::numeric<0 then raise exception 'invalid_nutrition'; end if;
  end loop;
  if p_payload->'fiber' is not null and p_payload->'fiber' <> 'null'::jsonb and
    (jsonb_typeof(p_payload->'fiber') is distinct from 'number' or (p_payload->>'fiber')::numeric<0) then raise exception 'invalid_fiber'; end if;
  if user_bound and (
    p_payload#>'{provenance,source_barcode}' is distinct from 'null'::jsonb or
    p_payload#>'{provenance,exact_barcode}' is distinct from 'false'::jsonb or
    coalesce(p_payload#>>'{provenance,kind}','') not in ('source_record','source_label')
  ) then raise exception 'invalid_user_binding'; end if;
  aliases:=case when length(code)=13 and left(code,1)='0' then array[code,substring(code from 2)] else array[code] end;
  perform pg_advisory_xact_lock(hashtextextended('barcode-recovery:'||code,0));
  select * into s from public.food_submissions where id=p_submission and submitted_by_user_id=p_owner for update;
  if not found then raise exception 'missing_submission'; end if;
  if not (s.barcode=any(aliases)) then raise exception 'barcode_mismatch'; end if;
  if s.status='approved' then
    if s.extracted_data->'confirmed_payload'<>p_payload then raise exception 'already_confirmed_differently'; end if;
    return s.extracted_data->'confirmed_item';
  end if;
  if s.status<>'pending' or s.created_at<now()-interval '20 minutes' then raise exception 'expired_submission'; end if;
  if (p_payload->>'revision')::integer is distinct from coalesce((s.extracted_data->>'photo_attempts')::integer,0) then raise exception 'proposal_superseded'; end if;
  select count(*) into matches from public.food_items where barcode=any(aliases);
  if matches>1 then raise exception 'ambiguous_barcode'; end if;
  select * into item from public.food_items where barcode=any(aliases) for update;
  if p_payload->>'expected_id' is not null then
    if item.id is null or item.id::text<>p_payload->>'expected_id' or item.updated_at is distinct from (p_payload->>'expected_updated_at')::timestamptz then raise exception 'catalog_changed'; end if;
  elsif item.id is not null then raise exception 'catalog_changed'; end if;
  if item.id is null then
    insert into public.food_items(barcode,name,brand,calories,protein,carbs,fat,fiber,serving_size,serving_unit,serving_quantity,macros_per,source,verified,confidence,ai_verified,ai_verified_source,updated_at)
    values(code,p_payload->>'name',p_payload->>'brand',(p_payload->>'calories')::numeric,(p_payload->>'protein')::numeric,(p_payload->>'carbs')::numeric,(p_payload->>'fat')::numeric,(p_payload->>'fiber')::numeric,(p_payload->>'serving_size')::numeric,'g',p_payload->>'serving_quantity','serving','user',not user_bound,case when user_bound then 'medium' else 'high' end,not user_bound,'barcode_recovery:'||(case when user_bound then 'user_confirmed_barcode:' else '' end)||(p_payload#>>'{provenance,kind}'),now()) returning * into saved;
  else
    update public.food_items set name=p_payload->>'name',brand=p_payload->>'brand',
      calories=(p_payload->>'calories')::numeric,protein=(p_payload->>'protein')::numeric,carbs=(p_payload->>'carbs')::numeric,fat=(p_payload->>'fat')::numeric,fiber=(p_payload->>'fiber')::numeric,
      serving_size=(p_payload->>'serving_size')::numeric,serving_quantity=p_payload->>'serving_quantity',serving_unit='g',macros_per='serving',
      serving_description=null,serving_count=null,source='user',verified=not user_bound,confidence=case when user_bound then 'medium' else 'high' end,ai_verified=not user_bound,
      ai_verified_source='barcode_recovery:'||(case when user_bound then 'user_confirmed_barcode:' else '' end)||(p_payload#>>'{provenance,kind}'),last_verified_at=case when user_bound then null else now() end,updated_at=now()
      where id=item.id returning * into saved;
  end if;
  -- A newly confirmed serving/label invalidates ALL older auxiliary nutrient evidence.
  -- Null means not read; do not retain old per-100g values under a per-serving basis.
  update public.food_items set
    sugar=null,
    sodium=null,
    saturated_fat=null,
    trans_fat=null,
    polyunsaturated_fat=null,
    monounsaturated_fat=null,
    cholesterol=null,
    added_sugars=null,
    sugar_alcohols=null,
    soluble_fiber=null,
    insoluble_fiber=null,
    starch=null,
    vitamin_a=null,
    vitamin_c=null,
    vitamin_d=null,
    vitamin_e=null,
    vitamin_k=null,
    vitamin_b1=null,
    vitamin_b2=null,
    vitamin_b3=null,
    vitamin_b5=null,
    vitamin_b6=null,
    vitamin_b9=null,
    vitamin_b12=null,
    biotin=null,
    choline=null,
    calcium=null,
    iron=null,
    potassium=null,
    phosphorus=null,
    magnesium=null,
    zinc=null,
    selenium=null,
    copper=null,
    manganese=null,
    chromium=null,
    molybdenum=null,
    iodine=null,
    chloride=null,
    saturated_fat_g=null,
    polyunsaturated_fat_g=null,
    monounsaturated_fat_g=null,
    trans_fat_g=null,
    cholesterol_mg=null,
    sugar_g=null,
    added_sugar_g=null,
    soluble_fiber_g=null,
    insoluble_fiber_g=null,
    water_g=null,
    alcohol_g=null,
    vitamin_a_mcg=null,
    vitamin_c_mg=null,
    vitamin_d_mcg=null,
    vitamin_e_mg=null,
    vitamin_k_mcg=null,
    vitamin_b1_mg=null,
    vitamin_b2_mg=null,
    vitamin_b3_mg=null,
    vitamin_b6_mg=null,
    vitamin_b12_mcg=null,
    folate_mcg=null,
    biotin_mcg=null,
    pantothenic_acid_mg=null,
    choline_mg=null,
    calcium_mg=null,
    iron_mg=null,
    magnesium_mg=null,
    phosphorus_mg=null,
    potassium_mg=null,
    sodium_mg=null,
    zinc_mg=null,
    copper_mg=null,
    manganese_mg=null,
    selenium_mcg=null,
    chromium_mcg=null,
    iodine_mcg=null,
    nutriments='{}'::jsonb,off_data=null,usda_fdc_id=null,source_id=null,data_quality_score=null,
    generic_name=null,product_name=p_payload->>'name',brands=p_payload->>'brand',
    serving_description=null,serving_count=null,image_url=p_payload->>'image_url',
    ingredients_text=null,allergens=null,nutriscore_grade=null
    where id=saved.id returning * into saved;
  update public.food_submissions set status='approved',food_item_id=saved.id,
    photo_label_url=case when p_payload#>>'{provenance,kind}'='physical_label' then p_payload#>>'{provenance,url}' else '' end,
    photo_front_url=p_payload#>>'{provenance,front_url}',
    extracted_data=extracted_data||jsonb_build_object('confirmed_payload',p_payload,'confirmed_item',to_jsonb(saved),'confirmed_at',now()),
    ai_notes='Explicit identity, serving, nutrition and shared-catalog confirmation'
    where id=p_submission;
  return to_jsonb(saved);
end $$;
revoke all on function public.confirm_barcode_recovery(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_barcode_recovery(uuid,uuid,jsonb) to service_role;
commit;

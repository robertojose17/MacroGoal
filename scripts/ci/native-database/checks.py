"""Native PostgreSQL assertions. No external DB, provider request, SDK or PGlite."""
import hashlib
import json
import re
import subprocess

PRIVATE = 'macrogoal_food_private'
PUBLIC_RPCS = {
    'claim_food_nutrition_refresh_v1': ('uuid,integer,uuid,text,text', "NULL,0,NULL,'usda','123'"),
    'refresh_food_nutrition_v1': ('uuid,integer,uuid,jsonb', "NULL,0,NULL,'{}'::jsonb"),
    'read_food_nutrition_refresh_state_v1': ('uuid', 'NULL'),
    'create_off_mass_food_v1': ('uuid,text,jsonb', "NULL,NULL,'{}'::jsonb"),
    'read_food_search_snapshots_v1': ('uuid[]', "'{}'::uuid[]"),
}
SERVICE_HELPERS = {'claim_refresh_v1', 'refresh_nutrients_v1', 'read_refresh_state_v1',
                   'create_off_mass_v1', 'read_search_snapshots_v1'}
DEFINERS = SERVICE_HELPERS | {'guard_food_nutrition_v1', 'reserve_food_identity_mass_v1'}
NEW_TABLES = ['nutrition_refresh_state_v1', 'nutrition_refresh_receipts_v1',
              'nutrition_enrichment_context_v1', 'food_identity_reservations_mass_v1',
              'off_source_bindings_v1', 'off_creation_receipts_v1']


def verify_inputs(root, publication=True):
    manifest = json.loads((root / 'frozen-inputs.json').read_text())
    assert len(manifest) == 6
    for relative, item in manifest.items():
        assert hashlib.sha256((root / relative).read_bytes()).hexdigest() == item['sha256'], relative
    if publication:
        # Only fixed checkout-relative paths. Runtime never offers a bypass or
        # accepts an arbitrary alternate checkout/DB/manifest from environment.
        repo = root.parents[2]
        mapping = {
            'sql/01-nutrition.sql': 'release-candidates/food-catalog/sql/01-nutrition/enrichment.CANDIDATE.sql',
            'sql/02-off-registry.sql': 'release-candidates/food-catalog/sql/02-off-registry/off-mass.CANDIDATE.sql',
            'sql/03-search.sql': 'release-candidates/food-catalog/sql/03-search/search-snapshots.CANDIDATE.sql',
            'src/provider.mjs': 'supabase/functions/_shared/nutritionProvider.mjs',
            'src/offMass.mjs': 'supabase/functions/_shared/offMass.mjs',
        }
        for relative, target in mapping.items():
            candidate = repo / target
            assert candidate.is_file(), 'Missing exact publication source: ' + target
            assert (root / relative).read_bytes() == candidate.read_bytes(), 'Published source differs from native fixture: ' + target



def record(c, name, **detail):
    c['report']['tests'].append({'name': name, 'status': 'passed', **detail})
    c['save']()


def functions(root):
    out = {}
    for name in ['01-nutrition', '02-off-registry', '03-search']:
        for schema, fn, args in re.findall(r'CREATE(?: OR REPLACE)? FUNCTION (\w+)\.(\w+)\(([^)]*)\)', (root / f'sql/{name}.sql').read_text()):
            types = ','.join(a.strip().split()[-1] for a in args.split(',') if a.strip())
            out[f'{schema}.{fn}({types})'] = (schema, fn, types)
    assert len(out) == 23, out
    return out


def security_checks(c, final=False):
    sql, lit, Session = (c[k] for k in ['sql', 'lit', 'Session'])
    rows = []
    for signature, (schema, name, types) in functions(c['R']).items():
        actual = json.loads(sql(f"""SELECT json_build_object(
          'signature', {lit(signature)}, 'owner',pg_get_userbyid(p.proowner),
          'security_definer',p.prosecdef,'config',p.proconfig,
          'acl', coalesce((SELECT json_agg(json_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'[]'::json),
          'md5',md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.oid={lit(signature)}::regprocedure"""))
        assert actual['owner'] == 'postgres', actual
        assert actual['security_definer'] == (name in DEFINERS), actual
        assert actual['config'] == ['search_path=""'], actual
        app_grantees = {'service_role'} if name in SERVICE_HELPERS or schema == 'public' else set()
        if name == 'canonical_gtin_mass_v1':
            app_grantees = {'service_role', 'anon', 'authenticated'}
        grants = {(a['grantee'], a['privilege'], a['grantable']) for a in actual['acl']}
        assert grants == {('postgres', 'EXECUTE', False)} | {(r, 'EXECUTE', False) for r in app_grantees}, actual
        for role in ['anon', 'authenticated', 'service_role']:
            assert sql(f"SELECT has_function_privilege({lit(role)},{lit(signature)},'EXECUTE')") == ('t' if role in app_grantees else 'f')
        rows.append(actual)
    for table in NEW_TABLES:
        actual = json.loads(sql(f"""SELECT json_build_object('name',relname,'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'force_rls',relforcerowsecurity,'policies',(SELECT count(*) FROM pg_policy WHERE polrelid=c.oid),'acl',coalesce(relacl::text,'<owner-default>')) FROM pg_class c WHERE c.oid={lit(PRIVATE+'.'+table)}::regclass"""))
        assert actual['owner'] == 'postgres' and actual['rls'] and actual['force_rls'] and actual['policies'] == 0, actual
        for role in ['anon', 'authenticated', 'service_role']:
            for privilege in ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']:
                assert sql(f"SELECT has_table_privilege({lit(role)},{lit(PRIVATE+'.'+table)},{lit(privilege)})") == 'f', (table, role, privilege)
    assert sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolcanlogin)") == '0'
    assert sql("SELECT bool_and(NOT pg_has_role(rolname,'postgres','MEMBER')) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')") == 't'
    assert sql("SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'") == 't'
    assert sql("SELECT bool_and(NOT rolbypassrls) FROM pg_roles WHERE rolname IN ('anon','authenticated')") == 't'
    assert sql(f"SELECT has_schema_privilege('service_role','{PRIVATE}','USAGE')") == 't'
    for role in ['anon', 'authenticated']:
        assert sql(f"SELECT has_schema_privilege('{role}','{PRIVATE}','USAGE')") == 'f'
        for name, (_, args) in PUBLIC_RPCS.items():
            Session().run(f"SET ROLE {role}; SELECT public.{name}({args});", error='42501')
            # JWT GUC spoofing does not bypass SQL role enforcement.
            Session().run(f"SET ROLE {role}; SELECT set_config('request.jwt.claim.role','service_role',false); SELECT public.{name}({args});", error='42501')
        Session().run(f"SET ROLE {role}; SELECT * FROM {PRIVATE}.nutrition_current;", error='42501')
    for table in NEW_TABLES:
        Session().run(f"SET ROLE service_role; SELECT * FROM {PRIVATE}.{table};", error='42501')
    # BypassRLS cannot substitute for an ACL grant.
    Session().run(f"SET ROLE service_role; INSERT INTO {PRIVATE}.nutrition_enrichment_context_v1 VALUES(pg_backend_pid(),txid_current(),gen_random_uuid(),'{{}}','{{}}');", error='42501')
    triggers = json.loads(sql("SELECT json_agg(json_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.food_items'::regclass AND NOT tgisinternal"))
    assert [r['name'] for r in triggers] == ['audit_food_nutrition_v1','guard_food_nutrition_v1','identity_reservation_mass_v1'], triggers
    assert [r['enabled'] for r in triggers] == ['O','O','A'], triggers
    assert sql("SELECT md5(pg_get_functiondef('macrogoal_food_private.audit_food_nutrition_v1()'::regprocedure))") == '9f35470f0ac6944adc5332aeb2284f3b'
    assert sql("SELECT md5(pg_get_functiondef('macrogoal_food_private.nutrition_snapshot_v1(jsonb)'::regprocedure))") == 'a607246db719d928d9ccefed9377b6f4'
    assert sql("SELECT md5(pg_get_functiondef('macrogoal_food_private.guard_food_nutrition_v1()'::regprocedure))") == 'ae00147e4dcf660a7575a74e9ca62ad8'
    c['report']['security_inventory_final' if final else 'security_inventory'] = {'functions': rows, 'triggers':triggers,'new_tables':NEW_TABLES}
    record(c, 'exact function owners, ACLs, role boundaries, forced RLS and trigger authority' + (' after workload' if final else ''))


def guard_checks(c):
    """Drift mutations only in newly created local databases, never the main fixture."""
    sql, lit, command = (c[k] for k in ['sql', 'lit', 'command'])
    fixture = (c['R'] / 'sql/fixture.sql').read_text()
    fixture = 'CREATE SCHEMA' + fixture.split('CREATE SCHEMA', 1)[1]  # cluster roles already exist
    cases = [
        ('nutrition_definition_drift', [], "ALTER FUNCTION macrogoal_food_private.guard_food_nutrition_v1() COST 101;", '01-nutrition', 'live_guard_drift_stop'),
        ('registry_owner_drift', ['01-nutrition'], "ALTER FUNCTION macrogoal_food_private.guard_food_nutrition_v1() OWNER TO authenticated;", '02-off-registry', 'mass_dependency_owner_drift'),
        ('registry_definition_drift', ['01-nutrition'], "ALTER FUNCTION macrogoal_food_private.guard_food_nutrition_v1() COST 101;", '02-off-registry', 'mass_dependency_drift_stop'),
        ('search_untrusted_installer', ['01-nutrition','02-off-registry'], 'SET ROLE service_role;', '03-search', 'search_snapshot_requires_trusted_postgres_owner'),
    ]
    catalog = """SELECT json_build_object('functions',coalesce((SELECT json_agg(json_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner),md5(pg_get_functiondef(p.oid)),p.proacl::text) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','macrogoal_food_private')),'[]'::json),'tables',coalesce((SELECT json_agg(json_build_array(n.nspname,c.relname,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity,c.relacl::text) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','macrogoal_food_private') AND c.relkind='r'),'[]'::json))"""
    for tag, prefix, mutation, target, error in cases:
        db = 'guard_' + tag
        sql('CREATE DATABASE ' + db)
        args = c['args'](); args[args.index('-d')+1] = db
        def run(text, check=True):
            if check:
                return command(args, input=text).stdout.strip()
            return subprocess.run(args, env=c['ENV'], input=text, text=True, capture_output=True, timeout=30)
        try:
            run(fixture)
            for filename in prefix:
                run((c['R'] / f'sql/{filename}.sql').read_text())
            if mutation.startswith('ALTER'):
                run(mutation)
                mutation = ''
            before = run(catalog)
            result = run(mutation + (c['R'] / f'sql/{target}.sql').read_text(), check=False)
            assert result.returncode != 0 and error in result.stderr, (tag,result.stderr)
            assert run(catalog) == before, tag + ' partial migration escaped rollback'
            record(c, tag + ' rejects atomically with no new objects')
        finally:
            sql('DROP DATABASE ' + db)


def nutrition_checks(c):
    sql, lit, Session, uid = (c[k] for k in ['sql', 'lit', 'Session', 'uid'])
    def seed(verified=True):
        food=uid()
        sql(f"INSERT INTO public.food_items(id,name,source,usda_fdc_id,macros_per,calories,protein,carbs,fat,verified) VALUES({lit(food)},'Banana, raw','usda','123','100g',89,1,23,0.3,{str(verified).lower()})")
        return food
    def claim(food,req):
        return f"SET ROLE service_role; SELECT public.claim_food_nutrition_refresh_v1({lit(food)},1,{lit(req)},'usda','123');"
    def refresh(food,req):
        return f"SET ROLE service_role; SELECT public.refresh_food_nutrition_v1({lit(food)},1,{lit(req)},{lit(e)}::jsonb);"
    def corrected(food, calories):
        return f"BEGIN; INSERT INTO {PRIVATE}.nutrition_write_context VALUES(pg_backend_pid(),txid_current(),{lit(uid())},'confirmed_v1',{lit(food)},NULL); SET ROLE service_role; UPDATE public.food_items SET calories={calories} WHERE id={lit(food)};"
    def row(food):
        return json.loads(sql(f"SELECT to_jsonb(f) FROM public.food_items f WHERE id={lit(food)}"))
    e=c['command'](['node',str(c['R']/'sample.mjs'),'usda']).stdout.strip()
    food, req1, req2 = seed(), uid(), uid()
    gate,a,b=Session(),Session(),Session()
    gate.run(f"BEGIN; SELECT id FROM public.food_items WHERE id={lit(food)} FOR UPDATE;")
    a.send(claim(food,req1)); b.send(claim(food,req2));a.lock_wait();b.lock_wait();gate.run('COMMIT;')
    ar,br=c['json_result'](a.result()),c['json_result'](b.result())
    assert sorted([ar['status'],br['status']])==['busy','claimed']
    winner=req1 if ar['status']=='claimed' else req2
    record(c,'simultaneous nutrition claims serialize to exactly one lease')
    before=row(food)
    gate,a,b=Session(),Session(),Session()
    gate.run(f"BEGIN; SELECT id FROM public.food_items WHERE id={lit(food)} FOR UPDATE;")
    a.send(refresh(food,winner));b.send(refresh(food,winner));a.lock_wait();b.lock_wait();gate.run('COMMIT;')
    ar,br=c['json_result'](a.result()),c['json_result'](b.result())
    assert ar==br and ar['status']=='applied' and ar['revision']==2
    after=row(food)
    assert after['vitamin_c_mg']==8.7 and after['vitamin_c']==8.7
    for key in ['vitamin_c_mg','vitamin_c']:
        before.pop(key);after.pop(key)
    assert after==before
    assert sql(f"SELECT count(*) FROM {PRIVATE}.nutrition_evidence WHERE food_id={lit(food)}")=='1'
    assert sql(f"SELECT count(*) FROM {PRIVATE}.nutrition_refresh_receipts_v1 WHERE request_id={lit(winner)}")=='1'
    assert sql(f"SELECT count(*) FROM {PRIVATE}.nutrition_enrichment_context_v1")=='0'
    record(c,'simultaneous exact nutrition finalization writes once and preserves every other field')

    food,req=seed(),uid()
    sql(claim(food,req))
    a,b=Session(),Session();a.run(corrected(food,90));b.send(refresh(food,req));b.lock_wait();a.run('COMMIT;')
    result=c['json_result'](b.result())
    assert result['status']=='evidence_only' and result['reason']=='revision_conflict'
    assert row(food)['calories']==90 and row(food)['vitamin_c_mg'] is None
    assert sql(f"SELECT confirmed AND revision=2 FROM {PRIVATE}.nutrition_current WHERE food_id={lit(food)}")=='t'
    assert sql(f"SELECT count(*) FROM {PRIVATE}.nutrition_evidence WHERE food_id={lit(food)}")=='1'
    record(c,'concurrent correction wins over stale nutrition refresh without losing evidence')

    food=seed(False)
    a,b=Session(),Session();a.run(corrected(food,91))
    b.send(f"BEGIN; SET ROLE service_role; INSERT INTO {PRIVATE}.nutrition_write_context VALUES(pg_backend_pid(),txid_current(),{lit(uid())},'usda_import_v1',NULL,NULL); UPDATE public.food_items SET calories=0 WHERE id={lit(food)}; COMMIT;")
    b.lock_wait();a.run('COMMIT;');b.result()
    assert row(food)['calories']==91
    assert sql(f"SELECT revision=2 AND confirmed FROM {PRIVATE}.nutrition_current WHERE food_id={lit(food)}")=='t'
    assert sql(f"SELECT count(*) FROM {PRIVATE}.nutrition_changes WHERE food_id={lit(food)}")=='2'
    record(c,'concurrent importer-shaped write preserves corrected winner and audit revision; no importer body read')

    food,req=seed(),uid();sql(claim(food,req));before=row(food)
    sql("CREATE FUNCTION public.synthetic_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_audit_failure'; END $$; CREATE TRIGGER zz_synthetic_audit_failure AFTER UPDATE ON public.food_items FOR EACH ROW EXECUTE FUNCTION public.synthetic_audit_failure();")
    try:
        Session().run(refresh(food,req),error='P0001')
        assert row(food)==before
        for table in ['nutrition_evidence','nutrition_refresh_receipts_v1','nutrition_enrichment_context_v1']:
            assert sql(f"SELECT count(*) FROM {PRIVATE}.{table} WHERE food_id={lit(food)}")=='0'
        assert sql(f"SELECT revision FROM {PRIVATE}.nutrition_current WHERE food_id={lit(food)}")=='1'
        assert sql(f"SELECT count(*) FROM {PRIVATE}.nutrition_changes WHERE food_id={lit(food)}")=='1'
    finally:
        sql('DROP TRIGGER zz_synthetic_audit_failure ON public.food_items; DROP FUNCTION public.synthetic_audit_failure();')
    record(c,'late audit failure atomically rolls back canonical, evidence, receipt and capability')


def snapshot_checks(c):
    sql,lit,Session,uid=(c[k] for k in ['sql','lit','Session','uid'])
    food=uid()
    sql(f"INSERT INTO public.food_items(id,name,calories,verified) VALUES({lit(food)},'Snapshot fixture',111,false)")
    a,b=Session(),Session()
    a.run(f"BEGIN; INSERT INTO {PRIVATE}.nutrition_write_context VALUES(pg_backend_pid(),txid_current(),{lit(uid())},'confirmed_v1',{lit(food)},NULL); SET ROLE service_role; UPDATE public.food_items SET calories=222 WHERE id={lit(food)};")
    query=f"SET ROLE service_role; SELECT row_to_json(s) FROM public.read_food_search_snapshots_v1(ARRAY[{lit(food)}::uuid]) s;"
    during=c['json_result'](b.run(query))
    assert during['snapshot']['calories']==111 and during['protected'] is False
    a.run('COMMIT;')
    after=c['json_result'](b.run(query))
    assert after['snapshot']['calories']==222 and after['protected'] is True
    record(c,'concurrent search snapshot never pairs uncommitted tuple with private confirmation state')
    assert sql("SET ROLE service_role; SELECT count(*) FROM public.read_food_search_snapshots_v1('{}'::uuid[])")=='0'
    for args in ['NULL::uuid[]',"ARRAY[NULL]::uuid[]",f"array_fill({lit(food)}::uuid,ARRAY[101])",f"array_fill({lit(food)}::uuid,ARRAY[2,2])"]:
        Session().run(f'SET ROLE service_role; SELECT * FROM public.read_food_search_snapshots_v1({args});',error='22023')
    record(c,'search snapshot bounds reject null, oversized and multidimensional arrays')
    # Rehearse only disable-and-drain. Never execute historical guard replacement.
    inventory=sql("SELECT json_agg(json_build_array(oid,proacl::text,md5(pg_get_functiondef(oid))) ORDER BY oid) FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'macrogoal_food_private'::regnamespace)")
    counts=sql("SELECT json_build_array((SELECT count(*) FROM public.food_items),(SELECT count(*) FROM macrogoal_food_private.nutrition_evidence),(SELECT count(*) FROM macrogoal_food_private.nutrition_changes),(SELECT count(*) FROM macrogoal_food_private.food_identity_reservations_mass_v1))")
    functions_=','.join('public.'+name+'('+types+')' for name,(types,_) in PUBLIC_RPCS.items())
    a=Session()
    a.run(f"BEGIN; REVOKE EXECUTE ON FUNCTION {functions_} FROM service_role;")
    # Every expected predecessor definition, owner and ACL must still match before
    # applying a rollback. This test injects drift and proves that guard fails.
    expected=sql("SELECT md5(pg_get_functiondef('macrogoal_food_private.claim_refresh_v1(uuid,integer,uuid,text,text)'::regprocedure))")
    a.run('ALTER FUNCTION macrogoal_food_private.claim_refresh_v1(uuid,integer,uuid,text,text) COST 101;')
    a.run(f"DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.claim_refresh_v1(uuid,integer,uuid,text,text)'::regprocedure))<>{lit(expected)} THEN RAISE EXCEPTION 'rollback_predecessor_drift_stop' USING ERRCODE='55000'; END IF; END $$;", error='55000')
    assert sql("SELECT json_agg(json_build_array(oid,proacl::text,md5(pg_get_functiondef(oid))) ORDER BY oid) FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'macrogoal_food_private'::regnamespace)")==inventory
    a=Session();a.run(f"BEGIN; REVOKE EXECUTE ON FUNCTION {functions_} FROM service_role;")
    a.run("SET LOCAL ROLE service_role; SELECT * FROM public.read_food_search_snapshots_v1('{}'::uuid[]);",error='42501')
    assert sql("SELECT json_agg(json_build_array(oid,proacl::text,md5(pg_get_functiondef(oid))) ORDER BY oid) FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'macrogoal_food_private'::regnamespace)")==inventory
    assert sql("SELECT json_build_array((SELECT count(*) FROM public.food_items),(SELECT count(*) FROM macrogoal_food_private.nutrition_evidence),(SELECT count(*) FROM macrogoal_food_private.nutrition_changes),(SELECT count(*) FROM macrogoal_food_private.food_identity_reservations_mass_v1))")==counts
    record(c,'rollback drift stop and transactional RPC revocation preserve definitions, ACLs and all retained records')

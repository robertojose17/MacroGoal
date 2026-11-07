"""Separate synthetic database: observed public policy shape reaches real guards.

No production connection or ACL change. Does not exercise DELETE, TRUNCATE,
REFERENCES, TRIGGER or MAINTAIN or claim full live-schema parity.
"""
import hashlib
import json
import re
import subprocess
from checks import PRIVATE, PUBLIC_RPCS, NEW_TABLES

DATABASE = 'authenticated_writer_fixture'
TABLES = ['public.food_items'] + [PRIVATE + '.' + name for name in [
    'nutrition_current', 'nutrition_changes', 'nutrition_evidence', 'nutrition_write_context',
] + NEW_TABLES]
METADATA = {
    'verified': True,
    'ai_verified': True,
    'ai_verified_source': 'barcode_recovery:synthetic',
    'ai_verified_at': '2026-11-07T00:00:00Z',
    'last_verified_at': '2026-11-07T00:00:00Z',
}
SPOOF = "SELECT set_config('request.jwt.claim.role','service_role',false); SELECT set_config('request.jwt.claims','{\"role\":\"service_role\",\"app_metadata\":{\"role\":\"service_role\"}}',false);"


def snapshot(c):
    # Every canonical row, revision, audit, evidence, context, receipt and registry
    # row is compared, including timestamps, rather than only aggregate counts.
    return {table: json.loads(c['sql'](f"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM {table} t")) for table in TABLES}


def proof(before):
    return hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest()


def denial(c, statement, state, message):
    before = snapshot(c)
    result = subprocess.run(c['args'](), env=c['ENV'], text=True, capture_output=True,
                            input="SET statement_timeout='12s'; SET lock_timeout='10s'; " + statement, timeout=30)
    assert result.returncode != 0 and re.search(r'ERROR:\s+' + re.escape(state) + r':', result.stderr), result.stderr
    assert message in result.stderr, (message, result.stderr)
    assert snapshot(c) == before, 'Denied statement changed canonical/private state'
    return {'sqlstate': state, 'message': message, 'unchanged_state_sha256': proof(before)}


def policy_inventory(c):
    sql = c['sql']
    meta = json.loads(sql("""SELECT json_build_object('rls',relrowsecurity,'force_rls',relforcerowsecurity,
      'owner',pg_get_userbyid(relowner)) FROM pg_class WHERE oid='public.food_items'::regclass"""))
    assert meta == {'rls': True, 'force_rls': False, 'owner': 'postgres'}, meta
    policies = json.loads(sql("SELECT json_agg(json_build_object('name',policyname,'roles',roles,'cmd',cmd,'qual',qual,'with_check',with_check) ORDER BY policyname) FROM pg_policies WHERE schemaname='public' AND tablename='food_items'"))
    assert policies == [
        {'name': 'food_items_authenticated_insert', 'roles': ['authenticated'], 'cmd': 'INSERT', 'qual': None, 'with_check': 'true'},
        {'name': 'food_items_authenticated_update', 'roles': ['authenticated'], 'cmd': 'UPDATE', 'qual': 'true', 'with_check': 'true'},
        {'name': 'food_items_public_read', 'roles': ['authenticated'], 'cmd': 'SELECT', 'qual': 'true', 'with_check': None},
        {'name': 'food_items_select_all', 'roles': ['public'], 'cmd': 'SELECT', 'qual': 'true', 'with_check': None},
    ], policies
    for role in ['anon', 'authenticated']:
        for privilege in ['SELECT', 'INSERT', 'UPDATE']:
            expected = role == 'authenticated' or privilege == 'SELECT'
            assert sql(f"SELECT has_table_privilege('{role}','public.food_items','{privilege}')") == ('t' if expected else 'f')
    meta.update(policies=policies, tested_grants={'anon': ['SELECT'], 'authenticated': ['SELECT', 'INSERT', 'UPDATE']})
    return meta


def run(parent, http=False):
    parent['sql']('CREATE DATABASE ' + DATABASE)
    c = dict(parent)
    c['database'] = DATABASE
    c['sql'] = lambda text: parent['sql'](text, database=DATABASE)
    c['args'] = lambda: parent['args'](database=DATABASE)
    c['Session'] = lambda: parent['Session'](database=DATABASE)
    report = {'status': 'running', 'database': DATABASE, 'tests': [],
              'scope': 'separate synthetic database; observed SELECT/INSERT/UPDATE policy shape; not a full live schema or ACL mirror'}
    parent['report']['authenticated_writers'] = report
    parent['save']()
    def passed(name, **detail):
        report['tests'].append({'name': name, 'status': 'passed', **detail})
        parent['save']()
    sql, lit, uid, Session = (c[k] for k in ['sql', 'lit', 'uid', 'Session'])
    try:
        fixture = (c['R'] / 'sql/fixture.sql').read_text()
        sql('CREATE SCHEMA' + fixture.split('CREATE SCHEMA', 1)[1])
        for name in ['01-nutrition', '02-off-registry', '03-search']:
            sql((c['R'] / f'sql/{name}.sql').read_text())
        sql((c['R'] / 'sql/authenticated-policy.sql').read_text())
        report['policy_inventory'] = policy_inventory(c)
        passed('observed public RLS policies and narrow necessary grants installed only in separate fixture')
        food = uid()
        sql(f"SET ROLE authenticated; INSERT INTO public.food_items(id,name,source,macros_per,calories,protein,carbs,fat) VALUES({lit(food)},'Synthetic local fixture','openfoodfacts','100g',400,10,60,10);")
        sql(f"SET ROLE authenticated; UPDATE public.food_items SET name='Edited synthetic food',calories=410 WHERE id={lit(food)};")
        assert sql(f"SELECT name='Edited synthetic food' AND calories=410 AND NOT verified FROM public.food_items WHERE id={lit(food)}") == 't'
        assert sql(f"SELECT revision=2 AND NOT confirmed FROM {PRIVATE}.nutrition_current WHERE food_id={lit(food)}") == 't'
        passed('authenticated unverified INSERT and nutrition UPDATE reach guards and succeed with two audited revisions')
        for key, value in METADATA.items():
            value_sql = str(value).lower() if isinstance(value, bool) else lit(value)
            insert = f"SET ROLE authenticated; INSERT INTO public.food_items(id,name,{key}) VALUES({lit(uid())},'Synthetic denied metadata',{value_sql});"
            update = f"SET ROLE authenticated; UPDATE public.food_items SET {key}={value_sql} WHERE id={lit(food)};"
            for operation, statement in [('INSERT', insert), ('UPDATE', update)]:
                passed(f'authenticated {operation} cannot manufacture {key}', **denial(c, statement, '42501', 'verification_metadata_server_only'))
        # Cover private confirmation independently of all public markers.
        protected = []
        for key, value in [('verified', 'true'), ('ai_verified', 'true'), ('ai_verified_source', lit('barcode_recovery:synthetic'))]:
            item = uid()
            sql(f"SET ROLE service_role; INSERT INTO public.food_items(id,name,calories,{key}) VALUES({lit(item)},'Synthetic protected',111,{value});")
            protected.append((key, item))
        item = uid()
        sql(f"INSERT INTO public.food_items(id,name,calories) VALUES({lit(item)},'Private confirmed only',110);")
        sql(f"BEGIN; INSERT INTO {PRIVATE}.nutrition_write_context VALUES(pg_backend_pid(),txid_current(),{lit(uid())},'confirmed_v1',{lit(item)},NULL); SET LOCAL ROLE service_role; UPDATE public.food_items SET calories=111 WHERE id={lit(item)}; RESET ROLE; DELETE FROM {PRIVATE}.nutrition_write_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current(); COMMIT;")
        assert sql(f"SELECT confirmed FROM {PRIVATE}.nutrition_current WHERE food_id={lit(item)}") == 't'
        assert sql(f"SELECT NOT verified AND NOT ai_verified AND ai_verified_source IS NULL FROM public.food_items WHERE id={lit(item)}") == 't'
        protected.append(('private confirmed', item))
        for reason, item in protected:
            passed(f'authenticated protected nutrition UPDATE denied for {reason}', **denial(c, f"SET ROLE authenticated; UPDATE public.food_items SET calories=999 WHERE id={lit(item)};", 'P0001', 'confirmed_nutrition_protected'))
        c['protected_food'] = protected[-1][1]
        target, other = c['sample'](980001), c['sample'](980002)
        winner, loser = uid(), uid()
        sql('SET ROLE service_role;' + c['ins'](winner, target['code']) + c['ins'](loser, other['code']))
        passed('authenticated equivalent barcode INSERT rolls back row, audit and reservation', **denial(c, 'SET ROLE authenticated;' + c['ins'](uid(), target['canonical']), '23505', 'canonical_package_identity_reserved'))
        passed('authenticated equivalent barcode UPDATE preserves both reservations', **denial(c, f"SET ROLE authenticated; UPDATE public.food_items SET barcode={lit(target['canonical'])} WHERE id={lit(loser)};", '23505', 'canonical_package_identity_reserved'))
        for role in ['anon', 'authenticated']:
            for name, (_, args) in PUBLIC_RPCS.items():
                passed(f'{role} spoofed JWT GUCs cannot call {name}', **denial(c, f'SET ROLE {role};' + SPOOF + f'SELECT public.{name}({args});', '42501', 'permission denied'))
            for table in ['nutrition_write_context', 'nutrition_enrichment_context_v1']:
                passed(f'{role} spoofed JWT GUCs cannot write private {table}', **denial(c, f'SET ROLE {role};' + SPOOF + f'INSERT INTO {PRIVATE}.{table} DEFAULT VALUES;', '42501', 'permission denied'))
        passed('spoofed JWT service role cannot manufacture verification metadata', **denial(c, 'SET ROLE authenticated;' + SPOOF + f"UPDATE public.food_items SET verified=true WHERE id={lit(food)};", '42501', 'verification_metadata_server_only'))
        passed('spoofed JWT service role cannot replace privately confirmed nutrition', **denial(c, 'SET ROLE authenticated;' + SPOOF + f"UPDATE public.food_items SET calories=999 WHERE id={lit(c['protected_food'])};", 'P0001', 'confirmed_nutrition_protected'))
        # Two real transactions, observed server lock wait, both winner directions.
        for number, first_role, second_role in [(980003, 'authenticated', 'service_role'), (980004, 'service_role', 'authenticated')]:
            p, first, second = c['sample'](number), uid(), uid()
            a, b = Session(), Session()
            a.run('BEGIN; SET ROLE ' + first_role + ';' + c['ins'](first, p['code']))
            b.send('SET ROLE ' + second_role + ';' + c['ins'](second, p['canonical']))
            b.lock_wait()
            # Inspect all state from the winner's still-open transaction using
            # the harness owner, while the other role remains genuinely blocked.
            a.run('RESET ROLE;')
            expected = snapshot({**c, 'sql': lambda query: '\n'.join(a.run(query))})
            a.run('COMMIT;')
            b.result(error='23505')
            assert snapshot(c) == expected, 'Concurrent loser changed winner or unrelated state'
            assert sql(f"SELECT count(*) FROM public.food_items WHERE {c['CANON']}(barcode)={lit(p['canonical'])}") == '1'
            assert sql(f"SELECT member_food_ids=ARRAY[{lit(first)}::uuid] FROM {c['REG']} WHERE canonical_code={lit(p['canonical'])}") == 't'
            assert sql(f"SELECT revision=1 AND NOT confirmed FROM {PRIVATE}.nutrition_current WHERE food_id={lit(first)}") == 't'
            for table in ['nutrition_current', 'nutrition_changes', 'nutrition_evidence']:
                assert sql(f"SELECT count(*) FROM {PRIVATE}.{table} WHERE food_id={lit(second)}") == '0'
            assert sql(f"SELECT count(*) FROM {PRIVATE}.nutrition_changes WHERE food_id={lit(first)}") == '1'
            passed(f'concurrent {first_role} winner and {second_role} alias loser serialize with 23505 and no loser side effects', unchanged_state_sha256=proof(expected))
        p, request, rejected = c['sample'](980005), uid(), uid()
        a, b = Session(), Session()
        created = c['json_result'](a.run('BEGIN;' + c['rpc'](request, p)))
        assert created['status'] == 'created'
        first = created['food_item']['id']
        b.send('SET ROLE authenticated;' + c['ins'](rejected, p['code']))
        b.lock_wait()
        a.run('RESET ROLE;')
        expected = snapshot({**c, 'sql': lambda query: '\n'.join(a.run(query))})
        a.run('COMMIT;')
        b.result(error='23505')
        assert snapshot(c) == expected
        assert sql(f"SELECT member_food_ids=ARRAY[{lit(first)}::uuid] FROM {c['REG']} WHERE canonical_code={lit(p['canonical'])}") == 't'
        for table in ['off_source_bindings_v1', 'nutrition_evidence', 'nutrition_changes']:
            assert sql(f"SELECT count(*) FROM {PRIVATE}.{table} WHERE food_id={lit(first)}") == '1'
        assert sql(f"SELECT count(*) FROM {PRIVATE}.off_creation_receipts_v1 WHERE request_id={lit(request)}") == '1'
        replay = json.loads(sql(c['rpc'](request, p)))
        assert replay == created and snapshot(c) == expected
        passed('service create RPC versus authenticated direct INSERT race preserves one food, binding, evidence and replayable receipt', unchanged_state_sha256=proof(expected))
        report['policy_inventory_final'] = policy_inventory(c)
        if http:
            from postgrest_checks import run as run_postgrest
            run_postgrest(c, authenticated=True)
        report['status'] = 'passed'
    except Exception as exc:
        report.update(status='failed', error=str(exc))
        raise
    finally:
        # Sessions are closed centrally before cluster removal. Keeping this
        # database until teardown makes failure logs and concurrent handles safe.
        parent['save']()


def http_checks(c, request, passed):
    sql, lit, uid = (c[k] for k in ['sql', 'lit', 'uid'])
    def denied(name, path, payload, method, state, message):
        before = snapshot(c)
        status, body = request(path, payload, 'authenticated', method=method)
        assert status in [400, 403, 409] and body.get('code') == state and message in body.get('message', ''), (status, body)
        assert snapshot(c) == before, 'Denied HTTP request changed canonical/private state'
        passed(name, http_status=status, sqlstate=state, message=message, unchanged_state_sha256=proof(before))
    food = uid()
    status, body = request('/food_items', {'id': food, 'name': 'HTTP synthetic custom food', 'calories': 100}, 'authenticated', headers={'Prefer': 'return=representation'})
    assert status == 201 and len(body) == 1 and body[0]['id'] == food and body[0]['verified'] is False, (status, body)
    status, body = request('/food_items?id=eq.' + food, {'calories': 120}, 'authenticated', headers={'Prefer': 'return=representation'}, method='PATCH')
    assert status == 200 and len(body) == 1 and body[0]['calories'] == 120, (status, body)
    assert sql(f"SELECT revision=2 AND NOT confirmed FROM {PRIVATE}.nutrition_current WHERE food_id={lit(food)}") == 't'
    passed('signed authenticated HTTP POST and PATCH reach guard and audit successfully')
    for role in [None, 'anon', 'authenticated']:
        status, body = request('/food_items?id=eq.' + food + '&select=id', role=role)
        assert status == 200 and body == [{'id': food}], (role, status, body)
    passed('observed PUBLIC SELECT policy permits HTTP reads with anon and authenticated roles')
    for key, value in METADATA.items():
        denied('HTTP POST cannot manufacture ' + key, '/food_items', {'id': uid(), 'name': 'Denied HTTP metadata', key: value}, 'POST', '42501', 'verification_metadata_server_only')
        denied('HTTP PATCH cannot manufacture ' + key, '/food_items?id=eq.' + food, {key: value}, 'PATCH', '42501', 'verification_metadata_server_only')
    denied('HTTP PATCH cannot replace privately confirmed nutrition', '/food_items?id=eq.' + c['protected_food'], {'calories': 999}, 'PATCH', 'P0001', 'confirmed_nutrition_protected')
    target, other = c['sample'](980011), c['sample'](980012)
    winner, loser = uid(), uid()
    sql('SET ROLE service_role;' + c['ins'](winner, target['code']) + c['ins'](loser, other['code']))
    denied('HTTP POST equivalent alias leaves rows and registry unchanged', '/food_items', {'id': uid(), 'name': 'Denied alias', 'barcode': target['canonical']}, 'POST', '23505', 'canonical_package_identity_reserved')
    denied('HTTP PATCH equivalent alias preserves both reservations', '/food_items?id=eq.' + loser, {'barcode': target['canonical']}, 'PATCH', '23505', 'canonical_package_identity_reserved')
    for name, payload in {
        'claim_food_nutrition_refresh_v1': {'p_food_id': None, 'p_expected_revision': 0, 'p_request_id': None, 'p_provider': 'usda', 'p_source_id': '123'},
        'refresh_food_nutrition_v1': {'p_food_id': None, 'p_expected_revision': 0, 'p_request_id': None, 'p_evidence': {}},
        'read_food_nutrition_refresh_state_v1': {'p_food_id': None},
        'create_off_mass_food_v1': {'p_request_id': None, 'p_expected_code': None, 'p_evidence': {}},
        'read_food_search_snapshots_v1': {'p_food_ids': []},
    }.items():
        before = snapshot(c)
        status, body = request('/rpc/' + name, payload, 'authenticated')
        assert status in [403, 404] and body.get('code') in ['42501', 'PGRST202'], (name, status, body)
        assert snapshot(c) == before
    passed('all five service-only RPCs remain HTTP-denied despite legitimate table write access')
    for table in ['nutrition_write_context', 'nutrition_enrichment_context_v1']:
        before = snapshot(c)
        status, body = request('/' + table, {}, 'authenticated', headers={'Content-Profile': PRIVATE})
        assert status == 406 and body.get('code') == 'PGRST106', (status, body)
        assert snapshot(c) == before
    passed('authenticated HTTP POST cannot access either private write context')

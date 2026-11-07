#!/usr/bin/env python3
"""LOCAL ONLY: create a fresh Unix-socket-only PostgreSQL cluster, never use a DSN.
Run: python3 scripts/ci/native-database/run.py [--postgrest] [--postgres17-container] as an unprivileged user.
No PG installs, external DB connections, inherited PG settings, or production fixtures.
--postgrest pulls the fixed official Docker image; runtime container has no network.
PGlite cannot substitute for these multi-session isolation/locking checks.
"""
import json
from datetime import datetime, timezone
import os
from pathlib import Path
import queue
import re
import hashlib
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid

R = Path(__file__).resolve().parent
OUT = R / 'results/native-postgresql.json'
OUT.parent.mkdir(parents=True, exist_ok=True)
NAMES = [
    'equivalent UPC12/EAN13 concurrent RPCs create one food, binding and evidence',
    'concurrent exact request retries return identical receipt with one write',
    'same request different payload rejected without extra writes',
    'concurrent direct service-role equivalent inserts reject loser with 23505',
    'repeatable-read stale snapshot after concurrent reservation fails 40001',
    'aborted new reservation releases identity and rolls back food/audit',
    'historical duplicate correction and ordinary update preserve registry membership',
    'competing barcode changes serialize and reject loser with 23505',
    'multirow equivalent insert rolls back every food, audit and reservation',
]
# GitHub ubuntu-24.04 ships PG16 outside PATH. Never use an inherited DSN.
PG16 = Path('/usr/lib/postgresql/16/bin')
B = {name: str(PG16 / name) if (PG16 / name).is_file() else shutil.which(name)
     for name in ('postgres', 'initdb', 'pg_ctl', 'psql')}
report = {'status': 'not_run', 'run_id': str(uuid.uuid4()), 'started_at': datetime.now(timezone.utc).isoformat(),
          'engine': 'native_postgresql', 'scope': 'fresh isolated local cluster only',
          'binaries': B, 'tests': [{'name': n, 'status': 'not_run'} for n in NAMES],
          'postgrest': {'status': 'not_run', 'reason': 'Run separately with --postgrest; SQL roles are not HTTP transport proof.'}}

def save():
    OUT.write_text(json.dumps(report, indent=2) + '\n')

def blocked(reason):
    report.update(status='blocked', reason=reason)
    for t in report['tests']:
        t.update(status='blocked', reason=reason)
    save()
    print(json.dumps(report))
    raise SystemExit(2)

save()  # Never leave a previous run's passing report after a new invocation.
flags = sys.argv[1:]
if len(flags) != len(set(flags)) or set(flags) - {'--postgrest', '--postgres17-container'}:
    raise SystemExit('Only --postgrest and --postgres17-container are accepted; no DSNs.')
POSTGREST = '--postgrest' in flags
PG17_CONTAINER = '--postgres17-container' in flags
if PG17_CONTAINER and not shutil.which('docker'):
    blocked('Docker absent; exact PostgreSQL 17.6 gate cannot run. No installation attempted.')
if not PG17_CONTAINER and not all(B.values()):
    blocked('Native PostgreSQL binaries absent; PGlite is single-session and cannot prove concurrency. No installation attempted.')
if not shutil.which('node'):
    blocked('Node is required to generate synthetic evidence using the candidate source.')
if hasattr(os, 'geteuid') and os.geteuid() == 0:
    blocked('initdb refuses root. Run this local-only runner as an unprivileged user; no privilege changes attempted.')

ENV = {k: v for k, v in os.environ.items()
       if not k.upper().startswith(('PG', 'PGRST', 'SUPABASE', 'DOCKER_')) and k not in ('DATABASE_URL', 'DB_URL', 'PYTHONOPTIMIZE')}
if not __debug__:
    blocked('Python optimization disables assertions; run without -O/PYTHONOPTIMIZE.')
from checks import verify_inputs, security_checks, guard_checks, nutrition_checks, snapshot_checks
try:
    verify_inputs(R)
except Exception as exc:
    report.update(status='failed', error=str(exc), stage='frozen_input_or_publication_parity')
    save()
    raise

report['status'] = 'running'
save()
root = Path(tempfile.mkdtemp(prefix='macrogoal-native-'))
os.chmod(root, 0o700)
data = root / 'data'
socket_dir = root / 'sockets'
socket_dir.mkdir(mode=0o700)
REG = 'macrogoal_food_private.food_identity_reservations_mass_v1'
CANON = 'macrogoal_food_private.canonical_gtin_mass_v1'
sessions = []
started = False
container_engine = None

def command(args, **kwargs):
    return subprocess.run(args, env=ENV, text=True, capture_output=True,
                          check=True, timeout=40, **kwargs)

def args(database="postgres"):
    return [B['psql'], '-X', '-h', str(socket_dir), '-p', '5432', '-U', 'postgres',
            '-d', database, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq']

def lit(value):
    return "'" + str(value).replace("'", "''") + "'"

def sql(text, database="postgres"):
    return command(args(database), input="SET statement_timeout='12s'; SET lock_timeout='10s';\n" + text).stdout.strip()

class Session:
    """Persistent psql, explicit acknowledgments and server-observed lock barriers."""
    def __init__(self, database="postgres"):
        self.tag = 'registry_test_' + uuid.uuid4().hex
        self.p = subprocess.Popen(args(database), env={**ENV, 'PGAPPNAME': self.tag}, text=True,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, bufsize=1)
        self.q = queue.Queue()
        def read():
            for line in self.p.stdout:
                self.q.put(line.rstrip('\n'))
            self.q.put(None)
        threading.Thread(target=read, daemon=True).start()
        sessions.append(self)
        self.run("SET statement_timeout='12s'; SET lock_timeout='10s';")

    def send(self, text):
        self.marker = 'DONE_' + uuid.uuid4().hex
        self.p.stdin.write(text + '\n\\echo ' + self.marker + '\n')
        self.p.stdin.flush()

    def result(self, error=None):
        lines = []
        while True:
            line = self.q.get(timeout=18)
            if line is None:
                self.p.wait(timeout=3)
                detail = self.p.stderr.read()
                if error and re.search(r'ERROR:\s+' + re.escape(error) + r':', detail):
                    return lines
                raise AssertionError('Unexpected psql exit: ' + detail)
            if line == self.marker:
                assert error is None, 'Expected SQLSTATE ' + str(error) + ', but SQL succeeded'
                return lines
            if line:
                lines.append(line)

    def run(self, text, error=None):
        self.send(text)
        return self.result(error)

    def lock_wait(self):
        deadline = time.monotonic() + 6
        while time.monotonic() < deadline:
            observation = sql(f"SELECT json_build_object('pid',pid,'database',datname,'wait_event',wait_event,'blockers',pg_blocking_pids(pid)) FROM pg_stat_activity WHERE application_name={lit(self.tag)} AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0")
            if observation:
                report.setdefault('observed_lock_barriers', []).append(json.loads(observation))
                return
            if self.p.poll() is not None:
                raise AssertionError('Session exited before expected lock barrier: ' + self.p.stderr.read())
            time.sleep(.02)
        raise AssertionError('No lock wait observed for ' + self.tag)

    def close(self):
        if self.p.poll() is None:
            self.p.stdin.close()
            try:
                self.p.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.p.terminate()
                self.p.wait(timeout=3)

def uid():
    return str(uuid.uuid4())

def ins(food, code):
    return f"INSERT INTO public.food_items(id,name,barcode,source,macros_per,calories,protein,carbs,fat) VALUES({lit(food)},'Synthetic local fixture',{lit(code)},'openfoodfacts','100g',400,10,60,10);"

def sample(n, ean=False):
    return json.loads(command(['node', str(R / 'sample.mjs'), 'off', str(n), str(ean).lower()]).stdout)

def rpc(req, fixture):
    return f"SET ROLE service_role; SELECT public.create_off_mass_food_v1({lit(req)},{lit(fixture['code'])},{lit(json.dumps(fixture['e']))}::jsonb);"

def count_code(code):
    return int(sql(f"SELECT count(*) FROM public.food_items WHERE {CANON}(barcode)={lit(code)}"))

def one_capture(code):
    assert count_code(code) == 1
    assert sql(f"SELECT count(*) FROM macrogoal_food_private.off_source_bindings_v1 WHERE canonical_code={lit(code)}") == '1'
    assert sql(f"SELECT count(*) FROM macrogoal_food_private.nutrition_evidence e JOIN public.food_items f ON f.id=e.food_id WHERE {CANON}(f.barcode)={lit(code)}") == '1'

def json_result(lines):
    return [json.loads(x) for x in lines if x.startswith('{')][-1]

def pass_test(index):
    report['tests'][index]['status'] = 'passed'
    save()

try:
    if PG17_CONTAINER:
        from container_postgres import ContainerPostgres
        report['postgres_container'] = {}
        container_engine = ContainerPostgres(root, ENV, report['postgres_container'], save)
        B = container_engine.start()
        report['binaries'] = B
    report['postgres_version'] = command([B['postgres'], '--version']).stdout.strip()
    expected_version = r'PostgreSQL\) 17\.6(?:\s|$)' if PG17_CONTAINER else r'PostgreSQL\) 16\.'
    assert re.search(expected_version, report['postgres_version']), report['postgres_version']
    command([B['initdb'], '-D', str(data), '-U', 'postgres', '--no-locale', '--auth-local=trust'])
    started = True  # Reconcile startup even if pg_ctl times out or reports failure.
    command([B['pg_ctl'], '-D', str(data), '-l', str(root / 'postgres.log'), '-o',
             f"-c listen_addresses='' -c unix_socket_directories='{socket_dir}' -c unix_socket_permissions=0700", '-w', 'start'])
    report['server_version_num'] = sql('SHOW server_version_num')
    if PG17_CONTAINER:
        assert report['server_version_num'] == '170006', report['server_version_num']
        report['postgres_container']['status'] = 'verified_exact_17_6'
    else:
        assert report['server_version_num'].startswith('16'), report['server_version_num']
    sql((R / 'sql/fixture.sql').read_text())
    guard_checks(globals())
    sql((R / 'sql/01-nutrition.sql').read_text())
    # Seed historical equivalents BEFORE registry installation, never manufacture them afterward.
    old = sample(900001)
    old_ids = [uid(), uid()]
    sql(ins(old_ids[0], old['code']) + ins(old_ids[1], old['canonical']))
    sql((R / 'sql/02-off-registry.sql').read_text())
    sql((R / 'sql/03-search.sql').read_text())
    security_checks(globals())
    baseline = sql(f"SELECT row_to_json(r) FROM {REG} r WHERE canonical_code={lit(old['canonical'])}")
    oldrow = json.loads(baseline)
    assert oldrow['historical_ambiguous'] is True
    assert sorted(oldrow['member_food_ids']) == sorted(old_ids)

    # Block both RPCs at a real SQL lock, then release simultaneously.
    a, b, gate = Session(), Session(), Session()
    p, p13 = sample(900002), sample(900002, True)
    gate.run('BEGIN; LOCK TABLE public.food_items IN ACCESS EXCLUSIVE MODE;')
    a.send(rpc(uid(), p)); b.send(rpc(uid(), p13))
    a.lock_wait(); b.lock_wait(); gate.run('COMMIT;')
    result = [json_result(a.result()), json_result(b.result())]
    assert sorted(x['status'] for x in result) == ['created', 'existing']
    one_capture(p['canonical']); pass_test(0)

    p = sample(900003); request = uid()
    a, b, gate = Session(), Session(), Session()
    gate.run('BEGIN; LOCK TABLE public.food_items IN ACCESS EXCLUSIVE MODE;')
    a.send(rpc(request, p)); a.lock_wait()
    b.send(rpc(request, p)); b.lock_wait(); gate.run('COMMIT;')
    assert json_result(a.result()) == json_result(b.result())
    one_capture(p['canonical'])
    assert sql(f"SELECT count(*) FROM macrogoal_food_private.off_creation_receipts_v1 WHERE request_id={lit(request)}") == '1'
    pass_test(1)

    changed = json.loads(json.dumps(p)); changed['e']['snapshot']['product_name'] = 'Different synthetic oats'
    a, b = Session(), Session()
    a.run('BEGIN;' + rpc(request, p))
    b.send(rpc(request, changed)); b.lock_wait()
    a.run('COMMIT;'); b.result(error='22023')
    one_capture(p['canonical']); pass_test(2)

    p = sample(900004); food1, food2 = uid(), uid()
    a, b = Session(), Session()
    a.run('BEGIN; SET ROLE service_role;' + ins(food1, p['code']))
    b.send('SET ROLE service_role;' + ins(food2, p['canonical'])); b.lock_wait()
    a.run('COMMIT;'); b.result(error='23505')
    assert count_code(p['canonical']) == 1
    assert sql(f"SELECT member_food_ids=ARRAY[{lit(food1)}::uuid] FROM {REG} WHERE canonical_code={lit(p['canonical'])}") == 't'
    pass_test(3)

    p = sample(900005); a, b = Session(), Session()
    a.run('BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT count(*) FROM public.food_items;')
    b.run('SET ROLE service_role;' + ins(uid(), p['code']))
    a.run('SET ROLE service_role;' + ins(uid(), p['canonical']), error='40001')
    assert count_code(p['canonical']) == 1
    # Existing registry row changed after snapshot must ALSO serialize-fail.
    # This distinguishes a write-conflicting touch_revision from advisory-only reads.
    p = sample(900011); owner = uid()
    sql(ins(owner, p['code']))
    before_touch = int(sql(f"SELECT touch_revision FROM {REG} WHERE canonical_code={lit(p['canonical'])}"))
    a, b = Session(), Session()
    a.run('BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT count(*) FROM public.food_items;')
    b.run(f"SET ROLE service_role; UPDATE public.food_items SET barcode={lit(p['canonical'])} WHERE id={lit(owner)};")
    assert int(sql(f"SELECT touch_revision FROM {REG} WHERE canonical_code={lit(p['canonical'])}")) > before_touch
    a.run('SET ROLE service_role;' + ins(uid(), p['code']), error='40001')
    assert count_code(p['canonical']) == 1
    pass_test(4)

    p = sample(900006); abandoned = uid(); a, b = Session(), Session()
    a.run('BEGIN; SET ROLE service_role;' + ins(abandoned, p['code']))
    b.send('SET ROLE service_role;' + ins(uid(), p['canonical'])); b.lock_wait()
    a.run('ROLLBACK;'); b.result()
    assert count_code(p['canonical']) == 1
    assert sql(f"SELECT count(*) FROM macrogoal_food_private.nutrition_current WHERE food_id={lit(abandoned)}") == '0'
    assert sql(f"SELECT count(*) FROM macrogoal_food_private.nutrition_changes WHERE food_id={lit(abandoned)}") == '0'
    pass_test(5)

    # Overlapping correction/ordinary updates must serialize on the same historic food.
    a, b = Session(), Session()
    a.run(f"BEGIN; INSERT INTO macrogoal_food_private.nutrition_write_context VALUES(pg_backend_pid(),txid_current(),{lit(uid())},'confirmed_v1',{lit(old_ids[0])},NULL); SET ROLE service_role; UPDATE public.food_items SET calories=401 WHERE id={lit(old_ids[0])};")
    b.send(f"SET ROLE service_role; UPDATE public.food_items SET search_count=search_count+1 WHERE id={lit(old_ids[0])};"); b.lock_wait()
    a.run('COMMIT;'); b.result()
    a.run(f"UPDATE public.food_items SET search_count=search_count+1 WHERE id={lit(old_ids[1])};")
    assert sql(f"SELECT row_to_json(r) FROM {REG} r WHERE canonical_code={lit(old['canonical'])}") == baseline
    assert json_result(a.run(rpc(uid(), old)))['status'] == 'ambiguous_existing'
    assert count_code(old['canonical']) == 2
    pass_test(6)

    first, second, target = sample(900007), sample(900008), sample(900009)
    f1, f2 = uid(), uid(); sql(ins(f1, first['code']) + ins(f2, second['code']))
    a, b = Session(), Session()
    a.run(f"BEGIN; SET ROLE service_role; UPDATE public.food_items SET barcode={lit(target['code'])} WHERE id={lit(f1)};")
    b.send(f"SET ROLE service_role; UPDATE public.food_items SET barcode={lit(target['canonical'])} WHERE id={lit(f2)};"); b.lock_wait()
    a.run('COMMIT;'); b.result(error='23505')
    assert count_code(target['canonical']) == 1 and count_code(second['canonical']) == 1
    assert sql(f"SELECT member_food_ids=ARRAY[{lit(f1)}::uuid] FROM {REG} WHERE canonical_code={lit(first['canonical'])}") == 't'
    assert sql(f"SELECT member_food_ids=ARRAY[{lit(f2)}::uuid] FROM {REG} WHERE canonical_code={lit(second['canonical'])}") == 't'
    pass_test(7)

    p = sample(900010); ids = [uid(), uid()]
    stmt = f"SET ROLE service_role; INSERT INTO public.food_items(id,name,barcode) VALUES({lit(ids[0])},'Synthetic multirow',{lit(p['code'])}),({lit(ids[1])},'Synthetic multirow',{lit(p['canonical'])});"
    # A separate uncommitted insert forces the multirow statement to wait;
    # after its rollback the statement creates a provisional row then conflicts
    # with its own equivalent row. Every side effect must roll back.
    a, b = Session(), Session()
    a.run('BEGIN; SET ROLE service_role;' + ins(uid(), p['code']))
    b.send(stmt); b.lock_wait(); a.run('ROLLBACK;'); b.result(error='23505')
    assert count_code(p['canonical']) == 0
    assert sql(f"SELECT count(*) FROM {REG} WHERE canonical_code={lit(p['canonical'])}") == '0'
    for table in ('nutrition_current', 'nutrition_changes', 'nutrition_evidence'):
        assert sql(f"SELECT count(*) FROM macrogoal_food_private.{table} WHERE food_id IN ({lit(ids[0])},{lit(ids[1])})") == '0'
    pass_test(8)
    nutrition_checks(globals())
    snapshot_checks(globals())
    # Capture exact effective security after every behavioral check too.
    security_checks(globals(), final=True)
    if POSTGREST:
        from postgrest_checks import run as run_postgrest
        run_postgrest(globals())
    from authenticated_checks import run as run_authenticated
    run_authenticated(globals(), http=POSTGREST)
    report['status'] = 'passed'
except Exception as exc:
    report.update(status='failed', error=str(exc))
    if isinstance(exc, subprocess.CalledProcessError):
        report['command_stderr'] = (exc.stderr or '')[-12000:]
        report['command_stdout'] = (exc.stdout or '')[-3000:]
    for test in report['tests']:
        if test['status'] == 'not_run':
            test['status'] = 'blocked_after_failure'
    raise
finally:
    from cleanup import cleanup
    cleanup(globals())
    if report.get('status') != 'passed':
        print(json.dumps(report), file=sys.stderr)

if report.get('status') != 'passed':
    raise SystemExit(1)
print(json.dumps({'status': report['status'], 'report': str(OUT), 'postgrest': report['postgrest']['status']}))

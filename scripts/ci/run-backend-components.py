#!/usr/bin/env python3
"""Explicit offline component suites against the actual checkout, never discovery."""
from pathlib import Path
import hashlib,json,os,re,shutil,subprocess,sys,tempfile
ROOT=Path(__file__).resolve().parents[2]
FIXTURES=ROOT/'tests/release-review/fixtures/backend-components'
OUT=ROOT/'.ci-results/backend-components'
OUT.mkdir(parents=True,exist_ok=True)
report={'status':'not_run','groups':{}}
def save():
    (OUT/'summary.json').write_text(json.dumps(report,indent=2)+'\n')
# Replace previous successful evidence before any new preflight or execution.
save()
(OUT/'source-targets.json').write_text(json.dumps({'status':'not_verified'})+'\n')
def main():
    report['status']='running'
    save()
    if len(sys.argv)!=1:
        raise SystemExit('This runner accepts no arbitrary test paths or commands.')
    M=json.loads((FIXTURES/'manifest.json').read_text())
    def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
    def inside(root,rel):
        p=root/rel
        if Path(rel).is_absolute() or '..' in Path(rel).parts:raise RuntimeError('Non-relative manifest path')
        return p
    for rel,digest in M['fixtures'].items():
        if sha(inside(FIXTURES,rel))!=digest:raise RuntimeError('Frozen test fixture changed: '+rel)
    for rel,digest in M['runtime_hashes'].items():
        if sha(inside(ROOT,rel))!=digest:raise RuntimeError('Actual backend source differs from the reviewed composition: '+rel)
    # Verify the same exact final runtime used by every fixture alias. Never replace
    # checked-out code with an archived source just to make a test pass.
    start_hashes={p:sha(inside(ROOT,p)) for p in set(M['actual_source_links'].values())}
    expected={'nutrition':129,'registry':250,'search':173}
    if set(M['groups'])!=set(expected):raise RuntimeError('Incomplete component group allowlist')
    source_report={'backend_and_sql_hashes':M['runtime_hashes'],'all_actual_link_target_hashes':start_hashes,'source_target':'actual checkout','frozen_fixture_count':len(M['fixtures']),'superseded_source_only_exclusions':M['superseded_source_only_exclusions'],'counts_are_executions_not_unique_scenarios':True}
    (OUT/'source-targets.json').write_text(json.dumps(source_report,indent=2)+'\n')
    summary={}
    report['groups']=summary
    with tempfile.TemporaryDirectory(prefix='macrogoal-backend-components-') as directory:
        tmp=Path(directory)
        for rel in M['fixtures']:
            dest=inside(tmp,rel);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(inside(FIXTURES,rel),dest)
        for rel,target in M['actual_source_links'].items():
            dest=inside(tmp,rel);dest.parent.mkdir(parents=True,exist_ok=True)
            if dest.exists() or dest.is_symlink():raise RuntimeError('Fixture/runtime overlap: '+rel)
            dest.symlink_to(inside(ROOT,target).resolve())
        env={**os.environ,
          'TYPESCRIPT_MODULE':str(ROOT/'node_modules/typescript'),
          'PGLITE_MODULE':str(ROOT/'scripts/ci/test-tooling/node_modules/@electric-sql/pglite/dist/index.js'),
          'MACROGOAL_FUNCTIONS_ROOT':str(ROOT/'supabase/functions'),
          'OFF_MASS_FUNCTIONS_ROOT':str(ROOT/'supabase/functions'),
          'OFF_MASS_SQL_PATH':str(ROOT/'release-candidates/food-catalog/sql/02-off-registry/off-mass.CANDIDATE.sql'),
          'OFF_MASS_CANDIDATE_ROOT':str(tmp/'component-tests/off-registry'),
          'SEARCH_AUTHORITY_FUNCTIONS_ROOT':str(ROOT/'supabase/functions'),
          'SEARCH_AUTHORITY_SQL_ROOT':str(ROOT/'release-candidates/food-catalog/sql/03-search'),
          'SEARCH_AUTHORITY_CLIENT_ROOT':str(ROOT),
          'NODE_OPTIONS':'--require='+str(ROOT/'scripts/ci/offline-node.cjs'),
        }
        for name,files in M['groups'].items():
            for file in files:
                if not file.endswith(('.test.mjs','.test.cjs')):raise RuntimeError('Unexpected test suffix')
                if 'discovery-selection' in file or file not in [x.removeprefix('component-tests/') for x in M['fixtures']]:raise RuntimeError('Test not in fixture allowlist')
            flags=[]
            if name=='nutrition':flags=['--test-skip-pattern='+'|'.join(M['superseded_source_only_exclusions'])]
            command=['node','--test','--test-concurrency=1','--test-reporter=tap',*flags,*[str(inside(tmp,'component-tests/'+f)) for f in files]]
            try:
                run=subprocess.run(command,cwd=tmp,env=env,text=True,capture_output=True,timeout=600)
                log=run.stdout+run.stderr;code=run.returncode
            except subprocess.TimeoutExpired as exc:
                log='Component suite exceeded 600 seconds.\n';code=1
            (OUT/(name+'.tap')).write_text(log)
            counts={k:int(m.group(1)) if (m:=re.search(r'^# '+k+r' (\d+)$',log,re.M)) else None for k in ['tests','pass','fail','skipped']}
            okay=code==0 and counts=={'tests':expected[name],'pass':expected[name],'fail':0,'skipped':0}
            summary[name]={'status':'passed' if okay else 'failed','process_exit_code':code,'expected_executions':expected[name],**counts,'test_files':files,'log':'backend-components/'+name+'.tap'}
            print(json.dumps({name:summary[name]}),flush=True)
            if not okay:print(log,flush=True)
            save()
    end_hashes={p:sha(inside(ROOT,p)) for p in start_hashes}
    if start_hashes!=end_hashes:raise RuntimeError('Actual checkout changed during component checks')
    print(json.dumps({'component_executions':sum(x['pass'] or 0 for x in summary.values()),'required_executions':552,'cross_component_contracts':'separate existing 4-test gate','counts_are_not_unique_cases':True}))
    okay=len(summary)==3 and all(x['status']=='passed' for x in summary.values())
    report.update(status='passed' if okay else 'failed',actual_source_hashes_unchanged=True)
    if not okay:report['error']='One or more component groups failed.'
    save()
    return 0 if okay else 1

try:
    status=main()
except BaseException as exc:
    report.update(status='failed',error=str(exc))
    save()
    raise
sys.exit(status)

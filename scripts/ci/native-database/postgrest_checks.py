"""Optional real HTTP+JWT PostgREST gate, entirely over Unix sockets.

Official image is version-pinned; resolved content digest is retained in evidence.
No network for running container. No Supabase keys, hosted project, provider fetch,
privileged container, inherited DB URI, or production auth is used.
"""
import base64
import hashlib
import hmac
import http.client
import json
import os
import secrets
import shutil
import socket
import subprocess
import time
from checks import PRIVATE, record

IMAGE = 'postgrest/postgrest:v13.0.7'


class UnixConnection(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__('localhost',timeout=5)
        self.path = str(path)
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.path)


def run(c, authenticated=False):
    key = 'postgrest_authenticated' if authenticated else 'postgrest'
    report=c['report'].setdefault(key, {})
    report.update(status='running',image=IMAGE,tests=[],scope='official local PostgREST, synthetic JWTs, Unix sockets, no Supabase gateway')
    c['save']()
    docker=shutil.which('docker')
    if not docker:
        report.update(status='blocked',reason='Docker absent; real HTTP transport gate did not run.')
        raise RuntimeError(report['reason'])
    # Host Docker may access its official registry for the explicit image pull only.
    # Executing PostgREST has --network none, only the newly created socket mount.
    container='macrogoal-postgrest-'+secrets.token_hex(8)
    sock=c['socket_dir']/'postgrest.sock'
    sql,lit=c['sql'],c['lit']
    secret=secrets.token_hex(32)
    def dock(args,timeout=120,check=True):
        try:
            result = subprocess.run([docker,'--host','unix:///var/run/docker.sock']+args,env=c['ENV'],text=True,capture_output=True,timeout=timeout,check=False)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f'Docker {args[0]} exceeded {timeout}s') from None
        if check and result.returncode:
            # Do not serialize docker run arguments containing local JWT material.
            raise RuntimeError(f'Docker {args[0]} failed ({result.returncode}): '+result.stderr[-3000:])
        return result
    def token(role, signing_secret=secret):
        enc=lambda d:base64.urlsafe_b64encode(json.dumps(d,separators=(',',':')).encode()).rstrip(b'=')
        data=enc({'alg':'HS256','typ':'JWT'})+b'.'+enc({'role':role,'sub':'00000000-0000-4000-8000-000000000001','exp':int(time.time())+600})
        signature=base64.urlsafe_b64encode(hmac.new(signing_secret.encode(),data,hashlib.sha256).digest()).rstrip(b'=')
        return (data+b'.'+signature).decode()
    def request_http(path,body=None,role=None,headers=None,bad=False,method=None):
        conn=UnixConnection(sock)
        hdr={'Content-Type':'application/json',**(headers or {})}
        if role:
            hdr['Authorization']='Bearer '+token(role,'invalid-local-fixture-key'*2 if bad else secret)
        try:
            conn.request(method or ('POST' if body is not None else 'GET'),path,json.dumps(body) if body is not None else None,hdr)
            response=conn.getresponse();raw=response.read()
            try: payload=json.loads(raw)
            except json.JSONDecodeError: payload={'unparsed':raw.decode(errors='replace')[:500]}
            return response.status,payload
        finally:
            conn.close()
    def passed(name, **detail):
        report['tests'].append({'name':name,'status':'passed',**detail});c['save']()
    attempted=False
    try:
        dock(['pull',IMAGE])
        image=json.loads(dock(['image','inspect',IMAGE]).stdout)[0]
        assert image.get('RepoDigests'), 'Pulled image has no content-addressed registry digest'
        report['image_id']=image['Id'];report['repo_digests']=image['RepoDigests']
        # Execute the resolved immutable local ID, never re-resolve a mutable tag.
        image_id=image['Id']
        if sql("SELECT count(*) FROM pg_roles WHERE rolname='authenticator'") == '0':
            sql('CREATE ROLE authenticator LOGIN NOINHERIT; GRANT anon,authenticated,service_role TO authenticator;')
        args=['run','--detach','--name',container,'--network','none',
              '--user',f'{os.getuid()}:{os.getgid()}','--read-only',
              '--cap-drop','ALL','--security-opt','no-new-privileges',
              '--mount',f'type=bind,src={c["socket_dir"]},dst=/fixture',
              '--env','PGRST_DB_URI=postgresql://authenticator@/'+c.get('database','postgres')+'?host=/fixture',
              '--env','PGRST_DB_SCHEMAS=public','--env','PGRST_DB_ANON_ROLE=anon',
              '--env','PGRST_DB_EXTRA_SEARCH_PATH=public','--env','PGRST_DB_CONFIG=false',
              '--env','PGRST_SERVER_UNIX_SOCKET=/fixture/postgrest.sock',
              '--env','PGRST_SERVER_UNIX_SOCKET_MODE=600',
              '--env','PGRST_JWT_SECRET='+secret,image_id]
        attempted=True
        dock(args)
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            try:
                status,body=request_http('/rpc/read_food_search_snapshots_v1',{'p_food_ids':[]},'service_role')
                if status==200 and body==[]:
                    break
            except (OSError, http.client.HTTPException):
                pass
            time.sleep(.25)
        else:
            raise RuntimeError('PostgREST did not reach a successful service-role RPC in 30s: '+dock(['logs',container],check=False).stdout[-2000:])
        passed('genuine HTTP request with locally signed service_role JWT reaches search RPC')
        if authenticated:
            from authenticated_checks import http_checks
            http_checks(c, request_http, passed)
            report['status'] = 'passed'
            return
        fixture=c['sample'](990001); req=c['uid']()
        nutrition_food,nutrition_req=c['uid'](),c['uid']()
        sql(f"INSERT INTO public.food_items(id,name,source,usda_fdc_id,macros_per,calories,protein,carbs,fat,verified) VALUES({lit(nutrition_food)},'Banana, raw','usda','123','100g',89,1,23,0.3,true)")
        evidence=json.loads(c['command'](['node',str(c['R']/'sample.mjs'),'usda']).stdout)
        calls={
          'create_off_mass_food_v1':{'p_request_id':req,'p_expected_code':fixture['code'],'p_evidence':fixture['e']},
          'claim_food_nutrition_refresh_v1':{'p_food_id':nutrition_food,'p_expected_revision':1,'p_request_id':nutrition_req,'p_provider':'usda','p_source_id':'123'},
          'refresh_food_nutrition_v1':{'p_food_id':nutrition_food,'p_expected_revision':1,'p_request_id':nutrition_req,'p_evidence':evidence},
          'read_food_nutrition_refresh_state_v1':{'p_food_id':nutrition_food},
          'read_food_search_snapshots_v1':{'p_food_ids':[]},
        }
        for role in [None,'anon','authenticated']:
            for name,payload in calls.items():
                status,body=request_http('/rpc/'+name,payload,role)
                assert status in [401,403,404] and body.get('code') in ['42501','PGRST202'], (role,name,status,body)
            passed(f'{role or "unauthenticated"} transport denied on all five service-only RPCs')
        assert c['count_code'](fixture['canonical'])==0
        status,body=request_http('/rpc/read_food_search_snapshots_v1',{'p_food_ids':[]},'service_role',bad=True)
        assert status==401 and str(body.get('code','')).startswith('PGRST'),(status,body)
        passed('forged service_role token rejected before RPC execution')
        for role in [None,'authenticated','service_role']:
            status,body=request_http('/nutrition_current',role=role,headers={'Accept-Profile':PRIVATE})
            assert status==406 and body.get('code')=='PGRST106',(role,status,body)
            status,body=request_http('/nutrition_refresh_state_v1',role=role)
            assert status==404 and body.get('code') in ['PGRST205','42P01'],(role,status,body)
        passed('private schema and new authority tables absent from HTTP API for every role')
        for role in [None,'authenticated']:
            status,body=request_http('/food_items?select=id',role=role)
            assert status in [401,403] and body.get('code')=='42501',(role,status,body)
        passed('fixture client table privileges fail closed without granting access for tests')
        status,created=request_http('/rpc/create_off_mass_food_v1',calls['create_off_mass_food_v1'],'service_role')
        assert status==200 and created['status']=='created',(status,created)
        food=created['food_item']['id']
        status,replay=request_http('/rpc/create_off_mass_food_v1',calls['create_off_mass_food_v1'],'service_role')
        assert status==200 and replay==created,(status,replay)
        c['one_capture'](fixture['canonical'])
        assert sql(f"SELECT count(*) FROM {PRIVATE}.off_creation_receipts_v1 WHERE request_id={lit(req)}")=='1'
        passed('real HTTP creation and exact receipt replay cause one canonical write')
        status,body=request_http('/rpc/read_food_search_snapshots_v1',{'p_food_ids':[food]},'service_role')
        assert status==200 and len(body)==1 and body[0]['id']==food and body[0]['protected'] is False,(status,body)
        status,body=request_http('/rpc/read_food_nutrition_refresh_state_v1',{'p_food_id':food},'service_role')
        assert status==200 and body['mass_bound'] is True and body['revision']==1,(status,body)
        passed('service HTTP readers return atomic canonical snapshot and mass-bound state')
        status,body=request_http('/rpc/claim_food_nutrition_refresh_v1',calls['claim_food_nutrition_refresh_v1'],'service_role')
        assert status==200 and body['status']=='claimed',(status,body)
        status,body=request_http('/rpc/refresh_food_nutrition_v1',calls['refresh_food_nutrition_v1'],'service_role')
        assert status==200 and body['status']=='applied' and body['revision']==2,(status,body)
        status,replayed=request_http('/rpc/refresh_food_nutrition_v1',calls['refresh_food_nutrition_v1'],'service_role')
        assert status==200 and replayed==body,(status,replayed)
        assert sql(f"SELECT count(*) FROM {PRIVATE}.nutrition_evidence WHERE food_id={lit(nutrition_food)}")=='1'
        assert sql(f"SELECT calories=89 AND protein=1 AND carbs=23 AND fat=0.3 AND vitamin_c_mg=8.7 FROM public.food_items WHERE id={lit(nutrition_food)}")=='t'
        passed('service HTTP nutrition claim, finalization and retry preserve macros and write once')
        report['status']='passed'
        record(c,'local PostgREST transport permission and idempotent write assertions')
    except Exception as exc:
        report.update(status='failed' if report.get('status')!='blocked' else 'blocked',error=str(exc))
        raise
    finally:
        from cleanup import cleanup_postgrest
        cleanup_postgrest(c, dock, container, report, attempted, authenticated)

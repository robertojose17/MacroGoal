"""Exact official PostgreSQL 17.6 engine, no host installation or TCP networking.

Only the runner's new temporary directory is shared with this container. The
wrapper names/commands are fixed; no externally supplied container, DSN or path.
"""
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys

IMAGE = 'postgres:17.6-bookworm'
VERSION_NUM = '170006'


class ContainerPostgres:
    def __init__(self, root, env, report, save):
        self.root, self.env, self.report = root, env, report
        self.save = save
        self.docker = shutil.which('docker')
        self.name = 'macrogoal-postgres17-' + secrets.token_hex(8)
        self.attempted = False

    def dock(self, args, timeout=120, check=True):
        result = subprocess.run([self.docker, '--host', 'unix:///var/run/docker.sock'] + args,
                                env=self.env, text=True, capture_output=True, timeout=timeout)
        if check and result.returncode:
            raise RuntimeError(f'Docker {args[0]} failed ({result.returncode}): ' + result.stderr[-3000:])
        return result

    def start(self):
        if not self.docker:
            raise RuntimeError('Docker absent; exact PostgreSQL 17.6 container gate did not run.')
        self.report.update(status='starting', requested_image=IMAGE, required_server_version_num=VERSION_NUM, container_name=self.name)
        self.save()
        self.dock(['pull', IMAGE], timeout=180)
        image = json.loads(self.dock(['image', 'inspect', IMAGE]).stdout)[0]
        assert image.get('RepoDigests'), 'Official PostgreSQL image lacks registry content digest'
        self.report.update(image_id=image['Id'], repo_digests=image['RepoDigests'])
        # initdb requires a passwd entry for the effective UID. These synthetic
        # files exist only in this ephemeral container, never change host users.
        uid, gid = os.getuid(), os.getgid()
        (self.root / 'passwd').write_text(f'postgres:x:{uid}:{gid}:Synthetic test runner:{self.root}:/bin/false\n')
        (self.root / 'group').write_text(f'postgres:x:{gid}:\n')
        args = ['run', '--detach', '--name', self.name, '--network', 'none',
                '--user', f'{uid}:{gid}', '--read-only', '--cap-drop', 'ALL',
                '--security-opt', 'no-new-privileges',
                '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=1m',
                '--mount', f'type=bind,src={self.root},dst={self.root}',
                '--mount', f'type=bind,src={self.root}/passwd,dst=/etc/passwd,readonly',
                '--mount', f'type=bind,src={self.root}/group,dst=/etc/group,readonly',
                '--entrypoint', '/bin/sleep', image['Id'], 'infinity']
        self.save()  # Persist exact name/image before any uncertain container start.
        self.attempted = True  # Reconcile even when Docker reports timeout/uncertain startup.
        self.dock(args, timeout=40)
        entry = self.dock(['exec', self.name, 'getent', 'passwd', str(uid)]).stdout.strip()
        assert entry.split(':')[0:4] == ['postgres', 'x', str(uid), str(gid)], entry
        self.report['unprivileged_identity'] = {'uid': uid, 'gid': gid, 'passwd_name': 'postgres'}
        wrappers = self.root / 'bin'
        wrappers.mkdir(mode=0o700)
        result = {}
        for binary in ('postgres', 'initdb', 'pg_ctl', 'psql'):
            path = wrappers / binary
            # os.execv preserves stdin/stdout and the true exit status. Only the
            # synthetic PGAPPNAME is forwarded for server-observed lock barriers.
            script = f'''#!{sys.executable}
import os, sys
cmd = {[self.docker, '--host', 'unix:///var/run/docker.sock', 'exec', '--interactive']!r}
if 'PGAPPNAME' in os.environ:
    cmd += ['--env', 'PGAPPNAME=' + os.environ['PGAPPNAME']]
cmd += {[self.name, '/usr/lib/postgresql/17/bin/' + binary]!r} + sys.argv[1:]
os.execv(cmd[0], cmd)
'''
            path.write_text(script)
            path.chmod(0o700)
            result[binary] = str(path)
        self.report['status'] = 'running'
        return result

    def close(self):
        if not self.attempted:
            return
        state = self.dock(['container', 'inspect', '--format', '{{.Id}}', self.name], check=False)
        if state.returncode == 0:
            result = self.dock(['rm', '--force', '--volumes', self.name], check=False)
            if result.returncode:
                raise RuntimeError('Could not remove ephemeral PostgreSQL container: ' + result.stderr)
            self.report['container_cleanup'] = 'removed'
        elif 'No such container' in state.stderr or 'No such object' in state.stderr:
            self.report['container_cleanup'] = 'confirmed_absent'
        else:
            raise RuntimeError('Uncertain ephemeral PostgreSQL container state: ' + state.stderr)

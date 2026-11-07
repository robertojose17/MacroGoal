#!/usr/bin/env python3
"""Mocked control-flow probes only: never native SQL or HTTP evidence."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from cleanup import cleanup, cleanup_postgrest
from container_postgres import ContainerPostgres, IMAGE


class TeardownProbes(unittest.TestCase):
    def test_session_close_failure_still_stops_pg_and_removes_exact_container(self):
        root = Path(tempfile.mkdtemp(prefix='macrogoal-cleanup-probe-'))
        events, snapshots = [], []
        report = {'status': 'passed'}
        class BadSession:
            def close(self):
                events.append('bad_session')
                raise subprocess.TimeoutExpired('synthetic session close', 3)
        class GoodSession:
            def close(self):
                events.append('good_session')
        class ExactContainer:
            def close(self):
                events.append('exact_generated_container')
        c = dict(report=report, root=root, sessions=[BadSession(), GoodSession()], started=True,
                 B={'pg_ctl': 'mock-pg-ctl'}, data=root/'data', ENV={}, R=root,
                 command=lambda args: events.append('postgres_stop'), container_engine=ExactContainer(),
                 save=lambda: snapshots.append(json.loads(json.dumps(report))))
        try:
            with patch('cleanup.subprocess.run', return_value=subprocess.CompletedProcess([], 0, '', '')):
                cleanup(c)
            self.assertEqual(events, ['bad_session', 'good_session', 'postgres_stop', 'exact_generated_container'])
            self.assertTrue(snapshots)
            self.assertTrue(all(item['status'] == 'failed' for item in snapshots))
            self.assertEqual(report['cleanup_errors'][0]['stage'], 'session_close_0')
            self.assertTrue(root.exists())
        finally:
            shutil.rmtree(root)

    def test_clean_success_removes_only_ephemeral_directory(self):
        root = Path(tempfile.mkdtemp(prefix='macrogoal-cleanup-probe-'))
        report = {'status': 'passed'}
        cleanup(dict(report=report, root=root, sessions=[], started=False,
                     container_engine=None, save=lambda: None, R=root))
        self.assertFalse(root.exists())
        self.assertEqual(report['status'], 'passed')

    def test_postgrest_log_timeout_still_removes_and_never_reports_pass(self):
        with tempfile.TemporaryDirectory(prefix='macrogoal-log-probe-') as directory:
            events, snapshots = [], []
            report = {'status': 'passed'}
            name = 'macrogoal-postgrest-exact-synthetic-probe'
            def dock(args, **kwargs):
                events.append(args)
                if args[0] == 'logs':
                    raise subprocess.TimeoutExpired('synthetic logs', 120)
                return subprocess.CompletedProcess(args, 0, '', '')
            c = {'R': Path(directory), 'save': lambda: snapshots.append(json.loads(json.dumps(report)))}
            with self.assertRaises(RuntimeError):
                cleanup_postgrest(c, dock, name, report, True)
            self.assertEqual(events[-1], ['rm', '--force', name])
            self.assertTrue(snapshots)
            self.assertTrue(all(item['status'] == 'failed' for item in snapshots))
            self.assertEqual(report['container_cleanup'], 'removed')
            self.assertEqual(report['cleanup_errors'][0]['stage'], 'postgrest_logs')


class ContainerProbes(unittest.TestCase):
    def test_fixed_local_daemon_immutable_image_and_narrow_mounts(self):
        with tempfile.TemporaryDirectory(prefix='macrogoal-container-probe-') as directory:
            root = Path(directory)
            report, calls = {}, []
            engine = ContainerPostgres(root, {}, report, lambda: None)
            engine.docker = '/mock/docker'
            image_id = 'sha256:' + 'a' * 64
            def dock(args, **kwargs):
                calls.append(args)
                output = ''
                if args[:2] == ['image', 'inspect']:
                    output = json.dumps([{'Id': image_id, 'RepoDigests': ['postgres@sha256:'+'b'*64]}])
                if args[:1] == ['exec']:
                    output = f'postgres:x:{os.getuid()}:{os.getgid()}:fixture:{root}:/bin/false\n'
                return subprocess.CompletedProcess(args, 0, output, '')
            engine.dock = dock
            binaries = engine.start()
            self.assertEqual(calls[0], ['pull', IMAGE])
            run = next(item for item in calls if item[0] == 'run')
            self.assertEqual(run[run.index('--network')+1], 'none')
            self.assertEqual(run[run.index('--user')+1], f'{os.getuid()}:{os.getgid()}')
            self.assertEqual(run[-2:], [image_id, 'infinity'])
            self.assertIn('--read-only', run)
            self.assertNotIn('/var/run/docker.sock', ' '.join(run))
            mounts = [run[index+1] for index, item in enumerate(run) if item == '--mount']
            self.assertEqual(mounts, [f'type=bind,src={root},dst={root}',
                                     f'type=bind,src={root}/passwd,dst=/etc/passwd,readonly',
                                     f'type=bind,src={root}/group,dst=/etc/group,readonly'])
            for binary, filename in binaries.items():
                source = Path(filename).read_text()
                compile(source, filename, 'exec')
                self.assertIn("'--host', 'unix:///var/run/docker.sock'", source)
                self.assertIn(engine.name, source)
                self.assertIn('/usr/lib/postgresql/17/bin/' + binary, source)
            engine.close()
            self.assertEqual(calls[-1], ['rm', '--force', '--volumes', engine.name])

    def test_uncertain_run_is_not_repeated_and_is_reconciled(self):
        with tempfile.TemporaryDirectory(prefix='macrogoal-container-probe-') as directory:
            engine = ContainerPostgres(Path(directory), {}, {}, lambda: None)
            engine.docker = '/mock/docker'
            calls = []
            def dock(args, **kwargs):
                calls.append(args)
                if args[0] == 'run':
                    raise subprocess.TimeoutExpired('synthetic docker run', 40)
                output = json.dumps([{'Id': 'sha256:'+'a'*64, 'RepoDigests': ['postgres@sha256:'+'b'*64]}]) if args[:2] == ['image', 'inspect'] else ''
                return subprocess.CompletedProcess(args, 0, output, '')
            engine.dock = dock
            with self.assertRaises(subprocess.TimeoutExpired):
                engine.start()
            engine.close()
            self.assertEqual(sum(args[0] == 'run' for args in calls), 1)
            self.assertEqual(calls[-2], ['container', 'inspect', '--format', '{{.Id}}', engine.name])
            self.assertEqual(calls[-1], ['rm', '--force', '--volumes', engine.name])


if __name__ == '__main__':
    unittest.main(verbosity=2)

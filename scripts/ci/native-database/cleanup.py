"""Best-effort exhaustive teardown. Any failed cleanup makes the gate fail."""
import shutil
import subprocess


def cleanup(c):
    report, root = c['report'], c['root']
    errors = []
    def attempt(stage, action):
        try:
            action()
        except Exception as exc:
            errors.append({'stage': stage, 'error': str(exc)})
            report.update(status='failed', cleanup_errors=list(errors), isolated_cluster_path=str(root))
            # Persist the first cleanup failure before continuing other teardown.
            # A later failure cannot leave a report claiming overall success.
            try:
                c['save']()
            except Exception as save_exc:
                errors.append({'stage': 'save_cleanup_failure', 'error': str(save_exc)})
    for index, session in enumerate(c['sessions']):
        attempt('session_close_' + str(index), session.close)
    if c['started']:
        def stop_postgres():
            state = subprocess.run([c['B']['pg_ctl'], '-D', str(c['data']), 'status'], env=c['ENV'],
                                   text=True, capture_output=True, timeout=10)
            if state.returncode == 0:
                c['command']([c['B']['pg_ctl'], '-D', str(c['data']), '-m', 'immediate', '-w', 'stop'])
                report['postgres_cleanup'] = 'stopped'
            elif state.returncode == 3:
                report['postgres_cleanup'] = 'confirmed_not_running'
            else:
                raise RuntimeError('Uncertain local PostgreSQL state: ' + state.stderr)
        attempt('postgres_stop', stop_postgres)
    if c['container_engine'] is not None:
        attempt('postgres_container_remove', c['container_engine'].close)
    if (root / 'postgres.log').exists():
        attempt('preserve_postgres_log', lambda: shutil.copy2(root / 'postgres.log', c['R'] / 'results/postgres.log'))
    if not errors:
        attempt('remove_temporary_cluster', lambda: shutil.rmtree(root))
    if errors:
        report.update(status='failed', cleanup_errors=errors, isolated_cluster_path=str(root))
    c['save']()


def cleanup_postgrest(c, dock, container, report, attempted, authenticated=False):
    """Log failure must not prevent exact-name removal or survive as a pass."""
    errors = []
    def failure(stage, exc):
        errors.append({'stage': stage, 'error': str(exc)})
        report.update(status='failed', cleanup_errors=list(errors), container_name=container)
        try:
            c['save']()
        except Exception as save_exc:
            errors.append({'stage': 'save_cleanup_failure', 'error': str(save_exc)})
    if attempted:
        exists, uncertain = False, False
        try:
            state = dock(['container', 'inspect', '--format', '{{.Id}}', container], check=False)
            if state.returncode == 0:
                exists = True
            elif 'No such container' in state.stderr or 'No such object' in state.stderr:
                report['container_cleanup'] = 'confirmed_absent'
            else:
                raise RuntimeError(state.stderr)
        except Exception as exc:
            uncertain = True
            failure('postgrest_inspect', exc)
        if exists:
            try:
                logs = dock(['logs', container], check=False)
                if logs.returncode:
                    raise RuntimeError(logs.stderr)
                filename = 'postgrest-authenticated.log' if authenticated else 'postgrest.log'
                (c['R'] / 'results' / filename).write_text(logs.stdout + logs.stderr)
            except Exception as exc:
                failure('postgrest_logs', exc)
        if exists or uncertain:
            # Removal targets only the generated container even if its inspect
            # or logs command failed; run itself is never repeated.
            try:
                result = dock(['rm', '--force', container], check=False)
                if result.returncode == 0:
                    report['container_cleanup'] = 'removed'
                elif 'No such container' in result.stderr or 'No such object' in result.stderr:
                    report['container_cleanup'] = 'confirmed_absent'
                else:
                    raise RuntimeError(result.stderr)
            except Exception as exc:
                failure('postgrest_remove', exc)
    if errors:
        report.update(status='failed', cleanup_errors=errors, container_name=container)
    c['save']()
    if errors:
        raise RuntimeError('PostgREST cleanup/reporting failed: ' + '; '.join(item['stage'] + ': ' + item['error'] for item in errors))

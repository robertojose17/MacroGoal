"""Native psql boundary regression, inside the runner's fresh local cluster only."""
import json


def run(c):
    report = {'status': 'running', 'tests': []}
    c['report']['session_protocol'] = report
    c['save']()

    def passed(name):
        report['tests'].append({'name': name, 'status': 'passed'})
        c['save']()

    def value(session, query):
        # Same semicolonless SELECT + persistent-session path as authenticated
        # state snapshots. Empty/malformed results must fail, never become [].
        return json.loads('\n'.join(session.run(query)))

    try:
        a = c['Session']()
        a.run('BEGIN')
        a.run('CREATE TEMPORARY TABLE session_boundary_fixture (id integer PRIMARY KEY, payload jsonb NOT NULL) ON COMMIT DROP')
        a.run("INSERT INTO session_boundary_fixture VALUES (1, '{\"marker\":\"first; value\"}'::jsonb)")
        query = "SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM session_boundary_fixture t"
        expected = [{'id': 1, 'payload': {'marker': 'first; value'}}]
        assert value(a, query) == expected
        assert value(a, query) == expected
        passed('semicolonless transaction snapshots execute before acknowledgment and keep response boundaries')

        a.run("INSERT INTO session_boundary_fixture VALUES (2, '{\"marker\":\"second\"}'::jsonb); -- already executed")
        expected.append({'id': 2, 'payload': {'marker': 'second'}})
        assert value(a, query) == expected
        assert value(a, "SELECT jsonb_build_object('marker','comment') -- trailing line comment") == {'marker': 'comment'}
        passed('terminated writes execute once and trailing SQL comments cannot swallow the boundary')

        a.run('ROLLBACK')
        assert a.run("SELECT to_regclass('pg_temp.session_boundary_fixture') IS NULL") == ['t']
        passed('semicolonless rollback executes and removes transaction-local fixture')

        c['Session']().run('SELECT 1 / 0', error='22012')
        passed('unterminated SQL errors exit with required SQLSTATE instead of acknowledging success')
        report['status'] = 'passed'
    except Exception as exc:
        report.update(status='failed', error=str(exc))
        raise
    finally:
        # All created sessions are tracked by the runner and closed by its
        # exhaustive teardown, including a failed constructor or assertion.
        c['save']()

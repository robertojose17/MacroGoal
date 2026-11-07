#!/usr/bin/env python3
"""Offline framing/control-flow probes, not PostgreSQL or SQL invariant evidence.

Load only the actual Session class, without importing the runner's entrypoint.
The tiny protocol model executes canned responses only at a semicolon boundary;
it deliberately treats psql's echo as an acknowledgment, not query execution.
"""
import ast
import io
import json
from pathlib import Path
import queue
import re
import subprocess
import time
import unittest
from unittest.mock import patch
import uuid
from authenticated_checks import snapshot, TABLES


def session_class():
    source = Path(__file__).with_name('run.py')
    tree = ast.parse(source.read_text(), filename=str(source))
    nodes = [node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'Session']
    assert len(nodes) == 1
    namespace = dict(uuid=uuid, queue=queue, re=re, subprocess=subprocess, time=time)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), 'exec'), namespace)
    return namespace['Session']


class ProtocolModel:
    """Canned, simple SQL tokens only. This is not a SQL parser or DB substitute."""
    def __init__(self, output_queue, responses):
        self.q, self.responses = output_queue, responses
        self.stdin = self
        self.stderr = io.StringIO()
        self.buffer, self.written, self.statements = '', '', []
        self.returncode = None

    def write(self, text):
        self.written += text

    def flush(self):
        for line in self.written.splitlines():
            if line.startswith('\\echo '):
                self.q.put(line[len('\\echo '):])
                continue
            self.buffer += '\n' + line.split('--', 1)[0]
            # Probe statements contain no semicolons in literals. Real quoted
            # semicolons are covered by session_checks on native PostgreSQL.
            while ';' in self.buffer:
                statement, self.buffer = self.buffer.split(';', 1)
                statement = statement.strip()
                if not statement:
                    continue
                self.statements.append(statement)
                response = self.responses[statement]
                if isinstance(response, tuple):
                    self.stderr = io.StringIO('ERROR:  ' + response[0] + ': synthetic failure\n')
                    self.returncode = 3
                    self.q.put(None)
                    self.written = ''
                    return
                for value in response:
                    self.q.put(value)
        self.written = ''

    def wait(self, timeout=None):
        return self.returncode

    def poll(self):
        return self.returncode


def make_session(responses):
    cls = session_class()
    session = cls.__new__(cls)
    session.q = queue.Queue()
    session.p = ProtocolModel(session.q, responses)
    return session


class SessionProtocolProbes(unittest.TestCase):
    def test_actual_snapshot_reader_executes_all_queries_before_ack(self):
        expected = {table: [{'table': table, 'revision': i}] for i, table in enumerate(TABLES)}
        responses = {}
        # Capture the actual snapshot SQL, rather than duplicate its query text.
        def collect(query):
            table = TABLES[len(responses)]
            responses[query] = [json.dumps(expected[table])]
            return responses[query][0]
        self.assertEqual(snapshot({'sql': collect}), expected)
        session = make_session(responses)
        for _ in range(2):
            self.assertEqual(snapshot({'sql': lambda query: '\n'.join(session.run(query))}), expected)
        self.assertEqual(len(session.p.statements), 2 * len(TABLES))

    def test_semicolonless_then_terminated_results_have_separate_boundaries(self):
        session = make_session({'SELECT 1': ['1'], 'SELECT 2': ['2']})
        self.assertEqual(session.run('SELECT 1'), ['1'])
        self.assertEqual(session.run('SELECT 2;'), ['2'])
        self.assertEqual(session.run('SELECT 1'), ['1'])

    def test_terminated_write_executes_exactly_once(self):
        session = make_session({'INSERT synthetic': [], 'SELECT count': ['1']})
        self.assertEqual(session.run('INSERT synthetic;'), [])
        self.assertEqual(session.run('SELECT count;'), ['1'])
        self.assertEqual(session.p.statements, ['INSERT synthetic', 'SELECT count'])

    def test_line_comment_cannot_swallow_statement_boundary(self):
        session = make_session({'SELECT 1': ['1']})
        self.assertEqual(session.run('SELECT 1 -- no terminator'), ['1'])
        self.assertEqual(session.run('SELECT 1; -- already terminated'), ['1'])

    def test_expected_sqlstate_requires_executed_error(self):
        session = make_session({'SELECT failure': ('23505',)})
        self.assertEqual(session.run('SELECT failure', error='23505'), [])
        self.assertEqual(session.p.returncode, 3)

    def test_wrong_sqlstate_fails_closed(self):
        session = make_session({'SELECT failure': ('42501',)})
        with self.assertRaisesRegex(AssertionError, 'Unexpected psql exit'):
            session.run('SELECT failure', error='23505')

    def test_success_is_not_accepted_as_expected_error(self):
        session = make_session({'SELECT 1': ['1']})
        with self.assertRaisesRegex(AssertionError, 'Expected SQLSTATE'):
            session.run('SELECT 1', error='23505')

    def test_missing_ack_timeout_is_not_success(self):
        session = make_session({'SELECT 1': ['1']})
        session.send('SELECT 1')
        with patch.object(session.q, 'get', side_effect=queue.Empty):
            with self.assertRaises(queue.Empty):
                session.result()

    def test_unexpected_process_exit_is_not_success(self):
        session = make_session({})
        session.marker = 'DONE_expected'
        session.q.put(None)
        session.p.returncode = 1
        session.p.stderr = io.StringIO('synthetic transport failure')
        with self.assertRaisesRegex(AssertionError, 'Unexpected psql exit'):
            session.result()

    def test_empty_snapshot_result_still_fails_closed(self):
        with self.assertRaises(json.JSONDecodeError):
            snapshot({'sql': lambda query: ''})


if __name__ == '__main__':
    unittest.main(verbosity=2)

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sql = fs.readFileSync('release-candidates/tdee-consistent-observation/schema-review.sql', 'utf8');
const statements = sql.replace(/--[^\n]*/g, '');
test('snapshot is additive, no-argument, stable invoker with a closed path', () => {
  assert.match(sql, /CREATE FUNCTION public\.observed_get_tdee_snapshot_v1\(\)/);
  assert.match(sql, /LANGUAGE plpgsql\s+STABLE\s+SECURITY INVOKER\s+SET search_path TO pg_catalog, pg_temp/);
  assert.doesNotMatch(statements, /SECURITY DEFINER|CREATE OR REPLACE|\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
});
test('identity is derived from auth and anonymous claims reject', () => {
  assert.match(sql, /actor uuid := auth\.uid\(\)/);
  assert.match(sql, /actor IS NULL OR coalesce\(\(auth\.jwt\(\)->>'is_anonymous'\)::boolean,false\)/);
  assert.match(sql, /ERRCODE='42501',MESSAGE='authentication_required'/);
});
test('ACL closes default execute within the installation transaction', () => {
  assert.match(sql, /BEGIN;[\s\S]+REVOKE ALL ON FUNCTION public\.observed_get_tdee_snapshot_v1\(\) FROM PUBLIC,anon,service_role;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.observed_get_tdee_snapshot_v1\(\) TO authenticated;/);
  assert.match(sql, /COMMIT;\s*$/);
});
test('one materialized query owns capture and sources, without volatile context calls', () => {
  assert.match(sql, /captured_at timestamptz := statement_timestamp\(\)/);
  assert.match(sql, /WITH profile AS MATERIALIZED[\s\S]+INTO profile_ok[\s\S]+FROM fingerprinted p;/);
  assert.doesNotMatch(statements, /context_for_actor\(|observed_get_dynamic_tdee_context_v1\(/);
});
test('meal items are scoped through owned meals, never an invented owner column', () => {
  assert.match(sql, /FROM public\.meal_items i JOIN meal_rows m ON m\.id=i\.meal_id/);
  assert.match(sql, /m\.user_id=actor/);
  assert.doesNotMatch(sql, /i\.user_id/);
  assert.match(sql, /WHERE i\.is_scheduled=false/);
});
test('limit plus one detects overflow and rejects ambiguous owners sources', () => {
  assert.equal((sql.match(/LIMIT 5001/g) || []).length, 3);
  assert.match(sql, /LIMIT 501/);
  for (const error of ['active_goal_conflict', 'tracker_unavailable', 'meal_limit', 'source_limit']) assert.ok(sql.includes(`MESSAGE='${error}'`));
});
test('fingerprint includes full ordered rows not only timestamps or counts', () => {
  assert.match(sql, /'sources',p\.sources,'counts',p\.counts/);
  assert.equal((sql.match(/jsonb_agg\(to_jsonb\(t\) ORDER BY t\.id\)/g) || []).length, 5);
  assert.doesNotMatch(statements, /max\s*\(/i);
});
test('observation snapshot cannot mark a recommendation actionable', () => {
  assert.match(sql, /'reviewDue',false/);
  assert.match(sql, /'proposal',NULL/);
  assert.match(sql, /'safety',jsonb_build_object\('enabled',false,'eligibility','unverified'\)/);
});

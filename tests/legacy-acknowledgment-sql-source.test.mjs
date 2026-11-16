import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../release-candidates/tdee-adaptive-review/legacyGoalAcknowledgmentCandidate.sql',import.meta.url),'utf8');
test('acknowledgment SQL never writes goals/profiles or synthesizes a rate anchor',()=>{
 assert.doesNotMatch(sql,/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.(?:goals|users)/i);assert.doesNotMatch(sql,/INSERT\s+INTO\s+.*anchors/i);assert.doesNotMatch(sql,/set_config|request\.jwt|CREATE ROLE|GRANT.*service_role/i);
 assert.match(sql,/INSERT INTO tdee_legacy_ack_private\.receipts/);assert.match(sql,/ROLLBACK;\s*$/);
});
test('public wrapper is own-user and OFF before reading current data or receipts',()=>{
 const wrapper=sql.slice(sql.indexOf('CREATE FUNCTION public.tdee_legacy_goal_confirmation_v1'));
 assert.match(wrapper,/a uuid:=auth\.uid\(\)/);assert.match(wrapper,/enabled constant boolean:=false/);assert.ok(wrapper.indexOf('IF NOT enabled')<wrapper.indexOf('PERFORM 1 FROM public.users'));
 assert.match(wrapper,/TO authenticated/);assert.match(sql,/ALTER TABLE tdee_legacy_ack_private\.receipts ENABLE ROW LEVEL SECURITY/);
});
test('server time, immutable receipt and exact request replay are explicit',()=>{
 assert.match(sql,/NEW\.confirmed_at:=clock_timestamp\(\)/);assert.match(sql,/acknowledgment_receipt_immutable/);assert.match(sql,/r\.request IS DISTINCT FROM req/);assert.match(sql,/RETURN tdee_legacy_ack_private\.receipt_result\(r\)/);
 assert.match(sql,/'historicalBaselineAuthorized',false/);assert.match(sql,/'nutritionalApproval',false/);
});
test('current goal/profile are locked and full server goal fingerprint is bound',()=>{
 assert.match(sql,/public\.users WHERE id=a FOR UPDATE/);assert.match(sql,/public\.goals WHERE user_id=a AND is_active=true FOR UPDATE/);assert.match(sql,/to_jsonb\(g\)::text/);assert.match(sql,/SET extra_float_digits=3/);assert.match(sql,/profileUpdatedAt/);assert.match(sql,/journeyBinding/);
});
test('owner deletion cascade is allowed only after parent disappears, direct receipt deletion stays rejected',()=>{
 assert.match(sql,/owner_id uuid NOT NULL REFERENCES public\.users\(id\) ON DELETE CASCADE/);
 assert.match(sql,/IF TG_OP='DELETE' AND NOT EXISTS\(SELECT 1 FROM public\.users WHERE id=OLD\.owner_id\) THEN RETURN OLD; END IF;/);
 const guard=sql.slice(sql.indexOf('CREATE FUNCTION tdee_legacy_ack_private.guard_receipt'),sql.indexOf('CREATE TRIGGER legacy_ack_receipt_immutable'));
 assert.ok(guard.indexOf("TG_OP='DELETE' AND NOT EXISTS")<guard.indexOf("TG_OP<>'INSERT'"));
 assert.match(guard,/IF TG_OP<>'INSERT' THEN RAISE EXCEPTION/);
});

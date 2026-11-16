-- Definitions installed inactive by migration20261116124243; this review script stays ROLLBACK-only.
-- SOURCE-ONLY REVIEW CANDIDATE. No cron, credentials, grants, or activation.
-- This is deliberately not a migration; SQL execution has not been verified.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
create schema tdee_scheduler_private;
revoke all on schema tdee_scheduler_private from public, anon, authenticated, service_role;
create table tdee_scheduler_private.ledger (
 owner_id uuid not null references auth.users(id) on delete cascade,
 context_revision text not null check(context_revision ~ '^[a-f0-9]{64}$'),
 revision bigint not null check(revision between 1 and 9007199254740990),
 record jsonb not null check(jsonb_typeof(record) = 'object'),
 hold jsonb,
 primary key(owner_id, context_revision),
 check ((record->>'ownerId') is not distinct from owner_id::text),
 check ((record->>'contextRevision') is not distinct from context_revision),
 check (jsonb_typeof(record->'revision') is not distinct from 'number'),
 check ((record->>'revision')::numeric is not distinct from revision::numeric),
 check ((record->>'version') is not distinct from 'daily-assessment-ledger-v1'),
 check ((record->>'status') is not null and record->>'status' in ('claimed','completed','uncertain','retryable')),
 check (jsonb_typeof(record->'claimedAt') is not distinct from 'number'),
 check ((record->>'claimedAt')::numeric=trunc((record->>'claimedAt')::numeric)),
 check ((record->>'claimedAt')::bigint between 0 and 253402214400000),
 check (record->>'claimId' is not null and (record->>'claimId')::uuid is not null),
 check (record->>'key' is not null and record->>'localDate' is not null and record->>'timezone' is not null),
 check (case when record->>'status'='claimed' then record->'finishedAt' is not distinct from 'null'::jsonb
 else jsonb_typeof(record->'finishedAt') is not distinct from 'number' and
 (record->>'finishedAt')::numeric=trunc((record->>'finishedAt')::numeric) and
 (record->>'finishedAt')::numeric<=253402214400000 and (record->>'finishedAt')::bigint >= (record->>'claimedAt')::bigint end),
 check (hold is null or (jsonb_typeof(hold)='object' and jsonb_typeof(hold->'assessedAt') is not distinct from 'number'
 and jsonb_typeof(hold->'reevaluateAt') is not distinct from 'number'
 and (hold->>'assessedAt')::numeric=trunc((hold->>'assessedAt')::numeric)
 and (hold->>'reevaluateAt')::numeric=trunc((hold->>'reevaluateAt')::numeric)
 and (hold->>'assessedAt')::bigint between 0 and 253401609600000
 and (hold->>'reevaluateAt')::bigint=(hold->>'assessedAt')::bigint+604800000))
);
create table tdee_scheduler_private.receipt (
 owner_id uuid not null,
 context_revision text not null,
 claim_id uuid not null,
 daily_key text not null,
 outcome text not null check(outcome in ('completed','not_executed')),
 observed_at bigint not null check(observed_at between 0 and 253402214400000),
 primary key(owner_id,context_revision,claim_id),
 foreign key(owner_id,context_revision) references tdee_scheduler_private.ledger on delete cascade
);
alter table tdee_scheduler_private.ledger enable row level security;
alter table tdee_scheduler_private.receipt enable row level security;
revoke all on all tables in schema tdee_scheduler_private from public, anon, authenticated, service_role;
-- No policies or role creation. A separately reviewed narrowly scoped worker role
-- needs schema USAGE, ledger SELECT/INSERT/UPDATE, receipt SELECT/INSERT and RLS.
-- No DELETE/UPDATE receipt, no goal, entitlement, review or acceptance privileges.
rollback;

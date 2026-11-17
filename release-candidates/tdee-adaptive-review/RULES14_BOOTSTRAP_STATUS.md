# Rules14 genuine baseline composition

Source-only integration, no activation or deployment. Shared production composition calls existing release-guarded `ensureRateAnchor` before rules source calculation for both own authenticated and internally selected scheduled paths. Pure rules issuer seam stays independently testable.

A verified newly stored anchor returns `calibration_required`, actual `mayHaveWritten:true`, and explicit `baselineStatus:stored`. Scheduler completes this verified baseline event as preserved/calibration, not uncertain issuance; ambiguous/failed bootstrap writes still enter reconciliation. No immediate recommendation after a new baseline, no synthetic receipt, no timestamp rewrite, no reset of existing anchor history. Eligibility/policy/coverage and ordinary fourteen-day window remain downstream requirements.

Tests: 10 new integration tests + 14 existing anchor tests PASS. Covers actual bootstrap source/append/readback → existing-anchor rules calculation/issuer, absent receipt, unknown write, original accepted timestamp, guards OFF/no ports, own/scheduled composition, scheduler baseline vs uncertainty, actual internal provider adapter→service cache→revalidation and dirty rejection. Provider tests use explicit synthetic ports, not provider claims or live credentials. No assertion of live operational eligibility.

Deployment dependencies unchanged: genuine accepted manual-goal receipt, anchor source/append SQL wrappers and RATE_ANCHOR_PERSISTENCE_RELEASE must be reviewed/enabled in coordinated rollout. Scheduled service provider-refresh, worker, selector, policy and daily-storage release gates remain OFF and need their own end-to-end verification. This patch does not enable anything or install a schedule.

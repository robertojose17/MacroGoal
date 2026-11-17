# Release configuration and setup UX: source only

Shared `adaptivePolicyBinding.ts` is used by both own runtime and internal worker. Worker requires rules14 + valid integer revision and fails before service-client creation when absent. `ENV_SOURCE_ONLY.json` serializes the activation-plan binding into exact same four environment variables. It contains no credential. No environment settings changed.

Calibration and unverified-baseline responses have explicit nonactionable setup envelopes. Confirmed anchor writes preserve `mayHaveWritten:true`; UI explains original acceptance date, fourteen-day requirement, no target change and no reset/backdate. Unavailable baseline does not claim an accepted target or successful save. It suggests retrying and, if genuinely absent, confirming intended initial goals. Existing screen/controller can consume setup through the strict hold parser, with no accept action.

Six tests PASS: shared binding/invalid config, both route imports, actual HTTP202→UI calibration, unavailable baseline, malformed setup rejection. Full backend + web graph typecheck remains required by independent reviewer.

`GATE_CHANGES_SOURCE_ONLY.json` lists exactly twelve intended full-release constants (thirteen boolean fields), no legacy rate-issuer activation. `prepare-release-gates.py` builds a separate sibling source overlay from the fully assembled reviewed source, so it preserves ongoing worker reconciliation/date/bootstrap patches. It has NOT been run. Do not deploy/activate until E2E and scheduled-reconciliation safeguards pass. Current source/config feature flags remain unchanged.

Policy registration validity remains unsettled. The activation-plan binding currently hashes a candidate policy with technical9999 expiry. No registration performed; technical until-revoked is neither medical approval nor a promise of provider entitlement validity. If the policy document changes, regenerate canonical digest/BINDING/ENV together before deployment. Genuine provider/source30s remains unchanged.

Cron and SQL activation are separate reviewed artifacts from activation_plan. This patch does not apply them, edit saved instructions, or add scheduling.

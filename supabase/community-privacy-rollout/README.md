# Community privacy rollout package

Status: prepared and inactive. The application global and development opt-in flags are false. These files are versioned outside the automatic `supabase/migrations` and `supabase/functions` deployment directories. Saving this folder is not an instruction to execute SQL or publish an app.

## Contents

- `edge-package/functions/community-profile/index.ts.template`: normal version-2 profile endpoint. It verifies the request user and calls the user-scoped canonical snapshot RPC. Its shared modules are in `edge-package/functions/_shared`; the existing legacy profile endpoint is not replaced by this package.
- `edge-package/deno.json`, per-function configuration and npm lock pin the reviewed Supabase SDK dependency. Hosted multifile bundling still needs verification. The endpoint uses the standard runtime URL and public anon-key variables; no new secret is embedded here. Native-only CORS and null-avatar projection are the current conservative defaults.
- `sql/10-install-closed.CANDIDATE.sql`: guarded CLOSED installation.
- `sql/20-enable-pair.CANDIDATE.sql`: guarded two-account activation. Account IDs and approval/readiness settings must come from trusted operator configuration and are deliberately absent from this repository.
- `sql/25-read-cleanup-state.READONLY.sql`: review exact trial relationship state before cleanup.
- `sql/30-close-and-clean-pair.CANDIDATE.sql`: close access and clean only reviewed trial-created relationship rows; requires a matching reviewed digest.
- `sql/40-rollback-extension.CANDIDATE.sql`: guarded removal of this extension after closure. It does not reopen broad privacy access or recreate removed test relationships.

## Materialize the endpoint source

The `.ts.template` files contain the exact reviewed TypeScript bytes; `package-lock.json.template` preserves the exact pinned npm lock. The suffix deliberately keeps Deno-only code out of Expo’s broad TypeScript input glob. Before deploying, copy this package outside the app source tree and remove only the `.template` suffix from all template filenames; preserve all relative directories and `deno.json` files. The endpoint manifest records the resulting canonical filenames and SHA-256 hashes. The `node_modules` directory is not included. No automatic materialization or deployment hook is installed.

## Boundaries

The server derives the caller from authenticated Supabase Auth, not a caller-supplied ID. New callable RPCs enforce exact pair caller/target checks and filter results on the server. PostgreSQL EXECUTE grants apply to the shared authenticated role; they are not UUID-specific grants. Private helper/state/request tables remain inaccessible directly. Existing global privacy cutover and legacy service-route retirement are separate work.

The temporary pair mode adds restrictive policies and relationship revocation guards. Whole-table TRUNCATE of the three relationship stores is blocked while the mode is active. Installation/activation/cleanup can briefly wait for or block relationship writes, including nonpair writes. Respect bounded timeouts; never retry an uncertain commit blindly. No purchases, entitlements or financial rules are modified.

## Required execution checks

Use the exact reviewed source and compare the current catalog before installation, again before activation, and before rollback. Stop on drift. The source and hosted endpoint must be ready before enabling the pair. Require an empty initial pair relationship/block/request/cursor baseline; do not erase pre-existing state to make the test pass. Use normal app screens and user-entered credentials. Do not create special test screens. Preserve both accounts, prior content and unrelated relationships.

Review the exact post-test row/revision digest before cleanup, and abort on concurrent changes. Keep both app flags false until a separately coordinated activation. This folder does not include account IDs, credentials, customer rows or a production-wide enable command.

## Verification scope

Local tests covered session isolation, disabled-path parity, the real Community components with mocked native/service responses, genuine SDK request construction, offline Deno entrypoint loading and isolated PostgreSQL permission/relationship checks. A full native app build, hosted two-account UI test and multi-connection production PostgreSQL concurrency check have not been completed. Passing local checks does not establish those outcomes.

# Narrow client candidate — 2026-11-11

This branch is based on main `5c3c2ac0d6ffd3d8f523307737a0147f7f5703eb` (23.0.2). It adds only the five Go Premium client files, the matching deployed tracker protocol/report/SQL evidence, and tracker regression coverage. It does not include the broader TDEE, nutrition-goal, private-preview or recipe/planner candidate. Native version/build numbers are unchanged. It needs only the already deployed tracker RPC and `track-onboarding` v23.

The only main-to-earlier-tracker baseline source difference was a nonfunctional ESLint control-regex explanation. The client patch otherwise applies directly to the exact main sources. No workflow file or automatic trigger was added, removed or bypassed. This branch does not match the existing purchase workflow's push branch filters. No isolated database, hosted preview, native build or app release is started by this source publication.

Fresh checks of this narrow main-based candidate:

- 65 checkpoint, routing, purchase and subscription tests passed.
- Focused ESLint: zero errors, one existing subscription effect warning.
- Full configured source TypeScript comparison with the same available dependency tree: 1,658 diagnostics in both baseline and candidate, zero introduced. This is not a clean app typecheck or a locked-dependency release certification.
- Earlier actual-SQL results in the rollout document remain historical, not a fresh database execution for this candidate. No new database test environment was created.
- Authenticated testing through the updated app is still pending. Source tests and a published backend do not establish installed-client behavior.

Expo inspection found only the existing `roberto-review` web alias at deployment `74wlhcn9gz`, built from `5a314f1ab54bed77f15de39c191e001b9e68b502` using `deploy-web-preview.yml` with `prod: false`. It is not a production web app and was not promoted or used as one. No EAS Update channels or runtimes were present. Additional native builds were shown as pay-as-you-go after exhausted build credits. No billable build, OTA, store submission or TestFlight action was started.

Before a real app release, resolve distribution and any applicable build cost, validate the complete chosen release, and obtain approval for any TestFlight action. Do not publish the unrelated broad working branch or enable private-preview routes to bypass those steps. Then check allowed host tabs through the owner's app, verify same-flow labels at ingestion, and preserve unknown or historical missing labels honestly. Never create fake financial transactions for attribution acceptance.

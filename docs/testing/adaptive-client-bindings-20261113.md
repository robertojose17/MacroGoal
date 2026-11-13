# Adaptive client bindings — inactive infrastructure

The candidate client speaks the separate `adaptive-review-v1` contract from
`release-candidates/tdee-adaptive-review/apiContract.ts`. It does not change the
strict observation-v1 parser. The independent `EXPO_PUBLIC_TDEE_REVIEW_MODE`
flag is not set in any build/workflow by this change. No screen imports or
renders `AdaptiveTdeeReviewCard`.

## Implemented

- Version, owner, proposal digest, expiry, current/target values and receipt
  identities are validated before use. A proposal delta above the owner's
  requested 200 kcal ceiling is rejected; this ceiling is not represented as
  individualized clinical validation.
- The transport sends only the four immutable identity fields for acceptance,
  never calorie/macro numbers. It does not automatically retry mutations.
- Explicit acceptance uses the existing candidate controller. It requires its
  authoritative policy/eligibility/completeness/serialization gates; this code
  does not manufacture them.
- An identity-only journal serializes competing requests. Web storage uses an
  IndexedDB read/write transaction across tabs. Native storage uses SecureStore
  and a per-key same-JavaScript-runtime lock. This is **not** a cross-native-process
  guarantee. No calorie, weight, target, credential or profile payload is stored.
- Focus/background/account changes invalidate pending UI work. A response after
  cancellation does not claim undo. Receipt recovery remains possible with new
  recommendations disabled. A committed receipt requires an active-goal read
  before the hook emits the existing goal-change event.
- Prepared bilingual UI shows current and proposed targets and an explicit
  accept action. It is deliberately not rendered or imported by a screen.

## Verification and remaining work

79 tests passed: 62 existing controller tests and 17 new parser/transport/journal
tests. New-file ESLint passed. Absolute application typecheck reported the one
pre-existing `app/delete-account.tsx` diagnostic; no typecheck pass is claimed.

No authenticated endpoint, real IndexedDB/SecureStore lifecycle, native app,
actual hook lifecycle, UI, deployed client, policy approval or clinical model
validation has been tested by these unit tests. The existing server remains
observation-only until separately reviewed backend installation/activation.
Server-side idempotency, source serialization, immutable receipts and current
goal revisions remain authoritative; clearing browser storage or losing a
native key is not evidence that an earlier acceptance failed.

## Inert source boundary

All five prepared client files live only in `release-candidates/tdee-adaptive-review/client/`: `AdaptiveTdeeReviewCard.tsx`, `useAdaptiveTdeeReview.ts`, `adaptiveTdeeReview.ts`, `adaptiveTdeeJournal.ts`, and `adaptiveTdeeJournalStorage.ts`. No application runtime directory imports this candidate. Tests import the candidate explicitly; the existing production-binding safety invariant remains unchanged. Moving these sources does not enable any route, screen, or write.

After source relocation, the unchanged application-binding invariant passes in the requested broad suite (`tests/*tdee*.test.cjs`, `tests/adaptive-*.test.mjs`, goal-session and observation-focus recovery): **254/254 passed**, no skips. The relocated parser/journal tests independently pass **17/17**; candidate client ESLint exits 0. These are local automated checks, not live-app or clinical verification.

## Dependency-controlled hook lifecycle pass

`tests/adaptive-tdee-hook-lifecycle.test.cjs` runs the actual candidate hook, acceptance controller, parser and journal with controlled React-hook primitives, auth, transport and persistence dependencies. Nine checks pass: committed goal reread before event/success, blur/account/background/unmount during acceptance, lost-response receipt recovery without a second accept, blur during goal reread, failed reread withholding committed UI state, and receipt recovery with rollout OFF. This is not a React renderer, real navigation lifecycle, native app or production API test.

The checks identified an inactive-candidate issue: refresh exposed `committed` before goal reread finished. It now publishes that state only after reread and the current-session guard. Application runtime files are untouched. The broad unit suite at this pass reports 269/269, no skips (includes concurrent source-test additions).

Real Chromium IndexedDB cross-tab validation was attempted using existing `/usr/bin/chromium`, two isolated tabs and an existing local README, without creating an app/server or accessing any live account. Chromium could not launch: `socket() failed: Operation not permitted`, plus a Crashpad startup error. Therefore cross-tab browser execution is **not verified**. The explicit optional diagnostic remains at `release-candidates/tdee-adaptive-review/client/qa/indexeddb-browser-check.mjs`; it is intentionally outside the portable unit suite and is not reported as passing. Real browser IndexedDB, SecureStore/process lifecycle, actual React/native navigation and deployed API integration remain release gaps.

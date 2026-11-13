# API / DTO recovery review, 2026-11-12

This is source-level recovery, not account E2E validation or a deployment.

## Intentional behavior changes

- Meal-plan reads retain the stored macros, including legitimate zero. The previous heuristic silently replaced values below 10 using another food record; it has been removed.
- Adding an item requires known finite nonnegative calories/protein/carbs/fats. Missing fiber remains null rather than becoming zero. The accepted-goal caller's owner/current-request guard is preserved immediately before the synchronous validation and write.
- Meal-plan creation timestamps and template descriptions retain actual nullable database values.
- Tracker reads no longer change historical measurement units from kg to lb. Nullable emoji and valid tracker types/frequencies are represented honestly. Goal updates use only real columns and the authenticated owner's row.
- Analytics/social JSON is recursively validated, including nonfinite values, cycles, sparse arrays and prototype keys. Analytics no longer logs property values.
- Referrals no longer attempt client-side XP writes to another account or nonexistent columns. Applying a code reports rewardStatus=pending_verification. Displayed referral XP is read from the owner's actual ledger, not inferred as referrals multiplied by 1000.
- Bookmark APIs accept an optional expected owner, propagate write failures, and reject missing/invalid counter receipts instead of fabricating a count or success.
- API headers now correctly support all HeadersInit representations through the Headers API.

## Remaining limitations

Bookmark mutation and counter updates are still two separate operations, not atomic or safely replayable across failures. A second-stage failure is reported explicitly; caller recovery must refresh rather than blindly replay. Referral reward settlement needs an independently reviewed server-authorized atomic path; this change does not install one. Tracker default seeding remains inherited behavior. None of these APIs were called against a real account during this pass.

## Validation

Focused tests execute real transpiled helpers/callbacks with simulated services. No provider calls, account mutations, database changes, builds or publishing. The parent gate must validate the complete candidate; a clean file subset is not a global typecheck pass.

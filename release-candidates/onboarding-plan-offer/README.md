# Onboarding plan offer candidate

Based on historical commit 5b4ef5976139a793a3c38a98811bae6ce0b7cab9, not verified as current production. Not integrated with unpublished TDEE work. Do not deploy this branch as a full release or merge over newer work without integration review.

Scope: approved English/Spanish copy for onboarding_complete only; annual remains selected but onboarding never automatically starts a purchase; existing manual payment and other source content remain unchanged. Automatic notification prompts move from initialization/auth/onboarding to first foreground Food or Coach entry, respecting prior OS decisions and the legacy device marker. Manual notification settings actions remain available.

Validation: 95 local pure-logic/source/syntax checks passed; git apply --check passed against exact baseline; five portable notification tests passed. No full app types/build/native/device/UI integration validation. Web cannot validate native OneSignal or store dialogs. No Supabase change, Expo build, TestFlight submission or deployment.

Run portable checks: node --test tests/onboarding-notification-prompt.test.cjs (existing TypeScript dependency).

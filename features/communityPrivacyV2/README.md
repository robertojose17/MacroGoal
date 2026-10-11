# Community Privacy V2: inactive source

This folder is an unconnected source draft. COMMUNITY_PRIVACY_V2_ENABLED is false. No existing route, screen, provider, or service imports it. Copying these files does not activate a UI or change server access.

The files contain app-side profile contracts, response validation, injected clients, a follow-request controller, auth binding, and inbox UI. Importing them does not initiate network calls, timers, or auth listener registration. Factories receive dependencies explicitly; the live provider starts its binding only when mounted. No service-role client or credential belongs in this folder.

## Activation gates

- Keep the flag false and leave existing routes unchanged until a separate activation review is approved.
- Deploy and verify the server-side authorization, atomic profile snapshot, follow-request RPCs, and raw-data policies independently. Client visibility checks and this flag are not an authorization boundary.
- Implement and review a user-JWT-bound transport, session/account-switch handling, and strict v2 response parsing. Never use a service-role credential or log private transport sessions.
- Confirm all profile readers use the approved server boundary; resolve remaining metrics and post-audience release gates.
- Run full application typecheck/build and device UI, accessibility, interruption, logout, account-switch, pagination, and concurrent-decision checks before connecting providers or routes.
- Production migrations, handler deployment, feature enablement, and release require separate approval.

Compatibility target: Expo 54, React 19.1.0, React Native 0.81.4, TypeScript 5.9.3 with strict Bundler resolution and extensionless relative imports. Local package verification does not establish full app or production readiness.

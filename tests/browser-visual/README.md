# Actual styled component visual checks

Run `npm ci --ignore-scripts --no-audit --no-fund`, install the pinned Playwright Chromium (`npx --no-install playwright install chromium`), then `npm test` from this folder. CI executes this separately from, and does not replace, the existing browser-journal suite.

The renderer bundles repository GoalWeightCard, ObservedActivityCard, DashboardStatInfo, ProgressCard mini chart, weight conversion and presentation utilities. Actual React Native Web layout/styles and Modal behavior are used. Only data/service hooks, translations, expo gradient and SVG native primitives are adapted. Native SVG primitives map directly to the equivalent DOM SVG elements; no chart data or shape is replaced. Font-scale cases explicitly simulate React Native `fontScale` and scaled Text style on web, not iOS Dynamic Type.

Every fixture is synthetic (80 kg initial, 75 kg goal), owner `fixture-only`. No user data, Supabase, authentication or production network is loaded. Network is restricted to the local test server. Missing data is a distinct fixture. The reference screenshot is NOT included in repository/artifacts; only its layout informed implementation. Artifacts may be shown as a synthetic component preview, not a screenshot of a user's account or deployed production.

Five Chromium cases cover normal/narrow, light/dark, kg/lb, EN/ES, enlarged text, missing data, genuine two-column geometry, no viewport overflow and all three information dialogs closing by button and Escape. Pixel captures are review evidence, not a pixel-diff claim against the reference. Device/VoiceOver QA remains separate.

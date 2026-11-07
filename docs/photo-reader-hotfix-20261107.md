# Photo label reader hotfix provenance

Baseline: f0df04846717c4b18a2624f175c4775553bdd784. Existing public app server only; no client, native build, schema, flags, lookup, or search deployment changes.

Runtime changes: strict bilingual calorie evidence and counted-serving association, physical-header prompt clarification, and sanitized boolean/null header diagnostics. No inferred grams, volume conversion, cross-column mixing, provider/model/budget changes, or weakened two-read gate.

Deployment closure: all 30 modules from the baseline, with only the three reviewed runtime modules patched. Existing JWT verification remains true. Two packaging files pin the existing imports to the actual CI lock resolutions: npm supabase-js 2.119.0 and JSR functions-js 2.119.0. Lock contents preserve the original graph and integrity entries, adding only exact specifier aliases. Hosted transitive frozen-lock enforcement is unproven.

Validation: new label/diagnostic suites 10/10; independent label/sanitizer/entrypoint review 16/16; actual-entrypoint request comparisons 8/8. Historical v44 harness: baseline909/917, patched902/917, with eight historical lineage failures and seven deliberately changed prompt/diagnostic equality assertions. This is not a fully green suite or an end-to-end photo retest. CI Deno2.5.6 frozen check passed on baseline; local full-network exact-toolchain revalidation remains blocked by transport.

Runtime and test SHA256:
- supabase/functions/vision-nutrition-extract/index.ts: 66b8b7180590ea5469e88126d7c78b5c1ce88a7431f03dcc391188e39af0b34b
- supabase/functions/vision-nutrition-extract/nutritionReadGate.mjs: 1ea9a505212f46632a2339a9975ad3dec559c4202e12036d37850de9189761c9
- supabase/functions/vision-nutrition-extract/recovery-discovery.ts: 5ed6d02b9fee033106e08dc3a3670a8791e37419ca9902ddd8dd2b18986b69d1
- tests/dulzura-label-diagnosis.test.mjs: 9b626a4b98cc3ddc06a72532bfe79a9d87917a8df5fb1f35901b3ce3e014d1f1
- tests/source-empty-proposal-diagnosis.test.mjs: 8c5ffeb28fce6982d51a7e863350f05603ae4b6cdfd6faaedcbb2b4171b4a66d

Deployment payload SHA256: 77a338c78a6089797699ec10c89eb6d16dceb689b3c36c6ca23ac06a128e6f3f.

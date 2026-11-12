# OFF 100g barcode fix — 2026-11-12

Deployed production Supabase lookup-barcode v47, verify_jwt=true. SHA256 a2607efa798e1275811059eb4b55432429ab6e1f067ed7e1598f9ec3ed84b2d8. All 16 uploaded source files matched deployment readback.

Private validator and capture/refresh SQL applied in existing production project. Embedded transaction-local tests passed before commit: creation from actual public cookies source, exact replay, changed-request rejection, UPC alias same owner, source binding, unchanged raw evidence, missing micronutrient enrichment and unit conversion, refresh replay, preserved macros. Test records rolled back internally; readback confirmed zero temporary foods/receipts. Existing v3 derive hash unchanged. No new public endpoint/grant or flag changes.

26 pure SQL/JS parity cases passed in production; 51 Node checks passed locally. These checks are not native multisesion concurrency or a full app UI pass. No new test environment was created. No TDEE or TestFlight changes.

OFF_MASS_CAPTURE_ENABLED dashboard digest matched SHA256 of literal true on 2026-11-12; unchanged. Browser app session was signed out at /auth/signup, preventing end-to-end visual validation. User must sign in before remaining scan/detail UI check. Test barcode: 0044000060114 (Oreo chocolate sandwich cookies), do not log it to diary just to test.

New v4 only admits explicit gram basis with complete unqualified core facts. Source100g is kept as source100g. Qualified secondary energy remains raw, not canonical. Incomplete baking powder and liquids without mass evidence still require label confirmation. This does not claim every OpenFoodFacts product can be auto-imported.

SQL files are the exact applied scripts, despite REVIEW comments preserved from drafting. Apply 01 before 02 in fresh matching deployment; 02 preflight guards against source drift and is not rerunnable after integration without review.

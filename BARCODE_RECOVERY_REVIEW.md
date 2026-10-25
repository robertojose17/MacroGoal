# Barcode recovery — local review handoff

Implementation base: canonical main 6cae1f42614917ca5dad5aca5f7ca854a500ec1a.
Backend bases read directly from production (read-only):
- vision-nutrition-extract v19, updated 2026-10-17T22:00:00.633Z.
- lookup-barcode v36, updated 2026-10-17; its cache reads food_items first (original lines 243–256).
The work copy retains verbatim reference sources in supabase/vision-v19-baseline and supabase/lookup-v36-baseline. Those reference directories need not be deployed.

## Behavior

The native route probes recovery_capabilities without invoking a provider or writing data. Disabled/unavailable/old backends retain the original native capture screen. When BARCODE_RECOVERY_ENABLED=true, the new screen searches by barcode plus supplied/existing name and brand, displays at most three distinct sourced products, and offers front + nutrition-label photos. A source without exact published barcode evidence is not eligible for shared confirmation.

Web discovery uses the existing OpenRouter account, Gemini 2.5 Pro and Exa web plugin configuration. URLs must appear in provider citation annotations. Product evidence is taken from one retrieved Product record, never from model nutrition summaries or merged sources. Images may be read only when the suggested label URL belongs to that same Product.image array, with an allowed page/CDN relationship. Online label readings use the existing two-read vision validator. Published structured nutrition, a read published label, and the user's physical label have different provenance labels.

On photos, readable physical numbers and serving veto conflicting online values, including partially readable evidence. Fully valid physical readings can be reviewed independently of web success. Missing/unclear fields are not changed to zero. Specific nutrient/serving/front issues are displayed. Transport/analysis problems are distinguished from bad photographs. Per-100g-only printed labels are supported as a 100 g basis; milliliters are not invented as grams.

The confirmation screen requires separate explicit confirmations for exact scanned identity, serving/preparation, nutrition, and shared-catalog update. The signed proposal binds owner, expiry, barcode, catalog revision, source values, and photo-attempt revision. Client values are never accepted as authoritative. Confirmation performs no AI call and does not add food to a diary.

## Proposed database change — NOT APPLIED

supabase/proposed/barcode-recovery.sql contains two SECURITY INVOKER RPCs, executable only by service_role (PUBLIC/anon/authenticated revoked):
- claim_barcode_recovery: creates/claims a pending record in existing food_submissions before provider work; one discovery, at most two deliberate photo attempts, 20-minute sessions; proposed caps 6 sessions/user/hour and 100 globally/day. Count-based limits, NOT a USD ledger. Maximum per session: 3 searches and 10 vision calls (up to two reads for one online label per phase, plus uploaded-photo reads). New recovery provider requests disallow fallback and cap token price at USD 2.5/15 per million input/output tokens; search output is capped at 1,024 and each vision output at 1,536 tokens. These are not a hard total-dollar cap. Unknown provider outcomes retain their claims; no automatic paid retry.
- confirm_barcode_recovery: transaction locks submission and barcode, checks the catalog timestamp/id and latest photo revision, updates/inserts existing food_items and records provenance/receipt in food_submissions atomically. Replaying identical confirmation returns its recorded receipt. Conflicts do not silently overwrite a winner.

No new table, provider account, credential, or RLS grant is required. Existing source='user' and macros_per='serving' constraints are respected. Old secondary nutrient values, nutriments/off_data and alternate evidence identities are cleared to null/empty to avoid rescaling old data under the new serving basis.

Existing food_items authenticated INSERT/UPDATE policies are broad. This work does not alter those existing policies, which other app paths use. Old v19 clients also retain their existing direct-write behavior. The new confirmation path is guarded; this is not a global catalog-security rewrite.

## Source scope and limitations

Proposed retailer page additions: walmart.com, www.walmart.com, target.com, www.target.com.
Allowed image hosts: the approved source page's host; Walmart additionally i5.walmartimages.com; Target additionally target.scene7.com.
Other source pages reuse the existing Coach allowlist. All reads omit credentials and reject redirects. Pages: <=1 MiB, 6 s/read, at most 3 pages. Images: JPEG/PNG/WebP, 1,000 bytes–6 MiB, 10 s/read. At most one online label candidate receives vision per phase, including photo refinement. A shared 125-second deadline covers provider, page and image reads; exhausted requests do not dispatch more provider calls. A failed/contradictory online label invalidates the underlying structured-record candidate.

Coverage is deliberately bounded, not universal. A retailer page blocked to server reads, a client-rendered page without usable Product JSON-LD, a label image not linked in Product.image, unsupported CDN, missing published GTIN, incomplete fiber/serving, or per-100ml-only nutrition cannot become a shared web candidate. The fallback is the user's readable package, never guessed data. Great Value/Walmart hosts are included, but live merchant accessibility has NOT been tested. Initial web image discovery depends on the provider returning a product-bound image URL; no image-search service/account was added.

lookup-barcode was brought in from deployed v36 and changes only its alias selection to the existing barcodeCandidates helper, fixing cache misses for UPCs that start with zero. No parallel cache/table is used.

## Validation and rollout gates

- node --test tests/barcode-recovery.test.mjs: 24 offline tests, provider/image/catalog operations mocked.
- scripts/check-barcode-recovery.cjs: TypeScript syntax for changed implementation files and targeted type checks for the new native component/route; existing dependency/legacy diagnostics excluded and counted. It can use BARCODE_RECOVERY_NODE_MODULES to read an existing dependency installation.
- No paid provider calls, product submissions, catalog writes, database migrations, deployments, pushes or builds were executed.
- SQL has not been executed against a local PostgreSQL instance. Transactions/RLS, provider output shape, live retailer access, actual iPhone camera/upload/navigation and rendering still need verification.
- Before rollout: independent diff/security review; validate proposed SQL; approve/apply that SQL; deploy both functions including their imported helper modules; enable BARCODE_RECOVERY_ENABLED; build the canonical app only. Until then the native route retains the legacy behavior.
- The latest delivered preview 3d651cd9-09ab-43f1-9e02-edc783ec930d / 1.9.0 (598) was not rebuilt here.

Provider documentation consulted: https://openrouter.ai/docs/guides/features/plugins/web-search
Supabase auth documentation consulted: https://supabase.com/docs/guides/functions/auth-legacy-jwt


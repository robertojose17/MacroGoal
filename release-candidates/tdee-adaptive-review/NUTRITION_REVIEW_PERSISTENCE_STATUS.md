# Nutrition review persistence candidate

Status: source only, OFF. SQL has not been installed, compiled or executed. Test cases below are a plan, not passed tests. No production rows or nutritional policies have been created.

## Administrative source, not an automatic approver

One new private table, macrogoal_snapshot_review_private.nutrition_review_versions, stores versioned decisions. Only an explicitly authorized administrative process may insert after verifying a real approval act and its applicability. No client or service-role INSERT, UPDATE, DELETE, table SELECT or write RPC is granted. There is no authority registry, self-declared credential flag, seeded reviewer or fabricated eligible row.

approval_reference identifies the original act; approval_digest is its SHA-256; approval_version identifies the approved revision; verified_by and verified_at record who checked it and when. These fields alone do not authenticate a professional, validate credentials, fetch documents or prove clinical suitability. The administrative process must verify the original artifact, identity and exact scope before entering a row. Do not put diagnosis narratives, secret links or credentials in these fields.

Decisions are eligible, restricted, unknown or revoked. Append a higher review_version for every change/revocation, preserving old records. The schema enforces unique owner/goal/version but an administrator still owns ordering, immutable-history discipline and authorization. This is not a tamper-proof ledger against a privileged administrator. No public revocation API is introduced.

## Durable binding

Each decision binds the actual owner, goal ID and exact revision, preset, all five current target values, profile revision, profile/journey hashes, policy version/digest and engine version. It does not grant blanket permission to every future goal or to all users. A goal/profile/journey/policy change requires new applicability verification. It does not store the weekly source fingerprint or pretend the person consented again each week.

Eight explicit limits are proteinMinG/proteinMaxG, carbsMinG/carbsMaxG, fatsMinG/fatsMaxG and fatMinFraction/fatMaxFraction. No nutritional defaults are supplied. Eligible rows require all eight. Restricted/unknown/revoked rows may omit them rather than fabricate values. The 10000 technical numeric bound is not a recommended nutritional limit. Timestamps must be finite; expiry must follow review. Age is not stored: the trusted parser derives and validates current age from the actual snapshot.

Current target values use the same five fields as SmartTarget, with calories positive and the other fields nonnegative integers. No goal or macro target is changed by storing or reading a decision.

## Exact getter contract

New public.tdee_read_nutrition_review_v1(p_owner uuid, p_expected jsonb) is service-only. Its SECURITY DEFINER body is required for this narrow read without granting schema/table access. It has a closed search_path, an explicit service-role JWT check and no dynamic SQL. Browser clients cannot call it. The server must derive p_owner from verified authentication, never a request-body owner.

p_expected has exactly these ten keys:
- goalId, goalRevision, preset
- current: {calories, proteinG, carbsG, fatsG, fiberG}
- profileUpdatedAt, profileBinding, journeyBinding
- policyVersion, policyDigest, engineVersion

It returns null for missing, invalid or non-applicable data. It selects the highest review_version for owner/goal BEFORE checking decision, expiry or binding. An expired, restricted, unknown, revoked or mismatched latest record suppresses all previous eligible records. It also compares current owned active goal targets/revision and current user revision, then exact canonical expected JSON. Timestamp formatting differences fail closed rather than discarding microsecond precision.

Success:
```
{
 version: 'nutrition-review-record-v1',
 ownerId, reviewId, reviewVersion,
 binding: p_expected,
 decision: 'eligible',
 limits: {proteinMinG,proteinMaxG,carbsMinG,carbsMaxG,
          fatsMinG,fatsMaxG,fatMinFraction,fatMaxFraction},
 reviewedAt, expiresAt,
 provenance: {approvalRef,approvalSha256,approvalVersion,verifiedBy,verifiedAt},
 capturedAt,
 actionable: false
}
```

The getter does not assert reviewed policy status or nutritional safety. The TypeScript loader must separately verify exact current source/request bindings, policy validity, engine compatibility, eligibility and capture/review/expiry times. It must retain preference and final proposal acceptance as separate decisions. Private provenance must not be sent to the UI. There is no lock/serialization guarantee against edits or revocation after this read. Final acceptance must revalidate current review/version/revocation as well as consent before recommendations can be enabled.

## Proposed rollback verification: NOT RUN

After separate approval, compile this source in one transaction ending ROLLBACK, with no persistent installation or rows:
1. Verify only the new getter has service-role EXECUTE; PUBLIC/anon/authenticated have none. All runtime roles lack table access and writes; no private-schema USAGE is added.
2. Test actual service/authenticated/anonymous roles and missing/spoofed JWT role. A matching claim alone must not override SQL ACL.
3. Own existing goal with no review returns null; null/malformed/oversized expected binding and foreign/missing goal return null.
4. With explicitly authorized synthetic own-actor records only inside rollback, test exact eligible response and every goal/profile/policy/hash/engine/current-target mismatch.
5. Insert successive synthetic versions restricted/unknown/revoked/expired/mismatched and verify the getter never returns the older eligible decision.
6. Reject missing eligible limits, inverted ranges, NaN/infinity, invalid timestamps, invalid hashes, duplicate version and absent approval provenance.
7. Check read-only behavior: before/after user/goal/policy/entitlement digests identical, and source transaction fully rolled back.
8. Test concurrent edits/revocation at acceptance separately; this getter alone cannot prove end-to-end safety.

Synthetic test approval is not authorization to create a real reviewed decision. No fixtures or INSERT statements are included in this candidate.

## Remaining gates

An actual verified administrative approval act with explicit limits and scope; authorized schema verification/installation; trusted loader integration; acceptance-time review and consent revalidation; approved test execution and real application verification. The rejected SQL change is untouched. No release switch, policy seed, API mount or deployment is part of these files.

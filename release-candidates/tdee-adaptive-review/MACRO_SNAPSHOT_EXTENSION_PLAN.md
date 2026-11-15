# Macro snapshot extension: source-only plan, NOT applied
Status: OFF. No database function replaced, no grants changed, no rows changed.
Do not apply the historical schema-review.sql in full: live authority fixes must survive.

Verified repository evidence:
- consistent-observation/schema-review.sql item_rows projects id,meal_id,calories,is_scheduled.
- sourceFingerprint hashes entire sources/counts JSONB in the same statement.
- readinessAttestationsCandidate.sql already includes protein,carbs,fats,fiber in its own-actor content hash.
- ai-coach/manual/source-adapter.ts uses persisted meal_items protein/carbs/fats/fiber; these are not goal fields.

Narrow candidate projection change, after obtaining the CURRENT live function and
checking its identity/body/ACL; do not run this as a replacement by itself:

  SELECT i.id,i.meal_id,i.calories,i.is_scheduled
+        ,i.protein,i.carbs,i.fats,i.fiber
  FROM public.meal_items i JOIN meal_rows m ON m.id=i.meal_id

Add an explicit sources marker nutritionFieldsVersion='logged-macros-v1' to the
same SQL JSON object. Existing sourceFingerprint then includes marker and values.
Do not COALESCE missing nutrition to0. Preserve owner filters, Premium checks,
limits, ordering, SECURITY DEFINER/INVOKER contract, ACL and row cardinality.

Consumer changes REQUIRED before using these fields:
1. DataSources optional version marker and nullable nutrient fields. Legacy
   snapshots remain valid and return unknown macro averages.
2. Parser validates marked fields as finite nonnegative numbers or null; malformed
   marked data fails closed. Unmarked extra fields must not count as provenance.
3. Average per nutrient over the SAME explicit confirmed-day set, no imputation.
   If a confirmed day's nutrient is unknown, that nutrient average stays null.
   Calorie mean is not extrapolated to missing days or turned into TDEE.
4. Do not assume persisted0 means analytically verified0. Current legacy storage
   may conflate unknown withzero; source provenance must be resolved separately.
5. Revalidate fingerprint/confirmation at acceptance. An edit must invalidate old
   proposal context and, via readiness hash, prior complete-day confirmation.

Required verification before installation:
- Read CURRENT installed function, metadata and exact ACL; backup/rollback.
- Catalog confirms actual column types, units and nullability, not only repo types.
- Transaction rollback tests own actor: change one macro -> source hash changes;
  content confirmation invalidates; missing stays null; unchangedcalories retained.
- Legacy parser compatibility; other users' access unchanged; no direct grants.
- No execution of previously rejected SQL or runner. Obtain permitted test path.
- Refresh bundle manifest only after complete consumer implementation/readback.

Current result: average calories integrated independently; macros remain unknown.

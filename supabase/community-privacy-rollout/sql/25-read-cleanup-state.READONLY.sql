-- LOCAL REVIEW TEMPLATE. Future trusted-owner read only, after approved UI tests.
-- Review each exact row ID/revision as an intended test-created artifact. Empty
-- activation baseline alone is insufficient proof. If ownership is uncertain, stop.
-- Approval must identify the reviewed rows and the returned digest; then supply it
-- as macrogoal.pair_expected_cleanup_digest when authorizing stage 30.
SELECT privacy_private.community_pair_cleanup_state() AS review_before_cleanup;

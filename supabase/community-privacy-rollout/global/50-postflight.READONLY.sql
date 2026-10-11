-- Metadata + non-user singleton control only. No customer row output or mutation.
-- Targeted verification after the one-shot GLOBAL transaction, not a replacement
-- for actual Edge deployment/JWT tests. Every *_ok column must be true.
WITH api(signature) AS (VALUES
 ('public.profile_snapshot(uuid,text,text,text)'),('public.list_follow_request_inbox(text,integer)'),
 ('public.respond_follow_request(uuid,uuid,text,text)'),('public.change_outbound_follow(uuid,uuid,text,text)'),
 ('public.discover_profiles(uuid[])'),('public.search_profile_identities(text,integer,uuid)'),
 ('public.list_accepted_profile_connections(uuid,text,integer,uuid)'),('public.list_profile_posts(uuid,integer,text)'),
 ('public.profile_weekly_tracking(uuid,text,text)'),('public.visible_post_authors(uuid[])'),
 ('public.community_privacy_eligibility()'),('public.get_outbound_follow_status(uuid)'),
 ('public.social_post_author_visible(uuid)'),('public.toggle_post_like(uuid,uuid)'),
 ('public.increment_comments(uuid)'),('public.decrement_comments(uuid)'),
 ('public.increment_saves(uuid)'),('public.decrement_saves(uuid)')),
expected(tbl,name,fn,kind) AS (VALUES
 ('public.blocked_users','approval_block_pair_lock','privacy_private.block_pair_lock()',31),
 ('public.blocked_users','approval_block_revoke','privacy_private.block_revoke_relationships()',5),
 ('public.blocked_users','approval_block_truncate_forbidden','privacy_private.relationship_truncate_forbidden()',34),
 ('public.community_blocks','approval_legacy_block_pair_lock','privacy_private.legacy_block_pair_lock()',31),
 ('public.community_blocks','approval_legacy_block_revoke','privacy_private.block_revoke_relationships()',5),
 ('public.community_blocks','approval_legacy_block_truncate_forbidden','privacy_private.relationship_truncate_forbidden()',34),
 ('public.social_follows','approval_follow_delete_revoke','privacy_private.follow_delete_revoke()',11),
 ('public.social_follows','approval_follow_identity_immutable','privacy_private.follow_identity_immutable()',19),
 ('public.social_follows','approval_follow_truncate_forbidden','privacy_private.relationship_truncate_forbidden()',34)),
functions AS (SELECT a.signature,p.* FROM api a LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(a.signature))
SELECT 'global_privacy_cutover_v1' AS stage,
 (SELECT count(*)=1 FROM privacy_private.community_global_rollout WHERE singleton AND mode='GLOBAL') AS global_mode_ok,
 (SELECT count(*)=18 AND bool_and(oid IS NOT NULL AND proowner='postgres'::regrole AND prosecdef
  AND coalesce(proconfig @> ARRAY['search_path=pg_catalog','row_security=off']::text[],false)
  AND has_function_privilege('authenticated',oid,'EXECUTE')
  AND NOT has_function_privilege('anon',oid,'EXECUTE')
  AND NOT has_function_privilege('service_role',oid,'EXECUTE')) FROM functions) AS api_owners_config_grants_ok,
 (SELECT count(*)=9 FROM expected e JOIN pg_catalog.pg_trigger t ON t.tgrelid=e.tbl::regclass
  AND t.tgname=e.name AND t.tgfoid=e.fn::regprocedure AND t.tgtype=e.kind
  AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgnargs=0 AND t.tgqual IS NULL) AS nine_relationship_bindings_ok,
 (SELECT count(*)=0 FROM pg_catalog.pg_policy p WHERE p.polname IN
  ('meals_public_read','meal_items_public_read','goals_public_read','user_xp_public_read')
  AND p.polrelid IN ('public.meals'::regclass,'public.meal_items'::regclass,'public.goals'::regclass,'public.user_xp'::regclass)) AS broad_health_policies_removed_ok,
 (SELECT count(*)=13 FROM pg_catalog.pg_policy p WHERE p.polname IN
  ('community_global_read','community_global_insert','community_global_update')
  AND p.polrelid IN ('public.community_comments'::regclass,'public.community_likes'::regclass,
  'public.social_post_likes'::regclass,'public.social_post_saves'::regclass,'public.community_commitments'::regclass)
  AND NOT p.polpermissive) AS restrictive_interaction_policies_ok;

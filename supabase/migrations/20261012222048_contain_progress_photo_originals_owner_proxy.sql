-- LOCAL REVIEW ONLY. Not an approved migration. Public closure progress-photos;
-- direct read/sign denial progress-photos AND already-private check-in-photos.
-- check-ins bucket and unrelated buckets unchanged.
-- This is containment, NOT revocation of existing signed URLs or complete client repair.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
-- Briefly coordinates concurrent storage/table writes; fail rather than wait beyond5s.
LOCK TABLE storage.objects,public.check_in_photos IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  PERFORM 1 FROM storage.buckets WHERE id IN ('progress-photos','check-in-photos') FOR UPDATE;
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Unexpected migration role'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='progress-photos' AND public=true)
    OR NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='check-in-photos' AND public=false)
  THEN RAISE EXCEPTION 'Bucket baseline changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity)
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.check_in_photos'::regclass AND relrowsecurity)
  THEN RAISE EXCEPTION 'RLS baseline changed'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.check_in_photos'::regclass AND contype<>'n') <> 2
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.check_in_photos'::regclass AND conname='check_in_photos_pkey' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.check_in_photos'::regclass AND conname='check_in_photos_user_id_fkey' AND pg_get_constraintdef(oid)='FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE')
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.check_in_photos'::regclass AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'Photo table baseline changed'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='check_in_photos')<>2
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='check_in_photos'
      AND policyname IN ('Users can manage their own check-in photos','Users can manage their own photos')
      AND cmd='ALL' AND roles::text='{public}' AND permissive='PERMISSIVE'
      AND qual='(auth.uid() = user_id)' AND with_check='(auth.uid() = user_id)')<>2
  THEN RAISE EXCEPTION 'Photo RLS baseline changed'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND (coalesce(qual,'') LIKE '%progress-photos%' OR coalesce(with_check,'') LIKE '%progress-photos%' OR coalesce(qual,'') LIKE '%check-in-photos%' OR coalesce(with_check,'') LIKE '%check-in-photos%'))<>10
  THEN RAISE EXCEPTION 'Scoped storage policy count changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Public can read progress photos' AND cmd='SELECT' AND roles::text='{anon}'
      AND permissive='PERMISSIVE' AND qual='(bucket_id = ''progress-photos''::text)')
  THEN RAISE EXCEPTION 'Public policy baseline changed'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN ('Users can delete their own photos','Users can delete their own progress photos','Users can read their own photos','Users can upload their own photos','Users can upload their own progress photos','Users can view their own progress photos','progress_photos_delete','progress_photos_insert','progress_photos_select')
      AND roles::text='{authenticated}' AND permissive='PERMISSIVE'
      AND ((cmd IN ('SELECT','DELETE') AND qual='((bucket_id = ''progress-photos''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))' AND with_check IS NULL)
        OR (cmd='INSERT' AND qual IS NULL AND with_check='((bucket_id = ''progress-photos''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))')) )<>9
  THEN RAISE EXCEPTION 'Owner policies baseline changed'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='progress_originals_owner_read_guard_v1') THEN RAISE EXCEPTION 'Unexpected existing guard; review baseline'; END IF;
END $$;
UPDATE storage.buckets SET public=false WHERE id='progress-photos';
-- Deny ordinary-role direct reads/signing; authenticated proxy owns byte delivery.
-- Service role backend bypasses RLS. Unrelated buckets remain unchanged.
CREATE POLICY progress_originals_owner_read_guard_v1 ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC
USING (bucket_id NOT IN ('progress-photos','check-in-photos'));
-- Consumers validate all legacy records too; NOT VALID preserves historical rows unchanged.
ALTER TABLE public.check_in_photos ADD CONSTRAINT check_in_photos_owner_path_v1
CHECK (storage_path IS NOT NULL AND length(storage_path)<=512
  AND storage_path ~* ('^'||user_id::text||'/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,240}\.(jpg|jpeg|png|webp|heic|heif)$')
  AND split_part(storage_path,'/',1)=user_id::text
  AND storage_path !~ '[%?#\\]' AND storage_path !~ '\.\.'
  AND array_length(string_to_array(storage_path,'/'),1)=2) NOT VALID;
-- Direct own-row updates cannot redirect to another owner's check-in.
CREATE FUNCTION public.check_in_photo_reference_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.storage_path IS DISTINCT FROM OLD.storage_path OR NEW.check_in_id IS DISTINCT FROM OLD.check_in_id OR NEW.photo_url IS DISTINCT FROM OLD.photo_url) THEN RAISE EXCEPTION 'Photo identity is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.check_in_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM public.check_ins c WHERE c.id=NEW.check_in_id AND c.user_id=NEW.user_id)
  THEN RAISE EXCEPTION 'Invalid check-in reference' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.check_in_photo_reference_guard_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER check_in_photo_reference_guard_v1 BEFORE INSERT OR UPDATE OF id,user_id,check_in_id,storage_path,photo_url ON public.check_in_photos FOR EACH ROW EXECUTE FUNCTION public.check_in_photo_reference_guard_v1();
-- Narrow redundant destructive privilege removal, not a data operation.
REVOKE TRUNCATE,REFERENCES,TRIGGER ON public.check_in_photos FROM PUBLIC,anon,authenticated;
COMMIT;

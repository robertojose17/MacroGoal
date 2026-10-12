export const PHOTO_BUCKETS = ['progress-photos', 'check-in-photos'] as const;
export type PhotoBucket = typeof PHOTO_BUCKETS[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function ownedPath(value: unknown, actor: string): value is string {
  return UUID.test(actor) && typeof value === 'string' && value.length <= 512 &&
    value.startsWith(actor + '/') && value.split('/').length === 2 &&
    /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,240}\.(?:jpg|jpeg|png|webp|heic|heif)$/i.test(value.slice(actor.length + 1)) &&
    !value.includes('..');
}
export function ownedReference(photo: { user_id?: unknown; storage_path?: unknown; photo_url?: unknown }, actor: string, projectUrl: string): {bucket: PhotoBucket; path: string} | null {
  if (photo.user_id !== actor || !ownedPath(photo.storage_path, actor) || typeof photo.photo_url !== 'string') return null;
  try {
    const base = new URL(projectUrl); const u = new URL(photo.photo_url);
    if (u.protocol !== 'https:' || u.origin !== base.origin || u.username || u.password || u.hash) return null;
    const expected = [
      {bucket:'progress-photos' as const, prefix:'/storage/v1/object/public/progress-photos/', signed:false},
      {bucket:'check-in-photos' as const, prefix:'/storage/v1/object/sign/check-in-photos/', signed:true},
    ];
    for (const entry of expected) {
      if (u.pathname !== entry.prefix + photo.storage_path) continue;
      if (entry.signed ? [...u.searchParams.keys()].some(k => k !== 'token') : u.search !== '') return null;
      return {bucket:entry.bucket,path:photo.storage_path};
    }
    return null;
  } catch { return null; }
}
export function checkInId(value: unknown): value is string | null | undefined { return value == null || typeof value === 'string' && UUID.test(value); }
export function uploadType(value: unknown): value is string { return typeof value === 'string' && ['image/jpeg','image/png','image/webp','image/heic'].includes(value); }

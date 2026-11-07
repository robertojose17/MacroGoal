// Server-owned rollout switch. Never derive this value from request bodies,
// client flags, signed old sessions, or an environment variable.
// Keep false until the exact SQL policy has separately authorized deployment,
// its fingerprint and access are verified, and native integration gates pass.
export const preserveExistingImageVerified = true;
export const requiredImagePolicyFunction = 'public.confirm_barcode_recovery(uuid,uuid,jsonb)';
export const requiredImagePolicyMD5 = '99fd8b67e24f9d6a7b6f650f91fa4a17';

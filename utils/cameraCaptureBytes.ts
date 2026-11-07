export const MAX_CAMERA_JPEG_BYTES = 6 * 1024 * 1024;
// Only pass the result of this screen's CameraView capture. Never fetch a URI.
export function webCameraJpegBytes(photo: {uri?: string; base64?: string}): Uint8Array {
  const value = photo.base64 || photo.uri;
  if (typeof value !== 'string') throw Error('invalid_photo');
  const prefix = 'data:image/jpeg;base64,';
  const maxEncoded = Math.ceil(MAX_CAMERA_JPEG_BYTES / 3) * 4;
  if (value.length > maxEncoded + prefix.length) throw Error('invalid_photo');
  const encoded = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  if (!encoded.length || encoded.length > maxEncoded || encoded.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw Error('invalid_photo');
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const size = encoded.length / 4 * 3 - padding;
  if (size > MAX_CAMERA_JPEG_BYTES || size < 3) throw Error('invalid_photo');
  let binary: string;
  try { binary = atob(encoded); } catch { throw Error('invalid_photo'); }
  if (binary.length !== size || binary.charCodeAt(0) !== 255 ||
      binary.charCodeAt(1) !== 216 || binary.charCodeAt(2) !== 255) throw Error('invalid_photo');
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

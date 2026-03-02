
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Compress and resize an image for upload
 * @param uri - The local URI of the image
 * @param maxWidth - Maximum width in pixels (default: 1200)
 * @param maxHeight - Maximum height in pixels (default: 1600)
 * @param quality - Compression quality 0-1 (default: 0.8)
 * @returns The URI of the compressed image
 */
export async function compressImage(
  uri: string,
  maxWidth: number = 1200,
  maxHeight: number = 1600,
  quality: number = 0.8
): Promise<string> {
  try {
    console.log('[ImageUtils] Compressing image:', uri);
    
    const manipulatedImage = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          resize: {
            width: maxWidth,
            height: maxHeight,
          },
        },
      ],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    console.log('[ImageUtils] ✅ Image compressed successfully');
    console.log('[ImageUtils] Original URI:', uri);
    console.log('[ImageUtils] Compressed URI:', manipulatedImage.uri);
    
    return manipulatedImage.uri;
  } catch (error) {
    console.error('[ImageUtils] ❌ Error compressing image:', error);
    // Return original URI if compression fails
    return uri;
  }
}

/**
 * Convert image URI to blob for upload
 * @param uri - The local URI of the image
 * @returns A Blob object
 */
export async function uriToBlob(uri: string): Promise<Blob> {
  try {
    console.log('[ImageUtils] Converting URI to blob:', uri);
    
    const response = await fetch(uri);
    const blob = await response.blob();
    
    console.log('[ImageUtils] ✅ Blob created, size:', blob.size, 'bytes, type:', blob.type);
    
    return blob;
  } catch (error) {
    console.error('[ImageUtils] ❌ Error converting URI to blob:', error);
    throw error;
  }
}

/**
 * Generate a unique filename for a check-in photo
 * @param userId - The user's ID
 * @param date - The check-in date (YYYY-MM-DD format)
 * @returns A unique filename with the correct path structure for RLS policies
 */
export function generateCheckInPhotoFilename(userId: string, date: string): string {
  const timestamp = Date.now();
  const sanitizedDate = date.replace(/-/g, '');
  // Path structure: userId/check-in-photos/checkin_DATE_TIMESTAMP.jpg
  // This ensures the first folder is the userId, which matches the RLS policy
  return `${userId}/check-in-photos/checkin_${sanitizedDate}_${timestamp}.jpg`;
}

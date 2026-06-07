/**
 * Shared utility for the "upload a progress photo after weight check-in" flow.
 * Used by both check-in-form.tsx (full form) and check-ins.tsx (quick log).
 */

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import { tryAwardProgressPhoto } from '@/utils/xpAwarder';

const PHOTOS_ENDPOINT = `${SUPABASE_PROJECT_URL}/functions/v1/check-in-photos`;

// ─── Photo picker ─────────────────────────────────────────────────────────────

export async function pickPhoto(source: 'camera' | 'library'): Promise<string | null> {
  console.log('[checkInPhotoUpload] pickPhoto — source:', source);
  try {
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to take a photo.');
        return null;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library access is needed to select a photo.');
        return null;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
    }

    if (!result.canceled && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      console.log('[checkInPhotoUpload] Photo selected:', uri);
      return uri;
    }
    return null;
  } catch (err) {
    console.error('[checkInPhotoUpload] Error picking photo:', err);
    Alert.alert('Error', 'Failed to select photo');
    return null;
  }
}

// ─── Photo upload (3-step: signed URL → PUT binary → POST record) ─────────────

export async function uploadCheckInPhoto(checkInId: string, imageUri: string): Promise<void> {
  console.log('[checkInPhotoUpload] Starting photo upload for check-in:', checkInId);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('No session available for photo upload');
  }

  // Step 1: Get signed upload URL
  console.log('[checkInPhotoUpload] Requesting upload URL from edge function');
  const urlResponse = await fetch(`${PHOTOS_ENDPOINT}/upload-url`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_name: 'photo.jpg', content_type: 'image/jpeg' }),
  });

  if (!urlResponse.ok) {
    const text = await urlResponse.text();
    throw new Error(`Failed to get upload URL: ${urlResponse.status} ${text}`);
  }

  const { upload_url, storage_path, public_url } = await urlResponse.json();
  console.log('[checkInPhotoUpload] Got upload URL, storage_path:', storage_path);

  // Step 2: Upload image binary
  console.log('[checkInPhotoUpload] Uploading image binary to storage');
  const imageResponse = await fetch(imageUri);
  const blob = await imageResponse.blob();
  const putResponse = await fetch(upload_url, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': 'image/jpeg' },
  });

  if (!putResponse.ok) {
    const text = await putResponse.text();
    throw new Error(`Failed to upload image: ${putResponse.status} ${text}`);
  }
  console.log('[checkInPhotoUpload] Image uploaded successfully');

  // Step 3: Save photo record
  console.log('[checkInPhotoUpload] Saving photo record to database');
  const saveResponse = await fetch(PHOTOS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ check_in_id: checkInId, photo_url: public_url, storage_path }),
  });

  if (!saveResponse.ok) {
    const text = await saveResponse.text();
    throw new Error(`Failed to save photo record: ${saveResponse.status} ${text}`);
  }
  console.log('[checkInPhotoUpload] Photo record saved successfully');
}

// ─── Ensure a check_ins row exists for the given user + date (weight) ─────────

/**
 * Finds or creates a check_ins row for a weight entry.
 * The quick log only writes to tracker_entries; this ensures the photo flow
 * has a check_ins.id to attach to.
 *
 * @param userId  auth user id
 * @param date    YYYY-MM-DD local date string
 * @param weightLbs  weight value in lbs (will be converted to kg for storage)
 * @returns check_ins.id or null on failure
 */
export async function ensureWeightCheckInRow(
  userId: string,
  date: string,
  weightLbs: number,
): Promise<string | null> {
  console.log('[checkInPhotoUpload] ensureWeightCheckInRow — user:', userId, 'date:', date, 'weight (lbs):', weightLbs);

  // check_ins has no 'type' column — weight rows are identified by weight IS NOT NULL
  const { data: existing } = await supabase
    .from('check_ins')
    .select('id')
    .eq('user_id', userId)
    .eq('date', date)
    .not('weight', 'is', null)
    .maybeSingle();

  if (existing?.id) {
    console.log('[checkInPhotoUpload] Found existing check_ins row:', existing.id);
    return existing.id;
  }

  // Convert lbs → kg for storage (check_ins always stores kg)
  const weightKg = weightLbs / 2.20462;
  console.log('[checkInPhotoUpload] Inserting new check_ins row — kg:', weightKg);

  const { data: newRow, error: insertErr } = await supabase
    .from('check_ins')
    .insert({ user_id: userId, date, weight: weightKg })
    .select('id')
    .single();

  if (insertErr || !newRow) {
    console.warn('[checkInPhotoUpload] Could not create check_ins row for photo flow:', insertErr);
    return null;
  }

  console.log('[checkInPhotoUpload] Created new check_ins row:', newRow.id);
  return newRow.id;
}

// ─── Full "pick + upload + award XP" flow ─────────────────────────────────────

export async function handleQuickPhotoPick(
  source: 'camera' | 'library',
  checkInId: string,
): Promise<void> {
  console.log('[checkInPhotoUpload] handleQuickPhotoPick — source:', source, 'checkInId:', checkInId);
  const uri = await pickPhoto(source);
  if (!uri) return;

  try {
    await uploadCheckInPhoto(checkInId, uri);
    console.log('[checkInPhotoUpload] ✅ Photo uploaded successfully for check-in:', checkInId);
    tryAwardProgressPhoto(checkInId);
  } catch (err) {
    console.error('[checkInPhotoUpload] Photo upload failed:', err);
    Alert.alert('Photo Upload Failed', 'Your check-in was saved, but the photo could not be uploaded.');
  }
}

// ─── Prompt + full flow ───────────────────────────────────────────────────────

/**
 * Shows the "Add Progress Photo?" alert and, if the user picks a source,
 * handles the full pick → upload → XP flow.
 *
 * @param weightLbs  weight value in lbs (used to find/create the check_ins row)
 * @param date       YYYY-MM-DD local date string
 */
export async function promptForProgressPhoto(weightLbs: number, date: string): Promise<void> {
  console.log('[checkInPhotoUpload] promptForProgressPhoto — weight (lbs):', weightLbs, 'date:', date);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('[checkInPhotoUpload] No authenticated user — skipping photo prompt');
    return;
  }

  const checkInId = await ensureWeightCheckInRow(user.id, date, weightLbs);
  if (!checkInId) {
    // ensureWeightCheckInRow already logged the warning
    return;
  }

  Alert.alert(
    'Add Progress Photo?',
    "Snap a progress photo to track your transformation. You'll earn bonus XP!",
    [
      {
        text: 'Skip',
        style: 'cancel',
        onPress: () => console.log('[checkInPhotoUpload] Photo prompt skipped'),
      },
      {
        text: 'Camera',
        onPress: () => {
          console.log('[checkInPhotoUpload] User chose Camera');
          handleQuickPhotoPick('camera', checkInId).catch((e) =>
            console.warn('[checkInPhotoUpload] Camera pick failed:', e),
          );
        },
      },
      {
        text: 'Photo Library',
        onPress: () => {
          console.log('[checkInPhotoUpload] User chose Photo Library');
          handleQuickPhotoPick('library', checkInId).catch((e) =>
            console.warn('[checkInPhotoUpload] Library pick failed:', e),
          );
        },
      },
    ],
  );
}

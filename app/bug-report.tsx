
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';

const BUG_REPORT_ENDPOINT =
  'https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/onesignal-inspector/send-bug-report';

export default function BugReportScreen() {
  const router = useRouter();
  const { tab_source } = useLocalSearchParams<{ tab_source?: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;

  const handlePickPhoto = async () => {
    console.log('[BugReport] Attach photo button pressed');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo library access to attach a screenshot.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      console.log('[BugReport] Photo selected:', result.assets[0].uri);
      setPhoto(result.assets[0]);
    }
  };

  const handleRemovePhoto = () => {
    console.log('[BugReport] Remove photo pressed');
    setPhoto(null);
  };

  const handleSubmit = async () => {
    console.log('[BugReport] Submit button pressed — tab_source:', tab_source);

    if (!description.trim()) {
      Alert.alert('Description required', 'Please describe what happened before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Not signed in', 'You must be signed in to submit a bug report.');
        setSubmitting(false);
        return;
      }

      const userId = session.user.id;
      let photoUrl: string | null = null;

      // Upload photo if selected
      if (photo) {
        console.log('[BugReport] Uploading photo to Supabase Storage');
        const uuid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const storagePath = `${userId}/${uuid}.jpg`;

        const response = await fetch(photo.uri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from('bug-reports')
          .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: false });

        if (uploadError) {
          console.error('[BugReport] Photo upload error:', uploadError);
        } else {
          console.log('[BugReport] Photo uploaded to:', storagePath);
          photoUrl = storagePath;
        }
      }

      const deviceModel = Device.modelName ?? null;
      const appVersion = Constants.expoConfig?.version ?? null;

      console.log('[BugReport] Sending bug report — device:', deviceModel, 'version:', appVersion, 'platform:', Platform.OS);

      const res = await fetch(BUG_REPORT_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          description: description.trim(),
          photo_url: photoUrl,
          platform: Platform.OS,
          device: deviceModel,
          tab_source: tab_source ?? null,
          app_version: appVersion,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[BugReport] Edge function error:', res.status, errText);
        throw new Error(`Server error ${res.status}`);
      }

      console.log('[BugReport] Bug report submitted successfully');
      Alert.alert('Thank you!', 'Your report has been submitted.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.error('[BugReport] Submit error:', err);
      Alert.alert('Failed to submit', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.headerRow, { borderBottomColor: borderColor, backgroundColor: bgColor }]}>
        <TouchableOpacity
          onPress={() => {
            console.log('[BugReport] Back button pressed');
            router.back();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backButton}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="chevron_left"
            size={24}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>Report a Bug</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Description */}
        <Text style={[styles.fieldLabel, { color: secondaryColor }]}>Description</Text>
        <View style={[styles.textAreaCard, { backgroundColor: cardBg, borderColor }]}>
          <TextInput
            style={[styles.textArea, { color: textColor }]}
            placeholder="Describe what happened..."
            placeholderTextColor={secondaryColor}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            onFocus={() => console.log('[BugReport] Description field focused')}
          />
        </View>

        {/* Attach Photo */}
        <Text style={[styles.fieldLabel, { color: secondaryColor }]}>Attach Photo (optional)</Text>
        {photo ? (
          <View style={styles.photoPreviewContainer}>
            <Image source={{ uri: photo.uri }} style={styles.photoPreview} resizeMode="cover" />
            <TouchableOpacity
              style={[styles.removePhotoButton, { backgroundColor: colors.error }]}
              onPress={handleRemovePhoto}
              activeOpacity={0.8}
            >
              <Text style={styles.removePhotoText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.attachButton, { backgroundColor: cardBg, borderColor }]}
            onPress={handlePickPhoto}
            activeOpacity={0.7}
          >
            <IconSymbol
              ios_icon_name="photo.on.rectangle"
              android_material_icon_name="add_photo_alternate"
              size={20}
              color={colors.primary}
            />
            <Text style={[styles.attachButtonText, { color: colors.primary }]}>Choose Photo</Text>
          </TouchableOpacity>
        )}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }]}
          onPress={handleSubmit}
          activeOpacity={0.8}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Report</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 32,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 32,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 48,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  textAreaCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.sm,
    minHeight: 120,
  },
  textArea: {
    fontSize: 15,
    lineHeight: 22,
    minHeight: 100,
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  attachButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  photoPreviewContainer: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.md,
  },
  removePhotoButton: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  removePhotoText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  submitButton: {
    marginTop: spacing.xl,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});


import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import * as ImagePicker from 'expo-image-picker';
import CalendarDatePicker from '@/components/CalendarDatePicker';
import { compressImage, uriToBlob, generateCheckInPhotoFilename } from '@/utils/imageUtils';

type CheckInType = 'weight' | 'steps' | 'gym';

export default function CheckInFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const checkInType = (params.type as CheckInType) || 'weight';
  const checkInId = params.checkInId as string | undefined;
  const isEditing = !!checkInId;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  // Form fields
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Weight fields
  const [weight, setWeight] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  
  // Steps fields
  const [steps, setSteps] = useState('');
  const [stepsGoal, setStepsGoal] = useState('');
  
  // Gym fields
  const [wentToGym, setWentToGym] = useState(true);
  
  // Common
  const [notes, setNotes] = useState('');

  const loadCheckInData = useCallback(async (userWithPrefs: any) => {
    if (!checkInId) return;
    
    try {
      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .eq('id', checkInId)
        .single();

      if (error) {
        console.error('[CheckInForm] Error loading check-in:', error);
        Alert.alert('Error', 'Failed to load check-in data');
        router.back();
        return;
      }

      console.log('[CheckInForm] 📥 Loaded check-in data:', data);

      // Parse date correctly from database (stored as YYYY-MM-DD)
      const [year, month, day] = data.date.split('-').map(Number);
      const localDate = new Date(year, month - 1, day, 12, 0, 0);
      console.log('[CheckInForm] 📅 Parsed date:', data.date, '→', localDate.toLocaleDateString());
      setDate(localDate);
      
      // Weight is ALWAYS stored in kg in the database
      // Convert to user's preferred unit for display
      if (data.weight) {
        const units = userWithPrefs?.preferred_units || 'metric';
        const weightInKg = parseFloat(data.weight);
        console.log('[CheckInForm] ⚖️ Weight from DB (always kg):', weightInKg);
        console.log('[CheckInForm] ⚖️ User preferred_units:', units);
        
        if (units === 'imperial') {
          // Convert kg to lbs for display
          const lbs = weightInKg * 2.20462;
          console.log('[CheckInForm] ⚖️ Converting kg → lbs for display:', weightInKg, 'kg →', lbs, 'lbs');
          setWeight(Math.round(lbs).toString());
        } else {
          // Display in kg
          console.log('[CheckInForm] ⚖️ Displaying in kg (no conversion):', weightInKg);
          setWeight(Math.round(weightInKg).toString());
        }
      }
      
      setSteps(data.steps?.toString() || '');
      setStepsGoal(data.steps_goal?.toString() || '');
      setWentToGym(data.went_to_gym || false);
      setNotes(data.notes || '');
      
      // Load the photo URL from the database
      if (data.photo_url) {
        console.log('[CheckInForm] 📸 Photo URL from DB:', data.photo_url);
        setPhotoUrl(data.photo_url);
        setPhotoUri(null); // Clear any local URI
      }
    } catch (error) {
      console.error('[CheckInForm] Error in loadCheckInData:', error);
    }
  }, [checkInId, router]);

  const initializeForm = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load user data first
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase
        .from('users')
        .select('preferred_units')
        .eq('id', authUser.id)
        .maybeSingle();

      const userWithPrefs = { ...authUser, ...userData };
      setUser(userWithPrefs);

      console.log('[CheckInForm] 👤 User loaded with preferred_units:', userData?.preferred_units);

      // Then load check-in data if editing
      if (isEditing) {
        await loadCheckInData(userWithPrefs);
      } else if (checkInType === 'steps') {
        await loadDefaultStepsGoal(authUser.id);
      }
    } catch (error) {
      console.error('[CheckInForm] Error in initializeForm:', error);
    } finally {
      setLoading(false);
    }
  }, [isEditing, checkInType, loadCheckInData]);

  useEffect(() => {
    initializeForm();
  }, [initializeForm]);

  const loadDefaultStepsGoal = async (userId: string) => {
    try {
      // Try to get the most recent steps goal
      const { data } = await supabase
        .from('check_ins')
        .select('steps_goal')
        .eq('user_id', userId)
        .not('steps_goal', 'is', null)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.steps_goal) {
        setStepsGoal(data.steps_goal.toString());
      } else {
        // Default to 10,000 steps
        setStepsGoal('10000');
      }
    } catch (error) {
      console.error('[CheckInForm] Error loading default steps goal:', error);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'We need camera access to use this function', [
          { text: 'Close', style: 'cancel' },
          { text: 'Continue', onPress: () => ImagePicker.requestCameraPermissionsAsync() }
        ]);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        console.log('[CheckInForm] 📸 New photo taken:', result.assets[0].uri);
        setPhotoUri(result.assets[0].uri);
        // Don't clear photoUrl yet - we'll update it after upload
      }
    } catch (error) {
      console.error('[CheckInForm] Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleChoosePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library permission is required to choose photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        console.log('[CheckInForm] 📸 Photo selected:', result.assets[0].uri);
        setPhotoUri(result.assets[0].uri);
        // Don't clear photoUrl yet - we'll update it after upload
      }
    } catch (error) {
      console.error('[CheckInForm] Error choosing photo:', error);
      Alert.alert('Error', 'Failed to choose photo');
    }
  };

  const handleRemovePhoto = () => {
    setPhotoUri(null);
    setPhotoUrl(null);
  };

  /**
   * Upload photo to Supabase Storage with retry logic
   * @param uri - The local URI of the image
   * @param userId - The user's ID
   * @param dateString - The check-in date (YYYY-MM-DD)
   * @param retryCount - Current retry attempt (default: 0)
   * @returns The public URL of the uploaded photo, or null if failed
   */
  const uploadPhoto = async (
    uri: string,
    userId: string,
    dateString: string,
    retryCount: number = 0
  ): Promise<string | null> => {
    const maxRetries = 1;
    
    try {
      console.log('[CheckInForm] 📤 Uploading photo (attempt', retryCount + 1, 'of', maxRetries + 1, ')...');
      
      // Step 1: Compress the image
      const compressedUri = await compressImage(uri);
      console.log('[CheckInForm] ✅ Image compressed');
      
      // Step 2: Convert to blob
      const blob = await uriToBlob(compressedUri);
      console.log('[CheckInForm] ✅ Blob created, size:', blob.size, 'bytes');
      
      // Step 3: Generate unique filename with correct path structure
      // Path: userId/check-in-photos/checkin_DATE_TIMESTAMP.jpg
      const filePath = generateCheckInPhotoFilename(userId, dateString);
      console.log('[CheckInForm] 📁 Upload path:', filePath);

      // Step 4: Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('check-ins')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (error) {
        console.error('[CheckInForm] ❌ Supabase Storage upload error:', error);
        console.error('[CheckInForm] Error details:', {
          message: error.message,
          statusCode: (error as any).statusCode,
          error: (error as any).error,
        });
        
        // Retry logic for transient errors
        if (retryCount < maxRetries) {
          console.log('[CheckInForm] 🔄 Retrying upload...');
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          return uploadPhoto(uri, userId, dateString, retryCount + 1);
        }
        
        return null;
      }

      // Step 5: Get public URL
      const { data: urlData } = supabase.storage
        .from('check-ins')
        .getPublicUrl(filePath);

      console.log('[CheckInForm] ✅ Photo uploaded successfully');
      console.log('[CheckInForm] 🔗 Public URL:', urlData.publicUrl);
      
      return urlData.publicUrl;
    } catch (error: any) {
      console.error('[CheckInForm] ❌ Unexpected error in uploadPhoto:', error);
      console.error('[CheckInForm] Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('[CheckInForm] Error message:', error instanceof Error ? error.message : String(error));
      console.error('[CheckInForm] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      // Retry logic for unexpected errors
      if (retryCount < maxRetries) {
        console.log('[CheckInForm] 🔄 Retrying upload after error...');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        return uploadPhoto(uri, userId, dateString, retryCount + 1);
      }
      
      return null;
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      // Validate based on check-in type
      if (checkInType === 'weight' && !weight) {
        Alert.alert('Missing Weight', 'Please enter your weight');
        setSaving(false);
        return;
      }
      if (checkInType === 'steps' && !steps) {
        Alert.alert('Missing Steps', 'Please enter your steps');
        setSaving(false);
        return;
      }

      // Convert date to YYYY-MM-DD format in LOCAL timezone
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      console.log('[CheckInForm] 📅 Saving date:', dateString, '(from', date.toLocaleDateString(), ')');

      // Upload photo if new one was selected (only for weight check-ins)
      let finalPhotoUrl = photoUrl;
      if (checkInType === 'weight' && photoUri) {
        console.log('[CheckInForm] 📸 New photo selected, uploading...');
        const uploadedUrl = await uploadPhoto(photoUri, authUser.id, dateString);
        
        if (uploadedUrl) {
          finalPhotoUrl = uploadedUrl;
          console.log('[CheckInForm] ✅ Photo uploaded successfully, URL:', uploadedUrl);
        } else {
          console.error('[CheckInForm] ❌ Photo upload failed - showing alert to user');
          Alert.alert(
            'Photo Upload Failed',
            'Photo upload failed, but check-in will be saved without it.',
            [{ text: 'OK' }]
          );
        }
      }

      // Build check-in data based on type
      const checkInData: any = {
        user_id: authUser.id,
        date: dateString,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      };

      if (checkInType === 'weight') {
        // ALWAYS convert weight to kg for storage, regardless of user's preferred unit
        const units = user?.preferred_units || 'metric';
        const weightValue = parseFloat(weight);
        let weightInKg: number;
        
        if (units === 'imperial') {
          // User entered lbs, convert to kg for storage
          weightInKg = weightValue / 2.20462;
          console.log('[CheckInForm] ⚖️ Converting weight for storage:', weightValue, 'lbs →', weightInKg, 'kg');
        } else {
          // User entered kg, store as-is
          weightInKg = weightValue;
          console.log('[CheckInForm] ⚖️ Storing weight (no conversion needed):', weightInKg, 'kg');
        }
        
        checkInData.weight = weightInKg;
        checkInData.photo_url = finalPhotoUrl;
        console.log('[CheckInForm] 💾 Saving photo_url:', finalPhotoUrl);
      } else if (checkInType === 'steps') {
        checkInData.steps = steps ? parseInt(steps, 10) : null;
        checkInData.steps_goal = stepsGoal ? parseInt(stepsGoal, 10) : null;
      } else if (checkInType === 'gym') {
        checkInData.went_to_gym = wentToGym;
      }

      console.log('[CheckInForm] 💾 Saving check-in data:', checkInData);

      if (isEditing) {
        // Update existing check-in
        const { error } = await supabase
          .from('check_ins')
          .update(checkInData)
          .eq('id', checkInId);

        if (error) {
          console.error('[CheckInForm] Error updating check-in:', error);
          Alert.alert('Error', 'Failed to update check-in');
          return;
        }

        console.log('[CheckInForm] ✅ Check-in updated successfully');
        Alert.alert('Success', 'Check-in updated successfully', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        // Create new check-in
        const { error } = await supabase
          .from('check_ins')
          .insert(checkInData);

        if (error) {
          console.error('[CheckInForm] Error creating check-in:', error);
          Alert.alert('Error', 'Failed to create check-in');
          return;
        }

        console.log('[CheckInForm] ✅ Check-in created successfully');
        Alert.alert('Success', 'Check-in saved successfully', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error('[CheckInForm] Error in handleSave:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const getWeightUnit = () => {
    return user?.preferred_units === 'imperial' ? 'lbs' : 'kg';
  };

  const handleDateSelect = (selectedDate: Date) => {
    console.log('[CheckInForm] 📅 Date selected from calendar:', selectedDate.toLocaleDateString());
    setDate(selectedDate);
  };

  // Determine which image to display
  const displayImageUri = photoUri || photoUrl;

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
        edges={['top']}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Loading...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? colors.textDark : colors.text }]}>
          {isEditing ? 'Edit' : 'New'} {checkInType === 'weight' ? 'Weight' : checkInType === 'steps' ? 'Steps' : 'Gym'} Check-In
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Date - Using Calendar Date Picker */}
        <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>Date</Text>
          <TouchableOpacity
            style={[
              styles.dateButton,
              {
                backgroundColor: isDark ? colors.backgroundDark : colors.background,
                borderColor: isDark ? colors.borderDark : colors.border,
              },
            ]}
            onPress={() => setShowDatePicker(true)}
          >
            <IconSymbol
              ios_icon_name="calendar"
              android_material_icon_name="calendar_today"
              size={20}
              color={colors.primary}
            />
            <Text style={[styles.dateText, { color: isDark ? colors.textDark : colors.text }]}>
              {date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Weight Fields */}
        {checkInType === 'weight' && (
          <>
            <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
              <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                Weight ({getWeightUnit()})
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? colors.backgroundDark : colors.background,
                    borderColor: isDark ? colors.borderDark : colors.border,
                    color: isDark ? colors.textDark : colors.text,
                  },
                ]}
                placeholder={`Enter weight in ${getWeightUnit()}`}
                placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Photo */}
            <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
              <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                Progress Photo (Optional)
              </Text>
              
              {displayImageUri ? (
                <View style={styles.photoPreview}>
                  <Image
                    key={displayImageUri}
                    source={{ uri: displayImageUri }}
                    style={styles.photoImage}
                    resizeMode="cover"
                    onError={(error) => {
                      console.error('[CheckInForm] ❌ Image failed to load:', displayImageUri);
                      console.error('[CheckInForm] Error:', error.nativeEvent.error);
                    }}
                    onLoad={() => {
                      console.log('[CheckInForm] ✅ Image loaded successfully:', displayImageUri);
                    }}
                  />
                  <TouchableOpacity
                    style={[styles.removePhotoButton, { backgroundColor: colors.error }]}
                    onPress={handleRemovePhoto}
                  >
                    <IconSymbol
                      ios_icon_name="trash"
                      android_material_icon_name="delete"
                      size={20}
                      color="#FFFFFF"
                    />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.photoButtons}>
                  <TouchableOpacity
                    style={[styles.photoButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                    onPress={handleTakePhoto}
                  >
                    <IconSymbol
                      ios_icon_name="camera"
                      android_material_icon_name="photo_camera"
                      size={24}
                      color={colors.primary}
                    />
                    <Text style={[styles.photoButtonText, { color: isDark ? colors.textDark : colors.text }]}>
                      Take Photo
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.photoButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                    onPress={handleChoosePhoto}
                  >
                    <IconSymbol
                      ios_icon_name="photo"
                      android_material_icon_name="photo_library"
                      size={24}
                      color={colors.primary}
                    />
                    <Text style={[styles.photoButtonText, { color: isDark ? colors.textDark : colors.text }]}>
                      Choose Photo
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </>
        )}

        {/* Steps Fields */}
        {checkInType === 'steps' && (
          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>Steps</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.backgroundDark : colors.background,
                  borderColor: isDark ? colors.borderDark : colors.border,
                  color: isDark ? colors.textDark : colors.text,
                },
              ]}
              placeholder="Enter steps"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              value={steps}
              onChangeText={setSteps}
              keyboardType="number-pad"
            />
            
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text, marginTop: spacing.md }]}>
              Steps Goal
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.backgroundDark : colors.background,
                  borderColor: isDark ? colors.borderDark : colors.border,
                  color: isDark ? colors.textDark : colors.text,
                },
              ]}
              placeholder="Enter steps goal"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              value={stepsGoal}
              onChangeText={setStepsGoal}
              keyboardType="number-pad"
            />
          </View>
        )}

        {/* Gym Fields */}
        {checkInType === 'gym' && (
          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setWentToGym(!wentToGym)}
              activeOpacity={0.7}
            >
              <View style={styles.toggleLeft}>
                <IconSymbol
                  ios_icon_name="dumbbell.fill"
                  android_material_icon_name="fitness_center"
                  size={24}
                  color={wentToGym ? colors.success : (isDark ? colors.textSecondaryDark : colors.textSecondary)}
                />
                <Text style={[styles.toggleLabel, { color: isDark ? colors.textDark : colors.text }]}>
                  Went to gym today?
                </Text>
              </View>
              <View
                style={[
                  styles.toggle,
                  {
                    backgroundColor: wentToGym ? colors.success : (isDark ? colors.borderDark : colors.border),
                  },
                ]}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    {
                      transform: [{ translateX: wentToGym ? 20 : 0 }],
                    },
                  ]}
                />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Notes */}
        <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>Notes (Optional)</Text>
          <TextInput
            style={[
              styles.textArea,
              {
                backgroundColor: isDark ? colors.backgroundDark : colors.background,
                borderColor: isDark ? colors.borderDark : colors.border,
                color: isDark ? colors.textDark : colors.text,
              },
            ]}
            placeholder="Add any notes..."
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isEditing ? 'Update Check-In' : 'Save Check-In'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Calendar Date Picker Modal */}
      <CalendarDatePicker
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onSelectDate={handleDateSelect}
        initialDate={date}
        maxDate={new Date()}
        title="Select Date"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    ...typography.h3,
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  label: {
    ...typography.bodyBold,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dateText: {
    ...typography.body,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: {
    ...typography.body,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  photoButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoButtonText: {
    ...typography.body,
  },
  photoPreview: {
    position: 'relative',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: 300,
    borderRadius: borderRadius.md,
    backgroundColor: colors.border,
  },
  removePhotoButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    minHeight: 100,
  },
  saveButton: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15)',
    elevation: 3,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 40,
  },
});

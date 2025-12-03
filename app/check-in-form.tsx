
import React, { useState, useEffect } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';

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

  useEffect(() => {
    loadUserData();
    if (isEditing) {
      loadCheckInData();
    } else if (checkInType === 'steps') {
      loadDefaultStepsGoal();
    }
  }, []);

  const loadUserData = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data: userData } = await supabase
        .from('users')
        .select('preferred_units')
        .eq('id', authUser.id)
        .maybeSingle();

      setUser({ ...authUser, ...userData });
    } catch (error) {
      console.error('[CheckInForm] Error loading user data:', error);
    }
  };

  const loadDefaultStepsGoal = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      // Try to get the most recent steps goal
      const { data } = await supabase
        .from('check_ins')
        .select('steps_goal')
        .eq('user_id', authUser.id)
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

  const loadCheckInData = async () => {
    if (!checkInId) return;
    
    try {
      setLoading(true);
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

      // FIX: Parse date correctly from database (stored as YYYY-MM-DD)
      // Create a date object at noon local time to avoid timezone issues
      const [year, month, day] = data.date.split('-').map(Number);
      const localDate = new Date(year, month - 1, day, 12, 0, 0);
      console.log('[CheckInForm] 📅 Parsed date:', data.date, '→', localDate.toLocaleDateString());
      setDate(localDate);
      
      // FIX: Weight is stored in kg, convert to display units WITHOUT double conversion
      if (data.weight) {
        const units = user?.preferred_units || 'metric';
        console.log('[CheckInForm] ⚖️ Weight from DB:', data.weight, 'kg');
        
        if (units === 'imperial') {
          // Convert kg to lbs for display
          const lbs = data.weight * 2.20462;
          console.log('[CheckInForm] ⚖️ Converting to lbs for display:', lbs);
          setWeight(Math.round(lbs).toString());
        } else {
          // Display in kg
          console.log('[CheckInForm] ⚖️ Displaying in kg:', data.weight);
          setWeight(Math.round(data.weight).toString());
        }
      }
      
      setSteps(data.steps?.toString() || '');
      setStepsGoal(data.steps_goal?.toString() || '');
      setWentToGym(data.went_to_gym || false);
      setNotes(data.notes || '');
      setPhotoUrl(data.photo_url || null);
    } catch (error) {
      console.error('[CheckInForm] Error in loadCheckInData:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
        setPhotoUrl(null);
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
        setPhotoUri(result.assets[0].uri);
        setPhotoUrl(null);
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

  const uploadPhoto = async (uri: string, userId: string): Promise<string | null> => {
    try {
      console.log('[CheckInForm] Uploading photo...');
      
      const fileExt = uri.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;
      const filePath = `check-in-photos/${fileName}`;

      const response = await fetch(uri);
      const blob = await response.blob();

      const { data, error } = await supabase.storage
        .from('check-ins')
        .upload(filePath, blob, {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (error) {
        console.error('[CheckInForm] Upload error:', error);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from('check-ins')
        .getPublicUrl(filePath);

      console.log('[CheckInForm] Photo uploaded successfully');
      return urlData.publicUrl;
    } catch (error) {
      console.error('[CheckInForm] Error uploading photo:', error);
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

      // Upload photo if new one was selected (only for weight check-ins)
      let finalPhotoUrl = photoUrl;
      if (checkInType === 'weight' && photoUri) {
        const uploadedUrl = await uploadPhoto(photoUri, authUser.id);
        if (uploadedUrl) {
          finalPhotoUrl = uploadedUrl;
        } else {
          Alert.alert('Warning', 'Photo upload failed, but check-in will be saved without it');
        }
      }

      // FIX: Convert date to YYYY-MM-DD format in LOCAL timezone (no UTC conversion)
      // This ensures the date saved matches the date the user selected
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      console.log('[CheckInForm] 📅 Saving date:', dateString, '(from', date.toLocaleDateString(), ')');

      // Build check-in data based on type
      const checkInData: any = {
        user_id: authUser.id,
        date: dateString, // FIX: Use local date string, not ISO string
        notes: notes || null,
        updated_at: new Date().toISOString(),
      };

      if (checkInType === 'weight') {
        // FIX: Convert weight to kg for storage (always store in kg)
        const units = user?.preferred_units || 'metric';
        let weightInKg: number;
        
        if (units === 'imperial') {
          // User entered lbs, convert to kg for storage
          weightInKg = parseFloat(weight) / 2.20462;
          console.log('[CheckInForm] ⚖️ Converting weight:', weight, 'lbs →', weightInKg, 'kg');
        } else {
          // User entered kg, store as-is
          weightInKg = parseFloat(weight);
          console.log('[CheckInForm] ⚖️ Storing weight:', weightInKg, 'kg');
        }
        
        checkInData.weight = weightInKg;
        checkInData.photo_url = finalPhotoUrl;
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
        {/* Date */}
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
          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, selectedDate) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (selectedDate) {
                  // FIX: Set date at noon to avoid timezone issues
                  const noonDate = new Date(selectedDate);
                  noonDate.setHours(12, 0, 0, 0);
                  console.log('[CheckInForm] 📅 Date selected:', noonDate.toLocaleDateString());
                  setDate(noonDate);
                }
              }}
              maximumDate={new Date()}
            />
          )}
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
              
              {(photoUri || photoUrl) ? (
                <View style={styles.photoPreview}>
                  <Image
                    source={{ uri: photoUri || photoUrl || undefined }}
                    style={styles.photoImage}
                    resizeMode="cover"
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


import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

interface PhotoProgressCardProps {
  userId: string;
  isDark: boolean;
}

interface CheckInWithPhoto {
  id: string;
  date: string;
  photo_url: string;
  weight: number | null;
}

export default function PhotoProgressCard({ userId, isDark }: PhotoProgressCardProps) {
  const [loading, setLoading] = useState(true);
  const [checkIns, setCheckIns] = useState<CheckInWithPhoto[]>([]);
  const [leftDateIndex, setLeftDateIndex] = useState<number>(0);
  const [rightDateIndex, setRightDateIndex] = useState<number>(0);
  const [showLeftPicker, setShowLeftPicker] = useState(false);
  const [showRightPicker, setShowRightPicker] = useState(false);

  useEffect(() => {
    loadCheckInsWithPhotos();
  }, [userId, loadCheckInsWithPhotos]);

  const loadCheckInsWithPhotos = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[PhotoProgressCard] Loading check-ins with photos for user:', userId);

      // Query check_ins table for entries with photo_url
      // Use NOT NULL filter and order by date ascending
      const { data, error } = await supabase
        .from('check_ins')
        .select('id, date, photo_url, weight')
        .eq('user_id', userId)
        .not('photo_url', 'is', null)
        .neq('photo_url', '')
        .order('date', { ascending: true });

      if (error) {
        console.error('[PhotoProgressCard] Error loading check-ins:', error);
        setCheckIns([]);
        return;
      }

      console.log('[PhotoProgressCard] Loaded', data?.length || 0, 'check-ins with photos');
      
      if (data && data.length > 0) {
        // Log the photo URLs to verify they're correct
        data.forEach((checkIn, index) => {
          console.log(`[PhotoProgressCard] Check-in ${index + 1}:`, checkIn.date, '→', checkIn.photo_url);
        });
        
        setCheckIns(data);
        // Set default selection: earliest (left) and most recent (right)
        setLeftDateIndex(0);
        setRightDateIndex(data.length - 1);
      } else {
        setCheckIns([]);
      }
    } catch (err) {
      console.error('[PhotoProgressCard] Error in loadCheckInsWithPhotos:', err);
      setCheckIns([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const leftCheckIn = useMemo(() => {
    return checkIns[leftDateIndex] || null;
  }, [checkIns, leftDateIndex]);

  const rightCheckIn = useMemo(() => {
    return checkIns[rightDateIndex] || null;
  }, [checkIns, rightDateIndex]);

  const handleLeftDateSelect = (index: number) => {
    console.log('[PhotoProgressCard] Left date selected:', checkIns[index].date);
    setLeftDateIndex(index);
    setShowLeftPicker(false);
  };

  const handleRightDateSelect = (index: number) => {
    console.log('[PhotoProgressCard] Right date selected:', checkIns[index].date);
    setRightDateIndex(index);
    setShowRightPicker(false);
  };

  if (loading) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? colors.cardDark : colors.card,
            borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>
          Photo Progress
        </Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  // Empty state: no photos
  if (checkIns.length === 0) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? colors.cardDark : colors.card,
            borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>
          Photo Progress
        </Text>
        <View style={styles.emptyContainer}>
          <IconSymbol
            ios_icon_name="photo.on.rectangle"
            android_material_icon_name="photo_library"
            size={48}
            color={isDark ? colors.textSecondaryDark : colors.textSecondary}
          />
          <Text
            style={[
              styles.emptyText,
              { color: isDark ? colors.textSecondaryDark : colors.textSecondary },
            ]}
          >
            Add progress photos with your weight check-ins to compare your transformation.
          </Text>
        </View>
      </View>
    );
  }

  // Single photo state
  if (checkIns.length === 1) {
    const singleCheckIn = checkIns[0];
    console.log('[PhotoProgressCard] Rendering single photo:', singleCheckIn.photo_url);
    
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? colors.cardDark : colors.card,
            borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>
          Photo Progress
        </Text>
        
        <View style={styles.singlePhotoContainer}>
          <View style={styles.photoWrapper}>
            <Image
              key={singleCheckIn.photo_url}
              source={{ uri: singleCheckIn.photo_url }}
              style={styles.photoImage}
              resizeMode="cover"
              onError={(error) => {
                console.error('[PhotoProgressCard] ❌ Single photo failed to load:', singleCheckIn.photo_url);
                console.error('[PhotoProgressCard] Error:', error.nativeEvent.error);
              }}
              onLoad={() => {
                console.log('[PhotoProgressCard] ✅ Single photo loaded successfully');
              }}
            />
            <Text style={[styles.photoDate, { color: isDark ? colors.textDark : colors.text }]}>
              {formatDate(singleCheckIn.date)}
            </Text>
          </View>
          <Text
            style={[
              styles.singlePhotoMessage,
              { color: isDark ? colors.textSecondaryDark : colors.textSecondary },
            ]}
          >
            Add more photos to see your progress comparison
          </Text>
        </View>
      </View>
    );
  }

  // Normal state: two or more photos
  console.log('[PhotoProgressCard] Rendering comparison - Left:', leftCheckIn?.photo_url, 'Right:', rightCheckIn?.photo_url);
  
  return (
    <React.Fragment>
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? colors.cardDark : colors.card,
            borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>
          Photo Progress
        </Text>

        {/* Side-by-side photos */}
        <View style={styles.photosRow}>
          {/* Left photo */}
          <View style={styles.photoWrapper}>
            {leftCheckIn && (
              <React.Fragment>
                <Image
                  key={leftCheckIn.photo_url}
                  source={{ uri: leftCheckIn.photo_url }}
                  style={styles.photoImage}
                  resizeMode="cover"
                  onError={(error) => {
                    console.error('[PhotoProgressCard] ❌ Left photo failed to load:', leftCheckIn.photo_url);
                    console.error('[PhotoProgressCard] Error:', error.nativeEvent.error);
                  }}
                  onLoad={() => {
                    console.log('[PhotoProgressCard] ✅ Left photo loaded successfully');
                  }}
                />
                <TouchableOpacity
                  onPress={() => setShowLeftPicker(true)}
                  activeOpacity={0.7}
                  style={styles.dateButton}
                >
                  <Text style={[styles.photoDate, { color: isDark ? colors.textDark : colors.text }]}>
                    {formatDate(leftCheckIn.date)}
                  </Text>
                  <IconSymbol
                    ios_icon_name="chevron.down"
                    android_material_icon_name="expand_more"
                    size={14}
                    color={isDark ? colors.textDark : colors.text}
                  />
                </TouchableOpacity>
              </React.Fragment>
            )}
          </View>

          {/* Arrow separator */}
          <View style={styles.arrowContainer}>
            <IconSymbol
              ios_icon_name="arrow.right"
              android_material_icon_name="arrow_forward"
              size={24}
              color={colors.primary}
            />
          </View>

          {/* Right photo */}
          <View style={styles.photoWrapper}>
            {rightCheckIn && (
              <React.Fragment>
                <Image
                  key={rightCheckIn.photo_url}
                  source={{ uri: rightCheckIn.photo_url }}
                  style={styles.photoImage}
                  resizeMode="cover"
                  onError={(error) => {
                    console.error('[PhotoProgressCard] ❌ Right photo failed to load:', rightCheckIn.photo_url);
                    console.error('[PhotoProgressCard] Error:', error.nativeEvent.error);
                  }}
                  onLoad={() => {
                    console.log('[PhotoProgressCard] ✅ Right photo loaded successfully');
                  }}
                />
                <TouchableOpacity
                  onPress={() => setShowRightPicker(true)}
                  activeOpacity={0.7}
                  style={styles.dateButton}
                >
                  <Text style={[styles.photoDate, { color: isDark ? colors.textDark : colors.text }]}>
                    {formatDate(rightCheckIn.date)}
                  </Text>
                  <IconSymbol
                    ios_icon_name="chevron.down"
                    android_material_icon_name="expand_more"
                    size={14}
                    color={isDark ? colors.textDark : colors.text}
                  />
                </TouchableOpacity>
              </React.Fragment>
            )}
          </View>
        </View>
      </View>

      {/* Left Date Picker Modal */}
      <Modal
        visible={showLeftPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLeftPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowLeftPicker(false)}
        >
          <View
            style={[
              styles.pickerModal,
              {
                backgroundColor: isDark ? colors.cardDark : colors.card,
                borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: isDark ? colors.textDark : colors.text }]}>
                Select Left Photo Date
              </Text>
              <TouchableOpacity
                onPress={() => setShowLeftPicker(false)}
                style={styles.closeButton}
              >
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={24}
                  color={isDark ? colors.textDark : colors.text}
                />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerScroll}>
              {checkIns.map((checkIn, index) => (
                <TouchableOpacity
                  key={checkIn.id}
                  style={[
                    styles.pickerOption,
                    {
                      backgroundColor:
                        leftDateIndex === index
                          ? isDark
                            ? 'rgba(255, 255, 255, 0.1)'
                            : 'rgba(0, 0, 0, 0.05)'
                          : 'transparent',
                    },
                  ]}
                  onPress={() => handleLeftDateSelect(index)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      {
                        color:
                          leftDateIndex === index
                            ? colors.primary
                            : isDark
                            ? colors.textDark
                            : colors.text,
                        fontWeight: leftDateIndex === index ? '700' : '500',
                      },
                    ]}
                  >
                    {formatDate(checkIn.date)}
                  </Text>
                  {leftDateIndex === index && (
                    <IconSymbol
                      ios_icon_name="checkmark"
                      android_material_icon_name="check"
                      size={20}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Right Date Picker Modal */}
      <Modal
        visible={showRightPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRightPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowRightPicker(false)}
        >
          <View
            style={[
              styles.pickerModal,
              {
                backgroundColor: isDark ? colors.cardDark : colors.card,
                borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: isDark ? colors.textDark : colors.text }]}>
                Select Right Photo Date
              </Text>
              <TouchableOpacity
                onPress={() => setShowRightPicker(false)}
                style={styles.closeButton}
              >
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={24}
                  color={isDark ? colors.textDark : colors.text}
                />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerScroll}>
              {checkIns.map((checkIn, index) => (
                <TouchableOpacity
                  key={checkIn.id}
                  style={[
                    styles.pickerOption,
                    {
                      backgroundColor:
                        rightDateIndex === index
                          ? isDark
                            ? 'rgba(255, 255, 255, 0.1)'
                            : 'rgba(0, 0, 0, 0.05)'
                          : 'transparent',
                    },
                  ]}
                  onPress={() => handleRightDateSelect(index)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      {
                        color:
                          rightDateIndex === index
                            ? colors.primary
                            : isDark
                            ? colors.textDark
                            : colors.text,
                        fontWeight: rightDateIndex === index ? '700' : '500',
                      },
                    ]}
                  >
                    {formatDate(checkIn.date)}
                  </Text>
                  {rightDateIndex === index && (
                    <IconSymbol
                      ios_icon_name="checkmark"
                      android_material_icon_name="check"
                      size={20}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </React.Fragment>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  cardTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  singlePhotoContainer: {
    alignItems: 'center',
    gap: spacing.md,
  },
  singlePhotoMessage: {
    ...typography.caption,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  photosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  photoWrapper: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  photoImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: borderRadius.md,
    backgroundColor: colors.border,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  photoDate: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  arrowContainer: {
    paddingHorizontal: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  pickerModal: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.2)',
    elevation: 5,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  closeButton: {
    padding: spacing.xs,
  },
  pickerScroll: {
    maxHeight: 400,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerOptionText: {
    fontSize: 16,
  },
});

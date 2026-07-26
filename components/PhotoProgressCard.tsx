
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';

// ─── Gesture / Reanimated (native only) ──────────────────────────────────────

let useSharedValue: any = null;
let useAnimatedStyle: any = null;
let withSpring: any = null;
let runOnJS: any = null;
let AnimatedImage: any = null;
let GestureDetector: any = null;
let Gesture: any = null;
// True only when the real native Reanimated module is loaded (not a stub).
// Detected by checking for the internal worklet runtime marker that stubs lack.
let reanimatedIsNative = false;

if (Platform.OS !== 'web') {
  try {
    const Reanimated = require('react-native-reanimated');
    useSharedValue = Reanimated.useSharedValue;
    useAnimatedStyle = Reanimated.useAnimatedStyle;
    withSpring = Reanimated.withSpring;
    runOnJS = Reanimated.runOnJS;
    AnimatedImage = Reanimated.default?.createAnimatedComponent
      ? Reanimated.default.createAnimatedComponent(require('react-native').Image)
      : null;
    // Detect real Reanimated vs stub: real module exports `makeShareable`
    // and has the global worklet runtime; stubs do not.
    reanimatedIsNative = typeof Reanimated.makeShareable === 'function';
  } catch {}
  try {
    const GH = require('react-native-gesture-handler');
    GestureDetector = GH.GestureDetector;
    Gesture = GH.Gesture;
  } catch {}
}

// ─── AsyncStorage helpers ─────────────────────────────────────────────────────

async function savePhotoTransform(
  photoId: string,
  scale: number,
  translateX: number,
  translateY: number
) {
  try {
    await Promise.all([
      AsyncStorage.setItem(`@photoTransform.${photoId}.scale`, String(scale)),
      AsyncStorage.setItem(`@photoTransform.${photoId}.translateX`, String(translateX)),
      AsyncStorage.setItem(`@photoTransform.${photoId}.translateY`, String(translateY)),
    ]);
    console.log('[ZoomablePhoto] Transform saved for', photoId, { scale, translateX, translateY });
  } catch (e) {
    console.warn('[ZoomablePhoto] Failed to save transform for', photoId, e);
  }
}

async function loadPhotoTransform(
  photoId: string
): Promise<{ scale: number; translateX: number; translateY: number } | null> {
  try {
    const [s, tx, ty] = await Promise.all([
      AsyncStorage.getItem(`@photoTransform.${photoId}.scale`),
      AsyncStorage.getItem(`@photoTransform.${photoId}.translateX`),
      AsyncStorage.getItem(`@photoTransform.${photoId}.translateY`),
    ]);
    if (!s) return null;
    return {
      scale: parseFloat(s),
      translateX: parseFloat(tx ?? '0'),
      translateY: parseFloat(ty ?? '0'),
    };
  } catch {
    return null;
  }
}

// ─── ZoomablePhoto ────────────────────────────────────────────────────────────

interface ZoomablePhotoProps {
  uri: string;
  photoId: string;
  width: number;
  height: number;
  isDark: boolean;
}

// ─── ZoomablePhoto (native) ───────────────────────────────────────────────────
// Defined only when gesture/reanimated are available so hooks are always called
// unconditionally inside this component.

function ZoomablePhotoNative({ uri, photoId, width, height }: ZoomablePhotoProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    loadPhotoTransform(photoId).then((saved) => {
      if (saved) {
        scale.value = saved.scale;
        savedScale.value = saved.scale;
        translateX.value = saved.translateX;
        translateY.value = saved.translateY;
        savedTranslateX.value = saved.translateX;
        savedTranslateY.value = saved.translateY;
        console.log('[ZoomablePhoto] Restored transform for', photoId, saved);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId]);

  const saveTransform = (s: number, tx: number, ty: number) => {
    console.log('[ZoomablePhoto] Saving transform for', photoId, { scale: s, translateX: tx, translateY: ty });
    savePhotoTransform(photoId, s, tx, ty);
  };
  const jsSave = runOnJS(saveTransform);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e: any) => {
      const newScale = Math.min(4.0, Math.max(1.0, savedScale.value * e.scale));
      scale.value = newScale;
    })
    .onEnd((e: any) => {
      const newScale = Math.min(4.0, Math.max(1.0, savedScale.value * e.scale));
      scale.value = newScale;
      savedScale.value = newScale;
      jsSave(newScale, translateX.value, translateY.value);
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((e: any) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd((e: any) => {
      const newTx = savedTranslateX.value + e.translationX;
      const newTy = savedTranslateY.value + e.translationY;
      translateX.value = newTx;
      translateY.value = newTy;
      savedTranslateX.value = newTx;
      savedTranslateY.value = newTy;
      jsSave(scale.value, newTx, newTy);
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const Img = AnimatedImage || Image;

  return (
    <GestureDetector gesture={composed}>
      <Img
        source={{ uri }}
        style={[{ width, height }, animatedStyle]}
        resizeMode="cover"
      />
    </GestureDetector>
  );
}

// ─── ZoomablePhoto (web / fallback) ──────────────────────────────────────────

function ZoomablePhotoWeb({ uri, width, height }: ZoomablePhotoProps) {
  return (
    <Image
      source={{ uri }}
      style={{ width, height }}
      resizeMode="cover"
    />
  );
}

// ─── ZoomablePhoto (router) ───────────────────────────────────────────────────

function ZoomablePhoto(props: ZoomablePhotoProps) {
  // Use the native gesture+animation path only when the real Reanimated module
  // is loaded (not the web/preview stub) AND all gesture handler APIs exist.
  const isNative =
    Platform.OS !== 'web' &&
    reanimatedIsNative &&
    useSharedValue !== null &&
    useAnimatedStyle !== null &&
    GestureDetector !== null &&
    Gesture !== null;

  if (isNative) {
    return <ZoomablePhotoNative {...props} />;
  }
  return <ZoomablePhotoWeb {...props} />;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckInPhoto {
  id: string;
  user_id: string;
  check_in_id: string;
  photo_url: string;
  storage_path: string;
  created_at: string;
}

interface PhotoProgressCardProps {
  userId: string;
  isDark: boolean;
}

type SlotKey = 'before' | 'after';

const PHOTOS_ENDPOINT = `${SUPABASE_PROJECT_URL}/functions/v1/check-in-photos`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatDateShort(isoString: string): string {
  const d = new Date(isoString);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ─── Date Picker Modal ────────────────────────────────────────────────────────

interface DatePickerModalProps {
  visible: boolean;
  photos: CheckInPhoto[];
  selectedId: string | null;
  isDark: boolean;
  onSelect: (photo: CheckInPhoto) => void;
  onClose: () => void;
}

function DatePickerModal({ visible, photos, selectedId, isDark, onSelect, onClose }: DatePickerModalProps) {
  const overlayBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.45)';
  const sheetBg = isDark ? '#1E2035' : '#FFFFFF';
  const titleColor = isDark ? colors.textDark : colors.text;
  const itemBg = isDark ? '#252740' : '#F7F8FC';
  const itemBgSelected = colors.primary;
  const itemTextColor = isDark ? colors.textDark : colors.text;
  const separatorColor = isDark ? colors.borderDark : colors.border;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={[styles.modalOverlay, { backgroundColor: overlayBg }]} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { backgroundColor: sheetBg }]} onPress={() => {}}>
          <View style={[styles.modalHandle, { backgroundColor: separatorColor }]} />
          <Text style={[styles.modalTitle, { color: titleColor }]}>Select a Date</Text>
          <View style={[styles.modalDivider, { backgroundColor: separatorColor }]} />
          <FlatList
            data={photos}
            keyExtractor={(item) => item.id}
            style={styles.modalList}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => (
              <View style={[styles.itemSeparator, { backgroundColor: separatorColor }]} />
            )}
            renderItem={({ item }) => {
              const isSelected = item.id === selectedId;
              const dateText = formatDate(item.created_at);
              return (
                <TouchableOpacity
                  style={[
                    styles.dateItem,
                    { backgroundColor: isSelected ? itemBgSelected : itemBg },
                  ]}
                  onPress={() => {
                    console.log('[PhotoProgressCard] Date selected:', dateText, 'id:', item.id);
                    onSelect(item);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dateItemText,
                      { color: isSelected ? '#FFFFFF' : itemTextColor },
                    ]}
                  >
                    {dateText}
                  </Text>
                  {isSelected && (
                    <IconSymbol
                      ios_icon_name="checkmark"
                      android_material_icon_name="check"
                      size={16}
                      color="#FFFFFF"
                    />
                  )}
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity
            style={[styles.modalCancelBtn, { borderTopColor: separatorColor }]}
            onPress={() => {
              console.log('[PhotoProgressCard] Date picker dismissed');
              onClose();
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.modalCancelText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Tappable Date Pill ───────────────────────────────────────────────────────

interface DatePillProps {
  label: string;
  isDark: boolean;
  onPress: () => void;
}

function DatePill({ label, isDark, onPress }: DatePillProps) {
  const pillBg = isDark ? '#1E2035' : '#F0F2F7';
  return (
    <TouchableOpacity
      style={[styles.datePill, { backgroundColor: pillBg }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.datePillText, { color: colors.primary }]}>{label}</Text>
      <IconSymbol
        ios_icon_name="chevron.down"
        android_material_icon_name="expand_more"
        size={11}
        color={colors.primary}
      />
    </TouchableOpacity>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function PhotoProgressCardInner({ userId, isDark }: PhotoProgressCardProps) {
  const [photos, setPhotos] = useState<CheckInPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected photo IDs for each slot
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);

  // Which picker is open
  const [openPicker, setOpenPicker] = useState<SlotKey | null>(null);

  const persistBeforeId = useCallback(async (id: string) => {
    try {
      await AsyncStorage.setItem(`@photoProgress.beforeId.${userId}`, id);
    } catch (e) {
      console.warn('[PhotoProgressCard] Failed to persist beforeId:', e);
    }
  }, [userId]);

  const persistAfterId = useCallback(async (id: string) => {
    try {
      await AsyncStorage.setItem(`@photoProgress.afterId.${userId}`, id);
    } catch (e) {
      console.warn('[PhotoProgressCard] Failed to persist afterId:', e);
    }
  }, [userId]);

  const loadPhotos = useCallback(async () => {
    try {
      console.log('[PhotoProgressCard] Fetching all photos for user:', userId);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('[PhotoProgressCard] No session, skipping photo fetch');
        setLoading(false);
        return;
      }

      // Fetch all photos (no limit) so the user can pick any date
      const response = await fetch(`${PHOTOS_ENDPOINT}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('[PhotoProgressCard] Fetch failed:', response.status, text);
        setLoading(false);
        return;
      }

      const data = await response.json();
      const fetched: CheckInPhoto[] = data.photos ?? [];
      console.log('[PhotoProgressCard] Photos loaded:', fetched.length);

      // Sort oldest → newest
      const sorted = [...fetched].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      setPhotos(sorted);

      if (sorted.length >= 1) {
        // Try to restore saved selection from AsyncStorage
        let savedBefore: string | null = null;
        let savedAfter: string | null = null;
        try {
          [savedBefore, savedAfter] = await Promise.all([
            AsyncStorage.getItem(`@photoProgress.beforeId.${userId}`),
            AsyncStorage.getItem(`@photoProgress.afterId.${userId}`),
          ]);
        } catch (e) {
          console.warn('[PhotoProgressCard] Failed to read saved photo ids:', e);
        }

        const ids = new Set(sorted.map((p) => p.id));
        const resolvedBefore = savedBefore && ids.has(savedBefore) ? savedBefore : sorted[0].id;
        const resolvedAfter = savedAfter && ids.has(savedAfter) ? savedAfter : sorted[sorted.length - 1].id;

        console.log('[PhotoProgressCard] Resolved beforeId:', resolvedBefore, 'afterId:', resolvedAfter);
        setBeforeId(resolvedBefore);
        setAfterId(resolvedAfter);

        // Persist defaults if nothing was saved
        if (!savedBefore || !ids.has(savedBefore)) {
          await persistBeforeId(resolvedBefore);
        }
        if (!savedAfter || !ids.has(savedAfter)) {
          await persistAfterId(resolvedAfter);
        }
      }
    } catch (err) {
      console.error('[PhotoProgressCard] Error loading photos:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, persistBeforeId, persistAfterId]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subtextColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const windowWidth = Dimensions.get('window').width;
  const photoHeight = Math.floor((windowWidth - spacing.md * 2) * 0.75);
  const photoWidth = (windowWidth - spacing.md * 2) / 2;

  // ── Derived values ──────────────────────────────────────────────────────────
  const beforePhoto = photos.find((p) => p.id === beforeId) ?? null;
  const afterPhoto = photos.find((p) => p.id === afterId) ?? null;

  const beforeDateLabel = beforePhoto ? formatDateShort(beforePhoto.created_at) : '';
  const afterDateLabel = afterPhoto ? formatDateShort(afterPhoto.created_at) : '';

  const emptyState = photos.length === 0;
  const singlePhoto = photos.length === 1;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: textColor }]}>
            Photo Progress
          </Text>
        </View>
          <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleBeforePillPress = () => {
    console.log('[PhotoProgressCard] Before date pill tapped');
    setOpenPicker('before');
  };

  const handleAfterPillPress = () => {
    console.log('[PhotoProgressCard] After date pill tapped');
    setOpenPicker('after');
  };

  const handleSelectDate = (photo: CheckInPhoto) => {
    if (openPicker === 'before') {
      setBeforeId(photo.id);
      persistBeforeId(photo.id);
    } else if (openPicker === 'after') {
      setAfterId(photo.id);
      persistAfterId(photo.id);
    }
    setOpenPicker(null);
  };

  const handleClosePicker = () => {
    setOpenPicker(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: textColor }]}>
          Photo Progress
        </Text>
      </View>

      {/* Empty state */}
      {emptyState && (
        <View style={styles.emptyContainer}>
          <IconSymbol
            ios_icon_name="photo.stack"
            android_material_icon_name="photo_library"
            size={40}
            color={subtextColor}
          />
          <Text style={[styles.emptyText, { color: subtextColor }]}>
            Log a check-in with a photo to see your progress
          </Text>
        </View>
      )}

      {/* Single photo */}
      {singlePhoto && afterPhoto && (
        <View style={styles.photosRow}>
          <View style={[styles.photoWrapper, { overflow: 'hidden' }]}>
            <ZoomablePhoto
              uri={afterPhoto.photo_url}
              photoId={afterPhoto.id}
              width={photoWidth}
              height={photoHeight}
              isDark={isDark}
            />
            <View style={styles.datePillRow}>
              <DatePill
                label={afterDateLabel}
                isDark={isDark}
                onPress={handleAfterPillPress}
              />
            </View>
          </View>

          <View style={[styles.photoSeparator, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />

          <View
            style={[
              styles.photoWrapper,
              styles.placeholderWrapper,
              { height: photoHeight, borderColor: isDark ? '#3A3C52' : '#D4D6DA' },
            ]}
          >
            <IconSymbol
              ios_icon_name="camera"
              android_material_icon_name="photo_camera"
              size={28}
              color={subtextColor}
            />
            <Text style={[styles.placeholderText, { color: subtextColor }]}>
              Next check-in
            </Text>
          </View>
        </View>
      )}

      {/* Two or more photos */}
      {!emptyState && !singlePhoto && beforePhoto && afterPhoto && (
        <View style={styles.photosRow}>
          <View style={[styles.photoWrapper, { overflow: 'hidden' }]}>
            <ZoomablePhoto
              uri={beforePhoto.photo_url}
              photoId={beforePhoto.id}
              width={photoWidth}
              height={photoHeight}
              isDark={isDark}
            />
            <View style={styles.datePillRow}>
              <DatePill
                label={beforeDateLabel}
                isDark={isDark}
                onPress={handleBeforePillPress}
              />
            </View>
          </View>

          <View style={[styles.photoSeparator, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />

          <View style={[styles.photoWrapper, { overflow: 'hidden' }]}>
            <ZoomablePhoto
              uri={afterPhoto.photo_url}
              photoId={afterPhoto.id}
              width={photoWidth}
              height={photoHeight}
              isDark={isDark}
            />
            <View style={styles.datePillRow}>
              <DatePill
                label={afterDateLabel}
                isDark={isDark}
                onPress={handleAfterPillPress}
              />
            </View>
          </View>
        </View>
      )}

      {/* Date picker modal */}
      <DatePickerModal
        visible={openPicker !== null}
        photos={photos}
        selectedId={openPicker === 'before' ? beforeId : afterId}
        isDark={isDark}
        onSelect={handleSelectDate}
        onClose={handleClosePicker}
      />
    </View>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────

interface ErrorBoundaryState { hasError: boolean }
class PhotoProgressCardErrorBoundary extends React.Component<
  PhotoProgressCardProps,
  ErrorBoundaryState
> {
  constructor(props: PhotoProgressCardProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PhotoProgressCard] Caught render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return <PhotoProgressCardInner {...this.props} />;
  }
}

export default PhotoProgressCardErrorBoundary;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    marginBottom: 12,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingVertical: spacing.xl,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    maxWidth: 220,
  },
  photosRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingBottom: spacing.md,
  },
  photoWrapper: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  photo: {
    borderRadius: 0,
  },
  photoSeparator: {
    width: 1,
    alignSelf: 'stretch',
  },
  datePillRow: {
    alignItems: 'center',
  },
  arrowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.lg,
  },
  placeholderWrapper: {
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  placeholderText: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  // Date pill
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    marginTop: spacing.xs,
  },
  datePillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.lg,
    maxHeight: '60%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    ...typography.bodyBold,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  modalDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  modalList: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  itemSeparator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.sm,
  },
  dateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginVertical: 2,
  },
  dateItemText: {
    fontSize: 15,
    fontWeight: '500',
  },
  modalCancelBtn: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xs,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});


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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ZoomablePhoto } from '@/components/ZoomablePhoto';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';


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
  weightByCheckInId: Record<string, number | null>;
}

function DatePickerModal({ visible, photos, selectedId, isDark, onSelect, onClose, weightByCheckInId }: DatePickerModalProps) {
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
              const weightLbs = weightByCheckInId[item.check_in_id];
              const weightText = weightLbs != null ? ` · ${weightLbs.toFixed(1)} lbs` : '';
              const displayText = formatDate(item.created_at) + weightText;
              return (
                <TouchableOpacity
                  style={[
                    styles.dateItem,
                    { backgroundColor: isSelected ? itemBgSelected : itemBg },
                  ]}
                  onPress={() => {
                    console.log('[PhotoProgressCard] Date selected:', displayText, 'id:', item.id);
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
                    {displayText}
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
  weightLbs: number | null;
}

function DatePill({ label, isDark, onPress, weightLbs }: DatePillProps) {
  const pillBg = isDark ? '#1E2035' : '#F0F2F7';
  const pillLabel = label + (weightLbs != null ? ` · ${weightLbs.toFixed(1)} lbs` : '');
  return (
    <TouchableOpacity
      style={[styles.datePill, { backgroundColor: pillBg }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.datePillText, { color: colors.primary }]}>{pillLabel}</Text>
      <IconSymbol
        ios_icon_name="chevron.down"
        android_material_icon_name="expand_more"
        size={11}
        color={colors.primary}
      />
    </TouchableOpacity>
  );
}

// ─── Fullscreen Photo Viewer ──────────────────────────────────────────────────

interface PhotoViewerModalProps {
  uri: string | null;
  label: string;
  onClose: () => void;
}

function PhotoViewerModal({ uri, label, onClose }: PhotoViewerModalProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={uri !== null}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={viewerStyles.container}>
        {uri !== null && (
          <ZoomablePhoto uri={uri} style={{ flex: 1 }} />
        )}
        {/* Close button */}
        <TouchableOpacity
          style={[viewerStyles.closeButton, { top: insets.top + 12 }]}
          onPress={() => {
            console.log('[PhotoProgressCard] Fullscreen viewer closed');
            onClose();
          }}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol
            ios_icon_name="xmark"
            android_material_icon_name="close"
            size={20}
            color="#FFFFFF"
          />
        </TouchableOpacity>
        {/* Date label */}
        {label.length > 0 && (
          <View style={[viewerStyles.labelPill, { bottom: insets.bottom + 24 }]}>
            <Text style={viewerStyles.labelText}>{label}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelPill: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  labelText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});

// ─── Main Component ───────────────────────────────────────────────────────────

function PhotoProgressCardInner({ userId, isDark }: PhotoProgressCardProps) {
  const router = useRouter();

  const handleAddPhoto = useCallback(() => {
    console.log('[PhotoProgressCard] Add photo button pressed');
    router.push('/check-in-form');
  }, [router]);

  const [photos, setPhotos] = useState<CheckInPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [weightByCheckInId, setWeightByCheckInId] = useState<Record<string, number | null>>({});

  // Selected photo IDs for each slot
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);

  // Which picker is open
  const [openPicker, setOpenPicker] = useState<SlotKey | null>(null);

  // Fullscreen photo viewer
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerLabel, setViewerLabel] = useState<string>('');

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

      // Fetch weights for each check-in
      const checkInIds = fetched.map((p) => p.check_in_id).filter(Boolean);
      let weightMap: Record<string, number | null> = {};
      if (checkInIds.length > 0) {
        console.log('[PhotoProgressCard] Fetching weights for check-in ids:', checkInIds);
        const { data: checkIns } = await supabase
          .from('check_ins')
          .select('id, weight')
          .in('id', checkInIds);
        if (checkIns) {
          checkIns.forEach((ci: any) => {
            weightMap[ci.id] = ci.weight != null ? Number(ci.weight) * 2.20462 : null;
          });
        }
        console.log('[PhotoProgressCard] Weight map loaded:', weightMap);
      }
      setWeightByCheckInId(weightMap);

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
  const CARD_H_PADDING = spacing.md * 2; // left + right padding on photosRow
  const SEPARATOR_WIDTH = 1;
  const availableWidth = windowWidth - spacing.md * 2 - CARD_H_PADDING - SEPARATOR_WIDTH;
  const photoWidth = Math.floor(availableWidth / 2);
  const photoHeight = Math.floor(photoWidth * 1.35); // portrait ratio

  // ── Derived values ──────────────────────────────────────────────────────────
  const beforePhoto = photos.find((p) => p.id === beforeId) ?? null;
  const afterPhoto = photos.find((p) => p.id === afterId) ?? null;

  const beforeDateLabel = beforePhoto ? formatDateShort(beforePhoto.created_at) : '';
  const afterDateLabel = afterPhoto ? formatDateShort(afterPhoto.created_at) : '';
  const beforeWeightLbs = beforePhoto ? (weightByCheckInId[beforePhoto.check_in_id] ?? null) : null;
  const afterWeightLbs = afterPhoto ? (weightByCheckInId[afterPhoto.check_in_id] ?? null) : null;

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
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAddPhoto}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol
              ios_icon_name="plus.circle.fill"
              android_material_icon_name="add_circle"
              size={26}
              color={colors.primary}
            />
          </TouchableOpacity>
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

  const handleOpenViewer = (uri: string, label: string) => {
    console.log('[PhotoProgressCard] Opening fullscreen viewer for photo:', uri, 'label:', label);
    setViewerUri(uri);
    setViewerLabel(label);
  };

  const handleCloseViewer = () => {
    setViewerUri(null);
    setViewerLabel('');
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: textColor }]}>
          Photo Progress
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddPhoto}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add_circle"
            size={26}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Empty state */}
      {emptyState && (
        <TouchableOpacity
          style={styles.emptyContainer}
          onPress={handleAddPhoto}
          activeOpacity={0.85}
        >
          <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? '#252740' : '#F0F2FF' }]}>
            <IconSymbol
              ios_icon_name="camera.fill"
              android_material_icon_name="photo_camera"
              size={32}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: textColor }]}>
            Add your first progress photo
          </Text>
          <Text style={[styles.emptySubtext, { color: subtextColor }]}>
            Track your transformation over time
          </Text>
          <View style={[styles.emptyCtaButton, { backgroundColor: colors.primary }]}>
            <IconSymbol
              ios_icon_name="plus"
              android_material_icon_name="add"
              size={14}
              color="#FFFFFF"
            />
            <Text style={styles.emptyCtaText}>Add Check-In</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Single photo */}
      {singlePhoto && afterPhoto && (
        <View style={styles.photosRow}>
          <View style={styles.photoSlot}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                console.log('[PhotoProgressCard] Single photo tapped, opening viewer');
                handleOpenViewer(afterPhoto.photo_url, afterDateLabel);
              }}
            >
              <View style={[styles.photoWrapper, { width: photoWidth, height: photoHeight }]}>
                <Image
                  source={{ uri: afterPhoto.photo_url }}
                  style={{ width: photoWidth, height: photoHeight, borderRadius: 0 }}
                  resizeMode="cover"
                />
              </View>
            </TouchableOpacity>
            <View style={styles.datePillRow}>
              <DatePill
                label={afterDateLabel}
                isDark={isDark}
                onPress={handleAfterPillPress}
                weightLbs={afterWeightLbs}
              />
            </View>
          </View>

          <View style={[styles.photoSeparator, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />

          <View style={styles.photoSlot}>
            <View
              style={[
                styles.photoWrapper,
                styles.placeholderWrapper,
                { width: photoWidth, height: photoHeight, borderColor: isDark ? '#3A3C52' : '#D4D6DA' },
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
        </View>
      )}

      {/* Two or more photos */}
      {!emptyState && !singlePhoto && beforePhoto && afterPhoto && (
        <View style={styles.photosRow}>
          <View style={styles.photoSlot}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                console.log('[PhotoProgressCard] Before photo tapped, opening viewer');
                handleOpenViewer(beforePhoto.photo_url, beforeDateLabel);
              }}
            >
              <View style={[styles.photoWrapper, { width: photoWidth, height: photoHeight }]}>
                <Image
                  source={{ uri: beforePhoto.photo_url }}
                  style={{ width: photoWidth, height: photoHeight, borderRadius: 0 }}
                  resizeMode="cover"
                />
              </View>
            </TouchableOpacity>
            <View style={styles.datePillRow}>
              <DatePill
                label={beforeDateLabel}
                isDark={isDark}
                onPress={handleBeforePillPress}
                weightLbs={beforeWeightLbs}
              />
            </View>
          </View>

          <View style={[styles.photoSeparator, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />

          <View style={styles.photoSlot}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                console.log('[PhotoProgressCard] After photo tapped, opening viewer');
                handleOpenViewer(afterPhoto.photo_url, afterDateLabel);
              }}
            >
              <View style={[styles.photoWrapper, { width: photoWidth, height: photoHeight }]}>
                <Image
                  source={{ uri: afterPhoto.photo_url }}
                  style={{ width: photoWidth, height: photoHeight, borderRadius: 0 }}
                  resizeMode="cover"
                />
              </View>
            </TouchableOpacity>
            <View style={styles.datePillRow}>
              <DatePill
                label={afterDateLabel}
                isDark={isDark}
                onPress={handleAfterPillPress}
                weightLbs={afterWeightLbs}
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
        weightByCheckInId={weightByCheckInId}
      />

      {/* Fullscreen photo viewer */}
      <PhotoViewerModal
        uri={viewerUri}
        label={viewerLabel}
        onClose={handleCloseViewer}
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
    justifyContent: 'space-between',
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
  addButton: {
    marginLeft: 'auto',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptyCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginTop: spacing.xs,
  },
  emptyCtaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  photosRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  photoSlot: {
    flex: 1,
    alignItems: 'center',
  },
  photoWrapper: {
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

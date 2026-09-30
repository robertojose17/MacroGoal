import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import { X, Trophy, Flame, Camera, ChartBar, Lock, Unlock } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { createPost } from '@/utils/socialApi';
import { supabase } from '@/lib/supabase/client';

const MILESTONE_TYPES = [
  'Weight goal reached',
  'Streak milestone',
  'Macro goal hit',
  'Personal best',
  'Other',
];

const MAX_CHARS = 500;

interface CreatePostSheetProps {
  visible: boolean;
  isDark: boolean;
  currentStreak?: number;
  currentUserId?: string | null;
  onClose: () => void;
  onPosted: () => void;
}

export default function CreatePostSheet({
  visible,
  isDark,
  currentStreak = 0,
  currentUserId,
  onClose,
  onPosted,
}: CreatePostSheetProps) {
  const [content, setContent] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [showStreakBadge, setShowStreakBadge] = useState(false);
  const [showStatsBadge, setShowStatsBadge] = useState(false);
  const [showMilestonePicker, setShowMilestonePicker] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<string | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const bg = isDark ? colors.backgroundDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const dividerColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const toolbarBg = isDark ? colors.cardDark : '#FAFAFA';

  const charCount = content.length;
  const charLimitReached = charCount >= MAX_CHARS * 0.9;
  const charColor = charCount > MAX_CHARS ? colors.error : charLimitReached ? colors.warning : subColor;
  const canPost = content.trim().length > 0 && charCount <= MAX_CHARS && !posting;

  // Derive initials for avatar
  const userInitial = currentUserId ? currentUserId.charAt(0).toUpperCase() : 'U';

  const handlePickImage = useCallback(async () => {
    console.log('[CreatePostSheet] Image picker button pressed');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        console.log('[CreatePostSheet] Image selected — uri:', uri);
        setSelectedImageUri(uri);
      }
    } catch (e) {
      console.error('[CreatePostSheet] Image picker error:', e);
    }
  }, []);

  const handleRemoveImage = useCallback(() => {
    console.log('[CreatePostSheet] Image removed');
    setSelectedImageUri(null);
  }, []);

  const uploadImage = useCallback(async (uri: string): Promise<string | null> => {
    console.log('[CreatePostSheet] Uploading image to social-images bucket');
    setUploadingImage(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `posts/${currentUserId ?? 'anon'}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('social-images')
        .upload(path, blob, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });

      if (uploadError) {
        console.error('[CreatePostSheet] Image upload error:', uploadError.message);
        if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('bucket')) {
          console.warn('[CreatePostSheet] social-images bucket not found — skipping image');
          return null;
        }
        return null;
      }

      const { data: urlData } = supabase.storage.from('social-images').getPublicUrl(path);
      const publicUrl = urlData?.publicUrl ?? null;
      console.log('[CreatePostSheet] Image uploaded — public URL:', publicUrl);
      return publicUrl;
    } catch (e) {
      console.error('[CreatePostSheet] Image upload exception:', e);
      return null;
    } finally {
      setUploadingImage(false);
    }
  }, [currentUserId]);

  const handlePost = useCallback(async () => {
    console.log('[CreatePostSheet] Post button pressed — content length:', content.trim().length, 'public:', isPublic, 'hasImage:', !!selectedImageUri, 'streak:', showStreakBadge, 'stats:', showStatsBadge, 'milestone:', selectedMilestone);
    if (!content.trim()) {
      setError('Please write something to share.');
      return;
    }
    if (charCount > MAX_CHARS) {
      setError(`Post must be ${MAX_CHARS} characters or less.`);
      return;
    }
    setPosting(true);
    setError(null);

    let imageUrl: string | null = null;
    if (selectedImageUri) {
      imageUrl = await uploadImage(selectedImageUri);
    }

    // Determine post type
    let postType: 'text' | 'streak' | 'milestone' | 'stats' | 'photo' = 'text';
    if (imageUrl) postType = 'photo';
    else if (showStreakBadge) postType = 'streak';
    else if (selectedMilestone) postType = 'milestone';
    else if (showStatsBadge) postType = 'stats';

    try {
      await createPost({
        post_type: postType,
        content: content.trim(),
        streak_days: showStreakBadge ? currentStreak : undefined,
        milestone_type: selectedMilestone ?? undefined,
        is_public: isPublic,
        image_url: imageUrl ?? undefined,
      });
      console.log('[CreatePostSheet] Post created successfully — type:', postType);
      // Reset state
      setContent('');
      setIsPublic(true);
      setShowStreakBadge(false);
      setShowStatsBadge(false);
      setShowMilestonePicker(false);
      setSelectedMilestone(null);
      setSelectedImageUri(null);
      onPosted();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to post. Please try again.';
      console.error('[CreatePostSheet] Post failed:', msg);
      setError(msg);
    } finally {
      setPosting(false);
    }
  }, [content, charCount, isPublic, selectedImageUri, showStreakBadge, showStatsBadge, selectedMilestone, currentStreak, uploadImage, onPosted, onClose]);

  const handleClose = useCallback(() => {
    console.log('[CreatePostSheet] Sheet closed');
    setContent('');
    setError(null);
    setSelectedImageUri(null);
    setShowStreakBadge(false);
    setShowStatsBadge(false);
    setShowMilestonePicker(false);
    setSelectedMilestone(null);
    onClose();
  }, [onClose]);

  const handleToggleStreak = useCallback(() => {
    const next = !showStreakBadge;
    console.log('[CreatePostSheet] Streak badge toggled:', next);
    setShowStreakBadge(next);
    if (next) {
      setShowStatsBadge(false);
      setShowMilestonePicker(false);
      setSelectedMilestone(null);
    }
  }, [showStreakBadge]);

  const handleToggleMilestone = useCallback(() => {
    const next = !showMilestonePicker;
    console.log('[CreatePostSheet] Milestone picker toggled:', next);
    setShowMilestonePicker(next);
    if (next) {
      setShowStreakBadge(false);
      setShowStatsBadge(false);
    }
  }, [showMilestonePicker]);

  const handleToggleStats = useCallback(() => {
    const next = !showStatsBadge;
    console.log('[CreatePostSheet] Stats badge toggled:', next);
    setShowStatsBadge(next);
    if (next) {
      setShowStreakBadge(false);
      setShowMilestonePicker(false);
      setSelectedMilestone(null);
    }
  }, [showStatsBadge]);

  const handleTogglePublic = useCallback(() => {
    const next = !isPublic;
    console.log('[CreatePostSheet] Public toggle pressed — isPublic:', next);
    setIsPublic(next);
  }, [isPublic]);

  const streakBadgeText = `🔥 ${currentStreak} day streak`;
  const charCountDisplay = `${charCount}/${MAX_CHARS}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose} />
        <View style={[styles.sheet, { backgroundColor: bg }]}>
          {/* Header row */}
          <View style={styles.sheetHeader}>
            {/* Avatar */}
            <View style={[styles.avatarCircle, { backgroundColor: colors.primary + '28' }]}>
              <Text style={[styles.avatarInitial, { color: colors.primary }]}>{userInitial}</Text>
            </View>

            <View style={{ flex: 1 }} />

            {/* Post button */}
            <Pressable
              onPress={handlePost}
              disabled={!canPost}
              style={[styles.postPill, { backgroundColor: canPost ? colors.primary : colors.primary + '40' }]}
              accessibilityLabel="Post"
              accessibilityRole="button"
            >
              {posting || uploadingImage ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.postPillText}>Post</Text>
              )}
            </Pressable>

            {/* Close */}
            <Pressable
              onPress={handleClose}
              style={styles.closeBtn}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={20} color={subColor} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {/* Main text input */}
            <TextInput
              ref={inputRef}
              style={[styles.mainInput, { color: textColor }]}
              placeholder="What's on your mind?"
              placeholderTextColor={subColor}
              value={content}
              onChangeText={setContent}
              multiline
              autoFocus
              textAlignVertical="top"
              maxLength={MAX_CHARS + 10}
            />

            {/* Inline badges */}
            {showStreakBadge && (
              <View style={[styles.inlineBadge, { backgroundColor: '#FEE2E2' }]}>
                <Text style={styles.inlineBadgeText}>{streakBadgeText}</Text>
              </View>
            )}

            {showStatsBadge && (
              <View style={[styles.inlineBadge, { backgroundColor: colors.primary + '18' }]}>
                <Text style={[styles.inlineBadgeText, { color: colors.primary }]}>📊 Sharing my macros today</Text>
              </View>
            )}

            {/* Milestone picker */}
            {showMilestonePicker && (
              <View style={[styles.milestonePicker, { borderColor }]}>
                {MILESTONE_TYPES.map((mt) => {
                  const isSelected = selectedMilestone === mt;
                  return (
                    <Pressable
                      key={mt}
                      onPress={() => {
                        console.log('[CreatePostSheet] Milestone selected:', mt);
                        setSelectedMilestone(isSelected ? null : mt);
                      }}
                      style={[
                        styles.milestoneOption,
                        {
                          borderColor: isSelected ? colors.primary : borderColor,
                          backgroundColor: isSelected ? colors.primary + '10' : 'transparent',
                        },
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.milestoneOptionText, { color: isSelected ? colors.primary : textColor }]}>
                        {mt}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Image preview */}
            {selectedImageUri && (
              <View style={styles.imagePreviewWrap}>
                <Image
                  source={{ uri: selectedImageUri }}
                  style={styles.imagePreview}
                  resizeMode="cover"
                />
                <Pressable
                  style={styles.imageRemoveBtn}
                  onPress={handleRemoveImage}
                  accessibilityLabel="Remove image"
                  accessibilityRole="button"
                >
                  <X size={14} color="#fff" />
                </Pressable>
              </View>
            )}

            {/* Error */}
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}
          </ScrollView>

          {/* Bottom toolbar */}
          <View style={[styles.toolbar, { borderTopColor: dividerColor, backgroundColor: toolbarBg }]}>
            {/* Image picker */}
            <Pressable
              onPress={handlePickImage}
              style={[styles.toolbarBtn, selectedImageUri ? { backgroundColor: colors.primary + '18' } : {}]}
              accessibilityLabel="Add image"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Camera size={22} color={selectedImageUri ? colors.primary : subColor} />
            </Pressable>

            {/* Streak */}
            <Pressable
              onPress={handleToggleStreak}
              style={[styles.toolbarBtn, showStreakBadge ? { backgroundColor: '#FEE2E2' } : {}]}
              accessibilityLabel="Add streak"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Flame size={22} color={showStreakBadge ? '#EF4444' : subColor} />
            </Pressable>

            {/* Milestone */}
            <Pressable
              onPress={handleToggleMilestone}
              style={[styles.toolbarBtn, showMilestonePicker ? { backgroundColor: '#FEF3C7' } : {}]}
              accessibilityLabel="Add milestone"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Trophy size={22} color={showMilestonePicker ? '#F59E0B' : subColor} />
            </Pressable>

            {/* Stats */}
            <Pressable
              onPress={handleToggleStats}
              style={[styles.toolbarBtn, showStatsBadge ? { backgroundColor: colors.primary + '18' } : {}]}
              accessibilityLabel="Share stats"
              accessibilityRole="button"
              hitSlop={8}
            >
              <ChartBar size={22} color={showStatsBadge ? colors.primary : subColor} />
            </Pressable>

            {/* Lock / public toggle */}
            <Pressable
              onPress={handleTogglePublic}
              style={styles.toolbarBtn}
              accessibilityLabel={isPublic ? 'Public post' : 'Private post'}
              accessibilityRole="button"
              hitSlop={8}
            >
              {isPublic ? (
                <Unlock size={20} color={subColor} />
              ) : (
                <Lock size={20} color={colors.warning} />
              )}
            </Pressable>

            <View style={{ flex: 1 }} />

            {/* Char count */}
            <Text style={[styles.charCount, { color: charColor }]}>{charCountDisplay}</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 14,
    fontWeight: '700',
  },
  postPill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  postPillText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  mainInput: {
    fontSize: 17,
    lineHeight: 25,
    minHeight: 90,
    paddingTop: 4,
    paddingBottom: 8,
  },
  inlineBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginBottom: spacing.sm,
  },
  inlineBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#991B1B',
  },
  milestonePicker: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  milestoneOption: {
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  milestoneOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  imagePreviewWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  imagePreview: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.md,
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 4,
  },
  toolbarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  charCount: {
    fontSize: 12,
    fontWeight: '500',
  },
});

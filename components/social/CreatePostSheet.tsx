import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  ScrollView,
  Switch,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Trophy, Flame, Camera, Type, ChartBar } from 'lucide-react-native';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { createPost } from '@/utils/socialApi';
import type { PostType } from '@/utils/socialApi';

type PostTypeOption = {
  type: PostType;
  label: string;
  description: string;
  icon: React.ReactNode;
};

const POST_TYPES: PostTypeOption[] = [
  {
    type: 'text',
    label: 'Text',
    icon: <Type size={20} color={colors.primary} />,
    description: 'Share your thoughts',
  },
  {
    type: 'streak',
    label: 'Streak',
    icon: <Flame size={20} color="#EF4444" />,
    description: 'Celebrate your streak',
  },
  {
    type: 'milestone',
    label: 'Milestone',
    icon: <Trophy size={20} color="#F59E0B" />,
    description: 'Announce an achievement',
  },
  {
    type: 'stats',
    label: 'Stats',
    icon: <ChartBar size={20} color={colors.calories} />,
    description: 'Share your macros',
  },
  {
    type: 'photo',
    label: 'Photo',
    icon: <Camera size={20} color={colors.primary} />,
    description: 'Post a progress photo',
  },
];

const MILESTONE_TYPES = [
  'Weight goal reached',
  'Streak milestone',
  'Macro goal hit',
  'Personal best',
  'Other',
];

interface CreatePostSheetProps {
  visible: boolean;
  isDark: boolean;
  currentStreak?: number;
  onClose: () => void;
  onPosted: () => void;
}

export default function CreatePostSheet({
  visible,
  isDark,
  currentStreak = 0,
  onClose,
  onPosted,
}: CreatePostSheetProps) {
  const [selectedType, setSelectedType] = useState<PostType>('text');
  const [content, setContent] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [milestoneType, setMilestoneType] = useState(MILESTONE_TYPES[0]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bg = isDark ? colors.backgroundDark : '#FFFFFF';
  const cardBg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? '#1E2035' : colors.card;

  const handleTypeSelect = useCallback((type: PostType) => {
    console.log('[CreatePostSheet] Post type selected:', type);
    setSelectedType(type);
    setError(null);
  }, []);

  const handlePost = useCallback(async () => {
    console.log('[CreatePostSheet] Post button pressed — type:', selectedType, 'public:', isPublic, 'content length:', content.trim().length);
    if (!content.trim()) {
      setError('Please write something to share.');
      return;
    }
    if (content.trim().length > 280) {
      setError('Post must be 280 characters or less.');
      return;
    }
    setPosting(true);
    setError(null);
    try {
      await createPost({
        post_type: selectedType,
        content: content.trim(),
        streak_days: selectedType === 'streak' ? currentStreak : undefined,
        milestone_type: selectedType === 'milestone' ? milestoneType : undefined,
        is_public: isPublic,
      });
      console.log('[CreatePostSheet] Post created successfully');
      setContent('');
      setSelectedType('text');
      setIsPublic(true);
      onPosted();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to post. Please try again.';
      console.error('[CreatePostSheet] Post failed:', msg);
      setError(msg);
    } finally {
      setPosting(false);
    }
  }, [selectedType, content, isPublic, milestoneType, currentStreak, onPosted, onClose]);

  const handleClose = useCallback(() => {
    console.log('[CreatePostSheet] Sheet closed');
    setContent('');
    setError(null);
    onClose();
  }, [onClose]);

  const charCount = content.length;
  const charLimitReached = charCount >= 260;
  const charColor = charCount > 280 ? colors.error : charLimitReached ? colors.warning : subColor;

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
          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: textColor }]}>Create post</Text>
            <Pressable
              onPress={handleClose}
              style={styles.closeBtn}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={22} color={subColor} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Post type selector */}
            <Text style={[styles.sectionLabel, { color: subColor }]}>Post type</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.typeRow}
            >
              {POST_TYPES.map((pt) => {
                const isSelected = selectedType === pt.type;
                return (
                  <Pressable
                    key={pt.type}
                    onPress={() => handleTypeSelect(pt.type)}
                    style={[
                      styles.typeChip,
                      {
                        backgroundColor: isSelected ? colors.primary + '18' : cardBg,
                        borderColor: isSelected ? colors.primary : borderColor,
                      },
                    ]}
                    accessibilityLabel={pt.label}
                    accessibilityRole="button"
                  >
                    {pt.icon}
                    <Text style={[styles.typeChipLabel, { color: isSelected ? colors.primary : textColor }]}>
                      {pt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Streak info */}
            {selectedType === 'streak' && (
              <View style={[styles.infoBox, { backgroundColor: '#FEE2E2' }]}>
                <Flame size={18} color="#EF4444" />
                <Text style={styles.infoBoxText}>
                  Current streak:
                  {' '}
                  <Text style={{ fontWeight: '700' }}>
                    {currentStreak}
                    {' '}
                    days
                  </Text>
                </Text>
              </View>
            )}

            {/* Milestone type picker */}
            {selectedType === 'milestone' && (
              <View style={styles.milestoneSection}>
                <Text style={[styles.sectionLabel, { color: subColor }]}>Milestone type</Text>
                {MILESTONE_TYPES.map((mt) => (
                  <Pressable
                    key={mt}
                    onPress={() => {
                      console.log('[CreatePostSheet] Milestone type selected:', mt);
                      setMilestoneType(mt);
                    }}
                    style={[
                      styles.milestoneOption,
                      {
                        borderColor: milestoneType === mt ? colors.primary : borderColor,
                        backgroundColor: milestoneType === mt ? colors.primary + '10' : 'transparent',
                      },
                    ]}
                    accessibilityLabel={mt}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.milestoneOptionText, { color: milestoneType === mt ? colors.primary : textColor }]}>
                      {mt}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Content input */}
            <Text style={[styles.sectionLabel, { color: subColor }]}>
              {selectedType === 'text' ? "What's on your mind?" : 'Caption'}
            </Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: inputBg, borderColor, color: textColor }]}
              placeholder={
                selectedType === 'text'
                  ? 'Share your progress, thoughts, or tips...'
                  : 'Add a caption...'
              }
              placeholderTextColor={subColor}
              value={content}
              onChangeText={setContent}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={300}
            />
            <Text style={[styles.charCount, { color: charColor }]}>
              {charCount}
              /280
            </Text>

            {/* Public toggle */}
            <View style={[styles.toggleRow, { borderColor }]}>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleLabel, { color: textColor }]}>Public post</Text>
                <Text style={[styles.toggleDesc, { color: subColor }]}>
                  {isPublic ? 'Visible to everyone' : 'Only your followers'}
                </Text>
              </View>
              <Switch
                value={isPublic}
                onValueChange={(val) => {
                  console.log('[CreatePostSheet] Public toggle changed:', val);
                  setIsPublic(val);
                }}
                trackColor={{ false: colors.border, true: colors.primary + '88' }}
                thumbColor={isPublic ? colors.primary : '#f4f3f4'}
              />
            </View>

            {/* Error */}
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            {/* Post button */}
            <Pressable
              onPress={handlePost}
              disabled={posting}
              style={[styles.postBtn, { opacity: posting ? 0.7 : 1 }]}
              accessibilityLabel="Publish post"
              accessibilityRole="button"
            >
              {posting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.postBtnText}>Publish post</Text>
              )}
            </Pressable>

            <View style={{ height: 40 }} />
          </ScrollView>
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: 4,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  typeChipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  infoBoxText: {
    fontSize: 14,
    color: '#991B1B',
  },
  milestoneSection: {
    gap: spacing.xs,
  },
  milestoneOption: {
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    marginBottom: 4,
  },
  milestoneOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 100,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  toggleDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  postBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  postBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

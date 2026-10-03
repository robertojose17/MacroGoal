/**
 * Community Tab — Feed / Friends / Premium Club
 * 3 sub-tabs rendered as pill selector (state-based, not router tabs)
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Alert,
  TouchableOpacity,
  Image,
  Share,
  ImageSourcePropType,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import {
  Search,
  SquarePen,
  Crown,
  Heart,
  MessageCircle,
  MoreHorizontal,
  X,
  Plus,
  Users,
  Lock,
  Trophy,
  Pin,
  ChevronRight,
  Check,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { usePremium } from '@/hooks/usePremium';
import { supabase } from '@/lib/supabase/client';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';

// ─── Types ────────────────────────────────────────────────────────────────────

type CommunityTab = 'feed' | 'friends' | 'club';
type PostCategory = 'general' | 'small_win' | 'meal_idea' | 'question' | 'progress';
type PostSection = 'feed' | 'club';

interface PostAuthor {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  user_type: string | null;
}

interface CommunityPost {
  id: string;
  user_id: string;
  section: PostSection;
  category: PostCategory;
  content: string;
  image_url: string | null;
  food_name: string | null;
  food_calories: number | null;
  is_pinned: boolean;
  is_founder_post: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  author: PostAuthor | null;
  liked_by_me: boolean;
  top_comment?: TopComment | null;
}

interface TopComment {
  id: string;
  content: string;
  author: PostAuthor | null;
}

interface SearchUserResult {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface FollowingUser {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Commitment {
  id: string;
  user_id: string;
  partner_id: string;
  target_days: number;
  week_start: string;
  status: 'active' | 'pending' | 'completed';
  partner?: FollowingUser | null;
  requester?: FollowingUser | null;
}

interface CommunityChallenge {
  id: string;
  title: string;
  description: string;
  is_active: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getInitials(name: string | null, username: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (username && username.trim()) return username.slice(0, 2).toUpperCase();
  return '?';
}

function getAvatarColor(username: string): string {
  const palette = ['#5B9AA8', '#5CB97B', '#FF8A5B', '#8B5CF6', '#3B82F6', '#EF4444', '#F59E0B'];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

const CATEGORY_COLORS: Record<PostCategory, string> = {
  small_win: '#5CB97B',
  meal_idea: '#FF8A5B',
  question: '#3B82F6',
  progress: '#8B5CF6',
  general: '#6B7280',
};

const CATEGORY_LABELS: Record<PostCategory, string> = {
  small_win: 'Small win',
  meal_idea: 'Meal idea',
  question: 'Question',
  progress: 'Progress',
  general: 'General',
};

// ─── Avatar Component ─────────────────────────────────────────────────────────

interface AvatarProps {
  url: string | null;
  name: string | null;
  username: string;
  size?: number;
}

function UserAvatar({ url, name, username, size = 40 }: AvatarProps) {
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    console.log('[UserAvatar] url changed, resetting hasError. url:', url);
    setHasError(false);
  }, [url]);
  const isEmpty = (!name || !name.trim()) && (!username || !username.trim());
  const initials = getInitials(name, username);
  const bgColor = name ? '#5B9AA8' : getAvatarColor(username);
  if (url && !hasError) {
    return (
      <Image
        source={{ uri: url }}
        key={url}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => {
          console.log('[UserAvatar] Image load error for url:', url);
          setHasError(true);
        }}
      />
    );
  }
  if (isEmpty) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#9CA3AF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconSymbol
          ios_icon_name="person.fill"
          android_material_icon_name="person"
          size={size * 0.5}
          color="#fff"
        />
      </View>
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.35, fontWeight: '700' }}>
        {initials}
      </Text>
    </View>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: CommunityPost;
  isDark: boolean;
  currentUserId: string;
  onLike: (postId: string, liked: boolean) => void;
  onReport: (postId: string) => void;
  onBlock: (userId: string) => void;
  onDelete: (postId: string) => void;
  showSaveMeal?: boolean;
  showTopReply?: boolean;
}

function PostCard({
  post,
  isDark,
  currentUserId,
  onLike,
  onReport,
  onBlock,
  onDelete,
  showSaveMeal = false,
  showTopReply = false,
}: PostCardProps) {
  const [menuVisible, setMenuVisible] = useState(false);
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const authorName = post.author?.full_name || post.author?.username || 'Unknown';
  const relTime = getRelativeTime(post.created_at);
  const catColor = CATEGORY_COLORS[post.category] || '#6B7280';
  const catLabel = CATEGORY_LABELS[post.category] || post.category;
  const isOwn = post.user_id === currentUserId;

  const handleMenuPress = () => {
    console.log('[Community] Three-dot menu opened for post:', post.id);
    setMenuVisible(true);
  };

  const handleLike = () => {
    console.log('[Community] Like toggled for post:', post.id, 'currently liked:', post.liked_by_me);
    onLike(post.id, post.liked_by_me);
  };

  const handleReport = () => {
    console.log('[Community] Report pressed for post:', post.id);
    setMenuVisible(false);
    onReport(post.id);
  };

  const handleBlock = () => {
    console.log('[Community] Block pressed for user:', post.user_id);
    setMenuVisible(false);
    if (post.user_id) onBlock(post.user_id);
  };

  const handleDelete = () => {
    console.log('[Community] Delete pressed for post:', post.id);
    setMenuVisible(false);
    onDelete(post.id);
  };

  const handleSaveMeal = () => {
    console.log('[Community] Save meal pressed for post:', post.id, 'food:', post.food_name);
    Alert.alert('Meal saved!');
  };

  return (
    <View
      style={[
        styles.postCard,
        { backgroundColor: cardBg, borderColor: cardBorder },
      ]}
    >
      {/* Header */}
      <View style={styles.postHeader}>
        <UserAvatar
          url={post.author?.avatar_url ?? null}
          name={post.author?.full_name ?? null}
          username={post.author?.username ?? 'u'}
          size={40}
        />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <Text style={[styles.postAuthorName, { color: textColor }]}>
              {authorName}
            </Text>
            {post.is_founder_post && (
              <View style={styles.founderBadge}>
                <Text style={styles.founderBadgeText}>Founder</Text>
              </View>
            )}
          </View>
          {post.is_pinned ? (
            <Text style={[styles.pinnedLabel, { color: colors.primary }]}>
              Pinned · Community
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.postMeta, { color: catColor }]}>{catLabel}</Text>
              <Text style={[styles.postMeta, { color: secondaryColor }]}>·</Text>
              <Text style={[styles.postMeta, { color: secondaryColor }]}>{relTime}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={handleMenuPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MoreHorizontal size={20} color={secondaryColor} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <Text style={[styles.postContent, { color: textColor }]}>{post.content}</Text>

      {/* Food chip */}
      {post.food_name ? (
        <View style={styles.foodChip}>
          <Check size={12} color="#fff" />
          <Text style={styles.foodChipText}>
            {post.food_name}
            {post.food_calories ? ` · ${post.food_calories} kcal` : ''}
          </Text>
        </View>
      ) : null}

      {/* Image */}
      {post.image_url ? (
        <Image
          source={resolveImageSource(post.image_url)}
          style={styles.postImage}
          resizeMode="cover"
        />
      ) : null}

      {/* Save meal button (club only, meal_idea) */}
      {showSaveMeal && post.category === 'meal_idea' ? (
        <TouchableOpacity style={styles.saveMealBtn} onPress={handleSaveMeal}>
          <Text style={styles.saveMealBtnText}>Save meal</Text>
        </TouchableOpacity>
      ) : null}

      {/* Top reply preview (club) */}
      {showTopReply && post.top_comment ? (
        <View style={[styles.topReplyRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}>
          <UserAvatar
            url={post.top_comment.author?.avatar_url ?? null}
            name={post.top_comment.author?.full_name ?? null}
            username={post.top_comment.author?.username ?? 'u'}
            size={24}
          />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[styles.topReplyAuthor, { color: textColor }]}>
              {post.top_comment.author?.full_name || post.top_comment.author?.username}
            </Text>
            <Text style={[styles.topReplyContent, { color: secondaryColor }]} numberOfLines={1}>
              {post.top_comment.content}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Footer */}
      <View style={[styles.postFooter, { borderTopColor: isDark ? colors.borderDark : colors.border }]}>
        <TouchableOpacity style={styles.postAction} onPress={handleLike}>
          <Heart
            size={18}
            color={post.liked_by_me ? '#EF4444' : secondaryColor}
            fill={post.liked_by_me ? '#EF4444' : 'transparent'}
          />
          <Text style={[styles.postActionText, { color: post.liked_by_me ? '#EF4444' : secondaryColor }]}>
            {post.likes_count > 0 ? String(post.likes_count) : ''}
            {post.likes_count > 0 ? ' ' : ''}Support
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.postAction}>
          <MessageCircle size={18} color={secondaryColor} />
          <Text style={[styles.postActionText, { color: secondaryColor }]}>
            {post.comments_count > 0 ? String(post.comments_count) : ''}
            {post.comments_count > 0 ? ' ' : ''}Reply
          </Text>
        </TouchableOpacity>
      </View>

      {/* Three-dot menu modal */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuSheet, { backgroundColor: isDark ? colors.cardDark : '#fff' }]}>
            <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
              <Text style={[styles.menuItemText, { color: textColor }]}>Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleBlock}>
              <Text style={[styles.menuItemText, { color: textColor }]}>Block user</Text>
            </TouchableOpacity>
            {isOwn && (
              <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                <Text style={[styles.menuItemText, { color: colors.error }]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Create Post Sheet ────────────────────────────────────────────────────────

interface CreatePostSheetProps {
  visible: boolean;
  onClose: () => void;
  onPosted: () => void;
  section: PostSection;
  isDark: boolean;
  currentUserId: string;
  currentUserName: string;
  currentUserFirstName: string;
  currentUserAvatar: string | null;
}

const POST_CATEGORIES: PostCategory[] = ['general', 'small_win', 'meal_idea', 'question', 'progress'];

function CreatePostSheet({
  visible,
  onClose,
  onPosted,
  section,
  isDark,
  currentUserId,
  currentUserName,
  currentUserFirstName,
  currentUserAvatar,
}: CreatePostSheetProps) {
  const [category, setCategory] = useState<PostCategory>('general');
  const [content, setContent] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const bgColor = isDark ? colors.backgroundDark : colors.primaryBackground;
  const cardBg = isDark ? colors.cardDark : '#fff';
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;

  const handlePickImage = async () => {
    console.log('[Community] Image picker opened for post creation');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      console.log('[Community] Image selected:', result.assets[0].uri);
      setImageUri(result.assets[0].uri);
    }
  };

  const handlePost = async () => {
    if (!content.trim()) return;
    console.log('[Community] Posting to section:', section, 'category:', category, 'content length:', content.length);
    setPosting(true);
    try {
      const { error } = await supabase.from('community_posts').insert({
        user_id: currentUserId,
        section,
        category,
        content: content.trim(),
        image_url: imageUri,
        is_pinned: false,
        is_founder_post: false,
        likes_count: 0,
        comments_count: 0,
      });
      if (error) {
        console.log('[Community] Post insert error:', error.message);
        Alert.alert('Error', 'Could not post. Please try again.');
      } else {
        console.log('[Community] Post created successfully');
        setContent('');
        setImageUri(null);
        setCategory('general');
        onPosted();
        onClose();
      }
    } catch (e) {
      console.log('[Community] Post exception:', e);
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: bgColor }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Sheet header */}
        <View style={[styles.sheetHeader, { borderBottomColor: borderColor }]}>
          <TouchableOpacity onPress={onClose}>
            <X size={22} color={secondaryColor} />
          </TouchableOpacity>
          <Text style={[styles.sheetTitle, { color: textColor }]}>New Post</Text>
          <TouchableOpacity
            style={[styles.postBtn, { opacity: content.trim() ? 1 : 0.5 }]}
            onPress={handlePost}
            disabled={posting || !content.trim()}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.postBtnText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }}>
          {/* Category pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
            {POST_CATEGORIES.map((cat) => {
              const isActive = category === cat;
              const catColor = CATEGORY_COLORS[cat];
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => {
                    console.log('[Community] Category selected:', cat);
                    setCategory(cat);
                  }}
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor: isActive ? catColor : 'transparent',
                      borderColor: catColor,
                    },
                  ]}
                >
                  <Text style={[styles.categoryPillText, { color: isActive ? '#fff' : catColor }]}>
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Author row */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
            {currentUserAvatar ? (
              <Image
                key={currentUserAvatar}
                source={{ uri: currentUserAvatar }}
                style={{ width: 40, height: 40, borderRadius: 20 }}
                resizeMode="cover"
              />
            ) : (
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#5B9AA8', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{currentUserFirstName ? currentUserFirstName.charAt(0).toUpperCase() : 'U'}</Text>
              </View>
            )}
            <TextInput
              style={[styles.composeInput, { color: textColor, flex: 1 }]}
              placeholder={section === 'club' ? 'Ask a question or share what worked...' : 'Share a win or ask for help...'}
              placeholderTextColor={secondaryColor}
              multiline
              value={content}
              onChangeText={setContent}
              autoFocus
            />
          </View>

          {/* Image preview */}
          {imageUri ? (
            <View style={{ marginTop: spacing.md, position: 'relative' }}>
              <Image source={resolveImageSource(imageUri)} style={{ width: '100%', height: 180, borderRadius: borderRadius.md }} resizeMode="cover" />
              <TouchableOpacity
                style={styles.removeImageBtn}
                onPress={() => {
                  console.log('[Community] Image removed from post');
                  setImageUri(null);
                }}
              >
                <X size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Image picker */}
          <TouchableOpacity style={[styles.imagePickerBtn, { borderColor }]} onPress={handlePickImage}>
            <Plus size={16} color={colors.primary} />
            <Text style={[styles.imagePickerText, { color: colors.primary }]}>Add photo</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Report Modal ─────────────────────────────────────────────────────────────

interface ReportModalProps {
  visible: boolean;
  postId: string | null;
  onClose: () => void;
  isDark: boolean;
  currentUserId: string;
}

const REPORT_REASONS = ['Spam', 'Inappropriate', 'Other'];

function ReportModal({ visible, postId, onClose, isDark, currentUserId }: ReportModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#fff';

  const handleSubmit = async () => {
    if (!reason || !postId) return;
    console.log('[Community] Submitting report for post:', postId, 'reason:', reason);
    setSubmitting(true);
    try {
      const { error } = await supabase.from('community_reports').insert({
        post_id: postId,
        reporter_id: currentUserId,
        reason,
      });
      if (error) {
        console.log('[Community] Report insert error:', error.message);
      } else {
        console.log('[Community] Report submitted successfully');
      }
    } catch (e) {
      console.log('[Community] Report exception:', e);
    } finally {
      setSubmitting(false);
      setReason('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuOverlay} onPress={onClose}>
        <View style={[styles.reportSheet, { backgroundColor: cardBg }]}>
          <Text style={[styles.reportTitle, { color: textColor }]}>Report this post?</Text>
          {REPORT_REASONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.reportOption, { borderColor: reason === r ? colors.primary : (isDark ? colors.borderDark : colors.border) }]}
              onPress={() => {
                console.log('[Community] Report reason selected:', r);
                setReason(r);
              }}
            >
              <Text style={[styles.reportOptionText, { color: reason === r ? colors.primary : textColor }]}>{r}</Text>
              {reason === r && <Check size={16} color={colors.primary} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.postBtn, { opacity: reason ? 1 : 0.5, marginTop: spacing.md }]}
            onPress={handleSubmit}
            disabled={!reason || submitting}
          >
            {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.postBtnText}>Submit report</Text>}
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { t } = useTranslation();
  const { isPremium } = usePremium();

  const bgColor = isDark ? colors.backgroundDark : colors.primaryBackground;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;

  // ── Auth state ──
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserFirstName, setCurrentUserFirstName] = useState('');
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<CommunityTab>('feed');

  // ── Feed state ──
  const [feedPosts, setFeedPosts] = useState<CommunityPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [reportPostId, setReportPostId] = useState<string | null>(null);

  // ── Friends state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [following, setFollowing] = useState<FollowingUser[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsRefreshing, setFriendsRefreshing] = useState(false);
  const [commitment, setCommitment] = useState<Commitment | null>(null);
  const [myMealDays, setMyMealDays] = useState(0);
  const [partnerMealDays, setPartnerMealDays] = useState(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Club state ──
  const [clubPosts, setClubPosts] = useState<CommunityPost[]>([]);
  const [clubLoading, setClubLoading] = useState(false);
  const [clubRefreshing, setClubRefreshing] = useState(false);
  const [pinnedClubPost, setPinnedClubPost] = useState<CommunityPost | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<CommunityChallenge | null>(null);

  // ── Load current user (run once on mount) ──
  useEffect(() => {
    const loadUser = async () => {
      console.log('[Community] Loading current user session');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.log('[Community] No session found');
        return;
      }
      const uid = session.user.id;
      setCurrentUserId(uid);
      console.log('[Community] Session user id:', uid);
      const { data: profile } = await supabase
        .from('users')
        .select('username, full_name, avatar_url')
        .eq('id', uid)
        .single();
      if (profile) {
        const uname = profile.username || session.user.email?.split('@')[0] || 'user';
        const fname = profile.full_name?.split(' ')[0] || uname;
        setCurrentUserName(uname);
        setCurrentUserFirstName(fname);
        if (profile.avatar_url) {
          if (String(profile.avatar_url).startsWith('http')) {
            setCurrentUserAvatar(`${profile.avatar_url.split('?')[0]}?t=${Date.now()}`);
            console.log('[Community] Avatar URL (direct):', profile.avatar_url);
          } else {
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
            setCurrentUserAvatar(`${urlData.publicUrl}?t=${Date.now()}`);
            console.log('[Community] Avatar URL (resolved from storage):', urlData.publicUrl);
          }
        }
        console.log('[Community] User profile loaded:', uname);
      }
    };
    loadUser();
  }, []); // empty — run once on mount only

  // ── Reload avatar on every tab focus so stale/null avatar is refreshed ──
  const reloadAvatar = useCallback(async () => {
    console.log('[Community] reloadAvatar: checking for updated avatar on focus');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const uid = session.user.id;
    const { data: profile } = await supabase
      .from('users')
      .select('avatar_url')
      .eq('id', uid)
      .single();
    if (profile?.avatar_url) {
      if (String(profile.avatar_url).startsWith('http')) {
        setCurrentUserAvatar(`${profile.avatar_url.split('?')[0]}?t=${Date.now()}`);
        console.log('[Community] reloadAvatar: avatar refreshed (direct):', profile.avatar_url);
      } else {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
        setCurrentUserAvatar(`${urlData.publicUrl}?t=${Date.now()}`);
        console.log('[Community] reloadAvatar: avatar refreshed (storage):', urlData.publicUrl);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reloadAvatar();
    }, [reloadAvatar])
  );

  // ── Trigger initial data load once currentUserId is set ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!currentUserId) return;
    console.log('[Community] currentUserId set, loading all tabs data:', currentUserId);
    setFeedLoading(true);
    fetchFeedPosts(currentUserId).finally(() => setFeedLoading(false));
    setFriendsLoading(true);
    fetchFriendsData(currentUserId).finally(() => setFriendsLoading(false));
    setClubLoading(true);
    fetchClubPosts(currentUserId).finally(() => setClubLoading(false));
  }, [currentUserId]); // runs once when currentUserId is first set

  // ── Fetch feed posts ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchFeedPosts = useCallback(async (overrideUserId?: string) => {
    const uid = overrideUserId || currentUserId;
    if (!uid) return;
    console.log('[Community] Fetching feed posts for user:', uid);
    try {
      const [postsRes, likesRes] = await Promise.all([
        supabase
          .from('community_posts')
          .select('*, author:users!community_posts_user_id_fkey(id, username, full_name, avatar_url, user_type)')
          .eq('section', 'feed')
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('community_likes')
          .select('post_id')
          .eq('user_id', uid),
      ]);
      console.log('[Community] Feed posts fetched:', postsRes.data?.length ?? 0, 'likes:', likesRes.data?.length ?? 0);
      const likedIds = new Set((likesRes.data || []).map((l: { post_id: string }) => l.post_id));
      const posts: CommunityPost[] = (postsRes.data || []).map((p: Record<string, unknown>) => ({
        ...(p as CommunityPost),
        liked_by_me: likedIds.has(p.id as string),
      }));
      setFeedPosts(posts);
    } catch (e) {
      console.log('[Community] fetchFeedPosts error:', e);
    }
  }, []); // empty deps — uid always passed as parameter

  // ── Fetch club posts ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchClubPosts = useCallback(async (overrideUserId?: string) => {
    const uid = overrideUserId || currentUserId;
    if (!uid) return;
    console.log('[Community] Fetching club posts for user:', uid);
    try {
      const [postsRes, likesRes, commentsRes, challengeRes] = await Promise.all([
        supabase
          .from('community_posts')
          .select('*, author:users!community_posts_user_id_fkey(id, username, full_name, avatar_url, user_type)')
          .eq('section', 'club')
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('community_likes')
          .select('post_id')
          .eq('user_id', uid),
        supabase
          .from('community_comments')
          .select('id, post_id, content, author:users!community_comments_user_id_fkey(id, username, full_name, avatar_url, user_type)')
          .order('created_at', { ascending: true }),
        supabase
          .from('community_challenges')
          .select('*')
          .eq('is_active', true)
          .limit(1),
      ]);
      console.log('[Community] Club posts fetched:', postsRes.data?.length ?? 0);
      const likedIds = new Set((likesRes.data || []).map((l: { post_id: string }) => l.post_id));
      const commentsByPost: Record<string, TopComment> = {};
      for (const c of (commentsRes.data || [])) {
        if (!commentsByPost[c.post_id]) {
          commentsByPost[c.post_id] = { id: c.id, content: c.content, author: c.author };
        }
      }
      const posts: CommunityPost[] = (postsRes.data || []).map((p: Record<string, unknown>) => ({
        ...(p as CommunityPost),
        liked_by_me: likedIds.has(p.id as string),
        top_comment: commentsByPost[p.id as string] || null,
      }));
      const pinned = posts.find((p) => p.is_pinned) || null;
      setPinnedClubPost(pinned);
      setClubPosts(posts);
      if (challengeRes.data && challengeRes.data.length > 0) {
        setActiveChallenge(challengeRes.data[0] as CommunityChallenge);
        console.log('[Community] Active challenge found:', challengeRes.data[0].title);
      }
    } catch (e) {
      console.log('[Community] fetchClubPosts error:', e);
    }
  }, []); // empty deps — uid always passed as parameter

  // ── Fetch friends data ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchFriendsData = useCallback(async (overrideUserId?: string) => {
    const uid = overrideUserId || currentUserId;
    if (!uid) return;
    console.log('[Community] Fetching friends data for user:', uid);
    try {
      const weekStart = getMondayOfWeek(new Date());
      // Step 1: get following count (same as profile tab)
      const { count: rawFollowCount } = await supabase
        .from('social_follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', uid);
      setFollowingCount(rawFollowCount ?? 0);

      // Step 1b: get following IDs for profile list
      const { data: followData } = await supabase
        .from('social_follows')
        .select('following_id')
        .eq('follower_id', uid);
      console.log('[Community] fetchFriendsData — followData:', followData);

      const followingIdList = (followData || []).map((f: { following_id: string }) => f.following_id);
      console.log('[Community] Following IDs count:', followingIdList.length);

      // Step 2: if any, fetch user profiles
      let followingList: FollowingUser[] = [];
      if (followingIdList.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, username, full_name, avatar_url')
          .in('id', followingIdList);
        console.log('[Community] Following users fetched:', usersData?.length ?? 0);
        followingList = (usersData || []).map((u: any) => ({
          id: u.id,
          username: u.username,
          full_name: u.full_name,
          avatar_url: u.avatar_url,
        }));
      }
      setFollowing(followingList);
      setFollowingIds(new Set(followingList.map((u) => u.id)));

      const [commitRes] = await Promise.all([
        supabase
          .from('community_commitments')
          .select('*, partner:users!community_commitments_partner_id_fkey(id, username, full_name, avatar_url), requester:users!community_commitments_user_id_fkey(id, username, full_name, avatar_url)')
          .or(`user_id.eq.${uid},partner_id.eq.${uid}`)
          .eq('week_start', weekStart)
          .in('status', ['active', 'pending'])
          .limit(1),
      ]);

      if (commitRes.data && commitRes.data.length > 0) {
        const c = commitRes.data[0] as Commitment;
        setCommitment(c);
        console.log('[Community] Commitment found:', c.id, 'status:', c.status);
        // Fetch meal days for both users
        const partnerId = c.user_id === uid ? c.partner_id : c.user_id;
        const [myMeals, partnerMeals] = await Promise.all([
          supabase
            .from('meals')
            .select('date')
            .eq('user_id', uid)
            .gte('date', weekStart),
          supabase
            .from('meals')
            .select('date')
            .eq('user_id', partnerId)
            .gte('date', weekStart),
        ]);
        const myDays = new Set((myMeals.data || []).map((m: { date: string }) => m.date)).size;
        const partnerDays = new Set((partnerMeals.data || []).map((m: { date: string }) => m.date)).size;
        setMyMealDays(myDays);
        setPartnerMealDays(partnerDays);
        console.log('[Community] Meal days — me:', myDays, 'partner:', partnerDays);
      } else {
        setCommitment(null);
      }
    } catch (e) {
      console.log('[Community] fetchFriendsData error:', e);
    }
  }, []); // empty deps — uid always passed as parameter

  // ── Focus effect: refresh data for active tab on re-focus ──
  useFocusEffect(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => {
      if (!currentUserId) return;
      console.log('[Community] Screen focused, refreshing tab:', activeTab);
      // Always refresh friends/following data so count stays in sync with profile tab
      fetchFriendsData(currentUserId);
      // Also refresh the active tab's content
      if (activeTab === 'feed') {
        setFeedLoading(true);
        fetchFeedPosts(currentUserId).finally(() => setFeedLoading(false));
      } else if (activeTab === 'friends') {
        setFriendsLoading(true);
        fetchFriendsData(currentUserId).finally(() => setFriendsLoading(false));
      } else if (activeTab === 'club') {
        setClubLoading(true);
        fetchClubPosts(currentUserId).finally(() => setClubLoading(false));
      }
    }, [activeTab, currentUserId])
  );

  // ── Tab switch: reload data ──
  const handleTabSwitch = (tab: CommunityTab) => {
    console.log('[Community] Tab switched to:', tab);
    setActiveTab(tab);
    if (!currentUserId) return;
    if (tab === 'feed') {
      setFeedLoading(true);
      fetchFeedPosts(currentUserId).finally(() => setFeedLoading(false));
    } else if (tab === 'friends') {
      setFriendsLoading(true);
      fetchFriendsData(currentUserId).finally(() => setFriendsLoading(false));
    } else if (tab === 'club') {
      setClubLoading(true);
      fetchClubPosts(currentUserId).finally(() => setClubLoading(false));
    }
  };

  // ── Like toggle ──
  const handleLike = useCallback(async (postId: string, liked: boolean) => {
    console.log('[Community] Network request: toggle like, postId:', postId, 'liked:', liked);
    // Optimistic update
    const updatePosts = (posts: CommunityPost[]) =>
      posts.map((p) =>
        p.id === postId
          ? { ...p, liked_by_me: !liked, likes_count: liked ? p.likes_count - 1 : p.likes_count + 1 }
          : p
      );
    if (activeTab === 'feed') setFeedPosts((prev) => updatePosts(prev));
    else setClubPosts((prev) => updatePosts(prev));

    if (liked) {
      const { error } = await supabase
        .from('community_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', currentUserId);
      if (!error) {
        await supabase
          .from('community_posts')
          .update({ likes_count: feedPosts.find((p) => p.id === postId)?.likes_count ?? 0 })
          .eq('id', postId);
      }
      console.log('[Community] Like removed, error:', error?.message ?? 'none');
    } else {
      const { error } = await supabase
        .from('community_likes')
        .upsert({ post_id: postId, user_id: currentUserId });
      console.log('[Community] Like added, error:', error?.message ?? 'none');
    }
  }, [activeTab, currentUserId, feedPosts]);

  // ── Report ──
  const handleReport = (postId: string) => {
    console.log('[Community] Report modal opened for post:', postId);
    setReportPostId(postId);
  };

  // ── Block ──
  const handleBlock = async (userId: string) => {
    console.log('[Community] Network request: block user:', userId);
    const { error } = await supabase
      .from('community_blocks')
      .upsert({ blocker_id: currentUserId, blocked_id: userId });
    console.log('[Community] Block result, error:', error?.message ?? 'none');
    Alert.alert('User blocked');
  };

  // ── Delete post ──
  const handleDelete = async (postId: string) => {
    console.log('[Community] Network request: delete post:', postId);
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('community_posts').delete().eq('id', postId);
          console.log('[Community] Delete result, error:', error?.message ?? 'none');
          if (!error) {
            setFeedPosts((prev) => prev.filter((p) => p.id !== postId));
            setClubPosts((prev) => prev.filter((p) => p.id !== postId));
          }
        },
      },
    ]);
  };

  // ── Search users ──
  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      console.log('[Community] Network request: search users, query:', q);
      setSearchLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, username, full_name, avatar_url')
        .ilike('username', `%${q}%`)
        .limit(10);
      console.log('[Community] Search results:', data?.length ?? 0, 'error:', error?.message ?? 'none');
      setSearchResults((data as SearchUserResult[]) || []);
      setSearchLoading(false);
    }, 400);
  };

  // ── Follow / Unfollow ──
  const handleFollow = async (userId: string) => {
    const isFollowing = followingIds.has(userId);
    console.log('[Community] Network request:', isFollowing ? 'unfollow' : 'follow', 'user:', userId);
    if (isFollowing) {
      const { error } = await supabase
        .from('social_follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', userId);
      console.log('[Community] Unfollow result, error:', error?.message ?? 'none');
      setFollowingIds((prev) => { const s = new Set(prev); s.delete(userId); return s; });
      setFollowing((prev) => prev.filter((u) => u.id !== userId));
    } else {
      const { error } = await supabase
        .from('social_follows')
        .insert({ follower_id: currentUserId, following_id: userId });
      console.log('[Community] Follow result, error:', error?.message ?? 'none');
      setFollowingIds((prev) => new Set([...prev, userId]));
      const found = searchResults.find((u) => u.id === userId);
      if (found) setFollowing((prev) => [...prev, found]);
    }
  };

  // ── Accept / Decline commitment ──
  const handleAcceptCommitment = async () => {
    if (!commitment) return;
    console.log('[Community] Network request: accept commitment:', commitment.id);
    const { error } = await supabase
      .from('community_commitments')
      .update({ status: 'active' })
      .eq('id', commitment.id);
    console.log('[Community] Accept commitment result, error:', error?.message ?? 'none');
    if (!error) setCommitment({ ...commitment, status: 'active' });
  };

  const handleDeclineCommitment = async () => {
    if (!commitment) return;
    console.log('[Community] Network request: decline commitment:', commitment.id);
    const { error } = await supabase
      .from('community_commitments')
      .delete()
      .eq('id', commitment.id);
    console.log('[Community] Decline commitment result, error:', error?.message ?? 'none');
    if (!error) setCommitment(null);
  };

  // ── Invite friend ──
  const handleInvite = () => {
    console.log('[Community] Invite friend button pressed');
    Share.share({ message: 'Join me on Macro Goal!' });
  };

  // ── Refresh handlers ──
  const handleFeedRefresh = async () => {
    console.log('[Community] Feed pull-to-refresh triggered');
    setFeedRefreshing(true);
    await fetchFeedPosts(currentUserId);
    setFeedRefreshing(false);
  };

  const handleFriendsRefresh = async () => {
    console.log('[Community] Friends pull-to-refresh triggered');
    setFriendsRefreshing(true);
    await fetchFriendsData(currentUserId);
    setFriendsRefreshing(false);
  };

  const handleClubRefresh = async () => {
    console.log('[Community] Club pull-to-refresh triggered');
    setClubRefreshing(true);
    await fetchClubPosts(currentUserId);
    setClubRefreshing(false);
  };

  // ── Derived values ──
  const daysOfWeek = 7;
  const today = new Date();
  const weekStart = getMondayOfWeek(today);
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const daysLeft = 7 - dayOfWeek + 1;

  const partnerUser = commitment
    ? commitment.user_id === currentUserId
      ? commitment.partner
      : commitment.requester
    : null;
  const partnerName = partnerUser?.full_name?.split(' ')[0] || partnerUser?.username || 'Partner';
  const targetDays = commitment?.target_days ?? 5;
  const myProgress = Math.min(myMealDays / targetDays, 1);
  const partnerProgress = Math.min(partnerMealDays / targetDays, 1);
  const myProgressPct = Math.round(myProgress * 100);
  const partnerProgressPct = Math.round(partnerProgress * 100);

  // ── Pill selector ──
  const tabLabels: { key: CommunityTab; label: string }[] = [
    { key: 'feed', label: 'Feed' },
    { key: 'friends', label: 'Friends' },
    { key: 'club', label: 'Premium Club' },
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: bgColor }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Text style={[styles.headerTitle, { color: textColor }]}>Community</Text>
        <TouchableOpacity
          onPress={() => {
            console.log('[Community] Compose button pressed');
            setShowCreatePost(true);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <SquarePen size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Pill selector */}
      <View style={[styles.pillContainer, { borderColor }]}>
        {tabLabels.map(({ key, label }) => {
          const isActive = activeTab === key;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.pill,
                isActive && { backgroundColor: colors.primary },
              ]}
              onPress={() => handleTabSwitch(key)}
            >
              {key === 'club' && (
                <Crown size={13} color={isActive ? '#fff' : '#F59E0B'} style={{ marginRight: 4 }} />
              )}
              <Text style={[styles.pillText, { color: isActive ? '#fff' : secondaryColor }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── FEED TAB ── */}
      {activeTab === 'feed' && (
        <FlatList
          data={feedPosts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={feedRefreshing} onRefresh={handleFeedRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <View>
              {/* Welcome row */}
              <Text style={[styles.welcomeTitle, { color: textColor }]}>
                Welcome, {currentUserFirstName || 'there'}
              </Text>
              <Text style={[styles.welcomeSubtitle, { color: secondaryColor }]}>
                Small wins. Real support.
              </Text>

              {/* Better with a friend banner */}
              <View style={[styles.inviteBanner, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30' }]}>
                <View style={styles.inviteBannerLeft}>
                  <Users size={32} color={colors.primary} />
                  <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                    <Text style={[styles.inviteBannerTitle, { color: textColor }]}>Better with a friend</Text>
                    <Text style={[styles.inviteBannerSub, { color: secondaryColor }]}>Build consistency together.</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.inviteBtn} onPress={handleInvite}>
                  <Text style={styles.inviteBtnText}>Invite a friend</Text>
                </TouchableOpacity>
              </View>

              {/* Compose row */}
              <View style={[styles.composeRow, { backgroundColor: cardBg, borderColor }]}>
                {currentUserAvatar ? (
                  <Image
                    key={currentUserAvatar}
                    source={{ uri: currentUserAvatar }}
                    style={{ width: 36, height: 36, borderRadius: 18 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#5B9AA8', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{currentUserFirstName ? currentUserFirstName.charAt(0).toUpperCase() : 'U'}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.composePlaceholder, { borderColor }]}
                  onPress={() => {
                    console.log('[Community] Compose placeholder tapped');
                    setShowCreatePost(true);
                  }}
                >
                  <Text style={[styles.composePlaceholderText, { color: secondaryColor }]}>
                    Share a win or ask for help...
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[Community] Compose plus button tapped');
                    setShowCreatePost(true);
                  }}
                >
                  <Plus size={22} color={secondaryColor} />
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            feedLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateText, { color: secondaryColor }]}>
                  No posts yet. Be the first to share!
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              isDark={isDark}
              currentUserId={currentUserId}
              onLike={handleLike}
              onReport={handleReport}
              onBlock={handleBlock}
              onDelete={handleDelete}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      {/* ── FRIENDS TAB ── */}
      {activeTab === 'friends' && (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={friendsRefreshing} onRefresh={handleFriendsRefresh} tintColor={colors.primary} />
          }
        >
          {/* Search bar */}
          <View style={[styles.searchBar, { backgroundColor: cardBg, borderColor }]}>
            <Search size={18} color={secondaryColor} />
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder="Search by username..."
              placeholderTextColor={secondaryColor}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchLoading && <ActivityIndicator size="small" color={colors.primary} />}
          </View>

          {/* Search results */}
          {searchResults.length > 0 && (
            <View style={[styles.searchResultsCard, { backgroundColor: cardBg, borderColor }]}>
              {searchResults.map((user) => {
                const isFollowing = followingIds.has(user.id);
                return (
                  <View key={user.id} style={[styles.searchResultRow, { borderBottomColor: borderColor }]}>
                    <UserAvatar url={user.avatar_url} name={user.full_name} username={user.username} size={40} />
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text style={[styles.searchResultName, { color: textColor }]}>{user.full_name || user.username}</Text>
                      <Text style={[styles.searchResultHandle, { color: secondaryColor }]}>@{user.username}</Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.followBtn,
                        isFollowing && { backgroundColor: 'transparent', borderColor: colors.primary },
                      ]}
                      onPress={() => handleFollow(user.id)}
                    >
                      <Text style={[styles.followBtnText, isFollowing && { color: colors.primary }]}>
                        {isFollowing ? 'Following' : 'Follow'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Invite banner */}
          <View style={[styles.inviteBanner, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30', marginTop: spacing.sm }]}>
            <View style={styles.inviteBannerLeft}>
              <Users size={28} color={colors.primary} />
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={[styles.inviteBannerTitle, { color: textColor }]}>Bring a friend along</Text>
                <Text style={[styles.inviteBannerSub, { color: secondaryColor }]}>Build consistency together.</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.inviteBtn} onPress={handleInvite}>
              <Text style={styles.inviteBtnText}>Invite</Text>
            </TouchableOpacity>
          </View>

          {/* Together this week */}
          <Text style={[styles.sectionTitle, { color: textColor, marginTop: spacing.lg }]}>Together this week</Text>

          {friendsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
          ) : commitment ? (
            commitment.status === 'pending' && commitment.partner_id === currentUserId ? (
              // Pending — I need to accept
              <View style={[styles.commitmentCard, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30' }]}>
                <Text style={[styles.commitmentLabel, { color: colors.primary }]}>PENDING INVITATION</Text>
                <Text style={[styles.commitmentTitle, { color: textColor }]}>
                  {commitment.requester?.full_name || commitment.requester?.username} invited you to commit
                </Text>
                <Text style={[styles.commitmentSub, { color: secondaryColor }]}>
                  Log meals {commitment.target_days} days this week together
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                  <TouchableOpacity
                    style={[styles.inviteBtn, { flex: 1 }]}
                    onPress={handleAcceptCommitment}
                  >
                    <Text style={styles.inviteBtnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.declineBtn, { flex: 1, borderColor }]}
                    onPress={handleDeclineCommitment}
                  >
                    <Text style={[styles.declineBtnText, { color: secondaryColor }]}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : commitment.status === 'active' ? (
              // Active commitment
              <View style={[styles.commitmentCard, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30' }]}>
                <Text style={[styles.commitmentLabel, { color: colors.primary }]}>
                  YOU + {partnerName.toUpperCase()}
                </Text>
                <Text style={[styles.commitmentTitle, { color: textColor }]}>
                  Log meals {targetDays} days this week
                </Text>
                <Text style={[styles.commitmentSub, { color: secondaryColor }]}>
                  Shared commitment · {daysLeft} days left
                </Text>

                {/* My progress */}
                <View style={styles.progressRow}>
                  {currentUserAvatar ? (
                    <Image
                      key={currentUserAvatar}
                      source={{ uri: currentUserAvatar }}
                      style={{ width: 36, height: 36, borderRadius: 18 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#5B9AA8', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{currentUserFirstName ? currentUserFirstName.charAt(0).toUpperCase() : 'U'}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={[styles.progressName, { color: textColor }]}>You</Text>
                    <Text style={[styles.progressDays, { color: secondaryColor }]}>{myMealDays} / {targetDays} days</Text>
                  </View>
                  <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBarTrack, { backgroundColor: isDark ? colors.borderDark : '#E5E7EB' }]}>
                      <View style={[styles.progressBarFill, { width: `${myProgressPct}%` as unknown as number }]} />
                    </View>
                  </View>
                  <Text style={[styles.progressPct, { color: secondaryColor }]}>{myProgressPct}%</Text>
                </View>

                {/* Partner progress */}
                <View style={styles.progressRow}>
                  <UserAvatar url={partnerUser?.avatar_url ?? null} name={partnerUser?.full_name ?? null} username={partnerUser?.username ?? 'p'} size={36} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={[styles.progressName, { color: textColor }]}>{partnerName}</Text>
                    <Text style={[styles.progressDays, { color: secondaryColor }]}>{partnerMealDays} / {targetDays} days</Text>
                  </View>
                  <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBarTrack, { backgroundColor: isDark ? colors.borderDark : '#E5E7EB' }]}>
                      <View style={[styles.progressBarFill, { width: `${partnerProgressPct}%` as unknown as number }]} />
                    </View>
                  </View>
                  <Text style={[styles.progressPct, { color: secondaryColor }]}>{partnerProgressPct}%</Text>
                </View>

                {/* Footer actions */}
                <View style={[styles.commitmentFooter, { borderTopColor: isDark ? colors.borderDark : colors.border }]}>
                  <TouchableOpacity
                    style={styles.commitmentAction}
                    onPress={() => console.log('[Community] View week pressed')}
                  >
                    <Text style={[styles.commitmentActionText, { color: secondaryColor }]}>View week</Text>
                  </TouchableOpacity>
                  <View style={[styles.commitmentDivider, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />
                  <TouchableOpacity
                    style={styles.commitmentAction}
                    onPress={() => {
                      console.log('[Community] Send support pressed for partner:', partnerName);
                      setShowCreatePost(true);
                    }}
                  >
                    <MessageCircle size={14} color={secondaryColor} />
                    <Text style={[styles.commitmentActionText, { color: secondaryColor }]}>Send support</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null
          ) : (
            <View style={[styles.emptyCommitment, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[styles.emptyCommitmentText, { color: secondaryColor }]}>
                Start a shared commitment with a friend to track progress together.
              </Text>
            </View>
          )}

          {/* Following list */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.lg }}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Following</Text>
            <Text style={[styles.sectionSubtitle, { color: secondaryColor }]}>{followingCount} people</Text>
          </View>

          {following.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateText, { color: secondaryColor }]}>
                You're not following anyone yet. Search above to find friends.
              </Text>
            </View>
          ) : (
            <View style={[styles.followingCard, { backgroundColor: cardBg, borderColor }]}>
              {following.map((user, idx) => (
                <TouchableOpacity
                  key={user.id}
                  style={[
                    styles.followingRow,
                    idx < following.length - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor },
                  ]}
                  onPress={() => {
                    console.log('[Community] Following user tapped:', user.username);
                    router.push({ pathname: '/social-profile', params: { userId: user.id } });
                  }}
                >
                  <UserAvatar url={user.avatar_url} name={user.full_name} username={user.username} size={44} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={[styles.followingName, { color: textColor }]}>
                      {user.full_name || user.username}
                    </Text>
                    <Text style={[styles.followingHandle, { color: secondaryColor }]}>@{user.username}</Text>
                    <Text style={[styles.followingActivity, { color: secondaryColor }]}>Active recently</Text>
                  </View>
                  <ChevronRight size={18} color={secondaryColor} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[styles.privacyNote, { color: secondaryColor }]}>
            You only see what each person chooses to share.
          </Text>
        </ScrollView>
      )}

      {/* ── PREMIUM CLUB TAB ── */}
      {activeTab === 'club' && !isPremium && (
        <View style={[styles.gateContainer, { backgroundColor: bgColor }]}>
          <Lock size={48} color={colors.primary} />
          <Text style={[styles.gateTitle, { color: textColor }]}>Macro Goal Premium Club</Text>
          <Text style={[styles.gateBadge, { color: secondaryColor }]}>Private · Included with Premium</Text>
          <Text style={[styles.gateDesc, { color: secondaryColor }]}>
            Support, practical ideas, and progress together.
          </Text>
          <TouchableOpacity
            style={[styles.inviteBtn, { marginTop: spacing.lg, paddingHorizontal: spacing.xl }]}
            onPress={() => {
              console.log('[Community] Unlock Premium Club button pressed');
              router.push('/subscription');
            }}
          >
            <Text style={styles.inviteBtnText}>Unlock Premium Club</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'club' && isPremium && (
        <FlatList
          data={clubPosts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={clubRefreshing} onRefresh={handleClubRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <View>
              {/* Club header */}
              <View style={styles.clubHeader}>
                <Lock size={20} color={colors.primary} />
                <View style={{ marginLeft: spacing.sm }}>
                  <Text style={[styles.clubTitle, { color: textColor }]}>Macro Goal Premium Club</Text>
                  <Text style={[styles.clubMeta, { color: secondaryColor }]}>Private · Included with Premium</Text>
                  <Text style={[styles.clubDesc, { color: secondaryColor }]}>
                    Support, practical ideas, and progress together.
                  </Text>
                </View>
              </View>

              {/* Pinned weekly conversation */}
              <View style={[styles.pinnedConvCard, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30' }]}>
                <View style={styles.pinnedConvHeader}>
                  <Text style={[styles.pinnedConvLabel, { color: colors.primary }]}>THIS WEEK'S CONVERSATION</Text>
                  <Pin size={14} color={colors.primary} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
                  <UserAvatar
                    url={pinnedClubPost?.author?.avatar_url ?? null}
                    name={pinnedClubPost?.author?.full_name ?? 'Roberto Rivera'}
                    username={pinnedClubPost?.author?.username ?? 'roberto'}
                    size={36}
                  />
                  <Text style={[styles.pinnedConvAuthor, { color: textColor }]}>
                    {pinnedClubPost?.author?.full_name || 'Roberto Rivera'}
                  </Text>
                  <View style={styles.founderBadge}>
                    <Text style={styles.founderBadgeText}>Founder</Text>
                  </View>
                </View>
                <Text style={[styles.pinnedConvQuestion, { color: textColor }]}>
                  {pinnedClubPost?.content || "What's your biggest nutrition challenge this week?"}
                </Text>
                <View style={styles.pinnedConvFooter}>
                  <TouchableOpacity
                    style={styles.joinConvBtn}
                    onPress={() => {
                      console.log('[Community] Join conversation pressed');
                      setShowCreatePost(true);
                    }}
                  >
                    <MessageCircle size={14} color="#fff" />
                    <Text style={styles.joinConvBtnText}>Join conversation</Text>
                  </TouchableOpacity>
                  <Text style={[styles.repliesText, { color: secondaryColor }]}>
                    {pinnedClubPost?.comments_count ?? 0} replies
                  </Text>
                </View>
              </View>

              {/* Club compose row */}
              <View style={[styles.composeRow, { backgroundColor: cardBg, borderColor }]}>
                {currentUserAvatar ? (
                  <Image
                    key={currentUserAvatar}
                    source={{ uri: currentUserAvatar }}
                    style={{ width: 36, height: 36, borderRadius: 18 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#5B9AA8', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{currentUserFirstName ? currentUserFirstName.charAt(0).toUpperCase() : 'U'}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.composePlaceholder, { borderColor }]}
                  onPress={() => {
                    console.log('[Community] Club compose placeholder tapped');
                    setShowCreatePost(true);
                  }}
                >
                  <Text style={[styles.composePlaceholderText, { color: secondaryColor }]}>
                    Ask a question or share what worked...
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[Community] Club compose plus button tapped');
                    setShowCreatePost(true);
                  }}
                >
                  <Plus size={22} color={secondaryColor} />
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            clubLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateText, { color: secondaryColor }]}>
                  No posts yet. Start the conversation!
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            activeChallenge ? (
              <View style={[styles.challengeCard, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Trophy size={24} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.challengeLabel, { color: colors.primary }]}>OPTIONAL COMMUNITY CHALLENGE</Text>
                    <Text style={[styles.challengeTitle, { color: textColor }]}>{activeChallenge.title}</Text>
                    <Text style={[styles.challengeDesc, { color: secondaryColor }]}>{activeChallenge.description}</Text>
                  </View>
                  <ChevronRight size={18} color={secondaryColor} />
                </View>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[Community] View challenge pressed:', activeChallenge.id);
                    Alert.alert(activeChallenge.title, activeChallenge.description);
                  }}
                >
                  <Text style={[styles.viewChallengeLink, { color: colors.primary }]}>View challenge</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              isDark={isDark}
              currentUserId={currentUserId}
              onLike={handleLike}
              onReport={handleReport}
              onBlock={handleBlock}
              onDelete={handleDelete}
              showSaveMeal
              showTopReply
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      {/* Create post sheet */}
      <CreatePostSheet
        visible={showCreatePost}
        onClose={() => setShowCreatePost(false)}
        onPosted={() => {
          if (activeTab === 'feed') fetchFeedPosts(currentUserId);
          else fetchClubPosts(currentUserId);
        }}
        section={activeTab === 'club' ? 'club' : 'feed'}
        isDark={isDark}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        currentUserFirstName={currentUserFirstName}
        currentUserAvatar={currentUserAvatar}
      />

      {/* Report modal */}
      <ReportModal
        visible={reportPostId !== null}
        postId={reportPostId}
        onClose={() => setReportPostId(null)}
        isDark={isDark}
        currentUserId={currentUserId}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 56,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  pillContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 2,
  },
  welcomeSubtitle: {
    fontSize: 14,
    marginBottom: spacing.md,
  },
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  inviteBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  inviteBannerSub: {
    fontSize: 13,
    marginTop: 2,
  },
  inviteBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  composePlaceholder: {
    flex: 1,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
  },
  composePlaceholderText: {
    fontSize: 14,
  },
  postCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  postAuthorName: {
    fontSize: 15,
    fontWeight: '700',
  },
  founderBadge: {
    backgroundColor: colors.primary + '22',
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  founderBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  pinnedLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  postMeta: {
    fontSize: 13,
  },
  postContent: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  foodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: spacing.sm,
  },
  foodChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  postImage: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  saveMealBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  saveMealBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  topReplyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  topReplyAuthor: {
    fontSize: 12,
    fontWeight: '600',
  },
  topReplyContent: {
    fontSize: 12,
  },
  postFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  postAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  postActionText: {
    fontSize: 14,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.md,
    paddingBottom: 32,
  },
  menuItem: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuItemText: {
    fontSize: 16,
  },
  reportSheet: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.md,
    paddingBottom: 32,
  },
  reportTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  reportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  reportOptionText: {
    fontSize: 15,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  postBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
  },
  postBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  composeInput: {
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  categoryPill: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: spacing.sm,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
  imagePickerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  searchResultsCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: '600',
  },
  searchResultHandle: {
    fontSize: 13,
  },
  followBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  followBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 14,
  },
  commitmentCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  commitmentLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  commitmentTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  commitmentSub: {
    fontSize: 13,
    marginBottom: spacing.md,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressName: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressDays: {
    fontSize: 12,
  },
  progressBarContainer: {
    width: 100,
    marginHorizontal: spacing.sm,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressPct: {
    fontSize: 13,
    fontWeight: '600',
    width: 36,
    textAlign: 'right',
  },
  commitmentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  commitmentAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  commitmentActionText: {
    fontSize: 14,
  },
  commitmentDivider: {
    width: 1,
    height: 20,
  },
  declineBtn: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCommitment: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  emptyCommitmentText: {
    fontSize: 14,
    textAlign: 'center',
  },
  followingCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  followingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  followingName: {
    fontSize: 15,
    fontWeight: '600',
  },
  followingHandle: {
    fontSize: 13,
  },
  followingActivity: {
    fontSize: 12,
    marginTop: 1,
  },
  privacyNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
  },
  gateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  gateTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  gateBadge: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  gateDesc: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  clubHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  clubTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  clubMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  clubDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  pinnedConvCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  pinnedConvHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pinnedConvLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  pinnedConvAuthor: {
    fontSize: 15,
    fontWeight: '700',
  },
  pinnedConvQuestion: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  pinnedConvFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  joinConvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
  },
  joinConvBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  repliesText: {
    fontSize: 14,
  },
  challengeCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  challengeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  challengeTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  challengeDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  viewChallengeLink: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
});

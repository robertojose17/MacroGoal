/**
 * Community Tab — Feed + People (3-toggle redesign)
 * Feed: Everyone (discover) / Members (founder posts, premium-gated) / Report a Bug
 * People: Following/Followers + search
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
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  Search,
  SquarePen,
  Crown,
  Heart,
  Flame,
  Zap,
  MessageCircle,
  ArrowUp,
  Users,
  MessageSquare,
  Plus,
  MoreHorizontal,
  X,
  Camera,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import {
  fetchFeed,
  fetchFollowing,
  fetchFollowers,
  searchUsers,
  toggleLike,
} from '@/utils/socialApi';
import type { SocialPost, SearchUser } from '@/utils/socialApi';
import SocialPostCard from '@/components/social/SocialPostCard';
import SearchUserRow from '@/components/social/SearchUserRow';
import Avatar from '@/components/social/Avatar';
import CreatePostSheet from '@/components/social/CreatePostSheet';
import { usePremium } from '@/hooks/usePremium';
import { supabase } from '@/lib/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'feed' | 'people';
type FeedToggle = 'everyone' | 'members' | 'report_bug';
type PeopleSection = 'following' | 'followers';
type MembersCategory = 'all' | 'general' | 'ask_founder' | 'report_bug';

interface FounderPost {
  id: string;
  author_id: string;
  content: string;
  category: MembersCategory;
  created_at: string;
  reaction_count: number;
  comment_count: number;
  user_reaction: string | null;
  comments: FounderComment[];
  commentsLoaded: boolean;
  image_url?: string;
  author_username?: string;
}

interface FounderComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_username: string;
  author_avatar: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const REACTION_ICONS: { key: string; Icon: React.ComponentType<{ size: number; color: string }> }[] = [
  { key: 'heart', Icon: Heart },
  { key: 'flame', Icon: Flame },
  { key: 'zap', Icon: Zap },
];

const CATEGORY_LABELS: Record<MembersCategory, string> = {
  all: 'All',
  general: 'General',
  ask_founder: 'Ask Founder',
  report_bug: 'Bug Reports',
};

const FOUNDER_POST_CATEGORIES: { value: MembersCategory; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'ask_founder', label: 'Ask Founder' },
];

const FEED_PAGE_SIZE = 20;

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { isPremium } = usePremium();

  // ── Tab state
  const [mainTab, setMainTab] = useState<MainTab>('feed');
  const [feedToggle, setFeedToggle] = useState<FeedToggle>('everyone');
  const [peopleSection, setPeopleSection] = useState<PeopleSection>('following');

  // ── UI
  const [showCreatePost, setShowCreatePost] = useState(false);

  // ── Feed state
  const [feedPosts, setFeedPosts] = useState<SocialPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedOffset, setFeedOffset] = useState(0);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);

  // ── Members state
  const [founderPosts, setFounderPosts] = useState<FounderPost[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersRefreshing, setMembersRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<MembersCategory>('general');
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // ── Edit/Delete comments
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // ── Founder post creation modal (admin)
  const [showFounderModal, setShowFounderModal] = useState(false);
  const [founderModalContent, setFounderModalContent] = useState('');
  const [founderModalCategory, setFounderModalCategory] = useState<MembersCategory>('general');
  const [founderModalSubmitting, setFounderModalSubmitting] = useState(false);
  const [founderModalError, setFounderModalError] = useState<string | null>(null);
  const [founderModalImageUri, setFounderModalImageUri] = useState<string | null>(null);
  const [founderModalUploadingImage, setFounderModalUploadingImage] = useState(false);

  // ── Edit founder post modal (admin)
  const [editingPost, setEditingPost] = useState<FounderPost | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<MembersCategory>('general');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ── Report a Bug state
  const [bugDescription, setBugDescription] = useState('');
  const [bugSteps, setBugSteps] = useState('');
  const [bugSubmitting, setBugSubmitting] = useState(false);
  const [bugSuccess, setBugSuccess] = useState(false);
  const [bugImageUri, setBugImageUri] = useState<string | null>(null);
  const [bugImageUploading, setBugImageUploading] = useState(false);

  // ── People state
  const [following, setFollowing] = useState<SearchUser[]>([]);
  const [followers, setFollowers] = useState<SearchUser[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleRefreshing, setPeopleRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Colors
  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const dividerColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const inputBg = isDark ? '#1E2035' : colors.card;

  // ─── Init current user ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
        supabase
          .from('users')
          .select('is_admin')
          .eq('id', data.user.id)
          .single()
          .then(({ data: userData }) => {
            setIsAdmin(userData?.is_admin === true);
          });
      }
    });
  }, []);

  // ─── Load feed ──────────────────────────────────────────────────────────────
  const loadFeed = useCallback(async (isRefresh = false) => {
    console.log('[Community] loadFeed — isRefresh:', isRefresh);
    if (isRefresh) {
      setFeedRefreshing(true);
      setFeedOffset(0);
      setFeedHasMore(true);
    } else {
      setFeedLoading(true);
    }
    try {
      const posts = await fetchFeed('discover', FEED_PAGE_SIZE, 0);
      setFeedPosts(posts);
      setFeedOffset(posts.length);
      setFeedHasMore(posts.length === FEED_PAGE_SIZE);
      console.log('[Community] loadFeed — loaded', posts.length, 'posts');
    } catch (e) {
      console.error('[Community] loadFeed error:', e);
    } finally {
      setFeedLoading(false);
      setFeedRefreshing(false);
    }
  }, []);

  const loadMoreFeed = useCallback(async () => {
    if (feedLoadingMore || !feedHasMore) return;
    console.log('[Community] loadMoreFeed — offset:', feedOffset);
    setFeedLoadingMore(true);
    try {
      const posts = await fetchFeed('discover', FEED_PAGE_SIZE, feedOffset);
      setFeedPosts((prev) => [...prev, ...posts]);
      setFeedOffset((prev) => prev + posts.length);
      setFeedHasMore(posts.length === FEED_PAGE_SIZE);
    } catch (e) {
      console.error('[Community] loadMoreFeed error:', e);
    } finally {
      setFeedLoadingMore(false);
    }
  }, [feedLoadingMore, feedHasMore, feedOffset]);

  // ─── Handle like ────────────────────────────────────────────────────────────
  const handleLike = useCallback(async (postId: string) => {
    console.log('[Community] handleLike — post_id:', postId);
    setFeedPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const liked = !p.liked_by_me;
        return {
          ...p,
          liked_by_me: liked,
          likes_count: liked ? p.likes_count + 1 : Math.max(0, p.likes_count - 1),
        };
      }),
    );
    try {
      await toggleLike(postId);
    } catch (e) {
      console.error('[Community] handleLike error — reverting:', e);
      setFeedPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const liked = !p.liked_by_me;
          return {
            ...p,
            liked_by_me: liked,
            likes_count: liked ? p.likes_count + 1 : Math.max(0, p.likes_count - 1),
          };
        }),
      );
    }
  }, []);

  // ─── Helper: fetch usernames for a list of user IDs ────────────────────────
  const fetchUsernames = useCallback(async (userIds: string[]): Promise<Record<string, { username: string; avatar_url: string | null }>> => {
    if (userIds.length === 0) return {};
    const { data } = await supabase
      .from('users')
      .select('id, username, avatar_url')
      .in('id', userIds);
    const map: Record<string, { username: string; avatar_url: string | null }> = {};
    for (const u of data ?? []) {
      map[u.id] = { username: u.username ?? 'Member', avatar_url: u.avatar_url ?? null };
    }
    return map;
  }, []);

  // ─── Load founder posts ──────────────────────────────────────────────────────
  const loadFounderPosts = useCallback(async (
    category: MembersCategory | 'all' = activeCategory,
    isRefresh = false,
  ) => {
    console.log('[Members] loadFounderPosts — category:', category, 'isRefresh:', isRefresh);
    if (isRefresh) setMembersRefreshing(true);
    else setMembersLoading(true);
    try {
      let query = supabase
        .from('founder_posts')
        .select('*, founder_post_reactions(count)')
        .order('created_at', { ascending: false })
        .limit(30);

      // Always filter by the selected category (no 'all' option in pills)
      query = query.eq('category', category);

      const { data, error } = await query;

      if (error) {
        console.error('[Members] loadFounderPosts error:', error);
        return;
      }

      const postIds = (data ?? []).map((p: Record<string, unknown>) => p.id as string);

      const { data: allCommentRows } = await supabase
        .from('founder_post_comments')
        .select('id, content, created_at, author_id, post_id')
        .in('post_id', postIds.length > 0 ? postIds : ['__none__'])
        .order('created_at', { ascending: true });

      const authorIds = [...new Set((allCommentRows ?? []).map((c: Record<string, unknown>) => c.author_id as string))];
      const usernameMap = await fetchUsernames(authorIds);

      const commentsByPost: Record<string, FounderComment[]> = {};
      for (const c of allCommentRows ?? []) {
        const row = c as Record<string, unknown>;
        const pid = row.post_id as string;
        if (!commentsByPost[pid]) commentsByPost[pid] = [];
        const authorInfo = usernameMap[row.author_id as string];
        commentsByPost[pid].push({
          id: row.id as string,
          post_id: pid,
          author_id: row.author_id as string,
          content: row.content as string,
          created_at: row.created_at as string,
          author_username: authorInfo?.username ?? 'Member',
          author_avatar: authorInfo?.avatar_url ?? null,
        });
      }

      // Batch-fetch author usernames for all posts (needed for bug report cards)
      const postAuthorIds = [...new Set((data ?? []).map((p: Record<string, unknown>) => p.author_id as string))];
      const postAuthorMap = await fetchUsernames(postAuthorIds);

      const posts: FounderPost[] = await Promise.all(
        (data ?? []).map(async (post: Record<string, unknown>) => {
          let userReaction: string | null = null;
          if (currentUserId) {
            const { data: myReaction } = await supabase
              .from('founder_post_reactions')
              .select('emoji')
              .eq('post_id', post.id as string)
              .eq('user_id', currentUserId)
              .maybeSingle();
            userReaction = myReaction?.emoji ?? null;
          }

          const reactionsArr = post.founder_post_reactions as { count: number }[] | undefined;
          const comments = commentsByPost[post.id as string] ?? [];
          const authorInfo = postAuthorMap[post.author_id as string];

          return {
            id: post.id as string,
            author_id: post.author_id as string,
            content: post.content as string,
            category: (post.category as MembersCategory) ?? 'general',
            created_at: post.created_at as string,
            reaction_count: reactionsArr?.[0]?.count ?? 0,
            comment_count: comments.length,
            user_reaction: userReaction,
            comments,
            commentsLoaded: true,
            image_url: post.image_url as string | undefined,
            author_username: authorInfo?.username,
          };
        }),
      );

      setFounderPosts(posts);
      console.log('[Members] loadFounderPosts — loaded', posts.length, 'posts');
    } catch (e) {
      console.error('[Members] loadFounderPosts exception:', e);
    } finally {
      setMembersLoading(false);
      setMembersRefreshing(false);
    }
  }, [activeCategory, currentUserId, fetchUsernames]);

  // ─── Reload post comments ────────────────────────────────────────────────────
  const reloadPostComments = useCallback(async (postId: string) => {
    console.log('[Members] reloadPostComments — postId:', postId);
    try {
      const { data, error } = await supabase
        .from('founder_post_comments')
        .select('id, content, created_at, author_id, post_id')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) return;

      const rows = (data ?? []) as Record<string, unknown>[];
      const authorIds = [...new Set(rows.map((c) => c.author_id as string))];
      const usernameMap = await fetchUsernames(authorIds);

      const comments: FounderComment[] = rows.map((c) => {
        const authorInfo = usernameMap[c.author_id as string];
        return {
          id: c.id as string,
          post_id: postId,
          author_id: c.author_id as string,
          content: c.content as string,
          created_at: c.created_at as string,
          author_username: authorInfo?.username ?? 'Member',
          author_avatar: authorInfo?.avatar_url ?? null,
        };
      });

      setFounderPosts((prev) =>
        prev.map((p) => p.id === postId ? { ...p, comments, comment_count: comments.length } : p),
      );
    } catch (e) {
      console.error('[Members] reloadPostComments error:', e);
    }
  }, [fetchUsernames]);

  // ─── Handle react ────────────────────────────────────────────────────────────
  const handleReact = useCallback(async (postId: string, emoji: string) => {
    if (!currentUserId) return;
    console.log('[Members] handleReact — postId:', postId, 'emoji:', emoji);

    const post = founderPosts.find((p) => p.id === postId);
    if (!post) return;

    const isSameReaction = post.user_reaction === emoji;

    setFounderPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const prevCount = p.reaction_count ?? 0;
        return {
          ...p,
          user_reaction: isSameReaction ? null : emoji,
          reaction_count: isSameReaction
            ? Math.max(0, prevCount - 1)
            : p.user_reaction
            ? prevCount
            : prevCount + 1,
        };
      }),
    );

    try {
      if (isSameReaction) {
        await supabase
          .from('founder_post_reactions')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', currentUserId);
      } else {
        if (post.user_reaction) {
          await supabase
            .from('founder_post_reactions')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', currentUserId);
        }
        await supabase.from('founder_post_reactions').insert({
          post_id: postId,
          user_id: currentUserId,
          emoji,
        });
      }
    } catch (e) {
      console.error('[Members] handleReact error:', e);
      loadFounderPosts(activeCategory, false);
    }
  }, [currentUserId, founderPosts, activeCategory, loadFounderPosts]);

  // ─── Handle submit comment ──────────────────────────────────────────────────
  const handleSubmitComment = useCallback(async (postId: string) => {
    const text = (commentInputs[postId] ?? '').trim();
    if (!text || !currentUserId) return;
    console.log('[Members] handleSubmitComment — postId:', postId, 'text length:', text.length);

    setSubmittingComment(postId);
    try {
      const { error } = await supabase.from('founder_post_comments').insert({
        post_id: postId,
        author_id: currentUserId,
        content: text,
      });

      if (error) {
        console.error('[Members] handleSubmitComment error:', error);
        return;
      }

      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
      await reloadPostComments(postId);
    } catch (e) {
      console.error('[Members] handleSubmitComment exception:', e);
    } finally {
      setSubmittingComment(null);
    }
  }, [commentInputs, currentUserId, reloadPostComments]);

  // ─── Handle delete comment ───────────────────────────────────────────────────
  const handleDeleteComment = useCallback(async (commentId: string, postId: string) => {
    console.log('[Members] handleDeleteComment — commentId:', commentId, 'postId:', postId);
    try {
      const { error } = await supabase
        .from('founder_post_comments')
        .delete()
        .eq('id', commentId);
      if (error) {
        console.error('[Members] handleDeleteComment error:', error);
        return;
      }
      await reloadPostComments(postId);
    } catch (e) {
      console.error('[Members] handleDeleteComment exception:', e);
    }
  }, [reloadPostComments]);

  // ─── Handle save edit comment ────────────────────────────────────────────────
  const handleSaveEditComment = useCallback(async (commentId: string, postId: string) => {
    const text = editingCommentText.trim();
    if (!text) return;
    console.log('[Members] handleSaveEditComment — commentId:', commentId, 'postId:', postId);
    try {
      const { error } = await supabase
        .from('founder_post_comments')
        .update({ content: text })
        .eq('id', commentId);
      if (error) {
        console.error('[Members] handleSaveEditComment error:', error);
        return;
      }
      setEditingCommentId(null);
      setEditingCommentText('');
      await reloadPostComments(postId);
    } catch (e) {
      console.error('[Members] handleSaveEditComment exception:', e);
    }
  }, [editingCommentText, reloadPostComments]);

  // ─── Handle feed post more options ──────────────────────────────────────────
  const handleFeedPostMoreOptions = useCallback((postId: string, authorId: string) => {
    console.log('[Community] handleFeedPostMoreOptions — postId:', postId, 'authorId:', authorId);
    if (authorId !== currentUserId) return;
    Alert.alert('Post Options', undefined, [
      {
        text: 'Delete post',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete post', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                console.log('[Community] Deleting feed post — postId:', postId);
                try {
                  await supabase.from('social_posts').delete().eq('id', postId).eq('user_id', currentUserId!);
                  setFeedPosts((prev) => prev.filter((p) => p.id !== postId));
                } catch (e) {
                  console.error('[Community] delete feed post error:', e);
                }
              },
            },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [currentUserId]);

  // ─── Handle founder post more options ───────────────────────────────────────
  const handleFounderPostMoreOptions = useCallback((post: FounderPost) => {
    console.log('[Members] handleFounderPostMoreOptions — postId:', post.id);
    Alert.alert('Post Options', undefined, [
      {
        text: 'Edit post',
        onPress: () => {
          console.log('[Members] Edit post pressed — postId:', post.id);
          setEditingPost(post);
          setEditContent(post.content);
          const cat: MembersCategory = (post.category === 'report_bug' || post.category === 'all') ? 'general' : post.category as MembersCategory;
          setEditCategory(cat);
        },
      },
      {
        text: 'Delete post',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete post', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                console.log('[Members] Deleting founder post — postId:', post.id);
                try {
                  await supabase.from('founder_posts').delete().eq('id', post.id);
                  setFounderPosts((prev) => prev.filter((p) => p.id !== post.id));
                } catch (e) {
                  console.error('[Members] delete founder post error:', e);
                }
              },
            },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  // ─── Handle save edit founder post ──────────────────────────────────────────
  const handleSaveEdit = useCallback(async () => {
    if (!editingPost || !editContent.trim()) return;
    console.log('[Members] handleSaveEdit — postId:', editingPost.id);
    setEditSubmitting(true);
    try {
      const { error } = await supabase
        .from('founder_posts')
        .update({ content: editContent.trim(), category: editCategory })
        .eq('id', editingPost.id);
      if (error) {
        console.error('[Members] edit error:', error);
        return;
      }
      setFounderPosts((prev) =>
        prev.map((p) => p.id === editingPost.id ? { ...p, content: editContent.trim(), category: editCategory } : p),
      );
      setEditingPost(null);
    } catch (e) {
      console.error('[Members] handleSaveEdit exception:', e);
    } finally {
      setEditSubmitting(false);
    }
  }, [editingPost, editContent, editCategory]);

  // ─── Upload image for founder modal ─────────────────────────────────────────
  const uploadFounderImage = useCallback(async (uri: string): Promise<string | null> => {
    console.log('[Members] uploadFounderImage — uri:', uri);
    setFounderModalUploadingImage(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `founder/${currentUserId ?? 'admin'}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('social-images')
        .upload(path, blob, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
      if (uploadError) {
        console.error('[Members] uploadFounderImage error:', uploadError.message);
        return null;
      }
      const { data: urlData } = supabase.storage.from('social-images').getPublicUrl(path);
      const publicUrl = urlData?.publicUrl ?? null;
      console.log('[Members] uploadFounderImage — public URL:', publicUrl);
      return publicUrl;
    } catch (e) {
      console.error('[Members] uploadFounderImage exception:', e);
      return null;
    } finally {
      setFounderModalUploadingImage(false);
    }
  }, [currentUserId]);

  // ─── Handle pick image for founder modal ────────────────────────────────────
  const handleFounderPickImage = useCallback(async () => {
    console.log('[Members] Founder modal image picker pressed');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        console.log('[Members] Founder modal image selected — uri:', uri);
        setFounderModalImageUri(uri);
      }
    } catch (e) {
      console.error('[Members] Founder modal image picker error:', e);
    }
  }, []);

  // ─── Handle create founder post ─────────────────────────────────────────────
  const handleCreateFounderPost = useCallback(async () => {
    if (!founderModalContent.trim() || !currentUserId) return;
    console.log('[Members] handleCreateFounderPost — category:', founderModalCategory);
    setFounderModalSubmitting(true);
    setFounderModalError(null);
    try {
      let imageUrl: string | null = null;
      if (founderModalImageUri) {
        imageUrl = await uploadFounderImage(founderModalImageUri);
      }

      const payload: Record<string, unknown> = {
        content: founderModalContent.trim(),
        category: founderModalCategory,
        author_id: currentUserId,
      };
      if (imageUrl) payload.image_url = imageUrl;

      const { error } = await supabase.from('founder_posts').insert(payload);
      if (error) {
        setFounderModalError(error.message);
        return;
      }
      setFounderModalContent('');
      setFounderModalCategory('general');
      setFounderModalImageUri(null);
      setShowFounderModal(false);
      loadFounderPosts(activeCategory, true);
    } catch (e: unknown) {
      setFounderModalError(e instanceof Error ? e.message : 'Failed to post.');
    } finally {
      setFounderModalSubmitting(false);
    }
  }, [founderModalContent, founderModalCategory, founderModalImageUri, currentUserId, activeCategory, loadFounderPosts, uploadFounderImage]);

  // ─── Handle submit bug report ────────────────────────────────────────────────
  const handleSubmitBugReport = useCallback(async () => {
    const desc = bugDescription.trim();
    if (!desc || !currentUserId) return;
    console.log('[Community] handleSubmitBugReport — description length:', desc.length, 'steps length:', bugSteps.trim().length, 'hasImage:', !!bugImageUri);
    setBugSubmitting(true);
    try {
      const content = bugSteps.trim()
        ? `${desc}\n\nSteps to reproduce:\n${bugSteps.trim()}`
        : desc;

      let imageUrl: string | undefined;
      if (bugImageUri) {
        console.log('[Community] handleSubmitBugReport — uploading screenshot');
        setBugImageUploading(true);
        try {
          const ext = bugImageUri.split('.').pop() ?? 'jpg';
          const path = `bug-reports/${currentUserId}-${Date.now()}.${ext}`;
          const response = await fetch(bugImageUri);
          const blob = await response.blob();
          const { error: uploadError } = await supabase.storage
            .from('social-images')
            .upload(path, blob, { contentType: `image/${ext}` });
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('social-images').getPublicUrl(path);
            imageUrl = urlData.publicUrl;
            console.log('[Community] handleSubmitBugReport — screenshot uploaded:', imageUrl);
          } else {
            console.error('[Community] handleSubmitBugReport — screenshot upload error:', uploadError.message);
          }
        } finally {
          setBugImageUploading(false);
        }
      }

      const payload: Record<string, unknown> = {
        content,
        category: 'report_bug',
        author_id: currentUserId,
      };
      if (imageUrl) payload.image_url = imageUrl;

      const { error } = await supabase.from('founder_posts').insert(payload);
      if (error) {
        console.error('[Community] handleSubmitBugReport error:', error);
        return;
      }
      console.log('[Community] Bug report submitted successfully');
      setBugDescription('');
      setBugSteps('');
      setBugImageUri(null);
      setBugSuccess(true);
      setTimeout(() => setBugSuccess(false), 5000);
    } catch (e) {
      console.error('[Community] handleSubmitBugReport exception:', e);
    } finally {
      setBugSubmitting(false);
    }
  }, [bugDescription, bugSteps, bugImageUri, currentUserId]);

  // ─── Load people ─────────────────────────────────────────────────────────────
  const loadPeople = useCallback(async (isRefresh = false) => {
    console.log('[Community] loadPeople — isRefresh:', isRefresh);
    if (isRefresh) setPeopleRefreshing(true);
    else setPeopleLoading(true);
    try {
      const [followingData, followersData] = await Promise.all([
        fetchFollowing(),
        fetchFollowers(),
      ]);
      setFollowing(followingData);
      setFollowers(followersData);
      console.log('[Community] loadPeople — following:', followingData.length, 'followers:', followersData.length);
    } catch (e) {
      console.error('[Community] loadPeople error:', e);
    } finally {
      setPeopleLoading(false);
      setPeopleRefreshing(false);
    }
  }, []);

  // ─── Search ──────────────────────────────────────────────────────────────────
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      console.log('[Community] searchUsers — query:', text);
      setSearchLoading(true);
      try {
        const results = await searchUsers(text.trim());
        setSearchResults(results);
        console.log('[Community] searchUsers — found', results.length, 'users');
      } catch (e) {
        console.error('[Community] searchUsers error:', e);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  }, []);

  // ─── Tab switch ──────────────────────────────────────────────────────────────
  const handleMainTabSwitch = useCallback((tab: MainTab) => {
    console.log('[Community] Main tab switched to:', tab);
    setMainTab(tab);
    if (tab === 'feed' && feedPosts.length === 0) {
      loadFeed();
    }
    if (tab === 'people' && following.length === 0 && followers.length === 0) {
      loadPeople();
    }
  }, [feedPosts.length, following.length, followers.length, loadFeed, loadPeople]);

  const handleFeedToggle = useCallback((toggle: FeedToggle) => {
    console.log('[Community] Feed toggle switched to:', toggle);
    setFeedToggle(toggle);
    if (toggle === 'everyone' && feedPosts.length === 0) {
      loadFeed();
    }
    if (toggle === 'members' && founderPosts.length === 0 && isPremium) {
      loadFounderPosts(activeCategory, false);
    }
    // report_bug: no founder posts load needed
  }, [feedPosts.length, founderPosts.length, isPremium, activeCategory, loadFeed, loadFounderPosts]);

  const handleCategorySwitch = useCallback((cat: MembersCategory) => {
    console.log('[Members] Category switched to:', cat);
    setActiveCategory(cat);
    setFounderPosts([]);
    loadFounderPosts(cat, false);
  }, [loadFounderPosts]);

  // ─── Initial load ────────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFeed(); }, []);

  // ─── Render: Main tab bar ────────────────────────────────────────────────────
  const renderTabBar = () => (
    <View style={[styles.tabBar, { borderBottomColor: dividerColor }]}>
      {(['feed', 'people'] as MainTab[]).map((tab) => {
        const isActive = mainTab === tab;
        const label = tab === 'feed' ? 'Feed' : 'People';
        return (
          <Pressable
            key={tab}
            onPress={() => handleMainTabSwitch(tab)}
            style={styles.tabBarItem}
            accessibilityRole="tab"
          >
            <Text style={[styles.tabBarLabel, { color: isActive ? colors.primary : subColor }]}>
              {label}
            </Text>
            {isActive && <View style={[styles.tabBarUnderline, { backgroundColor: colors.primary }]} />}
          </Pressable>
        );
      })}
    </View>
  );

  // ─── Render: Feed toggle (3 options) ────────────────────────────────────────
  const renderFeedToggle = () => (
    <View style={[styles.feedToggleRow, { borderBottomColor: dividerColor }]}>
      {(['everyone', 'members', 'report_bug'] as FeedToggle[]).map((toggle) => {
        const isActive = feedToggle === toggle;
        const label = toggle === 'everyone' ? 'Everyone' : toggle === 'members' ? 'Members' : 'Report a Bug';
        return (
          <Pressable
            key={toggle}
            onPress={() => handleFeedToggle(toggle)}
            style={[styles.feedToggleBtn, isActive && { backgroundColor: colors.primary + '18' }]}
            accessibilityRole="button"
          >
            {toggle === 'members' && (
              <Crown size={13} color={isActive ? colors.primary : subColor} />
            )}
            <Text style={[styles.feedToggleBtnText, { color: isActive ? colors.primary : subColor, fontWeight: isActive ? '700' : '500' }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  // ─── Render: Feed tab ────────────────────────────────────────────────────────
  const renderFeedTab = () => {
    if (feedToggle === 'everyone') return renderEveryoneFeed();
    if (feedToggle === 'report_bug') return renderReportBugTab();
    return renderMembersSection();
  };

  const renderEveryoneFeed = () => {
    if (feedLoading) {
      return (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    return (
      <FlatList
        data={feedPosts}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <SocialPostCard
            post={item}
            isDark={isDark}
            onLike={handleLike}
            onMoreOptions={handleFeedPostMoreOptions}
            index={index}
          />
        )}
        contentContainerStyle={[
          styles.feedList,
          feedPosts.length === 0 && styles.feedListEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={feedRefreshing}
            onRefresh={() => {
              console.log('[Community] Feed pull-to-refresh');
              loadFeed(true);
            }}
            tintColor={colors.primary}
          />
        }
        onEndReached={loadMoreFeed}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          feedLoadingMore ? (
            <View style={styles.loadMoreIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}>
              <MessageSquare size={32} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: textColor }]}>No posts yet</Text>
            <Text style={[styles.emptySubtitle, { color: subColor }]}>
              Be the first to share something with the community.
            </Text>
          </View>
        }
      />
    );
  };

  // ─── Render: Report a Bug tab ────────────────────────────────────────────────
  const renderReportBugTab = () => {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={bugStyles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[bugStyles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[bugStyles.title, { color: textColor }]}>Report a Bug</Text>
            <Text style={[bugStyles.subtitle, { color: subColor }]}>
              Found something broken? Let us know and we'll fix it.
            </Text>

            {bugSuccess ? (
              <View style={[bugStyles.successBox, { backgroundColor: colors.success + '18' }]}>
                <Text style={[bugStyles.successText, { color: colors.success }]}>
                  Thanks! We'll look into it.
                </Text>
              </View>
            ) : null}

            <Text style={[bugStyles.label, { color: subColor }]}>Bug description *</Text>
            <TextInput
              style={[bugStyles.input, { backgroundColor: inputBg, borderColor, color: textColor }]}
              placeholder="Describe what went wrong..."
              placeholderTextColor={subColor}
              value={bugDescription}
              onChangeText={(text) => {
                setBugDescription(text);
                if (bugSuccess) setBugSuccess(false);
              }}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Text style={[bugStyles.label, { color: subColor }]}>Steps to reproduce (optional)</Text>
            <TextInput
              style={[bugStyles.input, { backgroundColor: inputBg, borderColor, color: textColor }]}
              placeholder="1. Go to...\n2. Tap on...\n3. See error"
              placeholderTextColor={subColor}
              value={bugSteps}
              onChangeText={setBugSteps}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Screenshot attachment */}
            {bugImageUri ? (
              <View style={bugStyles.screenshotPreviewRow}>
                <Image
                  source={{ uri: bugImageUri }}
                  style={bugStyles.screenshotThumb}
                  resizeMode="cover"
                />
                <Pressable
                  style={bugStyles.screenshotRemoveBtn}
                  onPress={() => {
                    console.log('[Community] Bug report screenshot removed');
                    setBugImageUri(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove screenshot"
                >
                  <X size={12} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[bugStyles.attachBtn, { borderColor: colors.primary }]}
                onPress={async () => {
                  console.log('[Community] Attach screenshot button pressed');
                  try {
                    const result = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ImagePicker.MediaTypeOptions.Images,
                      quality: 0.7,
                    });
                    if (!result.canceled && result.assets.length > 0) {
                      const uri = result.assets[0].uri;
                      console.log('[Community] Bug report screenshot selected — uri:', uri);
                      setBugImageUri(uri);
                    }
                  } catch (e) {
                    console.error('[Community] Bug report image picker error:', e);
                  }
                }}
                accessibilityRole="button"
              >
                <Text style={[bugStyles.attachBtnText, { color: colors.primary }]}>
                  Attach Screenshot (optional)
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[
                bugStyles.submitBtn,
                { opacity: bugSubmitting || bugImageUploading || !bugDescription.trim() ? 0.6 : 1 },
              ]}
              onPress={() => {
                console.log('[Community] Submit bug report button pressed');
                handleSubmitBugReport();
              }}
              disabled={bugSubmitting || bugImageUploading || !bugDescription.trim()}
              accessibilityRole="button"
            >
              {bugSubmitting || bugImageUploading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={bugStyles.submitBtnText}>Submit Report</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  // ─── Render: Members section ─────────────────────────────────────────────────
  const renderMembersSection = () => {
    if (!isPremium) {
      return (
        <View style={styles.premiumGate}>
          <View style={[styles.premiumGateIconWrap, { backgroundColor: '#F59E0B18' }]}>
            <Crown size={44} color="#F59E0B" />
          </View>
          <Text style={[styles.premiumGateTitle, { color: textColor }]}>Members Club</Text>
          <Text style={[styles.premiumGateSubtitle, { color: subColor }]}>
            Connect directly with the founder, get early access to features, and join the inner circle of premium members.
          </Text>
          <Pressable
            style={styles.premiumGateBtn}
            onPress={() => {
              console.log('[Members] Upgrade button pressed');
              router.push('/subscription');
            }}
            accessibilityRole="button"
          >
            <Text style={styles.premiumGateBtnText}>Upgrade to Premium</Text>
          </Pressable>
        </View>
      );
    }

    const renderFounderPostItem = ({ item }: { item: FounderPost }) => {
      // ── Bug report card (admin view) ──────────────────────────────────────
      if (item.category === 'report_bug') {
        const bugTimestamp = timeAgo(item.created_at);
        const reporterName = item.author_username ?? 'Member';
        return (
          <View style={[membersStyles.postCard, { backgroundColor: cardBg, borderColor }]}>
            {/* Header */}
            <View style={membersStyles.postHeader}>
              <View style={[membersStyles.founderAvatarWrap, { backgroundColor: '#EF444418' }]}>
                <IconSymbol ios_icon_name="ant.fill" android_material_icon_name="bug_report" size={18} color="#EF4444" />
              </View>
              <View style={membersStyles.postHeaderInfo}>
                <View style={membersStyles.postFounderRow}>
                  <Text style={[membersStyles.postFounderLabel, { color: '#EF4444' }]}>Bug Report</Text>
                  <Text style={[membersStyles.categoryBadgeText, { color: subColor }]}>{reporterName}</Text>
                </View>
                <Text style={[membersStyles.postTimestamp, { color: subColor }]}>{bugTimestamp}</Text>
              </View>
            </View>

            {/* Content */}
            <Text style={[membersStyles.postContent, { color: textColor }]}>{item.content}</Text>

            {/* Screenshot (if present) */}
            {item.image_url ? (
              <Image
                source={{ uri: item.image_url }}
                style={[membersStyles.postImage, { marginHorizontal: 12, marginBottom: 8 }]}
                resizeMode="cover"
              />
            ) : null}

            {/* Mark Resolved button */}
            <View style={[membersStyles.bugResolveRow, { borderTopColor: dividerColor }]}>
              <Pressable
                style={membersStyles.bugResolveBtn}
                onPress={async () => {
                  console.log('[Members] Mark Resolved pressed — postId:', item.id);
                  try {
                    const { error } = await supabase
                      .from('founder_posts')
                      .delete()
                      .eq('id', item.id);
                    if (error) {
                      console.error('[Members] Mark Resolved error:', error);
                      return;
                    }
                    setFounderPosts((prev) => prev.filter((p) => p.id !== item.id));
                    console.log('[Members] Bug report resolved — postId:', item.id);
                  } catch (e) {
                    console.error('[Members] Mark Resolved exception:', e);
                  }
                }}
                accessibilityRole="button"
              >
                <Text style={membersStyles.bugResolveBtnText}>✓ Mark Resolved</Text>
              </Pressable>
            </View>
          </View>
        );
      }

      // ── Normal founder post card ──────────────────────────────────────────
      const reactionCount = item.reaction_count ?? 0;
      const postTimestamp = timeAgo(item.created_at);
      const commentInputValue = commentInputs[item.id] ?? '';
      const categoryLabel = item.category in CATEGORY_LABELS
        ? CATEGORY_LABELS[item.category as MembersCategory]
        : 'General';

      return (
        <View style={[membersStyles.postCard, { backgroundColor: cardBg, borderColor }]}>
          {/* Header */}
          <View style={membersStyles.postHeader}>
            <View style={[membersStyles.founderAvatarWrap, { backgroundColor: '#F59E0B28' }]}>
              <Crown size={16} color="#F59E0B" />
            </View>
            <View style={membersStyles.postHeaderInfo}>
              <View style={membersStyles.postFounderRow}>
                <Text style={membersStyles.postFounderLabel}>Founder</Text>
                <View style={[membersStyles.categoryBadge, { backgroundColor: colors.primary + '18' }]}>
                  <Text style={[membersStyles.categoryBadgeText, { color: colors.primary }]}>
                    {categoryLabel}
                  </Text>
                </View>
              </View>
              <Text style={[membersStyles.postTimestamp, { color: subColor }]}>{postTimestamp}</Text>
            </View>
            {isAdmin && (
              <Pressable
                style={membersStyles.moreBtn}
                onPress={() => {
                  console.log('[Members] More options pressed — postId:', item.id);
                  handleFounderPostMoreOptions(item);
                }}
                accessibilityRole="button"
                accessibilityLabel="Post options"
                hitSlop={8}
              >
                <MoreHorizontal size={20} color={subColor} />
              </Pressable>
            )}
          </View>

          {/* Content */}
          <Text style={[membersStyles.postContent, { color: textColor }]}>{item.content}</Text>

          {/* Image (if present) */}
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={membersStyles.postImage}
              resizeMode="cover"
            />
          ) : null}

          {/* Reaction bar */}
          <View style={[membersStyles.reactionBar, { borderTopColor: dividerColor }]}>
            {REACTION_ICONS.map(({ key, Icon }) => {
              const isActive = item.user_reaction === key;
              return (
                <Pressable
                  key={key}
                  style={[
                    membersStyles.reactionBtn,
                    isActive && { backgroundColor: colors.primary + '18' },
                  ]}
                  onPress={() => {
                    console.log('[Members] Reaction pressed — postId:', item.id, 'emoji:', key);
                    handleReact(item.id, key);
                  }}
                  accessibilityRole="button"
                >
                  <Icon size={18} color={isActive ? colors.primary : subColor} />
                </Pressable>
              );
            })}
            <View style={{ flex: 1 }} />
            {reactionCount > 0 && (
              <Text style={[membersStyles.reactionCountText, { color: subColor }]}>
                {reactionCount}
                {' '}
                {reactionCount === 1 ? 'reaction' : 'reactions'}
              </Text>
            )}
          </View>

          {/* Inline comments */}
          <View style={[membersStyles.commentsSection, { borderTopColor: dividerColor }]}>
            {item.comments.map((comment) => {
              const commentTime = timeAgo(comment.created_at);
              const isEditing = editingCommentId === comment.id;
              const isOwn = comment.author_id === currentUserId;

              return (
                <View key={comment.id} style={membersStyles.commentRow}>
                  <Avatar username={comment.author_username} size={28} avatarUrl={comment.author_avatar} />
                  <View style={membersStyles.commentBubble}>
                    <View style={membersStyles.commentMeta}>
                      <Text style={[membersStyles.commentAuthor, { color: textColor }]}>
                        {comment.author_username}
                      </Text>
                      <Text style={[membersStyles.commentTime, { color: subColor }]}>{commentTime}</Text>
                    </View>
                    {isEditing ? (
                      <View style={membersStyles.commentEditRow}>
                        <TextInput
                          style={[membersStyles.commentEditInput, { color: textColor, backgroundColor: inputBg, borderColor }]}
                          value={editingCommentText}
                          onChangeText={setEditingCommentText}
                          autoFocus
                          multiline
                        />
                        <Pressable
                          style={[membersStyles.commentSaveBtn, { backgroundColor: colors.primary }]}
                          onPress={() => {
                            console.log('[Members] Save edit comment pressed — commentId:', comment.id);
                            handleSaveEditComment(comment.id, item.id);
                          }}
                          accessibilityRole="button"
                        >
                          <Text style={membersStyles.commentSaveBtnText}>Save</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={[membersStyles.commentContent, { color: textColor }]}>
                        {comment.content}
                      </Text>
                    )}
                  </View>
                  {isOwn && !isEditing && (
                    <Pressable
                      style={membersStyles.commentMoreBtn}
                      onPress={() => {
                        console.log('[Members] Comment more options pressed — commentId:', comment.id);
                        Alert.alert('Comment Options', undefined, [
                          {
                            text: 'Edit',
                            onPress: () => {
                              console.log('[Members] Edit comment pressed — commentId:', comment.id);
                              setEditingCommentId(comment.id);
                              setEditingCommentText(comment.content);
                            },
                          },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => {
                              console.log('[Members] Delete comment pressed — commentId:', comment.id);
                              handleDeleteComment(comment.id, item.id);
                            },
                          },
                          { text: 'Cancel', style: 'cancel' },
                        ]);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Comment options"
                    >
                      <MoreHorizontal size={16} color={subColor} />
                    </Pressable>
                  )}
                </View>
              );
            })}

            {item.comments.length === 0 && (
              <Text style={[membersStyles.noCommentsText, { color: subColor }]}>
                No comments yet. Be the first.
              </Text>
            )}
          </View>

          {/* Comment input */}
          <View style={[membersStyles.commentInputRow, { borderTopColor: dividerColor }]}>
            <TextInput
              style={[membersStyles.commentInput, { color: textColor, backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor }]}
              placeholder="Add a comment..."
              placeholderTextColor={subColor}
              value={commentInputValue}
              onChangeText={(text) => {
                setCommentInputs((prev) => ({ ...prev, [item.id]: text }));
              }}
              returnKeyType="send"
              onSubmitEditing={() => {
                console.log('[Members] Comment submit via keyboard — postId:', item.id);
                handleSubmitComment(item.id);
              }}
            />
            <Pressable
              style={[
                membersStyles.commentSendBtn,
                { backgroundColor: commentInputValue.trim() ? colors.primary : colors.primary + '40' },
              ]}
              onPress={() => {
                console.log('[Members] Comment send button pressed — postId:', item.id);
                handleSubmitComment(item.id);
              }}
              disabled={submittingComment === item.id || !commentInputValue.trim()}
              accessibilityRole="button"
            >
              {submittingComment === item.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ArrowUp size={15} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      );
    };

    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Category pills */}
        <View style={[membersStyles.categoryHeader, { borderBottomColor: dividerColor }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={membersStyles.categoryBar}
          >
            {(Object.keys(CATEGORY_LABELS) as MembersCategory[])
              .filter((cat) => cat !== 'all' && cat !== 'report_bug')
              .map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    style={[
                      membersStyles.categoryPill,
                      isActive
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: 'transparent', borderColor },
                    ]}
                    onPress={() => handleCategorySwitch(cat)}
                    accessibilityRole="button"
                  >
                    <Text style={[membersStyles.categoryPillText, { color: isActive ? '#fff' : subColor }]}>
                      {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                );
              })}
          </ScrollView>
        </View>

        {membersLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={founderPosts}
            keyExtractor={(item) => item.id}
            renderItem={renderFounderPostItem}
            contentContainerStyle={[
              membersStyles.postsList,
              founderPosts.length === 0 && styles.feedListEmpty,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={membersRefreshing}
                onRefresh={() => {
                  console.log('[Members] Pull-to-refresh');
                  loadFounderPosts(activeCategory, true);
                }}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}>
                  <MessageCircle size={32} color={colors.primary} />
                </View>
                <Text style={[styles.emptyTitle, { color: textColor }]}>No posts yet</Text>
                <Text style={[styles.emptySubtitle, { color: subColor }]}>
                  Check back soon for updates from the founder.
                </Text>
              </View>
            }
          />
        )}
      </KeyboardAvoidingView>
    );
  };

  // ─── Render: People tab ──────────────────────────────────────────────────────
  const renderPeopleTab = () => {
    const isSearching = searchQuery.trim().length > 0;
    const listData = isSearching ? searchResults : (peopleSection === 'following' ? following : followers);
    const isLoading = isSearching ? searchLoading : peopleLoading;

    const followingCount = following.length;
    const followersCount = followers.length;

    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Search bar */}
        <View style={[styles.searchBarWrap, { borderBottomColor: dividerColor }]}>
          <View style={[styles.searchBar, { backgroundColor: isDark ? colors.cardDark : '#F0F2F7', borderColor }]}>
            <Search size={16} color={subColor} />
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder="Search by username..."
              placeholderTextColor={subColor}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchLoading && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
        </View>

        {/* Following / Followers toggle */}
        {!isSearching && (
          <View style={[styles.peopleSectionToggle, { borderBottomColor: dividerColor }]}>
            {(['following', 'followers'] as PeopleSection[]).map((section) => {
              const isActive = peopleSection === section;
              const count = section === 'following' ? followingCount : followersCount;
              const label = section === 'following' ? 'Following' : 'Followers';
              return (
                <Pressable
                  key={section}
                  onPress={() => {
                    console.log('[Community] People section switched to:', section);
                    setPeopleSection(section);
                    if (following.length === 0 && followers.length === 0) {
                      loadPeople();
                    }
                  }}
                  style={styles.peopleSectionBtn}
                  accessibilityRole="button"
                >
                  <Text style={[styles.peopleSectionLabel, { color: isActive ? textColor : subColor, fontWeight: isActive ? '700' : '500' }]}>
                    {label}
                  </Text>
                  <Text style={[styles.peopleSectionCount, { color: isActive ? colors.primary : subColor }]}>
                    {count}
                  </Text>
                  {isActive && <View style={[styles.peopleSectionUnderline, { backgroundColor: colors.primary }]} />}
                </Pressable>
              );
            })}
          </View>
        )}

        {isLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <SearchUserRow user={item} isDark={isDark} index={index} />
            )}
            contentContainerStyle={[
              styles.peopleList,
              listData.length === 0 && styles.feedListEmpty,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              !isSearching ? (
                <RefreshControl
                  refreshing={peopleRefreshing}
                  onRefresh={() => {
                    console.log('[Community] People pull-to-refresh');
                    loadPeople(true);
                  }}
                  tintColor={colors.primary}
                />
              ) : undefined
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}>
                  {isSearching ? (
                    <Search size={32} color={colors.primary} />
                  ) : (
                    <Users size={32} color={colors.primary} />
                  )}
                </View>
                <Text style={[styles.emptyTitle, { color: textColor }]}>
                  {isSearching
                    ? 'No users found'
                    : peopleSection === 'following'
                    ? 'Not following anyone yet'
                    : 'No followers yet'}
                </Text>
                <Text style={[styles.emptySubtitle, { color: subColor }]}>
                  {isSearching
                    ? 'Try a different username'
                    : peopleSection === 'following'
                    ? 'Search for people to follow'
                    : 'Share your profile to get followers'}
                </Text>
              </View>
            }
          />
        )}
      </KeyboardAvoidingView>
    );
  };

  // ─── Root render ─────────────────────────────────────────────────────────────
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Community',
          headerShown: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: isDark ? colors.backgroundDark : colors.background },
          headerTintColor: isDark ? colors.textDark : colors.text,
          headerTitleStyle: { fontWeight: '700', fontSize: 18 },
          headerRight: isAdmin ? () => (
            <Pressable
              onPress={() => {
                console.log('[Community] Create founder post button pressed');
                setShowFounderModal(true);
              }}
              style={styles.headerCreateBtn}
              accessibilityLabel="Create founder post"
              accessibilityRole="button"
            >
              <SquarePen size={22} color={colors.primary} />
            </Pressable>
          ) : undefined,
        }}
      />

      <View style={[styles.container, { backgroundColor: bg }]}>
        {renderTabBar()}

        <View style={{ flex: 1 }}>
          {mainTab === 'feed' && (
            <>
              {renderFeedToggle()}
              {renderFeedTab()}
            </>
          )}
          {mainTab === 'people' && renderPeopleTab()}
        </View>
      </View>

      {/* FAB for regular users on Everyone feed */}
      {!isAdmin && mainTab === 'feed' && feedToggle === 'everyone' && (
        <Pressable
          style={styles.fab}
          onPress={() => {
            console.log('[Community] FAB create post pressed');
            setShowCreatePost(true);
          }}
          accessibilityLabel="Create post"
          accessibilityRole="button"
        >
          <Plus size={24} color="#fff" />
        </Pressable>
      )}

      <CreatePostSheet
        visible={showCreatePost}
        isDark={isDark}
        currentUserId={currentUserId}
        onClose={() => {
          console.log('[Community] CreatePostSheet closed');
          setShowCreatePost(false);
        }}
        onPosted={() => {
          console.log('[Community] Post created — refreshing feed');
          loadFeed(true);
        }}
      />

      {/* Founder post creation modal (admin) */}
      <Modal
        visible={showFounderModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFounderModal(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowFounderModal(false)} />
          <View style={[styles.modalSheet, { backgroundColor: isDark ? colors.backgroundDark : '#fff' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>New Post</Text>
              <Pressable
                onPress={() => {
                  console.log('[Community] Founder modal closed');
                  setShowFounderModal(false);
                }}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
              >
                <X size={22} color={subColor} />
              </Pressable>
            </View>

            <Text style={[styles.modalSectionLabel, { color: subColor }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalCategoryRow}>
              {FOUNDER_POST_CATEGORIES.map((opt) => {
                const isActive = founderModalCategory === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.modalCategoryPill,
                      isActive
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: 'transparent', borderColor },
                    ]}
                    onPress={() => {
                      console.log('[Community] Founder modal category selected:', opt.value);
                      setFounderModalCategory(opt.value);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.modalCategoryPillText, { color: isActive ? '#fff' : subColor }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.modalSectionLabel, { color: subColor }]}>Content</Text>
            <TextInput
              style={[styles.modalTextInput, { backgroundColor: inputBg, borderColor, color: textColor }]}
              placeholder="Share something with your members..."
              placeholderTextColor={subColor}
              value={founderModalContent}
              onChangeText={setFounderModalContent}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={1000}
            />

            {/* Image attachment */}
            <View style={styles.modalImageRow}>
              <Pressable
                style={[styles.modalImagePickerBtn, { borderColor }]}
                onPress={() => {
                  console.log('[Community] Founder modal image picker pressed');
                  handleFounderPickImage();
                }}
                accessibilityRole="button"
              >
                <Camera size={18} color={subColor} />
                <Text style={[styles.modalImagePickerText, { color: subColor }]}>
                  {founderModalImageUri ? 'Change image' : 'Add image'}
                </Text>
              </Pressable>
              {founderModalImageUri && (
                <View style={styles.modalImagePreviewWrap}>
                  <Image
                    source={{ uri: founderModalImageUri }}
                    style={styles.modalImagePreview}
                    resizeMode="cover"
                  />
                  <Pressable
                    style={styles.modalImageRemoveBtn}
                    onPress={() => {
                      console.log('[Community] Founder modal image removed');
                      setFounderModalImageUri(null);
                    }}
                    accessibilityRole="button"
                  >
                    <X size={12} color="#fff" />
                  </Pressable>
                </View>
              )}
            </View>

            {founderModalError ? (
              <Text style={styles.modalError}>{founderModalError}</Text>
            ) : null}

            <Pressable
              style={[styles.modalPublishBtn, { opacity: founderModalSubmitting || founderModalUploadingImage || !founderModalContent.trim() ? 0.6 : 1 }]}
              onPress={() => {
                console.log('[Community] Publish founder post pressed');
                handleCreateFounderPost();
              }}
              disabled={founderModalSubmitting || founderModalUploadingImage || !founderModalContent.trim()}
              accessibilityRole="button"
            >
              {founderModalSubmitting || founderModalUploadingImage ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalPublishBtnText}>Publish</Text>
              )}
            </Pressable>
            <View style={{ height: 20 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit founder post modal (admin) */}
      <Modal
        visible={!!editingPost}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingPost(null)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditingPost(null)} />
          <View style={[styles.modalSheet, { backgroundColor: isDark ? colors.backgroundDark : '#fff' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>Edit Post</Text>
              <Pressable
                onPress={() => {
                  console.log('[Community] Edit modal closed');
                  setEditingPost(null);
                }}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
              >
                <X size={22} color={subColor} />
              </Pressable>
            </View>

            <Text style={[styles.modalSectionLabel, { color: subColor }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalCategoryRow}>
              {FOUNDER_POST_CATEGORIES.map((opt) => {
                const isActive = editCategory === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.modalCategoryPill,
                      isActive
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: 'transparent', borderColor },
                    ]}
                    onPress={() => {
                      console.log('[Community] Edit modal category selected:', opt.value);
                      setEditCategory(opt.value);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.modalCategoryPillText, { color: isActive ? '#fff' : subColor }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.modalSectionLabel, { color: subColor }]}>Content</Text>
            <TextInput
              style={[styles.modalTextInput, { backgroundColor: inputBg, borderColor, color: textColor }]}
              placeholder="Share something with your members..."
              placeholderTextColor={subColor}
              value={editContent}
              onChangeText={setEditContent}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={1000}
            />

            <Pressable
              style={[styles.modalPublishBtn, { opacity: editSubmitting || !editContent.trim() ? 0.6 : 1 }]}
              onPress={() => {
                console.log('[Community] Save edit pressed');
                handleSaveEdit();
              }}
              disabled={editSubmitting || !editContent.trim()}
              accessibilityRole="button"
            >
              {editSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalPublishBtnText}>Save changes</Text>
              )}
            </Pressable>
            <View style={{ height: 20 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ─── Bug report styles ────────────────────────────────────────────────────────

const bugStyles = StyleSheet.create({
  container: {
    padding: spacing.md,
    paddingBottom: 120,
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  successBox: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 15,
    minHeight: 80,
    lineHeight: 22,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  attachBtn: {
    height: 80,
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  attachBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  screenshotPreviewRow: {
    marginTop: spacing.md,
    position: 'relative',
    alignSelf: 'flex-start',
  },
  screenshotThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  screenshotRemoveBtn: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerCreateBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modalCategoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  modalCategoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  modalCategoryPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalTextInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 120,
    marginBottom: 16,
  },
  modalImageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 16,
  },
  modalImagePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  modalImagePickerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  modalImagePreviewWrap: {
    position: 'relative',
  },
  modalImagePreview: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
  },
  modalImageRemoveBtn: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalError: {
    color: '#EF4444',
    fontSize: 13,
    marginBottom: 12,
  },
  modalPublishBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPublishBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Main tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBarItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  tabBarLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  tabBarUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 1,
  },

  // Feed toggle (3 options)
  feedToggleRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  feedToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
  },
  feedToggleBtnText: {
    fontSize: 13,
  },

  // Feed list
  feedList: {
    paddingBottom: 120,
  },
  feedListEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreIndicator: {
    paddingVertical: 20,
    alignItems: 'center',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 60,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },

  // Premium gate
  premiumGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  premiumGateIconWrap: {
    width: 88,
    height: 88,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  premiumGateTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  premiumGateSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: spacing.lg,
  },
  premiumGateBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
  },
  premiumGateBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // People tab
  searchBarWrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  peopleSectionToggle: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  peopleSectionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    position: 'relative',
  },
  peopleSectionLabel: {
    fontSize: 14,
  },
  peopleSectionCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  peopleSectionUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 1,
  },
  peopleList: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 120,
  },
});

// ─── Members styles ───────────────────────────────────────────────────────────

const membersStyles = StyleSheet.create({
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingRight: spacing.md,
  },
  categoryBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  moreBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  postsList: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 120,
    gap: spacing.md,
  },

  postCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: 10,
  },
  founderAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  postHeaderInfo: {
    flex: 1,
  },
  postFounderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  postFounderLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F59E0B',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  postTimestamp: {
    fontSize: 11,
    marginTop: 2,
  },

  postContent: {
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },

  postImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    marginTop: 8,
    marginHorizontal: 0,
  },

  reactionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 4,
  },
  reactionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionCountText: {
    fontSize: 12,
    fontWeight: '500',
  },

  commentsSection: {
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    gap: 8,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  commentBubble: {
    flex: 1,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '700',
  },
  commentTime: {
    fontSize: 11,
  },
  commentContent: {
    fontSize: 14,
    lineHeight: 19,
  },
  commentEditRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 2,
  },
  commentEditInput: {
    flex: 1,
    fontSize: 14,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: 36,
  },
  commentSaveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentSaveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  commentMoreBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  noCommentsText: {
    fontSize: 13,
    fontStyle: 'italic',
  },

  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  commentInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  commentSendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Bug report card
  bugResolveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  bugResolveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: '#22C55E',
  },
  bugResolveBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#22C55E',
  },
});

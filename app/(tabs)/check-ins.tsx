/**
 * Community Tab — Feed + People (2-tab redesign)
 * Feed: Everyone (discover) / Members (founder posts, premium-gated)
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
  Image,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  Search,
  SquarePen,
  Lock,
  Crown,
  Heart,
  Flame,
  Zap,
  MessageCircle,
  ArrowUp,
  Users,
  MessageSquare,
} from 'lucide-react-native';
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

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'feed' | 'people';
type FeedToggle = 'everyone' | 'members';
type PeopleSection = 'following' | 'followers';
type MembersCategory = 'all' | 'general' | 'ask_founder';

interface FounderPost {
  id: string;
  author_id: string;
  content: string;
  category: MembersCategory;
  created_at: string;
  reaction_count: number;
  comment_count: number;
  user_reaction: string | null;
  comments?: FounderComment[];
  commentsLoaded?: boolean;
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
};

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
  const [activeCategory, setActiveCategory] = useState<MembersCategory>('all');
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
    // Optimistic update
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

  // ─── Load founder posts ─────────────────────────────────────────────────────
  const loadFounderPosts = useCallback(async (
    category: MembersCategory = activeCategory,
    isRefresh = false,
  ) => {
    console.log('[Members] loadFounderPosts — category:', category, 'isRefresh:', isRefresh);
    if (isRefresh) setMembersRefreshing(true);
    else setMembersLoading(true);
    try {
      let query = supabase
        .from('founder_posts')
        .select('*, founder_post_reactions(count), founder_post_comments(count)')
        .order('created_at', { ascending: false })
        .limit(30);

      if (category !== 'all') {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[Members] loadFounderPosts error:', error);
        return;
      }

      const posts: FounderPost[] = await Promise.all(
        (data ?? []).map(async (post: Record<string, unknown>) => {
          let userReaction: string | null = null;
          if (currentUserId) {
            const { data: myReaction } = await supabase
              .from('founder_post_reactions')
              .select('emoji')
              .eq('post_id', post.id)
              .eq('user_id', currentUserId)
              .single();
            userReaction = myReaction?.emoji ?? null;
          }

          const reactionsArr = post.founder_post_reactions as { count: number }[] | undefined;
          const commentsArr = post.founder_post_comments as { count: number }[] | undefined;

          return {
            id: post.id as string,
            author_id: post.author_id as string,
            content: post.content as string,
            category: (post.category as MembersCategory) ?? 'general',
            created_at: post.created_at as string,
            reaction_count: reactionsArr?.[0]?.count ?? 0,
            comment_count: commentsArr?.[0]?.count ?? 0,
            user_reaction: userReaction,
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
  }, [activeCategory, currentUserId]);

  // ─── Load post comments ─────────────────────────────────────────────────────
  const loadPostComments = useCallback(async (postId: string) => {
    console.log('[Members] loadPostComments — postId:', postId);
    try {
      const { data, error } = await supabase
        .from('founder_post_comments')
        .select('*, users(username, avatar_url)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[Members] loadPostComments error:', error);
        return;
      }

      const comments: FounderComment[] = (data ?? []).map((c: Record<string, unknown>) => {
        const user = c.users as { username?: string; avatar_url?: string | null } | null;
        return {
          id: c.id as string,
          post_id: c.post_id as string,
          author_id: c.author_id as string,
          content: c.content as string,
          created_at: c.created_at as string,
          author_username: user?.username ?? 'Member',
          author_avatar: user?.avatar_url ?? null,
        };
      });

      setFounderPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, comments, commentsLoaded: true } : p)),
      );
    } catch (e) {
      console.error('[Members] loadPostComments exception:', e);
    }
  }, []);

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
      setFounderPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comment_count: (p.comment_count ?? 0) + 1 } : p,
        ),
      );
      await loadPostComments(postId);
    } catch (e) {
      console.error('[Members] handleSubmitComment exception:', e);
    } finally {
      setSubmittingComment(null);
    }
  }, [commentInputs, currentUserId, loadPostComments]);

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

  // ─── Render: Feed toggle ─────────────────────────────────────────────────────
  const renderFeedToggle = () => (
    <View style={[styles.feedToggleRow, { borderBottomColor: dividerColor }]}>
      {(['everyone', 'members'] as FeedToggle[]).map((toggle) => {
        const isActive = feedToggle === toggle;
        const label = toggle === 'everyone' ? 'Everyone' : 'Members';
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
    if (feedToggle === 'everyone') {
      return renderEveryoneFeed();
    }
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
      const commentCount = item.comment_count ?? 0;
      const reactionCount = item.reaction_count ?? 0;
      const postTimestamp = timeAgo(item.created_at);
      const inlineComments = (item.comments ?? []).slice(0, 3);
      const hasMoreComments = commentCount > 3;
      const commentInputValue = commentInputs[item.id] ?? '';

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
                    {CATEGORY_LABELS[item.category] ?? 'General'}
                  </Text>
                </View>
              </View>
              <Text style={[membersStyles.postTimestamp, { color: subColor }]}>{postTimestamp}</Text>
            </View>
          </View>

          {/* Content */}
          <Text style={[membersStyles.postContent, { color: textColor }]}>{item.content}</Text>

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
          {(item.commentsLoaded || commentCount > 0) && (
            <View style={[membersStyles.commentsSection, { borderTopColor: dividerColor }]}>
              {!item.commentsLoaded && commentCount > 0 && (
                <Pressable
                  onPress={() => {
                    console.log('[Members] Load comments pressed — postId:', item.id);
                    loadPostComments(item.id);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={[membersStyles.viewAllComments, { color: subColor }]}>
                    View
                    {' '}
                    {commentCount}
                    {' '}
                    {commentCount === 1 ? 'comment' : 'comments'}
                  </Text>
                </Pressable>
              )}

              {item.commentsLoaded && inlineComments.map((comment) => {
                const commentTime = timeAgo(comment.created_at);
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
                      <Text style={[membersStyles.commentContent, { color: textColor }]}>
                        {comment.content}
                      </Text>
                    </View>
                  </View>
                );
              })}

              {item.commentsLoaded && hasMoreComments && (
                <Text style={[membersStyles.viewAllComments, { color: subColor }]}>
                  View all
                  {' '}
                  {commentCount}
                  {' '}
                  comments
                </Text>
              )}

              {item.commentsLoaded && inlineComments.length === 0 && (
                <Text style={[membersStyles.noCommentsText, { color: subColor }]}>
                  No comments yet. Be the first.
                </Text>
              )}
            </View>
          )}

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
              onFocus={() => {
                if (!item.commentsLoaded) {
                  loadPostComments(item.id);
                }
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
        {/* Category pills + optional new post button */}
        <View style={[membersStyles.categoryHeader, { borderBottomColor: dividerColor }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={membersStyles.categoryBar}
          >
            {(Object.keys(CATEGORY_LABELS) as MembersCategory[]).map((cat) => {
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
          {isAdmin && (
            <Pressable
              style={[membersStyles.newPostBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                console.log('[Members] New post button pressed (admin)');
                setShowCreatePost(true);
              }}
              accessibilityRole="button"
            >
              <SquarePen size={14} color="#fff" />
              <Text style={membersStyles.newPostBtnText}>Post</Text>
            </Pressable>
          )}
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

        {/* Following / Followers toggle — only when not searching */}
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
          headerRight: () => (
            <Pressable
              onPress={() => {
                console.log('[Community] Create post button pressed');
                setShowCreatePost(true);
              }}
              style={styles.headerCreateBtn}
              accessibilityLabel="Create post"
              accessibilityRole="button"
            >
              <SquarePen size={22} color={colors.primary} />
            </Pressable>
          ),
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

      <CreatePostSheet
        visible={showCreatePost}
        isDark={isDark}
        onClose={() => {
          console.log('[Community] CreatePostSheet closed');
          setShowCreatePost(false);
        }}
        onPosted={() => {
          console.log('[Community] Post created — refreshing feed');
          loadFeed(true);
        }}
      />
    </>
  );
}

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

  // Main tab bar (underline style)
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

  // Feed toggle (Everyone / Members)
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
    paddingHorizontal: 14,
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
  newPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.md,
    flexShrink: 0,
  },
  newPostBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
    paddingBottom: spacing.md,
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
  viewAllComments: {
    fontSize: 13,
    fontWeight: '500',
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
});

/**
 * Community Tab — Fitness Instagram
 * Sub-tabs: Discover | People | Members
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
  Users,
  Search,
  SquarePen,
  Lock,
  Crown,
  Heart,
  Flame,
  Zap,
  ThumbsUp,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  MessageSquare,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import {
  fetchFollowing,
  fetchFollowers,
  searchUsers,
} from '@/utils/socialApi';
import type { SearchUser } from '@/utils/socialApi';
import SearchUserRow from '@/components/social/SearchUserRow';
import CreatePostSheet from '@/components/social/CreatePostSheet';
import { usePremium } from '@/hooks/usePremium';
import { supabase } from '@/lib/supabase/client';

type SubTab = 'discover' | 'people' | 'members';
type PeopleSection = 'following' | 'followers';
type MembersCategory = 'general' | 'ask_founder' | 'feature_requests' | 'wins';

interface FounderPost {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  category: MembersCategory;
  created_at: string;
  updated_at: string;
  reaction_count?: number;
  comment_count?: number;
  user_reaction?: string | null;
  comments?: FounderComment[];
}

interface FounderComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_username?: string;
  author_avatar?: string | null;
}

// ─── Relative timestamp ───────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const REACTION_EMOJIS: { key: string; Icon: React.ComponentType<{ size: number; color: string }> }[] = [
  { key: 'heart', Icon: Heart },
  { key: 'flame', Icon: Flame },
  { key: 'zap', Icon: Zap },
  { key: 'thumbsup', Icon: ThumbsUp },
];

const CATEGORY_LABELS: Record<MembersCategory, string> = {
  general: 'General',
  ask_founder: 'Ask the Founder',
  feature_requests: 'Feature Requests',
  wins: 'Wins',
};

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CommunityScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { isPremium } = usePremium();

  const [activeTab, setActiveTab] = useState<SubTab>('discover');
  const [peopleSection, setPeopleSection] = useState<PeopleSection>('following');

  const [showCreatePost, setShowCreatePost] = useState(false);

  // Discover state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [discoverUsers, setDiscoverUsers] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // People state
  const [following, setFollowing] = useState<SearchUser[]>([]);
  const [followers, setFollowers] = useState<SearchUser[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleRefreshing, setPeopleRefreshing] = useState(false);

  // Members state
  const [founderPosts, setFounderPosts] = useState<FounderPost[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersRefreshing, setMembersRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<MembersCategory>('general');
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  // ─── Init current user ───────────────────────────────────────────────────────
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

  // ─── Load discover ───────────────────────────────────────────────────────────
  const loadDiscover = useCallback(async () => {
    console.log('[Community] loadDiscover');
    setDiscoverLoading(true);
    try {
      const results = await searchUsers('');
      setDiscoverUsers(results);
    } catch (e) {
      console.error('[Community] loadDiscover error:', e);
    } finally {
      setDiscoverLoading(false);
    }
  }, []);

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

  // ─── Load founder posts ──────────────────────────────────────────────────────
  const loadFounderPosts = useCallback(async (
    category: MembersCategory = activeCategory,
    isRefresh = false,
  ) => {
    console.log('[Members] loadFounderPosts — category:', category, 'isRefresh:', isRefresh);
    if (isRefresh) setMembersRefreshing(true);
    else setMembersLoading(true);
    try {
      const { data, error } = await supabase
        .from('founder_posts')
        .select(`*, founder_post_reactions(count), founder_post_comments(count)`)
        .eq('category', category)
        .order('created_at', { ascending: false })
        .limit(20);

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
            image_url: (post.image_url as string | null) ?? null,
            category: post.category as MembersCategory,
            created_at: post.created_at as string,
            updated_at: post.updated_at as string,
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

  // ─── Load post comments ──────────────────────────────────────────────────────
  const loadPostComments = useCallback(async (postId: string) => {
    console.log('[Members] loadPostComments — postId:', postId);
    try {
      const { data, error } = await supabase
        .from('founder_post_comments')
        .select(`*, users(username, avatar_url)`)
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
        prev.map((p) => (p.id === postId ? { ...p, comments } : p)),
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

    // Optimistic update
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
        // Remove old reaction if any, then insert new
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
      // Revert optimistic update on error
      loadFounderPosts(activeCategory, false);
    }
  }, [currentUserId, founderPosts, activeCategory, loadFounderPosts]);

  // ─── Handle submit comment ───────────────────────────────────────────────────
  const handleSubmitComment = useCallback(async (postId: string) => {
    const text = (commentInputs[postId] ?? '').trim();
    if (!text || !currentUserId) return;
    console.log('[Members] handleSubmitComment — postId:', postId, 'text:', text);

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
      // Update comment count optimistically
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

  // ─── Tab switch ──────────────────────────────────────────────────────────────
  const handleTabSwitch = useCallback((tab: SubTab) => {
    console.log('[Community] Tab switched to:', tab);
    setActiveTab(tab);
    if (tab === 'discover' && discoverUsers.length === 0) {
      loadDiscover();
    }
    if (tab === 'people' && following.length === 0 && followers.length === 0) {
      loadPeople();
    }
    if (tab === 'members' && founderPosts.length === 0) {
      loadFounderPosts(activeCategory, false);
    }
  }, [discoverUsers.length, following.length, followers.length, founderPosts.length, activeCategory, loadDiscover, loadPeople, loadFounderPosts]);

  // ─── Category switch ─────────────────────────────────────────────────────────
  const handleCategorySwitch = useCallback((cat: MembersCategory) => {
    console.log('[Members] Category switched to:', cat);
    setActiveCategory(cat);
    setFounderPosts([]);
    loadFounderPosts(cat, false);
  }, [loadFounderPosts]);

  // ─── Search ──────────────────────────────────────────────────────────────────
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      console.log('[Community] Searching users — query:', text);
      setSearchLoading(true);
      try {
        const results = await searchUsers(text.trim());
        setSearchResults(results);
      } catch (e) {
        console.error('[Community] searchUsers error:', e);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  }, []);

  // ─── Render Discover ─────────────────────────────────────────────────────────
  const renderDiscover = () => {
    const displayUsers = searchQuery.trim() ? searchResults : discoverUsers;
    const isLoading = searchQuery.trim() ? searchLoading : discoverLoading;

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Search bar */}
        <View style={[styles.searchBarContainer, { backgroundColor: cardBg, borderColor }]}>
          <Search size={18} color={subColor} />
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
          {isLoading && <ActivityIndicator size="small" color={colors.primary} />}
        </View>

        {!searchQuery.trim() && !discoverLoading && discoverUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}>
              <Search size={32} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: textColor }]}>Find people</Text>
            <Text style={[styles.emptySubtitle, { color: subColor }]}>
              Search by username to find and follow others
            </Text>
          </View>
        ) : searchQuery.trim() && !searchLoading && searchResults.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: textColor }]}>No users found</Text>
            <Text style={[styles.emptySubtitle, { color: subColor }]}>Try a different username</Text>
          </View>
        ) : (
          <FlatList
            data={displayUsers}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <SearchUserRow
                user={item}
                isDark={isDark}
                index={index}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </KeyboardAvoidingView>
    );
  };

  // ─── Render People ───────────────────────────────────────────────────────────
  const renderPeople = () => {
    const data = peopleSection === 'following' ? following : followers;

    return (
      <View style={{ flex: 1 }}>
        {/* Section toggle */}
        <View style={[styles.peopleSectionToggle, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor }]}>
          {(['following', 'followers'] as PeopleSection[]).map((section) => {
            const isActive = peopleSection === section;
            const label = section === 'following' ? 'Following' : 'Followers';
            return (
              <Pressable
                key={section}
                onPress={() => {
                  console.log('[Community] People section switched to:', section);
                  setPeopleSection(section);
                }}
                style={[
                  styles.peopleSectionBtn,
                  isActive && { backgroundColor: colors.primary },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.peopleSectionBtnText, { color: isActive ? '#fff' : subColor }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {peopleLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <SearchUserRow
                user={item}
                isDark={isDark}
                index={index}
              />
            )}
            contentContainerStyle={[styles.listContent, data.length === 0 && styles.listContentEmpty]}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}>
                  <Users size={32} color={colors.primary} />
                </View>
                <Text style={[styles.emptyTitle, { color: textColor }]}>
                  {peopleSection === 'following' ? 'Not following anyone yet' : 'No followers yet'}
                </Text>
                <Text style={[styles.emptySubtitle, { color: subColor }]}>
                  {peopleSection === 'following'
                    ? 'Discover people in the Discover tab'
                    : 'Share your profile to get followers'}
                </Text>
              </View>
            }
            refreshControl={
              <RefreshControl
                refreshing={peopleRefreshing}
                onRefresh={() => {
                  console.log('[Community] People pull-to-refresh');
                  loadPeople(true);
                }}
                tintColor={colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    );
  };

  // ─── Render Members ──────────────────────────────────────────────────────────
  const renderMembers = () => {
    // Premium gate
    if (!isPremium) {
      return (
        <View style={membersStyles.premiumGate}>
          <View style={[membersStyles.premiumGateIconWrap, { backgroundColor: colors.primary + '18' }]}>
            <Lock size={40} color={colors.primary} />
          </View>
          <Text style={[membersStyles.premiumGateTitle, { color: textColor }]}>
            Members Club
          </Text>
          <Text style={[membersStyles.premiumGateSubtitle, { color: subColor }]}>
            Join the inner circle. Connect directly with the founder, request features, and share your wins with fellow premium members.
          </Text>
          <Pressable
            style={membersStyles.premiumGateBtn}
            onPress={() => {
              console.log('[Members] Upgrade to Premium button pressed');
              router.push('/subscription');
            }}
            accessibilityRole="button"
          >
            <Text style={membersStyles.premiumGateBtnText}>Upgrade to Premium</Text>
          </Pressable>
        </View>
      );
    }

    const renderPostItem = ({ item }: { item: FounderPost }) => {
      const isExpanded = expandedPostId === item.id;
      const commentCount = item.comment_count ?? 0;
      const reactionCount = item.reaction_count ?? 0;
      const postTimestamp = timeAgo(item.created_at);

      return (
        <View style={[membersStyles.postCard, { backgroundColor: cardBg, borderColor }]}>
          {/* Header */}
          <View style={membersStyles.postHeader}>
            <View style={membersStyles.postFounderBadge}>
              <Crown size={14} color="#F59E0B" />
              <Text style={membersStyles.postFounderLabel}>Founder</Text>
            </View>
            <Text style={[membersStyles.postTimestamp, { color: subColor }]}>
              {postTimestamp}
            </Text>
          </View>

          {/* Content */}
          <Text style={[membersStyles.postContent, { color: textColor }]}>
            {item.content}
          </Text>

          {/* Reaction bar */}
          <View style={membersStyles.reactionBar}>
            {REACTION_EMOJIS.map(({ key, Icon }) => {
              const isActive = item.user_reaction === key;
              const reactionBg = isActive ? colors.primary + '18' : 'transparent';
              const iconColor = isActive ? colors.primary : subColor;
              return (
                <Pressable
                  key={key}
                  style={[membersStyles.reactionBtn, { backgroundColor: reactionBg }]}
                  onPress={() => {
                    console.log('[Members] Reaction pressed — postId:', item.id, 'emoji:', key);
                    handleReact(item.id, key);
                  }}
                  accessibilityRole="button"
                >
                  <Icon size={18} color={iconColor} />
                  {isActive && (
                    <Text style={[membersStyles.reactionCount, { color: colors.primary }]}>
                      {reactionCount}
                    </Text>
                  )}
                </Pressable>
              );
            })}
            <View style={{ flex: 1 }} />
            <Text style={[membersStyles.totalReactions, { color: subColor }]}>
              {reactionCount > 0 ? `${reactionCount} reaction${reactionCount !== 1 ? 's' : ''}` : ''}
            </Text>
          </View>

          {/* Comments toggle */}
          <Pressable
            style={[membersStyles.commentsToggle, { borderTopColor: borderColor }]}
            onPress={() => {
              const nextExpanded = isExpanded ? null : item.id;
              console.log('[Members] Comments toggle — postId:', item.id, 'expanding:', !isExpanded);
              setExpandedPostId(nextExpanded);
              if (!isExpanded && !item.comments) {
                loadPostComments(item.id);
              }
            }}
            accessibilityRole="button"
          >
            <MessageCircle size={15} color={subColor} />
            <Text style={[membersStyles.commentsToggleText, { color: subColor }]}>
              {commentCount === 0 ? 'No comments yet' : `${commentCount} comment${commentCount !== 1 ? 's' : ''}`}
            </Text>
            <View style={{ flex: 1 }} />
            {isExpanded
              ? <ChevronUp size={15} color={subColor} />
              : <ChevronDown size={15} color={subColor} />
            }
          </Pressable>

          {/* Expanded comments */}
          {isExpanded && (
            <View style={membersStyles.commentsSection}>
              {/* Comment list */}
              {item.comments && item.comments.length > 0 ? (
                item.comments.map((comment) => {
                  const commentTime = timeAgo(comment.created_at);
                  return (
                    <View key={comment.id} style={membersStyles.commentRow}>
                      <View style={[membersStyles.commentAvatar, { backgroundColor: colors.primary + '28' }]}>
                        {comment.author_avatar ? (
                          <Image
                            source={{ uri: comment.author_avatar }}
                            style={membersStyles.commentAvatarImg}
                          />
                        ) : (
                          <Text style={[membersStyles.commentAvatarInitial, { color: colors.primary }]}>
                            {(comment.author_username ?? 'M')[0].toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={membersStyles.commentBody}>
                        <View style={membersStyles.commentMeta}>
                          <Text style={[membersStyles.commentAuthor, { color: textColor }]}>
                            {comment.author_username ?? 'Member'}
                          </Text>
                          <Text style={[membersStyles.commentTime, { color: subColor }]}>
                            {commentTime}
                          </Text>
                        </View>
                        <Text style={[membersStyles.commentContent, { color: textColor }]}>
                          {comment.content}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={[membersStyles.noCommentsText, { color: subColor }]}>
                  Be the first to comment.
                </Text>
              )}

              {/* Comment input */}
              <View style={[membersStyles.commentInputRow, { borderTopColor: borderColor }]}>
                <TextInput
                  style={[membersStyles.commentInput, { color: textColor, borderColor }]}
                  placeholder="Add a comment..."
                  placeholderTextColor={subColor}
                  value={commentInputs[item.id] ?? ''}
                  onChangeText={(text) => {
                    setCommentInputs((prev) => ({ ...prev, [item.id]: text }));
                  }}
                  multiline={false}
                  returnKeyType="send"
                  onSubmitEditing={() => {
                    console.log('[Members] Comment submit via keyboard — postId:', item.id);
                    handleSubmitComment(item.id);
                  }}
                />
                <Pressable
                  style={[
                    membersStyles.commentSendBtn,
                    { backgroundColor: (commentInputs[item.id] ?? '').trim() ? colors.primary : colors.primary + '40' },
                  ]}
                  onPress={() => {
                    console.log('[Members] Comment send button pressed — postId:', item.id);
                    handleSubmitComment(item.id);
                  }}
                  disabled={submittingComment === item.id || !(commentInputs[item.id] ?? '').trim()}
                  accessibilityRole="button"
                >
                  {submittingComment === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ArrowUp size={16} color="#fff" />
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </View>
      );
    };

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Category filter bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={membersStyles.categoryBar}
          style={membersStyles.categoryBarScroll}
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
                <Text
                  style={[
                    membersStyles.categoryPillText,
                    { color: isActive ? '#fff' : subColor },
                    isActive && { fontWeight: '700' },
                  ]}
                >
                  {CATEGORY_LABELS[cat]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Posts list */}
        {membersLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={founderPosts}
            keyExtractor={(item) => item.id}
            renderItem={renderPostItem}
            contentContainerStyle={[
              membersStyles.postsList,
              founderPosts.length === 0 && styles.listContentEmpty,
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
              <View style={membersStyles.emptyPosts}>
                <View style={[membersStyles.emptyPostsIcon, { backgroundColor: colors.primary + '18' }]}>
                  <MessageSquare size={36} color={colors.primary} />
                </View>
                <Text style={[membersStyles.emptyPostsTitle, { color: textColor }]}>
                  No posts yet
                </Text>
                <Text style={[membersStyles.emptyPostsSubtitle, { color: subColor }]}>
                  Be the first to start the conversation.
                </Text>
              </View>
            }
          />
        )}
      </KeyboardAvoidingView>
    );
  };

  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: 'discover', label: 'Discover' },
    { key: 'people', label: 'People' },
    { key: 'members', label: 'Members' },
  ];

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
        {/* Sub-tab switcher */}
        <View style={[styles.segmentedControl, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor }]}>
          {SUB_TABS.map(({ key, label }) => {
            const isActive = activeTab === key;
            return (
              <Pressable
                key={key}
                onPress={() => handleTabSwitch(key)}
                style={[styles.segmentBtn, isActive && { backgroundColor: colors.primary }]}
                accessibilityLabel={label}
                accessibilityRole="tab"
              >
                <Text style={[styles.segmentBtnText, { color: isActive ? '#fff' : subColor }, isActive && { fontWeight: '700' }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tab content */}
        <View style={{ flex: 1 }}>
          {activeTab === 'discover' && renderDiscover()}
          {activeTab === 'people' && renderPeople()}
          {activeTab === 'members' && renderMembers()}
        </View>
      </View>

      {/* Create Post Sheet */}
      <CreatePostSheet
        visible={showCreatePost}
        isDark={isDark}
        onClose={() => {
          console.log('[Community] CreatePostSheet closed');
          setShowCreatePost(false);
        }}
        onPosted={() => {
          console.log('[Community] Post created');
        }}
      />
    </>
  );
}

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
  segmentedControl: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: 8,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  segmentBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 120,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
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
    marginBottom: spacing.md,
  },
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  peopleSectionToggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  peopleSectionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  peopleSectionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonLine: {
    height: 13,
    borderRadius: 6,
  },
});

// ─── Members Club styles ──────────────────────────────────────────────────────
const membersStyles = StyleSheet.create({
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

  // Category bar
  categoryBarScroll: {
    flexGrow: 0,
    marginBottom: spacing.sm,
  },
  categoryBar: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Posts list
  postsList: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
    gap: spacing.md,
  },

  // Post card
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
  },
  postFounderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  postFounderLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F59E0B',
    letterSpacing: 0.2,
  },
  postTimestamp: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 'auto',
  },
  postContent: {
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },

  // Reaction bar
  reactionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  reactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  reactionCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  totalReactions: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Comments toggle
  commentsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  commentsToggleText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Comments section
  commentsSection: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  commentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  commentAvatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  commentAvatarInitial: {
    fontSize: 13,
    fontWeight: '700',
  },
  commentBody: {
    flex: 1,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '700',
  },
  commentTime: {
    fontSize: 11,
    fontWeight: '500',
  },
  commentContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  noCommentsText: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },

  // Comment input
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    marginTop: spacing.xs,
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

  // Empty posts
  emptyPosts: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: spacing.xl,
  },
  emptyPostsIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyPostsTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptyPostsSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 260,
  },
});

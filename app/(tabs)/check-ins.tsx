/**
 * Community Tab — Fitness Instagram
 * Sub-tabs: Feed | Discover | People
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
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Users, Search, Edit3 } from 'lucide-react-native';
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
import CreatePostSheet from '@/components/social/CreatePostSheet';

type SubTab = 'feed' | 'discover' | 'people';
type PeopleSection = 'following' | 'followers';

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonCard({ isDark }: { isDark: boolean }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const shimmer = isDark ? '#3A3C52' : '#E5E7EB';
  const bg = isDark ? colors.cardDark : '#FFFFFF';
  return (
    <Animated.View style={[styles.skeletonCard, { backgroundColor: bg, opacity }]}>
      <View style={styles.skeletonHeader}>
        <View style={[styles.skeletonAvatar, { backgroundColor: shimmer }]} />
        <View style={styles.skeletonHeaderText}>
          <View style={[styles.skeletonLine, { width: 120, backgroundColor: shimmer }]} />
          <View style={[styles.skeletonLine, { width: 80, height: 10, marginTop: 6, backgroundColor: shimmer }]} />
        </View>
      </View>
      <View style={[styles.skeletonImage, { backgroundColor: shimmer }]} />
      <View style={[styles.skeletonLine, { width: '60%', backgroundColor: shimmer, margin: spacing.md }]} />
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CommunityScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<SubTab>('feed');
  const [peopleSection, setPeopleSection] = useState<PeopleSection>('following');

  // Feed state
  const [feed, setFeed] = useState<SocialPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedOffset, setFeedOffset] = useState(0);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
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

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  const FEED_LIMIT = 20;

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
    setFeedError(null);
    try {
      const posts = await fetchFeed('following', FEED_LIMIT, 0);
      setFeed(posts);
      setFeedOffset(posts.length);
      setFeedHasMore(posts.length === FEED_LIMIT);
      console.log('[Community] loadFeed — loaded', posts.length, 'posts');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load feed';
      console.error('[Community] loadFeed error:', msg);
      setFeedError(msg);
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
      const posts = await fetchFeed('following', FEED_LIMIT, feedOffset);
      setFeed((prev) => [...prev, ...posts]);
      setFeedOffset((prev) => prev + posts.length);
      setFeedHasMore(posts.length === FEED_LIMIT);
    } catch (e) {
      console.error('[Community] loadMoreFeed error:', e);
    } finally {
      setFeedLoadingMore(false);
    }
  }, [feedLoadingMore, feedHasMore, feedOffset]);

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

  useEffect(() => {
    loadFeed();
  }, []);

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
  }, [discoverUsers.length, following.length, followers.length, loadDiscover, loadPeople]);

  // ─── Like toggle ─────────────────────────────────────────────────────────────
  const handleLike = useCallback(async (postId: string) => {
    console.log('[Community] handleLike — post_id:', postId);
    setFeed((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1 }
          : p
      )
    );
    try {
      const result = await toggleLike(postId);
      setFeed((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, liked_by_me: result.liked, likes_count: result.likes_count } : p
        )
      );
    } catch (e) {
      console.error('[Community] toggleLike failed, reverting:', e);
      setFeed((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1 }
            : p
        )
      );
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

  // ─── Render Feed ─────────────────────────────────────────────────────────────
  const renderFeed = () => {
    if (feedLoading) {
      return (
        <View>
          {[0, 1, 2].map((i) => <SkeletonCard key={i} isDark={isDark} />)}
        </View>
      );
    }
    if (feedError) {
      return (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: textColor }]}>Couldn't load feed</Text>
          <Text style={[styles.emptySubtitle, { color: subColor }]}>{feedError}</Text>
          <Pressable
            onPress={() => {
              console.log('[Community] Retry feed pressed');
              loadFeed();
            }}
            style={styles.retryBtn}
            accessibilityRole="button"
          >
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <SocialPostCard
            post={item}
            isDark={isDark}
            onLike={handleLike}
            onPressUser={(userId) => {
              console.log('[Community] Navigate to profile — user_id:', userId);
              router.push(`/social-profile?user_id=${userId}`);
            }}
            index={index}
          />
        )}
        contentContainerStyle={[styles.listContent, feed.length === 0 && styles.listContentEmpty]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}>
              <Users size={32} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: textColor }]}>No posts yet</Text>
            <Text style={[styles.emptySubtitle, { color: subColor }]}>
              Follow people to see their posts here
            </Text>
            <Pressable
              onPress={() => {
                console.log('[Community] Empty feed — go to Discover pressed');
                handleTabSwitch('discover');
              }}
              style={styles.retryBtn}
              accessibilityRole="button"
            >
              <Text style={styles.retryBtnText}>Discover people</Text>
            </Pressable>
          </View>
        }
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
        onEndReached={() => {
          console.log('[Community] Feed end reached — loading more');
          loadMoreFeed();
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          feedLoadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    );
  };

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

  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: 'feed', label: 'Feed' },
    { key: 'discover', label: 'Discover' },
    { key: 'people', label: 'People' },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Community',
          headerLargeTitle: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerLargeTitleShadowVisible: false,
          headerLargeStyle: { backgroundColor: 'transparent' },
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
              <Edit3 size={22} color={colors.primary} />
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
          {activeTab === 'feed' && renderFeed()}
          {activeTab === 'discover' && renderDiscover()}
          {activeTab === 'people' && renderPeople()}
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
          console.log('[Community] Post created — refreshing feed');
          loadFeed(true);
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
    marginTop: spacing.sm,
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
  skeletonCard: {
    marginBottom: 1,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  skeletonHeaderText: {
    flex: 1,
  },
  skeletonLine: {
    height: 13,
    borderRadius: 6,
  },
  skeletonImage: {
    width: '100%',
    aspectRatio: 1,
  },
});

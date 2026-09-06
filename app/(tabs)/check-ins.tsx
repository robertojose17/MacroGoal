/**
 * Community Tab (check-ins.tsx)
 *
 * Full community hub with Feed, Connections, and Discover sub-tabs.
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
import { Stack } from 'expo-router';
import { Users, Camera, Search, Plus } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import {
  fetchFeed,
  fetchConnections,
  searchUsers,
  toggleLike,
  sendConnectionRequest,
  acceptConnection,
  declineConnection,
} from '@/utils/socialApi';
import type {
  SocialPost,
  Connection,
  SearchUser,
  ConnectionRole,
} from '@/utils/socialApi';
import SocialPostCard from '@/components/social/SocialPostCard';
import ConnectionRow from '@/components/social/ConnectionRow';
import SearchUserRow from '@/components/social/SearchUserRow';
import CreatePostSheet from '@/components/social/CreatePostSheet';

type SubTab = 'feed' | 'connections' | 'discover';

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
  const bg = isDark ? colors.cardDark : colors.card;
  const shimmer = isDark ? '#3A3C52' : '#E5E7EB';
  return (
    <Animated.View style={[styles.skeletonCard, { backgroundColor: bg, opacity }]}>
      <View style={styles.skeletonHeader}>
        <View style={[styles.skeletonAvatar, { backgroundColor: shimmer }]} />
        <View style={styles.skeletonHeaderText}>
          <View style={[styles.skeletonLine, { width: 120, backgroundColor: shimmer }]} />
          <View style={[styles.skeletonLine, { width: 80, height: 10, marginTop: 6, backgroundColor: shimmer }]} />
        </View>
      </View>
      <View style={[styles.skeletonLine, { width: '90%', backgroundColor: shimmer, marginBottom: 8 }]} />
      <View style={[styles.skeletonLine, { width: '70%', backgroundColor: shimmer }]} />
    </Animated.View>
  );
}

// ─── Empty states ─────────────────────────────────────────────────────────────
function FeedEmpty({ isDark }: { isDark: boolean }) {
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}>
        <Camera size={32} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: textColor }]}>No posts yet</Text>
      <Text style={[styles.emptySubtitle, { color: subColor }]}>
        Be the first to share your progress!
      </Text>
    </View>
  );
}

function ConnectionsEmpty({ isDark }: { isDark: boolean }) {
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}>
        <Users size={32} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: textColor }]}>No connections yet</Text>
      <Text style={[styles.emptySubtitle, { color: subColor }]}>
        Discover people in the Discover tab to connect with friends, coaches, or partners.
      </Text>
    </View>
  );
}

function DiscoverEmpty({ isDark }: { isDark: boolean }) {
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}>
        <Search size={32} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: textColor }]}>Find people</Text>
      <Text style={[styles.emptySubtitle, { color: subColor }]}>
        Search by username to find friends, coaches, or partners.
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CommunityScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [activeTab, setActiveTab] = useState<SubTab>('feed');

  // Feed state
  const [feed, setFeed] = useState<SocialPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [showCreatePost, setShowCreatePost] = useState(false);

  // Connections state
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);

  // Discover state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  // ─── Load feed ──────────────────────────────────────────────────────────────
  const loadFeed = useCallback(async (isRefresh = false) => {
    console.log('[Community] loadFeed — isRefresh:', isRefresh);
    if (isRefresh) setFeedRefreshing(true);
    else setFeedLoading(true);
    setFeedError(null);
    try {
      const posts = await fetchFeed(20, 0);
      setFeed(posts);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load feed';
      console.error('[Community] loadFeed error:', msg);
      setFeedError(msg);
    } finally {
      setFeedLoading(false);
      setFeedRefreshing(false);
    }
  }, []);

  // ─── Load connections ────────────────────────────────────────────────────────
  const loadConnections = useCallback(async () => {
    console.log('[Community] loadConnections');
    setConnectionsLoading(true);
    setConnectionsError(null);
    try {
      const conns = await fetchConnections();
      setConnections(conns);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load connections';
      console.error('[Community] loadConnections error:', msg);
      setConnectionsError(msg);
    } finally {
      setConnectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
    loadConnections();
  }, []);

  // ─── Tab switch ──────────────────────────────────────────────────────────────
  const handleTabSwitch = useCallback((tab: SubTab) => {
    console.log('[Community] Tab switched to:', tab);
    setActiveTab(tab);
  }, []);

  // ─── Like toggle ─────────────────────────────────────────────────────────────
  const handleLike = useCallback(async (postId: string) => {
    console.log('[Community] handleLike — post_id:', postId);
    // Optimistic update
    setFeed((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              liked_by_me: !p.liked_by_me,
              likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1,
            }
          : p
      )
    );
    try {
      const result = await toggleLike(postId);
      setFeed((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, liked_by_me: result.liked, likes_count: result.likes_count }
            : p
        )
      );
    } catch (e) {
      console.error('[Community] toggleLike failed, reverting:', e);
      // Revert optimistic update
      setFeed((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                liked_by_me: !p.liked_by_me,
                likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1,
              }
            : p
        )
      );
    }
  }, []);

  // ─── Accept / Decline connection ─────────────────────────────────────────────
  const handleAccept = useCallback(async (connectionId: string) => {
    console.log('[Community] handleAccept — connection_id:', connectionId);
    try {
      await acceptConnection(connectionId);
      setConnections((prev) =>
        prev.map((c) => (c.id === connectionId ? { ...c, status: 'accepted' } : c))
      );
    } catch (e) {
      console.error('[Community] acceptConnection failed:', e);
    }
  }, []);

  const handleDecline = useCallback(async (connectionId: string) => {
    console.log('[Community] handleDecline — connection_id:', connectionId);
    try {
      await declineConnection(connectionId);
      setConnections((prev) => prev.filter((c) => c.id !== connectionId));
    } catch (e) {
      console.error('[Community] declineConnection failed:', e);
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
      setSearchError(null);
      try {
        const results = await searchUsers(text.trim());
        setSearchResults(results);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Search failed';
        console.error('[Community] searchUsers error:', msg);
        setSearchError(msg);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  }, []);

  // ─── Connect ─────────────────────────────────────────────────────────────────
  const handleConnect = useCallback(async (userId: string, role: ConnectionRole) => {
    console.log('[Community] handleConnect — user_id:', userId, 'role:', role);
    await sendConnectionRequest(userId, role);
    setSearchResults((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, connection_status: 'pending' } : u))
    );
  }, []);

  // ─── Derived data ─────────────────────────────────────────────────────────────
  const pendingConnections = connections.filter((c) => c.status === 'pending');
  const acceptedConnections = connections.filter((c) => c.status === 'accepted');

  // ─── Render sub-tabs ─────────────────────────────────────────────────────────
  const renderFeed = () => {
    if (feedLoading) {
      return (
        <View style={styles.tabContent}>
          {[0, 1, 2].map((i) => <SkeletonCard key={i} isDark={isDark} />)}
        </View>
      );
    }
    if (feedError) {
      return (
        <View style={styles.errorState}>
          <Text style={[styles.errorTitle, { color: textColor }]}>Couldn't load feed</Text>
          <Text style={[styles.errorSub, { color: subColor }]}>{feedError}</Text>
          <Pressable onPress={() => loadFeed()} style={styles.retryBtn} accessibilityRole="button">
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
            index={index}
          />
        )}
        contentContainerStyle={[styles.listContent, feed.length === 0 && styles.listContentEmpty]}
        ListEmptyComponent={<FeedEmpty isDark={isDark} />}
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
        showsVerticalScrollIndicator={false}
      />
    );
  };

  const renderConnections = () => {
    if (connectionsLoading) {
      return (
        <View style={styles.tabContent}>
          {[0, 1, 2].map((i) => <SkeletonCard key={i} isDark={isDark} />)}
        </View>
      );
    }
    if (connectionsError) {
      return (
        <View style={styles.errorState}>
          <Text style={[styles.errorTitle, { color: textColor }]}>Couldn't load connections</Text>
          <Text style={[styles.errorSub, { color: subColor }]}>{connectionsError}</Text>
          <Pressable onPress={loadConnections} style={styles.retryBtn} accessibilityRole="button">
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    const allItems: { type: 'section' | 'connection'; label?: string; connection?: Connection }[] = [];
    if (pendingConnections.length > 0) {
      allItems.push({ type: 'section', label: 'Pending requests' });
      pendingConnections.forEach((c) => allItems.push({ type: 'connection', connection: c }));
    }
    if (acceptedConnections.length > 0) {
      allItems.push({ type: 'section', label: 'My connections' });
      acceptedConnections.forEach((c) => allItems.push({ type: 'connection', connection: c }));
    }

    if (allItems.length === 0) {
      return <ConnectionsEmpty isDark={isDark} />;
    }

    return (
      <FlatList
        data={allItems}
        keyExtractor={(item, index) =>
          item.type === 'section' ? `section-${index}` : item.connection!.id
        }
        renderItem={({ item, index }) => {
          if (item.type === 'section') {
            return (
              <Text style={[styles.sectionHeader, { color: subColor }]}>{item.label}</Text>
            );
          }
          const conn = item.connection!;
          const isPending = conn.status === 'pending';
          return (
            <ConnectionRow
              connection={conn}
              isDark={isDark}
              onAccept={isPending ? handleAccept : undefined}
              onDecline={isPending ? handleDecline : undefined}
              index={index}
            />
          );
        }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              console.log('[Community] Connections pull-to-refresh');
              loadConnections();
            }}
            tintColor={colors.primary}
          />
        }
      />
    );
  };

  const renderDiscover = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
        {searchLoading && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      {searchError ? (
        <View style={styles.errorState}>
          <Text style={[styles.errorTitle, { color: textColor }]}>Search failed</Text>
          <Text style={[styles.errorSub, { color: subColor }]}>{searchError}</Text>
        </View>
      ) : !searchQuery.trim() ? (
        <DiscoverEmpty isDark={isDark} />
      ) : searchResults.length === 0 && !searchLoading ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: textColor }]}>No users found</Text>
          <Text style={[styles.emptySubtitle, { color: subColor }]}>
            Try a different username.
          </Text>
        </View>
      ) : (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <SearchUserRow
              user={item}
              isDark={isDark}
              onConnect={handleConnect}
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
        }}
      />

      <View style={[styles.container, { backgroundColor: bg }]}>
        {/* Segmented control */}
        <View style={[styles.segmentedControl, { backgroundColor: cardBg, borderColor }]}>
          {(['feed', 'connections', 'discover'] as SubTab[]).map((tab) => {
            const isActive = activeTab === tab;
            const label = tab === 'feed' ? 'Feed' : tab === 'connections' ? 'Connections' : 'Discover';
            return (
              <Pressable
                key={tab}
                onPress={() => handleTabSwitch(tab)}
                style={[
                  styles.segmentBtn,
                  isActive && { backgroundColor: colors.primary },
                ]}
                accessibilityLabel={label}
                accessibilityRole="tab"
              >
                <Text
                  style={[
                    styles.segmentBtnText,
                    { color: isActive ? '#fff' : subColor },
                    isActive && { fontWeight: '700' },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tab content */}
        <View style={{ flex: 1 }}>
          {activeTab === 'feed' && renderFeed()}
          {activeTab === 'connections' && renderConnections()}
          {activeTab === 'discover' && renderDiscover()}
        </View>

        {/* FAB — only on feed tab */}
        {activeTab === 'feed' && (
          <Pressable
            onPress={() => {
              console.log('[Community] FAB pressed — opening CreatePostSheet');
              setShowCreatePost(true);
            }}
            style={styles.fab}
            accessibilityLabel="Create new post"
            accessibilityRole="button"
          >
            <Plus size={24} color="#fff" />
          </Pressable>
        )}
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
  tabContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
    paddingTop: spacing.sm,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
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
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 60,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'center',
  },
  errorSub: {
    fontSize: 14,
    textAlign: 'center',
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
  fab: {
    position: 'absolute',
    bottom: 100,
    right: spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  skeletonCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
});

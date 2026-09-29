/**
 * Community Tab — Fitness Instagram
 * Sub-tabs: Discover | People
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
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Users, Search, SquarePen } from 'lucide-react-native';
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

type SubTab = 'discover' | 'people';
type PeopleSection = 'following' | 'followers';

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CommunityScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

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

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

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

  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: 'discover', label: 'Discover' },
    { key: 'people', label: 'People' },
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

/**
 * Social Profile Screen
 * Route: /social-profile?user_id=X
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  Animated,
  Modal,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { X, Flame, Trophy, TrendingUp, Calendar } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import {
  fetchUserStats,
  fetchConnections,
  sendConnectionRequest,
} from '@/utils/socialApi';
import type { UserStats, ConnectionRole, Connection } from '@/utils/socialApi';
import { supabase } from '@/lib/supabase/client';
import type { SocialPost } from '@/utils/socialApi';
import SocialPostCard from '@/components/social/SocialPostCard';
import { toggleLike } from '@/utils/socialApi';

function resolveImageSource(
  source: string | number | ImageSourcePropType | undefined
): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return formatDate(d);
}

function defaultToDate(): string {
  return formatDate(new Date());
}

function Avatar({ username, avatarUrl, size = 80 }: { username: string; avatarUrl: string | null; size?: number }) {
  const initial = (username ?? 'U').charAt(0).toUpperCase();
  if (avatarUrl) {
    return (
      <Image
        source={resolveImageSource(avatarUrl)}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.primary + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: colors.primary }}>
        {initial}
      </Text>
    </View>
  );
}

const ROLE_COLORS: Record<ConnectionRole, { bg: string; text: string; label: string }> = {
  coach: { bg: '#EDE9FE', text: '#6D28D9', label: 'Coach' },
  friend: { bg: '#DBEAFE', text: '#1D4ED8', label: 'Friend' },
  partner: { bg: '#FCE7F3', text: '#BE185D', label: 'Partner' },
};

const ROLES: Array<{ role: ConnectionRole; label: string; color: string; bg: string }> = [
  { role: 'friend', label: 'Friend', color: '#1D4ED8', bg: '#DBEAFE' },
  { role: 'coach', label: 'Coach', color: '#6D28D9', bg: '#EDE9FE' },
  { role: 'partner', label: 'Partner', color: '#BE185D', bg: '#FCE7F3' },
];

function MacroCard({ label, value, unit, color, isDark }: { label: string; value: number | undefined; unit: string; color: string; isDark: boolean }) {
  const bg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const displayValue = value != null ? Math.round(value).toLocaleString() : '—';
  return (
    <View style={[styles.macroCard, { backgroundColor: bg, borderColor }]}>
      <View style={[styles.macroColorDot, { backgroundColor: color }]} />
      <Text style={[styles.macroValue, { color: textColor }]}>{displayValue}</Text>
      <Text style={[styles.macroUnit, { color: subColor }]}>{unit}</Text>
      <Text style={[styles.macroLabel, { color: subColor }]}>{label}</Text>
    </View>
  );
}

function WeightBar({ date, weight, maxWeight, isDark }: { date: string; weight: number; maxWeight: number; isDark: boolean }) {
  const barHeight = maxWeight > 0 ? (weight / maxWeight) * 60 : 0;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const shortDate = date.slice(5); // MM-DD
  return (
    <View style={styles.weightBarContainer}>
      <Text style={[styles.weightBarValue, { color: subColor }]}>{Math.round(weight)}</Text>
      <View style={styles.weightBarTrack}>
        <View style={[styles.weightBarFill, { height: barHeight, backgroundColor: colors.primary }]} />
      </View>
      <Text style={[styles.weightBarDate, { color: subColor }]}>{shortDate}</Text>
    </View>
  );
}

export default function SocialProfileScreen() {
  const { user_id } = useLocalSearchParams<{ user_id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [connection, setConnection] = useState<Connection | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(true);

  const [fromDate, setFromDate] = useState(defaultFromDate());
  const [toDate, setToDate] = useState(defaultToDate());

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  const [showRolePicker, setShowRolePicker] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const modalBg = isDark ? colors.cardDark : '#fff';

  // ─── Load connection status ──────────────────────────────────────────────────
  const loadConnection = useCallback(async () => {
    if (!user_id) return;
    console.log('[SocialProfile] Loading connection status — user_id:', user_id);
    try {
      const conns = await fetchConnections();
      const found = conns.find((c) => c.other_user.id === user_id) ?? null;
      console.log('[SocialProfile] Connection found:', found?.status ?? 'none');
      setConnection(found);
    } catch (e) {
      console.error('[SocialProfile] loadConnection error:', e);
    } finally {
      setConnectionLoading(false);
    }
  }, [user_id]);

  // ─── Load stats ──────────────────────────────────────────────────────────────
  const loadStats = useCallback(async (from: string, to: string) => {
    if (!user_id) return;
    console.log('[SocialProfile] Loading stats — user_id:', user_id, 'from:', from, 'to:', to);
    setStatsLoading(true);
    setStatsError(null);
    try {
      const data = await fetchUserStats(user_id, from, to);
      setStats(data);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load stats';
      console.error('[SocialProfile] loadStats error:', msg);
      setStatsError(msg);
    } finally {
      setStatsLoading(false);
    }
  }, [user_id]);

  // ─── Load posts ──────────────────────────────────────────────────────────────
  const loadPosts = useCallback(async () => {
    if (!user_id) return;
    console.log('[SocialProfile] Loading posts — user_id:', user_id);
    setPostsLoading(true);
    try {
      const { data, error } = await supabase
        .from('social_posts')
        .select('*, author:users(id, username, avatar_url)')
        .eq('user_id', user_id)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      console.log('[SocialProfile] Loaded', data?.length ?? 0, 'posts');
      setPosts((data ?? []) as unknown as SocialPost[]);
    } catch (e) {
      console.error('[SocialProfile] loadPosts error:', e);
    } finally {
      setPostsLoading(false);
    }
  }, [user_id]);

  useEffect(() => {
    loadConnection();
    loadStats(fromDate, toDate);
    loadPosts();
  }, [user_id]);

  const handleApplyDates = useCallback(() => {
    console.log('[SocialProfile] Apply dates pressed — from:', fromDate, 'to:', toDate);
    loadStats(fromDate, toDate);
  }, [fromDate, toDate, loadStats]);

  const handleRefresh = useCallback(async () => {
    console.log('[SocialProfile] Pull-to-refresh');
    setRefreshing(true);
    await Promise.all([loadConnection(), loadStats(fromDate, toDate), loadPosts()]);
    setRefreshing(false);
  }, [fromDate, toDate, loadConnection, loadStats, loadPosts]);

  const handleConnect = useCallback(async (role: ConnectionRole) => {
    if (!user_id) return;
    console.log('[SocialProfile] Connect pressed — user_id:', user_id, 'role:', role);
    setShowRolePicker(false);
    setConnecting(true);
    try {
      await sendConnectionRequest(user_id, role);
      console.log('[SocialProfile] Connection request sent');
      await loadConnection();
    } catch (e) {
      console.error('[SocialProfile] sendConnectionRequest failed:', e);
    } finally {
      setConnecting(false);
    }
  }, [user_id, loadConnection]);

  const handleLike = useCallback(async (postId: string) => {
    console.log('[SocialProfile] Like pressed — post_id:', postId);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1 }
          : p
      )
    );
    try {
      const result = await toggleLike(postId);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, liked_by_me: result.liked, likes_count: result.likes_count } : p))
      );
    } catch (e) {
      console.error('[SocialProfile] toggleLike failed:', e);
    }
  }, []);

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const username = stats?.username ?? connection?.other_user?.username ?? 'User';
  const avatarUrl = stats?.avatar_url ?? connection?.other_user?.avatar_url ?? null;
  const role = stats?.role ?? connection?.role ?? null;
  const roleInfo = role ? ROLE_COLORS[role] : null;
  const isConnected = connection?.status === 'accepted';
  const isPending = connection?.status === 'pending';
  const canViewStats = isConnected;

  const weightData = stats?.daily_weights ?? [];
  const maxWeight = weightData.length > 0 ? Math.max(...weightData.map((w) => w.weight_lbs)) : 0;
  const visibleWeights = weightData.slice(-14); // last 14 days

  const adherencePct = stats?.adherence_pct != null ? Math.round(Number(stats.adherence_pct)) : null;
  const streak = stats?.streak ?? 0;
  const latestWeight = stats?.latest_weight;
  const goalWeight = stats?.goal_weight;
  const startWeight = stats?.start_weight;
  const units = stats?.preferred_units ?? 'lbs';

  const progressPct =
    startWeight != null && goalWeight != null && latestWeight != null && startWeight !== goalWeight
      ? Math.min(100, Math.max(0, Math.round(((startWeight - latestWeight) / (startWeight - goalWeight)) * 100)))
      : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: username,
          headerBackButtonDisplayMode: 'minimal',
          headerShown: true,
        }}
      />

      <ScrollView
        style={[styles.container, { backgroundColor: bg }]}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* ── Profile header ── */}
        <View style={styles.profileHeader}>
          {connectionLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Avatar username={username} avatarUrl={avatarUrl} size={80} />
              <Text style={[styles.profileUsername, { color: textColor }]}>{username}</Text>

              <View style={styles.profileBadges}>
                {roleInfo && (
                  <View style={[styles.roleBadge, { backgroundColor: roleInfo.bg }]}>
                    <Text style={[styles.roleBadgeText, { color: roleInfo.text }]}>{roleInfo.label}</Text>
                  </View>
                )}
                {isPending && (
                  <View style={[styles.roleBadge, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[styles.roleBadgeText, { color: '#92400E' }]}>Request sent</Text>
                  </View>
                )}
              </View>

              {!isConnected && !isPending && (
                <Pressable
                  onPress={() => {
                    console.log('[SocialProfile] Connect button pressed');
                    setShowRolePicker(true);
                  }}
                  disabled={connecting}
                  style={[styles.connectBtn, { opacity: connecting ? 0.7 : 1 }]}
                  accessibilityLabel="Connect with user"
                  accessibilityRole="button"
                >
                  {connecting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.connectBtnText}>Connect</Text>
                  )}
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* ── Date range picker (connected only) ── */}
        {canViewStats && (
          <View style={[styles.dateRangeCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.dateRangeRow}>
              <Calendar size={16} color={subColor} />
              <Text style={[styles.dateRangeLabel, { color: subColor }]}>Date range</Text>
            </View>
            <View style={styles.dateInputsRow}>
              <View style={[styles.dateInput, { borderColor }]}>
                <Text style={[styles.dateInputLabel, { color: subColor }]}>From</Text>
                <Text style={[styles.dateInputValue, { color: textColor }]}>{fromDate}</Text>
              </View>
              <Text style={[styles.dateSeparator, { color: subColor }]}>→</Text>
              <View style={[styles.dateInput, { borderColor }]}>
                <Text style={[styles.dateInputLabel, { color: subColor }]}>To</Text>
                <Text style={[styles.dateInputValue, { color: textColor }]}>{toDate}</Text>
              </View>
              <Pressable
                onPress={handleApplyDates}
                style={styles.applyBtn}
                accessibilityLabel="Apply date range"
                accessibilityRole="button"
              >
                <Text style={styles.applyBtnText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Stats section ── */}
        {canViewStats && (
          <Animated.View style={{ opacity: fadeAnim }}>
            {statsLoading ? (
              <View style={styles.statsLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.statsLoadingText, { color: subColor }]}>Loading stats...</Text>
              </View>
            ) : statsError ? (
              <View style={[styles.errorCard, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.errorTitle, { color: textColor }]}>Couldn't load stats</Text>
                <Text style={[styles.errorSub, { color: subColor }]}>{statsError}</Text>
                <Pressable
                  onPress={() => loadStats(fromDate, toDate)}
                  style={styles.retryBtn}
                  accessibilityRole="button"
                >
                  <Text style={styles.retryBtnText}>Try again</Text>
                </Pressable>
              </View>
            ) : stats ? (
              <>
                {/* Macro averages */}
                <Text style={[styles.sectionTitle, { color: textColor }]}>Macro averages</Text>
                <View style={styles.macroGrid}>
                  <MacroCard label="Calories" value={stats.avg_calories} unit="kcal" color={colors.calories} isDark={isDark} />
                  <MacroCard label="Protein" value={stats.avg_protein} unit="g" color={colors.protein} isDark={isDark} />
                  <MacroCard label="Carbs" value={stats.avg_carbs} unit="g" color={colors.carbs} isDark={isDark} />
                  <MacroCard label="Fat" value={stats.avg_fat} unit="g" color={colors.fats} isDark={isDark} />
                </View>

                {/* Coach-specific: weight chart + adherence */}
                {role === 'coach' && (
                  <>
                    {adherencePct != null && (
                      <>
                        <Text style={[styles.sectionTitle, { color: textColor }]}>Adherence</Text>
                        <View style={[styles.adherenceCard, { backgroundColor: cardBg, borderColor }]}>
                          <View style={styles.adherenceCircle}>
                            <Text style={[styles.adherencePct, { color: colors.primary }]}>{adherencePct}%</Text>
                            <Text style={[styles.adherenceLabel, { color: subColor }]}>on track</Text>
                          </View>
                          <View style={styles.adherenceBar}>
                            <View style={[styles.adherenceBarFill, { width: `${adherencePct}%`, backgroundColor: colors.primary }]} />
                          </View>
                        </View>
                      </>
                    )}

                    {visibleWeights.length > 0 && (
                      <>
                        <Text style={[styles.sectionTitle, { color: textColor }]}>Weight trend</Text>
                        <View style={[styles.chartCard, { backgroundColor: cardBg, borderColor }]}>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={styles.chartBars}>
                              {visibleWeights.map((w) => (
                                <WeightBar
                                  key={w.date}
                                  date={w.date}
                                  weight={w.weight_lbs}
                                  maxWeight={maxWeight}
                                  isDark={isDark}
                                />
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                      </>
                    )}

                    {progressPct != null && startWeight != null && goalWeight != null && (
                      <>
                        <Text style={[styles.sectionTitle, { color: textColor }]}>Goal progress</Text>
                        <View style={[styles.progressCard, { backgroundColor: cardBg, borderColor }]}>
                          <View style={styles.progressLabels}>
                            <Text style={[styles.progressLabel, { color: subColor }]}>Start: {startWeight} {units}</Text>
                            <Text style={[styles.progressLabel, { color: colors.primary }]}>{progressPct}%</Text>
                            <Text style={[styles.progressLabel, { color: subColor }]}>Goal: {goalWeight} {units}</Text>
                          </View>
                          <View style={[styles.progressTrack, { backgroundColor: borderColor }]}>
                            <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: colors.primary }]} />
                          </View>
                          {latestWeight != null && (
                            <Text style={[styles.currentWeightText, { color: textColor }]}>
                              Current: {latestWeight} {units}
                            </Text>
                          )}
                        </View>
                      </>
                    )}
                  </>
                )}

                {/* Friend/partner: streak + weight */}
                {(role === 'friend' || role === 'partner') && (
                  <View style={styles.statsRow}>
                    {streak > 0 && (
                      <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Flame size={22} color="#EF4444" />
                        <Text style={[styles.statValue, { color: textColor }]}>{streak}</Text>
                        <Text style={[styles.statLabel, { color: subColor }]}>day streak</Text>
                      </View>
                    )}
                    {latestWeight != null && (
                      <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <TrendingUp size={22} color={colors.primary} />
                        <Text style={[styles.statValue, { color: textColor }]}>{latestWeight}</Text>
                        <Text style={[styles.statLabel, { color: subColor }]}>{units}</Text>
                      </View>
                    )}
                    {goalWeight != null && (
                      <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Trophy size={22} color="#F59E0B" />
                        <Text style={[styles.statValue, { color: textColor }]}>{goalWeight}</Text>
                        <Text style={[styles.statLabel, { color: subColor }]}>goal {units}</Text>
                      </View>
                    )}
                  </View>
                )}
              </>
            ) : null}
          </Animated.View>
        )}

        {/* Public view: streak only */}
        {!canViewStats && !connectionLoading && (
          <View style={styles.publicStats}>
            {streak > 0 && (
              <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                <Flame size={22} color="#EF4444" />
                <Text style={[styles.statValue, { color: textColor }]}>{streak}</Text>
                <Text style={[styles.statLabel, { color: subColor }]}>day streak</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Recent posts ── */}
        <Text style={[styles.sectionTitle, { color: textColor }]}>Recent posts</Text>
        {postsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
        ) : posts.length === 0 ? (
          <Text style={[styles.noPostsText, { color: subColor }]}>No public posts yet.</Text>
        ) : (
          posts.map((post, index) => (
            <SocialPostCard
              key={post.id}
              post={post}
              isDark={isDark}
              onLike={handleLike}
              index={index}
            />
          ))
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Role picker modal */}
      <Modal
        visible={showRolePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRolePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            console.log('[SocialProfile] Role picker dismissed');
            setShowRolePicker(false);
          }}
        >
          <View style={[styles.modalSheet, { backgroundColor: modalBg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>Connect as...</Text>
              <Pressable
                onPress={() => setShowRolePicker(false)}
                style={styles.closeBtn}
                accessibilityLabel="Close"
              >
                <X size={20} color={subColor} />
              </Pressable>
            </View>
            <Text style={[styles.modalSubtitle, { color: subColor }]}>
              How do you know {username}?
            </Text>
            {ROLES.map((r) => (
              <Pressable
                key={r.role}
                onPress={() => handleConnect(r.role)}
                style={[styles.roleOption, { backgroundColor: r.bg }]}
                accessibilityLabel={`Connect as ${r.label}`}
                accessibilityRole="button"
              >
                <Text style={[styles.roleOptionText, { color: r.color }]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  profileUsername: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: spacing.sm,
  },
  profileBadges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  connectBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    marginTop: spacing.sm,
    minWidth: 120,
    alignItems: 'center',
  },
  connectBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  dateRangeCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateRangeLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  dateInputLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  dateInputValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  dateSeparator: {
    fontSize: 16,
  },
  applyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  applyBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  statsLoading: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  statsLoadingText: {
    fontSize: 14,
  },
  errorCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorSub: {
    fontSize: 13,
    textAlign: 'center',
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  macroCard: {
    width: '47%',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    alignItems: 'center',
    gap: 3,
  },
  macroColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 4,
  },
  macroValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  macroUnit: {
    fontSize: 12,
  },
  macroLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  adherenceCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  adherenceCircle: {
    alignItems: 'center',
  },
  adherencePct: {
    fontSize: 32,
    fontWeight: '800',
  },
  adherenceLabel: {
    fontSize: 13,
  },
  adherenceBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  adherenceBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  chartCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingBottom: 4,
  },
  weightBarContainer: {
    alignItems: 'center',
    gap: 3,
  },
  weightBarValue: {
    fontSize: 10,
  },
  weightBarTrack: {
    width: 20,
    height: 60,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  weightBarFill: {
    borderRadius: 4,
  },
  weightBarDate: {
    fontSize: 9,
  },
  progressCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  currentWeightText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
  },
  publicStats: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  noPostsText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  roleOption: {
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  roleOptionText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image,
  Modal, TextInput, FlatList, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ProfileScreenState } from './profileScreenController';
import { profileAction } from './profileScreenController';
import type { OutboundAction } from './outboundFollowAdapter';
import { amountText, goalProgress, metricText, relativePostTime, safeProfileAvatar, visibleProfile } from './profileScreenPresentation';
import type { ConnectionDirection } from './profileSupplementTypes';
import type { NutritionRange } from './profileScreenPresentation';

interface Props {
  state: ProfileScreenState;
  onBack(): void;
  unavailable?: string;
  range?: NutritionRange;
  custom?: { fromDate: string; toDate: string };
  onRefresh?(): void;
  onRange?(range: NutritionRange): void;
  onCustom?(fromDate: string, toDate: string): boolean;
  onAction?(action: OutboundAction): void;
  onConnections?(direction: ConnectionDirection): void;
  onCloseConnections?(): void;
  onBlockConfirm?(confirmedScopeKey: string): void;
}
const rangeLabels: Record<NutritionRange, string> = { today: 'Today', '7d': '7 Days', '30d': '30 Days', custom: 'Custom' };
const macroLabels = { protein: 'Protein', carbs: 'Carbs', fats: 'Fats', fiber: 'Fiber' } as const;
const macroColors = { protein: '#29a583', carbs: '#d89d32', fats: '#9d74c5', fiber: '#4e91d6' } as const;

/** Snapshot-only renderer. No database, auth, HTTP, storage, raw health or post-media access. */
export function AcceptedSocialProfileScreen({ state, onBack, unavailable, range = 'today', custom,
  onRefresh, onRange, onCustom, onAction, onConnections, onCloseConnections, onBlockConfirm }: Props) {
  const dark = useColorScheme() === 'dark';
  const palette = { bg: dark ? '#111827' : '#f7f8fa', card: dark ? '#1f2937' : '#fff',
    text: dark ? '#f9fafb' : '#111827', muted: dark ? '#b3bbc9' : '#5d6675', border: dark ? '#374151' : '#e5e7eb' };
  const [rangeEditor, setRangeEditor] = useState(false);
  const [fromDate, setFromDate] = useState(custom?.fromDate ?? '');
  const [toDate, setToDate] = useState(custom?.toDate ?? '');
  const [dateError, setDateError] = useState(false);
  const [blockScopeKey, setBlockScopeKey] = useState<string | null>(null);
  useEffect(() => { setRangeEditor(false); setDateError(false); setBlockScopeKey(null); }, [state.scopeKey, unavailable]);
  // A message-only/hidden route cannot expose even discovery from a stale renderer prop.
  const profile = unavailable ? null : state.profile;
  const { identity, user, metrics, nutrition } = visibleProfile(profile);
  const values = metricText(metrics);
  const displayName = identity?.name || identity?.full_name || identity?.username || 'Profile';
  const avatar = identity ? safeProfileAvatar(identity.id, identity.avatar_url) : null;
  const action = profileAction(profile);
  const text = { color: palette.text };
  const muted = { color: palette.muted };
  const card = { backgroundColor: palette.card, borderColor: palette.border };
  const actionLabel = action === 'cancel' ? 'Cancel request' : action === 'unfollow' ? 'Unfollow' : 'Request to follow';
  const openDates = () => { setFromDate(custom?.fromDate ?? ''); setToDate(custom?.toDate ?? ''); setDateError(false); setRangeEditor(true); };

  return <SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]} edges={['top']}>
    <View style={[styles.topBar, { borderColor: palette.border }]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" style={styles.touch} onPress={onBack}>
        <Text style={[styles.back, text]}>‹</Text>
      </TouchableOpacity>
      <Text style={[styles.title, text]} numberOfLines={1}>{identity?.username || displayName}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh profile" style={styles.touch}
        disabled={!onRefresh || !!unavailable || state.busy} onPress={onRefresh}>
        <Text style={muted}>↻</Text>
      </TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      {unavailable ? <Text style={[styles.message, muted]}>{unavailable}</Text> :
        state.status === 'loading' || state.busy ? <View accessibilityLiveRegion="polite" style={styles.message}>
          <ActivityIndicator color="#19a377" /><Text style={muted}>{state.blockBusy ? 'Blocking user…' : state.busy ? 'Updating request…' : 'Loading profile…'}</Text>
        </View> : state.status === 'error' ? <View style={styles.message}>
          <Text accessibilityLiveRegion="polite" style={muted}>{state.outcome === 'block_unconfirmed' ? 'Block could not be confirmed. Refresh to check this profile before trying again.' : 'Profile could not be loaded.'}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={onRefresh}><Text style={styles.buttonText}>Try again</Text></TouchableOpacity>
        </View> : !identity ? <Text style={[styles.message, muted]}>{state.outcome === 'blocked' ? 'This user is blocked.' : 'This account is not available.'}</Text> : <>
          <View style={styles.header}>
            {avatar ? <Image accessibilityLabel={`${displayName} avatar`} source={{ uri: avatar }} style={styles.avatar} /> :
              <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text></View>}
            <View style={styles.headerInfo}>
              <Text style={[styles.name, text]}>{displayName}</Text>
              {!!identity.username && <Text style={muted}>@{identity.username}</Text>}
              {user?.is_premium === true && <Text accessibilityLabel="Premium member" style={muted}>👑</Text>}
            </View>
          </View>
          {!!user?.bio && <Text style={[styles.bio, text]}>{user.bio}</Text>}
          {profile?.can_view_profile && user ? <View style={styles.counts}>
            {(['posts', 'followers', 'following'] as const).map(key => key === 'posts' ? <View key={key} style={styles.count}>
              <Text style={[styles.countValue, text]}>{values[key]}</Text><Text style={muted}>{key}</Text>
            </View> : <TouchableOpacity key={key} accessibilityRole="button" accessibilityLabel={`View ${key}`}
              style={styles.count} disabled={state.busy || !onConnections} onPress={() => onConnections?.(key)}>
              <Text style={[styles.countValue, text]}>{values[key]}</Text><Text style={muted}>{key}</Text>
            </TouchableOpacity>)}
          </View> : null}
          {!!action && <TouchableOpacity accessibilityRole="button" accessibilityLabel={actionLabel}
            style={styles.button} disabled={state.busy || !onAction} onPress={() => onAction?.(action)}>
            <Text style={styles.buttonText}>{actionLabel}</Text>
          </TouchableOpacity>}
          {profile && !profile.is_own_profile && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Block user"
            disabled={state.busy || !onBlockConfirm} style={styles.touch} onPress={() => setBlockScopeKey(state.scopeKey)}>
            <Text style={{ color: '#B91C1C' }}>Block user</Text>
          </TouchableOpacity>}
          {profile?.follow_request_state === 'pending' && <Text style={[styles.notice, muted]}>Request pending. Statistics appear after this person accepts.</Text>}
          {state.outcome === 'unconfirmed' && <Text accessibilityLiveRegion="polite" style={[styles.notice, muted]}>
            The action could not be confirmed. The profile shows the latest available server state.
          </Text>}
          {!user ? <View style={[styles.card, card]}><Text style={[styles.sectionTitle, text]}>Private profile</Text>
            <Text style={muted}>This person must accept your request before you can see their profile and statistics.</Text>
          </View> : <>
            <View style={[styles.card, styles.stats, card]}>
              {(['streak', 'best', 'score', 'since'] as const).map(key => <View key={key} style={styles.stat}>
                <Text style={[styles.statValue, text]}>{values[key]}</Text><Text style={muted}>{key.toUpperCase()}</Text>
              </View>)}
            </View>
            <View style={[styles.card, card]}>
              <Text style={[styles.sectionTitle, text]}>Calories & macros</Text>
              <View style={styles.ranges}>{(Object.keys(rangeLabels) as NutritionRange[]).map(key =>
                <TouchableOpacity key={key} accessibilityRole="button" accessibilityState={{ selected: range === key }}
                  disabled={state.busy} style={[styles.range, { borderColor: range === key ? '#19a377' : palette.border }]}
                  onPress={() => key === 'custom' ? openDates() : onRange?.(key)}><Text style={text}>{rangeLabels[key]}</Text></TouchableOpacity>)}</View>
              {!nutrition ? <Text style={muted}>Nutrition is unavailable.</Text> : <>
                {nutrition.day_count > 1 && <Text style={[styles.notice, muted]}>Daily average over {nutrition.day_count} days</Text>}
                <View style={styles.nutritionRow}>
                  <View accessibilityLabel={`${amountText(nutrition.daily_average.calories)} kilocalories. Goal ${amountText(nutrition.current_goals?.calories)}.`}
                    style={styles.calorieCircle}>
                    <Text style={[styles.calories, text]}>{amountText(nutrition.daily_average.calories)}</Text>
                    <Text style={muted}>kcal</Text><Text style={muted}>Goal: {amountText(nutrition.current_goals?.calories)}</Text>
                  </View>
                  <View style={styles.macros}>{(Object.keys(macroLabels) as (keyof typeof macroLabels)[]).map(key => {
                    const goal = nutrition.current_goals?.[key];
                    const progress = goalProgress(nutrition.daily_average[key], goal);
                    return <View key={key} style={styles.macro}>
                      <Text style={muted}>{macroLabels[key]}</Text>
                      <Text style={text}>{amountText(nutrition.daily_average[key])} g · Goal: {amountText(goal)}{goal == null ? '' : ' g'}</Text>
                      {progress !== null && <View style={[styles.track, { backgroundColor: palette.border }]}>
                        <View style={[styles.fill, { width: `${progress}%`, backgroundColor: macroColors[key] }]} />
                      </View>}
                    </View>;
                  })}</View>
                </View>
              </>}
            </View>
            <View style={[styles.card, card]}>
              <Text style={[styles.sectionTitle, text]}>Posts</Text>
              {state.posts?.status === 'loading' ? <ActivityIndicator accessibilityLabel="Loading posts" color="#19a377" /> :
                state.posts?.status === 'ready' ? state.posts.items.length === 0 ? <Text style={muted}>No posts yet</Text> : <>
                  {state.posts.items.map(post => <View key={post.id} style={[styles.post, { borderColor: palette.border }]}>
                    {post.content !== null && <Text style={[styles.bio, text]}>{post.content}</Text>}
                    <View style={styles.postMeta}><Text style={muted}>{relativePostTime(post.created_at)}</Text>
                      <Text accessibilityLabel={`${post.likes_count} likes`} style={muted}>♥ {post.likes_count}</Text>
                    </View>
                  </View>)}
                  {state.posts.nextCursor !== null && <Text style={muted}>Showing the latest 20 posts</Text>}
                </> : <Text style={muted}>Posts could not be loaded.</Text>}
            </View>
          </>}
        </>}
    </ScrollView>
    <Modal visible={!!user && !unavailable && !!state.connections?.direction} transparent animationType="slide" onRequestClose={onCloseConnections}>
      <View style={styles.modalBackdrop}><View style={[styles.modal, card, { maxHeight: '80%' }]}>
        <Text style={[styles.sectionTitle, text]}>{state.connections?.direction === 'followers' ? 'Followers' : 'Following'}</Text>
        {state.connections?.status === 'loading' ? <ActivityIndicator accessibilityLabel="Loading connections" color="#19a377" /> :
          state.connections?.items.length === 0 ? <Text style={muted}>{state.connections.direction === 'followers' ? 'No followers yet' : 'Not following anyone yet'}</Text> :
            <FlatList data={state.connections?.items ?? []} keyExtractor={item => item.id} renderItem={({ item }) => {
              const name = item.name || item.full_name || item.username || 'User';
              const uri = safeProfileAvatar(item.id, item.avatar_url);
              return <View style={styles.connectionRow}>
                {uri ? <Image accessibilityLabel={`${name} avatar`} source={{ uri }} style={styles.smallAvatar} /> :
                  <View style={[styles.smallAvatar, styles.avatarFallback]}><Text style={styles.buttonText}>{name.charAt(0).toUpperCase()}</Text></View>}
                <View style={{ flex: 1 }}><Text style={text}>{name}</Text>{!!item.username && <Text style={muted}>@{item.username}</Text>}</View>
              </View>;
            }} />}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close connections" style={styles.touch} onPress={onCloseConnections}><Text style={text}>Close</Text></TouchableOpacity>
      </View></View>
    </Modal>
    <Modal visible={!!blockScopeKey && blockScopeKey === state.scopeKey && !!identity && !unavailable} transparent animationType="fade" onRequestClose={() => setBlockScopeKey(null)}>
      <View style={styles.modalBackdrop}><View style={[styles.modal, card]}>
        <Text style={[styles.sectionTitle, text]}>Block {displayName}?</Text>
        <Text style={muted}>You and this person will no longer be able to see each other’s profile or posts.</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Confirm block user" style={[styles.button, { backgroundColor: '#B91C1C' }]}
          onPress={() => { const key = blockScopeKey; setBlockScopeKey(null); if (key) onBlockConfirm?.(key); }}><Text style={styles.buttonText}>Block</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel block" style={styles.touch} onPress={() => setBlockScopeKey(null)}><Text style={text}>Cancel</Text></TouchableOpacity>
      </View></View>
    </Modal>
    <Modal visible={rangeEditor && !unavailable && !!user} transparent animationType="fade" onRequestClose={() => setRangeEditor(false)}>
      <View style={styles.modalBackdrop}><View style={[styles.modal, card]}>
        <Text style={[styles.sectionTitle, text]}>Custom date range</Text>
        <Text style={muted}>Choose 1–366 calendar days. Use YYYY-MM-DD.</Text>
        <TextInput accessibilityLabel="Start date YYYY-MM-DD" placeholder="YYYY-MM-DD" placeholderTextColor={palette.muted}
          value={fromDate} onChangeText={setFromDate} autoCapitalize="none" style={[styles.input, text, { borderColor: palette.border }]} />
        <TextInput accessibilityLabel="End date YYYY-MM-DD" placeholder="YYYY-MM-DD" placeholderTextColor={palette.muted}
          value={toDate} onChangeText={setToDate} autoCapitalize="none" style={[styles.input, text, { borderColor: palette.border }]} />
        {dateError && <Text accessibilityLiveRegion="polite" style={text}>Enter a valid range of up to 366 days.</Text>}
        <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => {
          if (onCustom?.(fromDate, toDate)) setRangeEditor(false); else setDateError(true);
        }}><Text style={styles.buttonText}>Apply dates</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.touch} onPress={() => setRangeEditor(false)}><Text style={text}>Cancel</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, content: { padding: 18, gap: 16, paddingBottom: 40 }, topBar: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  touch: { minHeight: 44, minWidth: 44, padding: 12, justifyContent: 'center', alignItems: 'center' }, back: { fontSize: 28 },
  title: { flex: 1, fontSize: 18, fontWeight: '600', textAlign: 'center' }, message: { paddingVertical: 32, gap: 12, alignItems: 'center', textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 18 }, avatar: { width: 90, height: 90, borderRadius: 45 },
  avatarFallback: { backgroundColor: '#19a377', alignItems: 'center', justifyContent: 'center' }, avatarLetter: { fontSize: 32, color: '#fff', fontWeight: '700' },
  headerInfo: { flex: 1, gap: 6 }, name: { fontSize: 21, fontWeight: '700' }, bio: { fontSize: 15, lineHeight: 22 },
  counts: { flexDirection: 'row', gap: 12 }, count: { flex: 1, gap: 3 }, countValue: { fontWeight: '700', fontSize: 15 },
  button: { backgroundColor: '#14885f', padding: 14, borderRadius: 10, alignItems: 'center', minHeight: 44 }, buttonText: { color: '#fff', fontWeight: '600' },
  notice: { fontSize: 13, lineHeight: 20 }, card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700' }, stats: { flexDirection: 'row', flexWrap: 'wrap' }, stat: { flexGrow: 1, flexBasis: '40%', gap: 5 }, statValue: { fontWeight: '700', fontSize: 20 },
  ranges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, range: { borderWidth: 1, borderRadius: 8, minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  nutritionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 18 }, calorieCircle: { width: 145, minHeight: 145, borderRadius: 80, borderWidth: 8, borderColor: '#19a377', alignItems: 'center', justifyContent: 'center', padding: 8 },
  calories: { fontSize: 30, fontWeight: '700' }, macros: { flex: 1, minWidth: 135, gap: 12 }, macro: { gap: 4 }, track: { height: 6, borderRadius: 3, overflow: 'hidden' }, fill: { height: 6, borderRadius: 3 },
  modalBackdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }, modal: { padding: 20, borderRadius: 16, gap: 14 },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }, smallAvatar: { width: 44, height: 44, borderRadius: 22 },
  post: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 10 }, postMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 44 },
});

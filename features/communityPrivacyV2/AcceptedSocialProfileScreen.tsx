import { PrivatePhotoImage } from '@/components/PrivatePhotoImage';
import { privatePhotoReference } from '@/utils/privatePhotoClient';
import { socialT as t } from '@/features/communityPrivacyV2/socialTranslations';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image,
  Modal, TextInput, FlatList, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ProfileScreenState } from './profileScreenController';
import { profileAction, profileLoadErrorCode } from './profileScreenController';
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
  onOpenConnection?(userId: string): void;
  onBlockConfirm?(confirmedScopeKey: string): void;
}
const macroColors = { protein: '#29a583', carbs: '#d89d32', fats: '#9d74c5', fiber: '#4e91d6' } as const;

/** Selected profile snapshot; only vetted derivative IDs reach the authenticated media component. */
export function AcceptedSocialProfileScreen({ state, onBack, unavailable, range = 'today', custom,
  onRefresh, onRange, onCustom, onAction, onConnections, onCloseConnections, onOpenConnection, onBlockConfirm }: Props) {
  useTranslation();
  const rangeLabels: Record<NutritionRange, string> = { today: t('localization.social.today'), '7d': t('localization.social.7_days'), '30d': t('localization.social.30_days'), custom: t('localization.social.custom') };
  const macroLabels = { protein: t('localization.social.protein'), carbs: t('localization.social.carbs'), fats: t('localization.social.fats'), fiber: t('localization.social.fiber') } as const;

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
  const displayName = identity?.name || identity?.full_name || identity?.username || t('localization.social.profile');
  const avatar = identity ? safeProfileAvatar(identity.id, identity.avatar_url) : null;
  const action = profileAction(profile);
  const loadErrorCode = profileLoadErrorCode(state.loadError);
  const text = { color: palette.text };
  const muted = { color: palette.muted };
  const card = { backgroundColor: palette.card, borderColor: palette.border };
  const actionLabel = action === 'cancel' ? t('localization.social.cancel_request') : action === 'unfollow' ? t('localization.social.unfollow') : t('localization.social.request_to_follow');
  const openDates = () => { setFromDate(custom?.fromDate ?? ''); setToDate(custom?.toDate ?? ''); setDateError(false); setRangeEditor(true); };

  return <SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]} edges={['top']}>
    <View style={[styles.topBar, { borderColor: palette.border }]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('localization.social.back')} style={styles.touch} onPress={onBack}>
        <Text style={[styles.back, text]}>‹</Text>
      </TouchableOpacity>
      <Text style={[styles.title, text]} numberOfLines={1}>{identity?.username || displayName}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('localization.social.refresh_profile')} style={styles.touch}
        disabled={!onRefresh || !!unavailable || state.busy} onPress={onRefresh}>
        <Text style={muted}>↻</Text>
      </TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      {unavailable ? <Text style={[styles.message, muted]}>{unavailable}</Text> :
        state.status === 'loading' || state.busy ? <View accessibilityLiveRegion="polite" style={styles.message}>
          <ActivityIndicator color="#19a377" /><Text style={muted}>{state.blockBusy ? t('localization.social.blocking_user') : state.busy ? t('localization.social.updating_request') : t('localization.social.loading_profile')}</Text>
        </View> : state.status === 'error' ? <View style={styles.message}>
          <Text accessibilityLiveRegion="polite" style={muted}>{state.outcome === 'block_unconfirmed' ? t('localization.social.block_could_not_be_confirmed_refresh_to_check_this_profile_before_trying_again') : t('localization.social.profile_could_not_be_loaded')}</Text>
          {loadErrorCode && <Text accessibilityLiveRegion="polite" selectable style={muted}>{t('localization.social.code')}: {loadErrorCode}</Text>}
          <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={onRefresh}><Text style={styles.buttonText}>{t('localization.social.try_again')}</Text></TouchableOpacity>
        </View> : !identity ? <Text style={[styles.message, muted]}>{state.outcome === 'blocked' ? t('localization.social.this_user_is_blocked') : t('localization.social.this_account_is_not_available')}</Text> : <>
          <View style={styles.header}>
            {avatar ? <Image accessibilityLabel={t('localization.social.avatar', { name: displayName })} source={{ uri: avatar }} style={styles.avatar} /> :
              <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text></View>}
            <View style={styles.headerInfo}>
              <Text style={[styles.name, text]}>{displayName}</Text>
              {!!identity.username && <Text style={muted}>@{identity.username}</Text>}
              {user?.is_premium === true && <Text accessibilityLabel={t('localization.social.premium_member')} style={muted}>👑</Text>}
            </View>
          </View>
          {!!user?.bio && <Text style={[styles.bio, text]}>{user.bio}</Text>}
          {profile?.can_view_profile && user ? <View style={styles.counts}>
            {(['posts', 'followers', 'following'] as const).map(key => key === 'posts' ? <View key={key} style={styles.count}>
              <Text style={[styles.countValue, text]}>{values[key]}</Text><Text style={muted}>{t(`localization.social.${key}`)}</Text>
            </View> : <TouchableOpacity key={key} accessibilityRole="button" accessibilityLabel={t('localization.social.view_connections', { connections: t(`localization.social.${key}`) })}
              style={styles.count} disabled={state.busy || !onConnections} onPress={() => onConnections?.(key)}>
              <Text style={[styles.countValue, text]}>{values[key]}</Text><Text style={muted}>{t(`localization.social.${key}`)}</Text>
            </TouchableOpacity>)}
          </View> : null}
          {!!action && <TouchableOpacity accessibilityRole="button" accessibilityLabel={actionLabel}
            style={styles.button} disabled={state.busy || !onAction} onPress={() => onAction?.(action)}>
            <Text style={styles.buttonText}>{actionLabel}</Text>
          </TouchableOpacity>}
          {profile && !profile.is_own_profile && <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('localization.social.block_user')}
            disabled={state.busy || !onBlockConfirm} style={styles.touch} onPress={() => setBlockScopeKey(state.scopeKey)}>
            <Text style={{ color: '#B91C1C' }}>{t('localization.social.block_user')}</Text>
          </TouchableOpacity>}
          {profile?.follow_request_state === 'pending' && <Text style={[styles.notice, muted]}>{t('localization.social.request_pending_statistics_appear_after_this_person_accepts')}</Text>}
          {state.outcome === 'unconfirmed' && <Text accessibilityLiveRegion="polite" style={[styles.notice, muted]}>
            
            {t('localization.social.the_action_could_not_be_confirmed_the_profile_shows_the_latest_available_server_state')}
          </Text>}
          {!user ? <View style={[styles.card, card]}><Text style={[styles.sectionTitle, text]}>{t('localization.social.private_profile')}</Text>
            <Text style={muted}>{t('localization.social.this_person_must_accept_your_request_before_you_can_see_their_profile_and_statistics')}</Text>
          </View> : <>
            <View style={[styles.card, styles.stats, card]}>
              {(['streak', 'best', 'score', 'since'] as const).map(key => <View key={key} style={styles.stat}>
                <Text style={[styles.statValue, text]}>{values[key]}</Text><Text style={muted}>{t(`localization.social.${key}`)}</Text>
              </View>)}
            </View>
            <View style={[styles.card, card]}>
              <Text style={[styles.sectionTitle, text]}>{t('localization.social.calories_macros')}</Text>
              <View style={styles.ranges}>{(Object.keys(rangeLabels) as NutritionRange[]).map(key =>
                <TouchableOpacity key={key} accessibilityRole="button" accessibilityState={{ selected: range === key }}
                  disabled={state.busy} style={[styles.range, { borderColor: range === key ? '#19a377' : palette.border }]}
                  onPress={() => key === 'custom' ? openDates() : onRange?.(key)}><Text style={text}>{rangeLabels[key]}</Text></TouchableOpacity>)}</View>
              {!nutrition ? <Text style={muted}>{t('localization.social.nutrition_is_unavailable')}</Text> : <>
                {nutrition.day_count > 1 && <Text style={[styles.notice, muted]}>{t('localization.social.daily_average', { count: nutrition.day_count })}</Text>}
                <View style={styles.nutritionRow}>
                  <View accessibilityLabel={t('localization.social.calorie_goal_accessibility', { calories: amountText(nutrition.daily_average.calories), goal: amountText(nutrition.current_goals?.calories) })}
                    style={styles.calorieCircle}>
                    <Text style={[styles.calories, text]}>{amountText(nutrition.daily_average.calories)}</Text>
                    <Text style={muted}>kcal</Text><Text style={muted}>{t('localization.social.goal', { goal: amountText(nutrition.current_goals?.calories) })}</Text>
                  </View>
                  <View style={styles.macros}>{(Object.keys(macroLabels) as (keyof typeof macroLabels)[]).map(key => {
                    const goal = nutrition.current_goals?.[key];
                    const progress = goalProgress(nutrition.daily_average[key], goal);
                    return <View key={key} style={styles.macro}>
                      <Text style={muted}>{macroLabels[key]}</Text>
                      <Text style={text}>{t('localization.social.macro_goal', { amount: amountText(nutrition.daily_average[key]), goal: amountText(goal), unit: goal == null ? '' : ' g' })}</Text>
                      {progress !== null && <View style={[styles.track, { backgroundColor: palette.border }]}>
                        <View style={[styles.fill, { width: `${progress}%`, backgroundColor: macroColors[key] }]} />
                      </View>}
                    </View>;
                  })}</View>
                </View>
              </>}
            </View>
            <View style={[styles.card, card]}>
              <Text style={[styles.sectionTitle, text]}>{t('localization.social.posts')}</Text>
              {state.posts?.status === 'loading' ? <ActivityIndicator accessibilityLabel={t('localization.social.loading_posts')} color="#19a377" /> :
                state.posts?.status === 'ready' ? state.posts.items.length === 0 ? <Text style={muted}>{t('localization.social.no_posts_yet')}</Text> : <>
                  {state.posts.items.map(post => <View key={post.id} style={[styles.post, { borderColor: palette.border }]}>
                    {(post.shared_media_ids ?? []).map(mediaId => <PrivatePhotoImage
                      key={`${state.scopeKey}:${post.id}:${mediaId}`}
                      reference={privatePhotoReference({ kind: 'shared', id: mediaId })}
                      style={styles.sharedPhoto} resizeMode="contain" />)}
                    {post.content !== null && <Text style={[styles.bio, text]}>{post.content}</Text>}
                    <View style={styles.postMeta}><Text style={muted}>{relativePostTime(post.created_at)}</Text>
                      <Text accessibilityLabel={t('localization.social.likes_count', { count: post.likes_count })} style={muted}>♥ {post.likes_count}</Text>
                    </View>
                  </View>)}
                  {state.posts.nextCursor !== null && <Text style={muted}>{t('localization.social.showing_the_latest_20_posts')}</Text>}
                </> : <Text style={muted}>{t('localization.social.posts_could_not_be_loaded')}</Text>}
            </View>
          </>}
        </>}
    </ScrollView>
    <Modal visible={!!user && !unavailable && !!state.connections?.direction} transparent animationType="slide" onRequestClose={onCloseConnections}>
      <View style={styles.modalBackdrop}><View style={[styles.modal, card, { maxHeight: '80%' }]}>
        <Text style={[styles.sectionTitle, text]}>{state.connections?.direction === 'followers' ? t('localization.social.followers') : t('localization.social.following')}</Text>
        {state.connections?.status === 'loading' ? <ActivityIndicator accessibilityLabel={t('localization.social.loading_connections')} color="#19a377" /> :
          state.connections?.status === 'error' ? <Text accessibilityLiveRegion="polite" style={muted}>{t('localization.social.connections_failed')}</Text> :
          state.connections?.items.length === 0 ? <Text style={muted}>{state.connections.direction === 'followers' ? t('localization.social.no_followers_yet') : t('localization.social.not_following_anyone_yet')}</Text> :
            <FlatList data={state.connections?.items ?? []} keyExtractor={item => item.id} renderItem={({ item }) => {
              const name = item.name || item.full_name || item.username || t('localization.social.user');
              const uri = safeProfileAvatar(item.id, item.avatar_url);
              return <TouchableOpacity style={styles.connectionRow} accessibilityRole="button"
                accessibilityLabel={t('localization.social.view_named_profile', { name })}
                disabled={state.busy || state.status !== 'ready' || state.connections?.status !== 'ready' || !onOpenConnection}
                onPress={() => onOpenConnection?.(item.id)}>
                {uri ? <Image accessibilityLabel={t('localization.social.avatar', { name })} source={{ uri }} style={styles.smallAvatar} /> :
                  <View style={[styles.smallAvatar, styles.avatarFallback]}><Text style={styles.buttonText}>{name.charAt(0).toUpperCase()}</Text></View>}
                <View style={{ flex: 1 }}><Text style={text}>{name}</Text>{!!item.username && <Text style={muted}>@{item.username}</Text>}</View>
                <Text style={muted} accessibilityElementsHidden>›</Text>
              </TouchableOpacity>;
            }} />}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('localization.social.close_connections')} style={styles.touch} onPress={onCloseConnections}><Text style={text}>{t('localization.social.close')}</Text></TouchableOpacity>
      </View></View>
    </Modal>
    <Modal visible={!!blockScopeKey && blockScopeKey === state.scopeKey && !!identity && !unavailable} transparent animationType="fade" onRequestClose={() => setBlockScopeKey(null)}>
      <View style={styles.modalBackdrop}><View style={[styles.modal, card]}>
        <Text style={[styles.sectionTitle, text]}>{t('localization.social.block_named', { name: displayName })}</Text>
        <Text style={muted}>{t('localization.social.block_explanation')}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('localization.social.confirm_block')} style={[styles.button, { backgroundColor: '#B91C1C' }]}
          onPress={() => { const key = blockScopeKey; setBlockScopeKey(null); if (key) onBlockConfirm?.(key); }}><Text style={styles.buttonText}>{t('localization.social.block')}</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('localization.social.cancel_block')} style={styles.touch} onPress={() => setBlockScopeKey(null)}><Text style={text}>{t('localization.social.cancel')}</Text></TouchableOpacity>
      </View></View>
    </Modal>
    <Modal visible={rangeEditor && !unavailable && !!user} transparent animationType="fade" onRequestClose={() => setRangeEditor(false)}>
      <View style={styles.modalBackdrop}><View style={[styles.modal, card]}>
        <Text style={[styles.sectionTitle, text]}>{t('localization.social.custom_date_range')}</Text>
        <Text style={muted}>{t('localization.social.choose_1_366_calendar_days_use_yyyy_mm_dd')}</Text>
        <TextInput accessibilityLabel={t('localization.social.start_date_yyyy_mm_dd')} placeholder={t('localization.social.yyyy_mm_dd')} placeholderTextColor={palette.muted}
          value={fromDate} onChangeText={setFromDate} autoCapitalize="none" style={[styles.input, text, { borderColor: palette.border }]} />
        <TextInput accessibilityLabel={t('localization.social.end_date_yyyy_mm_dd')} placeholder={t('localization.social.yyyy_mm_dd')} placeholderTextColor={palette.muted}
          value={toDate} onChangeText={setToDate} autoCapitalize="none" style={[styles.input, text, { borderColor: palette.border }]} />
        {dateError && <Text accessibilityLiveRegion="polite" style={text}>{t('localization.social.enter_a_valid_range_of_up_to_366_days')}</Text>}
        <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => {
          if (onCustom?.(fromDate, toDate)) setRangeEditor(false); else setDateError(true);
        }}><Text style={styles.buttonText}>{t('localization.social.apply_dates')}</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.touch} onPress={() => setRangeEditor(false)}><Text style={text}>{t('localization.social.cancel')}</Text></TouchableOpacity>
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
  sharedPhoto: { width: '100%', height: 280, borderRadius: 12 },
  post: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 10 }, postMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 44 },
});


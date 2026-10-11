import React, { useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, RefreshCw, UserRound, Users, X } from 'lucide-react-native';
import type { FollowDecision, FollowRequestIdentity, InboxSnapshot } from './followRequestTypes';
import type { FollowRequestStrings } from './followRequestStrings';
import { requestKey } from './followRequestController';

/** Values come from the Community screen's existing colors, so this module has no app-global import. */
export interface FollowRequestTheme {
  background: string;
  card: string;
  text: string;
  secondary: string;
  border: string;
  primary: string;
  onPrimary: string;
  danger: string;
}
export function FollowRequestBell({ count, disabled = false, expanded, onPress, theme, strings }: {
  count: number | null;
  disabled?: boolean;
  expanded: boolean;
  onPress: () => void;
  theme: FollowRequestTheme;
  strings: FollowRequestStrings;
}) {
  const knownCount = count !== null && Number.isSafeInteger(count) && count >= 0 ? count : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={knownCount === null ? strings.bell : strings.bellCount(knownCount)}
      accessibilityHint={knownCount === null ? strings.bellUnknown : undefined}
      accessibilityState={{ disabled, expanded }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.4 : pressed ? 0.65 : 1 }]}
    >
      <Bell size={22} color={theme.secondary} accessible={false} />
      {knownCount !== null && knownCount > 0 && (
        <View style={[styles.badge, { backgroundColor: theme.primary, borderColor: theme.background }]}
          accessible={false} importantForAccessibility="no-hide-descendants">
          <Text style={[styles.badgeText, { color: theme.onPrimary }]} maxFontSizeMultiplier={1.3}>
            {knownCount > 99 ? '99+' : knownCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
function IdentityAvatar({ identity, theme }: { identity: FollowRequestIdentity; theme: FollowRequestTheme }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = identity.avatarUrl;
  return (
    <View style={[styles.avatar, { backgroundColor: theme.background, borderColor: theme.border }]}
      accessible={false} importantForAccessibility="no-hide-descendants">
      {url && url !== failedUrl ? (
        <Image source={{ uri: url }} style={styles.avatarImage} onError={() => setFailedUrl(url)} accessible={false} />
      ) : <UserRound size={23} color={theme.secondary} accessible={false} />}
    </View>
  );
}
function ActionButton({ label, accessibilityLabel, onPress, disabled = false, busy = false, primary = false, theme }: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  primary?: boolean;
  theme: FollowRequestTheme;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled, busy }}
      style={({ pressed }) => [styles.action, { borderColor: primary ? theme.primary : theme.border,
        backgroundColor: primary ? theme.primary : theme.card, opacity: disabled ? 0.6 : pressed ? 0.7 : 1 }]}>
      {busy && <ActivityIndicator size="small" color={primary ? theme.onPrimary : theme.secondary} />}
      <Text style={[styles.actionText, { color: primary ? theme.onPrimary : theme.text }]}>{label}</Text>
    </Pressable>
  );
}
export function FollowRequestInbox({ state, theme, strings, onClose, onRetry, onLoadMore, onDecision }: {
  state: InboxSnapshot;
  theme: FollowRequestTheme;
  strings: FollowRequestStrings;
  onClose: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onDecision: (row: FollowRequestIdentity, decision: FollowDecision) => void;
}) {
  const insets = useSafeAreaInsets();
  // Returning null destroys rows/images immediately on Close, unmount, and signed-out scope masking.
  if (!state.scopeKey || !state.visible) return null;
  const anyPending = Object.keys(state.pending).length > 0;
  const busy = state.status === 'loading';
  const announcement = state.announcement === 'accepted' ? strings.accepted :
    state.announcement === 'rejected' ? strings.rejected : null;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.background,
        paddingTop: insets.top, paddingBottom: insets.bottom }]}
        accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{strings.title}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={strings.close}
            style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.65 : 1 }]}>
            <X size={22} color={theme.secondary} accessible={false} />
          </Pressable>
        </View>
        <View style={styles.descriptionRow}>
          <Text style={[styles.description, { color: theme.secondary }]}>{strings.explanation}</Text>
          <Pressable onPress={onRetry} disabled={busy || anyPending || state.loadingMore}
            accessibilityRole="button" accessibilityLabel={strings.refresh}
            accessibilityState={{ disabled: busy || anyPending || state.loadingMore, busy }}
            style={({ pressed }) => [styles.iconButton, { opacity: busy || anyPending || state.loadingMore ? 0.4 : pressed ? 0.65 : 1 }]}>
            <RefreshCw size={20} color={theme.secondary} accessible={false} />
          </Pressable>
        </View>
        {announcement && <Text accessibilityLiveRegion="polite" role="status"
          style={[styles.announcement, { color: theme.text }]}>{announcement}</Text>}
        {state.status === 'loading' ? (
          <View style={styles.message} accessibilityLiveRegion="polite">
            <ActivityIndicator color={theme.primary} />
            <Text style={[styles.messageText, { color: theme.secondary }]}>{strings.loading}</Text>
          </View>
        ) : state.status === 'error' ? (
          <View style={styles.message}>
            <Text accessibilityRole="alert" style={[styles.messageText, { color: theme.text }]}>{strings.listError}</Text>
            <ActionButton label={strings.retry} onPress={onRetry} theme={theme} />
          </View>
        ) : (
          <FlatList
            data={state.items}
            keyExtractor={requestKey}
            contentContainerStyle={styles.list}
            extraData={{ pending: state.pending, rowErrors: state.rowErrors, strings }}
            ListEmptyComponent={state.status === 'ready' && state.totalPending === 0 && !state.nextCursor ? (
              <View style={styles.message}>
                <Users size={32} color={theme.secondary} accessible={false} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>{strings.emptyTitle}</Text>
                <Text style={[styles.messageText, { color: theme.secondary }]}>{strings.emptyBody}</Text>
              </View>
            ) : null}
            renderItem={({ item }) => {
              const key = requestKey(item);
              const pending = state.pending[key];
              const error = !!state.rowErrors[key];
              const name = item.displayName?.trim() || item.username?.trim() || strings.requesterFallback;
              const username = item.username?.trim().replace(/^@/, '');
              const disabled = !!pending || error || state.loadingMore;
              return (
                <View style={[styles.request, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.identity}>
                    <IdentityAvatar identity={item} theme={theme} />
                    <View style={styles.nameBlock}>
                      <Text style={[styles.name, { color: theme.text }]}>{name}</Text>
                      {!!username && <Text style={[styles.username, { color: theme.secondary }]}>@{username}</Text>}
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <ActionButton primary theme={theme} disabled={disabled} busy={pending === 'accept'}
                      label={pending === 'accept' ? strings.accepting : strings.accept}
                      accessibilityLabel={strings.acceptFor(name)} onPress={() => onDecision(item, 'accept')} />
                    <ActionButton theme={theme} disabled={disabled} busy={pending === 'reject'}
                      label={pending === 'reject' ? strings.rejecting : strings.reject}
                      accessibilityLabel={strings.rejectFor(name)} onPress={() => onDecision(item, 'reject')} />
                  </View>
                  {error && <View style={styles.rowError}>
                    <Text accessibilityRole="alert" style={[styles.errorText, { color: theme.danger }]}>{strings.itemError}</Text>
                    <ActionButton label={strings.retry} onPress={onRetry} disabled={anyPending} theme={theme} />
                  </View>}
                </View>
              );
            }}
            ListFooterComponent={state.nextCursor || state.moreError ? (
              <View style={styles.footer}>
                {state.moreError && <Text accessibilityRole="alert" style={[styles.errorText, { color: theme.danger }]}>{strings.listError}</Text>}
                <ActionButton label={state.loadingMore ? strings.loading : state.moreError ? strings.retry : strings.more}
                  onPress={state.moreError ? onRetry : onLoadMore} busy={state.loadingMore} disabled={state.loadingMore || anyPending} theme={theme} />
              </View>
            ) : null}
          />
        )}
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: 21, fontWeight: '700', paddingVertical: 8 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badge: { position: 'absolute', top: 0, right: 0, minWidth: 19, minHeight: 19, paddingHorizontal: 4,
    borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  descriptionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 8 },
  description: { fontSize: 14, lineHeight: 21, flex: 1 },
  announcement: { marginHorizontal: 16, marginTop: 8, fontSize: 14 },
  list: { padding: 16, flexGrow: 1 },
  request: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%' },
  nameBlock: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  username: { fontSize: 14, marginTop: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  action: { minWidth: 104, minHeight: 44, paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  message: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40, gap: 16 },
  messageText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  rowError: { marginTop: 12, gap: 10, alignItems: 'flex-start' },
  errorText: { fontSize: 14, lineHeight: 21 },
  footer: { gap: 12, paddingVertical: 12, alignItems: 'center' },
});

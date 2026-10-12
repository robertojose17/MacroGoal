import React from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { IncomingFollowerSnapshot } from './incomingFollowerController';

interface Props {
  state: IncomingFollowerSnapshot;
  name: string;
  unavailable?: boolean;
  onClose(): void;
  onViewProfile(): void;
  onBeginRemove(): void;
  onConfirmRemove(key: string): void;
  onCancelRemove(): void;
  onRetry(): void;
}
/** Identity-only relationship menu. No profile/posts/nutrition reads are required. */
export function FollowerActionsSheet({ state, name, unavailable, onClose, onViewProfile,
  onBeginRemove, onConfirmRemove, onCancelRemove, onRetry }: Props) {
  const { i18n } = useTranslation();
  const es = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('es');
  const dark = useColorScheme() === 'dark';
  const color = dark ? '#f9fafb' : '#111827';
  const busy = state.status === 'loading' || state.status === 'removing';
  const label = es ? 'Quitar seguidor' : 'Remove follower';
  const confirming = !unavailable && state.status === 'confirming';
  const button = (text: string, action: () => void, destructive = false, disabled = false) =>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={text} disabled={disabled}
      style={[styles.button, destructive && styles.destructive, disabled && styles.disabled]} onPress={action}>
      <Text style={{ color: destructive ? '#fff' : color, fontWeight: '600' }}>{text}</Text>
    </TouchableOpacity>;
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: dark ? '#1f2937' : '#fff' }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={[styles.title, { color }]}>{unavailable ? (es ? 'Seguidor' : 'Follower') : confirming ? (es ? `¿Quitar a ${name}?` : `Remove ${name}?`) : name}</Text>
        {unavailable ? <Text style={{ color }} accessibilityLiveRegion="polite">{es ? 'La relación no está disponible.' : 'Relationship is unavailable.'}</Text> : confirming ? <>
          <Text style={{ color }}>{es
            ? 'Perderá el acceso que tiene como seguidor y podrá enviarte una nueva solicitud. Esto no cambia si tú sigues a esta persona.'
            : 'This person will lose their follower access and can send you a new request. This does not change whether you follow them.'}</Text>
          {button(label, () => { if (state.confirmationKey) onConfirmRemove(state.confirmationKey); }, true, !state.confirmationKey)}
          {button(es ? 'Cancelar' : 'Cancel', onCancelRemove)}
        </> : <>
          {state.status === 'loading' && <View accessibilityLiveRegion="polite"><ActivityIndicator /><Text style={{ color }}>{es ? 'Comprobando la relación…' : 'Checking relationship…'}</Text></View>}
          {state.status === 'removing' && <View accessibilityLiveRegion="polite"><ActivityIndicator /><Text style={{ color }}>{es ? 'Quitando seguidor…' : 'Removing follower…'}</Text></View>}
          {state.status === 'removed' && <Text style={{ color }} accessibilityLiveRegion="polite">{es ? 'Seguidor eliminado.' : 'Follower removed.'}</Text>}
          {state.status === 'not_following' && <Text style={{ color }} accessibilityLiveRegion="polite">{es ? 'Esta persona ya no es tu seguidor.' : 'This person is no longer your follower.'}</Text>}
          {state.status === 'unconfirmed' && <Text style={{ color }} accessibilityLiveRegion="polite">{state.reconciledNotFollowing
            ? (es ? 'No se pudo confirmar la acción. Esta persona ya no figura como tu seguidor.' : 'The action could not be confirmed. This person is no longer listed as your follower.')
            : (es ? 'No se pudo confirmar la acción. Comprueba la relación antes de volver a intentarlo.' : 'The action could not be confirmed. Check the relationship before trying again.')}</Text>}
          {state.status === 'error' && <Text style={{ color }} accessibilityLiveRegion="polite">{es ? 'No se pudo comprobar la relación.' : 'The relationship could not be checked.'}</Text>}
          {state.status === 'ready' && state.descriptor && button(label, onBeginRemove, true)}
          {(state.status === 'error' || state.status === 'unconfirmed') && button(es ? 'Comprobar de nuevo' : 'Check again', onRetry)}
          {button(es ? 'Ver perfil' : 'View profile', onViewProfile, false, busy)}
          <Text style={{ color, fontSize: 13 }}>{es ? 'También puedes bloquear a esta persona desde su perfil.' : 'You can also block this person from their profile.'}</Text>
        </>}
        {!confirming && button(es ? 'Cerrar' : 'Close', onClose)}
      </ScrollView>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 18, maxHeight: '85%' }, content: { padding: 22, gap: 14 },
  title: { fontSize: 20, fontWeight: '700' },
  button: { minHeight: 48, borderRadius: 10, padding: 14, alignItems: 'center', justifyContent: 'center' },
  destructive: { backgroundColor: '#b91c1c' }, disabled: { opacity: 0.5 },
});

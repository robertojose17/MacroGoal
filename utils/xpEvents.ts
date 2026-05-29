/**
 * XP Event Bus
 *
 * Lightweight DeviceEventEmitter wrapper so any screen can trigger a dashboard
 * XP refresh without importing the dashboard hook directly.
 */

import { DeviceEventEmitter } from 'react-native';

export const XP_EVENTS = {
  REFRESH: 'xp:refresh',
} as const;

export function emitXpRefresh(): void {
  console.log('[xpEvents] emitting xp:refresh');
  DeviceEventEmitter.emit(XP_EVENTS.REFRESH);
}

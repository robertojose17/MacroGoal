/**
 * XP / Activity Event Bus
 *
 * Lightweight DeviceEventEmitter wrapper so any screen can trigger reactive
 * updates (XP refresh, challenge progress recompute, etc.) without importing
 * the consumer hooks directly.
 */

import { DeviceEventEmitter } from 'react-native';

export const XP_EVENTS = {
  REFRESH: 'xp:refresh',
  MEAL_LOGGED: 'meal:logged',
} as const;

export function emitXpRefresh(): void {
  console.log('[xpEvents] emitting xp:refresh');
  DeviceEventEmitter.emit(XP_EVENTS.REFRESH);
}

export function emitMealLogged(): void {
  console.log('[xpEvents] emitting meal:logged');
  DeviceEventEmitter.emit(XP_EVENTS.MEAL_LOGGED);
}

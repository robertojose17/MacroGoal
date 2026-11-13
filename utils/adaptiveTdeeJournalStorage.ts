import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { AdaptiveJournalStorage } from './adaptiveTdeeJournal';

const nativeFlights = new Map<string, Promise<void>>();
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication: false };
const nativeAvailable = async () => {
  if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || !await SecureStore.isAvailableAsync()) throw Error('adaptive_journal_unavailable');
};
/** Single native JS runtime; cross-device correctness remains authoritative on the server. */
const native: AdaptiveJournalStorage = {
  async read(key) { await nativeAvailable(); return SecureStore.getItemAsync(key,options); },
  async transact(key,update) {
    const previous = nativeFlights.get(key) ?? Promise.resolve();
    const flight = previous.catch(() => {}).then(async () => {
      await nativeAvailable();
      const next = update(await SecureStore.getItemAsync(key,options));
      if (next === null) await SecureStore.deleteItemAsync(key,options);
      else await SecureStore.setItemAsync(key,next,options);
      if (await SecureStore.getItemAsync(key,options) !== next) throw Error('adaptive_journal_unverified');
    });
    nativeFlights.set(key,flight);
    try { await flight; } finally { if (nativeFlights.get(key) === flight) nativeFlights.delete(key); }
  },
};
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    if (typeof indexedDB === 'undefined') { reject(Error('adaptive_journal_unavailable')); return; }
    const request = indexedDB.open('macrogoal-request-identities',1);
    request.onupgradeneeded = () => { request.result.createObjectStore('adaptive'); };
    request.onerror = () => reject(Error('adaptive_journal_unavailable'));
    request.onblocked = () => reject(Error('adaptive_journal_busy'));
    request.onsuccess = () => resolve(request.result);
  });
}
/** IndexedDB serializes read/write transactions across tabs. Only request identities are stored. */
const web: AdaptiveJournalStorage = {
  async read(key) {
    const db = await openDatabase();
    try {
      return await new Promise<string | null>((resolve,reject) => {
        const tx = db.transaction('adaptive','readonly');
        const request = tx.objectStore('adaptive').get(key);
        let result: string | null = null;
        request.onsuccess = () => { if (request.result !== undefined && typeof request.result !== 'string') { tx.abort(); return; } result = request.result ?? null; };
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(Error('adaptive_journal_unavailable'));
      });
    } finally { db.close(); }
  },
  async transact(key,update) {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve,reject) => {
        const tx = db.transaction('adaptive','readwrite');
        const store = tx.objectStore('adaptive'), request = store.get(key);
        let failure: unknown;
        request.onsuccess = () => {
          try {
            if (request.result !== undefined && typeof request.result !== 'string') throw Error('adaptive_journal_invalid');
            const next = update(request.result ?? null);
            if (next === null) store.delete(key); else store.put(next,key);
          } catch (error) { failure = error; tx.abort(); }
        };
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(failure ?? Error('adaptive_journal_unavailable'));
      });
    } finally { db.close(); }
  },
};
export const adaptiveTdeeJournalStorage = Platform.OS === 'web' ? web : native;

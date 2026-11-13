import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { createGoalRequestJournal } from './goalRequestJournal';

/** Source configuration is not proof of a built artifact; native QA remains required. */
export function createSecureGoalRequestJournal(project: string, nativeConfigurationDeclared: boolean) {
  const ensureSupported = async () => {
    if (!nativeConfigurationDeclared || (Platform.OS !== 'ios' && Platform.OS !== 'android') || !await SecureStore.isAvailableAsync()) throw new Error('secure_goal_journal_not_ready');
  };
  const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication: false };
  const witnessKey = (key: string) => key + '.presence';
  const checkHead = async (key: string, value: string | null) => {
    if (!key.endsWith('.head')) return value;
    // Only presence is stored here, never health data, payloads, credentials or CAS.
    // Android SecureStore can silently return null after a lost/invalidated key.
    const witness = await AsyncStorage.getItem(witnessKey(key));
    if ((value === null && witness !== null) || (value !== null && witness !== 'present')) throw new Error('goal_journal_key_or_storage_lost_review_required');
    return value;
  };
  return createGoalRequestJournal({ project, newGeneration: randomUUID,
    digest: value => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
    storage: {
      async get(key) { await ensureSupported(); return checkHead(key, await SecureStore.getItemAsync(key,options)); },
      async set(key,value) {
        await ensureSupported();
        if (key.endsWith('.head')) {
          await AsyncStorage.setItem(witnessKey(key),'present');
          if (await AsyncStorage.getItem(witnessKey(key)) !== 'present') throw new Error('goal_journal_presence_unverified');
        }
        await SecureStore.setItemAsync(key,value,options);
      },
      async remove(key) {
        await ensureSupported(); await SecureStore.deleteItemAsync(key,options);
        if (key.endsWith('.head')) {
          if (await SecureStore.getItemAsync(key,options) !== null) throw new Error('goal_journal_cleanup_unverified');
          await AsyncStorage.removeItem(witnessKey(key));
          if (await AsyncStorage.getItem(witnessKey(key)) !== null) throw new Error('goal_journal_cleanup_unverified');
        }
      },
    },
  });
}

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { hideAsync } from 'expo-splash-screen';
import {
  ATTEMPT_KEY, TEST_EMAIL, TEST_ID, createTestProfileRetry,
  type Readiness, type TestAuthorization,
} from './TestProfileRetryController';

// No app client/root/provider import: the normal client logs a key suffix.
// Never display, log, persist separately, or pass credentials to diagnostic tools.
function createRuntime() {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return null;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://esgptfiofoaeguslgvcq.supabase.co';
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (url.replace(/\/$/, '') !== 'https://esgptfiofoaeguslgvcq.supabase.co' || !key) return null;
  const client = createClient(url, key, {
    auth: { storage: AsyncStorage, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, debug: false },
  });
  async function authorize(): Promise<TestAuthorization | null> {
    const sessionResult = await client.auth.getSession();
    const token = sessionResult.data.session?.access_token;
    if (sessionResult.error || !token) return null;
    // getUser(token) validates with the Auth server; decoded/local session claims do not authorize.
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    const id = data.user.id;
    const email = data.user.email;
    // Bind subsequent calls to this exact validated token, unaffected by session changes.
    const bound = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, debug: false },
    });
    return {
      id, email,
      async invokeOnce() {
        if (id !== TEST_ID || email !== TEST_EMAIL) return false;
        const result = await bound.functions.invoke('create-user-profile', { body: { name: 'Test' } });
        // Discard the returned user payload and raw error; only preserve a boolean.
        return !result.error && result.data?.success === true;
      },
      async selectOwnId() {
        if (id !== TEST_ID || email !== TEST_EMAIL) return 'unknown';
        const result = await bound.from('users').select('id').eq('id', TEST_ID).maybeSingle();
        if (result.error) return 'unknown';
        if (result.data === null) return 'absent';
        return result.data.id === TEST_ID ? 'present' : 'unknown';
      },
    };
  }
  return {
    controller: createTestProfileRetry({
      readMarker: () => AsyncStorage.getItem(ATTEMPT_KEY),
      writeMarker: value => AsyncStorage.setItem(ATTEMPT_KEY, value),
      authorize,
    }, true),
    async signIn(password: string) {
      const { error } = await client.auth.signInWithPassword({ email: TEST_EMAIL, password });
      return !error;
    },
  };
}

// Preserve the in-memory gate across component remounts. The storage marker also
// survives normal app reloads. Run in only one app instance; do not clear app data.
let runtime: ReturnType<typeof createRuntime> | undefined;
function getRuntime() {
  if (runtime === undefined) {
    try { runtime = createRuntime(); } catch { runtime = null; }
  }
  return runtime;
}

const messages: Record<Readiness, string> = {
  ready: 'Test identity verified. The one-time profile retry is available.',
  'sign-in-required': 'Sign in to the existing Test account to continue.',
  'other-account': 'Blocked: another account is signed in. Sign in as Test below. No profile request has been made.',
  locked: 'Blocked: this local attempt is reserved, already used, or could not be checked safely. No further retry is available.',
};

function RetryScreen() {
  const [service] = useState(getRuntime);
  const [password, setPassword] = useState('');
  const [readiness, setReadiness] = useState<Readiness>('locked');
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState('Checking Test sign-in and the local attempt marker…');
  useEffect(() => {
    let active = true;
    void hideAsync().catch(() => undefined);
    if (!service) {
      setStatus('Blocked: the approved development configuration is unavailable.');
      setBusy(false);
      return;
    }
    void service.controller.inspect().then(state => {
      if (active) { setReadiness(state); setStatus(messages[state]); setBusy(false); }
    });
    return () => { active = false; };
  }, [service]);

  // This button must be submitted manually by the user. Never automate password entry.
  async function signIn() {
    if (!service || busy || !password || readiness === 'locked') return;
    const enteredPassword = password;
    setPassword('');
    setBusy(true);
    setStatus('Signing in to Test…');
    try {
      if (!await service.signIn(enteredPassword)) {
        setStatus('Test sign-in was not completed. Check the entered password.');
        return;
      }
      const state = await service.controller.inspect();
      setReadiness(state);
      setStatus(messages[state]);
    } catch {
      setStatus('Test sign-in could not be verified. No profile request was made.');
    } finally { setBusy(false); }
  }

  async function retry() {
    if (!service || busy || readiness !== 'ready') return;
    setBusy(true);
    setReadiness('locked');
    setPassword('');
    setStatus('Reserving this one attempt, revalidating Test, and checking the result…');
    const result = await service.controller.retry();
    if (result.kind === 'blocked') {
      setStatus('Blocked safely. No further retry is available from this screen.');
    } else {
      const handler = result.handlerAccepted ? 'Handler reported success.' : 'Handler did not report confirmed success.';
      const row = result.profile === 'present' ? 'Test profile row exists (own ID verified).'
        : result.profile === 'absent' ? 'Test profile row was not visible in the own-ID check.'
          : 'Test profile existence could not be verified.';
      setStatus(`${handler} ${row} This local attempt is now locked.`);
    }
    setBusy(false);
  }

  return <SafeAreaProvider><SafeAreaView style={styles.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text style={styles.banner}>TEST PROFILE RETRY · DEV ONLY</Text>
    <Text style={styles.title}>One approved Test retry</Text>
    <Text>Existing Test account only. One create-user-profile request, then an own-ID check. No reset is available.</Text>
    <Text style={styles.label}>Test email (fixed)</Text>
    <TextInput accessibilityLabel="Test email, read only" value={TEST_EMAIL} editable={false} style={styles.input} />
    {(readiness === 'sign-in-required' || readiness === 'other-account') && <View>
      <Text style={styles.label}>Password · enter and submit this yourself</Text>
      <TextInput accessibilityLabel="Existing Test password" secureTextEntry value={password} onChangeText={setPassword}
        editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" style={styles.input} />
      <Pressable accessibilityRole="button" accessibilityLabel="Sign in as existing Test" disabled={busy || !password}
        onPress={() => { void signIn(); }} style={[styles.button, (busy || !password) && styles.disabled]}><Text style={styles.buttonText}>Sign in as existing Test</Text></Pressable>
    </View>}
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Run one approved Test profile retry" disabled={busy || readiness !== 'ready'}
      onPress={() => { void retry(); }} style={[styles.button, (busy || readiness !== 'ready') && styles.disabled]}><Text style={styles.buttonText}>Run one approved Test profile retry</Text></Pressable>
    <Text style={styles.note}>Keep this screen in one app instance. Do not clear its storage or reopen in another browser/device to repeat an attempt.</Text>
  </ScrollView></SafeAreaView></SafeAreaProvider>;
}

export default function TestProfileRetryScreen() {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return null;
  return <RetryScreen />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f8fa' }, content: { padding: 24, gap: 12, maxWidth: 600, width: '100%', alignSelf: 'center' },
  banner: { padding: 12, backgroundColor: '#fff1b8', color: '#503b00', fontWeight: '700' }, title: { fontSize: 25, fontWeight: '700' },
  label: { fontWeight: '600', marginTop: 12, marginBottom: 6 }, input: { borderWidth: 1, borderColor: '#8a939f', borderRadius: 8, padding: 12, backgroundColor: '#fff', color: '#17212f' },
  button: { backgroundColor: '#214eb7', padding: 15, borderRadius: 8, marginTop: 12 }, disabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontWeight: '700', textAlign: 'center' }, status: { padding: 14, backgroundColor: '#e8edf5', lineHeight: 23 },
  note: { color: '#536070', lineHeight: 21 },
});

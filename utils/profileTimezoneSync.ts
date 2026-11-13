import { supabase } from '@/lib/supabase/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Device timezone sync is owner-scoped and caches only a verified server value. */
export async function syncProfileTimezone(owner: string, isCurrent: () => boolean) {
  if (!owner || !isCurrent()) return;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!timezone) throw new Error('timezone_unavailable');
  new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  const key = `user_timezone_synced:${owner}`;
  const cached = await AsyncStorage.getItem(key);
  if (!isCurrent()) return;
  const auth = await supabase.auth.getUser();
  if (auth.error || auth.data.user?.id !== owner || !isCurrent()) return;
  if (cached === timezone) return;
  const { data, error } = await supabase.from('users').update({ timezone }).eq('id', owner).select('id,timezone').maybeSingle();
  if (error || data?.id !== owner || data.timezone !== timezone) throw new Error('timezone_sync_unverified');
  const latest = await supabase.auth.getUser();
  if (latest.error || latest.data.user?.id !== owner || !isCurrent()) return;
  await AsyncStorage.setItem(key, timezone);
}

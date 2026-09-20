import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePremium } from '@/hooks/usePremium';

const STORAGE_KEY = 'recipe_daily_limit';
const FREE_LIMIT = 1;

export function useRecipeLimit() {
  const { isPremium } = usePremium();

  const getTodayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };

  const canOpen = async (): Promise<boolean> => {
    if (isPremium) return true;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return true;
      const { date, count } = JSON.parse(raw);
      if (date !== getTodayKey()) return true; // new day, reset
      return count < FREE_LIMIT;
    } catch {
      return true;
    }
  };

  const recordOpen = async (): Promise<void> => {
    if (isPremium) return;
    try {
      const today = getTodayKey();
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      let count = 0;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.date === today) count = parsed.count;
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, count: count + 1 }));
    } catch {}
  };

  return { canOpen, recordOpen };
}

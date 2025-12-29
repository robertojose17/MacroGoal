
import { useColorScheme as useRNColorScheme } from 'react-native';

export function useColorScheme() {
  // FIXED: Always return 'light' to force the new light palette on all platforms
  // This ensures iOS doesn't use dark theme colors
  return 'light';
}

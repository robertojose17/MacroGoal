import type { ColorSchemeName } from 'react-native';

// Keep the public hook compatible with React Native's theme API so consumers
// can retain both palette branches. The implementation intentionally forces
// light on every platform; this type contract does not enable dark mode.
export function useColorScheme(): ColorSchemeName {
  // FIXED: Always return 'light' to force the new light palette on all platforms
  // This ensures iOS doesn't use dark theme colors
  return 'light' as const;
}

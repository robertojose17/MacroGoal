import type { ColorSchemeName } from 'react-native';
import { useColorScheme } from '../../hooks/useColorScheme';

type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
export type ColorSchemeContract = Assert<Equal<ReturnType<typeof useColorScheme>, ColorSchemeName>>;

// Compile-only: theme-aware consumers can retain their palette branches.
export function useThemeContract() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  // @ts-expect-error The public API is a finite native theme type, not any/string.
  const invalid: ReturnType<typeof useColorScheme> = 'sepia';
  return { isDark, invalid };
}

import type MaterialIcons from '@expo/vector-icons/MaterialIcons';

type ExpoMaterialIconName = keyof typeof MaterialIcons.glyphMap;
type UnderscoreAlias<Name extends string> =
  Name extends `${infer Head}-${infer Tail}`
    ? `${Head}_${UnderscoreAlias<Tail>}`
    : Name;

// Google ligatures use underscores; Expo's glyph names use hyphens.
// Both accepted forms are derived from the installed finite glyph-name union.
export type MaterialIconName = ExpoMaterialIconName | UnderscoreAlias<ExpoMaterialIconName>;

function isExpoMaterialIconName(
  name: string,
  glyphMap: typeof MaterialIcons.glyphMap,
): name is ExpoMaterialIconName {
  return Object.prototype.hasOwnProperty.call(glyphMap, name);
}

export function normalizeMaterialIconName(
  name: MaterialIconName,
  glyphMap: typeof MaterialIcons.glyphMap,
): ExpoMaterialIconName {
  // Preserve every existing canonical name before considering an alias.
  if (isExpoMaterialIconName(name, glyphMap)) return name;
  const normalized = name.replace(/_/g, '-');
  if (isExpoMaterialIconName(normalized, glyphMap) && normalized.replace(/-/g, '_') === name) {
    return normalized;
  }
  // Only reachable from untyped input or an incompatible runtime glyph map.
  throw new Error(`Unsupported Material icon: ${name}`);
}

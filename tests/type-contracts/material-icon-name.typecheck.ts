import type MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { normalizeMaterialIconName, type MaterialIconName } from '../../utils/materialIconName';

export function checkMaterialIconContract(glyphMap: typeof MaterialIcons.glyphMap) {
  const names: MaterialIconName[] = ['calendar-today', 'calendar_today', 'local_fire_department', 'home'];
  const normalized: (keyof typeof MaterialIcons.glyphMap)[] =
    names.map(name => normalizeMaterialIconName(name, glyphMap));
  // @ts-expect-error A made-up icon is not in either finite name union.
  normalizeMaterialIconName('not_a_real_material_icon', glyphMap);
  // @ts-expect-error Arbitrary strings must not bypass validation.
  const invalid: MaterialIconName = 'calendar_tomorrow';
  return { normalized, invalid };
}

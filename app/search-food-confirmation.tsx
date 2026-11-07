import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { searchPackageBarcode } from '@/utils/searchSelectionSafety';
import { recoveryRouteContext } from '@/utils/recoveryRouteContext';

/** No lookup, provider/model call, nutrient adaptation or save occurs on this screen. */
export default function SearchFoodConfirmation() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { i18n } = useTranslation();
  const es = i18n.language.startsWith('es');
  const tr = (en: string, spanish: string) => es ? spanish : en;
  // The current app palette is fixed light by its useColorScheme hook.
  const textColor = colors.text;
  // Malformed/direct route inputs fail closed. This reason is UI guidance, not mass proof.
  const canReview = params.reason === 'mass_unverified';
  const needsUpdate = params.reason === 'update_required';
  const catalogAmbiguous = params.reason === 'catalog_ambiguous';
  const barcode = searchPackageBarcode(params.barcode);
  const context = recoveryRouteContext(params);
  const photo = () => { if (canReview && barcode) router.replace({ pathname: '/food-photo-capture', params: { ...context, barcode, type: 'new_product' } }); };
  const manual = () => { if (canReview) router.replace({ pathname: '/my-foods-create', params: { ...context, recoveryManual: '1' } }); };
  const button = (label: string, onPress: () => void) => <TouchableOpacity onPress={onPress} style={{ padding: 16, marginTop: 12, borderRadius: 12, backgroundColor: colors.primary }}><Text style={{ color: '#FFFFFF', fontWeight: '600', textAlign: 'center' }}>{label}</Text></TouchableOpacity>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <Text style={{ color: textColor, fontSize: 24, fontWeight: '700', marginBottom: 16 }}>{needsUpdate ? tr('Update MacroGoal', 'Actualiza MacroGoal') : catalogAmbiguous ? tr('Conflicting catalog records', 'Registros de catálogo en conflicto') : canReview ? tr('Confirm nutrition label', 'Confirma la etiqueta nutricional') : tr('Volume-only portions need more support', 'Las porciones solo en volumen necesitan soporte adicional')}</Text>
      <Text style={{ color: textColor, fontSize: 16, lineHeight: 24 }}>{needsUpdate ? tr('Update MacroGoal to review this food safely. Nothing has been added. Go back and update the app before trying again.', 'Actualiza MacroGoal para revisar este alimento de forma segura. No se ha añadido nada. Vuelve y actualiza la app antes de intentarlo de nuevo.') : catalogAmbiguous ? tr('This barcode has a conflicting or reserved catalog identity. A photo or manual entry cannot safely resolve this in the current flow. Nothing has been chosen or added. Go back and choose a separately verified food; these catalog records need a separate review.', 'Este código tiene una identidad en conflicto o reservada en el catálogo. Una foto o el ingreso manual no pueden resolverla de forma segura en el flujo actual. No se ha elegido ni añadido nada. Vuelve y elige un alimento verificado por separado; estos registros necesitan una revisión independiente.') : canReview
        ? tr('This search result does not establish a serving weight in grams and a matching nutrition basis. Nothing has been added. Review a label with explicit serving grams before saving. If your label only gives ml and no verified gram weight, these flows cannot save it safely yet. Do not convert ml to grams or guess a weight.', 'Este resultado no establece el peso de la porción en gramos y la base nutricional correspondiente. No se ha añadido nada. Revisa una etiqueta con gramos explícitos por porción antes de guardar. Si tu etiqueta solo indica ml y no un peso verificado en gramos, estas opciones aún no pueden guardarla de forma segura. No conviertas ml a gramos ni adivines el peso.')
        : tr('This result lists a volume without a verified gram weight. MacroGoal cannot safely save this volume-only portion through the current photo or manual flow. Nothing has been added. Do not assume 1 ml equals 1 g. True volume support is still needed; return to search or use a separately verified gram-based food.', 'Este resultado indica volumen sin un peso verificado en gramos. MacroGoal no puede guardar esta porción solo en volumen de forma segura con las opciones actuales de foto o ingreso manual. No se ha añadido nada. No supongas que 1 ml equivale a 1 g. Aún se necesita soporte real de volumen; vuelve a la búsqueda o usa un alimento verificado por gramos.')}</Text>
      {canReview && barcode && button(tr('Review a label photo', 'Revisar una foto de la etiqueta'), photo)}
      {canReview && button(tr('I have serving grams: enter manually', 'Tengo los gramos por porción: ingresar manualmente'), manual)}
      {button(tr('Back to search', 'Volver a la búsqueda'), () => router.back())}
    </ScrollView>
  </SafeAreaView>;
}

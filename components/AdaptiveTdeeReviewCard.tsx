import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAdaptiveTdeeReview } from '@/hooks/useAdaptiveTdeeReview';

/** No auto-accept. Hidden until the independent adaptive rollout is explicitly enabled. */
export default function AdaptiveTdeeReviewCard({userId,isDark}: {userId:string;isDark:boolean}) {
  const review = useAdaptiveTdeeReview(userId);
  const {i18n} = useTranslation(), spanish = i18n.language.startsWith('es');
  if (!review.enabled && !review.pending && review.result?.status !== 'committed') return null;
  const p = review.program?.proposal, state = review.result?.status;
  if (!p && !review.error && !['pending','blocked','rejected','committed'].includes(state ?? '')) return null;
  const color = isDark ? '#FFFFFF' : '#202124';
  const pending = review.pending && state !== 'rejected';
  return <View style={[styles.card,{backgroundColor:isDark ? '#1C1C1E' : '#FFFFFF'}]}>
    <Text style={[styles.title,{color}]}>{spanish ? 'Revisión de tus metas' : 'Your target review'}</Text>
    {p && !pending && state !== 'blocked' && state !== 'rejected' && state !== 'committed' && <>
      <Text style={{color}}>{spanish ? 'Meta diaria actual' : 'Current daily target'}: {p.current.calories} kcal</Text>
      <Text style={[styles.title,{color}]}>{spanish ? 'Propuesta' : 'Proposed'}: {p.target.calories} kcal ({p.deltaKcal > 0 ? '+' : ''}{p.deltaKcal})</Text>
      <Text style={{color}}>{spanish ? 'Proteína' : 'Protein'} {p.target.proteinG} g · {spanish ? 'Carbohidratos' : 'Carbs'} {p.target.carbsG} g · {spanish ? 'Grasa' : 'Fat'} {p.target.fatsG} g</Text>
      <Text style={{color}}>{spanish ? 'Basado en datos hasta' : 'Based on data through'} {p.sourceDate}. {spanish ? 'Tus metas no cambian hasta que aceptes.' : 'Your targets stay unchanged until you accept.'}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={review.busy} onPress={() => { void review.accept(); }} style={styles.button}>
        <Text style={styles.buttonText}>{spanish ? 'Aceptar estas metas' : 'Accept these targets'}</Text>
      </TouchableOpacity>
    </>}
    {state === 'committed' && <Text style={{color}}>{spanish ? 'Metas guardadas. Foods y las demás pantallas usan tu meta activa.' : 'Targets saved. Foods and the other screens use your active target.'}</Text>}
    {pending && <>
      <Text style={{color}}>{spanish ? 'Hay una revisión sin resolver. Verifica su resultado antes de empezar otra.' : 'A review is unresolved. Check its result before starting another.'}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={review.busy} onPress={() => { void review.retry(); }} style={styles.button}>
        <Text style={styles.buttonText}>{spanish ? 'Verificar y reintentar esta revisión' : 'Check and retry this review'}</Text>
      </TouchableOpacity>
    </>}
    {state === 'rejected' && <>
      <Text style={{color}}>{spanish ? 'Esta propuesta ya no se puede aplicar. Tus metas no se cambiaron con esta solicitud.' : 'This proposal can no longer be applied. This request did not change your targets.'}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={review.busy} onPress={() => { void review.acknowledge(); }} style={styles.button}>
        <Text style={styles.buttonText}>{spanish ? 'Revisar de nuevo' : 'Review again'}</Text>
      </TouchableOpacity>
    </>}
    {state === 'blocked' && !pending && <>
      <Text style={{color}}>{spanish ? 'La propuesta necesita una nueva revisión antes de aplicarse.' : 'This proposal needs a fresh review before it can be applied.'}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={review.busy} onPress={() => { void review.refresh(); }} style={styles.button}>
        <Text style={styles.buttonText}>{spanish ? 'Actualizar revisión' : 'Refresh review'}</Text>
      </TouchableOpacity>
    </>}
    {review.error && <Text style={{color}}>{spanish ? 'No pudimos verificar la revisión. No vuelvas a enviar una nueva solicitud todavía.' : 'We could not verify this review. Do not submit a new request yet.'}</Text>}
    {review.busy && <ActivityIndicator />}
  </View>;
}
const styles = StyleSheet.create({card:{borderRadius:16,padding:16,gap:10},title:{fontSize:18,fontWeight:'700'},button:{backgroundColor:'#357A87',borderRadius:10,padding:12},buttonText:{color:'#FFFFFF',fontWeight:'600',textAlign:'center'}});

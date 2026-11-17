import React,{useCallback} from 'react';
import {Text,TouchableOpacity,View} from 'react-native';
import {useRouter} from 'expo-router';
import {useTranslation} from 'react-i18next';
import {supabase} from '@/lib/supabase/client';
import {colors} from '@/styles/commonStyles';
import {useTdeeDashboardAttention} from '@/hooks/useTdeeDashboardAttention';
import {dashboardAttentionView} from '@/utils/tdeeDashboardAttention';
import {premiumEntry} from '@/utils/premiumCheckpoints';
import {PremiumCheckpointInline} from './PremiumCheckpointInline';
import {TdeeRules14ReviewEntry} from './TdeeRules14ReviewEntry';
import {TdeeMacroChoice} from './TdeeMacroChoice';
/** Attention is server-evaluated; coverage alone never generates an upsell or recommendation. */
export function TdeeDashboardReviewCard({ownerId,isDark}:{ownerId?:string;isDark:boolean}){
 const api=useTdeeDashboardAttention(ownerId),view=dashboardAttentionView(api.value),router=useRouter(),{i18n}=useTranslation();
 const es=i18n.language.startsWith('es'),label=(en:string,sp:string)=>es?sp:en,text=isDark?colors.textDark:colors.text;
 const setup=api.value?.reason==='baseline_required',reconfirm=api.value?.reason==='baseline_reconfirmation_required';
 const refreshVerifiedGoal=useCallback(async()=>{
  const actor=ownerId;if(!actor)throw Error('rules14_account_changed');
  const before=await supabase.auth.getUser();if(before.error||before.data.user?.id!==actor)throw Error('rules14_account_changed');
  const [profile,goals]=await Promise.all([supabase.from('users').select('*').eq('id',actor).maybeSingle(),supabase.from('goals').select('*').eq('user_id',actor).eq('is_active',true).limit(2)]);
  const after=await supabase.auth.getUser();
  if(after.error||after.data.user?.id!==actor||profile.error||profile.data?.id!==actor||goals.error||goals.data?.length!==1||goals.data[0].user_id!==actor||goals.data[0].is_active!==true)throw Error('rules14_goal_unavailable');
  return {profile:profile.data,goal:goals.data[0]};
 },[ownerId]);
 return <View>
  {view.attention&&<View style={{padding:16,gap:10,borderRadius:16,backgroundColor:isDark?colors.cardDark:colors.card}}>
   <Text style={{color:text,fontWeight:'700',fontSize:18}}>{label('Your weight trend needs a review','Tu tendencia de peso necesita una revisión')}</Text>
   <Text style={{color:text}}>{view.premium?label('Your recorded data indicates a target review is worth considering. Review the proposal before choosing whether to change anything.','Tus datos registrados indican que conviene revisar tus metas. Revisa la propuesta antes de elegir si deseas cambiar algo.'):label('Your recorded data indicates a target review is worth considering. Premium lets you review a recommendation and choose whether to accept it. Your current targets have not changed.','Tus datos registrados indican que conviene revisar tus metas. Premium permite revisar una recomendación y elegir si la aceptas. Tus metas actuales no han cambiado.')}</Text>
   {!view.premium&&<PremiumCheckpointInline source="feature_gate" screen="dashboard">{flow=><TouchableOpacity accessibilityRole="button" onPress={()=>router.push(premiumEntry('feature_gate',false,flow))} style={{padding:12,borderWidth:1,borderColor:colors.primary,borderRadius:10}}><Text style={{color:colors.primary}}>{label('Explore Premium','Ver Premium')}</Text></TouchableOpacity>}</PremiumCheckpointInline>}
   {view.premium&&<TdeeMacroChoice userId={ownerId} isDark={isDark}/>}
  </View>}
  {view.baseline&&view.premium&&<View style={{padding:16,gap:8}}>
   <Text style={{color:text,fontWeight:'600'}}>{label('Review your analysis baseline','Revisa la base de tu análisis')}</Text>
   <Text style={{color:text}}>{reconfirm?label('Your saved targets need a verified baseline before an adjustment can be proposed. Opening the editor changes nothing. Saving new accepted targets starts a new 14-day period.','Tus metas guardadas necesitan una base verificada antes de proponer un ajuste. Abrir el editor no cambia nada. Guardar nuevas metas aceptadas inicia otro período de 14 días.'):label('The analysis baseline has not yet been verified. Reviewing setup checks your already accepted targets; it does not accept a calorie change or restart their original date.','La base del análisis todavía no se ha verificado. Revisar la configuración comprueba tus metas ya aceptadas; no acepta un cambio de calorías ni reinicia su fecha original.')}</Text>
   {reconfirm&&<TouchableOpacity accessibilityRole="button" onPress={()=>router.push('/edit-goals')} style={{paddingVertical:10}}><Text style={{color:colors.primary}}>{label('Review target setup','Revisar configuración de metas')}</Text></TouchableOpacity>}
  </View>}
  {/* Always mounted for scoped local recovery. None/Free never discards an earlier request. */}
  <TdeeRules14ReviewEntry ownerId={ownerId} isDark={isDark} blocked={!ownerId} attention={view.attention||(setup&&view.premium)} setup={setup} premium={view.premium} automaticRecovery refreshVerifiedGoal={refreshVerifiedGoal}/>
 </View>;
}

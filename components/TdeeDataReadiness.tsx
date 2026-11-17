import React from 'react';
import {View,Text,TouchableOpacity,ActivityIndicator} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useTdeeObservedCoverage} from '@/hooks/useTdeeObservedCoverage';
import {observedCoverage} from '@/utils/tdeeObservedCoverage';
import {colors} from '@/styles/commonStyles';
/** Read-only log coverage. Never confirms health eligibility or complete intake. */
export function TdeeDataReadiness({userId,isDark}:{userId?:string;isDark:boolean}){
 const api=useTdeeObservedCoverage(userId),{i18n}=useTranslation(),es=i18n.language.startsWith('es');
 const label=(en:string,sp:string)=>es?sp:en,text=isDark?colors.textDark:colors.text,muted=isDark?colors.textSecondaryDark:colors.textSecondary;
 const coverage=api.state?observedCoverage(api.state):null;
 return <View style={{gap:10,paddingVertical:12}}>
  <Text style={{color:text,fontSize:15,fontWeight:'600'}}>{label('TDEE log coverage','Cobertura de registros del TDEE')}</Text>
  {api.busy&&<ActivityIndicator/>}
  {api.error&&<Text accessibilityRole="alert" style={{color:muted}}>{label('Unable to verify log coverage.','No se pudo verificar la cobertura de registros.')}</Text>}
  {coverage&&<Text style={{color:text}}>{label('Days with usable logs: ','Días con registros utilizables: ')}{coverage.usableLoggedDays}/{coverage.calendarDays}</Text>}
  <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled:api.busy}} disabled={api.busy} onPress={api.refresh} style={{padding:12,borderColor:colors.primary,borderWidth:1,borderRadius:10,opacity:api.busy?.5:1}}><Text style={{color:colors.primary}}>{label('Refresh','Actualizar')}</Text></TouchableOpacity>
 </View>;
}

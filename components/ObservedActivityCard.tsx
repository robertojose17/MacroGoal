import React from 'react';
import {View,Text,StyleSheet} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useProgressIntelligence} from '@/hooks/useProgressIntelligence';
import {useDynamicTdee} from '@/hooks/useDynamicTdee';
import {useWeightDisplayUnit} from '@/hooks/useWeightDisplayUnit';
import {displaySignedRateKg} from '@/utils/weightUnits';
import {observationStatus} from '@/utils/tdeePresentation';
import {automaticBurnExplanation} from '@/utils/automaticBurnExplanation';
/** New observations supplement the restored original section; no duplicate weight entry. */
export default function ObservedActivityCard({userId,isDark}:{userId:string;isDark:boolean}){
 const {state,loading}=useProgressIntelligence(userId),unit=useWeightDisplayUnit(userId),{estimate,program,loading:burnLoading,error}=useDynamicTdee(userId),{i18n}=useTranslation(),es=i18n.language.startsWith('es'),color=isDark?'#F1F5F9':'#2B2D42',muted=isDark?'#A0A2B8':'#6B7280';
 const trend=state?.dashboardJourney?.trend,rate=trend?.status==='estimated'?trend.kgPerWeek:null,status=observationStatus(program,burnLoading,error),burn=status==='estimated'&&estimate?.status==='estimated'?estimate.kcalPerDay:null;
 return <View style={[styles.card,{backgroundColor:isDark?'#1C1C1E':'#FFF'}]}>
  <Text style={[styles.title,{color}]}>{es?'Tendencia de peso':'Weight trend'}</Text>
  <Text style={[styles.rate,{color}]}>{rate===null||!unit?'--':`${rate>=0?'+':''}${displaySignedRateKg(rate,unit).toFixed(2)} ${unit}/${es?'semana':'week'}`}</Text>
  <Text style={{color:muted}}>{loading?(es?'Comprobando pesajes…':'Checking weigh-ins…'):rate===null?(es?'Todavía no hay suficientes pesajes distribuidos en al menos 14 días.':'Not enough weigh-ins spread across at least 14 days yet.'):(es?'Ritmo estimado con pesajes registrados; negativo indica pérdida y positivo aumento.':'Estimated rate from recorded weigh-ins; negative means loss and positive means gain.')}</Text>
  {trend?.start&&trend.end&&<Text style={{color:muted,fontSize:12}}>{trend.start} → {trend.end} · {trend.count} {es?'pesajes':'weigh-ins'}</Text>}
  <View style={styles.secondary}><Text style={{color:muted,fontSize:12}}>Daily Burn</Text><Text style={{color,fontSize:16,fontWeight:'600'}}>{burn===null?'--':`${Math.round(burn)} kcal/${es?'día':'day'}`}</Text><Text style={{color:muted,fontSize:12}}>{automaticBurnExplanation({program,loading:burnLoading,error},es)}</Text>
   {burn!==null&&estimate?.coverage&&<><Text style={{color:muted,fontSize:12}}>{estimate.coverage.start} → {estimate.coverage.end} · {estimate.coverage.loggedDays} {es?'días de ingesta':'intake days'}, {estimate.coverage.weightDays} {es?'pesajes':'weigh-ins'}</Text><Text style={{color:muted,fontSize:12}}>{es?'Sensibilidad del modelo':'Model sensitivity'}: {estimate.coverage.sensitivityKcal.low}–{estimate.coverage.sensitivityKcal.high} kcal/{es?'día':'day'}. {es?'No es medición metabólica ni meta de ingesta.':'Not a metabolic measurement or intake target.'}</Text></>}
  </View>
 </View>;
}
const styles=StyleSheet.create({card:{padding:16,borderRadius:20,gap:9},title:{fontSize:17,fontWeight:'700'},rate:{fontSize:24,fontWeight:'700'},secondary:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:'#9CA3AF',paddingTop:12,marginTop:7,gap:5}});

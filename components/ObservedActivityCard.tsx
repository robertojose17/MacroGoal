import React from 'react';
import {View,Text,StyleSheet,Platform,useWindowDimensions} from 'react-native';
import {useTranslation} from 'react-i18next';
import {colors} from '@/styles/commonStyles';
import {useProgressIntelligence} from '@/hooks/useProgressIntelligence';
import {useDynamicTdee} from '@/hooks/useDynamicTdee';
import {useWeightDisplayUnit} from '@/hooks/useWeightDisplayUnit';
import {displaySignedRateKg} from '@/utils/weightUnits';
import {observationStatus} from '@/utils/tdeePresentation';
import {automaticBurnExplanation} from '@/utils/automaticBurnExplanation';
import {dashboardBurnStatus} from '@/utils/dashboardBurnStatus';
import {DashboardStatInfo} from './DashboardStatInfo';
/** Compact observations; complete provenance and limitations live behind the stat info controls. */
export default function ObservedActivityCard({userId,isDark}:{userId:string;isDark:boolean}){
 const {state,loading,error:weightError}=useProgressIntelligence(userId),unit=useWeightDisplayUnit(userId),{estimate,program,loading:burnLoading,error}=useDynamicTdee(userId),{i18n}=useTranslation(),es=i18n.language.startsWith('es'),color=isDark?'#F1F5F9':'#2B2D42',muted=isDark?'#A0A2B8':'#6B7280';
 const {width,fontScale}=useWindowDimensions(),stacked=width<360||fontScale>1.2;
 const trend=state?.dashboardJourney?.trend,rate=trend?.status==='estimated'?trend.kgPerWeek:null,status=observationStatus(program,burnLoading,error),burn=status==='estimated'&&estimate?.status==='estimated'?estimate.kcalPerDay:null;
 const trendTitle=es?'Tendencia de peso':'Weight trend',burnTitle='Daily Burn';
 const unavailable=es?'No disponible':'Unavailable',checking=es?'Cargando…':'Loading…';
 const trendStatus=loading?checking:weightError||!trend||!unit?unavailable:rate===null?(es?'Faltan pesajes':'More weigh-ins needed'):null;
 const burnStatus=dashboardBurnStatus({program,loading:burnLoading,error},es);
 const trendInfo=[loading?(es?'Comprobando pesajes…':'Checking weigh-ins…'):rate===null?(es?'Todavía no hay suficientes pesajes distribuidos en al menos 14 días.':'Not enough weigh-ins spread across at least 14 days yet.'):(es?'Ritmo estimado con pesajes registrados; negativo indica pérdida y positivo aumento.':'Estimated rate from recorded weigh-ins; negative means loss and positive means gain.'),trend?.start&&trend.end?`${trend.start} → ${trend.end} · ${trend.count} ${es?'pesajes':'weigh-ins'}`:''].filter(Boolean).join('\n\n');
 const burnInfo=[automaticBurnExplanation({program,loading:burnLoading,error},es),burn!==null&&estimate?.coverage?`${estimate.coverage.start} → ${estimate.coverage.end} · ${estimate.coverage.loggedDays} ${es?'días de ingesta':'intake days'}, ${estimate.coverage.weightDays} ${es?'pesajes':'weigh-ins'}`:'',burn!==null&&estimate?.coverage?`${es?'Sensibilidad del modelo':'Model sensitivity'}: ${estimate.coverage.sensitivityKcal.low}–${estimate.coverage.sensitivityKcal.high} kcal/${es?'día':'day'}.`:'',es?'No es una medición metabólica ni una meta de ingesta.':'Not a metabolic measurement or intake target.'].filter(Boolean).join('\n\n');
 return <View style={[styles.card,{backgroundColor:isDark?colors.cardDark:'#F7F8FA',borderColor:isDark?colors.cardBorderDark:colors.cardBorder},stacked&&styles.stacked]}>
  <View style={styles.stat}><View style={styles.heading}><Text style={[styles.title,{color}]}>{trendTitle}</Text><DashboardStatInfo title={trendTitle} explanation={trendInfo} isDark={isDark} ownerId={userId}/></View><Text style={[styles.rate,{color}]}>{rate===null||!unit?'--':`${rate>0?'+':''}${displaySignedRateKg(rate,unit).toFixed(2)}`}</Text><Text style={[styles.unit,{color:muted}]}>{unit?`${unit}/${es?'semana':'week'}`:'--'}</Text>{trendStatus&&<Text style={[styles.status,{color:muted}]}>{trendStatus}</Text>}</View>
  <View style={[styles.divider,{backgroundColor:isDark?colors.cardBorderDark:colors.cardBorder},stacked&&styles.horizontalDivider]}/>
  <View style={styles.stat}><View style={styles.heading}><Text style={[styles.title,{color:muted}]}>{burnTitle}</Text><DashboardStatInfo title={burnTitle} explanation={burnInfo} isDark={isDark} ownerId={userId}/></View><Text style={[styles.burn,{color}]}>{burn===null?'--':Math.round(burn)}</Text><Text style={[styles.unit,{color:muted}]}>kcal/{es?'día':'day'}</Text>{burnStatus&&<Text style={[styles.status,{color:muted}]}>{burnStatus}</Text>}</View>
 </View>;
}
const styles=StyleSheet.create({card:{marginBottom:12,padding:16,borderRadius:16,borderWidth:1,flexDirection:'row',gap:16,...Platform.select({ios:{shadowColor:'#000',shadowOffset:{width:0,height:2},shadowOpacity:0.06,shadowRadius:8},android:{elevation:2}})},stacked:{flexDirection:'column'},stat:{flex:1,minWidth:0},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:2},title:{fontSize:14,fontWeight:'700',flexShrink:1},rate:{fontSize:25,fontWeight:'700',marginTop:2},burn:{fontSize:22,fontWeight:'600',marginTop:5},unit:{fontSize:11,marginTop:3},status:{fontSize:11,marginTop:5},divider:{width:StyleSheet.hairlineWidth,alignSelf:'stretch'},horizontalDivider:{height:StyleSheet.hairlineWidth,width:'100%'}});


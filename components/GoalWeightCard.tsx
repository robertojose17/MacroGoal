import React from 'react';
import {View,Text,StyleSheet,ActivityIndicator,Platform,useWindowDimensions} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {useTranslation} from 'react-i18next';
import {colors} from '@/styles/commonStyles';
import {useProgressIntelligence} from '@/hooks/useProgressIntelligence';
import {useWeightDisplayUnit} from '@/hooks/useWeightDisplayUnit';
import {displaySignedRateKg} from '@/utils/weightUnits';
import {WeightProgressMiniChart} from './ProgressCard';
import {DashboardStatInfo} from './DashboardStatInfo';
const PRIMARY='#5B9AA8',CHART_HEIGHT=120;
interface GoalWeightCardProps{userId:string;isDark:boolean;currentWeightKg?:number|null;goalWeightKg?:number|null;startWeightKg?:number|null}
/** Restored original card layout. Profile fallback props intentionally do not invent observations. */
export default function GoalWeightCard({userId,isDark}:GoalWeightCardProps){
 const {width,fontScale}=useWindowDimensions(),stacked=width<360||fontScale>1.2;
 const {state,loading}=useProgressIntelligence(userId),unit=useWeightDisplayUnit(userId),{t,i18n}=useTranslation(),es=i18n.language.startsWith('es');
 const d=state?.dashboardJourney,bg=isDark?colors.cardDark:'#F7F8FA',border=isDark?colors.cardBorderDark:colors.cardBorder,text=isDark?'#F1F5F9':'#2B2D42',muted=isDark?'#A0A2B8':'#6B7280',track=isDark?'rgba(255,255,255,0.08)':'#E5E7EB';
 const format=(v:number|null|undefined)=>v==null||!unit?'--':Number(displaySignedRateKg(v,unit).toFixed(1)).toString();
 const start=d?.startWeightKg,current=d?.currentWeightKg,goal=d?.goalWeightKg;
 const range=start!=null&&goal!=null?goal-start:null;
 const fraction=range!==null&&range!==0&&current!=null?Math.max(0,Math.min(1,(current-start!)/range)):null;
 const percent=fraction===null?null:Math.round(fraction*100),remaining=current!=null&&goal!=null?Math.abs(current-goal):null;
 const reached=current!=null&&goal!=null&&(current===goal||fraction===1);
 const trend=d?.trend.status==='estimated'?d.trend.kgPerWeek:null;
 const rate=trend==null||!unit?'--':`${Math.abs(displaySignedRateKg(trend,unit)).toFixed(1)} ${unit}/${es?'sem':'week'}`;
 const rateLabel=trend==null||trend<0?(es?'Ritmo de pérdida':'Loss speed'):trend>0?(es?'Ritmo de aumento':'Gain speed'):(es?'Tendencia':'Trend');
 const details=[es?'El primer peso corresponde a la fecha de inicio del recorrido; no se sustituye por el peso actual.':'Start is the weight recorded on your journey start date; it is not replaced with your current weight.',`${es?'Actual':'Current'}: ${format(current)} ${unit??''}${d?.currentWeightDate?' · '+d.currentWeightDate:''}`,!d?.points.length?(es?'La gráfica necesita pesajes registrados.':'The chart needs recorded weigh-ins.'):'',start==null?(es?'No hay un peso registrado en la fecha de inicio.':'No weight was recorded on the journey start date.'):'',es?'La barra muestra el progreso registrado hacia tu objetivo. No verifica si vas al ritmo previsto.':'The bar shows recorded progress toward your goal. It does not verify whether you are on schedule.',es?'Llegada: no hay una proyección verificada. El ritmo es una estimación de pesajes distribuidos en al menos 14 días. La línea turquesa une pesajes registrados; la referencia horizontal verde es tu objetivo guardado, no una predicción.':'Arrival: no verified projection is available. Speed is estimated from weigh-ins spread over at least 14 days. The teal chart line connects recorded weights; the green horizontal reference is your saved goal, not a forecast.'].filter(Boolean).join('\n\n');
 return <View style={[styles.card,{backgroundColor:bg,borderColor:border}]}>
  <View style={styles.headerRow}><View style={styles.titleRow}><Text style={[styles.title,{color:text}]}>{t('goalWeightCard.title')}</Text><DashboardStatInfo title={t('goalWeightCard.title')} explanation={details} isDark={isDark} ownerId={userId}/></View><View style={[styles.badge,{backgroundColor:reached?'rgba(80,180,120,0.12)':'rgba(91,154,168,0.10)'}]}><Text style={[styles.badgeText,{color:reached?'#3E9965':PRIMARY}]}>{reached?(es?'✓ OBJETIVO':'✓ GOAL REACHED'):percent===null?'—':(es?'PROGRESO':'PROGRESS')}</Text></View></View>
  {loading?<ActivityIndicator color={PRIMARY}/>:<View style={[styles.bodyRow,{marginBottom:4},stacked&&{flexDirection:'column',gap:14}]}>
   <View style={[styles.leftColumn,stacked&&{flex:0,paddingRight:0}]}>
    <View style={styles.weightHorizontalRow}><Text style={[styles.weightInlineValue,{color:text}]}>{format(start)} {unit??''}</Text><Text style={[styles.weightArrow,{color:muted}]}> → </Text><Text style={[styles.weightInlineValue,{color:PRIMARY}]}>{format(goal)} {unit??''}</Text></View>
    <View style={styles.progressSection}><View style={styles.barRow}><View style={[styles.track,{backgroundColor:track,flex:1}]}>{percent!==null&&<><LinearGradient colors={['#5B9AA8','#7BC8D4']} start={{x:0,y:0}} end={{x:1,y:0}} style={[styles.fill,{width:`${percent}%`}]}/><View style={[styles.progressDot,{left:`${percent}%`,borderColor:bg}]}/></>}</View><Text style={styles.pctText}>{percent===null?'--':`${percent}%`}</Text></View><Text style={[styles.lbsToGo,{color:muted}]}>{reached?t('goalWeightCard.goalReached'):remaining===null||!unit?'--':`${format(remaining)} ${unit} ${es?'para el objetivo':'to goal'}`}</Text></View>
    <View style={styles.estSection}><View style={styles.estCell}><Text style={[styles.estLabel,{color:muted}]}>{t('goalWeightCard.estArrival')}</Text><Text style={[styles.estDate,{color:muted}]}>--</Text></View><View style={[styles.estDivider,{backgroundColor:muted}]}/><View style={styles.estCell}><Text style={[styles.estLabel,{color:muted}]}>{rateLabel}</Text><Text style={[styles.estDate,{color:text}]}>{rate}</Text></View></View>
   </View><View style={[styles.chartColumn,stacked&&{flex:0,width:'100%'}]}><WeightProgressMiniChart userId={userId} isDark={isDark} height={CHART_HEIGHT} state={state} displayUnit={unit}/></View>
  </View>}
 </View>;
}
const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  titleRow: {flexDirection:'row',alignItems:'center',flexShrink:1},
  title: { fontSize: 16, fontWeight: '700', flexShrink:1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  // Two-column body
  bodyRow: {
    flexDirection: 'row',
    minHeight: CHART_HEIGHT,
    alignItems: 'stretch',
  },
  leftColumn: {
    flex: 1,
    paddingRight: 12,
    minWidth:0,
    justifyContent: 'space-between',
    gap: 5,
  },
  chartColumn: {
    flex: 1,
    minWidth: 110,
    justifyContent: 'center',
  },
  // Weight row (start → goal, horizontal)
  weightHorizontalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  weightInlineValue: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  weightInlineUnit: {
    fontSize: 16,
    fontWeight: '700',
  },
  weightArrow: {
    fontSize: 14,
    fontWeight: '400',
    paddingHorizontal: 2,
  },
  // Progress bar section
  progressSection: {
    gap: 3,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  track: {
    height: 6,
    borderRadius: 6,
    overflow: 'visible',
    position: 'relative',
  },
  fill: { height: '100%', borderRadius: 6 },
  progressDot: {
    position: 'absolute',
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#5B9AA8',
    borderWidth: 2,
    marginLeft: -7,
  },
  pctText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B9AA8',
    minWidth: 30,
    textAlign: 'right',
  },
  lbsToGo: {
    fontSize: 11,
    fontWeight: '500',
  },
  // Estimated arrival + loss speed row
  estSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  estCell: {
    flex: 1,
    gap: 2,
  },
  estDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: 8,
    opacity: 0.2,
  },
  estLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  estDate: {
    fontSize: 12,
    fontWeight: '700',
  },
  // No goal / no data states
  noGoal: { fontSize: 14, lineHeight: 20, marginVertical: 8 },
  noDataArea: { alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  noDataText: { fontSize: 12, textAlign: 'center' },
  // Buttons
  btn: {
    backgroundColor: '#5B9AA8',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  // Skeleton
  skeletonChart: {
    height: CHART_HEIGHT,
    borderRadius: 8,
    marginBottom: 12,
    opacity: 0.5,
  },
  skeletonBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: 10,
    opacity: 0.5,
  },
  skeletonLabel: {
    height: 36,
    width: 70,
    borderRadius: 6,
    opacity: 0.5,
  },
});



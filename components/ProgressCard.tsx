import React,{useState,useRef} from 'react';
import {View,Text,StyleSheet,ActivityIndicator,TouchableOpacity,ScrollView,Modal} from 'react-native';
import Svg,{Path,Circle,Line,Text as SvgText} from 'react-native-svg';
import {useTranslation} from 'react-i18next';
import {useProgressIntelligence,type ProgressState} from '@/hooks/useProgressIntelligence';
import {useWeightDisplayUnit} from '@/hooks/useWeightDisplayUnit';
import {displaySignedRateKg,type WeightUnit} from '@/utils/weightUnits';
import type {DashboardJourney} from '@/release-candidates/tdee-adaptive-review/dashboardJourney';
interface ProgressCardProps{userId:string;isDark:boolean;layout?:'carousel'|'stacked'}
const day=(d:string)=>Date.parse(d+'T00:00:00Z')/86400000;
function WeightChart({data,unit,isDark,height=220,mini=false}:{data:DashboardJourney|null|undefined;unit:WeightUnit|null;isDark:boolean;height?:number;mini?:boolean}){
 const [width,setWidth]=useState(280),{i18n}=useTranslation(),es=i18n.language.startsWith('es'),color=isDark?'#E5E7EB':'#475569';
 const points=data?.points??[],goal=data?.goalWeightKg;
 if(!unit||points.length===0)return <View style={{minHeight:height,justifyContent:'center'}}><Text style={{color,fontSize:12}}>{es?'Sin pesajes verificados para graficar':'No verified weigh-ins to chart'}</Text></View>;
 const vals=points.map(p=>displaySignedRateKg(p.kg,unit)),g=goal==null?null:displaySignedRateKg(goal,unit),all=g===null?vals:[...vals,g],min=Math.min(...all),max=Math.max(...all),pad=Math.max((max-min)*.12,.5),lo=min-pad,hi=max+pad;
 const left=mini?28:42,right=10,top=10,bottom=26,w=Math.max(80,width),cw=Math.max(30,w-left-right),ch=height-top-bottom,first=day(points[0].date),last=day(points.at(-1)!.date),span=Math.max(1,last-first);
 const x=(date:string)=>left+(day(date)-first)/span*cw,y=(value:number)=>top+(hi-value)/(hi-lo)*ch;
 const path=points.map((p,i)=>`${i?'L':'M'}${x(p.date)},${y(vals[i])}`).join(' ');
 return <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} accessibilityLabel={es?'Gráfica de pesajes registrados y peso objetivo':'Recorded weigh-ins and goal-weight chart'}>
  <Svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`}>
   {[0,.5,1].map(t=>{const v=hi-(hi-lo)*t;return <React.Fragment key={t}><Line x1={left} y1={y(v)} x2={w-right} y2={y(v)} stroke={isDark?'#374151':'#E5E7EB'} strokeWidth={1}/><SvgText x={left-4} y={y(v)+3} textAnchor="end" fontSize={mini?8:10} fill={color}>{v.toFixed(1)}</SvgText></React.Fragment>;})}
   {g!==null&&<Line x1={left} x2={w-right} y1={y(g)} y2={y(g)} stroke="#5B9AA8" strokeDasharray="4 4" strokeWidth={1.5}/>}
   <Path d={path} stroke="#F59E0B" strokeWidth={2} fill="none"/>
   {points.map((p,i)=><Circle key={p.date} cx={x(p.date)} cy={y(vals[i])} r={mini?2:3} fill="#F59E0B"/>)}
   <SvgText x={left} y={height-7} fontSize={9} fill={color}>{points[0].date.slice(5)}</SvgText><SvgText x={w-right} y={height-7} textAnchor="end" fontSize={9} fill={color}>{points.at(-1)!.date.slice(5)}</SvgText>
  </Svg>
  <Text style={{color,fontSize:mini?9:11}}>{unit} · {es?'Registrado':'Recorded'} ● {g===null?'':` · ${es?'Objetivo':'Goal'} ┄`}</Text>
 </View>;
}
export function ObservedWeightSummary({state,isDark,displayUnit}:{state:ProgressState|null;isDark:boolean;displayUnit:WeightUnit|null}){
 const {i18n}=useTranslation(),es=i18n.language.startsWith('es'),d=state?.dashboardJourney,color=isDark?'#FFF':'#202124';
 return <View style={styles.summary}>{[es?'Inicial':'Start',es?'Actual':'Current',es?'Objetivo':'Goal'].map((label,i)=>{const kg=[d?.startWeightKg,d?.currentWeightKg,d?.goalWeightKg][i];return <View key={label}><Text style={{color}}>{label}</Text><Text style={[styles.value,{color}]}>{kg==null||!displayUnit?'--':`${displaySignedRateKg(kg,displayUnit).toFixed(1)} ${displayUnit}`}</Text></View>;})}</View>;
}
export function WeightProgressMiniChart({userId,isDark,height=120,state,displayUnit}:{userId:string;isDark:boolean;height?:number;state?:ProgressState|null;displayUnit?:WeightUnit|null}){
 // Mounted standalone callers still receive owner-scoped observations; a passed state is never another account's fallback.
 return state===undefined?<StandaloneMini userId={userId} isDark={isDark} height={height}/>:<WeightChart data={state?.dashboardJourney} unit={displayUnit??null} isDark={isDark} height={height} mini/>;
}
function StandaloneMini({userId,isDark,height}:{userId:string;isDark:boolean;height:number}){const {state}=useProgressIntelligence(userId),unit=useWeightDisplayUnit(userId);return <WeightChart data={state?.dashboardJourney} unit={unit} isDark={isDark} height={height} mini/>;}
export default function ProgressCard({userId,isDark,layout='carousel'}:ProgressCardProps){
 const {state,loading,error,refresh}=useProgressIntelligence(userId),unit=useWeightDisplayUnit(userId),{i18n,t}=useTranslation(),es=i18n.language.startsWith('es');
 const carousel=useRef<ScrollView|null>(null);
 const [page,setPage]=useState(0),[width,setWidth]=useState(320),[detail,setDetail]=useState<{title:string;body:string}|null>(null),d=state?.dashboardJourney;
 const color=isDark?'#F1F5F9':'#2B2D42',muted=isDark?'#A0A2B8':'#6B7280',bg=isDark?'#1C1C1E':'#FFF';
 const fmt=(kg:number|null|undefined)=>kg==null||!unit?'--':`${displaySignedRateKg(kg,unit).toFixed(1)} ${unit}`;
 const change=d?.startWeightKg!=null&&d.currentWeightKg!=null?d.currentWeightKg-d.startWeightKg:null,trend=d?.trend.status==='estimated'?d.trend.kgPerWeek:null;
 const stats=[
  {title:t('progressCard.statProgress'),value:change===null?'--':`${change>0?'+':''}${fmt(change)}`,subtitle:es?'Desde el peso de inicio registrado':'Since recorded start weight',body:es?'Diferencia entre el último check-in y el check-in de la fecha de inicio. No se sustituye un peso faltante.':'Latest check-in minus the check-in on the journey start date. Missing weights are not substituted.'},
  {title:t('progressCard.statMomentum'),value:trend===null?'--':`${trend>0?'+':''}${fmt(trend)}/${es?'semana':'week'}`,subtitle:es?'Tendencia observada de al menos 14 días':'Observed trend across at least 14 days',body:es?'Pendiente robusta de varios pesajes. El signo negativo indica pérdida; el positivo, aumento. No demuestra un plateau.':'Robust slope across multiple weigh-ins. Negative means loss; positive means gain. It does not establish a plateau.'},
  {title:t('progressCard.statTimeline'),value:d?.journeyStartDate??'--',subtitle:es?'Fecha de inicio · sin fecha de llegada inferida':'Start date · no inferred arrival date',body:es?'La gráfica muestra fechas registradas. No se inventa una fecha futura usando calorías faltantes.':'The chart shows recorded dates. No future arrival is invented from missing calorie logs.'},
  {title:t('progressCard.statTarget'),value:fmt(d?.goalWeightKg),subtitle:es?'Objetivo guardado':'Saved goal',body:es?'Referencia de peso objetivo, no un peso observado ni una promesa de fecha.':'Goal-weight reference, not an observed weight or a promised date.'},
 ];
 const graph=<View style={{gap:12}}><ObservedWeightSummary state={state} isDark={isDark} displayUnit={unit}/><WeightChart data={d} unit={unit} isDark={isDark}/><Text style={{color:muted,fontSize:12}}>{es?'La línea une pesajes reales; la línea discontinua es el objetivo, no una predicción.':'The line connects real weigh-ins; the dashed line is the goal, not a prediction.'}</Text></View>;
 const cards=<View style={styles.grid}>{stats.map(s=><TouchableOpacity key={s.title} accessibilityRole="button" onPress={()=>setDetail({title:s.title,body:s.body})} style={[styles.stat,{backgroundColor:isDark?'#25252A':'#F5F8FA'}]}><Text style={{color:muted,fontSize:12}}>{s.title} ⓘ</Text><Text style={[styles.value,{color}]}>{s.value}</Text><Text style={{color:muted,fontSize:11}}>{s.subtitle}</Text></TouchableOpacity>)}</View>;
 return <View style={[styles.card,{backgroundColor:bg}]} onLayout={e=>setWidth(Math.max(180,e.nativeEvent.layout.width-32))}>
  <Text style={[styles.title,{color}]}>{t('progressCard.title')}</Text>
  {loading?<ActivityIndicator/>:layout==='stacked'?<>{graph}{cards}</>:<><ScrollView ref={carousel} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={e=>setPage(Math.round(e.nativeEvent.contentOffset.x/width))}><View style={{width,paddingRight:8}}>{graph}</View><View style={{width,paddingLeft:8}}>{cards}</View></ScrollView><View style={{flexDirection:'row',justifyContent:'center',gap:16}}>{[0,1].map(index=><TouchableOpacity key={index} accessibilityRole="button" accessibilityLabel={index===0?(es?'Ver gráfica':'View graph'):(es?'Ver estadísticas':'View statistics')} accessibilityState={{selected:page===index}} onPress={()=>{carousel.current?.scrollTo({x:index*width,animated:true});setPage(index);}}><Text style={{color:page===index?'#5B9AA8':muted,padding:6}}>{page===index?'●':'○'}</Text></TouchableOpacity>)}</View></>}
  {error&&<TouchableOpacity accessibilityRole="button" onPress={refresh}><Text style={{color:'#5B9AA8'}}>{es?'Actualizar datos no disponibles':'Refresh unavailable data'}</Text></TouchableOpacity>}
  <Modal visible={detail!==null} transparent animationType="fade" onRequestClose={()=>setDetail(null)}><View style={styles.overlay}><View style={[styles.detail,{backgroundColor:bg}]}><Text style={[styles.title,{color}]}>{detail?.title}</Text><Text style={{color}}>{detail?.body}</Text><TouchableOpacity onPress={()=>setDetail(null)}><Text style={{color:'#5B9AA8',paddingTop:16}}>{es?'Cerrar':'Close'}</Text></TouchableOpacity></View></View></Modal>
 </View>;
}
const styles=StyleSheet.create({card:{borderRadius:20,padding:16,gap:16},title:{fontSize:18,fontWeight:'700'},summary:{flexDirection:'row',justifyContent:'space-between',gap:8},value:{fontSize:19,fontWeight:'700',marginVertical:6},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},stat:{flexBasis:'47%',flexGrow:1,minWidth:120,minHeight:115,borderRadius:14,padding:12},overlay:{flex:1,backgroundColor:'rgba(0,0,0,.45)',justifyContent:'center',padding:28},detail:{borderRadius:20,padding:22,gap:12}});

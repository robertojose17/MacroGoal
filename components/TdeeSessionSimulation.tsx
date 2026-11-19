import {TdeeTargetComparison} from './TdeeTargetComparison';
import MacroBar from './MacroBar';
import ProgressCircle from './ProgressCircle';
import React,{useEffect,useRef,useState} from 'react';
import {AppState,Modal,Platform,ScrollView,Text,TouchableOpacity,View} from 'react-native';
import {colors} from '@/styles/commonStyles';
import {createSimulation,simulationCurrent,simulationTargets,simulationTransition,type SimulationAction,type SimulationState} from '@/utils/tdeeSessionSimulation';
type Props={envelope:unknown;ownerId:string;sessionId:string;isDark:boolean;language?:string;onExit:()=>void};
/** This component never mounts live Dashboard/Foods, auth services or acceptance controllers. */
export function TdeeSessionSimulation({envelope,ownerId,sessionId,isDark,language='en',onExit}:Props){
 const [state,setState]=useState<SimulationState|null>(()=>{try{return createSimulation(envelope,ownerId,sessionId,Date.now());}catch{return null;}});
 const [now,setNow]=useState(Date.now()),ended=useRef(false),exitRef=useRef(onExit);exitRef.current=onExit;
 const current=useRef({ownerId,sessionId});current.current={ownerId,sessionId};
 const es=language.startsWith('es'),label=(en:string,sp:string)=>es?sp:en;
 const exit=()=>{if(ended.current)return;ended.current=true;setState(null);exitRef.current();};
 const visible=!!state&&!ended.current&&simulationCurrent(state,ownerId,sessionId,Math.max(now,Date.now()))&&AppState.currentState==='active';
 useEffect(()=>{if(!visible)exit();},[visible]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),250);const app=AppState.addEventListener('change',value=>{if(value!=='active')exit();});return()=>{clearInterval(timer);app.remove();};},[]);
 useEffect(()=>{if(Platform.OS!=='web'||!visible)return;const handler=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();exit();}};globalThis.addEventListener('keydown',handler);return()=>globalThis.removeEventListener('keydown',handler);},[visible]);
 if(!visible||!state)return null;
 const text=isDark?colors.textDark:colors.text,bg=isDark?colors.cardDark:colors.card,targets=simulationTargets(state);
 const action=(a:SimulationAction)=>{if(a==='exit'){exit();return;}setState(old=>old?simulationTransition(old,a,current.current.ownerId,current.current.sessionId,Date.now()):null);};
 const button=(title:string,a:SimulationAction)=><TouchableOpacity accessibilityRole="button" onPress={()=>action(a)} style={{minHeight:44,padding:12,borderWidth:1,borderColor:colors.primary,borderRadius:10}}><Text style={{color:colors.primary,fontWeight:'600'}}>{title}</Text></TouchableOpacity>;
 return <Modal visible transparent animationType="none" onRequestClose={exit}><View style={{flex:1,justifyContent:'center',padding:16,backgroundColor:'rgba(0,0,0,.55)'}}><View style={{backgroundColor:bg,borderRadius:16,maxHeight:'95%',padding:16,gap:12}}>
  <View accessibilityRole="alert" style={{padding:12,backgroundColor:isDark?'#493919':'#fff0cb',borderRadius:10}}><Text style={{color:isDark?'#fff0cb':'#493919',fontWeight:'700'}}>{label('SIMULATION · Fictional data','SIMULACIÓN · Datos ficticios')}</Text><Text style={{color:isDark?'#fff0cb':'#493919'}}>{label('Nothing here changes your real targets or food diary. Reloading or leaving clears the simulated changes.','Nada aquí modifica tus metas ni tu diario reales. Recargar o salir borra los cambios simulados.')}</Text></View>
  <ScrollView key={state.reviewOpen?'review':'overview'} contentContainerStyle={{gap:12}} accessibilityViewIsModal>
   {!state.reviewOpen&&<>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{button(label('Dashboard','Resumen'),'dashboard')}{button(label('Foods','Comidas'),'foods')}</View>
   <Text accessibilityRole="header" style={{fontSize:22,fontWeight:'700',color:text}}>{state.tab==='dashboard'?label('Fictional Dashboard','Resumen ficticio'):label('Fictional Foods targets','Metas ficticias de Comidas')}</Text>
   <View style={{padding:16,borderWidth:1,borderColor:colors.primary,borderRadius:12,gap:8}}>
    {state.tab==='dashboard'?<View style={{alignItems:'center',gap:8}}><ProgressCircle current={state.envelope.scenario.todayIntake.calories} target={targets.calories} label={label('kcal remaining','kcal restantes')} unit="kcal"/><Text style={{color:text}}>{Math.round(state.envelope.scenario.todayIntake.calories/targets.calories*100)}% {label('of fictional calorie target','de la meta calórica ficticia')}</Text><ProgressCircle current={state.envelope.scenario.todayIntake.proteinG} target={targets.proteinG} label={label('protein remaining','proteína restante')} unit="g" size={100}/></View>:<>
     <MacroBar label={label('Calories','Calorías')} current={state.envelope.scenario.todayIntake.calories} target={targets.calories} color={colors.primary} unit="kcal"/>
     <MacroBar label={label('Protein','Proteína')} current={state.envelope.scenario.todayIntake.proteinG} target={targets.proteinG} color={colors.primary}/>
     <MacroBar label={label('Carbs','Carbohidratos')} current={state.envelope.scenario.todayIntake.carbsG} target={targets.carbsG} color={colors.primary}/>
     <MacroBar label={label('Fat','Grasa')} current={state.envelope.scenario.todayIntake.fatsG} target={targets.fatsG} color={colors.primary}/>
     <MacroBar label={label('Fiber','Fibra')} current={state.envelope.scenario.todayIntake.fiberG} target={targets.fiberG} color={colors.primary}/>
    </>}<Text style={{color:text}}>{state.accepted?label('Simulated adjustment applied to both views. Your account is unchanged.','Ajuste simulado aplicado a ambas vistas. Tu cuenta no cambió.'):label('Original fictional targets.','Metas ficticias originales.')}</Text></View>
   {button(label('Review simulated recommendation','Revisar recomendación simulada'),'review')}
   </>}
   {state.reviewOpen&&<View style={{gap:12,padding:16,borderWidth:1,borderColor:colors.primary,borderRadius:12}}>
    <Text accessibilityRole="header" style={{color:text,fontSize:20}}>{label('Review fictional daily targets','Revisa las metas diarias ficticias')}</Text>
    <Text style={{color:text}}>{label('14-day example: stable weight, a loss goal and 2,000 logged calories per day. These are not your account records.','Ejemplo de 14 días: peso estable, objetivo de pérdida y 2,000 calorías registradas al día. No son registros de tu cuenta.')}</Text>
    <Text style={{color:text}}>{label('Original → Recommended','Originales → Recomendadas')}</Text><TdeeTargetComparison current={state.envelope.scenario.current} target={state.envelope.scenario.recommended} text={text} es={es}/>
    {button(label('Accept in simulation only','Aceptar solo en la simulación'),'accept')}{button(label('Reject simulated recommendation','Rechazar recomendación simulada'),'reject')}
   </View>}
  </ScrollView>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{button(label('Reset simulation','Reiniciar simulación'),'reset')}{button(label('Exit simulation','Salir de la simulación'),'exit')}</View>
 </View></View></Modal>;
}

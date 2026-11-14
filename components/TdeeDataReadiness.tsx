import React,{useEffect,useState} from 'react';
import {View,Text,TouchableOpacity,Modal,ScrollView,StyleSheet,ActivityIndicator} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useTdeeReadiness} from '@/hooks/useTdeeReadiness';
import type {TdeeReadiness,EligibilityResponse} from '@/utils/tdeeReadiness';
import {colors} from '@/styles/commonStyles';
/** No recommendation, goal mutation, or implicit completion is triggered here. */
export function TdeeDataReadiness({userId,isDark}:{userId?:string;isDark:boolean}){
 const api=useTdeeReadiness(userId),{i18n}=useTranslation(),es=i18n.language.startsWith('es');
 const [modal,setModal]=useState<'eligibility'|'days'|null>(null),[base,setBase]=useState<TdeeReadiness|null>(null),[selected,setSelected]=useState<Set<string>>(new Set()),[response,setResponse]=useState<EligibilityResponse|null>(null),[failure,setFailure]=useState(false);
 const text=isDark?colors.textDark:colors.text,muted=isDark?colors.textSecondaryDark:colors.textSecondary,bg=isDark?colors.cardDark:colors.card;
 const close=()=>{setModal(null);setBase(null);setFailure(false);};
 useEffect(()=>{if(base&&api.state!==base&&!api.busy){setModal(null);setBase(null);}},[api.state,api.busy,base]);
 const open=(kind:'eligibility'|'days')=>{if(!api.state||api.busy)return;setBase(api.state);setSelected(new Set(api.state.days.filter(d=>d.confirmed).map(d=>d.date)));setResponse(null);setFailure(false);setModal(kind);};
 const save=async()=>{if(!base||api.busy)return;try{if(modal==='eligibility'){if(!response)return;await api.save(base,{response});}else await api.save(base,{selected});close();}catch{setFailure(true);}};
 const label=(en:string,sp:string)=>es?sp:en;
 const button=(title:string,action:()=>void,disabled=false)=><TouchableOpacity accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={action} style={[styles.button,{borderColor:colors.primary,opacity:disabled?0.5:1}]}><Text style={{color:colors.primary}}>{title}</Text></TouchableOpacity>;
 return <View style={styles.section}>
  <Text style={[styles.heading,{color:text}]}>{label('TDEE data','Datos del TDEE')}</Text>
  <Text style={{color:muted}}>{label('These confirmations do not change your calorie or macro targets.','Estas confirmaciones no cambian tus metas de calorías ni macros.')}</Text>
  {api.busy&&<ActivityIndicator/>}
  {api.error&&<Text accessibilityRole="alert" style={{color:muted}}>{label('Unable to verify. Refresh and review before saving.','No se pudo verificar. Actualiza y revisa antes de guardar.')}</Text>}
  {api.state?<>
   {button(label('Eligibility: ','Elegibilidad: ')+(api.state.eligibility.current&&api.state.eligibility.adult&&api.state.eligibility.response==='criteria_confirmed'?label('confirmed','confirmada'):label('review','revisar')),()=>open('eligibility'),api.busy)}
   {button(label('Complete days: ','Días completos: ')+api.state.days.filter(d=>d.confirmed).length,()=>open('days'),api.busy)}
  </>:button(label('Refresh','Actualizar'),api.refresh,api.busy)}
  <Modal visible={modal!==null&&!!base} transparent animationType="fade" onRequestClose={close}>
   <View style={styles.overlay}><View accessibilityViewIsModal style={[styles.panel,{backgroundColor:bg}]}>
    <Text style={[styles.heading,{color:text}]}>{modal==='days'?label('Confirm complete days','Confirmar días completos'):label('Quick eligibility check','Confirmación breve')}</Text>
    {modal==='eligibility'?<>
     <Text style={{color:text}}>{label('I am an adult, I am not pregnant or breastfeeding, and I do not need professional guidance to adjust my diet.','Soy mayor de edad, no estoy embarazada ni en lactancia y no necesito orientación profesional para ajustar mi alimentación.')}</Text>
     <Text style={{color:muted}}>{label('No medical details are requested. You can change this response later.','No se piden detalles médicos. Puedes cambiar tu respuesta después.')}</Text>
     {(['criteria_confirmed','not_confirmed','unsure'] as const).map((value,index)=><TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{checked:response===value,disabled:api.busy||(value==='criteria_confirmed'&&!base?.eligibility.adult)}} disabled={api.busy||(value==='criteria_confirmed'&&!base?.eligibility.adult)} onPress={()=>setResponse(value)} style={styles.row}><Text style={{color:response===value?colors.primary:text}}>{response===value?'● ':'○ '}{[label('I confirm all of these','Confirmo todo lo anterior'),label('Not all apply','No aplica todo'),label('I am not sure','No estoy seguro/a')][index]}</Text></TouchableOpacity>)}
    </>:<>
     <Text style={{color:text}}>{label('Select only days when you logged all food and drinks. You can uncheck a day to correct it. Editing its food log requires confirming it again.','Marca solo los días en que registraste toda tu comida y bebida. Puedes desmarcar un día para corregirlo. Si editas sus alimentos, deberás confirmarlo otra vez.')}</Text>
     <Text style={{color:muted}}>{base?.timezone} · {label('Up to yesterday; no days selected automatically.','Hasta ayer; no se marcan días automáticamente.')}</Text>
     <ScrollView style={styles.days}>
      {base?.days.map(d=>{const checked=selected.has(d.date),disabled=api.busy||(!d.confirmable&&!checked);return <TouchableOpacity key={d.date} accessibilityRole="checkbox" accessibilityState={{checked,disabled}} disabled={disabled} onPress={()=>setSelected(old=>{const next=new Set(old);if(next.has(d.date))next.delete(d.date);else next.add(d.date);return next;})} style={[styles.row,{opacity:disabled?0.5:1}]}><Text style={{color:checked?colors.primary:text}}>{checked?'☑ ':'☐ '}{d.date}{!d.confirmable?' · '+label('Not available','No disponible'):''}</Text></TouchableOpacity>;})}
      {base?.days.length===0&&<Text style={{color:muted}}>{label('No completed calendar days in this journey yet.','Todavía no hay días anteriores en este recorrido.')}</Text>}
     </ScrollView>
    </>}
    {failure&&<Text accessibilityRole="alert" style={{color:muted}}>{label('Unable to verify the save. Close, refresh, and review before trying again.','No se pudo verificar el guardado. Cierra, actualiza y revisa antes de intentar de nuevo.')}</Text>}
    {button(label('Save confirmation','Guardar confirmación'),()=>{void save();},api.busy||!base||(modal==='eligibility'&&!response))}
    {button(label('Cancel','Cancelar'),close)}
   </View></View>
  </Modal>
 </View>;
}
const styles=StyleSheet.create({section:{gap:10,paddingVertical:12},heading:{fontSize:15,fontWeight:'600'},button:{padding:12,borderWidth:1,borderRadius:10},overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.45)',alignItems:'center',justifyContent:'center',padding:20},panel:{width:'100%',maxWidth:460,maxHeight:'85%',borderRadius:16,padding:20,gap:12},days:{maxHeight:300},row:{paddingVertical:12,minHeight:44}});

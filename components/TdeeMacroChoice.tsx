import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,Modal,StyleSheet,ScrollView} from 'react-native';
import {useTranslation} from 'react-i18next';
import {colors} from '@/styles/commonStyles';
import {useTdeeMacroChoice} from '@/hooks/useTdeeMacroChoice';
import {splitFromInputs,type MacroMode,type MacroState} from '@/utils/tdeeMacroChoice';
/** Saves a preference only. No TDEE activation or target mutation. */
export function TdeeMacroChoice({userId,isDark}:{userId?:string;isDark:boolean}){
 const api=useTdeeMacroChoice(userId),{i18n}=useTranslation(),es=i18n.language.startsWith('es'),l=(en:string,sp:string)=>es?sp:en;
 const [base,setBase]=useState<MacroState|null>(null),[mode,setMode]=useState<MacroMode|null>(null),[values,setValues]=useState(['','','']),[error,setError]=useState(false);
 const text=isDark?colors.textDark:colors.text,muted=isDark?colors.textSecondaryDark:colors.textSecondary,bg=isDark?colors.cardDark:colors.card;
 const close=()=>{setBase(null);setError(false);};
 useEffect(()=>{if(base&&api.state!==base&&!api.busy)close();},[base,api.state,api.busy]);
 const open=()=>{if(!api.state||api.busy)return;setBase(api.state);setError(false);const c=api.pending??api.state.choice;setMode(c?.mode??null);const split=c?.splitBps;setValues(split?[split.protein,split.carbs,split.fats].map(n=>String(n/100)):['','','']);};
 const button=(title:string,action:()=>void,disabled=false)=><TouchableOpacity accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={action} style={[styles.button,{borderColor:colors.primary,opacity:disabled?0.5:1}]}><Text style={{color:colors.primary}}>{title}</Text></TouchableOpacity>;
 const save=async(selected:MacroMode)=>{if(!base)return;try{const split=selected==='preserve_percent'?splitFromInputs(...values as [string,string,string]):null;await api.submit(base,selected,split,api.pending??undefined);close();}catch{setError(true);}};
 return <View style={styles.section}>
  <Text style={[styles.heading,{color:text}]}>{l('TDEE macro preference','Preferencia de macros del TDEE')}</Text>
  <Text style={{color:muted}}>{l('For future proposals only. Saving does not change your targets or turn on adjustments.','Solo para futuras propuestas. Guardar no cambia tus metas ni activa ajustes.')}</Text>
  {api.state?.choice&&<Text style={{color:muted}}>{api.state.choice.mode==='revoked'?l('Preference removed','Preferencia retirada'):api.state.choice.current?l('Saved preference','Preferencia guardada'):l('Needs confirmation after changes','Requiere confirmación después de cambios')}</Text>}
  {button(api.pending?l('Review unfinished save','Revisar guardado pendiente'):l('Choose preference','Elegir preferencia'),open,api.busy||!api.state)}
  {api.error&&<Text accessibilityRole="alert" style={{color:muted}}>{l('Save or read could not be confirmed. Review the current preference and any unfinished save before continuing.','No se pudo confirmar el guardado o la lectura. Revisa la preferencia actual y cualquier guardado pendiente antes de continuar.')}</Text>}
  {(api.error||!api.state)&&button(l('Refresh','Actualizar'),()=>{void api.refresh();},api.busy)}
  <Modal visible={!!base} transparent animationType="fade" onRequestClose={close}><View style={styles.overlay}><ScrollView style={[styles.panel,{backgroundColor:bg}]} contentContainerStyle={{gap:12,padding:20}}>
   <Text style={[styles.heading,{color:text}]}>{l('How should future macros be proposed?','¿Cómo prefieres las propuestas de macros?')}</Text>
   {api.pending&&<Text style={{color:muted}}>{l('The earlier save is unconfirmed. Retry its exact selection below; it will not create a second change.','El guardado anterior no está confirmado. Reintenta la misma selección; no creará un segundo cambio.')}</Text>}
   {(['smart','preserve_percent'] as const).map(value=><TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{checked:mode===value,disabled:api.busy||!!api.pending}} disabled={api.busy||!!api.pending} onPress={()=>setMode(value)} style={styles.row}><Text style={{color:mode===value?colors.primary:text}}>{mode===value?'● ':'○ '}{value==='smart'?l('Smart: let the plan propose the macro split','Smart: deja que el plan proponga la distribución'):l('Keep the percentages I enter','Mantener los porcentajes que indique')}</Text></TouchableOpacity>)}
   {mode==='preserve_percent'&&<><Text style={{color:muted}}>{l('Enter exact percentages totaling 100%. We do not infer them from your current grams.','Indica porcentajes exactos que sumen 100%. No se deducen de tus gramos actuales.')}</Text>{values.map((value,index)=><View key={index} style={styles.row}><Text style={{color:text}}>{[l('Protein %','Proteína %'),l('Carbs %','Carbohidratos %'),l('Fats %','Grasas %')][index]}</Text><TextInput accessibilityLabel={['Protein percent','Carbs percent','Fats percent'][index]} value={value} keyboardType="decimal-pad" editable={!api.busy&&!api.pending} maxLength={6} onChangeText={next=>setValues(old=>old.map((v,i)=>i===index?next:v))} style={{color:text,borderWidth:1,borderColor:muted,borderRadius:8,padding:10}}/></View>)}</>}
   {mode==='revoked'&&<Text style={{color:text}}>{l('Remove the saved preference','Retirar la preferencia guardada')}</Text>}
   <Text style={{color:muted}}>{l('You will still review and accept any future target change separately.','Revisarás y aceptarás cada cambio futuro de metas por separado.')}</Text>
   {error&&<Text accessibilityRole="alert" style={{color:muted}}>{l('Unable to confirm. Percentages must total exactly 100%. Refresh and review any pending save before trying again.','No se pudo confirmar. Los porcentajes deben sumar exactamente 100%. Actualiza y revisa cualquier guardado pendiente antes de reintentar.')}</Text>}
   {button(api.pending?l('Retry this exact save','Reintentar este guardado'):l('Save preference','Guardar preferencia'),()=>{if(mode)void save(mode);},api.busy||!mode||(!api.pending&&base?.bindingStatus!=='available'))}
   {!api.pending&&base?.choice&&base.choice.mode!=='revoked'&&button(l('Remove preference','Retirar preferencia'),()=>{void save('revoked');},api.busy)}
   {button(l('Cancel','Cancelar'),close)}
  </ScrollView></View></Modal>
 </View>;
}
const styles=StyleSheet.create({section:{gap:10,paddingVertical:12},heading:{fontSize:15,fontWeight:'600'},button:{padding:12,borderWidth:1,borderRadius:10},row:{gap:6,paddingVertical:8},overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.45)',alignItems:'center',justifyContent:'center',padding:20},panel:{width:'100%',maxWidth:460,maxHeight:'85%',borderRadius:16}});

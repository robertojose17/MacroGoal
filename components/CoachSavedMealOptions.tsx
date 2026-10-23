import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';

// Presentation only. The service adapter must validate owner/day and receipt
// references before supplying rows. No API, persistence or automatic effects.
export type SavedMealRow = {key:string; title:string; detail?:string};
type Props = {
  open:boolean; busy:boolean; available:boolean;
  rows:SavedMealRow[]; error:boolean;
  onOpen():void; onClose():void; onSelect(key:string):void;
};
export default function CoachSavedMealOptions(props:Props){
  const {i18n}=useTranslation(),es=i18n.language.startsWith('es');
  const say=(en:string,spanish:string)=>es?spanish:en;
  const action=(label:string,fn:()=>void,key?:string)=><Pressable key={key} accessibilityRole="button" accessibilityState={{disabled:props.busy||!props.available}} disabled={props.busy||!props.available} style={styles.action} onPress={fn}><Text style={styles.label}>{label}</Text></Pressable>;
  if(!props.open)return action(say('Saved meal options today','Opciones de comida guardadas hoy'),props.onOpen);
  return <View style={styles.container}>
    <Text style={styles.body}>{say('Choose an earlier result to review. Nothing is added to your diary.','Elige un resultado anterior para revisarlo. No se añade nada al diario.')}</Text>
    {props.busy?<ActivityIndicator accessibilityLabel={say('Loading saved options','Cargando opciones guardadas')}/>:props.error?<>
      <Text accessibilityRole="alert" style={styles.body}>{say('I could not load your saved options. Try again when connected.','No pude cargar tus opciones guardadas. Inténtalo cuando tengas conexión.')}</Text>
      {action(say('Try again','Intentar de nuevo'),props.onOpen)}
    </>:props.rows.length?props.rows.map(row=><View key={row.key}>
      {action(row.title,()=>props.onSelect(row.key),row.key)}
      {row.detail&&<Text style={styles.detail}>{row.detail}</Text>}
    </View>):<Text style={styles.body}>{say('No saved meal options are available today.','No hay opciones de comida guardadas disponibles hoy.')}</Text>}
    <Pressable accessibilityRole="button" style={styles.action} onPress={props.onClose}><Text style={styles.label}>{say('Close','Cerrar')}</Text></Pressable>
  </View>;
}
const styles=StyleSheet.create({container:{gap:8,paddingVertical:8},body:{fontSize:15,lineHeight:22,color:'#263F34'},detail:{fontSize:13,lineHeight:19,color:'#586A5E'},action:{minHeight:44,paddingHorizontal:12,paddingVertical:10,justifyContent:'center',alignSelf:'flex-start',borderRadius:14,backgroundColor:'#EDF3EF'},label:{fontSize:14,color:'#27614D'}});

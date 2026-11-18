import React,{useEffect,useLayoutEffect,useState} from 'react';
import {View,Text,Modal,Pressable,ScrollView,StyleSheet,Platform} from 'react-native';
import {useTranslation} from 'react-i18next';
/** Same dismissible stat explanation pattern as ConsistencyScore, with scrollable large-text content. */
export function DashboardStatInfo({title,explanation,isDark,ownerId}:{title:string;explanation:string;isDark:boolean;ownerId:string}){
 const [openedForOwner,setOpenedForOwner]=useState<string|null>(null),{i18n}=useTranslation(),es=i18n.language.startsWith('es');
 const visible=openedForOwner===ownerId;
 useEffect(()=>setOpenedForOwner(null),[ownerId]);
 // RN Web activates Modal's Escape listener only after fade-in. Accept Escape from the first committed frame.
 useLayoutEffect(()=>{
  if(Platform.OS!=='web'||!visible||typeof document==='undefined')return;
  let dismissed=false;
  const escape=(event:KeyboardEvent)=>{
   if(event.key!=='Escape'||dismissed)return;
   dismissed=true;event.preventDefault();event.stopPropagation();setOpenedForOwner(null);
  };
  document.addEventListener('keydown',escape,true);
  return()=>document.removeEventListener('keydown',escape,true);
 },[visible,ownerId]);
 const close=()=>setOpenedForOwner(null),muted=isDark?'#A0A2B8':'#6B7280';
 return <>
  <View style={styles.infoSlot}><Pressable onPress={()=>setOpenedForOwner(ownerId)} accessibilityRole="button" accessibilityLabel={`${es?'Información sobre':'About'} ${title}`} accessibilityState={{expanded:visible}} aria-expanded={visible} hitSlop={0} style={styles.info}><Text style={{fontSize:15,color:muted}}>ⓘ</Text></Pressable></View>
  <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
   <Pressable style={styles.backdrop} onPress={close} accessibilityRole="button" accessibilityLabel={es?'Cerrar información':'Dismiss information'}>
    <Pressable onPress={event=>event.stopPropagation()} accessibilityViewIsModal style={[styles.panel,{backgroundColor:isDark?'#1C1C1E':'#FFFFFF'}]}>
     <View style={styles.heading}><Text accessibilityRole="header" style={[styles.title,{color:muted}]}>{title}</Text><Pressable onPress={close} accessibilityRole="button" accessibilityLabel={es?'Cerrar':'Close'} style={[styles.close,{backgroundColor:isDark?'#2C2C2E':'#F2F2F7'}]}><Text style={{color:muted,fontSize:18}}>✕</Text></Pressable></View>
     <ScrollView><Text style={[styles.explanation,{color:isDark?'#E5E5EA':'#1C1C1E'}]}>{explanation}</Text></ScrollView>
    </Pressable>
   </Pressable>
  </Modal>
 </>;
}
const styles=StyleSheet.create({infoSlot:{width:22,height:22,position:'relative',marginHorizontal:4},info:{position:'absolute',left:-11,top:-11,width:44,height:44,alignItems:'center',justifyContent:'center'},backdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.45)',justifyContent:'center',alignItems:'center',padding:24},panel:{borderRadius:20,padding:24,width:'100%',maxWidth:380,maxHeight:'85%',shadowColor:'#000',shadowOffset:{width:0,height:8},shadowOpacity:0.25,shadowRadius:20,elevation:10},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:14},title:{flex:1,fontSize:12,fontWeight:'700',letterSpacing:0.6,textTransform:'uppercase'},close:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},explanation:{fontSize:15,lineHeight:23}});

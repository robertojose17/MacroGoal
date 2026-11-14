import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Modal,TouchableOpacity,StyleSheet,ScrollView} from 'react-native';
import {useTranslation} from 'react-i18next';
import {colors} from '@/styles/commonStyles';
import {parseTdeeProposal,type TdeeProposal,type ReviewResult,type createTdeeReviewController} from '@/utils/tdeeProposalReview';
type Controller=ReturnType<typeof createTdeeReviewController>;
/** Isolated until the server issuer is enabled. Never accepts on mount or dismiss. */
export function TdeeProposalReview({visible,active,ownerId,proposal,controller,isDark,onClose,onResolved}:{visible:boolean;active:boolean;ownerId?:string;proposal:TdeeProposal|null;controller:Controller;isDark:boolean;onClose:()=>void;onResolved:(result:ReviewResult)=>void}){
 const {i18n}=useTranslation(),es=i18n.language.startsWith('es'),label=(en:string,sp:string)=>es?sp:en;
 const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[result,setResult]=useState<ReviewResult|null>(null),[failed,setFailed]=useState(false),[clock,setClock]=useState(Date.now());
 const epoch=useRef(0),live=useRef({visible,active,ownerId});live.current={visible,active,ownerId};
 const text=isDark?colors.textDark:colors.text,muted=isDark?colors.textSecondaryDark:colors.textSecondary,bg=isDark?colors.cardDark:colors.card;
 const run=async(accept:boolean)=>{if(!live.current.visible||!live.current.active||!ownerId)return;if(controller.busy){setReady(false);setFailed(true);return;}const generation=epoch.current,owner=ownerId;setBusy(true);setFailed(false);
  const current=()=>epoch.current===generation&&live.current.visible&&live.current.active&&live.current.ownerId===owner;
  try{const next=accept&&proposal?await controller.accept(proposal):await controller.recover();if(!current())return;setResult(next);setReady(next.status==='idle');if(next.status==='resolved')onResolved(next);}
  catch{if(current()){setFailed(true);setReady(false);}}finally{if(current())setBusy(false);}
 };
 useEffect(()=>{++epoch.current;setReady(false);setResult(null);setFailed(false);setBusy(false);setClock(Date.now());if(visible&&active&&ownerId)void run(false);return()=>{++epoch.current;};},[visible,active,ownerId,controller]);
 useEffect(()=>{if(!visible||!active)return;const id=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(id);},[visible,active]);
 let valid=false;try{if(proposal&&ownerId){parseTdeeProposal(proposal,ownerId,clock);valid=true;}}catch{}
 const disabled=busy||!ready||!valid;
 const button=(title:string,fn:()=>void,off=false)=><TouchableOpacity accessibilityRole="button" accessibilityState={{disabled:off}} disabled={off} onPress={fn} style={[styles.button,{borderColor:colors.primary,opacity:off?0.45:1}]}><Text style={{color:colors.primary}}>{title}</Text></TouchableOpacity>;
 return <Modal transparent visible={visible&&active&&!!ownerId} animationType="fade" onRequestClose={onClose}><View style={styles.overlay}><View accessibilityViewIsModal style={[styles.panel,{backgroundColor:bg}]}><ScrollView>
  <Text style={[styles.title,{color:text}]}>{label('Review your targets','Revisa tus metas')}</Text>
  {valid&&proposal?<>
   <Text style={{color:muted}}>{label('Daily targets: current → proposed','Metas diarias: actuales → propuestas')}</Text>
   {(['calories','proteinG','carbsG','fatsG','fiberG'] as const).map((key,index)=><View key={key} style={styles.row}><Text style={{color:text}}>{[label('Calories','Calorías'),label('Protein','Proteína'),label('Carbs','Carbohidratos'),label('Fat','Grasa'),label('Fiber','Fibra')][index]}</Text><Text style={{color:text}}>{proposal.current[key]} → {proposal.target[key]} {index===0?'kcal':'g'}</Text></View>)}
   <Text style={{color:muted}}>{label('Your targets change only after you accept.','Tus metas cambian solamente cuando aceptas.')}</Text>
  </>:<Text style={{color:muted}}>{label('Request a fresh review before changing your targets.','Solicita una revisión actualizada antes de cambiar tus metas.')}</Text>}
  {(failed||result?.status==='unresolved')&&<Text accessibilityRole="alert" style={{color:muted}}>{label('The result is not confirmed. Check its status before trying another change.','El resultado no está confirmado. Revisa su estado antes de intentar otro cambio.')}</Text>}
  {result?.status==='resolved'&&<Text accessibilityRole="alert" style={{color:text}}>{result.receipt.status==='rejected'?label('Nothing was applied by this request. Request a fresh review.','Esta solicitud no aplicó cambios. Solicita una revisión actualizada.'):result.receipt.goalState==='superseded'?label('This change was saved, but your targets have since changed. Refresh to see the current targets.','Este cambio se guardó, pero tus metas cambiaron después. Actualiza para ver las metas actuales.'):label('Your targets were saved. Refreshing your current plan.','Tus metas se guardaron. Actualizando tu plan actual.')}</Text>}
  {button(label('Accept these targets','Aceptar estas metas'),()=>{void run(true);},disabled)}
  {(failed||result?.status==='unresolved')&&button(label('Check status','Revisar estado'),()=>{void run(false);},busy)}
  {button(label('Close','Cerrar'),onClose)}
 </ScrollView></View></View></Modal>;
}
const styles=StyleSheet.create({overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.45)',alignItems:'center',justifyContent:'center',padding:20},panel:{width:'100%',maxWidth:460,maxHeight:'85%',borderRadius:16,padding:20},title:{fontSize:18,fontWeight:'600',marginBottom:12},row:{flexDirection:'row',justifyContent:'space-between',gap:12,paddingVertical:10},button:{padding:12,borderWidth:1,borderRadius:10,marginTop:12}});

import React from 'react';
import {Text,TouchableOpacity,View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {colors} from '@/styles/commonStyles';
import {TDEE_REVIEW_RELEASE_ENABLED} from '@/utils/tdeeReviewRelease';
import {useTdeeProposalBridge} from '@/hooks/useTdeeProposalBridge';
import {TdeeProposalReview} from '@/components/TdeeProposalReview';
type Props={ownerId?:string;isDark:boolean;blocked:boolean;refreshVerifiedGoal:()=>Promise<{profile:{id:string};goal:{user_id:string}}>};
/** The disabled release does not mount hooks, render controls, or call the issuer. */
export function TdeeReviewEntry(props:Props){return TDEE_REVIEW_RELEASE_ENABLED?<EnabledReview {...props}/>:null;}
function EnabledReview({ownerId,isDark,blocked,refreshVerifiedGoal}:Props){
 const state=useTdeeProposalBridge(ownerId,blocked,refreshVerifiedGoal),{i18n}=useTranslation(),es=i18n.language.startsWith('es');
 const label=(en:string,sp:string)=>es?sp:en,disabled=blocked||state.busy||!state.active||!ownerId;
 const messages={none:'',unavailable:label('A review is not available. Your targets were not changed by this review.','La revisión no está disponible. Esta revisión no cambió tus metas.'),no_proposal:label('There is no target change to review with the available data.','No hay cambios de metas para revisar con los datos disponibles.'),refresh_failed:label('The acceptance was recorded, but current targets could not be reloaded. Refresh before continuing.','La aceptación se registró, pero no se pudieron actualizar las metas visibles. Actualiza antes de continuar.'),refreshed:label('Your current targets have been refreshed.','Tus metas actuales se actualizaron.')};
 return <View style={{gap:10,paddingVertical:12}}><TouchableOpacity accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={()=>{void state.review();}} style={{padding:12,borderWidth:1,borderColor:colors.primary,borderRadius:10,opacity:disabled?0.5:1}}><Text style={{color:colors.primary}}>{label('Review my TDEE targets','Revisar mis metas del TDEE')}</Text></TouchableOpacity>
  {state.message!=='none'&&<Text accessibilityRole="alert" style={{color:isDark?colors.textDark:colors.text}}>{messages[state.message]}</Text>}
  <TdeeProposalReview visible={state.visible} active={state.active&&!blocked} ownerId={ownerId} proposal={state.proposal} controller={state.controller} isDark={isDark} onClose={state.close} onResolved={state.resolved}/>
 </View>;
}

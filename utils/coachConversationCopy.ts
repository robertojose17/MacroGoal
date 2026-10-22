// Technical receipt/recovery codes never appear in the user-facing conversation.
export function conversationFailureCopy(reason:string|undefined,pending:boolean,es:boolean):string{
 const say=(en:string,sp:string)=>es?sp:en;
 if(reason==='conversation_paused_unconfirmed')return say('Coach is temporarily paused. I cannot confirm the reply to your last message yet. Your draft is safe to keep editing.','El Coach está pausado temporalmente. Aún no puedo confirmar la respuesta a tu último mensaje. Puedes seguir editando tu borrador.');
 if(reason==='conversation_paused')return say('Coach is temporarily paused. Your message was not sent to AI. You can keep writing and send when Coach is available.','El Coach está pausado temporalmente. Tu mensaje no se envió a la IA. Puedes seguir escribiendo y enviarlo cuando esté disponible.');
 if(reason==='conversation_not_admitted')return say('Coach cannot answer right now. Your message was not sent to AI. Please try later.','El Coach no puede responder ahora. Tu mensaje no se envió a la IA. Inténtalo más tarde.');
 if(['unauthorized','scope_changed','conversation_session_unverified'].includes(reason??''))return say('I could not verify your session. Check that you are signed in before continuing.','No pude verificar tu sesión. Comprueba que has iniciado sesión antes de continuar.');
 if(reason==='conversation_access_unverified')return say('I could not verify access to Coach. Check your access before continuing.','No pude verificar el acceso al Coach. Revisa tu acceso antes de continuar.');
 return pending?say('I could not confirm the reply to your last message. Retry this message before sending another.','No pude confirmar la respuesta a tu último mensaje. Reintenta este mensaje antes de enviar otro.'):say('I could not send your message. Please try again when connected.','No pude enviar tu mensaje. Inténtalo cuando tengas conexión.');
}

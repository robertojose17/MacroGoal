import React,{useEffect,useRef,useState} from 'react';
import {View,Text} from 'react-native';
import {useTranslation} from 'react-i18next';
import {dailyAccess,type DailyAccess} from '@/utils/coachDailyAction';
import type {MealExperienceServices,MealChoices} from '@/utils/coachMealServices';
import type {SavedMealFlow} from '@/utils/coachSavedMealFlows';
import type {MealComposer} from '@/utils/coachMealComposer';
import CoachSavedMealOptions from './CoachSavedMealOptions';
import CoachConversationActions from './CoachConversationActions';
type Props=DailyAccess&{openRequest?:number;service:MealExperienceServices;active:boolean;onActivate():void;onComposer(composer:MealComposer|null):void};
export default function CoachSavedMealBrowser(props:Props){
 const {i18n}=useTranslation(),es=i18n.language.startsWith('es');
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false),[flows,setFlows]=useState<SavedMealFlow[]>([]),[selected,setSelected]=useState<MealChoices|null>(null),[truncated,setTruncated]=useState(false);
 const access=useRef(props);access.current=props;const epoch=useRef(0),locked=useRef(false),service=props.service;
 const clear=()=>{epoch.current++;locked.current=false;setOpen(false);setBusy(false);setError(false);setFlows([]);setSelected(null);setTruncated(false);};
 useEffect(()=>{clear();let disposed=false,stop=()=>{};const day=service.today();void service.owner().then(owner=>{if(!disposed&&owner)stop=service.subscribeInvalidation(owner,()=>{if(!disposed)clear();});});const timer=setInterval(()=>{if(!disposed&&service.today()!==day)clear();},15000);return()=>{disposed=true;epoch.current++;locked.current=false;stop();clearInterval(timer);};},[service]);
 async function run(flow?:SavedMealFlow){
  if(locked.current||dailyAccess(access.current)!=='ready')return;
  locked.current=true;const version=++epoch.current,day=service.today();setBusy(true);setError(false);setOpen(true);if(!flow)setSelected(null);props.onActivate();
  try{const owner=await service.owner();if(version!==epoch.current)return;if(!owner){setError(true);return;}
   const result=flow?await service.restoreSaved(()=>access.current,flow):await service.listSaved(()=>access.current);
   if(version!==epoch.current)return;const currentOwner=await service.owner();if(version!==epoch.current)return;
   if(owner!==currentOwner||day!==service.today()||dailyAccess(access.current)!=='ready'){clear();return;}
   if(result.kind!=='ready'){setError(true);return;}
   if('flows' in result){setFlows(result.flows);setTruncated(result.truncated);setSelected(null);}else setSelected(result);
  }catch{if(version===epoch.current)setError(true);}finally{if(version===epoch.current){locked.current=false;setBusy(false);}}
 }
 useEffect(()=>{if(props.openRequest)void run();},[props.openRequest]);
 const operation=(f:SavedMealFlow)=>f.operation==='estimate'?(es?'Estimación':'Estimate'):f.operation==='prepare_general_estimate'?(es?'Comida general':'General meal'):f.operation==='import_discovery'?(es?'Resultado de búsqueda':'Search result'):(es?'Opciones iniciales':'Initial options');
 const authority=(v:string)=>({unknown:es?'Nutrición incompleta':'Incomplete nutrition',estimated:es?'Nutrición estimada':'Estimated nutrition',user_edited:es?'Valores editados':'Edited values',official:es?'Nutrición oficial':'Official nutrition',publisher_reported:es?'Nutrición publicada':'Published nutrition'})[v];
 if(dailyAccess(props)!=='ready'||!props.active||(!open&&!selected))return null;
 return <View style={{gap:8,paddingVertical:8}}>
  {!selected&&<CoachSavedMealOptions open={open&&!selected} busy={busy} available={!props.busy} error={error} rows={flows.map(f=>({key:f.receiptId,title:f.options.map(o=>o.name).join(' · '),detail:`${operation(f)} · ${new Date(f.savedAt).toLocaleTimeString(es?'es':'en',{hour:'2-digit',minute:'2-digit'})} · ${[...new Set(f.options.map(o=>authority(o.authority)))].join(', ')}`}))} onOpen={()=>{void run();}} onClose={clear} onSelect={key=>{const flow=flows.find(f=>f.receiptId===key);if(flow)void run(flow);}}/>}
  {open&&!selected&&truncated&&<Text>{es?'Se muestran los 20 resultados más recientes.':'Showing the 20 most recent results.'}</Text>}
  {selected&&<CoachConversationActions key={selected.requestId} {...props} busy={props.busy||busy} initialResult={selected} flowId={selected.flowId} hasConversation active={props.active} onResume={props.onActivate} showRecovery onComposer={props.onComposer}/>}
 </View>;
}

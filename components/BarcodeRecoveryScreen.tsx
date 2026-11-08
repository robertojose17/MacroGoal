import { recoveryRouteContext } from '@/utils/recoveryRouteContext';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import { buildSyntheticOffData } from '@/utils/servingParser';
import { recoveryDiscoveryOnce, recoveryRefine, expireRecovery } from '@/utils/recoveryDiscoveryOnce';
import { webCameraJpegBytes } from '@/utils/cameraCaptureBytes';
import { unknownBarcodeAttempt, runUnknownAttempt, type UnknownAttempt } from '@/utils/unknownBarcodeAttempt';
import { useColorScheme } from '@/hooks/useColorScheme';

type Candidate = {
  name:string; brand:string; variant:string; barcode:string|null; serving:string; serving_g:number;
  nutrition:Record<string,number|null>; image_url:string; nutrition_image_url?:string; exact_barcode:boolean;
  can_confirm:boolean; proposal?:string; conflicts?:string[]; label_issue?:string;
  provenance:{kind:string;url:string;retrieved_at:string};
};
type Review = {session?:string;candidates?:Candidate[];photo?:Candidate|null;issues?:{field:string;reason:string}[];search_code?:string;source_links?:string[];next_step?:string;front_photo_url?:string;code?:string};
type ManualFields = {name:string;brand:string;serving:string;serving_g:string;calories:string;protein:string;carbs:string;fat:string;fiber:string};
const emptyManual = ():ManualFields => ({name:'',brand:'',serving:'',serving_g:'',calories:'',protein:'',carbs:'',fat:'',fiber:''});
const manualNumber = (value:string):number|null => {const raw=value.trim();if(!/^\d+(?:[.,]\d+)?$/.test(raw))return null;const n=Number(raw.replace(',','.'));return Number.isFinite(n)&&n>=0&&n<=1000000?n:null;};
type Stage = 'search'|'results'|'front'|'label'|'front_prompt'|'label_prompt'|'manual'|'unavailable';
export default function FoodPhotoCaptureScreen({unknownEnabled=true}:{unknownEnabled?:boolean}) {
  const params=useLocalSearchParams(),router=useRouter(),{i18n}=useTranslation();
  const es=i18n.language.startsWith('es'),dark=String(useColorScheme())==='dark';
  const tr=(en:string,spanish:string)=>es?spanish:en;
  const param=(name:string)=>typeof params[name]==='string'?params[name] as string:'';
  const name=param('name'),brand=param('brand');
  const unknown=param('type')==='new_product';
  const owner=useRef('');
  const attempt=useRef<(UnknownAttempt & {manualRequestId?:string;manualDraft?:ManualFields})|null>(null),generation=useRef(0),focused=useRef(false);
  useFocusEffect(React.useCallback(()=>{focused.current=true;generation.current++;return()=>{focused.current=false;generation.current++;};},[]));
  const [stage,setStage]=useState<Stage>(unknown?'front_prompt':'search'),[busy,setBusy]=useState(!unknown),[error,setError]=useState('');
  const [review,setReview]=useState<Review>({}),[selected,setSelected]=useState<Candidate|null>(null);
  const [permission,requestPermission]=useCameraPermissions();
  const recoveryKey=useRef('');
  const camera=useRef<CameraView>(null),inFlight=useRef(false),front=useRef<string|null>(null);
  const [saving,setSaving]=useState(false);
  const [manual,setManual]=useState<ManualFields>(emptyManual);
  const manualRequestId=useRef<string>('');
  const [manualSessionExpired,setManualSessionExpired]=useState(false);
  const ink=dark?'#F5F6FA':'#182326',background=dark?'#101719':'#F7F9F8',card=dark?'#1D292B':'#FFFFFF';
  const fieldNames:Record<string,string>={label:tr('nutrition label','etiqueta nutricional'),serving:tr('the serving column and serving description','la columna y descripción de la porción'),preparation:tr('whether the label is for prepared food or food as sold','si la etiqueta corresponde al alimento preparado o tal como se vende'),serving_g:tr('serving grams; for a single package, show one serving per container and the front net weight','gramos por porción; para un paquete individual, muestra una porción por envase y el peso neto del frente'),calories:tr('calories','calorías'),protein:tr('protein','proteína'),carbs:tr('total carbohydrates','carbohidratos totales'),fat:tr('total fat','grasa total'),fiber:tr('fiber','fibra'),barcode:tr('barcode','código de barras')};
  function message(code:string) {
    const messages:Record<string,string>={
      recovery_not_enabled:tr('Product recovery is not available yet. Please try again after the update.','La recuperación del producto aún no está disponible. Inténtalo después de la actualización.'),
      request_already_used_or_limit:tr('This attempt has already been processed or the search limit was reached. Start a new search later.','Este intento ya se procesó o se alcanzó el límite de búsquedas. Inicia otra búsqueda más tarde.'),
      expired_proposal:tr('This review expired. Search again to check the current product data.','Esta revisión venció. Busca de nuevo para comprobar los datos actuales.'),
      save_conflict:tr('The catalog changed during this review. Search again before saving so a newer correction is not overwritten.','El catálogo cambió durante la revisión. Busca de nuevo antes de guardar para no sobrescribir otra corrección.'),
      save_unknown:tr('We could not confirm whether the save finished. Retrying this same confirmation checks its receipt without another AI search.','No pudimos confirmar si se terminó de guardar. Reintentar esta misma confirmación consulta su recibo sin otra búsqueda de IA.'),
      auth:tr('Please sign in again before reporting product data.','Inicia sesión de nuevo antes de reportar datos.'),
      invalid_photo:tr('Please retake the photos in this session.','Vuelve a tomar las fotos en esta sesión.'),
      invalid_manual_values:tr('Check the required fields and numbers before reviewing.','Comprueba los campos requeridos y los números antes de revisar.'),
      invalid_manual_session:tr('This manual review session is no longer available. Start a new manual review.','Esta sesión de revisión manual ya no está disponible. Inicia una nueva revisión manual.'),
    };
    return messages[code]||tr('We could not complete this step. Your product data has not been confirmed. Please try again.','No pudimos completar este paso. Los datos no se han confirmado. Inténtalo de nuevo.');
  }
  async function request(body:Record<string,unknown>,active=()=>focused.current) {
    const {data:{session}}=await supabase.auth.getSession();
    if(!active())throw Error('cancelled');
    if(!session||(unknown&&owner.current!==session.user.id))throw Error('auth');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),150000);
    let response:Response;
    try { response=await fetch(SUPABASE_PROJECT_URL+'/functions/v1/vision-nutrition-extract',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
      body:JSON.stringify(body),signal:controller.signal,
    }); } catch(error) { if(body.action==='recovery_confirm')throw Error('save_unknown');throw error; } finally { clearTimeout(timer); }
    let data:any;
    try{data=await response.json();}catch(error){if(body.action==='recovery_confirm')throw Error('save_unknown');throw error;}
    if(unknown){const {data:{session:latest}}=await supabase.auth.getSession();if(!latest||latest.user.id!==owner.current)throw Error('auth');}
    if(!response.ok||data.status==='error'||data.status==='unavailable')throw Error(data.code||'unavailable');
    return data;
  }
  async function operation(work:(active:()=>boolean)=>Promise<void>) {
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    const current=generation.current,active=()=>focused.current&&generation.current===current;
    try{await work(active);}catch(e){if(!active())return;const code=e instanceof Error?e.message:'';setError(message(code));if(unknown&&stage==='manual'&&!selected&&['expired_proposal','invalid_manual_session'].includes(code))setManualSessionExpired(true);if(unknown&&code==='auth'){setReview({});setSelected(null);setStage('unavailable');}if(['expired_proposal','request_already_used_or_limit','save_conflict'].includes(code)){expireRecovery(recoveryKey.current);if(!unknown)setStage('search');}}
    finally{inFlight.current=false;if(active())setBusy(false);}
  }
  async function discover(retry=false,active=()=>true) {
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try {
      const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('auth');
      recoveryKey.current=session.user.id+':'+param('barcode');
      const data=await recoveryDiscoveryOnce(recoveryKey.current,()=>request({action:'recovery_discover',barcode:param('barcode'),food_item_id:param('food_item_id')||null,name,brand}),retry);
      if(active()){setReview(data);setSelected(null);setStage('results');}
    } catch(e){if(active()){setError(message(e instanceof Error?e.message:''));setStage('search');}}
    finally{inFlight.current=false;if(active())setBusy(false);}
  }
  useFocusEffect(React.useCallback(()=>{
    let mounted=true;const current=generation.current;const active=()=>mounted&&focused.current&&current===generation.current;
    setBusy(false);
    if(!unknown)void discover(false,active);
    else void (async()=>{
      setReview({});setSelected(null);setStage('front_prompt');setError('');front.current=null;owner.current='';attempt.current=null;setManual(emptyManual());setManualSessionExpired(false);
      const {data:{session}}=await supabase.auth.getSession();
      if(!active())return;
      if(!session){setError(message('auth'));setStage('unavailable');return;}
      owner.current=session.user.id;
      attempt.current=unknownBarcodeAttempt(session.user.id,param('barcode'));
      manualRequestId.current=attempt.current.manualRequestId||'';
      if(attempt.current.manualDraft)setManual({...attempt.current.manualDraft});
      front.current=attempt.current.frontUrl||null;
      if(attempt.current.pending) {
        setBusy(true);
        try{await attempt.current.pending;}catch{/* Never automatically replay an uncertain provider request. */}
        if(!active())return;
        setBusy(false);
      }
      if(attempt.current.review)applyUnknownReview(attempt.current.review);
      else if(attempt.current.frontUrl)setStage('unavailable');
    })().catch(()=>{if(active()){setError(message('auth'));setStage('unavailable');setBusy(false);}});
    return()=>{mounted=false;};
  },[unknown,param('barcode')]));
  function applyUnknownReview(data:Review) {
    setReview(data);setSelected(attempt.current?.selected||null);
    if(data.code==='barcode_now_known'||data.next_step==='reload_product'){setStage('search');return;}
    if(data.next_step==='manual'){setStage('manual');return;}
    setStage((data.candidates||[]).some(c=>c.can_confirm)||data.photo?.can_confirm?'results':attempt.current?.rearAttempted?'manual':'label_prompt');
  }
  function manualEntry(candidate?:Candidate) {
    if(!unknown||inFlight.current||selected)return;
    const value=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?String(n):'';
    setManual(candidate?{name:candidate.name||'',brand:candidate.brand||'',serving:candidate.serving||'',serving_g:value(candidate.serving_g),
      calories:value(candidate.nutrition.calories),protein:value(candidate.nutrition.protein),carbs:value(candidate.nutrition.carbs),fat:value(candidate.nutrition.fat),fiber:value(candidate.nutrition.fiber)}:emptyManual());
    setError('');setStage('manual');
  }
  async function reviewManual() {
    if(!unknown||inFlight.current||selected||manualSessionExpired)return;
    const serving_g=manualNumber(manual.serving_g),calories=manualNumber(manual.calories),protein=manualNumber(manual.protein),carbs=manualNumber(manual.carbs),fat=manualNumber(manual.fat);
    const fiber=manual.fiber.trim()===''?null:manualNumber(manual.fiber);
    if(!manual.name.trim()||!manual.brand.trim()||!manual.serving.trim()||serving_g===null||serving_g<=0||calories===null||protein===null||carbs===null||fat===null||(manual.fiber.trim()!==''&&fiber===null)){
      setError(tr('Complete the name, brand, serving and required numbers. Enter 0 only when the label says zero; fiber is optional.','Completa nombre, marca, porción y números requeridos. Ingresa 0 solo si la etiqueta indica cero; la fibra es opcional.'));return;
    }
    const values={name:manual.name.trim(),brand:manual.brand.trim(),serving:manual.serving.trim(),serving_g,nutrition:{calories,protein,carbs,fat,fiber}};
    await operation(async active=>{
      let sessionToken=review.session;
      if(!sessionToken){
        if(!manualRequestId.current)manualRequestId.current='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16);});
        if(attempt.current)attempt.current.manualRequestId=manualRequestId.current;
        const started=await request({action:'recovery_manual_start',barcode:param('barcode'),request_id:manualRequestId.current},active);
        if(!active())return;
        if(started.code==='barcode_now_known'||started.next_step==='reload_product'){applyUnknownReview(started);return;}
        if(!started.session)throw Error('unavailable');
        sessionToken=started.session;setReview(started);if(attempt.current)attempt.current.review=started;
      }
      // A dispatched manual revision may permanently invalidate earlier signed
      // AI proposals, even if its response is lost or this screen loses focus.
      // Retain only the draft/session until the new signed review is received.
      const manualPending:Review={session:sessionToken,next_step:'manual',candidates:[],photo:null};
      const currentAttempt=attempt.current;
      if(currentAttempt){currentAttempt.manualDraft={...manual};currentAttempt.review=manualPending;}
      setReview(manualPending);
      const data=await request({action:'recovery_manual_review',session:sessionToken,values},active);
      if(!data.photo?.can_confirm||!data.photo?.proposal||data.photo?.provenance?.kind!=='user_entered')throw Error('unavailable');
      if(currentAttempt)currentAttempt.review=data;
      if(!active())return;
      setReview(data);setStage('results');
    });
  }
  async function beginUnknownPhoto(kind:'front'|'label') {
    if(inFlight.current)return;
    const current=generation.current;
    if(kind==='front'&&attempt.current?.frontUrl) {
      const a=attempt.current;inFlight.current=true;setBusy(true);
      try {if(a.pending)await a.pending;}catch{/* Keep this attempt; never rebill on resume. */}
      finally {inFlight.current=false;}
      if(!focused.current||generation.current!==current)return;
      setBusy(false);front.current=a.frontUrl||null;
      if(a.review)applyUnknownReview(a.review);else setStage('unavailable');
      return;
    }
    if(!unknownEnabled||(kind==='label'&&!review.session)) {
      setError(tr('Photo recovery is unavailable for this attempt. You can continue to the next option.','La recuperación por foto no está disponible en este intento. Puedes continuar a la siguiente opción.'));
      setStage('unavailable');return;
    }
    inFlight.current=true;
    try {
      const granted=permission?.granted||(await requestPermission()).granted;
      if(!focused.current||generation.current!==current)return;
      if(!granted){setError(tr('Camera access is unavailable. Continue to the next option or go back.','La cámara no está disponible. Continúa a la siguiente opción o vuelve atrás.'));setStage(kind==='front'?'unavailable':'manual');return;}
      setError('');setStage(kind);
    }catch{if(focused.current&&generation.current===current){setError(tr('The camera could not open. Continue to the next option.','No se pudo abrir la cámara. Continúa a la siguiente opción.'));setStage(kind==='front'?'unavailable':'manual');}}finally{inFlight.current=false;}
  }
  async function captureUnknown() {
    const kind=stage;
    await operation(async active=>{
      const {data:{session}}=await supabase.auth.getSession();if(!active())return;if(!session)throw Error('auth');
      if(owner.current&&owner.current!==session.user.id)throw Error('auth');owner.current=session.user.id;
      const a=attempt.current||unknownBarcodeAttempt(session.user.id,param('barcode'));attempt.current=a;
      // Never reinterpret an uncertain initial request as a new billable attempt.
      if(kind==='front'&&a.frontUrl){if(a.review)applyUnknownReview(a.review);else setStage('unavailable');return;}
      try {
      const photo=await camera.current?.takePictureAsync({quality:0.8,...(Platform.OS==='web'?{base64:true,imageType:'jpg' as const}:{})});if(!active())return;
      if(!photo?.uri)throw Error('capture_failed');
      const url=await upload(photo,kind,active);if(!active())return;
      if(kind==='front'){a.frontUrl=url;front.current=url;}
      else a.rearAttempted=true;
        const data=await runUnknownAttempt(a,()=>request(kind==='front'
          ?{action:'recovery_discover',barcode:param('barcode'),photo_front_url:url,request_id:a.requestId}
          :{action:'recovery_photos',session:review.session,photo_label_url:url},active));
        if(active())applyUnknownReview(data);
      }catch(e){if(active())setStage(kind==='front'?'unavailable':'manual');throw e;}
    });
  }
  async function beginPhotos() {
    if(!review.session)return;
    if(!permission?.granted) {
      const result=await requestPermission();
      if(!result.granted){setError(tr('Camera access is needed to photograph your package.','Se necesita acceso a la cámara para fotografiar el empaque.'));return;}
    }
    front.current=null;setError('');setStage('front');
  }
  async function upload(photo:{uri:string;base64?:string},kind:string,active=()=>focused.current) {
    const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('auth');
    if(!active())throw Error('cancelled');
    let bytes:Uint8Array;
    if(Platform.OS==='web')bytes=webCameraJpegBytes(photo);
    else {
      const base64=await FileSystem.readAsStringAsync(photo.uri,{encoding:FileSystem.EncodingType.Base64});
      const binary=atob(base64);bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    }
    if(!active())throw Error('cancelled');
    if(unknown&&owner.current!==session.user.id)throw Error('auth');
    const path='submissions/'+session.user.id+'/'+Date.now()+'_'+kind+'.jpg';
    const {error:uploadError}=await supabase.storage.from('food-photos').upload(path,bytes,{contentType:'image/jpeg',upsert:false});
    if(uploadError)throw Error('upload_failed');
    return supabase.storage.from('food-photos').getPublicUrl(path).data.publicUrl;
  }
  async function capture() {
    if(unknown){await captureUnknown();return;}
    await operation(async active=>{
      const photo=await camera.current?.takePictureAsync({quality:0.8,...(Platform.OS==='web'?{base64:true,imageType:'jpg' as const}:{})});
      if(!active())return;if(!photo?.uri)throw Error('capture_failed');
      const url=await upload(photo,stage,active);if(!active())return;
      if(stage==='front'){front.current=url;setStage('label');return;}
      const data=await recoveryRefine(recoveryKey.current,()=>request({action:'recovery_photos',session:review.session,photo_front_url:front.current,photo_label_url:url})).catch(error=>{setStage('search');throw error;});
      if(active()){setReview(data);setStage('results');}
    });
  }
  async function select(candidate:Candidate) {
    if(inFlight.current||!candidate.can_confirm||!candidate.proposal)return;
    // An uncertain save can only retry its original signed proposal/receipt.
    if(selected&&selected.proposal!==candidate.proposal)return;
    setSelected(candidate);if(unknown&&attempt.current)attempt.current.selected=candidate;setSaving(true);
    try { await operation(async active=>{
      const data=await request({action:'recovery_confirm',proposal:candidate.proposal,confirmations:{identity:true,serving:true,nutrition:true,shared:true}},active);
      if(!active())return;
      if(data.status!=='approved'||!data.food_item?.id)throw Error('save_unknown');
      finish(data.food_item);
    }); } finally {if(focused.current)setSaving(false);}
  }
  function finish(saved:any) {
    const destination={pathname:'/food-details' as const,params:{
      offData:JSON.stringify(buildSyntheticOffData(saved,{preserveServing:true})),food_item_id:saved.id,source:'barcode',
      ...recoveryRouteContext(params),recoverySaved:'1',
    }};
    if(param('type')==='correction')router.dismissTo(destination);
    else router.replace(destination);
  }
  const button=(label:string,onPress:()=>void,disabled=false,secondary=false)=>(
    <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled:disabled||busy}} disabled={disabled||busy} onPress={onPress}
      style={[styles.button,{backgroundColor:secondary?card:'#217365',opacity:disabled||busy?0.45:1,borderColor:dark?'#49605A':'#D8E2DD',borderWidth:secondary?1:0}]}>
      <Text style={{color:secondary?ink:'#FFFFFF',fontSize:16,fontWeight:'600',textAlign:'center'}}>{label}</Text>
    </TouchableOpacity>);
  function source(url:string,label:string) {
    return <TouchableOpacity accessibilityRole="link" onPress={()=>{if(/^https:\/\//i.test(url))void Linking.openURL(url).catch(()=>{});}}>
      <Text style={styles.link}>{label} ↗</Text>
    </TouchableOpacity>;
  }
  function candidateCard(candidate:Candidate,key:string) {
    return <View key={key} style={[styles.card,{backgroundColor:card}]}>
      {candidate.image_url&&<Image accessibilityLabel={candidate.name} source={{uri:candidate.image_url}} style={styles.image} resizeMode="contain"/>}
      <Text style={[styles.title,{color:ink}]}>{candidate.name}</Text>
      <Text style={[styles.text,{color:ink}]}>{candidate.brand} · {candidate.variant}</Text>
      {candidate.provenance.kind!=='physical_label'&&candidate.provenance.kind!=='user_entered'&&<Text style={[styles.caption,{color:ink}]}>{candidate.provenance.kind==='source_label'?tr('Published label image · two readings','Imagen de etiqueta publicada · dos lecturas'):tr('Published product nutrition · check against your package','Datos nutricionales publicados · comprueba tu empaque')}</Text>}
      <Text style={[styles.caption,{color:ink}]}>{candidate.provenance.kind==='user_entered'?tr('Entered or corrected by you · not independently verified','Ingresado o corregido por ti · sin verificación independiente'):candidate.provenance.kind==='physical_label'
        ?tr('Your package · two label readings · confirm scanned identity','Tu empaque · dos lecturas de etiqueta · confirma la identidad escaneada')
        :candidate.exact_barcode?tr('Source publishes the same barcode','La fuente publica el mismo código'):tr('Source does not publish the barcode — you confirm the product','La fuente no publica el código — tú confirmas el producto')}</Text>
      <Text style={[styles.text,{color:ink}]}>{tr('Per','Por')} {candidate.serving} · {candidate.serving_g} g</Text>
      <View style={styles.macros}>{['calories','carbs','protein','fat','fiber'].filter(k=>candidate.nutrition[k]!=null).map(k=><View key={k} style={styles.macro}>
        <Text style={{color:ink,fontWeight:'700',fontSize:18}}>{candidate.nutrition[k]}{k==='calories'?' kcal':' g'}</Text>
        <Text style={{color:ink,fontSize:12}}>{fieldNames[k]}</Text>
      </View>)}</View>
      {candidate.provenance.kind!=='physical_label'&&candidate.provenance.kind!=='user_entered'&&source(candidate.provenance.url,tr('View product source','Ver fuente del producto'))}
      {candidate.nutrition_image_url&&source(candidate.nutrition_image_url,tr('View nutrition label','Ver etiqueta nutricional'))}
      {!!candidate.label_issue&&<Text style={styles.warning}>{tr('The published label could not be reconciled with this record. These values cannot update the catalog; use clear package photos.','No se pudo conciliar la etiqueta publicada con este registro. Estos valores no pueden actualizar el catálogo; usa fotos claras del empaque.')}</Text>}
      {!!candidate.conflicts?.length&&!candidate.label_issue&&<Text style={styles.warning}>{tr('These online values differ from your readable label. Use your package values below.','Estos valores de internet difieren de tu etiqueta legible. Usa los valores de tu empaque abajo.')}</Text>}
      {unknown&&stage==='results'&&candidate.can_confirm&&button(tr('Edit before saving','Editar antes de guardar'),()=>manualEntry(candidate),!!selected,true)}
      {stage==='results'&&candidate.can_confirm&&button(candidate.provenance.kind==='user_entered'?tr('Confirm reviewed values and save','Confirmar valores revisados y guardar'):tr('This is my product','Este es mi producto'),()=>void select(candidate),!!selected&&selected.proposal!==candidate.proposal)}
    </View>;
  }
  const usableCandidates=(review.candidates||[]).filter(candidate=>candidate.can_confirm);
  const cameraStage=stage==='front'||stage==='label';
  return <SafeAreaView style={[styles.screen,{backgroundColor:background}]} edges={['top','bottom']}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={tr('Back','Atrás')} disabled={saving} onPress={()=>{generation.current++;if(cameraStage){setBusy(false);setStage(unknown?(stage==='front'?'front_prompt':'label_prompt'):'results');}else router.back();}}>
        <Text style={[styles.back,{color:ink}]}>{'\u2039'}</Text>
      </TouchableOpacity>
      <Text style={[styles.heading,{color:ink}]}>{unknown?tr('Find your product','Encuentra tu producto'):tr('Correct product data','Corregir datos del producto')}</Text>
    </View>
    {cameraStage?<View style={{flex:1}}>
      <CameraView ref={camera} style={{flex:1}} facing="back"/>
      <View style={[styles.card,{backgroundColor:card}]}>
        <Text style={[styles.title,{color:ink}]}>{stage==='front'?tr('1. Package front','1. Frente del empaque'):tr('2. Nutrition label','2. Etiqueta nutricional')}</Text>
        <Text style={[styles.text,{color:ink}]}>{stage==='front'?tr('Include the exact product name, flavor and package size.','Incluye el nombre exacto, sabor y tamaño del empaque.'):tr('Include the serving size and all nutrient rows. Keep the text sharp and avoid glare.','Incluye la porción y todas las filas de nutrientes. Mantén el texto nítido y evita reflejos.')}</Text>
        {button(tr('Take photo','Tomar foto'),()=>void capture())}
        {busy&&<ActivityIndicator/>}{!!error&&<Text accessibilityRole="alert" style={styles.warning}>{error}</Text>}
      </View>
    </View>:<ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {!!error&&<Text accessibilityRole="alert" style={styles.warning}>{error}</Text>}
      {busy&&<View style={styles.loading}><ActivityIndicator/><Text style={{color:ink}}>{saving?tr('Saving product data','Guardando los datos del producto'):stage==='manual'?tr('Preparing your review','Preparando tu revisión'):tr('Searching for your product data','Buscando los datos de tu producto')}</Text></View>}
      {!unknown&&!busy&&stage==='search'&&!!error&&button(tr('Retry this scanned product','Reintentar este producto escaneado'),()=>void discover(true))}
      {unknown&&!busy&&stage==='front_prompt'&&<>
        <Text style={[styles.title,{color:ink}]}>{tr('Photograph the package front','Toma una foto del frente del empaque')}</Text>
        <Text style={[styles.text,{color:ink}]}>{tr('We will use the name, brand and flavor to search online. You choose your product before anything is saved.','Usaremos el nombre, la marca y el sabor para buscar en internet. Tú eliges el producto antes de guardar nada.')}</Text>
        {button(tr('Take front photo','Tomar foto del frente'),()=>void beginUnknownPhoto('front'))}
      </>}
      {unknown&&!busy&&stage==='label_prompt'&&<>
        <Text style={[styles.title,{color:ink}]}>{tr('Try the nutrition label','Prueba con la etiqueta nutricional')}</Text>
        <Text style={[styles.text,{color:ink}]}>{tr('No usable online option is available. Photograph the back with the serving size and all nutrition rows.','No hay una opción utilizable de internet. Fotografía la parte de atrás con la porción y todos los nutrientes.')}</Text>
        {button(tr('Take rear label photo','Tomar foto de la etiqueta de atrás'),()=>void beginUnknownPhoto('label'))}
        {button(tr('Label unavailable — enter manually','Etiqueta no disponible — ingresar manualmente'),()=>manualEntry(),false,true)}
      </>}
      {unknown&&!busy&&stage==='unavailable'&&<>
        <Text style={[styles.title,{color:ink}]}>{tr('Photo recovery unavailable','Recuperación por foto no disponible')}</Text>
        <Text style={[styles.text,{color:ink}]}>{tr('We could not obtain a usable photo review session. A rear photo cannot be analyzed in this attempt. You can go back or enter the product manually; no new online search will run automatically.','No pudimos obtener una sesión de revisión utilizable. No podemos analizar la foto de atrás en este intento. Puedes volver o ingresar el producto manualmente; no se hará otra búsqueda automáticamente.')}</Text>
        {button(tr('Continue to manual entry','Continuar al ingreso manual'),()=>setStage('manual'),!!selected)}
      </>}
      {unknown&&!busy&&stage==='manual'&&<>
        <Text style={[styles.title,{color:ink}]}>{tr('Review or enter package values','Revisa o ingresa los valores del empaque')}</Text>
        <Text style={[styles.text,{color:ink}]}>{tr('Barcode: ','Código: ')}{param('barcode')}</Text>
        <Text style={[styles.text,{color:ink}]}>{tr('Use one serving from your package. These values are user-entered, not independently verified. Nothing is saved until you review and confirm on the next screen.','Usa una porción del empaque. Estos valores son ingresados por ti, sin verificación independiente. No se guarda nada hasta revisar y confirmar en la siguiente pantalla.')}</Text>
        {(['name','brand','serving','serving_g','calories','protein','carbs','fat','fiber'] as (keyof ManualFields)[]).map(key=>{
          const labels:Record<keyof ManualFields,string>={name:tr('Product name and variant','Nombre y variante'),brand:tr('Brand','Marca'),serving:tr('Serving description','Descripción de la porción'),serving_g:tr('Grams per serving','Gramos por porción'),calories:tr('Calories (kcal)','Calorías (kcal)'),protein:tr('Protein (g)','Proteína (g)'),carbs:tr('Carbohydrates (g)','Carbohidratos (g)'),fat:tr('Fat (g)','Grasa (g)'),fiber:tr('Fiber (g), optional','Fibra (g), opcional')};
          const numeric=!['name','brand','serving'].includes(key);
          return <View key={key}><Text style={[styles.caption,{color:ink}]}>{labels[key]}</Text><TextInput accessibilityLabel={labels[key]} style={[styles.input,{color:ink,backgroundColor:card}]} value={manual[key]} editable={!busy&&!selected} keyboardType={numeric?'decimal-pad':'default'} maxLength={numeric?12:160} onChangeText={value=>setManual(previous=>({...previous,[key]:value}))}/></View>;
        })}
        {manualSessionExpired&&button(tr('Start a new manual review','Iniciar una nueva revisión manual'),()=>{if(inFlight.current||selected)return;manualRequestId.current='';if(attempt.current){attempt.current.manualRequestId=undefined;attempt.current.review=undefined;}setReview({});setManualSessionExpired(false);setError('');},!!selected,true)}
        {button(tr('Review values before saving','Revisar valores antes de guardar'),()=>void reviewManual(),!!selected||manualSessionExpired)}
      </>}
      {unknown&&!busy&&stage==='search'&&button(tr('Look up updated product','Consultar producto actualizado'),()=>router.replace({pathname:'/barcode-lookup',params:{...recoveryRouteContext(params),barcode:param('barcode')}}))}
      {(!busy||saving)&&stage==='results'&&<>
        <Text style={[styles.title,{color:ink}]}>{review.photo?.provenance.kind==='user_entered'?tr('Confirm your reviewed values','Confirma los valores revisados'):review.photo?tr('Compare with your package','Compara con tu empaque'):usableCandidates.length?tr('Product data found','Datos del producto encontrados'):tr('Package photos needed','Necesitamos fotos del empaque')}</Text>
        {!!review.search_code&&<Text style={styles.warning}>{tr('Web search could not finish. You can continue with clear package photos.','La búsqueda web no pudo terminar. Puedes continuar con fotos claras del empaque.')}</Text>}
        {(usableCandidates.length>0||review.photo?.can_confirm)&&<Text style={[styles.text,{color:ink}]}>{review.photo?.provenance.kind==='user_entered'?tr('Confirming saves these user-entered values for the scanned barcode in the shared catalog. Check every field against your package. Nothing is added to your diary.','Confirmar guarda estos valores ingresados por ti para el código escaneado en el catálogo compartido. Comprueba cada campo con el empaque. No se añade nada a tu diario.'):tr('This is my product confirms the exact product, variant, serving and displayed nutrition, and saves the correction to the shared barcode catalog. Nothing is added to your diary.','Este es mi producto confirma el producto, variante, porción y datos mostrados, y guarda la corrección en el catálogo compartido. No se añade nada a tu diario.')}</Text>}
        {usableCandidates.map((candidate,index)=>candidateCard(candidate,'web-'+index))}
        {!usableCandidates.length&&!review.photo&&<Text style={[styles.text,{color:ink}]}>{tr('No complete, verified product option was found. We will not fill in missing numbers.','No encontramos una opción completa y verificada. No rellenaremos números ausentes.')}</Text>}
        {review.photo&&candidateCard(review.photo,'physical')}
        {(review.issues||[]).map((issue,index)=><Text key={index} style={styles.warning}>{issue.field==='analysis'
          ?tr('The analysis service could not finish. This does not mean your label is wrong. Please try a new photo attempt later.','El servicio de análisis no pudo terminar. Esto no significa que tu etiqueta esté mal. Intenta otra lectura más tarde.')
          :tr('Please show clearly: ','Muestra claramente: ')+(issue.field==='front'?tr('the product name, brand and exact variant','el nombre, marca y variante exactos'):fieldNames[issue.field]||fieldNames.label)+(issue.reason==='reads_disagree'?tr(' — the two readings disagree.',' — las dos lecturas no coinciden.'):'.')}</Text>)}
        {!unknown&&button(review.photo?tr('Retake package photos','Volver a tomar fotos'):usableCandidates.length?tr('None of these — take package photos','Ninguno de estos — tomar fotos del empaque'):tr('Take package photos','Tomar fotos del empaque'),()=>void beginPhotos(),!review.session||!!selected,true)}
        {unknown&&review.photo?.provenance.kind!=='user_entered'&&button(attempt.current?.rearAttempted?tr('These values are not usable — enter manually','Estos valores no sirven — ingresar manualmente'):tr('None of these — photograph rear label','Ninguno de estos — fotografiar etiqueta de atrás'),()=>{if(attempt.current?.rearAttempted)manualEntry(review.photo||undefined);else setStage('label_prompt');},!!selected,true)}
      </>}
    </ScrollView>}
  </SafeAreaView>;
}
const styles=StyleSheet.create({
  screen:{flex:1},header:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,gap:14,minHeight:60},
  back:{fontSize:40,minWidth:36},heading:{fontSize:18,fontWeight:'700',flex:1},content:{padding:20,gap:14,paddingBottom:40},
  title:{fontSize:21,fontWeight:'700',lineHeight:28},text:{fontSize:16,lineHeight:24},caption:{fontSize:13,lineHeight:20},
  input:{padding:16,borderRadius:12,borderWidth:1,borderColor:'#B7C7BE',fontSize:16},button:{padding:16,borderRadius:14,minHeight:52,justifyContent:'center',marginTop:8},
  card:{borderRadius:18,padding:18,gap:10},image:{width:'100%',height:150},macros:{flexDirection:'row',flexWrap:'wrap',gap:16},macro:{minWidth:75,gap:4},
  link:{color:'#2D8C79',fontSize:15,paddingVertical:8},warning:{color:'#B15B23',fontSize:15,lineHeight:23,paddingVertical:6},
  loading:{padding:20,gap:12,alignItems:'center'},check:{flexDirection:'row',gap:12,paddingVertical:10,alignItems:'flex-start'},
});



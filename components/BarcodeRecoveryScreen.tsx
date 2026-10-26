import { recoveryRouteContext } from '@/utils/recoveryRouteContext';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import { buildSyntheticOffData } from '@/utils/servingParser';
import { recoveryDiscoveryOnce, recoveryRefine, expireRecovery } from '@/utils/recoveryDiscoveryOnce';
import { useColorScheme } from '@/hooks/useColorScheme';

type Candidate = {
  name:string; brand:string; variant:string; barcode:string|null; serving:string; serving_g:number;
  nutrition:Record<string,number|null>; image_url:string; nutrition_image_url?:string; exact_barcode:boolean;
  can_confirm:boolean; proposal?:string; conflicts?:string[]; label_issue?:string;
  provenance:{kind:string;url:string;retrieved_at:string};
};
type Review = {session?:string;candidates?:Candidate[];photo?:Candidate|null;issues?:{field:string;reason:string}[];search_code?:string;source_links?:string[]};
type Stage = 'search'|'results'|'front'|'label';
export default function FoodPhotoCaptureScreen() {
  const params=useLocalSearchParams(),router=useRouter(),{i18n}=useTranslation();
  const es=i18n.language.startsWith('es'),dark=String(useColorScheme())==='dark';
  const tr=(en:string,spanish:string)=>es?spanish:en;
  const param=(name:string)=>typeof params[name]==='string'?params[name] as string:'';
  const name=param('name'),brand=param('brand');
  const [stage,setStage]=useState<Stage>('search'),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const [review,setReview]=useState<Review>({}),[selected,setSelected]=useState<Candidate|null>(null);
  const [permission,requestPermission]=useCameraPermissions();
  const recoveryKey=useRef('');
  const camera=useRef<CameraView>(null),inFlight=useRef(false),front=useRef<string|null>(null);
  const [saving,setSaving]=useState(false);
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
    };
    return messages[code]||tr('We could not complete this step. Your product data has not been confirmed. Please try again.','No pudimos completar este paso. Los datos no se han confirmado. Inténtalo de nuevo.');
  }
  async function request(body:Record<string,unknown>) {
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw Error('auth');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),150000);
    let response:Response;
    try { response=await fetch(SUPABASE_PROJECT_URL+'/functions/v1/vision-nutrition-extract',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
      body:JSON.stringify(body),signal:controller.signal,
    }); } catch(error) { if(body.action==='recovery_confirm')throw Error('save_unknown');throw error; } finally { clearTimeout(timer); }
    let data:any;
    try{data=await response.json();}catch(error){if(body.action==='recovery_confirm')throw Error('save_unknown');throw error;}
    if(!response.ok||data.status==='error'||data.status==='unavailable')throw Error(data.code||'unavailable');
    return data;
  }
  async function operation(work:()=>Promise<void>) {
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try{await work();}catch(e){const code=e instanceof Error?e.message:'';setError(message(code));if(['expired_proposal','request_already_used_or_limit','save_conflict'].includes(code)){expireRecovery(recoveryKey.current);setStage('search');}}
    finally{inFlight.current=false;setBusy(false);}
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
  useEffect(()=>{let active=true;void discover(false,()=>active);return()=>{active=false;inFlight.current=false;};},[]);
  async function beginPhotos() {
    if(!review.session)return;
    if(!permission?.granted) {
      const result=await requestPermission();
      if(!result.granted){setError(tr('Camera access is needed to photograph your package.','Se necesita acceso a la cámara para fotografiar el empaque.'));return;}
    }
    front.current=null;setError('');setStage('front');
  }
  async function upload(uri:string,kind:string) {
    const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('auth');
    const base64=await FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64});
    const binary=atob(base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const path='submissions/'+session.user.id+'/'+Date.now()+'_'+kind+'.jpg';
    const {error:uploadError}=await supabase.storage.from('food-photos').upload(path,bytes,{contentType:'image/jpeg',upsert:false});
    if(uploadError)throw Error('upload_failed');
    return supabase.storage.from('food-photos').getPublicUrl(path).data.publicUrl;
  }
  async function capture() {
    await operation(async()=>{
      const photo=await camera.current?.takePictureAsync({quality:0.8});
      if(!photo?.uri)throw Error('capture_failed');
      const url=await upload(photo.uri,stage);
      if(stage==='front'){front.current=url;setStage('label');return;}
      const data=await recoveryRefine(recoveryKey.current,()=>request({action:'recovery_photos',session:review.session,photo_front_url:front.current,photo_label_url:url})).catch(error=>{setStage('search');throw error;});
      setReview(data);setStage('results');
    });
  }
  async function select(candidate:Candidate) {
    if(inFlight.current||!candidate.can_confirm||!candidate.proposal)return;
    // An uncertain save can only retry its original signed proposal/receipt.
    if(selected&&selected.proposal!==candidate.proposal)return;
    setSelected(candidate);setSaving(true);
    try { await operation(async()=>{
      const data=await request({action:'recovery_confirm',proposal:candidate.proposal,confirmations:{identity:true,serving:true,nutrition:true,shared:true}});
      if(data.status!=='approved'||!data.food_item?.id)throw Error('save_unknown');
      finish(data.food_item);
    }); } finally {setSaving(false);}
  }
  function finish(saved:any) {
    const destination={pathname:'/food-details' as const,params:{
      offData:JSON.stringify(buildSyntheticOffData(saved)),food_item_id:saved.id,source:'barcode',
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
      {candidate.provenance.kind!=='physical_label'&&<Text style={[styles.caption,{color:ink}]}>{candidate.provenance.kind==='source_label'?tr('Published label image · two readings','Imagen de etiqueta publicada · dos lecturas'):tr('Published product nutrition · check against your package','Datos nutricionales publicados · comprueba tu empaque')}</Text>}
      <Text style={[styles.caption,{color:ink}]}>{candidate.provenance.kind==='physical_label'
        ?tr('Your package · two label readings · confirm scanned identity','Tu empaque · dos lecturas de etiqueta · confirma la identidad escaneada')
        :candidate.exact_barcode?tr('Source publishes the same barcode','La fuente publica el mismo código'):tr('Source does not publish the barcode — you confirm the product','La fuente no publica el código — tú confirmas el producto')}</Text>
      <Text style={[styles.text,{color:ink}]}>{tr('Per','Por')} {candidate.serving} · {candidate.serving_g} g</Text>
      <View style={styles.macros}>{['calories','carbs','protein','fat','fiber'].filter(k=>candidate.nutrition[k]!=null).map(k=><View key={k} style={styles.macro}>
        <Text style={{color:ink,fontWeight:'700',fontSize:18}}>{candidate.nutrition[k]}{k==='calories'?' kcal':' g'}</Text>
        <Text style={{color:ink,fontSize:12}}>{fieldNames[k]}</Text>
      </View>)}</View>
      {candidate.provenance.kind!=='physical_label'&&source(candidate.provenance.url,tr('View product source','Ver fuente del producto'))}
      {candidate.nutrition_image_url&&source(candidate.nutrition_image_url,tr('View nutrition label','Ver etiqueta nutricional'))}
      {!!candidate.label_issue&&<Text style={styles.warning}>{tr('The published label could not be reconciled with this record. These values cannot update the catalog; use clear package photos.','No se pudo conciliar la etiqueta publicada con este registro. Estos valores no pueden actualizar el catálogo; usa fotos claras del empaque.')}</Text>}
      {!!candidate.conflicts?.length&&!candidate.label_issue&&<Text style={styles.warning}>{tr('These online values differ from your readable label. Use your package values below.','Estos valores de internet difieren de tu etiqueta legible. Usa los valores de tu empaque abajo.')}</Text>}
      {stage==='results'&&candidate.can_confirm&&button(tr('This is my product','Este es mi producto'),()=>void select(candidate),!!selected&&selected.proposal!==candidate.proposal)}
    </View>;
  }
  const usableCandidates=(review.candidates||[]).filter(candidate=>candidate.can_confirm);
  const cameraStage=stage==='front'||stage==='label';
  return <SafeAreaView style={[styles.screen,{backgroundColor:background}]} edges={['top','bottom']}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={tr('Back','Atrás')} disabled={saving} onPress={()=>{if(cameraStage)setStage('results');else router.back();}}>
        <Text style={[styles.back,{color:ink}]}>{'\u2039'}</Text>
      </TouchableOpacity>
      <Text style={[styles.heading,{color:ink}]}>{tr('Correct product data','Corregir datos del producto')}</Text>
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
      {busy&&<View style={styles.loading}><ActivityIndicator/><Text style={{color:ink}}>{saving?tr('Saving product data','Guardando los datos del producto'):tr('Searching for your product data','Buscando los datos de tu producto')}</Text></View>}
      {!busy&&stage==='search'&&!!error&&button(tr('Retry this scanned product','Reintentar este producto escaneado'),()=>void discover(true))}
      {(!busy||saving)&&stage==='results'&&<>
        <Text style={[styles.title,{color:ink}]}>{review.photo?tr('Compare with your package','Compara con tu empaque'):usableCandidates.length?tr('Product data found','Datos del producto encontrados'):tr('Package photos needed','Necesitamos fotos del empaque')}</Text>
        {!!review.search_code&&<Text style={styles.warning}>{tr('Web search could not finish. You can continue with clear package photos.','La búsqueda web no pudo terminar. Puedes continuar con fotos claras del empaque.')}</Text>}
        {(usableCandidates.length>0||review.photo?.can_confirm)&&<Text style={[styles.text,{color:ink}]}>{tr('This is my product confirms the exact product, variant, serving and displayed nutrition, and saves the correction to the shared barcode catalog. Nothing is added to your diary.','Este es mi producto confirma el producto, variante, porción y datos mostrados, y guarda la corrección en el catálogo compartido. No se añade nada a tu diario.')}</Text>}
        {usableCandidates.map((candidate,index)=>candidateCard(candidate,'web-'+index))}
        {!usableCandidates.length&&!review.photo&&<Text style={[styles.text,{color:ink}]}>{tr('No complete, verified product option was found. We will not fill in missing numbers.','No encontramos una opción completa y verificada. No rellenaremos números ausentes.')}</Text>}
        {review.photo&&candidateCard(review.photo,'physical')}
        {(review.issues||[]).map((issue,index)=><Text key={index} style={styles.warning}>{issue.field==='analysis'
          ?tr('The analysis service could not finish. This does not mean your label is wrong. Please try a new photo attempt later.','El servicio de análisis no pudo terminar. Esto no significa que tu etiqueta esté mal. Intenta otra lectura más tarde.')
          :tr('Please show clearly: ','Muestra claramente: ')+(issue.field==='front'?tr('the product name, brand and exact variant','el nombre, marca y variante exactos'):fieldNames[issue.field]||fieldNames.label)+(issue.reason==='reads_disagree'?tr(' — the two readings disagree.',' — las dos lecturas no coinciden.'):'.')}</Text>)}
        {button(review.photo?tr('Retake package photos','Volver a tomar fotos'):usableCandidates.length?tr('None of these — take package photos','Ninguno de estos — tomar fotos del empaque'):tr('Take package photos','Tomar fotos del empaque'),()=>void beginPhotos(),!review.session||!!selected,true)}
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


import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import { buildSyntheticOffData } from '@/utils/servingParser';
import { useColorScheme } from '@/hooks/useColorScheme';

type Candidate = {
  name:string; brand:string; variant:string; barcode:string|null; serving:string; serving_g:number;
  nutrition:Record<string,number>; image_url:string; nutrition_image_url?:string; exact_barcode:boolean;
  can_confirm:boolean; proposal?:string; conflicts?:string[]; label_issue?:string;
  provenance:{kind:string;url:string;retrieved_at:string};
};
type Review = {session?:string;candidates?:Candidate[];photo?:Candidate|null;issues?:{field:string;reason:string}[];search_code?:string;source_links?:string[]};
type Stage = 'search'|'results'|'front'|'label'|'confirm'|'done';
export default function FoodPhotoCaptureScreen() {
  const params=useLocalSearchParams(),router=useRouter(),{i18n}=useTranslation();
  const es=i18n.language.startsWith('es'),dark=String(useColorScheme())==='dark';
  const tr=(en:string,spanish:string)=>es?spanish:en;
  const param=(name:string)=>typeof params[name]==='string'?params[name] as string:'';
  const [name,setName]=useState(param('name')), [brand,setBrand]=useState(param('brand'));
  const [stage,setStage]=useState<Stage>('search'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [review,setReview]=useState<Review>({}),[selected,setSelected]=useState<Candidate|null>(null);
  const [confirmed,setConfirmed]=useState({identity:false,serving:false,nutrition:false,shared:false});
  const [permission,requestPermission]=useCameraPermissions();
  const camera=useRef<CameraView>(null),inFlight=useRef(false),front=useRef<string|null>(null);
  const [saved,setSaved]=useState<any>(null);
  const ink=dark?'#F5F6FA':'#182326',background=dark?'#101719':'#F7F9F8',card=dark?'#1D292B':'#FFFFFF';
  const fieldNames:Record<string,string>={label:tr('nutrition label','etiqueta nutricional'),serving:tr('serving and preparation','porción y preparación'),serving_g:tr('serving weight in grams','peso de la porción en gramos'),calories:tr('calories','calorías'),protein:tr('protein','proteína'),carbs:tr('total carbohydrates','carbohidratos totales'),fat:tr('total fat','grasa total'),fiber:tr('fiber','fibra'),barcode:tr('barcode','código de barras')};
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
    try{await work();}catch(e){setError(message(e instanceof Error?e.message:''));}
    finally{inFlight.current=false;setBusy(false);}
  }
  async function search() {
    await operation(async()=>{
      const data=await request({action:'recovery_discover',barcode:param('barcode'),food_item_id:param('food_item_id')||null,name,brand});
      setReview(data);setSelected(null);setStage('results');
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
      const data=await request({action:'recovery_photos',session:review.session,photo_front_url:front.current,photo_label_url:url});
      setReview(data);setStage('results');
    });
  }
  function select(candidate:Candidate) {
    if(!candidate.can_confirm)return;
    setSelected(candidate);setConfirmed({identity:false,serving:false,nutrition:false,shared:false});setStage('confirm');setError('');
  }
  async function confirm() {
    if(!selected?.proposal||!Object.values(confirmed).every(Boolean))return;
    await operation(async()=>{
      const data=await request({action:'recovery_confirm',proposal:selected.proposal,confirmations:confirmed});
      setSaved(data.food_item);setStage('done');
    });
  }
  function finish() {
    if(param('type')==='correction'){router.back();return;}
    if(!saved){router.back();return;}
    router.replace({pathname:'/food-details',params:{
      offData:JSON.stringify(buildSyntheticOffData(saved)),food_item_id:saved.id,source:'barcode',
      meal:param('meal'),date:param('date'),mode:param('mode'),context:param('context'),returnTo:param('returnTo'),mealId:param('mealId'),
    }});
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
        :candidate.exact_barcode?tr('Source publishes the same barcode','La fuente publica el mismo código'):tr('Similar product · barcode not verified','Producto similar · código no verificado')}</Text>
      <Text style={[styles.text,{color:ink}]}>{tr('Per','Por')} {candidate.serving} · {candidate.serving_g} g</Text>
      <View style={styles.macros}>{['calories','carbs','protein','fat','fiber'].map(k=><View key={k} style={styles.macro}>
        <Text style={{color:ink,fontWeight:'700',fontSize:18}}>{candidate.nutrition[k]}{k==='calories'?' kcal':' g'}</Text>
        <Text style={{color:ink,fontSize:12}}>{fieldNames[k]}</Text>
      </View>)}</View>
      {candidate.provenance.kind!=='physical_label'&&source(candidate.provenance.url,tr('View product source','Ver fuente del producto'))}
      {candidate.nutrition_image_url&&source(candidate.nutrition_image_url,tr('View nutrition label','Ver etiqueta nutricional'))}
      {!!candidate.label_issue&&<Text style={styles.warning}>{tr('The published label could not be reconciled with this record. These values cannot update the catalog; use clear package photos.','No se pudo conciliar la etiqueta publicada con este registro. Estos valores no pueden actualizar el catálogo; usa fotos claras del empaque.')}</Text>}
      {!!candidate.conflicts?.length&&!candidate.label_issue&&<Text style={styles.warning}>{tr('These online values differ from your readable label. Use your package values below.','Estos valores de internet difieren de tu etiqueta legible. Usa los valores de tu empaque abajo.')}</Text>}
      {stage==='results'&&button(candidate.can_confirm?tr('Review this product','Revisar este producto'):tr('Photos needed to verify this variant','Se necesitan fotos para verificar esta variante'),()=>select(candidate),!candidate.can_confirm)}
    </View>;
  }
  const cameraStage=stage==='front'||stage==='label';
  return <SafeAreaView style={[styles.screen,{backgroundColor:background}]} edges={['top','bottom']}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={tr('Back','Atrás')} disabled={busy} onPress={()=>{if(stage==='confirm'||cameraStage)setStage('results');else router.back();}}>
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
      {busy&&<View style={styles.loading}><ActivityIndicator/><Text style={{color:ink}}>{tr('Checking sources and product data…','Comprobando fuentes y datos del producto…')}</Text></View>}
      {stage==='search'&&<>
        <Text style={[styles.title,{color:ink}]}>{tr('Find your exact product','Encuentra tu producto exacto')}</Text>
        <Text style={[styles.text,{color:ink}]}>{tr('We will search public product and nutrition-label sources. Nothing is saved until you review and confirm.','Buscaremos fuentes públicas del producto y su etiqueta nutricional. Nada se guarda hasta que lo revises y confirmes.')}</Text>
        <Text style={[styles.caption,{color:ink}]}>{tr('Barcode','Código')}: {param('barcode')}</Text>
        <TextInput accessibilityLabel={tr('Product name','Nombre del producto')} placeholder={tr('Product name or variant','Nombre o variante')} placeholderTextColor="#788682" value={name} onChangeText={setName} maxLength={160} style={[styles.input,{color:ink,backgroundColor:card}]}/>
        <TextInput accessibilityLabel={tr('Brand','Marca')} placeholder={tr('Brand','Marca')} placeholderTextColor="#788682" value={brand} onChangeText={setBrand} maxLength={100} style={[styles.input,{color:ink,backgroundColor:card}]}/>
        {button(tr('Search product sources','Buscar fuentes del producto'),()=>void search())}
      </>}
      {stage==='results'&&<>
        <Text style={[styles.title,{color:ink}]}>{review.photo?tr('Compare with your package','Compara con tu empaque'):tr('Which product is yours?','¿Cuál es tu producto?')}</Text>
        {!!review.search_code&&<Text style={styles.warning}>{tr('Web search could not finish. You can continue with clear package photos.','La búsqueda web no pudo terminar. Puedes continuar con fotos claras del empaque.')}</Text>}
        {(review.candidates||[]).map((candidate,index)=>candidateCard(candidate,'web-'+index))}
        {!review.candidates?.length&&<Text style={[styles.text,{color:ink}]}>{tr('No complete, verified product option was found. We will not fill in missing numbers.','No encontramos una opción completa y verificada. No rellenaremos números ausentes.')}</Text>}
        {review.photo&&candidateCard(review.photo,'physical')}
        {(review.issues||[]).map((issue,index)=><Text key={index} style={styles.warning}>{issue.field==='analysis'
          ?tr('The analysis service could not finish. This does not mean your label is wrong. Please try a new photo attempt later.','El servicio de análisis no pudo terminar. Esto no significa que tu etiqueta esté mal. Intenta otra lectura más tarde.')
          :tr('Please show clearly: ','Muestra claramente: ')+(issue.field==='front'?tr('the product name, brand and exact variant','el nombre, marca y variante exactos'):fieldNames[issue.field]||fieldNames.label)+(issue.reason==='reads_disagree'?tr(' — the two readings disagree.',' — las dos lecturas no coinciden.'):'.')}</Text>)}
        {button(review.photo?tr('Retake package photos','Volver a tomar fotos'):tr('None of these — take package photos','Ninguno de estos — tomar fotos del empaque'),()=>void beginPhotos(),!review.session,true)}
        {button(tr('Change search','Cambiar búsqueda'),()=>{setStage('search');setError('');},false,true)}
      </>}
      {stage==='confirm'&&selected&&<>
        <Text style={[styles.title,{color:ink}]}>{tr('Confirm before updating the catalog','Confirma antes de actualizar el catálogo')}</Text>
        {candidateCard(selected,'confirmation')}
        {(['identity','serving','nutrition','shared'] as const).map(key=>{
          const labels={identity:tr('This exact product, variant and package belongs to the scanned barcode.','Este producto, variante y empaque exactos corresponden al código escaneado.'),
            serving:tr('The serving size and preparation match my package.','La porción y preparación coinciden con mi empaque.'),
            nutrition:tr('I checked these values against the readable label.','Comprobé estos valores con la etiqueta legible.'),
            shared:tr('Update the shared product catalog for future scans. This does not add food to my diary.','Actualizar el catálogo compartido para futuros escaneos. Esto no añade comida a mi diario.')};
          return <TouchableOpacity key={key} accessibilityRole="checkbox" disabled={busy} accessibilityState={{checked:confirmed[key],disabled:busy}} onPress={()=>setConfirmed(c=>({...c,[key]:!c[key]}))} style={styles.check}>
            <Text style={{color:ink,fontSize:22}}>{confirmed[key]?'\u2611':'\u2610'}</Text><Text style={[styles.text,{color:ink,flex:1}]}>{labels[key]}</Text>
          </TouchableOpacity>;
        })}
        {button(tr('Confirm and update product','Confirmar y actualizar producto'),()=>void confirm(),!Object.values(confirmed).every(Boolean))}
        {button(tr('Back to options','Volver a las opciones'),()=>setStage('results'),false,true)}
      </>}
      {stage==='done'&&<>
        <Text style={[styles.title,{color:ink}]}>{tr('Product data updated','Datos del producto actualizados')}</Text>
        <Text style={[styles.text,{color:ink}]}>{tr('The confirmed data is ready for future barcode scans. Nothing was added to your diary.','Los datos confirmados están listos para futuros escaneos. No se añadió nada a tu diario.')}</Text>
        {button(tr('Return to product','Volver al producto'),finish)}
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


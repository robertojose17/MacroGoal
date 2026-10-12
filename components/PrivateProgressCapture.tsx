import React,{forwardRef,useRef,useImperativeHandle} from 'react';
import {Image,ScrollView,View,AppState} from 'react-native';
import {usePrivatePhoto,privatePhotoGeneration} from '@/hooks/usePrivatePhoto';
import {capturePrivatePhoto} from '@/utils/privateCaptureGuard';
let ViewShot:any=null;try{ViewShot=require('react-native-view-shot').default;}catch{}
export interface PrivateProgressCaptureHandle{capture():Promise<string>;}
export const PrivateProgressCapture=forwardRef<PrivateProgressCaptureHandle,{photoId:string}>(({photoId},ref)=>{
 const uri=usePrivatePhoto(`macrogoal-private-photo:original/${photoId}`);
 const generation=privatePhotoGeneration();const inner=useRef<any>(null);
 const current=useRef({uri,generation,photoId});current.current={uri,generation,photoId};
 const loaded=useRef<{uri:string;generation:number;photoId:string}|null>(null);
 // Unavailable/reference changes invalidate synchronously, before any capture.
 if(!uri||loaded.current?.uri!==uri||loaded.current.generation!==generation||loaded.current.photoId!==photoId)loaded.current=null;
 useImperativeHandle(ref,()=>({capture:async()=>{
  const selected=current.current;const ready=()=>!!selected.uri&&AppState.currentState==='active'&&current.current.uri===selected.uri&&current.current.photoId===selected.photoId&&current.current.generation===selected.generation&&loaded.current?.uri===selected.uri&&loaded.current?.generation===selected.generation&&!!inner.current?.capture;
  if(!ready())throw Error('Photo not ready');
  const result=await capturePrivatePhoto({renderGeneration:selected.generation,generation:privatePhotoGeneration,capture:()=>inner.current.capture(),release:()=>{}});
  if(!ready())throw Error('Photo changed during capture');
  return result;
 }}),[]);
 if(!uri)return <View style={{flex:1}}/>;
 const image=<Image source={{uri}} style={{width:'100%',aspectRatio:3/4}} resizeMode="cover" onLoad={()=>{if(current.current.uri===uri&&current.current.generation===generation&&current.current.photoId===photoId)loaded.current={uri,generation,photoId};}} onError={()=>{loaded.current=null;}}/>;
 if(!ViewShot)return <View style={{flex:1}}>{image}</View>;
 return <ViewShot ref={inner} style={{flex:1}} options={{format:'jpg',quality:0.9,result:'data-uri'}}><ScrollView style={{flex:1}} contentContainerStyle={{flexGrow:1}} maximumZoomScale={4} minimumZoomScale={1} bouncesZoom showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} centerContent>{image}</ScrollView></ViewShot>;
});

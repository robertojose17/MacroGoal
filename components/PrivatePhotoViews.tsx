import {capturePrivatePhoto} from '@/utils/privateCaptureGuard';
import React,{forwardRef,useImperativeHandle,useRef} from 'react';
import {View} from 'react-native';
import {usePrivatePhoto,privatePhotoGeneration} from '@/hooks/usePrivatePhoto';
import {ZoomablePhoto,type ZoomablePhotoProps} from '@/components/ZoomablePhoto';
import {ZoomablePanPhoto,type ZoomablePanPhotoProps} from '@/components/ZoomablePanPhoto';
import ShareableProgressCard,{type ShareableProgressCardProps,type ShareableProgressCardHandle} from '@/components/ShareableProgressCard';
export function PrivateZoomablePhoto(props:ZoomablePhotoProps){const uri=usePrivatePhoto(props.uri);return uri?<ZoomablePhoto {...props} uri={uri}/>:<View style={props.style}/>;}
export function PrivateZoomablePanPhoto(props:ZoomablePanPhotoProps){const uri=usePrivatePhoto(props.uri);return uri?<ZoomablePanPhoto {...props} uri={uri}/>:<View style={[{width:props.width,height:props.height},props.style]}/>;}
export const PrivateShareableProgressCard=forwardRef<ShareableProgressCardHandle,ShareableProgressCardProps>((props,ref)=>{
 const before=usePrivatePhoto(props.beforePhoto);const after=usePrivatePhoto(props.afterPhoto);
 const inner=useRef<ShareableProgressCardHandle>(null);
 const renderGeneration=privatePhotoGeneration();
 const ready=(!props.beforePhoto||!!before)&&(!props.afterPhoto||!!after);
 useImperativeHandle(ref,()=>({captureWhenReady:async()=>{if(!ready||!inner.current)throw Error('Private photos are not ready');return capturePrivatePhoto({renderGeneration,generation:privatePhotoGeneration,capture:()=>inner.current!.captureWhenReady(),release:uri=>{require('react-native-view-shot').releaseCapture(uri);}});}}),[ready,before,after,renderGeneration]);
 if(!ready)return <View/>;
 // Remount image-load state for every actual media change; never reuse a previous photo's ready bit.
 return <ShareableProgressCard key={`${props.beforePhoto??''}:${props.afterPhoto??''}:${before===null}:${after===null}`} {...props} beforePhoto={before} afterPhoto={after} ref={inner}/>;
});

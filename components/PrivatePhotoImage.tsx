import React from 'react';
import {Image,type ImageProps,View} from 'react-native';
import {usePrivatePhoto} from '@/hooks/usePrivatePhoto';
export function PrivatePhotoImage({reference,...props}:Omit<ImageProps,'source'|'src'|'srcSet'>&{reference:string|null|undefined}){
 const uri=usePrivatePhoto(reference);
 return uri?<Image {...props} source={{uri}}/>:<View style={props.style}/>;
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webCameraJpegBytes,MAX_CAMERA_JPEG_BYTES} from '../utils/cameraCaptureBytes.ts';
const bytes=Buffer.from([255,216,255,...Array(1100).fill(0),255,217]);
const raw=bytes.toString('base64');
test('Expo raw base64 and JPEG data URI both decode only captured bytes',()=>{
 for(const photo of [{uri:'data:image/jpeg;base64,'+raw},{uri:'ignored',base64:raw},{uri:'ignored',base64:'data:image/jpeg;base64,'+raw}])assert.deepEqual(Buffer.from(webCameraJpegBytes(photo)),bytes);
});
test('arbitrary URLs, PNG MIME, invalid base64 and non-JPEG signature rejected',()=>{
 for(const uri of ['https://fixture.invalid/file','blob:fixture','data:image/png;base64,'+raw,'data:image/jpeg;base64,***=',Buffer.from([137,80,78,71]).toString('base64'),'','/9j/===='])assert.throws(()=>webCameraJpegBytes({uri}),/invalid_photo/);
});
test('oversized and malformed input rejected before base64 decoder allocation',()=>{
 const original=globalThis.atob;let calls=0;globalThis.atob=()=>{calls++;throw Error('must not decode');};
 try{for(const uri of ['A'.repeat(Math.ceil(MAX_CAMERA_JPEG_BYTES/3)*4+4),'data:image/jpeg;base64,'+'A'.repeat(Math.ceil(MAX_CAMERA_JPEG_BYTES/3)*4+4),'***='])assert.throws(()=>webCameraJpegBytes({uri}),/invalid_photo/);assert.equal(calls,0);}finally{globalThis.atob=original;}
});

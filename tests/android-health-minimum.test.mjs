import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../utils/healthKit.ts',import.meta.url),'utf8');
function wrapper(){
 const calls=[];const sdk={SdkAvailabilityStatus:{SDK_AVAILABLE:3},getSdkStatus:async()=>3,initialize:async()=>true,getGrantedPermissions:async()=>[],requestPermission:async permissions=>{calls.push(permissions);return permissions;}};
 const exports={};const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{exports,console:{log(){},warn(){}},require(name){if(name==='react-native')return {Platform:{OS:'android'},Alert:{alert(){}},Linking:{}};if(name==='./healthConnectSteps.mjs')return {readAndroidSteps:async()=>({available:true,permission:'granted',steps:1234})};if(name==='react-native-health-connect'){calls.push('sdk');return sdk;}throw Error('Unexpected dependency '+name);}});
 return {api:exports,calls};
}
test('retired Android metrics stay unavailable even before any permission lookup',async()=>{
 const {api,calls}=wrapper();
 for(const name of ['getActiveCaloriesForDate','getDistanceMilesForDate','getFlightsClimbedForDate']){
 const result=await api[name](new Date());assert.equal(result.available,false);assert.equal(result.value,null);assert.equal(result.permission,'denied');
 }assert.deepEqual(calls,[]);
});
test('all-health entry point requests only Steps through working Android permission path',async()=>{
 const {api,calls}=wrapper();assert.equal(await api.requestAllHealthPermissions(),'granted');
 const requests=calls.filter(Array.isArray);assert.equal(requests.length,1);assert.equal(requests[0].length,1);assert.equal(requests[0][0].recordType,'Steps');assert.equal(requests[0][0].accessType,'read');
 assert.equal((await api.getTodaySteps()).steps,1234);
});
test('Android config keeps Health Connect integration and Steps/activity while excluding unused scopes',()=>{
 const config=JSON.parse(fs.readFileSync(new URL('../app.json',import.meta.url),'utf8')).expo;
 assert.ok(config.plugins.includes('expo-health-connect'));assert.ok(config.android.permissions.includes('android.permission.ACTIVITY_RECOGNITION'));
 assert.deepEqual(config.android.permissions.filter(p=>p.startsWith('android.permission.health.')),['android.permission.health.READ_STEPS']);
});

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.env.SIMULATION_SOURCE_ROOT||'../..');
const roots=[root,root+'/publish',root+'/base',process.env.SIMULATION_BASE_ROOT].filter(Boolean);
const source=p=>{for(const d of roots)for(const x of ['', '.ts','.tsx']){const f=path.join(d,p+x);if(fs.existsSync(f))return f;}throw Error('Missing actual source '+p)};
const cwd=process.cwd();
fs.writeFileSync('harness.jsx',`import React from 'react';import{createRoot}from'react-dom/client';import Route from '${source('app/tdee-simulation.tsx')}';import{TdeeSessionSimulation}from'${source('components/TdeeSessionSimulation.tsx')}';import{fixture,session,exit,query}from'./synthetic';function App(){const[identity,setIdentity]=React.useState(session);window.componentIdentity=value=>setIdentity(value);return query.has('component')?<TdeeSessionSimulation envelope={fixture} ownerId={identity?.user.id||''} sessionId={identity?.sessionId||''} language={query.get('lang')||'en'} isDark={query.has('dark')} onExit={exit}/>:<Route/>}createRoot(document.getElementById('root')).render(<App/>);`);
fs.writeFileSync('synthetic.js',`import contract from './contract.json';
export const query=new URLSearchParams(location.search);
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const token='fixture.'+btoa(JSON.stringify({session_id:sid}))+'.not-a-credential';
export let session={user:{id:owner},access_token:token,sessionId:sid};
export const fixture={...contract,expiresAt:Date.now()+(query.has('expiry')?1500:600000)};
if(query.has('invalid'))fixture.version='invalid';
let listener=()=>{},release;window.requests=[];window.exits=0;
export function exit(){window.exits++;}
export const supabase={auth:{onAuthStateChange:cb=>{listener=cb;return{data:{subscription:{unsubscribe(){listener=()=>{}}}}}},getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session?.user},error:null})}};
window.changeAuth=kind=>{session=kind==='logout'?null:{...session,user:{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}};listener(kind,session);};
window.releaseResponse=()=>release?.();
window.fetch=async(url,init)=>{window.requests.push({url,method:init?.method||'GET'});if(url!=='https://synthetic.invalid/functions/v1/progress-intelligence/session-simulation'||init?.method!=='GET')throw Error('Forbidden transport');if(query.has('late'))await new Promise(r=>{release=r});return{ok:true,json:async()=>structuredClone(fixture)}};
`);
const stubs={
'react-native':`export * from 'react-native-web';`,
'expo-router':`import{exit}from'${cwd}/synthetic';export const useRouter=()=>({replace:exit});`,
'react-i18next':`export const useTranslation=()=>({i18n:{language:new URLSearchParams(location.search).get('lang')||'en'},t:(k,options={})=>{if(k!=='localization.shared.remainingAmount')throw Error('Unmocked translation '+k);const amount=options.amount??'',unit=options.unit??'';return new URLSearchParams(location.search).get('lang')==='es'?'Quedan '+amount+unit:amount+unit+' remaining'}});`,
'@/lib/supabase/client':`export{supabase}from'${cwd}/synthetic';export const SUPABASE_PROJECT_URL='https://synthetic.invalid',supabasePublicKey='synthetic-public-placeholder';`,
'@/lib/localization':`export const getAppLocale=()=>new URLSearchParams(location.search).get('lang')||'en';`,
'@/hooks/useColorScheme':`export const useColorScheme=()=>new URLSearchParams(location.search).has('dark')?'dark':'light';`,
'react-native-svg':`import React from'react';const e=t=>({children,...p})=>React.createElement(t,p,children);export default e('svg');export const Svg=e('svg'),Circle=e('circle'),Path=e('path'),Defs=e('defs'),LinearGradient=e('linearGradient'),Stop=e('stop');`,
'expo-linear-gradient':`import React from'react';import{View}from'react-native';export const LinearGradient=({colors,...p})=><View {...p} style={[p.style,{backgroundImage:'linear-gradient(90deg,'+colors.join(',')+')'}]}/>;`
};
await esbuild.build({entryPoints:['harness.jsx'],bundle:true,outfile:'app.js',loader:{'.js':'jsx'},plugins:[{name:'synthetic-boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'mock'};if(a.path.startsWith('@/'))return{path:source(a.path.slice(2))};if(['./MacroBar','./ProgressCircle'].includes(a.path))return{path:source('components/'+a.path.slice(2))};});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:stubs[a.path],loader:'jsx',resolveDir:cwd}));}}],nodePaths:[path.resolve('node_modules')]});
fs.writeFileSync('index.html','<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body,#root{height:100%;margin:0}*{box-sizing:border-box}</style><div id="root"></div><script src="app.js"></script>');

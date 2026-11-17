import {build as bundle} from 'esbuild';import {resolve,relative} from 'node:path';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
export async function buildLifecycle(root,here,out){
 const adapter=resolve(here,'lifecycle-adapters.tsx');
 const mocked=new Set(['react-native','expo-router','react-i18next','@/lib/supabase/client','@/styles/commonStyles','@/utils/rules14ProposalController','@/utils/rules14ProposalServices']);
 const result=await bundle({entryPoints:[resolve(here,'lifecycle-entry.tsx')],outfile:resolve(out,'lifecycle.js'),bundle:true,nodePaths:[resolve(here,'node_modules')],format:'esm',platform:'browser',target:'es2022',jsx:'transform',metafile:true,define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'explicit-lifecycle-test-boundaries',setup(b){b.onResolve({filter:/.*/},args=>{if(mocked.has(args.path))return{path:adapter};if(args.path.startsWith('@/'))return{path:resolve(root,args.path.slice(2)+'.ts')};});}}]});
 await writeFile(resolve(out,'lifecycle.html'),'<!doctype html><meta charset="utf-8"><title>Loading</title><script type="module" src="/lifecycle.js"></script>');
 const sources=[];for(const name of Object.keys(result.metafile.inputs)){const file=resolve(here,name),text=await readFile(file);sources.push({path:relative(root,file),sha256:createHash('sha256').update(text).digest('hex')});}
 for(const name of ['lifecycle-build.mjs','lifecycle-run.mjs','package.json','package-lock.json']){const file=resolve(here,name),text=await readFile(file);sources.push({path:relative(root,file),sha256:createHash('sha256').update(text).digest('hex')});}
 return sources;
}

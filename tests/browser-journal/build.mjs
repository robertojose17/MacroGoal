import ts from 'typescript';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..'),out=resolve(here,'.generated'),seen=new Set(),manifest=[];
export async function build(){
 await mkdir(out,{recursive:true});
 async function module(name){
  if(seen.has(name))return;seen.add(name);
  if(!/^[A-Za-z0-9]+$/.test(name))throw Error('invalid_module_name');
  const file=resolve(root,'utils',name+'.ts'),source=await readFile(file,'utf8');
  const emitted=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
  if(emitted.diagnostics?.some(x=>x.category===ts.DiagnosticCategory.Error))throw Error('transpile_failed:'+name);
  let code=emitted.outputText;
  const imports=[...code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]);
  for(const spec of imports){if(spec==='expo-crypto'){code=code.replaceAll("'expo-crypto'","'./expo-crypto-test-adapter.js'").replaceAll('"expo-crypto"','"./expo-crypto-test-adapter.js"');continue;}if(!/^\.\/[A-Za-z0-9]+(?:\.ts)?$/.test(spec))throw Error('nonlocal_dependency_not_allowed:'+spec);const dep=spec.slice(2).replace(/\.ts$/,'');await module(dep);code=code.replaceAll(`'${spec}'`,`'./${dep}.js'`).replaceAll(`"${spec}"`,`"./${dep}.js"`);}
  await writeFile(resolve(out,name+'.js'),code);manifest.push({path:relative(root,file),sha256:createHash('sha256').update(source).digest('hex')});
 }
 await module('browserDurableRequestJournals');await module('acceptedGoalJournalCapability');await module('saveNutritionGoal');await module('restartNutritionJourney');
 const adapter='// Explicit test boundary: expo-crypto randomUUID delegates to browser WebCrypto; no other Expo exports mocked.\nexport const randomUUID=()=>globalThis.crypto.randomUUID();\n';
 await writeFile(resolve(out,'expo-crypto-test-adapter.js'),adapter);manifest.push({path:'TEST-ADAPTER:expo-crypto.randomUUID -> WebCrypto.randomUUID',sha256:createHash('sha256').update(adapter).digest('hex')});
 for(const name of ['tests.js','controller-tests.js','index.html','realm.html'])await writeFile(resolve(out,name),await readFile(resolve(here,name)));
 await writeFile(resolve(out,'blank.html'),'<!doctype html><title>Synthetic journal QA</title>');
 await writeFile(resolve(out,'source-manifest.json'),JSON.stringify(manifest,null,2));
 return {out,manifest};
}

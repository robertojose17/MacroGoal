// Execute the actual capture dependency closure. These legacy registry fixtures
// intentionally have no EdgeRuntime scheduler; dedicated capture suites test it.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require(process.env.TYPESCRIPT_MODULE||'typescript');
export function captureDependencies(root){
 const cache=new Map();
 const context=vm.createContext({Request,Response,Headers,AbortController,AbortSignal,URL,TextEncoder,TextDecoder,Uint8Array,crypto,setTimeout,clearTimeout,console});
 function load(file){
  if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file.endsWith('.mjs')?file+'.ts':file,compilerOptions:{allowJs:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  new vm.Script('(function(require,module,exports){'+source+'\n})',{filename:file}).runInContext(context)(id=>{
   if(!id.startsWith('.'))throw Error('Unexpected capture dependency '+id);
   const target=path.resolve(path.dirname(file),id);
   if(!target.startsWith(path.resolve(root)+path.sep))throw Error('Capture dependency outside functions root');
   return load(target);
  },module,module.exports);
  return module.exports;
 }
 return {endpoint:load(path.join(root,'_shared/selectedNutritionEndpoint.ts')),hooks:load(path.join(root,'_shared/selectedNutritionHooks.ts'))};
}

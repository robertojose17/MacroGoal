/** Test-only isolated copy of the real relative module graph. Only explicitly
 * named release constants are forced OFF; production source is never modified. */
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
export async function loadDisabledReleaseModule(entry,constants){
 const root=fileURLToPath(new URL('../',import.meta.url)),dir=await mkdtemp(path.join(tmpdir(),'macrogoal-off-gates-')),seen=new Set(),changed=new Set();
 async function copy(relative){
  if(seen.has(relative))return;seen.add(relative);assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative));
  let source=await readFile(path.join(root,relative),'utf8');
  for(const constant of constants){
   assert.match(constant,/^[A-Z][A-Z0-9_]+$/);
   const pattern=new RegExp('(export const '+constant+'\\s*=\\s*Object\\.freeze\\(\\{)([\\s\\S]*?)(\\}\\s*as const\\);)','g');
   source=source.replace(pattern,(_,start,body,end)=>{assert.ok(!changed.has(constant));changed.add(constant);assert.match(body,/\benabled\s*:\s*(?:true|false)\b/);return start+body.replace(/\benabled\s*:\s*(?:true|false)\b/,'enabled:false')+end;});
  }
  const file=path.join(dir,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,source);
  for(const match of source.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g))if(match[1].startsWith('.'))await copy(path.normalize(path.join(path.dirname(relative),match[1])));
 }
 try{await copy(entry);assert.deepEqual([...changed].sort(),[...constants].sort());return await import(pathToFileURL(path.join(dir,entry)).href);}finally{await rm(dir,{recursive:true,force:true});}
}

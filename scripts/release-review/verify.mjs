#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const manifest=read('release-candidates/food-catalog/overlay-manifest.json');
const vision=read('release-candidates/food-catalog/vision-source-lineage.json');
const allowedVision=new Map(vision.files.map(f=>[f.path,f.after_sha256]));
const failures=[];
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const f of manifest.files){
 if(f.path.startsWith('/')||f.path.split('/').includes('..')){failures.push(f.path+': unsafe path');continue;}
 const target=path.join(root,f.path);
 if(!fs.existsSync(target)){failures.push(f.path+': missing');continue;}
 if(digest(target)!==f.sha256)failures.push(f.path+': hash mismatch');
 if(f.path.startsWith('supabase/migrations/')||(f.path.startsWith('.github/workflows/')&&f.path!=='.github/workflows/library-barcode-validation.yml'))failures.push(f.path+': forbidden publication scope');
 if((f.path.startsWith('supabase/functions/vision-nutrition-extract/')||f.path.startsWith('supabase/functions/ai-coach/'))&&allowedVision.get(f.path)!==f.sha256)failures.push(f.path+': outside approved vision source reconciliation');
}
if(vision.closure.length!==30)failures.push('Vision closure must contain exactly 30 reviewed files.');
for(const f of vision.closure){const p=path.join(root,f.path);if(!fs.existsSync(p)||digest(p)!==f.candidate_sha256)failures.push(f.path+': vision closure hash mismatch');}
console.log(JSON.stringify({scope:'publication overlay and reviewed vision source integrity only; no deployment or Deno approval',files:manifest.files.length,visionClosureFiles:vision.closure.length,failures},null,2));
process.exitCode=failures.length?1:0;

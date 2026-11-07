#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'release-candidates/food-catalog/overlay-manifest.json'),'utf8'));
const failures=[];
for(const f of manifest.files){
 if(f.path.startsWith('/')||f.path.split('/').includes('..')){failures.push(f.path+': unsafe path');continue;}
 const target=path.join(root,f.path);
 if(!fs.existsSync(target)){failures.push(f.path+': missing');continue;}
 const bytes=fs.readFileSync(target),sha=crypto.createHash('sha256').update(bytes).digest('hex');
 if(sha!==f.sha256)failures.push(f.path+': hash mismatch');
 if(f.path.startsWith('supabase/migrations/')||f.path.startsWith('supabase/functions/vision-nutrition-extract/')||f.path.startsWith('supabase/functions/ai-coach/')||(f.path.startsWith('.github/workflows/')&&f.path!=='.github/workflows/library-barcode-validation.yml'))failures.push(f.path+': forbidden publication scope');
}
console.log(JSON.stringify({scope:'publication overlay integrity only',files:manifest.files.length,failures},null,2));
process.exitCode=failures.length?1:0;

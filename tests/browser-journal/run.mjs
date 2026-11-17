import {runLifecycleCases} from './lifecycle-run.mjs';
import {build,here} from './build.mjs';import {chromium} from 'playwright';import {createServer} from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
const {out,manifest}=await build(),results=[];let browser,server;const blocked=[];
const assert=(x,m)=>{if(!x)throw Error(m)};
try{
 server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;assert(/^\/[A-Za-z0-9.-]+$/.test(path),'bad_path');res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'none'; object-src 'none'");res.end(await readFile(resolve(out,path.slice(1))));}catch{res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch();const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();blocked.push(route.request().url());return route.abort()});
 const page=await context.newPage();await page.goto(origin+'/index.html');await page.waitForFunction(()=>document.title==='DONE',{},{timeout:60000});
 const base=await page.locator('#result').textContent();const report=JSON.parse(base);results.push(...report.results);assert(report.total===11&&report.passed===11,'base_browser_suite_failed');
 await page.goto(origin+'/blank.html');
 const p='reload-'+Date.now(),owner='11111111-1111-4111-8111-111111111111';
 const saved=await page.evaluate(async({p,owner})=>{const {createBrowserGoalRequestJournal}=await import('./browserDurableRequestJournals.js');const e={version:1,project:p,owner,requestId:crypto.randomUUID(),operation:'save',input:{weight:80},payload:{synthetic:true},status:'pending'};await createBrowserGoalRequestJournal(p).prepare(e);return e},{p,owner});
 await page.reload();const restored=await page.evaluate(async({p,owner})=>(await import('./browserDurableRequestJournals.js')).createBrowserGoalRequestJournal(p).load(owner),{p,owner});assert(JSON.stringify(restored)===JSON.stringify(saved),'fresh_reload_exact_id_mismatch');results.push({test:'fresh navigation reload restores exact pending record and CryptoKey',pass:true});
 const other=await context.newPage();await other.goto(origin+'/blank.html');const tab=await other.evaluate(async({p,owner})=>(await import('./browserDurableRequestJournals.js')).createBrowserGoalRequestJournal(p).load(owner),{p,owner});assert(JSON.stringify(tab)===JSON.stringify(saved),'cross_tab_exact_id_mismatch');results.push({test:'independent top-level tab restores same pending ID',pass:true});
 const capability=await page.evaluate(async()=>{const {acceptedGoalJournalAvailable:f}=await import('./acceptedGoalJournalCapability.js');const before=f('web'),locks=navigator.locks;Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});try{return {before,blocked:!f('web'),native:f('ios')}}finally{Object.defineProperty(navigator,'locks',{configurable:true,value:locks})}});assert(capability.before&&capability.blocked&&capability.native,'actual_capability_gate_failed');results.push({test:'actual capability gate observes browser API failure without changing native',pass:true});

 // Each case navigates to a fresh module realm; no in-memory controller leases survive.
 async function controllerCase(name,fn){await page.goto(origin+'/blank.html');await fn();results.push({test:name,pass:true});}
 const project=label=>'controller-'+label+'-'+Date.now();
 await controllerCase('actual save controller persists before mock RPC and verifies goal/profile readback',async()=>{await page.evaluate(async p=>(await import('./controller-tests.js')).successfulSave(p),project('save'))});
 for(const kind of ['retry','onboarding','account'])await controllerCase('cold controller '+kind+' preserves pending exact request without auto-send',async()=>{
  const p=project(kind),seed=await page.evaluate(async({p,kind})=>(await import('./controller-tests.js')).seedUncertain(p,kind==='onboarding'?'initial_onboarding':'manual_goal'),{p,kind});
  await page.reload();await page.evaluate(async({p,seed,kind})=>{const m=await import('./controller-tests.js');return m[kind==='retry'?'coldRetry':kind==='onboarding'?'onboardingScope':'accountSwap'](p,seed)},{p,seed,kind});
 });
 await controllerCase('actual save controller rejects mismatched readback without resolving pending',async()=>{await page.evaluate(async p=>(await import('./controller-tests.js')).invalidReadback(p),project('readback'))});
 await controllerCase('actual restart controller verifies mock receipt and kg profile readback',async()=>{await page.evaluate(async p=>(await import('./controller-tests.js')).successfulRestart(p),project('restart'))});
 await runLifecycleCases(context,origin,results);
 assert(blocked.length===0,'nonlocal_network_attempted');
}catch(error){results.push({test:'runner',pass:false,error:String(error.stack||error)})}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}
const report={suite:'actual-repository-browser-journal',syntheticOnly:true,commit:process.env.GITHUB_SHA??null,passed:results.filter(x=>x.pass).length,total:results.length,results,sourceManifest:manifest,nonlocalRequests:blocked};await writeFile(resolve(here,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(results.some(x=>!x.pass))process.exitCode=1;

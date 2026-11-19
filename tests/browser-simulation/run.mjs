import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {chromium} from 'playwright';
import './build.mjs';
fs.mkdirSync('artifacts',{recursive:true});
const server=http.createServer((req,res)=>{const file=req.url.split('?')[0]==='/app.js'?'app.js':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));});
await new Promise((resolve,reject)=>{server.on('error',reject);server.listen(0,'127.0.0.1',resolve)});
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;const results=[];
try{
 browser=await chromium.launch({headless:true});
 async function scenario(name,query,test){const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});const page=await context.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>{if(r.request().url().startsWith(origin+'/'))return r.continue();external.push(r.request().url());return r.abort()});try{await page.goto(origin+'/?'+query);await test(page);assert.deepEqual(errors,[]);assert.deepEqual(external,[],'no external requests');const requests=await page.evaluate(()=>window.requests);assert.ok(requests.every(r=>r.method==='GET'&&r.url==='https://synthetic.invalid/functions/v1/tdee-session-simulation'),'no mutation transports');results.push({name,status:'passed',requests});}catch(error){results.push({name,status:'failed',message:String(error),pageErrors:errors,external});await page.screenshot({path:`artifacts/${name}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`artifacts/${name}-failure.txt`,await page.locator('body').innerText().catch(()=>''));throw error;}finally{await context.close()}}
 for(const es of [false,true])await scenario(es?'styled-es':'styled-en',es?'lang=es&dark=1':'',async p=>{
  const click=async(en,sp)=>p.getByRole('button',{name:es?sp:en,exact:true}).click();
  await p.getByText(es?'60% de la meta calórica ficticia':'60% of fictional calorie target',{exact:true}).waitFor();
  await p.screenshot({path:`artifacts/${es?'es':'en'}-dashboard.png`,fullPage:true});
  await click('Review simulated recommendation','Revisar recomendación simulada');
  await p.getByText(/2000 → 1800/).waitFor();
  for(const comparison of ['2000 → 1800','150 → 150','215 → 165','60 → 60','30 → 30']){const target=p.getByText(comparison,{exact:false});await target.waitFor();const box=await target.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=844,'comparison visible without scrolling: '+comparison);}
  const accept=p.getByRole('button',{name:es?'Aceptar solo en la simulación':'Accept in simulation only',exact:true});await accept.waitFor();const acceptBox=await accept.boundingBox();assert.ok(acceptBox&&acceptBox.y>=0&&acceptBox.y+acceptBox.height<=844,'accept visible without scrolling');
  await p.screenshot({path:`artifacts/${es?'es':'en'}-recommendation.png`,fullPage:true});
  await click('Reject simulated recommendation','Rechazar recomendación simulada');
  await p.getByText(/^60% /).waitFor();
  await click('Review simulated recommendation','Revisar recomendación simulada');await click('Accept in simulation only','Aceptar solo en la simulación');await p.getByText(/^67% /).waitFor();
  for(let i=0;i<3;i++){await click('Foods','Comidas');const body=await p.locator('body').innerText();assert.match(body.replace(/,/g,''),/1800/);assert.match(body.replace(/,/g,''),/1200/);assert.match(body,/165/);await click('Dashboard','Resumen');await p.getByText(/^67% /).waitFor();}
  await click('Foods','Comidas');await p.getByText(es?'Quedan 600kcal':'600kcal remaining',{exact:true}).waitFor();assert.doesNotMatch(await p.locator('body').innerText(),/localization\.shared\./);await p.screenshot({path:`artifacts/${es?'es':'en'}-accepted-foods.png`,fullPage:true});await click('Reset simulation','Reiniciar simulación');await p.getByText(/^60% /).waitFor();
  await click('Exit simulation','Salir de la simulación');await p.getByText(/This simulation is unavailable|Esta simulación no está disponible/).waitFor();assert.equal(await p.evaluate(()=>window.exits),0);assert.equal(await p.getByText(/^60% /).count(),0);
 });
 for(const kind of ['logout','switch'])await scenario('late-response-'+kind,'late=1',async p=>{await p.waitForFunction(()=>window.requests.length===1);await p.evaluate(k=>window.changeAuth(k),kind);await p.evaluate(()=>window.releaseResponse());await p.getByText(/This simulation is unavailable/).waitFor();assert.equal(await p.getByText(/^60% /).count(),0);});
 await scenario('visible-logout','',async p=>{await p.getByText(/^60% /).waitFor();await p.evaluate(()=>window.changeAuth('logout'));await p.getByText(/This simulation is unavailable/).waitFor();assert.equal(await p.getByText(/^60% /).count(),0)});
 await scenario('visibility-clears','',async p=>{await p.getByText(/^60% /).waitFor();await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});window.dispatchEvent(new Event('visibilitychange'))});await p.getByText(/This simulation is unavailable/).waitFor();assert.equal(await p.getByText(/^60% /).count(),0)});
 await scenario('expiry','expiry=1',async p=>{await p.getByText(/^60% /).waitFor();await p.getByText(/This simulation is unavailable/).waitFor();assert.equal(await p.evaluate(()=>window.exits),0);assert.equal(await p.getByText(/^60% /).count(),0)});
 await scenario('invalid-envelope','invalid=1',async p=>{await p.getByText(/This simulation is unavailable/).waitFor();assert.equal(await p.getByText(/^60% /).count(),0)});
 await scenario('component-session-props','component=1',async p=>{await p.getByText(/^60% /).waitFor();await p.evaluate(()=>window.componentIdentity(null));await p.waitForFunction(()=>window.exits===1);assert.equal(await p.getByText(/^60% /).count(),0)});
 await scenario('escape-exit','',async p=>{await p.getByText(/^60% /).waitFor();await p.keyboard.press('Escape');await p.getByText(/This simulation is unavailable/).waitFor();assert.equal(await p.evaluate(()=>window.exits),0);assert.equal(await p.getByText(/^60% /).count(),0)});
 await scenario('explicit-return-only','',async p=>{await p.getByText(/^60% /).waitFor();await p.getByRole('button',{name:'Exit simulation',exact:true}).click();await p.getByText(/This simulation is unavailable/).waitFor();assert.equal(await p.evaluate(()=>window.exits),0);await p.getByRole('button',{name:'Open the real app',exact:true}).click();await p.waitForFunction(()=>window.exits===1)});
 console.log(JSON.stringify(results,null,2));
}finally{fs.writeFileSync('artifacts/results.json',JSON.stringify(results,null,2));await browser?.close();await new Promise(r=>server.close(r))}

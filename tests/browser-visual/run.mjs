import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {chromium} from 'playwright';
import './build.mjs';
fs.mkdirSync('artifacts',{recursive:true});
const server=http.createServer((req,res)=>{const f=req.url.split('?')[0]==='/app.js'?'app.js':'index.html';res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const results=[];
try{
 for(const c of [{name:'regular-kg-light',width:390,query:'unit=kg'},{name:'regular-lb-dark',width:390,query:'unit=lb&dark=1'},{name:'narrow-es',width:320,query:'unit=kg&lang=es'},{name:'large-text-es-dark',width:390,query:'unit=lb&lang=es&dark=1&scale=1.6'},{name:'missing',width:390,query:'empty=1'}]){
  const context=await browser.newContext({viewport:{width:c.width,height:844},deviceScaleFactor:2});
  await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(origin+'/?'+c.query);await page.waitForSelector('button,[role=button]');await page.waitForTimeout(300);
   assert.deepEqual(errors,[],'no runtime errors');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow');
   const info=page.getByRole('button',{name:/^(About|Información sobre) /});assert.equal(await info.count(),3,'three accessible stat explanations');
   const labels=await info.evaluateAll(els=>els.map(e=>e.getAttribute('aria-label')));
   const body=await page.locator('body').innerText();assert.doesNotMatch(body,/Adriana|195 lb|156 lbs|145 lbs|Jan 26|ON TRACK|0\.8 lbs/,'reference/user values never copied');
   if(c.name==='missing')assert.doesNotMatch(body,/2400|80 kg|75 kg|40%/,'missing values not fabricated');
   assert.doesNotMatch(body,/Start is the weight|No es una medición metabólica|Not a metabolic measurement|Sensitivity|Sensibilidad|The bar shows|La barra muestra/,'methodology hidden until info dialog');
   if(c.name.startsWith('regular-')){
    const lb=c.query.includes('unit=lb'),startLabel=lb?'176.4 lb':'80 kg',goalLabel=lb?'165.3 lb':'75 kg';
    assert.ok(body.includes(startLabel));assert.ok(body.includes(goalLabel));assert.match(body,/40%/);
    const start=await page.getByText(startLabel,{exact:true}).boundingBox();
    const goal=await page.getByText(goalLabel,{exact:true}).boundingBox();
    const graph=await page.getByLabel('Recorded weigh-ins and goal-weight chart',{exact:true}).boundingBox();
    assert.ok(Math.abs(start.y-goal.y)<=2,'start and goal on same line at regular390px');
    assert.ok(goal.x>=start.x+start.width,'goal follows start horizontally');
    assert.ok(graph.x>=goal.x+goal.width,'chart right of complete start→goal line');
   }
   await page.screenshot({path:`artifacts/${c.name}.png`,fullPage:true});
   for(let i=0;i<labels.length;i++){
    const button=page.getByRole('button',{name:labels[i],exact:true});
    const box=await button.boundingBox();assert.ok(box.width>=44&&box.height>=44,'actual web info target >=44px');
    await button.click();const close=page.getByRole('button',{name:c.query.includes('lang=es')?'Cerrar':'Close',exact:true});await close.waitFor();
    if(i===2)await page.screenshot({path:`artifacts/${c.name}-burn-info.png`,fullPage:true});
    await close.click();await close.waitFor({state:'hidden'});
    await button.click();await close.waitFor();await page.keyboard.press('Escape');await close.waitFor({state:'hidden'});
   }
   await page.getByRole('button',{name:labels[0],exact:true}).click();await page.getByRole('button',{name:c.query.includes('lang=es')?'Cerrar':'Close',exact:true}).waitFor();await page.evaluate(()=>window.changeSyntheticOwner());await page.getByRole('button',{name:c.query.includes('lang=es')?'Cerrar':'Close',exact:true}).waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:labels[0],exact:true}).getAttribute('aria-expanded'),'false','owner change clears expanded state');
   results.push({case:c.name,status:'pass',screenshots:[`${c.name}.png`,`${c.name}-burn-info.png`]});
  }catch(e){await page.screenshot({path:`artifacts/${c.name}-failure.png`,fullPage:true});results.push({case:c.name,status:'fail',error:String(e)});throw e;}finally{await context.close();}
 }
}finally{fs.writeFileSync('artifacts/results.json',JSON.stringify({synthetic:true,render:'actual React Native Web components/styles; data-hook, SVG DOM, gradient adapters; simulated font scaling, not iOS Dynamic Type',results},null,2));console.log(JSON.stringify(results));await browser.close();await new Promise(r=>server.close(r));}

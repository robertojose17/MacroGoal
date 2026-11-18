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
  const page=await context.newPage(),errors=[];await page.clock.setFixedTime(new Date('2026-11-18T12:00:00Z'));page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(origin+'/?'+c.query);await page.waitForSelector('button,[role=button]');await page.waitForTimeout(300);
   assert.deepEqual(errors,[],'no runtime errors');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow');
   const info=page.getByRole('button',{name:/^(About|Información sobre) /});assert.equal(await info.count(),3,'three accessible stat explanations');
   const labels=await info.evaluateAll(els=>els.map(e=>e.getAttribute('aria-label')));
   const body=await page.locator('body').innerText();assert.doesNotMatch(body,/Loss speed|Gain speed|Ritmo de pérdida|Ritmo de aumento/,'no duplicate absolute speed');
   const observed=await page.getByTestId('visual-observed').locator(':scope > div').boundingBox(),checkins=await page.getByTestId('synthetic-checkins').boundingBox();assert.ok(checkins.y-(observed.y+observed.height)>=11.5,'at least12px actual gap before synthetic adjacent check-ins');
   const goalText=await page.getByTestId('visual-goal').innerText();const expectedArrival=await page.evaluate(es=>new Date('2026-12-11T12:00:00').toLocaleDateString(es?'es':'en',{month:'short',day:'numeric',year:'numeric'}),c.query.includes('lang=es'));if(c.name==='missing')assert.ok(!goalText.includes(expectedArrival));else assert.ok(goalText.includes(expectedArrival),'supported conditional arrival from actual helper');assert.doesNotMatch(body,/ON TRACK|predicted arrival|forecast arrival/i,'no unverified schedule or arrival assertion');
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
    if(i===2){
     await page.waitForTimeout(350); // Settle fade only for copy/pixels; second-open Escape below stays immediate.
     const dialog=page.getByRole('dialog'),copy=await dialog.innerText(),es=c.query.includes('lang=es');
     if(c.name==='missing'){
      assert.match(copy,/An estimate is not ready yet/,'missing fixture explanation');
      assert.match(copy,/at least 21 days/,'missing fixture coverage requirement');
      assert.doesNotMatch(copy,/Low-confidence estimate|Model sensitivity|2400/,'no ready result in missing modal');
     }else{
      assert.match(copy,es?/Estimación de baja confianza/:/Low-confidence estimate/,'ready fixture explanation');
      assert.match(copy,es?/No se ha verificado/:/not verified complete/,'ready caveat preserved');
      assert.doesNotMatch(copy,/do not yet support|no permiten una estimación|An estimate is not ready/,'ready never uses unavailable explanation');
     }
     await page.screenshot({path:`artifacts/${c.name}-burn-info.png`,fullPage:true});
     if(c.name==='large-text-es-dark'){
      const box=await dialog.evaluate(root=>{const s=[...root.querySelectorAll('*')].find(e=>getComputedStyle(e).overflowY==='auto'&&e.scrollHeight>e.clientHeight+2);if(!s)return null;const r=s.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,top:s.scrollTop};});
      assert.ok(box,'large text explanation has a real scrollable viewport');assert.equal(box.top,0);
      await page.mouse.move(box.x,box.y);await page.mouse.wheel(0,10000);
      await page.waitForFunction(()=>{const root=document.querySelector('[role=dialog]'),s=root&&[...root.querySelectorAll('*')].find(e=>getComputedStyle(e).overflowY==='auto'&&e.scrollHeight>e.clientHeight+2);return s&&s.scrollTop>0&&s.scrollTop+s.clientHeight>=s.scrollHeight-2;});
      assert.match(await dialog.innerText(),/No es una medición metabólica ni una meta de ingesta\./,'final caveat retained');
      await page.screenshot({path:`artifacts/${c.name}-burn-info-scrolled.png`,fullPage:true});
     }
    }
    await close.click();await close.waitFor({state:'hidden'});
    await button.click();await close.waitFor();await page.keyboard.press('Escape');await close.waitFor({state:'hidden'});
   }
   await page.getByRole('button',{name:labels[0],exact:true}).click();await page.getByRole('button',{name:c.query.includes('lang=es')?'Cerrar':'Close',exact:true}).waitFor();await page.evaluate(()=>window.changeSyntheticOwner());await page.getByRole('button',{name:c.query.includes('lang=es')?'Cerrar':'Close',exact:true}).waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:labels[0],exact:true}).getAttribute('aria-expanded'),'false','owner change clears expanded state');
   results.push({case:c.name,status:'pass',screenshots:[`${c.name}.png`,`${c.name}-burn-info.png`,...(c.name==='large-text-es-dark'?[`${c.name}-burn-info-scrolled.png`]:[])]});
  }catch(e){await page.screenshot({path:`artifacts/${c.name}-failure.png`,fullPage:true});results.push({case:c.name,status:'fail',error:String(e)});}finally{await context.close();}
 }
}finally{fs.writeFileSync('artifacts/results.json',JSON.stringify({synthetic:true,render:'actual React Native Web components/styles; data-hook, SVG DOM, gradient adapters; simulated font scaling, not iOS Dynamic Type',results},null,2));console.log(JSON.stringify(results));await browser.close();await new Promise(r=>server.close(r));}

const failures=results.filter(r=>r.status==='fail');if(failures.length)throw new AggregateError(failures.map(r=>new Error(r.case+': '+r.error)),failures.length+' visual cases failed; see artifacts/results.json');


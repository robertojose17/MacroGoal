export async function runLifecycleCases(context,origin,results){
 const assert=(x,m)=>{if(!x)throw Error(m)};
 async function run(name,fn){const page=await context.newPage();try{await page.goto(origin+'/lifecycle.html');await page.waitForFunction(()=>document.title==='LIFECYCLE_READY');await fn(page);results.push({test:name,pass:true});}catch(error){const diagnostic=await page.evaluate(()=>({probe:document.querySelector('#probe')?.textContent,owner:globalThis.__lifecycle?.env.owner,calls:globalThis.__lifecycle?.env.calls,pending:globalThis.__lifecycle?.env.pendingRequests.length,focused:globalThis.__lifecycle?.env.focused,foreground:globalThis.__lifecycle?.env.foreground})).catch(()=>null);throw new Error(name+' '+JSON.stringify(diagnostic),{cause:error});}finally{await page.close();}}
 await run('real React Rules14 recovery survives Free downgrade/remount; status only then exact Premium retry',async page=>{
  await page.evaluate(()=>{__lifecycle.seed();__lifecycle.review(true,false)});
  await page.getByRole('button',{name:'Check previous request',exact:true}).waitFor();
  let calls=await page.evaluate(()=>__lifecycle.env.calls);assert(calls.recover>=1&&calls.offer===0&&calls.accept===0&&calls.retry===0,'mount issued a mutation/offer');
  await page.evaluate(()=>__lifecycle.review(false,false));await page.getByRole('button',{name:'Check previous request',exact:true}).click();await page.getByRole('dialog').waitFor();
  assert(!(await page.locator('body').textContent()).includes('2345'),'Free target leaked');assert(await page.getByRole('button',{name:'Retry this same saved request',exact:true}).count()===0,'Free retry exposed');
  await page.evaluate(()=>{__lifecycle.unmount();__lifecycle.review(false,false)});await page.getByRole('button',{name:'Check previous request',exact:true}).waitFor();
  await page.getByRole('button',{name:'Check previous request',exact:true}).click();await page.getByRole('dialog').waitFor();
  await page.evaluate(()=>__lifecycle.review(true,false));await page.getByRole('button',{name:'Retry this same saved request',exact:true}).click();
  await page.waitForFunction(()=>__lifecycle.env.calls.retry===1);calls=await page.evaluate(()=>__lifecycle.env.calls);assert(calls.offer===0&&calls.accept===0&&calls.receipt===2,'unexpected offer/write');assert(await page.evaluate(()=>__lifecycle.env.lastRetry)==='synthetic-exact-id','pending ID changed');
  await page.evaluate(()=>__lifecycle.focus(false));await page.getByRole('dialog').waitFor({state:'detached'});await page.evaluate(()=>__lifecycle.focus(true));await page.getByRole('button',{name:'Check previous request',exact:true}).waitFor();assert(await page.evaluate(()=>!!sessionStorage.getItem('synthetic-rules14:'+__lifecycle.env.owner)),'pending discarded on blur');
 });
 await run('real React review requires click; downgrade hides open target details and acceptance',async page=>{
  await page.evaluate(()=>{__lifecycle.seed();sessionStorage.clear();__lifecycle.review(true,true)});await page.getByRole('button',{name:'Review my 14-day targets',exact:true}).waitFor();await page.waitForFunction(()=>__lifecycle.env.calls.recover>=1);
  assert(await page.evaluate(()=>__lifecycle.env.calls.offer)===0,'automatic offer');await page.getByRole('button',{name:'Review my 14-day targets',exact:true}).click();await page.getByRole('button',{name:'Accept these targets',exact:true}).waitFor();assert((await page.locator('body').textContent()).includes('2345'),'verified Premium preview absent');
  await page.evaluate(()=>__lifecycle.review(false,true));await page.waitForFunction(()=>!document.body.textContent.includes('2345'));assert(await page.getByRole('button',{name:'Accept these targets',exact:true}).count()===0,'downgraded accept exposed');assert(await page.evaluate(()=>__lifecycle.env.calls.accept)===0,'downgrade accepted');
 });
 await run('real React attention hook expires authority and clears on focus/background until fresh read',async page=>{
  await page.clock.install({time:new Date('2026-11-17T22:00:00Z')});await page.evaluate(()=>__lifecycle.probe());await page.waitForFunction(()=>JSON.parse(document.querySelector('#probe').textContent).value?.status==='attention');
  await page.evaluate(()=>{__lifecycle.env.defer=true});await page.clock.runFor(30001);await page.waitForFunction(()=>JSON.parse(document.querySelector('#probe').textContent).value===null);assert(await page.evaluate(()=>__lifecycle.env.pendingRequests.length)>0,'expiry did not refresh');
  await page.evaluate(()=>{__lifecycle.env.defer=false;__lifecycle.resolve(__lifecycle.result())});await page.waitForFunction(()=>JSON.parse(document.querySelector('#probe').textContent).value?.status==='attention');
  await page.evaluate(()=>__lifecycle.foreground('background'));await page.waitForFunction(()=>JSON.parse(document.querySelector('#probe').textContent).value===null);await page.evaluate(()=>__lifecycle.foreground('active'));await page.waitForFunction(()=>JSON.parse(document.querySelector('#probe').textContent).value?.status==='attention');
  await page.evaluate(()=>__lifecycle.focus(false));await page.waitForFunction(()=>JSON.parse(document.querySelector('#probe').textContent).value===null);await page.evaluate(()=>__lifecycle.focus(true));await page.waitForFunction(()=>JSON.parse(document.querySelector('#probe').textContent).value?.status==='attention');
 });
 await run('real React attention hook rejects late foreign owner response after account switch',async page=>{
  // Fix wall time only; timers and React scheduling remain real. This case tests owner races, not lease expiry.
  await page.clock.setFixedTime(new Date('2026-11-17T22:00:00Z'));
  await page.evaluate(()=>{__lifecycle.env.defer=true;__lifecycle.probe()});await page.waitForFunction(()=>__lifecycle.env.pendingRequests.length===1);
  await page.evaluate(()=>{__lifecycle.owner('22222222-2222-4222-8222-222222222222');__lifecycle.env.defer=false;__lifecycle.probe()});await page.waitForFunction(()=>JSON.parse(document.querySelector('#probe').textContent).value?.ownerId==='22222222-2222-4222-8222-222222222222');
  assert(await page.evaluate(()=>__lifecycle.env.calls.fetch)===2,'new owner did not perform exactly one fresh fetch');assert(await page.evaluate(()=>__lifecycle.env.pendingRequests.length)===1,'old request was not retained for late settlement');
  await page.evaluate(()=>__lifecycle.resolve(__lifecycle.result('11111111-1111-4111-8111-111111111111')));await page.waitForTimeout(25);assert(await page.evaluate(()=>JSON.parse(document.querySelector('#probe').textContent).value?.ownerId)==='22222222-2222-4222-8222-222222222222','foreign response leaked');
 });
}

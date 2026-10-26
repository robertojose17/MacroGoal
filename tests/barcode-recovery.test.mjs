import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateEligible, confirmationPayload, conflictsWithPhoto, distinctCandidates, sealDraft, openDraft, validBarcode } from '../supabase/functions/vision-nutrition-extract/recovery-contract.mjs';
import { validateNutritionLabelRead, compareNutritionLabelReads, runTwoReadGate } from '../supabase/functions/vision-nutrition-extract/nutritionReadGate.mjs';
import { parseProductPage, discoverProducts } from '../supabase/functions/vision-nutrition-extract/recovery-discovery.ts';
import { handleRecovery } from '../supabase/functions/vision-nutrition-extract/recovery.ts';
import { barcodeCandidates as lookupAliases } from '../supabase/functions/lookup-barcode/identity.mjs';
import { recoveryImageDataUri } from '../supabase/functions/vision-nutrition-extract/recovery-images.ts';
import { productImageURL } from '../supabase/functions/vision-nutrition-extract/recovery-discovery.ts';

test('failed online label read cannot leave contradictory JSON-LD eligible',async()=>{
  const url='https://www.walmart.com/ip/fixture',front='https://i5.walmartimages.com/front.jpg',label='https://i5.walmartimages.com/label.jpg';
  const row=productSchema();row.image=[front,label];
  const mockFetch=async(input)=>String(input).includes('openrouter.ai')
    ?new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({urls:[url],labels:[{page_url:url,image_url:label}]}),annotations:[{url_citation:{url}}]}}]}))
    :new Response(page(row),{headers:{'content-type':'text/html'}});
  for(const failure of [{ok:false},{ok:false,partialEvidence:{serving_g:50,serving:'1 cup (50 g)',nutrition:{...nutrition,calories:200}}}]) {
    const result=await discoverProducts({barcode,name:'Fixture',brand:'Fixture'},{apiKey:'offline',fetch:mockFetch,readLabel:async()=>failure});
    assert.equal(result.candidates[0].nutrition.calories,100);
    assert.equal(result.candidates[0].validated,false);
    assert.equal(candidateEligible(result.candidates[0],barcode),false);
    if(failure.partialEvidence)assert.equal(result.candidates[0].label_issue,'label_conflict');
  }
});
test('photo refinement can recover missing fields from a bound online label without a catalog write',async()=>{
  const url='https://www.walmart.com/ip/fixture',front='https://i5.walmartimages.com/front.jpg',label='https://i5.walmartimages.com/label.jpg';
  const row=productSchema();delete row.nutrition;row.image=[front,label];
  const previous=globalThis.fetch;let reads=0;const calls=[];
  globalThis.fetch=async(input)=>String(input).includes('openrouter.ai')
    ?new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({urls:[url],labels:[{page_url:url,image_url:label}]}),annotations:[{url_citation:{url}}]}}]}))
    :new Response(page(row),{headers:{'content-type':'text/html'}});
  try {
    const session=await sealDraft({version:1,kind:'session',owner:'owner',expires:Date.now()+60000,submission:'submission',binding:{barcode},name:'Fixture',brand:'Fixture'},'offline');
    const result=await handleRecovery({action:'recovery_photos',session,photo_label_url:'https://fixture.supabase.co/storage/v1/object/public/food-photos/submissions/owner/label.jpg',photo_front_url:'https://fixture.supabase.co/storage/v1/object/public/food-photos/submissions/owner/front.jpg'},{
      enabled:true,userId:'owner',secret:'offline',apiKey:'offline',projectUrl:'https://fixture.supabase.co',deadline:Date.now()+125000,
      supabase:{async rpc(name){calls.push(name);return {data:1};}},
      readPhotos:async(image)=>{
        reads++;
        if(reads===1)return {ok:false,issues:[{field:'fiber',reason:'unreadable'}],identity:{name:'Fixture vanilla',brand:'Fixture'},
          partialEvidence:{serving_g:50,serving:'1 cup (50 g)',nutrition:{calories:100,protein:5,carbs:12,fat:3}}};
        assert.equal(image,label);
        return {ok:true,nutrition,servingSize:50,servingQuantity:'1 cup (50 g)'};
      },
    });
    assert.equal(reads,2);assert.equal(result.candidates[0].can_confirm,true);
    assert.equal(result.candidates[0].provenance.kind,'source_label');
    assert.deepEqual(calls,['claim_barcode_recovery']);
  } finally {globalThis.fetch=previous;}
});
test('an exhausted deadline cannot start a provider call',async()=>{
  await assert.rejects(discoverProducts({barcode,name:'Fixture',brand:'Fixture'},{apiKey:'offline',deadline:Date.now()-1,fetch:async()=>{throw Error('unexpected provider call');}}),/request_deadline/);
});

test('online nutrition image must belong to the cited Product, then receives two-read validation',async()=>{
  const url='https://www.walmart.com/ip/fixture',front='https://i5.walmartimages.com/front.jpg',label='https://i5.walmartimages.com/label.jpg';
  const row=productSchema();delete row.nutrition;row.image=[front,label];
  let requests=0,reads=0;
  const result=await discoverProducts({barcode,name:'Fixture',brand:'Fixture'},{
    apiKey:'offline',fetch:async(input)=>{requests++;return String(input).includes('openrouter.ai')
      ?new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({urls:[url],labels:[{page_url:url,image_url:label}]}),annotations:[{url_citation:{url}}]}}]}))
      :new Response(page(row),{headers:{'content-type':'text/html'}});},
    readLabel:async(a,b,known)=>{reads++;assert.equal(a,label);assert.equal(b,front);assert.match(known,/Fixture/);return {ok:true,nutrition,servingSize:50,servingQuantity:'1 cup (50 g)'};}
  });
  assert.equal(requests,2);assert.equal(reads,1);
  assert.equal(result.candidates[0].provenance.basis,'two_independent_source_label_reads');
  assert.equal(result.candidates[0].nutrition_image_url,label);
});
test('model-suggested unbound images and cross-retailer CDN references are rejected',()=>{
  assert.equal(productImageURL('https://evil.example/label.jpg','https://www.walmart.com/ip/fixture'),null);
  assert.equal(productImageURL('https://target.scene7.com/label.jpg','https://www.walmart.com/ip/fixture'),null);
});
test('image reads reject redirects, wrong MIME, oversized and empty payloads',async()=>{
  for(const response of [
    new Response(null,{status:302,headers:{location:'https://127.0.0.1/'}}),
    new Response('not an image',{headers:{'content-type':'text/html'}}),
    new Response(new Uint8Array(1100),{headers:{'content-type':'image/jpeg','content-length':String(7*1024*1024)}}),
    new Response(new Uint8Array(10),{headers:{'content-type':'image/jpeg'}}),
  ]) await assert.rejects(recoveryImageDataUri('https://example.invalid/fixture',async()=>response));
  const image=await recoveryImageDataUri('https://example.invalid/fixture',async(_url,options)=>{assert.equal(options.redirect,'manual');return new Response(new Uint8Array(1100),{headers:{'content-type':'image/jpeg'}});});
  assert.match(image,/^data:image\/jpeg;base64,/);
});

test('disabled rollout does not touch storage, catalog or provider',async()=>{
  const result=await handleRecovery({action:'recovery_discover'},{enabled:false});
  assert.equal(result.code,'recovery_not_enabled');
});
test('discovery reserves a request and returns candidates without updating catalog',async()=>{
  const previous=globalThis.fetch;const rpcCalls=[];
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"urls":[]}',annotations:[]}}]}));
  try {
    const supabase={from(){return {select(){return {in:async()=>({data:[]})};}};},
      async rpc(name,args){rpcCalls.push(name);return {data:0};}};
    const result=await handleRecovery({action:'recovery_discover',barcode,name:'Fixture',brand:'Fixture'},
      {enabled:true,supabase,userId:'owner',secret:'offline',apiKey:'offline',projectUrl:'https://fixture.supabase.co'});
    assert.equal(result.status,'review');assert.deepEqual(rpcCalls,['claim_barcode_recovery']);
    assert.equal((await openDraft(result.session,'offline','owner')).binding.barcode,barcode);
  } finally {globalThis.fetch=previous;}
});
test('confirm calls only atomic persistence using signed values, not client overrides',async()=>{
  const payload={version:1,kind:'candidate',owner:'owner',expires:Date.now()+60000,submission:'submission',binding:{barcode},candidate:candidate(),revision:2};
  const proposal=await sealDraft(payload,'offline');let calls=0;
  const supabase={async rpc(name,args){calls++;assert.equal(name,'confirm_barcode_recovery');assert.equal(args.p_payload.calories,100);assert.equal(args.p_payload.revision,2);return {data:{id:'saved'}};}};
  const result=await handleRecovery({action:'recovery_confirm',proposal,calories:999,confirmations:{identity:true,serving:true,nutrition:true,shared:true}},
    {enabled:true,supabase,userId:'owner',secret:'offline'});
  assert.equal(result.status,'approved');assert.equal(calls,1);
});
test('missing explicit confirmation cannot invoke persistence',async()=>{
  const proposal=await sealDraft({version:1,kind:'candidate',owner:'owner',expires:Date.now()+60000,submission:'submission',binding:{barcode},candidate:candidate()},'offline');
  await assert.rejects(handleRecovery({action:'recovery_confirm',proposal,confirmations:{identity:true}},
    {enabled:true,supabase:{rpc(){throw Error('must not call');}},userId:'owner',secret:'offline'}),/confirmation_required/);
});
test('photo URLs outside the owner upload path never reach image or provider reads',async()=>{
  const session=await sealDraft({version:1,kind:'session',owner:'owner',expires:Date.now()+60000,submission:'submission',binding:{barcode}},'offline');
  let photos=0;
  await assert.rejects(handleRecovery({action:'recovery_photos',session,photo_label_url:'https://127.0.0.1/private',photo_front_url:'https://fixture.supabase.co/storage/v1/object/public/food-photos/submissions/another/x.jpg'},
    {enabled:true,supabase:{async rpc(){return {data:1};}},userId:'owner',secret:'offline',projectUrl:'https://fixture.supabase.co',readPhotos:async()=>{photos++;}}),/invalid_photo/);
  assert.equal(photos,0);
});

const barcode='012345678905';
const nutrition={calories:100,protein:5,carbs:12,fat:3,fiber:0};
const candidate=()=>({name:'Fixture vanilla',brand:'Fixture',variant:'Vanilla',barcode,serving:'1 cup (50 g)',serving_g:50,nutrition:{...nutrition},validated:true,provenance:{kind:'source_label',url:'https://www.target.com/p/fixture'},image_url:'https://www.target.com/fixture.jpg'});
function read() {
  const labels={calories:'Calories',protein:'Protein',carbs:'Total Carbohydrates',fat:'Total Fat',fiber:'Dietary Fiber'};
  return {product_name:'Fixture vanilla',brand:'Fixture',confidence:'high',match:true,readability:'clear',ambiguous:false,
    selected_column_header:'Per serving',selected_basis:'per_serving',detected_columns:['Per serving'],serving_size_g:50,serving_quantity:'1 cup (50 g)',serving_size_evidence:'1 cup (50 g)',
    nutrients:Object.fromEntries(Object.entries(nutrition).map(([k,value])=>[k,{value,unit:k==='calories'?'kcal':'g',row_label:labels[k],column_header:'Per serving',printed_text:labels[k]+' '+value+(k==='calories'?'':' g')}]))};
}
test('barcode check digit and UPC/EAN identity are validated',()=>{
  assert.deepEqual(lookupAliases(barcode),['0'+barcode,barcode]);
  assert.equal(validBarcode(barcode),true);assert.equal(validBarcode('012345678906'),false);
  assert.equal(candidateEligible(candidate(),'0'+barcode),true);
  assert.equal(candidateEligible({...candidate(),barcode:'000000000000'},barcode),false);
});
test('a click alone, incomplete nutrition and unsigned client changes cannot confirm',()=>{
  assert.throws(()=>confirmationPayload(candidate(),{barcode},{}),/confirmation_required/);
  assert.equal(candidateEligible({...candidate(),nutrition:{...nutrition,protein:null}},barcode),false);
  assert.equal(candidateEligible({...candidate(),validated:false},barcode),false);
});
test('proposals bind owner, expiry, version and exact server data',async()=>{
  const draft={version:1,owner:'owner',expires:2000,candidate:candidate()};
  const token=await sealDraft(draft,'offline-secret');
  assert.deepEqual(await openDraft(token,'offline-secret','owner',1000),draft);
  await assert.rejects(openDraft(token,'offline-secret','another',1000));
  await assert.rejects(openDraft(token,'offline-secret','owner',3000));
  await assert.rejects(openDraft(token.replace(/^./,token[0]==='A'?'B':'A'),'offline-secret','owner',1000));
});
test('conflicting records remain separate; physical values win after unit normalization',()=>{
  const other={...candidate(),nutrition:{...nutrition,calories:110}};
  assert.equal(distinctCandidates([candidate(),candidate(),other]).length,2);
  assert.deepEqual(conflictsWithPhoto(other,candidate()),['calories']);
  assert.deepEqual(conflictsWithPhoto({...candidate(),serving_g:100,nutrition:Object.fromEntries(Object.entries(nutrition).map(([k,v])=>[k,v*2]))},candidate()),['serving']);
});
test('common English plural and Spanish label names pass without relaxed number evidence',()=>{
  const r=read();assert.equal(validateNutritionLabelRead(r,{requireProduct:true}).ok,true);
  r.nutrients.protein.row_label='Proteínas';r.nutrients.protein.printed_text='Proteínas 5 g';
  r.nutrients.fat.row_label='Grasas totales';r.nutrients.fat.printed_text='Grasas totales 3 g';
  assert.equal(validateNutritionLabelRead(r,{requireProduct:true}).ok,true);
});
test('missing fiber is not zero and qualified values request the precise field',()=>{
  const saturated=read();saturated.nutrients.fat.row_label='Grasas saturadas';saturated.nutrients.fat.printed_text='Grasas saturadas 3 g';
  assert.equal(validateNutritionLabelRead(saturated).ok,false);
  const r=read();r.nutrients.fiber.value=null;
  assert.equal(validateNutritionLabelRead(r).reading.nutrients.fiber.value,null);
  r.nutrients.fiber.value=0;r.nutrients.fiber.printed_text='Dietary Fiber <1 g';
  assert.equal(validateNutritionLabelRead(r).reading.nutrients.fiber.value,null);
});
test('100g-only labels preserve the printed basis; 100ml is not grams',()=>{
  const r=read();r.selected_column_header='Per 100 g';r.selected_basis='per_100g';r.detected_columns=['Per 100 g'];r.serving_size_g=null;r.serving_quantity=null;
  Object.values(r.nutrients).forEach(n=>n.column_header='Per 100 g');
  assert.equal(compareNutritionLabelReads(r,r).servingSize,100);
  r.selected_column_header='Per 100 ml';assert.equal(validateNutritionLabelRead(r).ok,false);
});
test('irrelevant additional columns do not fail matching numeric evidence',()=>{
  const a=read(),b=read();b.detected_columns.push('% Daily Value');
  assert.equal(compareNutritionLabelReads(a,b).ok,true);
  b.nutrients.protein.value=6;b.nutrients.protein.printed_text='Protein 6 g';
  assert.equal(compareNutritionLabelReads(a,b).issues[0].field,'protein');
});
test('two-read gate never calls second model after an invalid first read',async()=>{
  let second=0;const first=read();first.nutrients.fat.value=null;
  const result=await runTwoReadGate(async()=>({result:first,finishReason:'stop'}),async()=>{second++;return {};});
  assert.equal(second,0);assert.equal(result.issues[0].field,'fat');
});
test('model truncation never becomes an approved label',async()=>{
  const result=await runTwoReadGate(async()=>({result:read(),finishReason:'length'}),async()=>{throw Error('must not call');});
  assert.equal(result.ok,false);
});
function productSchema() {return {'@type':'Product',name:'Fixture vanilla',brand:{name:'Fixture'},gtin12:barcode,image:'https://www.target.com/fixture.jpg',
  nutrition:{servingSize:'1 cup (50 g)',calories:'100 kcal',proteinContent:'5 g',carbohydrateContent:'12 g',fatContent:'3 g',fiberContent:'0 g'}};}
const page=row=>'<script type="application/ld+json">'+JSON.stringify(row)+'</script>';
test('source nutrition must belong to one product, not merged with another schema',()=>{
  const row=productSchema(),a={...row,nutrition:{...row.nutrition,proteinContent:undefined}},b={...row,nutrition:{proteinContent:'5 g'}};
  assert.equal(parseProductPage(page([a,b]),'https://www.target.com/p/fixture',barcode).length,0);
  assert.equal(parseProductPage(page(row),'https://www.target.com/p/fixture',barcode)[0].validated,true);
});
test('uncited URLs are never fetched and absent candidates are never fabricated',async()=>{
  let calls=0;
  const result=await discoverProducts({barcode,name:'Fixture',brand:'Fixture'},{apiKey:'offline',fetch:async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({urls:['https://www.target.com/p/fake']}),annotations:[]}}]}));}});
  assert.equal(calls,1);assert.deepEqual(result.candidates,[]);
});
test('a cited private/unapproved page is never fetched',async()=>{
  let calls=0;const url='https://127.0.0.1/private';
  const result=await discoverProducts({barcode,name:'Fixture',brand:'Fixture'},{apiKey:'offline',fetch:async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({urls:[url]}),annotations:[{url_citation:{url}}]}}]}));}});
  assert.equal(calls,1);assert.deepEqual(result.candidates,[]);
});


test('missing optional fiber passes two independent reads as null; printed zero stays zero',()=>{
  const a=read(),b=read();delete a.nutrients.fiber;delete b.nutrients.fiber;
  assert.equal(compareNutritionLabelReads(a,b).nutrition.fiber,null);
  assert.equal(compareNutritionLabelReads(read(),read()).nutrition.fiber,0);
  assert.equal(compareNutritionLabelReads(a,read()).nutrition.fiber,null);
  const disagreement=read();disagreement.nutrients.fiber.value=1;disagreement.nutrients.fiber.printed_text='Dietary Fiber 1 g';
  assert.equal(compareNutritionLabelReads(read(),disagreement).nutrition.fiber,null);
  const c={...candidate(),nutrition:{...nutrition,fiber:null}};
  assert.equal(candidateEligible(c,barcode),true);
  assert.equal(confirmationPayload(c,{barcode},{identity:true,serving:true,nutrition:true,shared:true}).fiber,null);
  assert.deepEqual(conflictsWithPhoto(c,candidate()),[]);
});
test('real manufacturer HTML supplies four macros, relative image and unknown fiber without invented GTIN',async()=>{
  const {readFileSync}=await import('node:fs');
  const html=readFileSync(new URL('./fixtures/violife-us-provolone.html',import.meta.url),'utf8');
  const url='https://www.violife.com/en-us/products/dairy-free-cheese-slices/just-like-smoked-provolone-slices';
  const rows=parseProductPage(html,url,'0810934030123');
  assert.equal(rows.length,1);assert.deepEqual(rows[0].nutrition,{calories:60,protein:0,carbs:4,fat:4.5,fiber:null});
  assert.equal(rows[0].serving_g,20);assert.match(rows[0].image_url,/^https:\/\/www.violife.com\//);
  assert.equal(rows[0].barcode,null);assert.equal(rows[0].validated,false);
  assert.equal(parseProductPage(html+html,url,'0810934030123').length,0);
});
test('empty discovery explains unsupported source without logging URLs or payloads',async()=>{
  const url='https://unsupported.example/product';let calls=0;
  const result=await discoverProducts({barcode,name:'Fixture',brand:'Fixture'},{apiKey:'offline',fetch:async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({urls:[url]}),annotations:[{url_citation:{url}}]}}]}));}});
  assert.equal(calls,1);assert.deepEqual(result.diagnostics,[{slot:1,outcome:'host_not_supported'}]);
});

test('manufacturer table rejects dual bases and extra numeric nutrient columns',async()=>{
 const {readFileSync}=await import('node:fs');const html=readFileSync(new URL('./fixtures/violife-us-provolone.html',import.meta.url),'utf8');
 const url='https://www.violife.com/en-us/products/dairy-free-cheese-slices/just-like-smoked-provolone-slices';
 for(const changed of [html.replace('Amount per serving','Amount per serving / Per 100 g'),html.replace('6%','9 g'),html.replace('20%','2')])assert.equal(parseProductPage(changed,url,'0810934030123').length,0);
});

test('absent source GTIN is selectable but invalid, conflicting and unresolved nutrition are not',()=>{
 const row=productSchema();delete row.gtin12;
 const parse=r=>parseProductPage(page(r),'https://www.target.com/p/fixture',barcode)[0];
 const absent=parse(row);assert.equal(absent.barcode_evidence,'absent');assert.equal(absent.barcode,null);
 assert.equal(absent.exact_barcode,false);assert.equal(candidateEligible(absent,barcode),true);
 for(const changed of [{...row,gtin12:'012345678906'},{...row,gtin12:'000000000000'},{...row,gtin12:barcode,gtin13:'0000000000000'}]) {
  assert.equal(candidateEligible(parse(changed),barcode),false);assert.equal(parse(changed).validated,false);
 }
 for(const changed of [{...absent,label_issue:'label_unreadable'},{...absent,conflicts:['calories']},{...absent,nutrition:{...nutrition,protein:null}},{...absent,nutrition_validated:false}])assert.equal(candidateEligible(changed,barcode),false);
 assert.equal(candidateEligible({...candidate(),barcode:null},barcode),false);
});

test('both source confirmation and physical-label confirmation save signed data through the same canonical RPC',async()=>{
 const source={...candidate(),barcode:null,barcode_evidence:'absent',nutrition_validated:true,validated:false,exact_barcode:false,nutrition:{...nutrition,fiber:null}};
 const physical={...candidate(),nutrition:{...nutrition,fiber:null},provenance:{kind:'physical_label',identity:'user_confirms_scanned_package'}};
 for(const c of [source,physical,candidate()]) {
  const proposal=await sealDraft({version:1,kind:'candidate',owner:'owner',expires:Date.now()+60000,submission:'submission',binding:{barcode,id:'row',updated_at:'revision'},candidate:c,revision:1},'offline');
  const signed=await openDraft(proposal,'offline','owner');assert.equal(signed.candidate.barcode,c.barcode);
  let savedPayload;
  const result=await handleRecovery({action:'recovery_confirm',proposal,barcode:'000000000000',calories:999,confirmations:{identity:true,serving:true,nutrition:true,shared:true}},
   {enabled:true,userId:'owner',secret:'offline',supabase:{async rpc(name,args){assert.equal(name,'confirm_barcode_recovery');savedPayload=args.p_payload;return {data:{id:'row',...savedPayload}};}}});
  assert.equal(result.status,'approved');assert.equal(savedPayload.calories,100);assert.equal(savedPayload.expected_id,'row');assert.equal(savedPayload.revision,1);
  assert.deepEqual(lookupAliases(barcode),lookupAliases(savedPayload.barcode));
  if(c===source){assert.equal(savedPayload.provenance.identity,'user_confirmed_barcode');assert.equal(savedPayload.provenance.source_barcode,null);assert.equal(savedPayload.provenance.exact_barcode,false);assert.equal(savedPayload.fiber,null);}
  if(c===physical)assert.equal(savedPayload.provenance.kind,'physical_label');
 }
});

test('manufacturer source without GTIN offers explicit identity confirmation with unknown fiber',async()=>{
 const {readFileSync}=await import('node:fs');const html=readFileSync(new URL('./fixtures/violife-us-provolone.html',import.meta.url),'utf8');
 const c=parseProductPage(html,'https://www.violife.com/en-us/products/dairy-free-cheese-slices/just-like-smoked-provolone-slices','0810934030123')[0];
 assert.equal(candidateEligible(c,'0810934030123'),true);
 const payload=confirmationPayload(c,{barcode:'0810934030123'},{identity:true,serving:true,nutrition:true,shared:true});
 assert.equal(payload.fiber,null);assert.equal(payload.provenance.source_barcode,null);assert.equal(payload.provenance.exact_barcode,false);
});

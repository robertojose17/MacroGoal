'use strict';
// Offline diagnostic of the downloaded production v14 reader, not a replacement
// reader or a live/account test. A reproduced gap deliberately exits nonzero.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
async function main() {
const source = fs.readFileSync(path.join(__dirname, '../../tests/release-review/fixtures/observed-runtime-v14.ts'), 'utf8');
const sourceHash = crypto.createHash('sha256').update(source).digest('hex');
if (sourceHash !== 'fa702fd1beb809c507a65c63ab72d2b5e1f9c60d9c0aa9e5951bc1b787632416') throw Error('runtime_fixture_hash_mismatch');
const copy = x => JSON.parse(JSON.stringify(x));
const state = {
  users: { timezone:'UTC',date_of_birth:'1990-06-15',journey_start_date:null },
  check_ins:[{id:'weight-a',date:'2026-11-10',weight:80,created_at:'2026-11-10T12:00:00Z',updated_at:null}],
  meals:[{id:'meal-a',date:'2026-11-10',meal_type:'Breakfast'}],
  meal_items:[{id:'item-a',meal_id:'meal-a',calories:2000,is_scheduled:false}],
};
const completeStates=[copy(state)];
let committed=false;
const db={from(table){
  const query={select(){return query;},eq(){return query;},not(){return query;},gte(){return query;},lt(){return query;},ilike(){return query;},order(){return query;},in(){return query;},
    single:async()=>({data:copy(state.users),error:null}),limit:async()=>({data:[],error:null}),
    range:async(start,end)=>{
      if(table==='meals'&&!committed){
        // Model one atomic writer commit between the reader's separate calls.
        state.check_ins[0].weight=81;state.meal_items[0].calories=2500;
        completeStates.push(copy(state));committed=true;
      }
      const rows=copy(state[table]);return {data:rows.slice(start,end+1),count:rows.length,error:null};
    }};
  return query;
}};
const exportsObject={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports:exportsObject,Date,URL,Response,Request,Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://example.invalid':'public-fixture'}},
  require:name=>{
    if(name==='npm:@supabase/supabase-js@2.83.0')return {createClient:()=>db};
    if(name==='./handler.ts')return {createObservationHandler:()=>null};
    if(name==='../dynamic-tdee/data.ts')return {todayInZone:now=>now.toISOString().slice(0,10)};
    if(name==='../_shared/dynamic-tdee.ts')return {dayNumber:date=>Date.parse(date)/86400000,dateForDay:n=>new Date(n*86400000).toISOString().slice(0,10)};
    throw Error('Unexpected import '+name);
  },
});
  const result=await exportsObject.readObservedSources('actor-fixture','Bearer fixture',new Date('2026-11-13T12:00:00Z'));
  const actual={weight:result.checkIns[0].weight,calories:result.items[0].calories};
  const known=completeStates.map(s=>({weight:s.check_ins[0].weight,calories:s.meal_items[0].calories}));
  const consistent=known.some(s=>s.weight===actual.weight&&s.calories===actual.calories);
  console.log(JSON.stringify({kind:'offline-known-gap-diagnostic',sourceSha256:sourceHash,actual,completeStates:known,consistent,liveQuery:false},null,2));
  process.exitCode=consistent?0:1;
}
main().catch(error=>{console.error(error);process.exitCode=2;});

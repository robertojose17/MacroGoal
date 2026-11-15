// PREPARED, NOT EXECUTED: do not run with the previously rejected backend runner.
// No policy or clinical threshold is introduced; compares identical eligible inputs.
import { computeWeightPace } from './weightPace.ts';
const assertSame=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('future data affected as-of pace');};
Deno.test('future weigh-ins do not affect past-date pace or observation count',()=>{
 const today='2026-10-28';
 const base=Array.from({length:28},(_,i)=>({
  date:new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10),
  weightLbs:180-i*0.1
 }));
 const before=JSON.stringify(base);
 const expected=computeWeightPace(base,today);
 assertSame(computeWeightPace([...base,{date:'2026-10-29',weightLbs:250},{date:'2027-01-01',weightLbs:100}],today),expected);
 if(JSON.stringify(base)!==before)throw new Error('input mutated');
});
Deno.test('future-only data is equivalent to no data as of today',()=>{
 assertSame(computeWeightPace([{date:'2026-10-29',weightLbs:180}], '2026-10-28'),computeWeightPace([], '2026-10-28'));
});

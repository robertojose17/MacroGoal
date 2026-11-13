'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const root=path.join(__dirname,'..');
function source(file){return ts.createSourceFile(file,fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);}
function find(tree,predicate){let found;function visit(node){if(found)return;if(predicate(node)){found=node;return;}ts.forEachChild(node,visit);}visit(tree);return found;}
function evaluate(text,context){return vm.runInNewContext(ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);}
const card=source('components/xp/SevenDayChallenge/ChallengeDashboardCard.tsx');const dayFunction=find(card,n=>ts.isFunctionDeclaration(n)&&n.name.text==='challengeDayDate');const dateForDay=evaluate(dayFunction.getText(card)+'; challengeDayDate;',{Date});
test('challenge civil steps cross month/year and leap dates independently of local DST',()=>{
 assert.equal(dateForDay('2026-12-29',7),'2027-01-04');assert.equal(dateForDay('2024-02-27',3),'2024-02-29');assert.equal(dateForDay('2026-03-07',3),'2026-03-09');assert.equal(dateForDay('2026-11-01',1),'2026-11-01');
});
test('invalid start or step never produces a completion date',()=>{
 for(const start of ['2026-02-30','2026-13-01','bad','2026-1-01','2026-01-01T00:00:00Z'])assert.equal(dateForDay(start,1),null);
 for(const d of [0,8,1.5,NaN])assert.equal(dateForDay('2026-11-13',d),null);
});
test('actual card checks civil dates for nodes and both connector endpoints',()=>{
 const text=card.getFullText();assert.match(text,/completed_days\.includes\(date\)/);assert.match(text,/isCompletedDay && nextDate !== null && challenge\.completed_days\.includes\(nextDate\)/);assert.doesNotMatch(text,/completed_days\.includes\(d(?:\s*\+\s*1)?\)/);
 const completed=['2026-12-30','2026-12-31'];assert.equal(completed.includes(dateForDay('2026-12-29',1)),false);assert.equal(completed.includes(dateForDay('2026-12-29',2)),true);assert.equal(completed.includes(dateForDay('2026-12-29',3)),true);
});
const detail=source('app/social-post-detail.tsx');const declaration=find(detail,n=>ts.isVariableDeclaration(n)&&n.name.getText(detail)==='handleLike');const callback=declaration.initializer.arguments[0].getText(detail);
function harness({liked=false,rpc}={}){const initial={id:'p',liked_by_me:liked,likes_count:liked?4:3};let current=initial;const calls=[];const busy={current:false};const context={post:initial,post_id:'p',likeBusy:busy,Math,console:{error(){}},setPost:f=>{current=f(current);},toggleLike:async(...args)=>{calls.push(args);return rpc?rpc(...args):{liked:!liked,likes_count:liked?3:4};}};const handle=evaluate(`(${callback})`,context);return {handle,calls,busy,initial,get:()=>current,set:p=>{current=p;}};}
test('like passes actual prior state and applies confirmed response',async()=>{for(const liked of [false,true]){const h=harness({liked});await h.handle('p');assert.deepEqual(h.calls,[['p',liked]]);assert.equal(h.get().liked_by_me,!liked);assert.equal(h.busy.current,false);}});
test('double tap is serialized without a duplicate server toggle',async()=>{let finish;const h=harness({rpc:()=>new Promise(r=>{finish=r;})});const first=h.handle('p');await h.handle('p');assert.equal(h.calls.length,1);finish({liked:true,likes_count:4});await first;});
test('failed mutation restores exact captured state',async()=>{const h=harness({rpc:async()=>{throw Error('failed');}});await h.handle('p');assert.equal(h.get(),h.initial);assert.equal(h.busy.current,false);});
test('late success or failure never overwrites a newer post/read',async()=>{for(const reject of [false,true]){let resolve,fail;const h=harness({rpc:()=>new Promise((r,j)=>{resolve=r;fail=j;})});const pending=h.handle('p');const newer={id:'new',liked_by_me:false,likes_count:10};h.set(newer);if(reject)fail(Error('late'));else resolve({liked:true,likes_count:4});await pending;assert.equal(h.get(),newer);}});
test('wrong post callback never calls toggle RPC',async()=>{const h=harness();await h.handle('other');assert.equal(h.calls.length,0);assert.equal(h.get(),h.initial);});

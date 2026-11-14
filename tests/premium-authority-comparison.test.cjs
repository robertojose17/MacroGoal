const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const exportsObject={};
new Function('exports',ts.transpileModule(fs.readFileSync('utils/premiumAuthority/compareObservation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exportsObject);
const compare=exportsObject.comparePremiumObservation;
const owner='00000000-0000-4000-8000-000000000001';
const base={ownerId:owner,policyContext:'production',access:'premium',checkedAt:10000,validUntil:20000,evaluatedEnvironments:['PRODUCTION']};
const cases=[
[true,false,base,15000,'agree_premium'],[false,false,base,15000,'authority_premium_legacy_free'],
[true,false,{...base,access:'free'},15000,'authority_free_legacy_premium'],[false,false,{...base,access:'free'},15000,'agree_free'],
[true,true,base,15000,'pending'],[true,false,null,15000,'unavailable'],
[true,false,{...base,ownerId:'other'},15000,'unavailable'],[true,false,base,20000,'unavailable'],
[true,false,{...base,checkedAt:16000},15000,'unavailable'],[true,false,{...base,access:'unknown'},15000,'unavailable'],
[true,false,{...base,evaluatedEnvironments:['SANDBOX']},15000,'unavailable'],
[true,false,{...base,policyContext:'test_account',evaluatedEnvironments:['PRODUCTION','SANDBOX']},15000,'agree_premium'],
[true,false,{...base,validUntil:41000},15000,'unavailable']];
cases.forEach(([legacy,loading,decision,now,expected],i)=>test('comparison '+i+' '+expected,()=>assert.equal(compare(owner,legacy,loading,decision,now),expected)));
test('signed out never reuses observation',()=>assert.equal(compare(null,true,false,base,15000),'pending'));
test('comparison cannot alter existing access return',()=>{
 const source=fs.readFileSync('hooks/usePremium.ts','utf8');
 assert.match(source,/return \{ isPremium, loading, error, checkPremiumStatus, refreshPremiumStatus, customerInfo, expirationDate \}/);
 assert.doesNotMatch(source,/setIsPremium\([^)]*(?:comparison|authorityObservation)/);
});

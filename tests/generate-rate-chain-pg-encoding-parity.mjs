/** Synthetic JSON and exact-byte checks only. No operational rows or approvals. */
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const root=process.argv[2]??path.resolve(import.meta.dirname,'..'), updated=process.argv[3];
const fixturePath=path.join(root,'tests/.chain-pg-fixture-temp.mjs');
const original=fs.readFileSync(path.join(root,'tests/rate-acceptance-chain.test.mjs'),'utf8');
fs.writeFileSync(fixturePath,original.slice(0,original.indexOf("test('synthetic"))+'\nexport {fixture};\n');
const overridePath=path.join(root,'release-candidates/tdee-adaptive-review/.chain-pg-implementation-temp.ts');
if(updated)fs.copyFileSync(updated,overridePath);
let fixture,verify;try{({fixture}=await import(pathToFileURL(fixturePath)));({verifyRateAcceptanceChain:verify}=await import(pathToFileURL(updated?overridePath:path.join(root,'release-candidates/tdee-adaptive-review/rateAcceptanceChain.ts'))));}finally{fs.unlinkSync(fixturePath);if(updated)fs.unlinkSync(overridePath);}
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const encode=(row,prior,mode='pg-jsonb-v1')=>{const {canonicalContent,receiptDigest,...u}=row.receipt;u.canonicalEncoding=mode;u.previousReceiptDigest=prior;const text=JSON.stringify(u,null,2);row.receipt={...u,canonicalContent:text,receiptDigest:hash(text)};return row.receipt.receiptDigest;};
const cases=[];
async function add(name,count,mutate){const f=await fixture(count);let prior=null;for(const row of f.value.rows)prior=encode(row,prior);if(mutate)await mutate(f.value);let expected;try{expected=await verify(f.value,f.now);}catch{expected={kind:'blocked',reason:'rate_receipt_chain_unverified',actionable:false,acceptanceAuthorized:false};}cases.push({name,...f,expected});}
await add('pg-1-positive',1);await add('pg-2-positive',2);
await add('pg-mixed-old-new',2,v=>{const row=v.rows[0],{canonicalContent,receiptDigest,canonicalEncoding,...u}=row.receipt;const sort=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(sort).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+sort(x[k])).join(',')+'}';const text=sort(u);row.receipt={...u,canonicalContent:text,receiptDigest:hash(text)};encode(v.rows[1],row.receipt.receiptDigest);});
for(const [name,mutate] of Object.entries({missingEncoding:r=>delete r.canonicalEncoding,unknownEncoding:r=>r.canonicalEncoding='unknown',nullEncoding:r=>r.canonicalEncoding=null,byteTamper:r=>r.canonicalContent+=' ',digestTamper:r=>r.receiptDigest='b'.repeat(64),semanticTamper:r=>{const c=JSON.parse(r.canonicalContent);c.netDeltaKcal++;r.canonicalContent=JSON.stringify(c);r.receiptDigest=hash(r.canonicalContent);},unsignedEncodingMissing:r=>{const c=JSON.parse(r.canonicalContent);delete c.canonicalEncoding;r.canonicalContent=JSON.stringify(c);r.receiptDigest=hash(r.canonicalContent);},invalidJSON:r=>{r.canonicalContent='{';r.receiptDigest=hash(r.canonicalContent);},wrongPrior:r=>{r.previousReceiptDigest='c'.repeat(64);const {canonicalContent,receiptDigest,...u}=r;r.canonicalContent=JSON.stringify(u);r.receiptDigest=hash(r.canonicalContent);}}))await add(name,2,v=>mutate(v.rows[1].receipt));
const dir=import.meta.dirname;
fs.writeFileSync(path.join(dir,'rate-chain-pg-encoding-fixtures.json'),JSON.stringify(cases,null,2));
fs.writeFileSync(path.join(dir,'rate-chain-pg-encoding-parity.sql'),`DO $parity$ DECLARE c jsonb;actual jsonb;BEGIN FOR c IN SELECT value FROM jsonb_array_elements($fixtures$${JSON.stringify(cases)}$fixtures$::jsonb) LOOP actual:=tdee_rate_record_private.verify_chain(c->'value',(c->>'now')::bigint);IF actual IS DISTINCT FROM c->'expected' THEN RAISE EXCEPTION 'PG encoding parity % actual % expected %',c->>'name',actual,c->'expected';END IF;END LOOP;END $parity$;\n`);
const f=await fixture(1);const row=f.value.rows[0];const {canonicalContent,receiptDigest,...u}=row.receipt;u.canonicalEncoding='pg-jsonb-v1';
// Actual PostgreSQL serializes unsigned JSON; result is a pure fixture for TS round trip.
const sql=`WITH fixture AS (SELECT $fixture$${JSON.stringify(f)}$fixture$::jsonb AS f), unsigned AS (SELECT f,$receipt$${JSON.stringify(u)}$receipt$::jsonb AS r FROM fixture), encoded AS(SELECT f,r||jsonb_build_object('canonicalContent',r::text,'receiptDigest',encode(sha256(convert_to(r::text,'UTF8')),'hex')) AS r FROM unsigned) SELECT jsonb_set(f,'{value,rows,0,receipt}',r) AS fixture FROM encoded;\n`;
fs.writeFileSync(path.join(dir,'rate-chain-pg-roundtrip-readonly.sql'),sql);
console.log(`Generated ${cases.length} explicit encoding differential cases and actual-PG roundtrip query; no database actions.`);

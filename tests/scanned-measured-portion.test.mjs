import test from 'node:test';
import {parseScannedPortion, scaleScannedPortion} from '../utils/scannedMeasuredPortion.ts';

test('scale measured labels without computing grams or replacing unknown nutrients',()=>{

const m={name:'Syrup',brand:'Test',label:'2 Tbsp (30 mL)',ml:30,calories:15,protein:0,carbs:5,fat:0,fiber:null};
const p=parseScannedPortion(m);
assert.deepEqual(scaleScannedPortion(p,'15','measure'),{amount:15,unit:'mL',quantity:0.5,grams:null,calories:7.5,protein:0,carbs:2.5,fats:0,fiber:null});
assert.deepEqual(scaleScannedPortion(p,'0,5','serving'),scaleScannedPortion(p,'15','measure'));
for (const [unit,amount] of [['tbsp',2],['cookies',3],['fl oz',4],['oz',1]]) {
 const q=parseScannedPortion({...m,ml:undefined,measure:{amount,unit}});
 assert.equal(scaleScannedPortion(q,String(amount),'measure').calories,15);
 assert.equal(scaleScannedPortion(q,'2','serving').amount,amount*2);
}
for(const bad of ['0','-1','1x','NaN','1.2.3','1e2',''])assert.equal(scaleScannedPortion(p,bad,'measure'),null);
assert.equal(parseScannedPortion({...m,calories:null}),null);
assert.equal(parseScannedPortion({...m,measure:{amount:2,unit:'tbsp'}}),null);

});

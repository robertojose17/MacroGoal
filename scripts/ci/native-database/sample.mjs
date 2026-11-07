// Synthetic evidence through the frozen offline capture implementations only.
import {captureOffMass,canonicalGTIN} from './src/offMass.mjs';
import {captureUSDA} from './src/provider.mjs';
export const gtin=n=>{const body=String(n).padStart(11,'0');let sum=0;for(let i=body.length-1,j=0;i>=0;i--,j++)sum+=Number(body[i])*(j%2===0?3:1);return body+String((10-sum%10)%10);};
if(process.argv[2]==='off') {
 const p={code:gtin(Number(process.argv[3])),product_name:'Synthetic oats',brands:'Synthetic Brand',ingredients_text:'Whole oats, salt',nutrition_data_per:'serving',serving_quantity:'40',serving_quantity_unit:'g',serving_size:'40 g',nutriments:{'energy-kcal_serving':160,proteins_serving:4,carbohydrates_serving:24,fat_serving:4,'vitamin-c_serving':0.004,'vitamin-c_unit':'mg','vitamin-c_value':4,'vitamin-c_100g':0.01,'trace-odd_serving':0.01,'trace-odd_unit':'IU'}};
 if(process.argv[4]==='true')p.code='0'+p.code;
 console.log(JSON.stringify({code:p.code,canonical:canonicalGTIN(p.code),e:captureOffMass(p,{expectedId:canonicalGTIN(p.code)})}));
} else if(process.argv[2]==='usda') {
 const e=captureUSDA({fdcId:123,description:'Banana, raw',dataType:'SR Legacy',foodNutrients:[[1008,'kcal',89],[1003,'g',1],[1005,'g',23],[1004,'g',.3],[1162,'mg',8.7]].map(([id,unitName,amount])=>({nutrient:{id,unitName},amount}))},{expectedId:'123',capturedAt:new Date().toISOString()});
 delete e.canonical_candidates;console.log(JSON.stringify(e));
} else throw new Error('Expected off or usda synthetic fixture');

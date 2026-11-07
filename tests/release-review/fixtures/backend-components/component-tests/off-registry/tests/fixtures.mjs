import {fixture as baseFixture,lit,uuid} from '../base/tests/fixture.mjs';
import {readFile} from 'node:fs/promises';
import {captureOffMass,canonicalGTIN} from '../src/offMass.mjs';
export {lit,uuid,baseFixture};
export const gtin=n=>{const body=String(n).padStart(11,'0');let sum=0;for(let i=body.length-1,j=0;i>=0;i--,j++)sum+=Number(body[i])*(j%2===0?3:1);return body+String((10-sum%10)%10);};
export function product(n=1){return {code:gtin(n),product_name:'Synthetic oats',brands:'Synthetic Brand',ingredients_text:'Whole oats, salt',nutrition_data_per:'serving',serving_quantity:'40',serving_quantity_unit:'g',serving_size:'40 g',nutriments:{'energy-kcal_serving':160,proteins_serving:4,carbohydrates_serving:24,fat_serving:4,'vitamin-c_serving':0.004,'vitamin-c_unit':'mg','vitamin-c_value':4,'vitamin-c_100g':0.01,'trace-odd_serving':0.01,'trace-odd_unit':'IU'}};}
export const envelope=(p=product())=>captureOffMass(p,{expectedId:canonicalGTIN(p.code)});
export async function fixture(){const db=await baseFixture();await db.exec(await readFile(process.env.OFF_MASS_SQL_PATH??new URL('../sql/off-mass.CANDIDATE.sql',import.meta.url),'utf8'));return db;}

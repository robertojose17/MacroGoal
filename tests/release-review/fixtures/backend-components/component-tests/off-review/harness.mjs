import fs from 'node:fs';
import {dbFixture,lit,seed,row} from "../base-review/harness.mjs";
export {lit,seed,row};
export const ROOT=new URL("../off-registry",import.meta.url).pathname;
export const raw=(extra={})=>({code:'012345678905',product_name:'Synthetic oats',brands:'Synthetic Brand',ingredients_text:'Whole oats, salt',nutrition_data_per:'serving',serving_quantity:'40',serving_quantity_unit:'g',serving_size:'40 g',nutriments:{'energy-kcal_serving':160,proteins_serving:4,carbohydrates_serving:24,fat_serving:4,'vitamin-c_serving':.004,'vitamin-c_unit':'mg','vitamin-c_100g':.01},...extra});
export async function fixture(){const db=await dbFixture(ROOT+'/base/sql/enrichment.CANDIDATE.sql');try{await db.exec(fs.readFileSync(ROOT+'/sql/off-mass.CANDIDATE.sql','utf8'));return db;}catch(error){await db.close();throw error;}}
export async function rpc(db,name,...args){await db.exec('SET ROLE service_role');return (await db.query(`SELECT public.${name}(${args.map(lit).join(',')}) result`)).rows[0].result;}

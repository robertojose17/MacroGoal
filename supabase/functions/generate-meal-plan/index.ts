import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import{createClient}from"npm:@supabase/supabase-js@2";
const SUPABASE_URL=Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENROUTER_API_KEY=Deno.env.get("OPENROUTER_API_KEY");
const OPENROUTER_BASE_URL="https://openrouter.ai/api/v1";
const DEFAULT_MODEL="openai/gpt-4o-mini";
const supabase=createClient(SUPABASE_URL!,SERVICE_ROLE!,{auth:{persistSession:false}});
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
interface UserPreferences{dietary_restrictions?:string[];protein_preferences?:string[];carb_preferences?:string[];fat_preferences?:string[];disliked_foods?:string;cooking_level?:string;}
const _WF:[string,number,number,number,number][]=[["chicken breast",165,31,0,3.6],["chicken thigh",209,26,0,11],["ground beef 93/7",152,22,0,7],["ground beef 85/15",215,21,0,14],["ground turkey 93/7",150,22,0,7],["salmon",208,22,0,13],["tuna",132,28,0,1],["shrimp",99,24,0,0.3],["tilapia",128,26,0,2.7],["cod",105,23,0,0.9],["egg",155,13,1.1,11],["egg white",52,11,0.7,0.2],["greek yogurt",59,10,3.6,0.4],["cottage cheese",98,11,3.4,4.3],["tofu",144,17,2.8,9],["tempeh",192,20,7.6,11],["lentils",116,9,20,0.4],["black beans",132,9,24,0.5],["chickpeas",164,9,27,2.6],["white rice",130,2.7,28,0.3],["brown rice",112,2.6,24,0.9],["quinoa",120,4.4,21,1.9],["oats",379,13,68,7],["rolled oats",379,13,68,7],["pasta",131,5,25,1.1],["sweet potato",86,1.6,20,0.1],["potato",87,1.9,20,0.1],["bread",265,9,49,3.2],["whole wheat bread",247,13,41,4.2],["tortilla",218,6,36,5],["broccoli",35,2.4,7,0.4],["spinach",23,2.9,3.6,0.4],["cauliflower",25,1.9,5,0.3],["carrots",41,0.9,10,0.2],["tomato",18,0.9,3.9,0.2],["banana",89,1.1,23,0.3],["apple",52,0.3,14,0.2],["blueberries",57,0.7,14,0.3],["almonds",579,21,22,50],["walnuts",654,15,14,65],["peanut butter",588,25,20,50],["olive oil",884,0,0,100],["butter",717,0.9,0.1,81],["avocado",160,2,9,15],["cheese",402,25,1.3,33],["mozzarella",280,28,3.1,17],["milk",42,3.4,5,1],["honey",304,0.3,82,0],["whey protein",370,80,8,4]];
const WHOLE_FOODS_DB:Record<string,{cal:number;p:number;c:number;f:number}>=Object.fromEntries(_WF.map(([k,cal,p,c,f])=>[k,{cal,p,c,f}]));
function findInDB(n:string):{cal:number;p:number;c:number;f:number}|null{
const l=n.toLowerCase();
if(WHOLE_FOODS_DB[l])return WHOLE_FOODS_DB[l];
for(const k of Object.keys(WHOLE_FOODS_DB)){if(l.includes(k)||k.includes(l))return WHOLE_FOODS_DB[k];}
return null;
}
async function lookupOpenFoodFacts(name:string,brand:string):Promise<{cal:number;p:number;c:number;f:number}|null>{
try{
const q=encodeURIComponent(`${name} ${brand}`.trim());
const r=await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=1&fields=nutriments`,{headers:{"User-Agent":"MacroGoalApp/1.0"}});
if(!r.ok)return null;
const d=await r.json();const pr=d?.products?.[0];if(!pr?.nutriments)return null;
const n2=pr.nutriments;
const cal=n2["energy-kcal_100g"]??(n2["energy_100g"]?n2["energy_100g"]/4.184:null);
const p=n2["proteins_100g"],c=n2["carbohydrates_100g"],f=n2["fat_100g"];
if(cal==null||p==null||c==null||f==null)return null;
return{cal:Math.round(cal),p:Math.round(p*10)/10,c:Math.round(c*10)/10,f:Math.round(f*10)/10};
}catch(_){return null;}
}
async function lookupMacros(name:string,brand:string|null):Promise<{cal:number;p:number;c:number;f:number}|null>{
const d=findInDB(name);if(d)return d;
if(brand&&brand.trim()){const o=await lookupOpenFoodFacts(name,brand);if(o)return o;}
return null;
}
async function recalcItemMacros(item:any):Promise<void>{
const m=await lookupMacros(item.name||"",item.brand||null);if(!m)return;
const fac=(Number(item.serving_size)||100)/100;
item.calories=Math.round(m.cal*fac);item.protein=Math.round(m.p*fac*10)/10;
item.carbs=Math.round(m.c*fac*10)/10;item.fat=Math.round(m.f*fac*10)/10;
}
function sumMeals(meals:any[]):{cal:number;p:number;c:number;f:number}{
let cal=0,p=0,c=0,f=0;
for(const meal of meals)for(const it of meal.items||[]){cal+=Number(it.calories)||0;p+=Number(it.protein)||0;c+=Number(it.carbs)||0;f+=Number(it.fat)||0;}
return{cal:Math.round(cal),p:Math.round(p*10)/10,c:Math.round(c*10)/10,f:Math.round(f*10)/10};
}
function getAllItems(meals:any[]):any[]{const r:any[]=[];for(const m of meals)for(const it of m.items||[])r.push(it);return r;}
async function recalculateAndAdjust(planData:any,userGoals:Goals):Promise<void>{
if(!planData?.meals||!Array.isArray(planData.meals))return;
const meals=planData.meals;
const goal={cal:userGoals.daily_calories,p:userGoals.daily_protein,c:userGoals.daily_carbs,f:userGoals.daily_fats};
const allItems=getAllItems(meals);
await Promise.all(allItems.map(recalcItemMacros));
const origSz=new Map<any,number>();for(const it of allItems)origSz.set(it,Number(it.serving_size)||100);
async function dens(it:any,macro:"p"|"c"|"f"):Promise<number>{const m=await lookupMacros(it.name||"",it.brand||null);return m?m[macro]:0;}
async function scaleItem(it:any,gap:number,curr:number,macro:"p"|"c"|"f"|"cal"):Promise<void>{
const orig=origSz.get(it)||100;const val=Number(macro==="cal"?it.calories:it[macro])||0;if(val<=0)return;
const fac=Math.max(0.3,Math.min(3.0,(val+gap)/val));
it.serving_size=Math.max(Math.round(orig*0.3),Math.min(Math.round(orig*3),Math.round(curr*fac)));
await recalcItemMacros(it);
}
async function adjustMacro(macro:"p"|"f",goalVal:number,label:string):Promise<boolean>{
for(let i=0;i<5;i++){
const tot=sumMeals(meals);const cur=macro==="p"?tot.p:tot.f;const gap=goalVal-cur;const gapPct=Math.abs(gap)/goalVal;
console.log(`[MealPlan] ${label} iter`,i,{total:cur,goal:goalVal,gap,gapPct});
if(gapPct<=0.05)return true;
const ds=await Promise.all(allItems.map(async it=>({it,d:await dens(it,macro),o:origSz.get(it)||100,c:Number(it.serving_size)||100})));
const cands=ds.filter(x=>x.d>5&&x.c<x.o*3&&x.c>x.o*0.3).sort((a,b)=>b.d-a.d);
if(!cands.length)break;
await scaleItem(cands[0].it,gap,cands[0].c,macro);
}
return false;
}
const proteinConverged=await adjustMacro("p",goal.p,"proteinGap iter");
await adjustMacro("f",goal.f,"fatGap iter");
if(proteinConverged){
const tot=sumMeals(meals);const calGap=goal.cal-tot.cal;const calGapPct=Math.abs(calGap)/goal.cal;
console.log("[MealPlan] calGap (carbs absorb)",{total:tot.cal,goal:goal.cal,gap:calGap,gapPct:calGapPct});
if(calGapPct>0.05){
const ds=await Promise.all(allItems.map(async it=>({it,d:await dens(it,"c"),o:origSz.get(it)||100,c:Number(it.serving_size)||100})));
const cands=ds.filter(x=>x.d>15&&x.c<x.o*3&&x.c>x.o*0.3).sort((a,b)=>b.d-a.d);
if(cands.length)await scaleItem(cands[0].it,calGap,cands[0].c,"cal");
}
}
for(const meal of meals){
if(meal.items&&Array.isArray(meal.items)){
let mc=0,mp=0,mcb=0,mf=0;
for(const it of meal.items){mc+=Number(it.calories)||0;mp+=Number(it.protein)||0;mcb+=Number(it.carbs)||0;mf+=Number(it.fat)||0;}
if("calories"in meal)meal.calories=Math.round(mc);if("protein"in meal)meal.protein=Math.round(mp*10)/10;
if("carbs"in meal)meal.carbs=Math.round(mcb*10)/10;if("fat"in meal)meal.fat=Math.round(mf*10)/10;
}
}
const ft=sumMeals(meals);
if(planData.daily_totals){planData.daily_totals.calories=ft.cal;planData.daily_totals.protein=ft.p;planData.daily_totals.carbs=ft.c;planData.daily_totals.fat=ft.f;}
if("total_calories"in planData)planData.total_calories=ft.cal;if("total_protein"in planData)planData.total_protein=ft.p;
if("total_carbs"in planData)planData.total_carbs=ft.c;if("total_fat"in planData)planData.total_fat=ft.f;
console.log("[MealPlan] Final totals after adjust:",ft,"vs goal:",goal);
}
type Goals={daily_calories:number;daily_protein:number;daily_carbs:number;daily_fats:number};
function buildSystemPrompt(userGoals:Goals,recipePool:any[],preferences:UserPreferences|null,skinnytasteContent:string):string{
const recipeSection=recipePool.length>0?`\nRECIPES:\n${recipePool.map(r=>`- ${r.name} ~${r.calories}cal ${r.protein}g P`).join("\n")}\n`:"";
const skinnytasteSection=skinnytasteContent?`\nSKINNYTASTE (use exclusively):\n${skinnytasteContent.slice(0,2000)}\n`:`\nUse skinnytaste.com style: low cal, high protein, globally diverse.\n`;
const p=preferences;
const pf=(l:string,a?:string[])=>a?.length?`- ${l}: ONLY ${a.join(", ")}`:`- ${l}: any`;
const prefsSection=p?`\nFOOD PREFS:\n${p.dietary_restrictions?.length?`- Forbidden: ${p.dietary_restrictions.join(", ")}\n`:""}${pf("P",p.protein_preferences)}\n${pf("C",p.carb_preferences)}\n${pf("F",p.fat_preferences)}\n${p.disliked_foods?`- Disliked: ${p.disliked_foods}\n`:""}${p.cooking_level?`- Level: ${p.cooking_level}\n`:""}Replace forbidden.\n`:"";
const calMin=userGoals.daily_calories-100,calMax=userGoals.daily_calories+10;
const protMin=userGoals.daily_protein-10,protMax=userGoals.daily_protein+10;
return `Nutritionist. Calorie-deficit meal plan.
TARGETS: Cal ${calMin}–${calMax} | P ${protMin}–${protMax}g | C ${userGoals.daily_carbs-10}–${userGoals.daily_carbs+10}g | F ${userGoals.daily_fats-10}–${userGoals.daily_fats+10}g. Priority: cal→P→C→F. NEVER sacrifice protein.
${prefsSection}${recipeSection}${skinnytasteSection}
serving_description=cooking method only. Caloric toppings=separate items. serving_unit: g/ml/slice/unit. brand=null whole foods; packaged: yogurt→"Chobani Zero Sugar", bars→"Quest", pasta→"Banza".
BANNED: scrambled eggs, oatmeal+berries, avocado toast, grilled chicken salad, tuna salad, baked salmon, protein shake.
USE: B: shakshuka, Korean egg toast, masala omelette. L: bibimbap, pad thai, falafel wrap. D: miso cod, lamb tagine, katsu curry. S: edamame, hummus+pita.
No same cuisine twice/day. Rotate proteins.
OUTPUT — valid JSON only, no fences:
{"ready_to_save":true,"summary":"","plan":{"name":"","description":"","meals":[{"name":"","meal_type":"breakfast|lunch|dinner|snack","time":"","calories":0,"protein":0,"carbs":0,"fat":0,"items":[{"name":"","brand":null,"serving_size":100,"serving_unit":"g","serving_description":"","calories":0,"protein":0,"carbs":0,"fat":0}]}],"daily_totals":{"calories":0,"protein":0,"carbs":0,"fat":0}}}`;
}
async function fetchSkinnytasteInspiration(_userGoals:any,preferences:UserPreferences|null):Promise<string>{
try{
const ST='https://www.skinnytaste.com/recipes/';
let cats=[ST+'dinner-recipes/',ST+'lunch-recipes/',ST+'breakfast-recipes/',ST+'chicken-recipes/',ST+'fish-recipes/',ST+'vegetarian-recipes/',ST+'meal-prep/',ST+'high-protein-recipes/'];
const isVeg=preferences?.dietary_restrictions?.includes('vegetarian')||preferences?.dietary_restrictions?.includes('vegan');
if(isVeg)cats=cats.filter(u=>u.includes('vegetarian')||u.includes('breakfast')||u.includes('lunch'));
const selected=cats.sort(()=>Math.random()-0.5).slice(0,2);
const results:string[]=[];
for(const url of selected){
try{
const res=await fetch(`https://r.jina.ai/${url}`,{headers:{'Accept':'text/plain','X-Return-Format':'text','User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(15000)});
if(!res.ok){console.log('[MealPlan] Jina',res.status,url);continue;}
const text=await res.text();
console.log('[MealPlan] Jina ok',url,text.length);
results.push(text.slice(0,5000));
}catch(err){console.log('[MealPlan] Jina err',url,err);}
}
if(results.length===0)return '';
return `SKINNYTASTE LIVE:\n\n`+results.join('\n\n---\n\n');
}catch(_err){console.log('[MealPlan] fetchSkinnytaste failed');return '';}
}
function parseMealPlanResponse(content:string):{message:string;planData:any|null;readyToSave:boolean;summary:string|null}{
const ok=(p:any)=>p.ready_to_save===true&&p.plan?{message:p.summary||"Your meal plan is ready!",planData:p.plan,readyToSave:true,summary:p.summary||null}:null;
const jbm=content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
const candidate=jbm?jbm[1].trim():content.trim();
for(const a of[candidate,content.trim()]){try{const r=ok(JSON.parse(a));if(r)return r;}catch(_){}}
const jom=content.match(/\{[\s\S]*"ready_to_save"[\s\S]*\}/);
if(jom){try{const r=ok(JSON.parse(jom[0]));if(r)return r;}catch(_){}}
console.error("[MealPlan] parseMealPlanResponse: all parse attempts failed. Raw content (first 500 chars):",String(content).slice(0,500));
return{message:content,planData:null,readyToSave:false,summary:null};
}
const JSON_HEADERS={...corsHeaders,"Content-Type":"application/json"};
function jsonResp(body:any,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}
Deno.serve(async(req)=>{
if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
const requestId=`req-${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
console.log("[MealPlan] New request:",requestId);
try{
if(req.method!=="POST")return jsonResp({error:"Method Not Allowed"},405);
if(!OPENROUTER_API_KEY)return jsonResp({error:"No OPENROUTER_API_KEY"},500);
const auth=req.headers.get("Authorization")||"";
if(!auth)return jsonResp({error:"Unauthorized"},401);
const token=auth.replace("Bearer ","");
const{data:user,error:authError}=await supabase.auth.getUser(token);
if(authError||!user?.user)return jsonResp({error:"Unauthorized",detail:authError?.message||"Invalid token"},401);
console.log("[MealPlan] User authenticated:",user.user.id);
let body:any;
try{body=await req.json();}catch(e){return jsonResp({error:"Invalid JSON"},400);}
const messages:Array<{role:string;content:string}>=body.messages||[];
const userGoals=body.userGoals||{daily_calories:2000,daily_protein:150,daily_carbs:200,daily_fats:65};
const userPreferences:UserPreferences|null=body.userPreferences||null;
if(!messages||messages.length===0)return jsonResp({error:"messages required"},400);
const isFirstMessage=messages.length===1;
const[recipePool,skinnytasteContent]=isFirstMessage?await Promise.all([Promise.resolve([]),fetchSkinnytasteInspiration(userGoals,userPreferences)]):[[],''];
console.log('[MealPlan] pool:',recipePool.length,'st:',skinnytasteContent.length);
const systemPrompt=buildSystemPrompt(userGoals,recipePool,userPreferences,skinnytasteContent);
const apiMessages=[{role:"system",content:systemPrompt},...messages.map((msg:any)=>({role:msg.role,content:msg.content}))];
console.log("[MealPlan] Calling OpenRouter with",apiMessages.length,"messages");
const started=performance.now();
let chatRes;
try{
chatRes=await fetch(`${OPENROUTER_BASE_URL}/chat/completions`,{method:"POST",headers:{"Authorization":`Bearer ${OPENROUTER_API_KEY}`,"Content-Type":"application/json","HTTP-Referer":SUPABASE_URL!,"X-Title":"Macro Goal Meal Planner"},body:JSON.stringify({model:DEFAULT_MODEL,messages:apiMessages,temperature:0.95,max_tokens:4000})});
}catch(fetchError:any){return jsonResp({error:"Network Error",detail:fetchError.message,request_id:requestId},502);}
if(!chatRes.ok){
const errorText=await chatRes.text();let errorDetail=errorText;
try{const ej=JSON.parse(errorText);errorDetail=ej.error?.message||ej.message||errorText;}catch(_){}
return jsonResp({error:"OpenRouter Error",detail:errorDetail,status_code:chatRes.status,request_id:requestId},502);
}
let jsonR:any;
try{jsonR=await chatRes.json();if(jsonR?.choices?.[0]?.finish_reason==="length")console.error("[MealPlan] output truncated");}
catch(e){return jsonResp({error:"Invalid Response"},502);}
const rawMessage:string=jsonR?.choices?.[0]?.message?.content??"";
if(!rawMessage)return jsonResp({error:"Empty Response"},502);
const duration_ms=Math.round(performance.now()-started);
console.log("[MealPlan] Response received in",duration_ms,"ms");
const{message,planData,readyToSave,summary}=parseMealPlanResponse(rawMessage);
if(planData){try{await recalculateAndAdjust(planData,userGoals);}catch(adjustErr:any){console.error("[MealPlan] recalculateAndAdjust failed:",adjustErr?.message||adjustErr);}}
return jsonResp({message,planData,readyToSave,summary,duration_ms});
}catch(e:any){
console.error("[MealPlan] Unhandled error:",e.message);
return jsonResp({error:"Internal Server Error",detail:String(e.message||e),request_id:requestId},500);
}
});

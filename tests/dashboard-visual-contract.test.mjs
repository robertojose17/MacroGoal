import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../components/'+name,import.meta.url),'utf8');
const goal=read('GoalWeightCard.tsx'),observed=read('ObservedActivityCard.tsx'),chart=read('ProgressCard.tsx'),info=read('DashboardStatInfo.tsx');
test('Goal card retains observed start/goal and missing values, not profile fallback or fabricated on-track/ETA',()=>{
 assert.match(goal,/start=d\?\.startWeightKg,current=d\?\.currentWeightKg,goal=d\?\.goalWeightKg/);assert.match(goal,/v==null\|\|!unit\?'--'/);assert.doesNotMatch(goal,/ON TRACK|On track|new Date\(/);assert.match(goal,/styles\.estDate,\{color:muted\}\]}>--/);
 const body=goal.slice(goal.indexOf(' return <View'));assert.doesNotMatch(body,/Last recorded|No weight was recorded|No verified projection|Start → Goal/);assert.match(goal,/currentWeightDate/);assert.match(goal,/explanation=\{details\}/);
});
test('Compact trend and burn keep limitations and real coverage behind information controls',()=>{
 assert.match(observed,/trend\?\.status==='estimated'/);assert.match(observed,/status==='estimated'&&estimate\?\.status==='estimated'/);assert.match(observed,/automaticBurnExplanation/);assert.match(observed,/sensitivityKcal\.low/);assert.match(observed,/explanation=\{trendInfo\}/);assert.match(observed,/explanation=\{burnInfo\}/);
 const body=observed.slice(observed.indexOf(' return <View'));assert.doesNotMatch(body,/Not enough weigh-ins|Not a metabolic|coverage\.start|Model sensitivity/);assert.doesNotMatch(observed,/Log Weight|router\.push|\.rpc\(/);
});
test('Mini chart only plots supplied observations and a horizontal real goal',()=>{
 assert.match(chart,/const points=data\?\.points\?\?\[\],goal=data\?\.goalWeightKg/);assert.match(chart,/y1=\{y\(g\)\} y2=\{y\(g\)\}/);assert.match(chart,/mini\?w-right\+4:left-4/);assert.match(chart,/mini\?'#5B9AA8':'#F59E0B'/);assert.match(chart,/mini\?'#FA8860':'#F59E0B'/);assert.match(chart,/mini&&points\.length>1/);assert.match(chart,/!mini&&<Text/);
});
test('Information modal supports explicit/back/backdrop dismissal, large text scrolling and owner reset',()=>{
 assert.match(info,/onRequestClose=\{close\}/);assert.match(info,/style=\{styles\.backdrop\} onPress=\{close\}/);assert.match(info,/event\.stopPropagation\(\)/);assert.match(info,/<ScrollView>/);assert.match(info,/visible=openedForOwner===ownerId/);assert.match(info,/useEffect\(\(\)=>setOpenedForOwner\(null\),\[ownerId\]\)/);assert.match(info,/accessibilityLabel=\{es\?'Cerrar':'Close'\}/);assert.match(info,/width:44,height:44/);
 for(const source of [goal,observed])assert.match(source,/width<360\|\|fontScale>1\.2/);
});

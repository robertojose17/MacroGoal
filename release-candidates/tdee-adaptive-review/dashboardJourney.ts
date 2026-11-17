/** Canonical kg; observed check-ins only. Never substitutes profile.current_weight. */
export type DashboardJourney={version:'dashboard-journey-v1';journeyStartDate:string|null;startWeightKg:number|null;currentWeightKg:number|null;currentWeightDate:string|null;goalWeightKg:number|null;points:{date:string;kg:number}[];trend:{status:'estimated'|'insufficient';kgPerWeek:number|null;start:string|null;end:string|null;count:number}};
const DAY=86400000;
function day(value:unknown):number|null{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n/DAY:null;}
function weight(value:unknown):number|null{const n=typeof value==='number'?value:typeof value==='string'&&value.trim()!==''?Number(value):NaN;return Number.isFinite(n)&&n>0&&n<=1000?n:null;}
const median=(v:number[])=>{const a=[...v].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
export function deriveDashboardJourney(input:{journeyStartDate:unknown;today:string;goalWeightKg:unknown;checkIns:readonly {date:unknown;weight:unknown}[]}):DashboardJourney{
 const today=day(input.today);if(today===null)throw Error('dashboard_today_unverified');
 const start=day(input.journeyStartDate),startDate=start!==null&&start<=today?input.journeyStartDate as string:null;
 const perDate=new Map<string,number|null>();
 for(const row of input.checkIns){const d=day(row.date),kg=weight(row.weight);if(d===null||d>today||kg===null)continue;const date=row.date as string;if(perDate.has(date)&&perDate.get(date)!==kg)perDate.set(date,null);else if(!perDate.has(date))perDate.set(date,kg);}
 const all=[...perDate].filter(([,kg])=>kg!==null).map(([date,kg])=>({date,kg:kg!})).sort((a,b)=>a.date.localeCompare(b.date));
 const last=all.at(-1),points=startDate?all.filter(p=>p.date>=startDate):all;
 const recent=points.filter(p=>day(p.date)!>=today-28),first=recent[0],end=recent.at(-1);
 const trend:DashboardJourney['trend']={status:'insufficient',kgPerWeek:null,start:first?.date??null,end:end?.date??null,count:recent.length};
 if(first&&end&&recent.length>=8&&day(end.date)!-day(first.date)!>=14&&today-day(end.date)!<=7){
  const midpoint=(day(first.date)!+day(end.date)!)/2;
  const distributed=recent.filter(p=>day(p.date)!<=midpoint).length>=2&&recent.filter(p=>day(p.date)!>midpoint).length>=2&&recent.every((p,i)=>i===0||day(p.date)!-day(recent[i-1].date)!<=7);
  if(distributed){const slopes:number[]=[];for(let i=0;i<recent.length;i++)for(let j=i+1;j<recent.length;j++){const gap=day(recent[j].date)!-day(recent[i].date)!;if(gap>=7)slopes.push((recent[j].kg-recent[i].kg)/gap);}if(slopes.length){const rate=median(slopes)*7;if(Number.isFinite(rate)){trend.status='estimated';trend.kgPerWeek=rate;}}}
 }
 return {version:'dashboard-journey-v1',journeyStartDate:startDate,startWeightKg:startDate?perDate.get(startDate)??null:null,currentWeightKg:last?.kg??null,currentWeightDate:last?.date??null,goalWeightKg:weight(input.goalWeightKg),points,trend};
}
export function parseDashboardJourney(raw:unknown):DashboardJourney|null{
 if(!raw||typeof raw!=='object')return null;const r=raw as DashboardJourney;if(r.version!=='dashboard-journey-v1'||!Array.isArray(r.points)||!r.trend)return null;
 const nullableWeight=(x:unknown)=>x===null||typeof x==='number'&&weight(x)===x;
 if(![r.startWeightKg,r.currentWeightKg,r.goalWeightKg].every(nullableWeight)||!(r.journeyStartDate===null||day(r.journeyStartDate)!==null)||!(r.currentWeightDate===null||day(r.currentWeightDate)!==null))return null;
 if((r.currentWeightKg===null)!==(r.currentWeightDate===null)||r.startWeightKg!==null&&r.journeyStartDate===null)return null;
 if(r.points.some((p,i)=>!p||day(p.date)===null||typeof p.kg!=='number'||weight(p.kg)!==p.kg||i>0&&p.date<=r.points[i-1].date))return null;
 const t=r.trend;if(!['estimated','insufficient'].includes(t.status)||!Number.isSafeInteger(t.count)||t.count<0||!(t.start===null||day(t.start)!==null)||!(t.end===null||day(t.end)!==null))return null;
 if(t.status==='estimated'&&(typeof t.kgPerWeek!=='number'||!Number.isFinite(t.kgPerWeek)||t.count<8||!t.start||!t.end||day(t.end)!-day(t.start)!<14))return null;
 if(t.status==='insufficient'&&t.kgPerWeek!==null)return null;return structuredClone(r);
}

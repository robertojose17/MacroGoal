import {deriveDashboardJourney,parseDashboardJourney,type DashboardJourney} from '../release-candidates/tdee-adaptive-review/dashboardJourney';
const DAY=86400000;
export type DashboardArrivalEstimate={status:'estimated';date:string;daysFromLatest:number}|{status:'reached'}|{status:'unavailable';reason:'invalid'|'insufficient'|'direction'|'past'|'horizon'};
const calendar=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:NaN;};
export function localCalendarDate(now:Date):string{return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
/** Conditional display-only extrapolation. Does not populate server projection or alter targets. */
export function dashboardArrivalEstimate(input:DashboardJourney|null|undefined,today:string):DashboardArrivalEstimate{
 const hold=(reason:'invalid'|'insufficient'|'direction'|'past'|'horizon'):DashboardArrivalEstimate=>({status:'unavailable',reason});
 const d=parseDashboardJourney(input),now=calendar(today);if(!d||!Number.isFinite(now))return hold('invalid');
 const last=d.points.at(-1);if(!last||d.currentWeightKg===null||d.goalWeightKg===null||d.currentWeightDate!==last.date||d.currentWeightKg!==last.kg||d.points.some(p=>calendar(p.date)>now))return hold('invalid');
 if(now-calendar(last.date)>7*DAY)return hold('insufficient');
 if(d.currentWeightKg===d.goalWeightKg)return {status:'reached'};
 const verifiedStart=d.startWeightKg!==null&&d.journeyStartDate!==null&&d.points.some(p=>p.date===d.journeyStartDate&&p.kg===d.startWeightKg);
 if(verifiedStart&&((d.goalWeightKg<d.startWeightKg!&&d.currentWeightKg<d.goalWeightKg)||(d.goalWeightKg>d.startWeightKg!&&d.currentWeightKg>d.goalWeightKg)))return {status:'reached'};
 // Recompute the existing robust observation gates at today's calendar date; never trust a stale cached rate.
 const checked=deriveDashboardJourney({journeyStartDate:d.journeyStartDate,today,goalWeightKg:d.goalWeightKg,checkIns:d.points.map(p=>({date:p.date,weight:p.kg}))});
 const rate=checked.trend.kgPerWeek;if(checked.trend.status!=='estimated'||rate===null||!Number.isFinite(rate))return hold('insufficient');
 const delta=d.goalWeightKg-d.currentWeightKg;if(rate===0||delta*rate<=0)return hold('direction');
 // Ignore sub-millisecond floating-point noise at whole-day boundaries, not actual fractional days.
 const days=Math.max(1,Math.ceil(delta/rate*7-1e-9));if(!Number.isSafeInteger(days)||days<1||days>365)return hold('horizon');
 const arrival=calendar(last.date)+days*DAY;if(arrival<now)return hold('past');
 if(arrival-now>365*DAY)return hold('horizon');
 return {status:'estimated',date:new Date(arrival).toISOString().slice(0,10),daysFromLatest:days};
}

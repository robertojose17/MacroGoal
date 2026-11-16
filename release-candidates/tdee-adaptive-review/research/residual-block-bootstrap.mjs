/** UNVALIDATED RESEARCH ONLY. No operational review, policy, approval or RPC output. */
export const RESEARCH_ONLY=Object.freeze({status:'UNVALIDATED',operationalUse:false});
export function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const median=xs=>{const s=[...xs].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
export function medianPairSlope(rows){const slopes=[];for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const gap=rows[j].day-rows[i].day;if(gap>=7)slopes.push((rows[j].weight-rows[i].weight)/gap);}return slopes.length?median(slopes):null;}
const quantile=(a,p)=>{const x=(a.length-1)*p,lo=Math.floor(x),hi=Math.ceil(x);return a[lo]+(a[hi]-a[lo])*(x-lo);};
/** Fixed 14-calendar-day window, explicit day offsets 0..13. No interpolation.
 * Each target block samples only contiguous donor calendar blocks that contain
 * every residual required by the target's observed mask. Unobserved target days
 * stay unobserved. Conditioning on compatible masks is experimental and can
 * leave very few donors, especially for sparse/nonrandom observation patterns.
 */
export function estimateResearchInterval(rows,{seed=1,blockDays=3,replicates=199,nominal=.95}={}){
 if(!Array.isArray(rows)||rows.length<8||rows.length>14||!Number.isInteger(blockDays)||blockDays<1||blockDays>7||!Number.isInteger(replicates)||replicates<20||!Number.isFinite(nominal)||nominal<=0||nominal>=1)return {status:'unavailable',reason:'invalid_research_input'};
 const sorted=[...rows].sort((a,b)=>a.day-b.day),seen=new Set();
 for(const r of sorted){if(!Number.isInteger(r.day)||r.day<0||r.day>13||!Number.isFinite(r.weight)||r.weight<=0||seen.has(r.day))return {status:'unavailable',reason:'invalid_research_input'};seen.add(r.day);}
 const slope=medianPairSlope(sorted);if(slope===null)return {status:'unavailable',reason:'insufficient_pair_span'};
 const intercept=median(sorted.map(r=>r.weight-slope*r.day)),residual=new Map(sorted.map(r=>[r.day,r.weight-intercept-slope*r.day]));
 const blocks=[];
 for(let target=0;target<14;target+=blockDays){const length=Math.min(blockDays,14-target),offsets=[];for(let k=0;k<length;k++)if(residual.has(target+k))offsets.push(k);if(!offsets.length)continue;
 const donors=[];for(let start=0;start<=14-length;start++)if(offsets.every(k=>residual.has(start+k)))donors.push(start);
 if(!donors.length)return {status:'unavailable',reason:'no_calendar_compatible_donors'};
 blocks.push({target,offsets,donors});}
 const rng=random(seed),estimates=[];
 for(let b=0;b<replicates;b++){const sample=[];for(const block of blocks){const start=block.donors[Math.floor(rng()*block.donors.length)];for(const k of block.offsets){const day=block.target+k;sample.push({day,weight:intercept+slope*day+residual.get(start+k)});}}sample.sort((a,b)=>a.day-b.day);estimates.push(medianPairSlope(sample)*7);}
 estimates.sort((a,b)=>a-b);const alpha=(1-nominal)/2,point=slope*7;
 return {status:'research_estimate',researchOnly:true,validated:false,method:'experimental-calendar-mask-residual-block-basic-v1',pointKgPerWeek:point,
 lowerKgPerWeek:2*point-quantile(estimates,1-alpha),upperKgPerWeek:2*point-quantile(estimates,alpha),nominalLevel:nominal,
 observedDays:sorted.map(r=>r.day),blockDays,replicates,seed,minCompatibleDonors:Math.min(...blocks.map(b=>b.donors.length)),bootstrapDistinctSlopes:new Set(estimates).size};
}

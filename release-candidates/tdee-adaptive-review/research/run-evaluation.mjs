/** Synthetic performance experiment; never creates an operational review. */
import {random,estimateResearchInterval} from './residual-block-bootstrap.mjs';import {writeFileSync} from 'node:fs';
const trajectories=60,dailyChecks=14,replicates=199,nominal=.95,blockDays=3;
const scenarios=[
 {name:'iid_dense_null',rho:0,sigma:.35,rate:0,sparse:false},
 {name:'iid_sparse_null',rho:0,sigma:.35,rate:0,sparse:true},
 {name:'ar08_dense_null',rho:.8,sigma:.35,rate:0,sparse:false},
 {name:'ar08_sparse_null',rho:.8,sigma:.35,rate:0,sparse:true},
 {name:'outliers_sparse_null',rho:.3,sigma:.35,rate:0,sparse:true,outliers:true},
 {name:'persistent_fluid_step_sparse_null',rho:.5,sigma:.25,rate:0,sparse:true,shift:true},
 {name:'ar06_sparse_true_loss',rho:.6,sigma:.35,rate:-.35,sparse:true}
];
function normal(rng){return Math.sqrt(-2*Math.log(Math.max(rng(),Number.EPSILON)))*Math.cos(2*Math.PI*rng());}
const results=[];
for(let si=0;si<scenarios.length;si++){const s=scenarios[si];let windows=0,covered=0,excludeZero=0,wrongSign=0,widthSum=0,pointBiasSum=0,anyFalse=0,anyWrong=0,firstCovered=0,lowDonor=0,degenerate=0;
 for(let trial=0;trial<trajectories;trial++){const seed=170000+si*10000+trial,rng=random(seed),series=[];let noise=normal(rng)*s.sigma,hasFalse=false,hasWrong=false;
 for(let day=0;day<14+dailyChecks-1;day++){noise=s.rho*noise+Math.sqrt(1-s.rho*s.rho)*s.sigma*normal(rng);const outlier=s.outliers&&rng()<.08?(rng()<.5?-1:1)*1.5:0,fluid=s.shift&&day>=17?1:0;
 series.push({day,weight:80+s.rate*day/7+noise+outlier+fluid,observed:!s.sparse||![1,3,5].includes(day%7)});}
 for(let check=0;check<dailyChecks;check++){const rows=series.slice(check,check+14).filter(r=>r.observed).map(r=>({day:r.day-check,weight:r.weight}));const e=estimateResearchInterval(rows,{seed:seed*100+check,blockDays,replicates,nominal});if(e.status!=='research_estimate')throw Error('unexpected unavailable '+s.name);
 const cover=e.lowerKgPerWeek<=s.rate&&s.rate<=e.upperKgPerWeek,excludes=e.lowerKgPerWeek>0||e.upperKgPerWeek<0,wrong=s.rate<0?e.lowerKgPerWeek>0:s.rate>0?e.upperKgPerWeek<0:excludes;
 windows++;covered+=cover;excludeZero+=excludes;wrongSign+=wrong;widthSum+=e.upperKgPerWeek-e.lowerKgPerWeek;pointBiasSum+=e.pointKgPerWeek-s.rate;lowDonor+=e.minCompatibleDonors<3;degenerate+=e.bootstrapDistinctSlopes<2;if(check===0)firstCovered+=cover;
 hasFalse ||= s.rate===0&&excludes;hasWrong ||= wrong;}
 anyFalse+=hasFalse;anyWrong+=hasWrong;}
 results.push({...s,trajectories,windows,intervalCoverage:covered/windows,firstWindowCoverage:firstCovered/trajectories,meanWidthKgPerWeek:widthSum/windows,meanPointBiasKgPerWeek:pointBiasSum/windows,
 perWindowExcludesZero:excludeZero/windows,perWindowFalseDirection:wrongSign/windows,trajectoryAnyFalseDirection:anyWrong/trajectories,
 nullTrajectoryAnyFalseSignal:s.rate===0?anyFalse/trajectories:null,lowCompatibleDonorWindows:lowDonor,degenerateBootstrapWindows:degenerate});}
const report={status:'UNVALIDATED_RESEARCH_ONLY',operationalUse:false,nominalLevel:nominal,blockDays,replicates,trajectoriesPerScenario:trajectories,dailyChecksPerTrajectory:dailyChecks,seedScheme:'170000+scenarioIndex*10000+trial; bootstrap=trajectorySeed*100+check',
 definitions:{latentRate:'Fixed known tissue trend; correlated noise/outliers/persistent fluid step are measurement/nuisance components, not latent tissue change.',coverage:'Fraction of per-window intervals containing known latent kg/week. Overlapping windows are dependent.',falseDirection:'At true zero: any interval excluding zero; at negative true trend: interval wholly above zero.',repeatedDaily:'At least one false-direction interval in 14 overlapping daily checks; diagnostic only, no calorie action, tolerance/cadence policy, or recommendation simulated.'},results};
writeFileSync(new URL('./evaluation-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(results.map(r=>({scenario:r.name,coverage:r.intervalCoverage,falseDirection:r.perWindowFalseDirection,anyDailyFalse:r.trajectoryAnyFalseDirection,meanWidth:r.meanWidthKgPerWeek,lowDonors:r.lowCompatibleDonorWindows})),null,2));

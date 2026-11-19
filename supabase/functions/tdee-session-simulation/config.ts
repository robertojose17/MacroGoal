import type {Config} from './handler.ts';
import {deploymentActivation} from './deploymentActivation.ts';
/** An explicitly supplied environment value overrides deployment config, even if invalid. */
export function readSimulationConfig(raw:string|undefined,fallback:Config|null=deploymentActivation):Config|null{
 if(raw===undefined)return fallback;
 try{const value=JSON.parse(raw);return value&&typeof value==='object'&&!Array.isArray(value)?value as Config:null;}catch{return null;}
}

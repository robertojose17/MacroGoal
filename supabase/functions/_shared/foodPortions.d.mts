export interface VerifiedPortion {key:string;amount:number;grams:number;description:string;sourcePortionId:string|null}
export interface PortionEvidence {version:1;provider:'usda';fdcId:string;foodDescription:string;dataType:string;retrievedAt:string;portions:VerifiedPortion[]}
export function captureUsdaPortions(food:unknown,fdcId:string|number,retrievedAt:string):PortionEvidence|null;
export function readUsdaPortions(envelope:unknown,fdcId:string|number):VerifiedPortion[];
export function defaultUsdaPortion(envelope:unknown,fdcId:string|number):VerifiedPortion;
export function portionGrams(portion:VerifiedPortion,quantity:number):number|null;
export function nutritionForGrams(per100:Record<string,number|null|undefined>,grams:number):Record<string,number|null>|null;
export function applyUsdaPortion<T extends {_usda_fdc_id?:string;nutriments?:object}>(product:T,envelope:unknown):T;

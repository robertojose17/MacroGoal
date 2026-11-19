import React from 'react';
import {Text} from 'react-native';
/** Pure shared presentation. No session, persistence, controller or transport. */
type Targets={calories:number;proteinG:number;carbsG:number;fatsG:number;fiberG:number};
export function TdeeTargetComparison({current,target,text,es}:{current:Targets;target:Targets;text:string;es:boolean}){
 const label=(en:string,sp:string)=>es?sp:en;
 return <>{(['calories','proteinG','carbsG','fatsG','fiberG'] as const).map((key,index)=><Text key={key} style={{color:text}}>{[label('Calories','Calorías'),label('Protein','Proteína'),label('Carbs','Carbohidratos'),label('Fat','Grasa'),label('Fiber','Fibra')][index]}: {current[key]} → {target[key]} {index===0?'kcal':'g'}</Text>)}</>;
}

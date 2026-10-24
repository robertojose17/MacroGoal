import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TextInput,Pressable,StyleSheet} from 'react-native';
import FoodItemRow from './FoodItemRow';
import {useColorScheme} from '@/hooks/useColorScheme';
import {previewComponentEdits,type MealComponent,type ComponentEdit} from '@/utils/coachMealComponents';

export default function CoachIngredientEditor({source,edits,additions,disabled,es,onChange,search}:{
 source:MealComponent[];edits:ComponentEdit[];additions:MealComponent[];disabled:boolean;es:boolean;
 onChange(edits:ComponentEdit[],additions:MealComponent[]):void;search(query:string):Promise<MealComponent[]>;
}){
 const isDark=(useColorScheme() as string)==='dark',[editing,setEditing]=useState<string|null>(null),[quantity,setQuantity]=useState('');
 const [adding,setAdding]=useState(false),[query,setQuery]=useState(''),[results,setResults]=useState<MealComponent[]>([]),[error,setError]=useState(''),[searching,setSearching]=useState(false);
 const alive=useRef(true),epoch=useRef(0);useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;};},[]);
 useEffect(()=>{if(disabled){epoch.current++;setSearching(false);setResults([]);}},[disabled]);
 const say=(en:string,sp:string)=>es?sp:en;
 const button=(label:string,fn:()=>void,off=false)=><Pressable accessibilityRole="button" disabled={disabled||off} onPress={fn} style={s.button}><Text style={{color:isDark?'#D5E9DC':'#27614D'}}>{label}</Text></Pressable>;
 const rows=[...(previewComponentEdits(source,edits)?.components??[]),...additions];
 const remove=(id:string)=>{if(disabled)return;onChange(edits.filter(e=>e.component_id!==id),additions.filter(c=>c.id!==id));setEditing(null);};
 const apply=()=>{const n=/^\d+(?:[.,]\d+)?$/.test(quantity)?Number(quantity.replace(',','.')):NaN;if(!Number.isFinite(n)||n<=0||n>10000){setError(say('Enter a quantity above zero.','Introduce una cantidad mayor que cero.'));return;}const added=additions.find(c=>c.id===editing);if(added&&n>5000){setError(say('Use up to 5000 g.','Usa hasta 5000 g.'));return;}
  if(added){const scaled=previewComponentEdits([added],[{component_id:added.id,quantity:n}]);if(!scaled){setError(say('Check this quantity.','Revisa esta cantidad.'));return;}onChange(edits,additions.map(c=>c.id===added.id?scaled.components[0]:c));}
  else onChange(edits.map(e=>e.component_id===editing?{...e,quantity:n}:e),additions);setEditing(null);setError('');};
 async function find(){const token=++epoch.current;setSearching(true);setError('');try{const found=await search(query);if(alive.current&&token===epoch.current){setResults(found);if(!found.length)setError(say('No matching catalog ingredients. Try another name.','No hay ingredientes coincidentes. Prueba otro nombre.'));}}catch{if(alive.current&&token===epoch.current)setError(say('Ingredients could not be loaded. Try again.','No se pudieron cargar los ingredientes. Inténtalo de nuevo.'));}finally{if(alive.current&&token===epoch.current)setSearching(false);}}
 return <View style={s.container}><Text style={{color:isDark?'#EEE':'#263F34',fontWeight:'600'}}>{say('Ingredients','Ingredientes')}</Text>
  {rows.map(c=><View key={c.id}><FoodItemRow isDark={isDark} name={c.name} calories={c.nutrition.calories} protein={c.nutrition.protein} carbs={c.nutrition.carbs} fats={c.nutrition.fats} servingText={`${c.quantity} ${c.unit}`} onPress={()=>{if(!disabled){setEditing(c.id);setQuantity(String(c.quantity));setError('');}}} onDelete={disabled?undefined:()=>remove(c.id)}/>{editing===c.id&&<View><TextInput accessibilityLabel={say('Ingredient quantity','Cantidad del ingrediente')} value={quantity} editable={!disabled} keyboardType="decimal-pad" onChangeText={setQuantity} style={[s.input,{color:isDark?'#EEE':'#263F34'}]}/>{button(say('Apply quantity','Aplicar cantidad'),apply)}{button(say('Remove ingredient','Quitar ingrediente'),()=>remove(c.id))}{button(say('Cancel','Cancelar'),()=>setEditing(null))}</View>}</View>)}
  {!rows.length&&<Text accessibilityRole="alert">{say('Add an ingredient before reviewing this meal.','Añade un ingrediente antes de revisar esta comida.')}</Text>}
  {button(say('Add ingredient','Añadir ingrediente'),()=>{setAdding(v=>!v);setError('');})}
  {adding&&<View><TextInput accessibilityLabel={say('Search ingredients','Buscar ingredientes')} value={query} editable={!disabled&&!searching} onChangeText={setQuery} onSubmitEditing={()=>{if(!disabled&&!searching)void find();}} style={[s.input,{color:isDark?'#EEE':'#263F34'}]}/>{button(searching?'•••':say('Search','Buscar'),()=>{void find();},searching||query.trim().length<2)}{results.map(c=><View key={c.id}>{button(c.name,()=>{if(additions.length>=12||additions.some(a=>a.id===c.id))return;onChange(edits,[...additions,c]);setResults([]);setAdding(false);setEditing(c.id);setQuantity(String(c.quantity));},additions.some(a=>a.id===c.id)||additions.length>=12)}</View>)}</View>}
  {!!error&&<Text accessibilityRole="alert">{error}</Text>}
 </View>;
}
const s=StyleSheet.create({container:{gap:8},button:{minHeight:44,paddingVertical:12,paddingHorizontal:8},input:{minHeight:44,borderWidth:1,borderColor:'#CCD9D0',borderRadius:8,padding:10}});

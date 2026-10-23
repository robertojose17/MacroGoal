import {coachCatalogPreview,type CatalogConsent} from '@/utils/coachCatalogIdentity';
import {constraintLines} from '@/utils/coachDietaryConstraints';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { editMealNutrition, NUTRIENTS, needsEstimateAcknowledgement, hasLoggableNutrition, type MealReviewSession, type Nutrient, type PreparedMealEntry } from '@/utils/coachMealReview';

// Content inside the existing recipe detail screen, not a new destination.
// All network/write behavior belongs to the explicitly supplied session adapter.
export default function CoachMealReview({ session, onCancel }: { session: MealReviewSession; onCancel(): void }) {
  const { i18n } = useTranslation(); const es = i18n.language.startsWith('es');
  const say = (en: string, sp: string) => es ? sp : en;
  const [valid, setValid] = useState(false), [busy, setBusy] = useState(false);
  const [portion, setPortion] = useState(String(session.initialEdit?.multiplier ?? 1));
  const [edits, setEdits] = useState<Partial<Record<Nutrient, string>>>(() => Object.fromEntries((session.initialEdit?.changed ?? []).map(k => [k, session.initialEdit?.values[k] == null ? '' : String(session.initialEdit.values[k])])));
  const [editing, setEditing] = useState(false), [ack, setAck] = useState(session.initialEdit?.estimateAcknowledged === true);
  const [ingredientAck, setIngredientAck] = useState(session.initialEdit?.ingredientAcknowledged === true);
  const [prepared, setPrepared] = useState<PreparedMealEntry | null>(null);
  const [status, setStatus] = useState<'edit' | 'error' | 'complete' | 'review' | 'blocked'>('edit');
  const alive = useRef(true), claim = useRef(false), generation = useRef(0);
  const source = session.context.option;
  const [mass,setMass]=useState(''),[massBasis,setMassBasis]=useState(''),[catalogName,setCatalogName]=useState(source.name);
  const [massAck,setMassAck]=useState(false),[catalogAck,setCatalogAck]=useState(false);
  const massValue=/^\d+(?:[.,]\d+)?$/.test(mass)?Number(mass.replace(',','.')):NaN;
  const massAuthority=prepared?.physicalPortion?.authority==='source_reported'&&prepared.physicalPortion.total_grams===massValue?'source_reported':'estimated';
  const catalogConsent:CatalogConsent={grams:massValue,massAuthority,massBasis,name:catalogName,massAcknowledged:massAck,publicAcknowledged:catalogAck};
  let publicPreview:ReturnType<typeof coachCatalogPreview>|null=null;try{if(prepared)publicPreview=coachCatalogPreview(prepared,catalogConsent);}catch{}
  const resetCatalog=()=>{setMassAck(false);setCatalogAck(false);};

  const multiplier = /^\d+(?:[.,]\d+)?$/.test(portion) ? Number(portion.replace(',', '.')) : NaN;
  const edit = editMealNutrition(source, multiplier, edits);
  useEffect(() => {
    alive.current = true; const check = async () => { const ok = await session.valid(); if (alive.current) setValid(ok); };
    const stopWatching = session.watch(() => { generation.current++; if (alive.current) { setValid(false); setPrepared(null); } });
    void check(); const timer = setInterval(() => { void check(); }, 15000);
    return () => { alive.current = false; generation.current++; clearInterval(timer); stopWatching(); };
  }, [session]);
  const change = () => { session.clearPrepared(); setPrepared(null); setAck(false); setIngredientAck(false); setStatus('edit'); setMass('');setMassBasis('');resetCatalog(); generation.current++; };
  const cancel = () => { session.invalidate(); generation.current++; onCancel(); };
  async function prepare() {
    if (!edit || !valid || claim.current) return;
    claim.current = true; setBusy(true); const rev = generation.current;
    try { const result = await session.prepare({ ...edit, estimateAcknowledged: ack, ingredientAcknowledged: ingredientAck }); if (!alive.current || rev !== generation.current) return; setPrepared(result);setMass(result?.physicalPortion?.authority==='source_reported'?String(result.physicalPortion.total_grams):'');setMassBasis(result?.physicalPortion?.authority==='source_reported'?say('Source-reported whole portion','Porción completa publicada por la fuente'):'');resetCatalog(); setStatus(result ? 'edit' : 'error'); }
    finally { claim.current = false; if (alive.current) setBusy(false); }
  }
  async function add() {
    if (!prepared || !valid || claim.current) return;
    claim.current = true; setBusy(true);
    try {
      const result = await session.confirm(prepared, ack, session.catalogRequired?catalogConsent:undefined);
      if (!alive.current) return;
      setStatus(result.status === 'complete' ? 'complete' : result.status === 'review' ? 'review' : result.status === 'blocked' ? 'blocked' : 'error');
    } finally { claim.current = false; if (alive.current) setBusy(false); }
  }
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.button, disabled && { opacity: 0.45 }]}><Text style={s.buttonText}>{label}</Text></Pressable>;
  const authority = (value: string) => value === 'official' ? say('Official nutrition', 'Nutrición oficial') : value === 'publisher_reported' ? say('Nutrition reported by source', 'Nutrición publicada por la fuente') : value === 'user_edited' ? say('Your edited estimate', 'Tu estimación editada') : value === 'estimated' ? say('Estimated nutrition', 'Nutrición estimada') : say('Nutrition not yet known', 'Nutrición aún desconocida');
  const labels = es ? ['Calorías', 'Proteína', 'Carbohidratos', 'Grasas', 'Fibra'] : ['Calories', 'Protein', 'Carbohydrates', 'Fat', 'Fiber'];
  const mealLabel = (es ? { breakfast:'Desayuno',lunch:'Almuerzo',dinner:'Cena',snack:'Snack' } : { breakfast:'Breakfast',lunch:'Lunch',dinner:'Dinner',snack:'Snack' })[session.context.meal];
  const shown = prepared?.nutrition ?? edit?.values;
  return <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
    {button(say('Back to Coach', 'Volver al Coach'), cancel)}
    {!valid && status !== 'complete' ? <Text accessibilityRole="alert" style={s.body}>{say('Checking this meal’s access. If your account or day changed, choose it again in Coach.', 'Verificando el acceso a esta comida. Si cambiaste de cuenta o de día, elígela de nuevo en Coach.')}</Text> : <>
      <Text accessibilityRole="header" style={s.title}>{source.name}</Text>      {source.match&&<><Text style={s.body}>{say('Related option','Opción similar')}: {source.match.requestedFood}</Text>{source.match.differences.map((difference,i)=><Text key={i} style={s.muted}>{difference}</Text>)}</>}
        {source.kind==='general'&&<Text style={s.muted}>{say('General meal estimate — not a verified restaurant item.','Estimación general de comida; no es un plato verificado de un restaurante.')}</Text>}

      <Text style={s.body}>{mealLabel} · {session.context.date}</Text>
      <Text style={s.body}>{authority(prepared?.authority ?? (edit?.changed.length ? 'user_edited' : source.nutrition.authority))}</Text>
      <Text style={s.muted}>{source.provenance.label}{source.provenance.url ? ` · ${source.provenance.url}` : ''}</Text>
      {status === 'complete' ? <Text accessibilityRole="alert" style={s.body}>{say('Added to your diary.', 'Añadido a tu diario.')}</Text> : status === 'review' ? <Text accessibilityRole="alert" style={s.body}>{say('The save may have completed. Check your diary before trying to add this meal again.', 'Es posible que se haya guardado. Revisa tu diario antes de intentar añadir esta comida otra vez.')}</Text> : <>
        {!prepared && <>
          <Text style={s.body}>{say('Portion multiplier', 'Multiplicador de la porción')} · 1 × {source.nutrition.basis.label}</Text>
          <TextInput accessibilityLabel={say('Portion multiplier', 'Multiplicador de la porción')} keyboardType="decimal-pad" value={portion} editable={!busy} onChangeText={value => { change(); setPortion(value); setEdits({}); }} style={s.input} />
          {Object.keys(edits).length > 0 && <Text style={s.muted}>{say('Changing the portion resets your nutrient edits to the source values.', 'Cambiar la porción restablece los nutrientes a los valores de la fuente.')}</Text>}
        </>}
        {prepared && <>
          <Text style={s.body}>{session.catalogRequired?say('Original portion description: ','Descripción original de la porción: '):''}{prepared.portionLabel}</Text>
          {session.catalogRequired&&publicPreview&&<><Text style={s.body}>{massAck?say('Confirmed whole-meal weight: ','Peso confirmado de toda la comida: '):say('Entered whole-meal weight: ','Peso introducido de toda la comida: ')}{massValue} g{massAuthority==='estimated'?say(' (estimated)',' (estimado)'):''}</Text><Text style={s.muted}>{say('Meal nutrition totals stay the same. This weight is used to calculate nutrition per 100 g.','Los nutrientes totales de la comida no cambian. Este peso se usa para calcular los nutrientes por 100 g.')}</Text></>}
        </>}
        {NUTRIENTS.map((key,i) => <View key={key} style={s.nutrient}><Text style={s.body}>{labels[i]}{key === 'calories' ? ' (kcal)' : ' (g)'}</Text>{editing && !prepared ? <TextInput accessibilityLabel={labels[i]} keyboardType="decimal-pad" editable={!busy} style={s.valueInput} value={edits[key] ?? (shown?.[key] == null ? '' : String(Math.round(shown[key]! * 10) / 10))} placeholder={say('Unknown', 'Desconocido')} onChangeText={value => { change(); setEdits(values => ({ ...values, [key]: value })); }} /> : <Text style={s.body}>{shown?.[key] == null ? say('Unknown', 'Desconocido') : String(Math.round(shown[key]! * 10) / 10)}</Text>}</View>)}
        {source.dietaryConstraints&&constraintLines(source.dietaryConstraints,i18n.language.startsWith('es')).map(line=><Text key={line} style={s.muted}>{line}</Text>)}
        {(prepared?.assumptions ?? source.nutrition.assumptions).map((assumption,i) => <Text key={i} style={s.muted}>• {assumption}</Text>)}
        <Text style={s.muted}>{source.allergyStatus === 'contains_declared_allergen' ? say('The source lists an allergen you asked to avoid. Review before choosing this food.', 'La fuente indica un alérgeno que quieres evitar. Revísalo antes de elegir esta comida.') : say('Allergen information is not guaranteed. Confirm ingredients with the source or restaurant.', 'La información de alérgenos no está garantizada. Confirma los ingredientes con la fuente o el restaurante.')}</Text>
        {status === 'error' && <Text accessibilityRole="alert" style={s.body}>{say('The review could not be completed. No successful save has been confirmed.', 'No se pudo completar la revisión. No se ha confirmado que se haya guardado.')}</Text>}
        {status === 'blocked' && <Text accessibilityRole="alert" style={s.body}>{say('This confirmation is no longer valid. Return to Coach to review again.', 'Esta confirmación ya no es válida. Vuelve al Coach para revisar de nuevo.')}</Text>}
        {!edit && <Text accessibilityRole="alert" style={s.body}>{say('Enter a portion above zero, up to 20, and valid non-negative nutrition values. Blank means unknown.', 'Introduce una porción mayor que cero, hasta 20, y nutrientes válidos no negativos. Vacío significa desconocido.')}</Text>}
        {!prepared && (!['official','publisher_reported'].includes(source.nutrition.authority) || !!edit?.changed.length) && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ack, disabled: busy }} disabled={busy} onPress={() => setAck(value => !value)} style={s.checkbox}><Text style={s.body}>{ack ? '✓ ' : '○ '}{say('Use these labeled estimates for my review.', 'Usar estas estimaciones identificadas para mi revisión.')}</Text></Pressable>}
        {!prepared && source.allergyStatus !== 'unknown' && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ingredientAck, disabled: busy }} disabled={busy} onPress={() => setIngredientAck(value => !value)} style={s.checkbox}><Text style={s.body}>{ingredientAck ? '✓ ' : '○ '}{say('I have reviewed the ingredient and allergy information.', 'He revisado la información de ingredientes y alergias.')}</Text></Pressable>}
        {prepared ? <>
          {!hasLoggableNutrition(prepared) && <Text accessibilityRole="alert" style={s.body}>{say('Some nutrients are unknown. Edit them with values you can estimate before adding; unknown values will not be saved as zero.', 'Faltan nutrientes. Introduce valores que puedas estimar antes de añadir; los desconocidos no se guardarán como cero.')}</Text>}
          {needsEstimateAcknowledgement(prepared) && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ack, disabled: busy }} disabled={busy} onPress={() => setAck(value => !value)} style={s.checkbox}><Text style={s.body}>{ack ? '✓ ' : '○ '}{say('I understand these numbers are estimates or my edits.', 'Entiendo que estos números son estimaciones o mis ediciones.')}</Text></Pressable>}
          {session.catalogRequired&&<View style={s.details}>
            <Text style={s.body}>{say('Confirm the weight of this entire selected meal in grams. Component weights are not the total. If the source has no total, enter your estimate and explain its basis.','Confirma el peso en gramos de toda la comida seleccionada. El peso de un ingrediente no es el total. Si la fuente no tiene un total, introduce tu estimación y explica su base.')}</Text>
            <TextInput accessibilityLabel={say('Whole meal grams','Gramos de toda la comida')} value={mass} editable={!busy} keyboardType="decimal-pad" onChangeText={v=>{resetCatalog();setMass(v);}} style={s.input}/>
            <TextInput accessibilityLabel={say('Weight basis','Base del peso')} value={massBasis} editable={!busy} onChangeText={v=>{resetCatalog();setMassBasis(v);}} style={s.input}/>
            <Text style={s.body}>{say('Public food name — food only, no personal or health details','Nombre público del alimento: sin datos personales ni de salud')}</Text>
            <TextInput accessibilityLabel={say('Public food name','Nombre público del alimento')} value={catalogName} editable={!busy} onChangeText={v=>{resetCatalog();setCatalogName(v);}} style={s.input}/>
            <Text style={s.muted}>{say('Saving creates a public custom food. Other people can read its name, nutrition per 100 g, serving basis and your owner ID. Your chat, portion narrative, sources and health context are excluded. The 100 g is a calculation basis, not the amount eaten.','Guardar crea un alimento personalizado público. Otras personas pueden leer su nombre, nutrientes por 100 g, base de porción y tu identificador de propietario. Se excluyen el chat, la descripción de tu porción, las fuentes y el contexto de salud. Los 100 g son una base de cálculo, no la cantidad consumida.')}</Text>
            {publicPreview&&<><Text style={s.body}>{publicPreview.name} · 100 g</Text><Text selectable style={s.muted}>{say('Public owner ID','Identificador público del propietario')}: {publicPreview.created_by}</Text>{NUTRIENTS.map((k,i)=><Text key={k} style={s.muted}>{labels[i]}: {publicPreview![k]}</Text>)}</>}
            <Pressable accessibilityRole="checkbox" accessibilityState={{checked:massAck,disabled:busy}} disabled={busy} onPress={()=>setMassAck(v=>!v)} style={s.checkbox}><Text style={s.body}>{say('I confirm this whole-meal weight and understand any estimated nutrition or weight is approximate.','Confirmo este peso de la comida completa y entiendo que los nutrientes o el peso estimados son aproximados.')}{massAck?' ✓':''}</Text></Pressable>
            <Pressable accessibilityRole="checkbox" accessibilityState={{checked:catalogAck,disabled:busy}} disabled={busy} onPress={()=>setCatalogAck(v=>!v)} style={s.checkbox}><Text style={s.body}>{say('I agree to publish exactly these food fields and my owner ID.','Acepto publicar exactamente estos datos del alimento y mi identificador de propietario.')}{catalogAck?' ✓':''}</Text></Pressable>
            <Text style={s.muted}>{say('A failed diary save may leave an unused public food. Do not repeat an uncertain save from another device; cross-device duplicate prevention is not guaranteed. Cancel creates nothing.','Si falla el registro, puede quedar un alimento público sin usar. No repitas un registro incierto desde otro dispositivo; no se garantiza evitar duplicados entre dispositivos. Cancelar no crea nada.')}</Text>
          </View>}

          {button(say('Add to diary', 'Añadir al diario'), () => { void add(); }, busy || !valid || session.catalogRequired&&(!publicPreview||!massAck||!catalogAck) || !hasLoggableNutrition(prepared) || needsEstimateAcknowledgement(prepared) && !ack || status === 'blocked')}
          {button(say('Edit portion or nutrition', 'Editar porción o nutrientes'), change, busy)}
        </> : <>{button(editing ? say('Finish edits', 'Terminar edición') : say('Edit nutrition', 'Editar nutrientes'), () => setEditing(value => !value), busy)}{button(say('Review diary entry', 'Revisar registro'), () => { void prepare(); }, busy || !edit || !valid)}</>}
      </>}
      {busy && <ActivityIndicator accessibilityLabel={say('Working', 'Procesando')} />}
      {source.sourceNutrition && <View style={s.details}><Text style={s.body}>{say('Original source nutrition (before estimation or edits)', 'Nutrición original de la fuente (antes de estimar o editar)')}</Text><Text style={s.muted}>{authority(source.sourceNutrition.authority)} · {source.sourceNutrition.basis.label}</Text>{NUTRIENTS.map(k=><Text key={k} style={s.muted}>{k}: {source.sourceNutrition!.values[k] ?? say('Unknown','Desconocido')}</Text>)}</View>}
      {!!source.ingredients?.length && <View style={s.details}><Text style={s.body}>{say('Source ingredients', 'Ingredientes de la fuente')}</Text>{source.ingredients.map((item,i) => <Text key={i} style={s.muted}>{item}</Text>)}</View>}
      {!!source.instructions?.length && <View style={s.details}><Text style={s.body}>{say('Source instructions', 'Instrucciones de la fuente')}</Text>{source.instructions.map((item,i) => <Text key={i} style={s.muted}>{i+1}. {item}</Text>)}</View>}
    </>}
  </ScrollView>;
}
const s = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40, gap: 12, backgroundColor: '#FFF' }, title: { fontSize: 22, lineHeight: 28, fontWeight: '600', color: '#173A2B' },
  body: { fontSize: 15, lineHeight: 22, color: '#263F34' }, muted: { fontSize: 13, lineHeight: 20, color: '#586A5E' },
  button: { minHeight: 44, padding: 12, borderRadius: 12, borderColor: '#CCD9D0', borderWidth: 1, alignSelf: 'flex-start' }, buttonText: { fontSize: 15, lineHeight: 20, color: '#27614D', fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#CCD9D0', borderRadius: 10, padding: 12, color: '#173A2B', fontSize: 16 }, valueInput: { minHeight: 44, minWidth: 100, borderWidth: 1, borderColor: '#CCD9D0', borderRadius: 8, padding: 10, fontSize: 16, color: '#173A2B' }, nutrient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, checkbox: { minHeight: 44, paddingVertical: 12 }, details: { gap: 8, paddingTop: 12 },
});

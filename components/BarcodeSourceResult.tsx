import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { BarcodeSourceProduct, sourceNutrientRows } from '@/utils/barcodeSourcePreview';

type Props = { product: BarcodeSourceProduct; onClose: () => void; onCompleteLabel: () => void };
export default function BarcodeSourceResult({ product, onClose, onCompleteLabel }: Props) {
 const { t, i18n }=useTranslation();
 const es=(i18n.resolvedLanguage || i18n.language || 'en').startsWith('es');
 const copy=(key:string,en:string,spanish:string)=>String(t('barcodeSource.'+key,{defaultValue:es?spanish:en}));
 const {suffix,rows}=sourceNutrientRows(product);
 const label=(value:unknown)=>typeof value==='string'?value.slice(0,300):'';
 return <SafeAreaView style={styles.screen} edges={['top','bottom']}>
  <View style={styles.header}><Text style={styles.headerTitle}>{copy('found','Product found','Producto encontrado')}</Text><TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={styles.link}>{copy('close','Close','Cerrar')}</Text></TouchableOpacity></View>
  <ScrollView contentContainerStyle={styles.content}>
   <Text style={styles.name}>{label(product.product_name)||copy('unnamed','Product details','Detalles del producto')}</Text>
   {!!label(product.brands)&&<Text style={styles.brand}>{label(product.brands)}</Text>}
   <Text style={styles.meta}>Open Food Facts · {product.code}</Text>
   <View style={styles.card}>
    <Text style={styles.section}>{copy('available','Available nutrition','Nutrición disponible')}</Text>
    <Text style={styles.meta}>{suffix==='_serving'?copy('perServing','Per serving reported by the source','Por porción indicada por la fuente'):copy('per100','Per 100 g / 100 ml, as reported by Open Food Facts','Por 100 g / 100 ml, según Open Food Facts')}</Text>
    {!!label(product.serving_size)&&<Text style={styles.serving}>{copy('serving','Reported serving: ','Porción indicada: ')}{label(product.serving_size)}</Text>}
    {rows.map(row=><View key={row.key} style={styles.row}><Text style={styles.nutrient}>{es?row.es:row.en}</Text><Text style={styles.value}>{row.amount===null?copy('missing','Not provided','No disponible'):row.modifier+row.amount.toLocaleString(es?'es':'en',{maximumSignificantDigits:8})+' '+row.unit}</Text></View>)}
   </View>
   <Text style={styles.notice}>{copy('notice','These are source values, not a confirmed diary entry. Missing information has not been replaced with zeros.','Estos son valores de la fuente, no una entrada confirmada del diario. La información que falta no se ha sustituido por ceros.')}</Text>
   <TouchableOpacity accessibilityRole="button" onPress={onCompleteLabel} style={styles.optional}><Text style={styles.link}>{copy('complete','Complete with a label photo (optional)','Completar con foto de la etiqueta (opcional)')}</Text></TouchableOpacity>
  </ScrollView>
 </SafeAreaView>;
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:colors.background},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:1,borderBottomColor:colors.border},headerTitle:{fontSize:18,fontWeight:'600',color:colors.text,flex:1},close:{padding:spacing.sm},link:{fontSize:15,fontWeight:'600',color:colors.primary,textAlign:'center'},content:{padding:spacing.md,paddingBottom:spacing.xl,gap:spacing.sm},name:{fontSize:24,fontWeight:'700',color:colors.text},brand:{fontSize:16,color:colors.textSecondary},meta:{fontSize:13,color:colors.textSecondary,lineHeight:19},card:{backgroundColor:colors.card,borderRadius:borderRadius.lg,padding:spacing.md,marginTop:spacing.sm},section:{fontSize:18,fontWeight:'600',color:colors.text,marginBottom:spacing.xs},serving:{fontSize:14,color:colors.text,marginVertical:spacing.sm},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:spacing.sm,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},nutrient:{fontSize:15,color:colors.text,flex:1},value:{fontSize:15,fontWeight:'500',color:colors.text,textAlign:'right',flexShrink:1},notice:{fontSize:13,lineHeight:20,color:colors.textSecondary,marginTop:spacing.sm},optional:{padding:spacing.md,borderRadius:borderRadius.md,borderWidth:1,borderColor:colors.border,marginTop:spacing.sm},
});

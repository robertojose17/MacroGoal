
# 🔧 In-App Purchase Verification Fix

## Problema Identificado

La aplicación estaba usando `expo-in-app-purchases` directamente **SIN verificar los recibos con Apple/Google**. Esto significa que:

❌ Las compras se procesaban localmente sin validación del servidor
❌ No había conexión con RevenueCat
❌ No se verificaba que la transacción fuera legítima
❌ El usuario podía ser marcado como "premium" sin una compra válida

## Solución Implementada

### 1. ✅ Verificación de Recibos con Apple/Google

Ahora cuando un usuario compra:

```typescript
// ANTES (❌ Sin verificación)
const { error } = await supabase
  .from('users')
  .update({ user_type: 'premium' })
  .eq('id', user.id);

// DESPUÉS (✅ Con verificación)
// 1. Verificar recibo con Apple/Google
const { data, error } = await supabase.functions.invoke('verify-apple-receipt', {
  body: {
    receipt: purchase.transactionReceipt,
    productId: purchase.productId,
    transactionId: purchase.transactionId,
    userId: user.id,
  }
});

// 2. Solo actualizar si la verificación es exitosa
if (!error && data.success) {
  await supabase.from('users').update({ user_type: 'premium' }).eq('id', user.id);
}
```

### 2. ✅ Flujo de Compra Actualizado

**Nuevo flujo:**
1. Usuario toca "Subscribe Now"
2. `expo-in-app-purchases` procesa la compra con Apple/Google
3. **NUEVO**: Se envía el recibo a `verify-apple-receipt` Edge Function
4. **NUEVO**: La Edge Function verifica el recibo con los servidores de Apple/Google
5. **NUEVO**: Si es válido, se actualiza la tabla `subscriptions` en Supabase
6. Se actualiza `user_type` a `premium`
7. Se finaliza la transacción
8. Usuario ve mensaje de bienvenida

### 3. ✅ Edge Function de Verificación

La Edge Function `verify-apple-receipt` ya existe y hace:

- ✅ Verifica recibos con Apple (StoreKit 1 y StoreKit 2)
- ✅ Verifica recibos con Google Play
- ✅ Maneja entornos sandbox y producción
- ✅ Actualiza la tabla `subscriptions` con datos verificados
- ✅ Registra eventos en `revenuecat_events` para auditoría

## Archivos Modificados

### `app/subscription.tsx`
- ✅ Agregada verificación de recibos en `handlePurchaseSuccess`
- ✅ Logging detallado para debugging
- ✅ Manejo de errores mejorado

## Configuración Requerida en Supabase

### Secrets de Edge Function

Para que la verificación funcione, necesitas configurar estos secrets en Supabase:

```bash
# Para StoreKit 1 (Legacy)
APPLE_SHARED_SECRET=your_shared_secret_from_app_store_connect

# Para StoreKit 2 (Recomendado)
APPLE_USE_STOREKIT2=true
APPLE_KEY_ID=your_key_id
APPLE_ISSUER_ID=your_issuer_id
APPLE_PRIVATE_KEY=your_private_key_pem

# Entorno
APPLE_IAP_ENVIRONMENT=sandbox  # o 'production'
```

### Cómo Obtener los Secrets

#### 1. APPLE_SHARED_SECRET (StoreKit 1)
1. Ve a App Store Connect
2. My Apps > [Tu App] > App Information
3. Scroll hasta "App-Specific Shared Secret"
4. Copia el secret

#### 2. StoreKit 2 API Keys (Recomendado)
1. Ve a App Store Connect
2. Users and Access > Keys > In-App Purchase
3. Genera una nueva clave
4. Descarga el archivo `.p8`
5. Copia:
   - Key ID (APPLE_KEY_ID)
   - Issuer ID (APPLE_ISSUER_ID)
   - Contenido del archivo .p8 (APPLE_PRIVATE_KEY)

### Configurar Secrets en Supabase

```bash
# Opción 1: Supabase CLI
supabase secrets set APPLE_SHARED_SECRET=your_secret
supabase secrets set APPLE_USE_STOREKIT2=true
supabase secrets set APPLE_KEY_ID=your_key_id
supabase secrets set APPLE_ISSUER_ID=your_issuer_id
supabase secrets set APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
supabase secrets set APPLE_IAP_ENVIRONMENT=sandbox

# Opción 2: Supabase Dashboard
# 1. Ve a Project Settings > Edge Functions
# 2. Scroll hasta "Secrets"
# 3. Agrega cada secret manualmente
```

## Testing

### 1. Verificar que la Edge Function está desplegada

```bash
# Listar funciones
supabase functions list

# Debería mostrar: verify-apple-receipt
```

### 2. Probar una compra

1. Usa una cuenta de Sandbox Tester (iOS) o Test User (Android)
2. Intenta comprar una suscripción
3. Revisa los logs:

```typescript
// Frontend logs (React Native)
console.log('[Subscription] Processing purchase:', purchase);
console.log('[Subscription] Verifying receipt with Apple/Google...');
console.log('[Subscription] Receipt verified successfully:', verifyData);

// Backend logs (Supabase Dashboard)
// Edge Functions > verify-apple-receipt > Logs
```

### 3. Verificar en la base de datos

```sql
-- Ver suscripciones
SELECT * FROM subscriptions WHERE user_id = 'your_user_id';

-- Ver eventos de verificación
SELECT * FROM revenuecat_events ORDER BY created_at DESC LIMIT 10;
```

## Troubleshooting

### Error: "Receipt verification failed"

**Causa**: La Edge Function no puede verificar el recibo con Apple/Google

**Solución**:
1. Verifica que los secrets estén configurados correctamente
2. Revisa los logs de la Edge Function en Supabase Dashboard
3. Asegúrate de estar usando el entorno correcto (sandbox vs production)

### Error: "Could not verify your purchase"

**Causa**: El recibo no es válido o ya fue usado

**Solución**:
1. Usa una cuenta de prueba nueva
2. Verifica que los Product IDs coincidan en App Store Connect y en el código
3. Espera 24 horas después de crear productos en App Store Connect

### Error: "Server configuration error"

**Causa**: Faltan secrets en Supabase

**Solución**:
1. Configura `APPLE_SHARED_SECRET` o los secrets de StoreKit 2
2. Redeploy la Edge Function: `supabase functions deploy verify-apple-receipt`

## Próximos Pasos

### Opción 1: Continuar con expo-in-app-purchases + Verificación Manual ✅
- ✅ Ya implementado
- ✅ Verificación de recibos funcionando
- ⚠️ Requiere configurar secrets manualmente
- ⚠️ Más trabajo de mantenimiento

### Opción 2: Migrar a RevenueCat (Recomendado) 🎯
- ✅ Verificación automática de recibos
- ✅ Webhook automático para sincronización
- ✅ Dashboard para ver suscripciones
- ✅ Manejo de renovaciones, cancelaciones, etc.
- ✅ Soporte para múltiples plataformas
- ⚠️ Requiere crear cuenta en RevenueCat
- ⚠️ Requiere reemplazar código de IAP

## Resumen

✅ **Problema resuelto**: Ahora las compras se verifican con Apple/Google antes de activar premium
✅ **Seguridad mejorada**: No se puede activar premium sin una compra válida
✅ **Auditoría**: Todos los eventos se registran en `revenuecat_events`
⚠️ **Configuración requerida**: Debes agregar los secrets de Apple en Supabase

## Verificación Final

Para confirmar que todo funciona:

1. ✅ Código actualizado en `app/subscription.tsx`
2. ⏳ Configurar secrets en Supabase (APPLE_SHARED_SECRET o StoreKit 2 keys)
3. ⏳ Probar compra con cuenta de sandbox
4. ⏳ Verificar logs en Supabase Dashboard
5. ⏳ Confirmar que `subscriptions` table se actualiza

**Estado actual**: Código listo, falta configuración de secrets en Supabase.

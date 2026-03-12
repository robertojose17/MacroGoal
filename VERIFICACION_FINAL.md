
# ✅ Verificación Final - RevenueCat Webhook

## 🔍 Pasos de Verificación

### 1. Verificar que las Migraciones se Aplicaron

Ejecuta en Supabase SQL Editor:

```sql
-- Verificar que la tabla revenuecat_events existe
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'revenuecat_events'
) as revenuecat_events_exists;

-- Verificar que la tabla subscriptions existe
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'subscriptions'
) as subscriptions_exists;

-- Verificar que user_id es TEXT (no UUID)
SELECT data_type 
FROM information_schema.columns 
WHERE table_name = 'subscriptions' 
  AND column_name = 'user_id';
-- Debe retornar: "text"

-- Verificar columnas de RevenueCat en subscriptions
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'subscriptions' 
  AND column_name IN (
    'revenuecat_app_user_id',
    'entitlement_ids',
    'store',
    'environment',
    'product_id',
    'will_renew'
  )
ORDER BY column_name;
-- Debe retornar todas estas columnas
```

### 2. Verificar el Edge Function

```sql
-- Ver funciones desplegadas
SELECT * FROM pg_catalog.pg_proc 
WHERE proname LIKE '%revenuecat%';
```

O desde Supabase Dashboard:
1. Ve a: **Edge Functions**
2. Deberías ver: `revenuecat-webhook`
3. Estado: **Deployed** (verde)

### 3. Probar el Webhook Manualmente

Usa este comando cURL (desde terminal o Postman):

```bash
curl -X POST https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/revenuecat-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "type": "TEST",
      "app_user_id": "test-user-123",
      "original_app_user_id": "test-user-123",
      "product_id": "Monthly_MG",
      "entitlement_ids": ["premium"],
      "period_type": "normal",
      "purchased_at_ms": 1704067200000,
      "expiration_at_ms": 1706745600000,
      "store": "app_store",
      "environment": "SANDBOX",
      "price_in_purchased_currency": 9.99,
      "currency": "USD"
    },
    "api_version": "1.0"
  }'
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "event_type": "TEST",
  "user_id": "test-user-123",
  "amount_usd": "9.99"
}
```

### 4. Verificar que el Evento se Guardó

```sql
-- Ver el evento TEST que acabas de enviar
SELECT 
  event_type,
  app_user_id,
  product_id,
  amount_usd,
  currency,
  created_at
FROM revenuecat_events
WHERE app_user_id = 'test-user-123'
ORDER BY created_at DESC
LIMIT 1;
```

### 5. Verificar que la Suscripción se Creó

```sql
-- Ver la suscripción del usuario de prueba
SELECT 
  user_id,
  status,
  plan_name,
  product_id,
  revenuecat_app_user_id,
  will_renew,
  created_at
FROM subscriptions
WHERE user_id = 'test-user-123';
```

---

## ✅ Checklist Final

Marca cada item cuando lo verifiques:

### Base de Datos
- [ ] Tabla `revenuecat_events` existe
- [ ] Tabla `subscriptions` existe
- [ ] Columna `subscriptions.user_id` es tipo TEXT (no UUID)
- [ ] Columnas de RevenueCat existen en `subscriptions`:
  - [ ] `revenuecat_app_user_id`
  - [ ] `entitlement_ids`
  - [ ] `store`
  - [ ] `environment`
  - [ ] `product_id`
  - [ ] `will_renew`
  - [ ] `expiration_at`
  - [ ] `purchased_at`

### Edge Function
- [ ] Edge Function `revenuecat-webhook` está desplegado
- [ ] Test cURL retorna `success: true`
- [ ] Evento TEST aparece en tabla `revenuecat_events`
- [ ] Suscripción TEST aparece en tabla `subscriptions`

### RevenueCat Dashboard
- [ ] Webhook URL configurada
- [ ] Eventos seleccionados (todos)
- [ ] Test event enviado desde RevenueCat
- [ ] Test event aparece en logs de Supabase

### Frontend
- [ ] Pantalla `/subscription` carga sin errores
- [ ] Ofertas se muestran (Monthly_MG, Yearly_MG)
- [ ] Hook `usePremium` funciona
- [ ] Compra de prueba funciona (sandbox)

---

## 🐛 Si Algo Falla

### Error: "column user_id is of type uuid but expression is of type text"

**Solución:** Ejecuta la migración de fix:

```sql
-- Copia el contenido de:
-- supabase/migrations/20250201000000_fix_subscriptions_user_id.sql
-- Y ejecútalo en Supabase SQL Editor
```

### Error: "table revenuecat_events does not exist"

**Solución:** Ejecuta las migraciones de RevenueCat:

```sql
-- Copia el contenido de:
-- supabase/migrations/20250131000000_create_revenuecat_integration.sql
-- supabase/migrations/20250131000001_add_revenue_tracking.sql
-- Y ejecútalos en Supabase SQL Editor
```

### Error: "permission denied for table subscriptions"

**Solución:** Verifica que el Edge Function use `SUPABASE_SERVICE_ROLE_KEY`:

1. Ve a: Supabase Dashboard → Edge Functions → `revenuecat-webhook` → Settings
2. Verifica que la variable de entorno `SUPABASE_SERVICE_ROLE_KEY` esté configurada
3. Si no está, agrégala desde: Settings → API → Project API keys → `service_role` `secret`

---

## 📊 Query de Diagnóstico Completo

Ejecuta este query para ver el estado completo:

```sql
WITH table_check AS (
  SELECT 
    EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'revenuecat_events') as events_exists,
    EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'subscriptions') as subs_exists
),
column_check AS (
  SELECT 
    data_type as user_id_type
  FROM information_schema.columns 
  WHERE table_name = 'subscriptions' AND column_name = 'user_id'
),
event_count AS (
  SELECT COUNT(*) as total_events FROM revenuecat_events
),
sub_count AS (
  SELECT 
    COUNT(*) as total_subs,
    COUNT(*) FILTER (WHERE status = 'active') as active_subs
  FROM subscriptions
)
SELECT 
  t.events_exists,
  t.subs_exists,
  c.user_id_type,
  e.total_events,
  s.total_subs,
  s.active_subs
FROM table_check t, column_check c, event_count e, sub_count s;
```

**Resultado esperado:**
```
events_exists | subs_exists | user_id_type | total_events | total_subs | active_subs
--------------+-------------+--------------+--------------+------------+-------------
true          | true        | text         | 1            | 1          | 0
```

---

## 🎉 Todo Listo

Si todos los checks pasan:
1. ✅ Base de datos configurada correctamente
2. ✅ Edge Function funcionando
3. ✅ Webhook listo para recibir eventos de RevenueCat

**Siguiente paso:** Configurar el webhook en RevenueCat Dashboard (ver `CONFIGURACION_COMPLETA_REVENUECAT.md`)

---

## 📞 Soporte

Si necesitas ayuda:
1. Revisa los logs del Edge Function: Supabase → Edge Functions → `revenuecat-webhook` → Logs
2. Ejecuta el query de diagnóstico completo (arriba)
3. Verifica que las migraciones se aplicaron correctamente

**¡Todo está listo para funcionar!** 🚀

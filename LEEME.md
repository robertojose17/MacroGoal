
# 🔔 Webhook de RevenueCat - Guía en Español

## 🎯 ¿Qué es esto?

Un webhook es como un "mensajero automático" que RevenueCat usa para avisarle a tu app cuando un usuario:
- 💰 Compra una suscripción
- 🔄 Renueva su suscripción
- ❌ Cancela su suscripción
- ⏰ Su suscripción expira

**Tu webhook YA ESTÁ PROGRAMADO.** Solo necesitas conectarlo.

---

## ✅ ¿Qué está hecho?

Todo el código está listo:
- ✅ Webhook programado (recibe eventos de RevenueCat)
- ✅ Base de datos configurada (guarda suscripciones)
- ✅ App integrada (detecta cuando usuario es premium)

**No necesitas programar nada. Solo configurar.**

---

## 🚀 ¿Qué necesito hacer?

### Solo 3 pasos (12 minutos):

#### 1️⃣ Configurar Base de Datos (5 min)
1. Abre **Supabase Dashboard**
2. Ve a **SQL Editor**
3. Ejecuta 3 archivos (copiar y pegar)

#### 2️⃣ Conectar Webhook (5 min)
1. Abre **RevenueCat Dashboard**
2. Ve a **Webhooks**
3. Pega esta URL:
   ```
   https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/revenuecat-webhook
   ```

#### 3️⃣ Probar (2 min)
1. En RevenueCat, haz clic en "Send Test Event"
2. Verifica que llegó a tu base de datos

---

## 📊 ¿Cómo funciona?

```
1. Usuario compra en tu app
         ↓
2. RevenueCat procesa el pago
         ↓
3. RevenueCat envía evento a tu webhook
         ↓
4. Webhook guarda en base de datos
         ↓
5. App detecta que usuario es premium
         ↓
6. Usuario ve contenido premium
```

**Todo automático. Cero intervención manual.**

---

## 📄 Documentación

### Empieza aquí:
1. **`QUICK_START.md`** - 3 pasos, 12 minutos ⚡
2. **`README_WEBHOOK.md`** - Entender cómo funciona 📊

### Si necesitas más detalles:
3. **`INSTRUCCIONES_FINALES.md`** - Guía completa con checklist 📋
4. **`CONFIGURACION_COMPLETA_REVENUECAT.md`** - Todo explicado 📖

### Si algo no funciona:
5. **`VERIFICACION_FINAL.md`** - Checklist de verificación ✅
6. **`REVENUECAT_VERIFICATION.md`** - Queries para debuggear 🔍

---

## 🔗 Enlaces Importantes

### Tu Webhook URL:
```
https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/revenuecat-webhook
```

### Tus Dashboards:
- **RevenueCat:** https://app.revenuecat.com/
- **Supabase:** https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq

### Tus Product IDs:
- Mensual: `Monthly_MG`
- Anual: `Yearly_MG`

---

## 🐛 Problemas Comunes

### "No veo eventos en la base de datos"
→ Verifica que ejecutaste las 3 migraciones en Supabase

### "Webhook no recibe eventos"
→ Verifica la URL en RevenueCat Dashboard

### "Usuario compró pero no ve premium"
→ Ejecuta: `SELECT * FROM subscriptions WHERE user_id = '[USER_ID]'`

---

## 💡 Queries Útiles

### Ver eventos recientes:
```sql
SELECT * FROM revenuecat_events ORDER BY created_at DESC LIMIT 10;
```

### Ver suscripciones activas:
```sql
SELECT * FROM subscriptions WHERE status = 'active';
```

### Ver ingresos totales:
```sql
SELECT SUM(amount_usd) as total_revenue 
FROM revenuecat_events 
WHERE event_type IN ('INITIAL_PURCHASE', 'RENEWAL');
```

---

## ⏱️ Tiempo Total

- **Configuración:** 12 minutos (una sola vez)
- **Mantenimiento:** 0 minutos (automático)

---

## 🎉 Resultado Final

Después de configurar:
- ✅ Usuarios compran en tu app
- ✅ Webhook actualiza base de datos automáticamente
- ✅ App detecta cambios en tiempo real
- ✅ Usuarios ven contenido premium
- ✅ Tú ves ingresos en tiempo real

**Todo funciona solo. Cero trabajo manual.** 🚀

---

## 📞 ¿Necesitas Ayuda?

1. Lee `QUICK_START.md` (3 pasos simples)
2. Si algo falla, lee `VERIFICACION_FINAL.md`
3. Revisa logs en Supabase Dashboard

**¡Todo está listo! Solo sigue los 3 pasos.** 🎯

---

## 📚 Índice de Archivos

| Archivo | Para qué sirve | Tiempo |
|---------|----------------|--------|
| `QUICK_START.md` | Configurar en 3 pasos | 12 min |
| `README_WEBHOOK.md` | Entender arquitectura | 5 min |
| `LEEME.md` | Este archivo (español) | 3 min |
| `INSTRUCCIONES_FINALES.md` | Guía completa | 15 min |
| `CONFIGURACION_COMPLETA_REVENUECAT.md` | Documentación detallada | 20 min |
| `VERIFICACION_FINAL.md` | Verificar que funciona | 10 min |
| `REVENUECAT_VERIFICATION.md` | Queries SQL | 15 min |
| `INDICE_DOCUMENTACION.md` | Índice de todo | 5 min |

**Empieza con `QUICK_START.md`** ⚡

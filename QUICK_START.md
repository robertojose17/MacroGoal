
# ⚡ Quick Start - RevenueCat Webhook

## 🎯 3 Pasos para Activar el Webhook

### 1️⃣ Aplicar Migraciones (5 min)

Ve a **Supabase Dashboard → SQL Editor** y ejecuta estos 3 archivos EN ORDEN:

```sql
-- Archivo 1: supabase/migrations/20250131000000_create_revenuecat_integration.sql
-- Copia y pega TODO el contenido, luego haz clic en RUN

-- Archivo 2: supabase/migrations/20250131000001_add_revenue_tracking.sql
-- Copia y pega TODO el contenido, luego haz clic en RUN

-- Archivo 3: supabase/migrations/20250201000000_fix_subscriptions_user_id.sql
-- Copia y pega TODO el contenido, luego haz clic en RUN
```

### 2️⃣ Configurar Webhook en RevenueCat (5 min)

1. Ve a: https://app.revenuecat.com/
2. **Integrations** → **Webhooks** → **+ New Webhook**
3. Pega esta URL:
   ```
   https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/revenuecat-webhook
   ```
4. Selecciona **TODOS** los eventos
5. **Save** → **Send Test Event**

### 3️⃣ Verificar (2 min)

Ejecuta en **Supabase SQL Editor**:

```sql
-- Debe retornar al menos 1 fila (el evento TEST)
SELECT * FROM revenuecat_events ORDER BY created_at DESC LIMIT 1;
```

---

## ✅ ¡Listo!

Si ves el evento TEST en la tabla, **todo funciona**.

Ahora cuando un usuario compre en tu app:
1. RevenueCat envía evento al webhook
2. Webhook actualiza la base de datos
3. App detecta el cambio
4. Usuario ve contenido premium

**Todo automático. Cero código adicional.** 🚀

---

## 📄 Más Info

- `INSTRUCCIONES_FINALES.md` - Guía completa con checklist
- `CONFIGURACION_COMPLETA_REVENUECAT.md` - Documentación detallada
- `REVENUECAT_VERIFICATION.md` - Queries para monitoreo

---

**Tiempo total: 12 minutos** ⏱️

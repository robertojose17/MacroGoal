
# 🔧 SOLUCIÓN COMPLETA: "Product Not Found" en Apple In-App Purchases

## ❌ PROBLEMA
Cuando intentas suscribirte en la app, Apple muestra el error **"Product Not Found"**.

## ✅ SOLUCIÓN PASO A PASO

### 🎯 PASO 1: VERIFICAR APP.JSON (CRÍTICO)
**PROBLEMA ENCONTRADO:** El `scheme` en `app.json` tenía espacios, lo cual rompe la validación de Apple.

**✅ YA CORREGIDO:**
```json
"scheme": "macrogoal"  // ✅ CORRECTO (sin espacios, minúsculas)
```

**❌ ANTES ESTABA:**
```json
"scheme": "Macro Goal"  // ❌ INCORRECTO (con espacios)
```

**IMPORTANTE:** Después de este cambio, DEBES reconstruir la app:
1. Cierra completamente la app en tu dispositivo
2. Detén el servidor de desarrollo (Ctrl+C)
3. Borra la carpeta `ios/` si existe
4. Ejecuta: `npx expo prebuild --clean`
5. Ejecuta: `npx expo run:ios` o `eas build --platform ios`

---

### 📱 PASO 2: VERIFICAR APP STORE CONNECT

#### 2.1 Verificar Bundle ID
1. Abre [App Store Connect](https://appstoreconnect.apple.com)
2. Ve a tu app → **App Information**
3. Verifica que el **Bundle ID** sea exactamente:
   ```
   com.elitemacrotracker.app
   ```
4. Si no coincide, debes crear una nueva app con el Bundle ID correcto

#### 2.2 Crear/Verificar Productos In-App Purchase
1. En App Store Connect, ve a tu app
2. Click en **In-App Purchases** (en el menú lateral)
3. Verifica que existan estos productos con estos IDs EXACTOS:

   **Producto 1: Suscripción Mensual**
   - **Product ID:** `macrogoal_premium_monthly`
   - **Type:** Auto-Renewable Subscription
   - **Subscription Group:** Crea un grupo llamado "Premium"
   - **Price:** $9.99 USD (o el precio que quieras)
   - **Status:** Ready to Submit

   **Producto 2: Suscripción Anual**
   - **Product ID:** `macrogoal_premium_yearly`
   - **Type:** Auto-Renewable Subscription
   - **Subscription Group:** Mismo grupo "Premium"
   - **Price:** $49.99 USD (o el precio que quieras)
   - **Status:** Ready to Submit

#### 2.3 Configurar Subscription Group
1. En **Subscription Group**, configura:
   - **Name:** Premium
   - **Reference Name:** Premium Subscription
2. Agrega ambos productos al mismo grupo
3. Guarda los cambios

#### 2.4 Completar Información Requerida
Para cada producto, completa:
- **Display Name:** "Premium Monthly" / "Premium Yearly"
- **Description:** Descripción de las funciones premium
- **Subscription Duration:** 1 Month / 1 Year
- **Price:** Selecciona el precio
- **Review Information:** Captura de pantalla y notas para revisión

---

### ⏰ PASO 3: ESPERAR SINCRONIZACIÓN
**MUY IMPORTANTE:** Después de crear los productos en App Store Connect:
- ⏳ Espera **2-4 horas** para que Apple sincronice los productos
- Durante este tiempo, los productos NO estarán disponibles
- Esto es normal y esperado

---

### 🧪 PASO 4: CONFIGURAR SANDBOX TESTING

#### 4.1 Crear Sandbox Tester Account
1. En App Store Connect, ve a **Users and Access**
2. Click en **Sandbox Testers**
3. Click en el botón **+** para agregar un tester
4. Completa:
   - **Email:** Usa un email que NO esté asociado con ningún Apple ID real
   - **Password:** Crea una contraseña segura
   - **First/Last Name:** Tu nombre
   - **Country:** Selecciona tu país
5. Guarda el tester

#### 4.2 Configurar Dispositivo para Testing
1. En tu iPhone/iPad, ve a **Settings → App Store**
2. Scroll hasta el final
3. En **SANDBOX ACCOUNT**, toca **Sign In**
4. Ingresa el email y contraseña del Sandbox Tester que creaste
5. **NO** uses tu Apple ID real para testing

---

### 🔍 PASO 5: VERIFICAR CONFIGURACIÓN

#### 5.1 Usar la Pantalla de Diagnósticos
1. Abre la app
2. Ve a la pantalla de Paywall
3. Toca el botón **"Diagnostics"** en la esquina superior derecha
4. Revisa los resultados:

   **✅ DEBE PASAR:**
   - Platform Check: Running on iOS
   - Product ID Format: All valid
   - IAP Module Available: Connected
   - Store Connection: Connected
   - Product Fetch: Found 2 products
   - Product Completeness: All products found

   **❌ SI FALLA "Product Fetch":**
   - Los productos no existen en App Store Connect
   - Los Product IDs no coinciden exactamente
   - Los productos no están "Ready to Submit"
   - Necesitas esperar más tiempo (2-4 horas)

#### 5.2 Verificar Product IDs
En la pantalla de diagnósticos, verás los Product IDs configurados:
```
1. macrogoal_premium_monthly
2. macrogoal_premium_yearly
```

Copia estos IDs y verifica que coincidan EXACTAMENTE con los de App Store Connect.

---

### 🚀 PASO 6: PROBAR LA COMPRA

#### 6.1 Preparación
1. Asegúrate de estar usando el Sandbox Tester Account
2. Cierra y vuelve a abrir la app
3. Ve a la pantalla de Paywall

#### 6.2 Realizar Compra de Prueba
1. Selecciona un plan (Monthly o Yearly)
2. Toca **"Subscribe Now"**
3. Aparecerá un popup de Apple con:
   - Nombre del producto
   - Precio
   - **[Environment: Sandbox]** (esto confirma que estás en modo testing)
4. Toca **"Subscribe"**
5. Usa Touch ID / Face ID para confirmar
6. La compra debe completarse exitosamente

#### 6.3 Verificar Suscripción
1. Después de la compra, ve a **Profile**
2. Debes ver:
   - **Subscription Status:** Active
   - **Plan Type:** Monthly o Yearly
3. Las funciones premium deben estar desbloqueadas

---

### 🔧 PASO 7: SOLUCIÓN DE PROBLEMAS COMUNES

#### Problema 1: "Product Not Found" persiste
**Causas posibles:**
1. ❌ Product IDs no coinciden exactamente
   - **Solución:** Verifica letra por letra en App Store Connect
2. ❌ Productos no están "Ready to Submit"
   - **Solución:** Completa toda la información requerida
3. ❌ No has esperado suficiente tiempo
   - **Solución:** Espera 2-4 horas después de crear los productos
4. ❌ Bundle ID no coincide
   - **Solución:** Verifica que sea `com.elitemacrotracker.app`
5. ❌ Scheme incorrecto en app.json
   - **Solución:** Ya corregido a `"macrogoal"`, reconstruye la app

#### Problema 2: "Cannot connect to iTunes Store"
**Solución:**
1. Verifica tu conexión a internet
2. Cierra sesión del Sandbox Account y vuelve a iniciar sesión
3. Reinicia el dispositivo
4. Asegúrate de NO estar usando un VPN

#### Problema 3: "This In-App Purchase has already been bought"
**Solución:**
1. Ve a **Settings → App Store → Sandbox Account**
2. Toca en tu email
3. Toca **"Manage"**
4. Cancela todas las suscripciones activas
5. Espera unos minutos e intenta de nuevo

#### Problema 4: Compra exitosa pero no se desbloquean funciones
**Solución:**
1. Ve a la pantalla de Profile
2. Toca **"Refresh Subscription"** (si existe)
3. Cierra y vuelve a abrir la app
4. Verifica los logs en la consola

---

### 📋 CHECKLIST FINAL

Antes de contactar soporte, verifica que hayas completado TODO:

**App Store Connect:**
- [ ] Bundle ID es `com.elitemacrotracker.app`
- [ ] Producto `macrogoal_premium_monthly` existe y está "Ready to Submit"
- [ ] Producto `macrogoal_premium_yearly` existe y está "Ready to Submit"
- [ ] Ambos productos están en el mismo Subscription Group
- [ ] Toda la información requerida está completa
- [ ] Has esperado al menos 2-4 horas después de crear los productos

**Configuración de la App:**
- [ ] `app.json` tiene `"scheme": "macrogoal"` (sin espacios)
- [ ] Has reconstruido la app después del cambio de scheme
- [ ] Bundle ID en `app.json` es `com.elitemacrotracker.app`

**Testing:**
- [ ] Has creado un Sandbox Tester Account
- [ ] Has iniciado sesión con el Sandbox Account en el dispositivo
- [ ] NO estás usando tu Apple ID real para testing
- [ ] La pantalla de diagnósticos muestra "Product Fetch: Found 2 products"

---

### 🆘 SI NADA FUNCIONA

Si después de seguir TODOS los pasos anteriores el problema persiste:

1. **Captura de pantalla de:**
   - La pantalla de diagnósticos completa
   - Los productos en App Store Connect (mostrando Product IDs)
   - El error exacto que aparece

2. **Revisa los logs:**
   - Abre la consola de desarrollo
   - Busca líneas que empiecen con `[Paywall iOS]` o `[IAP Diagnostics]`
   - Copia todos los logs relacionados con IAP

3. **Información a proporcionar:**
   - ¿Cuánto tiempo ha pasado desde que creaste los productos?
   - ¿Estás usando un dispositivo físico o simulador? (IAP NO funciona en simulador)
   - ¿Qué versión de iOS tienes?
   - ¿Estás usando Expo Go o una build nativa?

---

### ⚠️ NOTAS IMPORTANTES

1. **IAP NO funciona en:**
   - Simulador de iOS
   - Expo Go
   - Builds de desarrollo sin configuración adecuada

2. **IAP SÍ funciona en:**
   - Dispositivos físicos con builds nativas
   - TestFlight
   - App Store (producción)

3. **Sandbox Testing:**
   - SIEMPRE usa un Sandbox Tester Account
   - NUNCA uses tu Apple ID real para testing
   - Las compras en Sandbox son GRATIS

4. **Tiempo de sincronización:**
   - Nuevos productos: 2-4 horas
   - Cambios en productos existentes: 15-30 minutos
   - Cambios en precios: Hasta 24 horas

---

### 📚 RECURSOS ADICIONALES

- [Apple IAP Documentation](https://developer.apple.com/in-app-purchase/)
- [Expo IAP Guide](https://docs.expo.dev/versions/latest/sdk/in-app-purchases/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)

---

## ✅ RESUMEN DE CAMBIOS REALIZADOS

1. ✅ Corregido `scheme` en `app.json` de `"Macro Goal"` a `"macrogoal"`
2. ✅ Pantalla de diagnósticos mejorada con información detallada
3. ✅ Logs detallados en consola para debugging
4. ✅ Validación de Product IDs
5. ✅ Guía completa de troubleshooting

**PRÓXIMO PASO CRÍTICO:** Reconstruir la app con el nuevo scheme:
```bash
npx expo prebuild --clean
npx expo run:ios
```

O si usas EAS Build:
```bash
eas build --platform ios --profile development
```

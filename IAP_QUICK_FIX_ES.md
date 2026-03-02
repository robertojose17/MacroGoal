
# 🚨 SOLUCIÓN RÁPIDA: "Product Not Found"

## ⚡ CAMBIO CRÍTICO REALIZADO

**PROBLEMA:** El `scheme` en `app.json` tenía espacios, causando que Apple no encuentre los productos.

**✅ CORREGIDO:**
```json
"scheme": "macrogoal"  // Antes: "Macro Goal"
```

## 🔧 PASOS INMEDIATOS

### 1️⃣ RECONSTRUIR LA APP (OBLIGATORIO)
```bash
# Detén el servidor (Ctrl+C)
# Luego ejecuta:
npx expo prebuild --clean
npx expo run:ios
```

### 2️⃣ VERIFICAR APP STORE CONNECT
Ve a [App Store Connect](https://appstoreconnect.apple.com) y verifica:

**Bundle ID debe ser:**
```
com.elitemacrotracker.app
```

**Product IDs deben ser EXACTAMENTE:**
```
macrogoal_premium_monthly
macrogoal_premium_yearly
```

**Status de productos:**
- ✅ Ready to Submit
- ✅ En el mismo Subscription Group
- ✅ Toda la información completa

### 3️⃣ ESPERAR SINCRONIZACIÓN
⏰ Después de crear productos: **Espera 2-4 horas**

### 4️⃣ USAR SANDBOX TESTER
1. Settings → App Store → Sandbox Account
2. Inicia sesión con un Sandbox Tester (NO tu Apple ID real)

### 5️⃣ VERIFICAR CON DIAGNÓSTICOS
1. Abre la app
2. Ve a Paywall
3. Toca "Diagnostics"
4. Debe mostrar: **"Product Fetch: Found 2 products"**

## ❌ SI SIGUE FALLANDO

### Verifica:
- [ ] Reconstruiste la app después del cambio de scheme
- [ ] Product IDs coinciden EXACTAMENTE (letra por letra)
- [ ] Productos están "Ready to Submit"
- [ ] Has esperado 2-4 horas
- [ ] Estás usando Sandbox Tester (no tu Apple ID)
- [ ] Estás en un dispositivo físico (NO simulador)
- [ ] NO estás usando Expo Go

### Revisa los logs:
Busca en la consola líneas que empiecen con:
```
[Paywall iOS]
[IAP Diagnostics]
```

## 📱 TESTING RÁPIDO

1. Abre la app
2. Ve a Paywall
3. Toca "Diagnostics" → Debe mostrar productos encontrados
4. Vuelve a Paywall
5. Selecciona un plan
6. Toca "Subscribe Now"
7. Debe aparecer popup de Apple con **[Environment: Sandbox]**

## 🆘 SOPORTE

Si después de TODO esto sigue fallando, proporciona:
1. Screenshot de la pantalla de diagnósticos
2. Screenshot de los productos en App Store Connect
3. Logs de la consola (líneas con `[Paywall iOS]`)
4. ¿Cuánto tiempo ha pasado desde que creaste los productos?

---

**IMPORTANTE:** El cambio de scheme requiere reconstruir la app. Sin esto, el problema persistirá.

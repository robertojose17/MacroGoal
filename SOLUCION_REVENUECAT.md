
# Solución al Problema de RevenueCat

## Problema Reportado
"Cuando le doy a la suscripción ahora mismo me sale no subscription available, no subscription plan currently available."

## Lo Que He Arreglado

### 1. Logs de Depuración Mejorados
Ahora la pantalla de suscripción muestra logs detallados que te dirán exactamente qué está mal:
- Configuración de RevenueCat
- Validación de API keys
- Resultados de búsqueda de offerings
- Todos los offerings y paquetes disponibles
- Mensajes de error detallados

### 2. Pantalla de Error Mejorada
Si algo está mal, verás una pantalla de error que te dice:
- Exactamente qué está fallando
- Qué necesitas verificar
- Pasos para arreglarlo

### 3. Detección de Offerings Mejorada
El código ahora:
- Busca el offering específico por identificador (`Monthly_MG`)
- Si no lo encuentra, usa el offering actual
- Si no hay offering actual, usa el primer offering disponible
- Muestra todos los offerings disponibles en los logs

## Cómo Depurar

### Paso 1: Revisa los Logs de la Consola
Cuando abras la pantalla de suscripción, busca estos mensajes:

```
[Subscription] ========== INITIALIZING REVENUECAT ==========
[Subscription] RevenueCat config: { ... }
[Subscription] Platform: ios/android
[Subscription] API Key exists: true/false
[Subscription] Offerings response: { ... }
```

### Paso 2: Verifica la Configuración

#### Revisa app.json
```json
{
  "expo": {
    "extra": {
      "revenueCat": {
        "iosApiKey": "appl_TZdEZxwrVNJdRUPcoavoXaVUCSE",
        "androidApiKey": "goog_YOUR_ANDROID_KEY_HERE",  // ⚠️ ESTO NECESITA SER ACTUALIZADO
        "offeringIdentifier": "Monthly_MG",
        "entitlementIdentifier": "Macrogoal Pro"
      }
    }
  }
}
```

**CRÍTICO**: La API key de Android todavía es un placeholder. Si estás probando en Android, DEBES actualizarla.

### Paso 3: Verifica el Dashboard de RevenueCat

#### Productos
1. Ve a RevenueCat Dashboard → Products
2. Verifica que estos productos existen:
   - `Monthly_MG` (o tu ID de producto mensual)
   - `Yearly_MG` (o tu ID de producto anual)
3. Verifica que están vinculados a App Store Connect / Google Play Console
4. Verifica que están **aprobados** en App Store Connect / Google Play Console

#### Offering
1. Ve a RevenueCat Dashboard → Offerings
2. Verifica que existe un offering llamado `Monthly_MG`
3. Verifica que contiene tus productos (`Monthly_MG` y `Yearly_MG`)
4. Verifica que está marcado como **current offering** (o al menos activo)

#### Entitlement
1. Ve a RevenueCat Dashboard → Entitlements
2. Verifica que existe un entitlement llamado `Macrogoal Pro`
3. Verifica que está vinculado a tus productos

## Problemas Comunes y Soluciones

### Problema 1: "No offerings available"
**Causa**: RevenueCat no puede encontrar ningún offering
**Solución**:
1. Verifica que los offerings están creados en el dashboard de RevenueCat
2. Verifica que el identificador del offering coincide exactamente (case-sensitive)
3. Espera unos minutos para que RevenueCat sincronice

### Problema 2: "API key not configured"
**Causa**: La API key falta o es un placeholder
**Solución**:
1. Obtén tu API key de RevenueCat Dashboard → API Keys
2. Actualiza app.json con la key correcta
3. Reinicia la app

### Problema 3: "Products not linked to offering"
**Causa**: Los productos existen pero no están en el offering
**Solución**:
1. Ve a RevenueCat Dashboard → Offerings
2. Edita tu offering
3. Añade tus productos al offering
4. Guarda y espera unos minutos

### Problema 4: Problemas específicos de Android
**Causa**: La API key de Android es un placeholder
**Solución**:
1. Obtén la API key de Android de RevenueCat Dashboard
2. Actualiza `androidApiKey` en app.json
3. Reinicia la app

## Qué Te Dirán los Logs

### Si ves:
```
[Subscription] Offerings response: {
  hasCurrent: false,
  allOfferingsCount: 0,
  allOfferingIds: []
}
```
**Problema**: No hay offerings configurados en RevenueCat
**Solución**: Crea offerings en el dashboard de RevenueCat

### Si ves:
```
[Subscription] Offerings response: {
  hasCurrent: true,
  currentIdentifier: "default",
  allOfferingsCount: 1,
  allOfferingIds: ["default"]
}
```
**Problema**: El offering existe pero tiene el identificador incorrecto
**Solución**: O bien:
- Renombra el offering en RevenueCat a "Monthly_MG", O
- Actualiza `offeringIdentifier` en app.json a "default"

### Si ves:
```
[Subscription] ✅ Offering found: {
  identifier: "Monthly_MG",
  packagesCount: 0,
  packageIdentifiers: []
}
```
**Problema**: El offering existe pero no tiene productos
**Solución**: Añade productos al offering en el dashboard de RevenueCat

### Si ves:
```
[Subscription] ✅ Offering found: {
  identifier: "Monthly_MG",
  packagesCount: 2,
  packageIdentifiers: ["monthly", "annual"]
}
```
**¡Éxito!**: ¡Todo está configurado correctamente!

## Próximos Pasos

1. **Ejecuta la app** y navega a la pantalla de suscripción
2. **Revisa los logs de la consola** para ver el output de depuración detallado
3. **Busca el error específico** en los logs
4. **Sigue la solución** para ese error específico
5. **Si sigues atascado**, comparte los logs de la consola (especialmente las líneas entre los marcadores `==========`)

## Checklist de Pruebas

- [ ] La API key de iOS es correcta en app.json
- [ ] La API key de Android es correcta en app.json (si pruebas en Android)
- [ ] Los productos están creados en App Store Connect / Google Play Console
- [ ] Los productos están aprobados/activos
- [ ] Los productos están creados en el dashboard de RevenueCat
- [ ] Los productos están vinculados a App Store Connect / Google Play Console en RevenueCat
- [ ] El offering "Monthly_MG" existe en RevenueCat
- [ ] Los productos están añadidos al offering
- [ ] El entitlement "Macrogoal Pro" existe
- [ ] El entitlement está vinculado a los productos
- [ ] Estás probando en un dispositivo físico (iOS)
- [ ] Has iniciado sesión con una cuenta Sandbox Tester (iOS) o cuenta de prueba (Android)
- [ ] Has reiniciado la app después de cambios de configuración

## Resumen

He mejorado el código para que te muestre exactamente qué está mal. Ahora cuando abras la pantalla de suscripción:

1. Si hay un error, verás una pantalla de error con detalles específicos
2. Los logs de la consola te dirán exactamente qué offerings están disponibles
3. Podrás ver si el problema es:
   - API key faltante o incorrecta
   - Offering no encontrado
   - Productos no vinculados
   - Configuración incorrecta

**Ejecuta la app, abre la pantalla de suscripción, y revisa los logs. Te dirán exactamente qué necesitas arreglar.**

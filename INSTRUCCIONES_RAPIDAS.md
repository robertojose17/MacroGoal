
# 🚀 Instrucciones Rápidas - Arreglo de Verificación de Email

## ✅ Lo que se arregló

El error "Safari no puede abrir la página" cuando los usuarios hacen clic en el enlace de verificación de email ahora está arreglado. La aplicación usa deep links para abrir automáticamente en iOS.

## 📋 Lo que DEBES hacer ahora (IMPORTANTE)

### Paso 1: Configurar Supabase (OBLIGATORIO)

1. Abre tu navegador y ve a:
   ```
   https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq
   ```

2. En el menú izquierdo, haz clic en **Authentication** (Autenticación)

3. Haz clic en **URL Configuration** (Configuración de URL)

4. En la sección **Redirect URLs**, agrega estas dos URLs:

   **Para desarrollo (Expo Go):**
   ```
   exp://TU_IP_LOCAL:8081/--/auth/verify
   ```
   
   **Ejemplo:** Si tu IP es 192.168.1.100, usa:
   ```
   exp://192.168.1.100:8081/--/auth/verify
   ```

   **Para producción:**
   ```
   macrogoal://auth/verify
   ```

5. Haz clic en **Save** (Guardar)

### Paso 2: Encontrar tu IP Local

Abre la terminal donde está corriendo Expo y busca algo como:
```
Metro waiting on exp://192.168.1.100:8081
```

La parte `192.168.1.100` es tu IP local. Úsala en el Paso 1.

### Paso 3: Probar

1. Registra un nuevo usuario en la app
2. Revisa el email en tu iPhone
3. Toca el enlace "Confirm your mail"
4. La app debería abrirse automáticamente
5. Verás "Verificando tu email..." y luego "¡Email verificado!"

## ✅ Archivos Modificados

- ✅ `app/integrations/supabase/client.ts` - Habilitado detección de deep links
- ✅ `app/auth/signup.tsx` - Agregado URL de redirección con deep link
- ✅ `app/auth/verify.tsx` - **NUEVO** - Maneja la verificación de email
- ✅ `app.json` - Actualizado scheme a `macrogoal`

## 🎯 Cómo Funciona Ahora

1. Usuario se registra → Supabase envía email
2. Usuario abre email en iPhone → toca enlace
3. Enlace abre la app con `macrogoal://auth/verify?access_token=...`
4. La app procesa los tokens y verifica el email
5. Usuario es redirigido a completar perfil o inicio

## ⚠️ Importante

**SIN configurar las URLs en Supabase (Paso 1), el enlace seguirá yendo a localhost.**

Esto es OBLIGATORIO para que funcione.

## 🐛 Si algo no funciona

1. Verifica que guardaste las URLs en Supabase
2. Asegúrate de usar tu IP local correcta
3. Reinicia el servidor de Expo (`npm run dev`)
4. Prueba con un email nuevo

## 📚 Más Información

- Ver `CONFIGURACION_VERIFICACION_EMAIL.md` para guía completa en español
- Ver `EMAIL_VERIFICATION_SETUP.md` para guía completa en inglés
- Ver `EMAIL_VERIFICATION_FIX_SUMMARY.md` para detalles técnicos

---

**¿Listo?** Configura las URLs en Supabase y prueba registrando un nuevo usuario. ¡Debería funcionar perfectamente en iOS! 🎉
